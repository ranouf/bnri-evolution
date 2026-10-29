# BNRI Évolution

Extension Chrome destinée au portail [MonPortefeuille+ de BNRI](https://monportefeuilleplus.ca/nbin/home), basée sur les outils de Manuvie Évolution.

## Fonctions

L'extension ajoute au portail authentifié un panneau inspiré de l'identité visuelle de MonPortefeuille+. Elle analyse localement les données déjà accessibles dans la session :

- valeur et capital net, consolidés et par compte ;
- gains cumulés et rendements estimés ;
- synthèse annuelle sur 24 mois ;
- frais et cotisations détectés ;
- répartition de la valeur par compte ;
- neutralisation des transferts internes dans la vue consolidée.

Aucune donnée financière ni information d'authentification n'est transmise hors du portail.

## Validation locale

Node.js 24 est utilisé dans les workflows.

```sh
npm ci
npx playwright install chromium
npm run ci
npm run coverage:summary
```

La validation inclut Prettier, ESLint, TypeScript, la note de version, Jest avec un seuil de couverture de 90 %, les tests navigateur et la création des archives.

Le script `ci-build.ps1` exécute également ces étapes sous Windows.

## Archives

```sh
npm run build
```

Les fichiers `dist/bnri-evolution-0.1.0.zip` et `dist/bnri-evolution-0.1.0-chrome-store.zip` contiennent le manifeste, l'analyse locale, l'interface et la politique de confidentialité.

## CI/CD

- **PR Validation** : contrôles sur les PR, rapport de couverture et artefacts.
- **Release** : validation et release GitHub lors de la création d'un tag `v*`.
- **Deploy Chrome Extension** : construction sur `main` et sur les PR ; validation des identifiants et publication sur déclenchement manuel uniquement.

La publication manuelle conserve les options `dry_run=true`, `publish_to_chrome_store=false` et `create_github_release=false` par défaut.

Secrets requis dans le dépôt :

- `CHROME_EXTENSION_ID` : identifiant propre à BNRI Évolution, à obtenir après création de sa fiche Chrome Web Store.
- `CHROME_PUBLISHER_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

Chaque secret est propre à la fiche ou au projet de publication BNRI Évolution.

```sh
npm run chrome-store:dry-run
```

Cette commande utilise les variables d'environnement et vérifie les identifiants sans publier.
