# Revue 3D

Application de bureau pour passer en revue, à la main, une grande bibliothèque de fichiers `.glb` et `.gltf`. Un modèle est affiché à la fois. Vous votez, le suivant arrive. Les décisions remplissent un classeur Excel.

Elle tourne en local sur **Windows**, **Linux** et **macOS**. Aucun fichier 3D n’est envoyé sur un serveur, modifié ou supprimé.

## Télécharger

Les installeurs de la version courante sont sur la page **Releases** du dépôt GitHub.

| Système | Fichier | Usage |
| --- | --- | --- |
| Windows 10 ou 11, 64 bits | `Revue3D-…-win-x64.exe` | Installeur. Le `.zip` est une version portable, sans installation. |
| Linux x64 | `Revue3D-…-linux-x64.AppImage` | Rendre le fichier exécutable, puis le lancer. Le `.deb` s’installe avec `sudo apt install ./Revue3D-….deb`. |
| macOS Apple Silicon ou Intel | `Revue3D-…-mac-….dmg` | Ouvrir l’image disque et glisser l’application dans Applications. Le `.zip` contient la même application. |

Les binaires ne sont pas signés avec un certificat payant.

- **Windows** : SmartScreen peut afficher « Windows a protégé votre ordinateur ». Choisissez « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : Gatekeeper peut bloquer l’ouverture. Clic droit sur l’application, « Ouvrir », puis confirmez. Sur les Mac récents, il faut parfois l’autoriser dans Réglages Système → Confidentialité et sécurité.
- **Linux** : pour une AppImage, `chmod +x Revue3D-*.AppImage` puis `./Revue3D-*.AppImage`. Certaines distributions demandent aussi `libfuse2`.

## Premier lancement

Au premier démarrage, un tutoriel en français parcourt l’interface. Chaque étape pose une info-bulle sur la commande concernée : le dossier, la vue 3D, la liste, les trois votes, le classeur, la reprise. Les flèches du clavier passent à l’étape suivante ou précédente. « Passer » ferme le guide et ne le remontre plus.

Pour le revoir : **Aide**, puis **Revoir le tutoriel**.

Le dossier `exemples`, livré avec l’application lancée depuis le code source, contient trois fichiers pour s’entraîner avant les milliers d’assets.

## Revue d’un dossier

1. **Choisir un dossier**, ou déposer un dossier dans la fenêtre. Les sous-dossiers sont parcourus. Seuls `.glb` et `.gltf` sont listés, y compris les GLB compressés en Draco ou Meshopt.
2. Le filtre **À voter** ne montre que les fichiers sans décision. La revue reprend donc au bon endroit si vous fermez l’application.
3. Regardez le modèle.
4. Votez. Le fichier suivant s’affiche aussitôt.

| Bouton | Touche | Effet |
| --- | --- | --- |
| On garde | `G` ou `1` du pavé | L’asset reste dans la bibliothèque. |
| On étudie | `E` ou `2` du pavé | À revoir plus tard. |
| On supprime | `S`, `Suppr` ou `3` du pavé | Marqué pour une suppression future. Le fichier reste sur le disque. |

Les touches lettres fonctionnent sur un clavier AZERTY. Les chiffres de la rangée du haut ne sont pas utilisés, parce qu’ils demandent Maj sur un clavier français.

### Souris

Même logique que F3D :

- clic gauche glissé : tourner autour du modèle ;
- clic droit ou molette appuyée : déplacer ;
- molette : zoomer vers le curseur ;
- double-clic : recadrer la caméra.

### Autres commandes

| Touche ou bouton | Action |
| --- | --- |
| Flèches gauche et droite | Fichier précédent ou suivant, sans voter |
| Origine / Fin | Premier ou dernier fichier du filtre |
| Page haut / Page bas | Sauter de 10 fichiers |
| `Ctrl` + `Z` | Annuler le dernier vote |
| `R` ou Recadrer | Replacer la caméra |
| `Espace` | Lecture ou pause des animations |
| `W` ou Fil de fer | Afficher la structure sans les surfaces |
| `L` ou Grille | Afficher ou masquer la grille |
| `H` | Aide |
| Liste | Masquer le panneau des fichiers pour agrandir la vue |
| Actualiser | Relire le dossier si des fichiers ont été ajoutés ou retirés |
| Voir dans le dossier | Montrer le GLB dans l’explorateur |

Un second clic trop rapide est ignoré, pour éviter de voter deux fichiers d’un double-clic.

## Le classeur Excel

Il est créé dans le dossier choisi :

```text
votre-dossier/.gf-revue/revue-assets.xlsx
votre-dossier/.gf-revue/session.json
```

`.gf-revue` n’est pas listé parmi les assets. `session.json` est la sauvegarde de travail. Le classeur est réécrit après chaque vote.

Feuilles :

- **Résumé** : totaux et rappel que les fichiers 3D n’ont pas été modifiés ;
- **On garde**, **On étudie**, **On supprime** : une ligne par fichier concerné ;
- **Tout** : l’inventaire, y compris les fichiers pas encore votés ;
- **Introuvables** : votes dont le fichier n’est plus dans le dossier.

Colonnes : décision, nom, chemin relatif, taille en Mo, date du vote, chemin complet.

Si le classeur est ouvert dans Excel au moment d’un vote, Windows le verrouille. Les votes restent dans `session.json`, et une copie `revue-assets.autosave.xlsx` est écrite. Fermez Excel : le prochain vote réécrit le classeur principal.

Pour recommencer une revue de zéro, fermez l’application et supprimez le dossier `.gf-revue`.

## Ce que l’application ne fait pas

- Elle ne supprime, ne déplace et ne modifie aucun GLB.
- Elle n’ouvre pas les autres formats 3D (FBX, OBJ, USD, etc.).
- Elle n’affiche pas les textures KTX2 / Basis. Les textures PNG et JPEG embarquées dans le GLB fonctionnent.
- Elle charge un seul modèle à la fois, pour rester fluide sur plusieurs milliers de fichiers.

## Lancer depuis le code source

Il faut Node.js 20 ou plus récent.

```bash
npm install
npm start
```

- Windows : `Lancer.bat` fait la même chose.
- Linux et macOS : `chmod +x lancer.sh` puis `./lancer.sh`.

`npm test` vérifie le parcours d’un dossier, l’écriture du classeur et le fait qu’un vote « On supprime » ne détruit pas le fichier.

`npm run dev` relance l’interface avec rechargement pendant un développement.

## Construire les installeurs

Sur la machine du système visé :

```bash
npm run dist
```

Les fichiers sortent dans `release/`. Une compilation macOS se fait sur macOS, une compilation Linux sur Linux. Le dépôt publie les trois via GitHub Actions : pousser un tag `v*` lance la construction et attache les installeurs à une release.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Où sont les décisions

La fenêtre se souvient du dernier dossier. Les votes sont rangés par chemin relatif, donc le dossier peut être déplacé tant que l’arborescence interne ne change pas. Un fichier renommé est traité comme un nouveau fichier ; l’ancien vote apparaît dans la feuille Introuvables.
