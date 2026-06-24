const express = require('express');
const pool = require('../config/db');
const { assertMembership } = require('../middleware/membership');

const router = express.Router();

// Enregistrer la contribution de l'utilisateur authentifié au dépôt de garantie
// C2 — assertMembership via req.body.groupId
// I1 — Validation du montant
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

// Récapitulatif du dépôt de garantie d'une coloc
// C2 — assertMembership via req.params.groupId
router.get('/group/:groupId', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT d.user_id, u.name, SUM(d.amount_contributed) AS total_contributed
       FROM deposits d JOIN users u ON u.id = d.user_id
       WHERE d.group_id = $1
       GROUP BY d.user_id, u.name`,
      [groupId]
    );
    const total = result.rows.reduce((sum, r) => sum + Number(r.total_contributed), 0);
    res.json({ contributions: result.rows, total });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
