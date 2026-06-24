require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Exécution de ${file}...`);
    await pool.query(sql);
  }

  console.log('Migrations terminées.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Erreur de migration:', err);
  process.exit(1);
});
