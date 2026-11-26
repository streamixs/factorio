# Runbook d’exploitation

Ce document décrit les opérations courantes sur la plateforme. Le
déploiement initial est dans [`../deploy/README.md`](../deploy/README.md).

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

- Factorio écrit ses autosaves dans `/factorio/saves` sur le PVC.
- Avant une restauration ou un import, l’agent copie la sauvegarde courante
  en `pre-restore-*` ou `pre-import-*`.
- Les **3 dernières copies de sécurité** de chaque type sont conservées. Les
  plus anciennes sont purgées par le Job.
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

```sh
# Agent
make -C apps/agent docker-build IMG=factorio-agent:dev
make -C apps/agent deploy IMG=factorio-agent:dev

# API + web
make -C deploy build
make -C deploy deploy
```

`make deploy` redémarre explicitement l’API et le web : un rebuild avec le
même tag `:dev` est donc bien pris en compte. Un changement du template des
pods Factorio (script du sidecar, réglages) déclenche un rollout des serveurs
existants.

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
