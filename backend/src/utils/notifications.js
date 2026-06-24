const { Expo } = require('expo-server-sdk');

const expo = new Expo();

const CATEGORY_LABELS = {
  electricite: 'Électricité/gaz',
  courses: 'Courses',
  internet: 'Internet',
  autre: 'Autre',
};

// Envoie des notifications push à une liste de tokens Expo.
// Les tokens invalides sont silencieusement ignorés.
// Note MVP : les receipts Expo ne sont pas vérifiés ici (nécessiterait un polling séparé).
async function sendPushNotifications(tokens, title, body) {
  const valid = tokens.filter((t) => t && Expo.isExpoPushToken(t));
  if (valid.length === 0) return;

  const messages = valid.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
  }));

  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Erreur envoi push:', err.message);
    }
  }
}

// Notifie tous les membres actifs d'une coloc SAUF l'auteur de la dépense.
async function notifyNewExpense(pool, groupId, sender, expense) {
  const result = await pool.query(
    `SELECT u.push_token
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.active = true
       AND gm.user_id != $2 AND u.push_token IS NOT NULL`,
    [groupId, sender.id]
  );

  const tokens = result.rows.map((r) => r.push_token);
  if (tokens.length === 0) return;

  const label = CATEGORY_LABELS[expense.category] || expense.category;
  const amountStr = `${Number(expense.amount).toFixed(2)} €`;

  await sendPushNotifications(
    tokens,
    'Nouvelle dépense',
    `${sender.name} a ajouté : ${label} ${amountStr}`
  );
}

module.exports = { sendPushNotifications, notifyNewExpense, CATEGORY_LABELS };
