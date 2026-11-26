# Runbook d’exploitation

Ce document décrit les opérations courantes sur la plateforme. Le
déploiement initial est dans [`../deploy/README.md`](../deploy/README.md).
Les décisions d’architecture sont dans
[`decisions.md`](decisions.md).

## Conventions

| Élément | Namespace |
|---|---|
| Serveurs Factorio, PVC et opérations | `default` (configurable via `FACTORIO_NAMESPACE`) |
| API, web, Secret `factorio-auth` | `factorio-system` |
| Agent | `agent-system` |

Les commandes utilisent `default` et `factorio-system`. Adaptez-les si vous
avez changé `FACTORIO_NAMESPACE`.

## Identifiants et rotation

Lire les identifiants du Secret :

```sh
kubectl -n factorio-system get secret factorio-auth \
  -o go-template='{{.data.web-user | base64decode}}{{"\n"}}'
kubectl -n factorio-system get secret factorio-auth \
  -o go-template='{{.data.web-password | base64decode}}{{"\n"}}'
kubectl -n factorio-system get secret factorio-auth \
  -o go-template='{{.data.api-token | base64decode}}{{"\n"}}'
```

Rotation du mot de passe web et du token API :

```sh
NEW_PASSWORD="$(openssl rand -base64 24)"
NEW_TOKEN="$(openssl rand -hex 32)"

kubectl -n factorio-system create secret generic factorio-auth \
  --from-literal=web-user=admin \
  --from-literal=web-password="$NEW_PASSWORD" \
  --from-literal=api-token="$NEW_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n factorio-system rollout restart \
  deployment/factorio-api deployment/factorio-web
kubectl -n factorio-system rollout status deployment/factorio-api
kubectl -n factorio-system rollout status deployment/factorio-web
```

Le web et l’API doivent tous les deux redémarrer : le web injecte le token
interne dans le proxy `/api`.

## Cycle de vie d’un serveur

Les actions sont disponibles dans l’UI. En cas de besoin, les CRDs restent
la source de vérité :

```sh
kubectl -n default get factorioserver
kubectl -n default get factoriooperation
kubectl -n default describe factorioserver <name>
```

- **Démarrer / arrêter** : l’agent met le Deployment à 1 ou 0 réplica.
  Factorio sauvegarde le monde sur SIGTERM.
- **Supprimer sans conserver** : le CR et le PVC sont supprimés.
- **Supprimer avec « Conserver les données »** : le PVC `<name>-data` est
  détaché, annoté `games.dev.streamixs.com/keep-pvc=true`, puis le CR est
  supprimé. Un serveur recréé avec le même nom l’adopte automatiquement.

Lister et supprimer un volume conservé mais jamais réutilisé :

```sh
kubectl -n default get pvc
kubectl -n default delete pvc <name>-data
```

## Réglages et conflits

- Une opération active (`Pending`, `Suspending`, `Running`) verrouille les
  actions de la page serveur. L’API renvoie 409 si une mutation est tentée
  pendant l’opération.
- Une mise à jour de réglages envoie la génération du CR. Si la configuration
  a changé ailleurs, l’API renvoie 409 et l’UI propose de recharger les
  valeurs à jour. Les modifications locales ne sont pas écrasées.
- Les réglages sont appliqués par l’agent ; certains changements redémarrent
  le serveur (version, ressources, réseau, map).

## Sauvegardes, restauration et import

- La sauvegarde principale est **`world.zip`**. Un arrêt propre réécrit
  `world.zip`, sans toucher aux autosaves.
- Factorio écrit les autosaves `_autosave1.zip` … `_autosaveN.zip` dans
  `/factorio/saves` sur le PVC. Le nombre de slots est réglé par
  `autosave_slots` (5 par défaut).
- Les autosaves ne tournent pas quand le serveur est en pause. Le réglage
  « Pause quand aucun joueur » est activé par défaut : désactive-le si tu veux
  des autosaves sur un serveur vide.
- Au premier démarrage après la mise à jour, l’init `prepare-data` copie la
  plus récente `_autosave*.zip` (ou la sauvegarde non-sécurité la plus récente)
  vers `world.zip` si ce fichier n’existe pas encore. Les anciens fichiers
  restent sur le volume.
- Avant une restauration ou un import, l’agent copie `world.zip` en
  `pre-restore-*` ou `pre-import-*`. L’opération installe ensuite la save
  choisie sous le nom `world.zip`, que le serveur recharge au démarrage.
- Les opérations terminées sont conservées **7 jours** dans l’historique,
  puis supprimées.
- Un import est limité à **1 GiB**. L’API vérifie aussi l’espace libre du
  volume d’imports et garde une marge de **256 MiB**.
- L’URL de téléchargement de l’import est signée et expire après 30 minutes.
- L’onglet Sauvegardes affiche la taille des sauvegardes et l’occupation du
  PVC (capacité lue depuis Kubernetes, usage mesuré avec `du`).

Télécharger une sauvegarde manuellement depuis l’UI ou avec l’API :

```sh
kubectl -n factorio-system port-forward svc/factorio-api 3001:3001
TOKEN="$(kubectl -n factorio-system get secret factorio-auth \
  -o go-template='{{.data.api-token | base64decode}}')"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/servers/<name>/backups
```

## Logs, events et RCON

- **Logs** : onglet Logs, ou `kubectl -n default logs <pod> -c factorio`.
- **Logs précédents** : onglet Logs avec l’option « précédent », ou
  `kubectl -n default logs <pod> -c factorio --previous`.
- **Events** : onglet Events, ou
  `kubectl -n default get events --sort-by=.lastTimestamp`.
- **Console RCON** : onglet Console. Le serveur doit être démarré.
- **Joueurs en ligne** : carte « Joueurs en ligne » de la vue d’ensemble, ou
  `GET /api/servers/<name>/players`. L’API interroge RCON `/players online`
  toutes les 10 secondes côté UI.
- **Expulsion** : bouton « Expulser » puis confirmation. L’API vérifie que le
  joueur est dans la liste en ligne avant d’envoyer `/kick <joueur>` ; un nom
  absent est refusé.
- **Uptime** : carte Charge, calculé depuis la création du pod courant.
  L’uptime reste affiché si metrics-server est indisponible ; le CPU et la
  mémoire affichent alors « — ».
- **Audit** : l’expulsion est tracée comme une commande RCON dans les logs de
  l’API, avec le nom du serveur et la commande normalisée.
- Les commandes RCON sont auditées dans les logs de l’API, avec le nom du
  serveur et la commande normalisée/tronquée. Les mots de passe et la sortie
  ne sont jamais journalisés.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| UI 401 | Mauvais identifiants Basic | Relire `factorio-auth` |
| UI 503 | `WEB_AUTH_USER`/`WEB_AUTH_PASSWORD` absents | Vérifier le Secret et le Deployment web |
| API 502 après un rollout | Port-forward pointant sur l’ancien pod | Relancer `make -C deploy port-forward` |
| API 503 | Token API absent ou différent | Vérifier `factorio-auth` et redémarrer API + web |
| 409 pendant une opération | Restauration/import en cours | Attendre `Completed`/`Failed` |
| 409 sur les réglages | Configuration modifiée ailleurs | Cliquer sur « Recharger les valeurs à jour » |
| 413 à l’import | Fichier > 1 GiB ou espace libre insuffisant | Libérer le PVC d’imports ou réduire le fichier |
| PVC `Pending` | StorageClass inexistante ou volume non provisionnable | Vérifier la StorageClass et les events du PVC |
| Pod `0/2` | PVC, image, ressource ou NetworkPolicy | `kubectl describe pod` et events |
| Métriques indisponibles | `metrics-server` absent | Installer `metrics-server` |
| NetworkPolicy non appliquée | CNI sans support | Utiliser Calico/Cilium |
| `factorio-auth` introuvable | Namespace ou Secret non créé | `kubectl apply -f deploy/namespace.yaml` puis `make -C deploy auth-secret` |

Commandes utiles :

```sh
kubectl -n factorio-system get pods
kubectl -n agent-system get pods
kubectl -n default describe pod <pod>
kubectl -n default get pvc
kubectl -n default get factorioserver <name> -o yaml
kubectl -n default get factoriooperation <name> -o yaml
```

## Rebuild et redéploiement

### Images publiées (recommandé)

Depuis la racine du dépôt :

```sh
make deploy                  # image main-<short-sha> du commit courant
make deploy TAG=v0.4.0       # image d’une release
```

Le script `scripts/deploy-ghcr.sh` résout les trois images
`ghcr.io/<owner>/factorio-{api,web,agent}:<tag>`, vérifie leur accès, puis
déploie l’agent avant l’API et le web. Il refuse de continuer si une image ou
le Secret `factorio-auth` manque. Si les packages sont privés (l’organisation
peut interdire les packages publics), crée le Secret `ghcr-pull` dans les deux
namespaces avec un PAT classique `read:packages` :

```sh
read -rs GHCR_TOKEN
export GHCR_TOKEN
GHCR_USERNAME=<utilisateur-github> make ghcr-secret
unset GHCR_TOKEN
```

### Build local

```sh
make deploy-local
```

Cette commande construit `factorio-{api,web,agent}:dev` puis déploie l’agent,
l’API et le web. Le tag `:dev` est reconstruit et un rollout explicite est
forcé, donc la nouvelle image est bien chargée. Un changement du template des
pods Factorio (script du sidecar, réglages) déclenche un rollout des serveurs
existants.

Pour une release versionnée, suivre [`release.md`](release.md) et utiliser
`make deploy TAG=vX.Y.Z`.

## Vérification après déploiement

```sh
kubectl -n factorio-system get pods          # API et web 1/1
kubectl -n agent-system get pods             # agent 1/1
kubectl -n default get pods -l app.kubernetes.io/name=factorio
```

- Ouvrir l’UI, vérifier la liste des serveurs.
- Créer un serveur temporaire, attendre `Available`, tester logs/events/RCON,
  puis le supprimer.
- Vérifier que les backups et l’occupation du volume s’affichent.

## Nettoyage et désinstallation

Supprimer d’abord les serveurs depuis l’UI (avec ou sans conservation des
données). Ensuite :

```sh
make -C deploy undeploy
make -C apps/agent undeploy
make -C apps/agent uninstall
```

- `make -C deploy undeploy` supprime le namespace `factorio-system`, donc
  l’API, le web et le Secret `factorio-auth`.
- `make -C apps/agent uninstall` supprime les CRDs. La suppression d’un CRD
  supprime tous les `FactorioServer` et leurs ressources possédées, y compris
  les PVC non conservés. Les PVC conservés restent à supprimer manuellement.

## CI

Les PR exécutent `Agent lint`, `Agent test`, `API`, `Web` et les jobs
`Docker (api|web|agent)`. Les merges sont en squash.

Les checks obligatoires ne sont pas activables sur ce dépôt privé sans GitHub
Pro. Les noms de jobs sont stables pour pouvoir les activer si le dépôt devient
public ou passe à GitHub Pro.
