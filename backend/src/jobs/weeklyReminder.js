/**
 * Job de rappel hebdomadaire.
 * Lance manuellement : node src/jobs/weeklyReminder.js
 * Ou via un scheduler externe (cron, GitHub Actions, Render Cron Job…).
 *
 * Envoie une notification push à chaque membre ayant un solde négatif
 * dans au moins une de ses colocs.
 */

require('dotenv').config();
const pool = require('../config/db');
const { sendPushNotifications } = require('../utils/notifications');

async function run() {
  console.log('=== Rappel hebdomadaire — démarrage', new Date().toISOString(), '===');

  const result = await pool.query(`
    WITH paid AS (
      SELECT e.group_id, e.paid_by AS user_id, SUM(e.amount) AS total_paid
      FROM expenses e
      GROUP BY e.group_id, e.paid_by
    ),
    owed AS (
      SELECT e.group_id, es.user_id, SUM(es.amount_owed) AS total_owed
      FROM expense_shares es
      JOIN expenses e ON e.id = es.expense_id
      GROUP BY e.group_id, es.user_id
    ),
    members AS (
      SELECT
        gm.group_id,
        gm.user_id,
        u.name,
        u.push_token,
        g.name AS group_name
      FROM group_members gm
      JOIN users  u ON u.id  = gm.user_id
      JOIN groups g ON g.id  = gm.group_id
      WHERE gm.active = true AND u.push_token IS NOT NULL
    )
    SELECT
      m.user_id,
      m.name,
      m.push_token,
      m.group_name,
      ROUND(
        COALESCE(p.total_paid::numeric, 0) - COALESCE(o.total_owed::numeric, 0),
        2
      ) AS net_balance
    FROM members m
    LEFT JOIN paid p ON p.group_id = m.group_id AND p.user_id = m.user_id
    LEFT JOIN owed o ON o.group_id = m.group_id AND o.user_id = m.user_id
    WHERE (COALESCE(p.total_paid::numeric, 0) - COALESCE(o.total_owed::numeric, 0)) < -0.01
    ORDER BY net_balance ASC
  `);

  if (result.rows.length === 0) {
    console.log('Aucun solde négatif — aucune notification envoyée.');
    await pool.end();
    return;
  }

  console.log(`${result.rows.length} rappel(s) à envoyer…`);

  for (const row of result.rows) {
    const amount = Math.abs(Number(row.net_balance)).toFixed(2);
    await sendPushNotifications(
      [row.push_token],
      'Rappel de solde 💸',
      `Tu dois ${amount} € dans ta coloc "${row.group_name}"`
    );
    console.log(`  ✓ ${row.name} (${row.group_name}) : -${amount} €`);
  }

  console.log('=== Terminé ===');
  await pool.end();
}

run().catch((err) => {
  console.error('Erreur fatale weeklyReminder:', err);
  process.exit(1);
});
