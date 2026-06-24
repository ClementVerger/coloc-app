const express = require('express');
const { getAuth } = require('@clerk/express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../config/db');

const router = express.Router();

// POST /api/users/sync
// Appelé après chaque connexion Clerk pour créer/mettre à jour l'utilisateur en base.
// L'upsert se fait sur clerk_id (pas sur email) pour empêcher le détournement de compte.
router.post('/sync', async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Token Clerk manquant ou invalide' });
    }

    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'email et name sont requis' });
    }

    // Vérifie qu'aucun autre compte (clerk_id différent) ne possède déjà cet email.
    // Empêche un attaquant d'écraser le clerk_id d'un autre utilisateur.
    const emailConflict = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND clerk_id != $2',
      [email, userId]
    );
    if (emailConflict.rows.length > 0) {
      return res.status(409).json({
        error: 'Un compte existe déjà avec cette adresse email.',
      });
    }

    const result = await pool.query(
      `INSERT INTO users (clerk_id, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (clerk_id) DO UPDATE SET
         email = EXCLUDED.email,
         name  = EXCLUDED.name
       RETURNING *`,
      [userId, email, name]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/users/push-token
// Enregistre ou met à jour le push token Expo de l'utilisateur connecté.
router.post('/push-token', requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token requis' });

    await pool.query(
      `UPDATE users SET push_token = $1 WHERE id = $2`,
      [token, req.dbUser.id]
    );

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
