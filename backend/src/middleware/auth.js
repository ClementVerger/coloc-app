const { getAuth } = require('@clerk/express');
const pool = require('../config/db');

// Vérifie le token Clerk ET attache le profil DB (req.dbUser)
const requireAuth = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE clerk_id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Compte non synchronisé. Appelez POST /api/users/sync après la première connexion.',
      });
    }
    req.dbUser = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireAuth };
