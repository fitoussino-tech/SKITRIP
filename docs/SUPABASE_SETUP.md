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
2. Ouvre `supabase/schema.sql`, copie **tout** son contenu, colle-le, clique **Run** (« Success »).
3. Refais la même chose avec `supabase/schema_v2.sql`, puis avec `supabase/schema_v3.sql`.
   Toujours dans cet ordre. Chaque script ne se lance qu'une fois, mais `schema_v3.sql`
   peut être relancé sans risque.

`schema_v3.sql` met en place le vrai back-office : comptes organisateurs, joueurs connectés,
challenges et programme éditables, photos sorties des lignes de preuves, et des règles d'accès
où seuls les organisateurs peuvent valider, attribuer des points ou modifier le contenu.

## 2 bis. Comptes organisateurs
Chaque organisateur a un compte Supabase (un compte partagé marche aussi : c'est une seule ligne).
1. Menu de gauche → **Authentication** → **Users** → **Add user** → **Create new user**.
   Mets l'email et un mot de passe, et coche **Auto Confirm User**.
2. **SQL Editor** → **New query**, colle ceci avec les bons emails, puis **Run** :

```sql
insert into admins (user_id, email)
select id, email from auth.users
where email in ('noam@exemple.com', 'thibault@exemple.com')
on conflict (user_id) do nothing;
```

3. Ouvre `admin.html` (lien « Organisers » sur l'écran d'accueil de l'app) et connecte-toi.

Pour retirer un organisateur : `delete from admins where email = '...';`
Un compte Supabase qui n'est pas dans `admins` n'a aucun droit de plus qu'un joueur.

## 3. Récupérer les clés
1. Menu de gauche → **Project Settings** (l'engrenage) → **API**.
2. Copie :
   - **Project URL** (ex. `https://abcdxyz.supabase.co`)
   - **Publishable key** (ou « anon public » sur les anciens projets) : la clé publique, prévue pour le client

## 4. Renseigner l'app
Ouvre `js/config.js` et colle les deux valeurs :

```js
window.CONFIG = {
  SUPABASE_URL: 'https://abcdxyz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_...'
};
```

## 5. Tester
- Ouvre `index.html` dans un navigateur (ou l'URL GitHub Pages).
- Les 15 chambres se créent toutes seules dans la table `teams` au premier chargement.
- Rejoins avec un code chambre (ex. `R101`, ou `DEMO` pour l'équipe 7), choisis ton nom,
  nomme ton équipe.
- Ouvre la même URL sur un **deuxième téléphone / navigateur**, rejoins une autre chambre :
  les noms d'équipe, les points et les votes doivent apparaître des deux côtés en direct.

## Notes
- **Validation** : une preuve reste « en attente » tant qu'un organisateur ne l'a pas validée
  dans le back-office. Les points ne sont écrits qu'à ce moment-là, par la base elle-même.
- **Sécurité** : la clé « publishable » est faite pour être publique ; ce sont les règles de la
  base qui protègent. Les joueurs n'ont pas de compte (code chambre + prénom), donc ils peuvent
  encore renommer une équipe, changer sa photo, envoyer une preuve au nom d'une autre équipe
  (elle reste en attente) et voter deux fois avec deux appareils. Ils ne peuvent pas créer de
  points, valider une preuve, ni toucher aux challenges, au programme ou aux réglages.
  Détail en bas de `supabase/schema_v3.sql`.
- **Photos** : réduites dans le navigateur, puis stockées dans la table `submission_photos`.
  Chaque téléphone ne télécharge que les photos qu'il affiche. Le passage à Supabase Storage
  est une étape suivante.
- **Repartir de zéro** : back-office → Settings → « Restart from zero ». Efface points, preuves,
  photos, votes, joueurs connectés, noms et photos d'équipe, et renvoie tous les téléphones à
  l'écran du code chambre. Les challenges et le programme sont conservés.
- **Revenir à la démo** : laisse `SUPABASE_URL` / `SUPABASE_ANON_KEY` vides dans `js/config.js`.
