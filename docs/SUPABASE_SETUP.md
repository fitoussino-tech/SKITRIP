# Brancher Supabase (back end partagé)

Objectif : passer de la démo (chaque téléphone isolé) à des données partagées en
temps réel entre tous les téléphones. ~10 minutes, gratuit.

## 1. Créer le projet
1. Va sur https://supabase.com → **Start your project** → connecte-toi (GitHub ou email).
2. **New project**.
   - Name : `skitrip-mim28`
   - Database password : choisis-en un et garde-le (pas besoin côté app).
   - Region : **West EU (Paris)** ou Frankfurt (au plus proche).
3. Attends ~1 min que le projet se provisionne.

## 2. Créer les tables
1. Menu de gauche → **SQL Editor** → **New query**.
2. Ouvre le fichier `supabase/schema.sql` de ce repo, copie **tout** son contenu, colle-le.
3. Clique **Run**. Tu dois voir « Success ». (Ça crée les tables, le temps réel et les règles d'accès.)

## 3. Récupérer les clés
1. Menu de gauche → **Project Settings** (l'engrenage) → **API**.
2. Copie :
   - **Project URL** (ex. `https://abcdxyz.supabase.co`)
   - **anon public** key (la clé « anon », publique, prévue pour le client)

## 4. Renseigner l'app
Ouvre `js/config.js` et colle les deux valeurs :

```js
window.CONFIG = {
  SUPABASE_URL: 'https://abcdxyz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...ta_cle_anon...',
  AUTO_APPROVE: true
};
```

## 5. Tester
- Ouvre `index.html` dans un navigateur (ou l'URL GitHub Pages).
- Les 15 équipes se créent toutes seules dans la table `teams` au premier chargement.
- Rejoins avec un code chambre (ex. `R101`, ou `DEMO` pour l'équipe 7), choisis ton nom,
  nomme ton équipe.
- Ouvre la même URL sur un **deuxième téléphone / navigateur**, rejoins une autre chambre :
  les noms d'équipe, les points et les votes doivent apparaître des deux côtés en direct.

## Notes
- **AUTO_APPROVE = true** : tant qu'il n'y a pas de back-office, le téléphone qui envoie une
  preuve valide lui-même et écrit les points (pratique pour tester tout de suite). On passera à
  `false` quand les organisateurs valideront les preuves.
- **Sécurité** : modèle léger (clé anon + règles permissives), adapté à un groupe connu de ~150
  étudiants. La clé anon est faite pour être publique. Rien de sensible n'est stocké.
- **Photos** : pour l'instant les preuves photo sont réduites et stockées en base (format data URL).
  Le vrai upload (Supabase Storage) est une étape suivante.
- **Revenir à la démo** : laisse `SUPABASE_URL` / `SUPABASE_ANON_KEY` vides dans `js/config.js`.
