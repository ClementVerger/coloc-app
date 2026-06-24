const express = require('express');
const pool = require('../config/db');
const { assertMembership } = require('../middleware/membership');

const router = express.Router();

// Génère un code d'invitation à 6 caractères sans ambiguïté (pas de 0/O, 1/I/L)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Créer une coloc (createdBy = utilisateur authentifié)
// Retry loop sur la génération du code d'invitation en cas de collision (max 3 tentatives)
router.post('/', async (req, res, next) => {
  try {
    const { name, address, leaseStartDate } = req.body;
    const createdBy = req.dbUser.id;

    // M1 — Validation du nom
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Le nom de la coloc est requis.' });
    }

    // I4 — Retry loop sur la collision d'invite_code (contrainte UNIQUE)
    let group = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const result = await pool.query(
          `INSERT INTO groups (name, address, lease_start_date, created_by, invite_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [name.trim(), address || null, leaseStartDate || null, createdBy, inviteCode]
        );
        group = result.rows[0];
        break;
      } catch (err) {
        // 23505 = unique_violation ; on réessaie uniquement si c'est la contrainte invite_code
        if (err.code === '23505' && err.constraint === 'groups_invite_code_key' && attempt < 2) {
          continue;
        }
        throw err;
      }
    }

    if (!group) {
      return res.status(500).json({ error: 'Impossible de générer un code d\'invitation unique.' });
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'creator')`,
      [group.id, createdBy]
    );

    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
});

// Colocs dont l'utilisateur authentifié est membre actif
router.get('/my', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT g.*, gm.role
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 AND gm.active = true
       ORDER BY g.created_at DESC`,
      [req.dbUser.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Rejoindre une coloc via code court (ex: "AB12CD")
router.post('/join-by-code', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code requis' });

    const groupResult = await pool.query(
      `SELECT * FROM groups WHERE UPPER(invite_code) = UPPER($1)`,
      [code.trim()]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Code invalide ou inexistant' });
    }
    const group = groupResult.rows[0];

    const existing = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [group.id, req.dbUser.id]
    );
    if (existing.rows.length > 0) {
      // Réactive si inactif, sinon renvoie le groupe directement (idempotent)
      await pool.query(
        `UPDATE group_members SET active = true, left_at = NULL WHERE group_id = $1 AND user_id = $2`,
        [group.id, req.dbUser.id]
      );
      return res.json(group);
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
      [group.id, req.dbUser.id]
    );

    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
});

// Rejoindre une coloc via UUID (route historique conservée)
// I2 — Ajout des mêmes gardes que join-by-code
router.post('/:groupId/join', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Vérifier que le groupe existe
    const groupResult = await pool.query(
      `SELECT id FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Groupe introuvable.' });
    }

    // Vérifier si déjà membre (actif ou inactif)
    const existing = await pool.query(
      `SELECT active FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.dbUser.id]
    );
    if (existing.rows.length > 0) {
      // Réactive si inactif, sinon confirme l'appartenance (idempotent)
      await pool.query(
        `UPDATE group_members SET active = true, left_at = NULL WHERE group_id = $1 AND user_id = $2`,
        [groupId, req.dbUser.id]
      );
      return res.json({ message: 'Membre réactivé.' });
    }

    const result = await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') RETURNING *`,
      [groupId, req.dbUser.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Membres actifs d'une coloc
// C2 — assertMembership : seuls les membres actifs peuvent voir la liste
router.get('/:groupId/members', assertMembership, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, gm.role, gm.active
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.active = true`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// L'utilisateur authentifié quitte le groupe
// I5 — Transaction + SELECT FOR UPDATE pour éliminer la race condition
router.post('/:groupId/leave', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { groupId } = req.params;
    const userId = req.dbUser.id;

    await client.query('BEGIN');

    // Verrouille TOUTES les lignes actives du groupe pour éviter la race condition
    // (deux membres ne peuvent pas passer le check "dernier membre" simultanément)
    const activeMembersResult = await client.query(
      `SELECT user_id, role FROM group_members
       WHERE group_id = $1 AND active = true
       FOR UPDATE`,
      [groupId]
    );

    const myMember = activeMembersResult.rows.find((r) => r.user_id === userId);
    if (!myMember) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vous n\'êtes pas membre actif de cette coloc.' });
    }

    if (myMember.role === 'creator') {
      const othersCount = activeMembersResult.rows.filter((r) => r.user_id !== userId).length;
      if (othersCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Le créateur ne peut pas quitter une coloc dont il est le seul membre actif.',
        });
      }
    }

    await client.query(
      `UPDATE group_members SET active = false, left_at = now()
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    await client.query('COMMIT');
    res.json({ status: 'ok' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
