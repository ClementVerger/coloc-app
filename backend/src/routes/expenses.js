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

const OCR_CONFIDENCE_THRESHOLD = 0.3;

// POST /expenses/scan-receipt — OCR ticket de caisse via Mindee
// requireAuth appliqué en amont (server.js) — pas d'assertMembership car aucune donnée de groupe n'est touchée
router.post(
  '/scan-receipt',
  (req, res, next) => {
    upload.single('receipt')(req, res, (err) => {
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
      const client = new mindee.v1.Client({ apiKey: process.env.MINDEE_API_KEY });
      const inputSource = new mindee.BufferInput({ buffer: req.file.buffer, filename: req.file.originalname || 'receipt.jpg' });
      const apiResponse = await client.parse(mindee.v1.product.ReceiptV5, inputSource);
      const prediction = apiResponse.document.inference.prediction;

      const totalAmount = prediction.totalAmount;
      const totalNet = prediction.totalNet;
      const confidence = totalAmount?.confidence ?? null;

      console.log('[OCR] totalAmount:', totalAmount?.value, '| confidence:', confidence);
      console.log('[OCR] totalNet:', totalNet?.value, '| confidence:', totalNet?.confidence);
      console.log('[OCR] supplier:', prediction.supplierName?.value, '| date:', prediction.date?.value);

      // Priorité à totalAmount ; fallback sur totalNet si totalAmount absent/peu fiable
      let finalValue = null;
      let finalConfidence = null;
      if (totalAmount?.value != null) {
        finalValue = Number(totalAmount.value);
        finalConfidence = totalAmount.confidence ?? null;
      } else if (totalNet?.value != null) {
        finalValue = Number(totalNet.value);
        finalConfidence = totalNet.confidence ?? null;
      }

      const amount = finalConfidence >= OCR_CONFIDENCE_THRESHOLD && finalValue != null ? finalValue : null;

      return res.json({
        amount,
        merchantName: prediction.supplierName?.value ?? null,
        date: prediction.date?.value ?? null,
        confidence: finalConfidence,
      });
    } catch (err) {
      if (err?.status === 429)
        return res.status(429).json({ error: 'Quota OCR dépassé. Réessaie plus tard.' });
      if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT')
        return res.status(503).json({ error: 'Le service OCR est temporairement indisponible.' });
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
