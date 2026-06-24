# Coloc'

App de gestion financière et logistique de colocation — répartition au prorata réel, suivi de la caution commune, historique transparent.

## Structure du repo

```
coloc-app/
├── backend/     API Node.js/Express + PostgreSQL
└── mobile/      App React Native (Expo)
```

## Démarrage rapide

### Backend
```bash
cd backend
npm install
cp .env.example .env   # renseigner les variables
npm run dev
```

### Mobile
```bash
cd mobile
npm install
npx expo start
```

## Stack

- **Mobile** : React Native + Expo
- **Backend** : Node.js + Express
- **Base de données** : PostgreSQL
- **Auth** : Clerk (ou Supabase Auth)
- **Hébergement** : Railway / Render
- **Notifications** : Expo Notifications
- **CI/CD** : GitHub Actions

## Roadmap MVP

Voir le cahier des charges — fonctionnalités V1 :
- Création/invitation de coloc
- Ajout de dépenses (égal / prorata manuel)
- Calcul automatique des soldes
- Historique + export CSV
- Suivi du dépôt de garantie
- Notifications de base
