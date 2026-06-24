require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { clerkMiddleware } = require('@clerk/express');

const { requireAuth } = require('./middleware/auth');
const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const expensesRouter = require('./routes/expenses');
const balancesRouter = require('./routes/balances');
const depositRouter = require('./routes/deposit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

// Traite le JWT Clerk sur toutes les requêtes (silencieux si absent)
app.use(clerkMiddleware());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Route de synchronisation : vérifie le token Clerk mais n'exige pas de profil DB existant
app.use('/api/users', usersRouter);

// Routes protégées : token Clerk valide + profil DB requis
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/expenses', requireAuth, expensesRouter);
app.use('/api/balances', requireAuth, balancesRouter);
app.use('/api/deposit', requireAuth, depositRouter);

app.use((err, req, res, next) => {
  // Les erreurs PostgreSQL ont toujours une propriété `severity` (ERROR, FATAL…)
  const isPgError = Boolean(err.severity);

  if (isPgError) {
    // Log complet côté serveur, message générique côté client
    console.error('[Erreur PostgreSQL]', { code: err.code, message: err.message, detail: err.detail });
    return res.status(500).json({ error: 'Une erreur est survenue.' });
  }

  // Erreurs métier explicites (status 4xx défini dans le code applicatif)
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // Autres erreurs inattendues
  console.error('[Erreur interne]', err);
  res.status(500).json({ error: 'Une erreur est survenue.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`API Coloc' démarrée sur le port ${PORT}`));
