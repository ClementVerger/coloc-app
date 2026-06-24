const pool = require('../config/db');

// Calcule le solde net de chaque membre actif d'une coloc.
// Accepte un client de transaction en option pour être appelé dans une TX.
async function computeGroupBalances(groupId, db) {
  const client = db || pool;

  const [paidResult, owedResult, membersResult] = await Promise.all([
    client.query(
      `SELECT paid_by AS user_id, COALESCE(SUM(amount), 0) AS total_paid
       FROM expenses WHERE group_id = $1 GROUP BY paid_by`,
      [groupId]
    ),
    client.query(
      `SELECT es.user_id, COALESCE(SUM(es.amount_owed), 0) AS total_owed
       FROM expense_shares es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1
       GROUP BY es.user_id`,
      [groupId]
    ),
    client.query(
      `SELECT u.id AS user_id, u.name
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.active = true`,
      [groupId]
    ),
  ]);

  const paidMap = Object.fromEntries(paidResult.rows.map((r) => [r.user_id, Number(r.total_paid)]));
  const owedMap = Object.fromEntries(owedResult.rows.map((r) => [r.user_id, Number(r.total_owed)]));

  return membersResult.rows.map((m) => {
    const paid = paidMap[m.user_id] || 0;
    const owed = owedMap[m.user_id] || 0;
    return {
      userId: m.user_id,
      name: m.name,
      totalPaid: paid,
      totalOwed: owed,
      netBalance: Number((paid - owed).toFixed(2)),
    };
  });
}

module.exports = { computeGroupBalances };
