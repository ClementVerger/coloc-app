const express = require('express');
const multer = require('multer');
const mindee = require('mindee');
const pool = require('../config/db');
const { notifyNewExpense } = require('../utils/notifications');
const { assertMembership } = require('../middleware/membership');

const router = express.Router();

const VALID_CATEGORIES = ['electricite', 'courses', 'internet', 'autre'];
const VALID_SPLIT_TYPES = ['equal', 'prorata'];

// ── OCR : upload en mémoire, max 10 Mo, images uniquement ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(Object.assign(new Error("Le fichier doit être une image."), { status: 400 }));
    }
    cb(null, true);
  },
});

// ID du modèle OCR Mindee v2 (disponible sur app.mindee.com > votre modèle OCR)
const MINDEE_OCR_MODEL_ID = process.env.MINDEE_OCR_MODEL_ID || '9fda0748-bfac-4637-ae65-dea08ea10a18';

// Reconstruit le texte lisible depuis les mots OCR Mindee v2 (groupés par ligne via position Y)
function pagesWordsToText(pages) {
  const words = [];
  for (const page of pages) {
    for (const w of (page.words ?? [])) {
      const y = Math.min(...w.polygon.map((pt) => pt[1]));
      const x = Math.min(...w.polygon.map((pt) => pt[0]));
      words.push({ content: w.content, x, y });
    }
  }
  words.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  let lineWords = [];
  let lineY = -1;
  for (const w of words) {
    if (lineY < 0 || Math.abs(w.y - lineY) < 0.015) {
      lineWords.push(w);
      if (lineY < 0) lineY = w.y;
    } else {
      lines.push(lineWords.map((lw) => lw.content).join(' '));
      lineWords = [w];
      lineY = w.y;
    }
  }
  if (lineWords.length) lines.push(lineWords.map((lw) => lw.content).join(' '));
  return lines.join('\n');
}

// Extrait le montant total d'un texte OCR reconstruit (gère , et . comme séparateur décimal)
function extractAmountFromOcrText(text) {
  const lines = text.split('\n');
  const totalRe = /total\s*(?:ttc|à\s*payer|net)?[^\d]*(\d[\d\s]*[.,]\d{2})/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(totalRe);
    if (m) {
      const val = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (isFinite(val) && val > 0) return val;
    }
  }
  return null;
}

// POST /expenses/scan-receipt — OCR ticket de caisse via Mindee
// requireAuth appliqué en amont (server.js) — pas d'assertMembership car aucune donnée de groupe n'est touchée
router.post(
  '/scan-receipt',
  (req, res, next) => {
    console.log('[scan-receipt] handler atteint, Content-Type:', req.headers['content-type']);
    upload.single('receipt')(req, res, (err) => {
      console.log('[scan-receipt] multer cb — err:', err?.message ?? null, '| file:', req.file?.originalname ?? null);
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: "L'image est trop grande (max 10 Mo)." });
      return res.status(err.status ?? 400).json({ error: err.message ?? "Impossible de lire l'image envoyée." });
    });
  },
  async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image reçue. Envoie le champ "receipt" en multipart/form-data.' });
    }
    if (!process.env.MINDEE_API_KEY) {
      return res.status(503).json({ error: 'Service OCR non configuré.' });
    }

    try {
      const client = new mindee.v2.Client({ apiKey: process.env.MINDEE_API_KEY });
      const inputSource = new mindee.BufferInput({
        buffer: req.file.buffer,
        filename: req.file.originalname || 'receipt.jpg',
      });

      const response = await client.enqueueAndGetResult(
        mindee.v2.product.Ocr,
        inputSource,
        { modelId: MINDEE_OCR_MODEL_ID }
      );

      const pages = response?.inference?.result?.pages ?? [];
      const fullText = pagesWordsToText(pages);
      console.log('[OCR Mindee] texte reconstruit (300 car.):', fullText.slice(0, 300));

      const amount = extractAmountFromOcrText(fullText);

      return res.json({
        amount,
        merchantName: null,
        date: null,
        confidence: amount !== null ? 1.0 : null,
      });
    } catch (err) {
      console.error('[OCR Mindee] erreur:', err?.status ?? err?.code, err?.message);
      if (err?.status) return res.status(503).json({ error: 'Le service OCR est temporairement indisponible.' });
      next(err);
    }
  }
);

// Ajouter une dépense (paidBy = utilisateur authentifié)
// C2 — assertMembership vérifie l'appartenance via req.body.groupId
// I1 — Validation des entrées
// M2 — Validation de la date
router.post('/', assertMembership, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { groupId, category, splitType, shares } = req.body;
    const paidBy = req.dbUser.id;

    // I1 — Validation amount
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount doit être un nombre fini supérieur à 0.' });
    }

    // I1 — Validation category
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `category invalide. Valeurs acceptées : ${VALID_CATEGORIES.join(', ')}.`,
      });
    }

    // I1 — Validation splitType
    if (!VALID_SPLIT_TYPES.includes(splitType)) {
      return res.status(400).json({
        error: `splitType invalide. Valeurs acceptées : ${VALID_SPLIT_TYPES.join(', ')}.`,
      });
    }

    // I1 — Validation prorata : somme des ratios ≈ 1 (±0.01)
    if (splitType === 'prorata') {
      if (!Array.isArray(shares) || shares.length === 0) {
        return res.status(400).json({ error: 'shares est requis pour le mode prorata.' });
      }
      const ratioSum = shares.reduce((sum, s) => sum + Number(s.ratio || 0), 0);
      if (Math.abs(ratioSum - 1) > 0.01) {
        return res.status(400).json({
          error: `La somme des ratio doit être égale à 1 (actuellement ${ratioSum.toFixed(4)}).`,
        });
      }
    }

    // M2 — Validation et normalisation de expenseDate
    let expenseDate = req.body.expenseDate;
    if (expenseDate) {
      const dateObj = new Date(expenseDate);
      if (isNaN(dateObj.getTime())) {
        return res.status(400).json({ error: 'expenseDate doit être une date valide (format ISO8601).' });
      }
      // Tolérance d'un jour pour les décalages de fuseau horaire
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);
      if (dateObj > tomorrow) {
        return res.status(400).json({ error: 'expenseDate ne peut pas être dans le futur de plus d\'un jour.' });
      }
    } else {
      expenseDate = new Date().toISOString().split('T')[0];
    }

    await client.query('BEGIN');

    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, paid_by, amount, category, split_type, expense_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [groupId, paidBy, amount, category, splitType, expenseDate]
    );
    const expense = expenseResult.rows[0];

    let finalShares = shares;
    if (splitType === 'equal') {
      const membersResult = await client.query(
        `SELECT user_id FROM group_members WHERE group_id = $1 AND active = true`,
        [groupId]
      );
      const ratio = 1 / membersResult.rows.length;
      finalShares = membersResult.rows.map((m) => ({ userId: m.user_id, ratio }));
    }

    for (const share of finalShares) {
      await client.query(
        `INSERT INTO expense_shares (expense_id, user_id, share_ratio, amount_owed)
         VALUES ($1, $2, $3, $4)`,
        [expense.id, share.userId, share.ratio, (amount * share.ratio).toFixed(2)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(expense);

    // Notification push aux autres membres de la coloc (fire-and-forget)
    notifyNewExpense(pool, groupId, req.dbUser, expense).catch((err) =>
      console.error('Erreur notification dépense:', err.message)
    );
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Historique des dépenses d'une coloc
// C2 — assertMembership via req.params.groupId
router.get('/group/:groupId', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT e.*, u.name AS paid_by_name
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.group_id = $1
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Export CSV simple
// C2 — assertMembership via req.params.groupId
router.get('/group/:groupId/export', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT e.expense_date, u.name AS paid_by_name, e.category, e.amount, e.split_type
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.group_id = $1
       ORDER BY e.expense_date`,
      [groupId]
    );

    const BOM = '﻿';
    const header = 'Date,Payé par,Catégorie,Montant,Type de répartition\n';
    const rows = result.rows
      .map((r) => {
        const date = r.expense_date.toISOString().split('T')[0];
        const name = `"${(r.paid_by_name || '').replace(/"/g, '""')}"`;
        const cat = `"${(r.category || '').replace(/"/g, '""')}"`;
        return `${date},${name},${cat},${r.amount},${r.split_type}`;
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=depenses.csv');
    res.send(BOM + header + rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
