const pool = require('../config/db');

/**
 * Vérifie que req.dbUser est membre actif du groupe ciblé.
 * groupId est cherché dans req.params.groupId, puis req.body.groupId.
 * Renvoie 403 si l'utilisateur n'est pas membre actif.
 */
const assertMembership = async (req, res, next) => {
  try {
    const groupId = req.params.groupId || req.body.groupId;
    if (!groupId) {
      return res.status(400).json({ error: 'groupId manquant.' });
    }

    const result = await pool.query(
      `SELECT 1 FROM group_members
       WHERE group_id = $1 AND user_id = $2 AND active = true`,
      [groupId, req.dbUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Accès refusé : vous n\'êtes pas membre actif de cette coloc.' });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { assertMembership };
