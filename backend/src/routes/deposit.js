const express = require('express');
const pool = require('../config/db');
const { assertMembership } = require('../middleware/membership');

const router = express.Router();

// Requête réutilisable : contributions nettes par utilisateur impliqué dans le groupe
// net = somme(deposits) + somme(transferts reçus) - somme(transferts émis)
const NET_CONTRIBUTIONS_QUERY = `
  SELECT
    u.id   AS user_id,
    u.name,
    COALESCE(dep.total_deposits, 0)
      + COALESCE(tr_in.received, 0)
      - COALESCE(tr_out.sent,    0) AS net_contribution
  FROM (
    SELECT DISTINCT user_id FROM deposits WHERE group_id = $1
    UNION
    SELECT DISTINCT from_user_id FROM deposit_transfers WHERE group_id = $1
    UNION
    SELECT DISTINCT to_user_id   FROM deposit_transfers WHERE group_id = $1
  ) involved
  JOIN users u ON u.id = involved.user_id
  LEFT JOIN (
    SELECT user_id, SUM(amount_contributed) AS total_deposits
    FROM deposits WHERE group_id = $1 GROUP BY user_id
  ) dep ON dep.user_id = involved.user_id
  LEFT JOIN (
    SELECT to_user_id, SUM(amount) AS received
    FROM deposit_transfers WHERE group_id = $1 GROUP BY to_user_id
  ) tr_in ON tr_in.to_user_id = involved.user_id
  LEFT JOIN (
    SELECT from_user_id, SUM(amount) AS sent
    FROM deposit_transfers WHERE group_id = $1 GROUP BY from_user_id
  ) tr_out ON tr_out.from_user_id = involved.user_id
  ORDER BY u.name
`;

// Enregistrer la contribution de l'utilisateur authentifié au dépôt de garantie
router.post('/', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.body;

    const amountContributed = Number(req.body.amountContributed);
    if (!Number.isFinite(amountContributed) || amountContributed <= 0) {
      return res.status(400).json({ error: 'amountContributed doit être un nombre fini supérieur à 0.' });
    }

    const result = await pool.query(
      `INSERT INTO deposits (group_id, user_id, amount_contributed)
       VALUES ($1, $2, $3) RETURNING *`,
      [groupId, req.dbUser.id, amountContributed]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Récapitulatif du dépôt de garantie d'une coloc (contributions nettes + historique des transferts)
router.get('/group/:groupId', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const [contribResult, totalResult, transfersResult] = await Promise.all([
      pool.query(NET_CONTRIBUTIONS_QUERY, [groupId]),
      pool.query(
        `SELECT COALESCE(SUM(amount_contributed), 0) AS total FROM deposits WHERE group_id = $1`,
        [groupId]
      ),
      pool.query(
        `SELECT dt.id, dt.amount, dt.transferred_at,
                dt.from_user_id, uf.name AS from_name,
                dt.to_user_id,   ut.name AS to_name
         FROM deposit_transfers dt
         JOIN users uf ON uf.id = dt.from_user_id
         JOIN users ut ON ut.id = dt.to_user_id
         WHERE dt.group_id = $1
         ORDER BY dt.transferred_at DESC`,
        [groupId]
      ),
    ]);

    res.json({
      contributions: contribResult.rows,
      transfers: transfersResult.rows,
      total: Number(totalResult.rows[0].total),
    });
  } catch (err) {
    next(err);
  }
});

// Enregistrer un transfert de part entre deux colocs (départ / remplacement)
router.post('/transfer', assertMembership, async (req, res, next) => {
  try {
    const { groupId, fromUserId, toUserId, amount } = req.body;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount doit être un nombre fini supérieur à 0.' });
    }
    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: 'fromUserId et toUserId sont requis.' });
    }
    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'fromUserId et toUserId doivent être différents.' });
    }

    // Vérifier que les deux utilisateurs ont (ou ont eu) un lien avec ce groupe
    const [fromCheck, toCheck] = await Promise.all([
      pool.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, fromUserId]),
      pool.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, toUserId]),
    ]);
    if (fromCheck.rows.length === 0) {
      return res.status(400).json({ error: 'fromUserId n\'est pas (ou n\'a jamais été) membre de ce groupe.' });
    }
    if (toCheck.rows.length === 0) {
      return res.status(400).json({ error: 'toUserId n\'est pas (ou n\'a jamais été) membre de ce groupe.' });
    }

    // Vérifier que le montant ne dépasse pas la contribution nette actuelle de fromUserId
    const netResult = await pool.query(
      `SELECT
         COALESCE(dep.total_deposits, 0)
           + COALESCE(tr_in.received, 0)
           - COALESCE(tr_out.sent,    0) AS net
       FROM (SELECT 1) base
       LEFT JOIN (
         SELECT SUM(amount_contributed) AS total_deposits
         FROM deposits WHERE group_id = $1 AND user_id = $2
       ) dep ON true
       LEFT JOIN (
         SELECT SUM(amount) AS received
         FROM deposit_transfers WHERE group_id = $1 AND to_user_id = $2
       ) tr_in ON true
       LEFT JOIN (
         SELECT SUM(amount) AS sent
         FROM deposit_transfers WHERE group_id = $1 AND from_user_id = $2
       ) tr_out ON true`,
      [groupId, fromUserId]
    );

    const netContribution = Number(netResult.rows[0].net) || 0;
    if (parsedAmount > netContribution) {
      return res.status(400).json({
        error: `Le montant transféré (${parsedAmount}) dépasse la contribution nette actuelle de cet utilisateur (${netContribution.toFixed(2)}).`,
      });
    }

    const result = await pool.query(
      `INSERT INTO deposit_transfers (group_id, from_user_id, to_user_id, amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [groupId, fromUserId, toUserId, parsedAmount]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Calculer la répartition de la restitution finale au prorata des contributions nettes
// Outil de calcul à la demande — ne persiste rien en base
router.post('/settle', assertMembership, async (req, res, next) => {
  try {
    const { groupId, amountReturned } = req.body;

    const parsedAmount = Number(amountReturned);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'amountReturned doit être un nombre fini supérieur ou égal à 0.' });
    }

    // Contributions nettes des membres actifs uniquement
    const contribResult = await pool.query(
      `SELECT
         u.id AS user_id,
         u.name,
         COALESCE(dep.total_deposits, 0)
           + COALESCE(tr_in.received, 0)
           - COALESCE(tr_out.sent,    0) AS net_contribution
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN (
         SELECT user_id, SUM(amount_contributed) AS total_deposits
         FROM deposits WHERE group_id = $1 GROUP BY user_id
       ) dep ON dep.user_id = gm.user_id
       LEFT JOIN (
         SELECT to_user_id, SUM(amount) AS received
         FROM deposit_transfers WHERE group_id = $1 GROUP BY to_user_id
       ) tr_in ON tr_in.to_user_id = gm.user_id
       LEFT JOIN (
         SELECT from_user_id, SUM(amount) AS sent
         FROM deposit_transfers WHERE group_id = $1 GROUP BY from_user_id
       ) tr_out ON tr_out.from_user_id = gm.user_id
       WHERE gm.group_id = $1 AND gm.active = true`,
      [groupId]
    );

    const members = contribResult.rows.map((r) => ({
      ...r,
      net_contribution: Number(r.net_contribution) || 0,
    }));

    const totalNet = members.reduce((sum, m) => sum + m.net_contribution, 0);
    if (totalNet === 0) {
      return res.status(400).json({
        error: 'Aucune contribution nette enregistrée pour ce groupe. Impossible de calculer la répartition.',
      });
    }

    const restitution = members
      .filter((m) => m.net_contribution > 0)
      .map((m) => ({
        userId: m.user_id,
        name: m.name,
        netContribution: m.net_contribution,
        restitutionShare: Math.round((m.net_contribution / totalNet) * parsedAmount * 100) / 100,
      }));

    res.json({ amountReturned: parsedAmount, totalNet, restitution });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
