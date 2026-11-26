# Factorio Platform

Plateforme self-hosted pour créer, exploiter et sauvegarder des serveurs
Factorio sur Kubernetes.

## Fonctionnalités

- Création de serveurs avec version, ressources CPU/RAM, taille et
  StorageClass du volume, type de Service et mot de passe de partie.
- Démarrage, arrêt, suppression et conservation optionnelle du volume de
  données.
- Réglages Factorio : serveur, accès, sauvegarde automatique, joueurs,
  génération et réglages de map, ressources et réseau.
- Logs, events Kubernetes et console RCON.
- Sauvegardes : téléchargement, restauration et import de fichiers `.zip`.
- Rétention : 3 copies de sécurité `pre-restore`/`pre-import`, historique des
  opérations limité à 7 jours.
- Occupation du volume et garde-fou d’espace libre sur les imports.
- Authentification Basic pour l’UI, token bearer interne pour l’API,
  NetworkPolicies et audit des commandes RCON.

## Architecture

```text
Navigateur
   │  Basic auth
   ▼
factorio-web (Next.js)
   │  /api proxy + bearer interne
   ▼
factorio-api (NestJS)
   │  crée et lit les CRDs
   ▼
FactorioServer / FactorioOperation
   │  reconciliation
   ▼
agent (controller-runtime)
   │
   ├── Deployment : conteneur Factorio + sidecar saves
   ├── Service UDP : ClusterIP / NodePort / LoadBalancer
   ├── PVC <nom>-data : sauvegardes, config, mods
   └── Job d’opération : restauration / import
```

| Composant | Rôle |
|---|---|
| `apps/agent` | Opérateur Kubernetes en Go. Crée les Deployment, Service, PVC, ConfigMaps, Secrets et Jobs d’opération. |
| `apps/api` | API NestJS. Valide les entrées, expose les CRDs, les logs, les backups, RCON et les imports. |
| `apps/web` | UI Next.js. Proxy `/api` côté serveur et Basic auth. |
| `libs/shared` | Types et schémas Zod partagés. |
| `deploy` | Kustomize pour l’API, le web, les NetworkPolicies et le PVC d’imports. |

## Prérequis

- Un cluster Kubernetes accessible avec `kubectl`.
- Docker (ou un builder compatible) pour les images.
- Go 1.26 pour l’agent.
- Node.js 24 et pnpm 11 pour l’API et le web.
- `metrics-server` optionnel : sans lui, l’onglet Connexion affiche
  « métriques indisponibles ».
- Un CNI qui applique les NetworkPolicies (Calico, Cilium…) pour tester
  l’isolation réseau. Le CNI par défaut de Kind ne les applique pas.

OrbStack, Docker Desktop et Kind conviennent pour le développement local.

## Démarrage rapide

1. **Installer l’agent et ses CRDs**

   ```sh
   make -C apps/agent docker-build IMG=factorio-agent:dev
   make -C apps/agent deploy IMG=factorio-agent:dev
   ```

   Pour un autre cluster, poussez l’image dans un registry et passez son nom
   complet à `IMG`.

2. **Créer le namespace et le Secret d’authentification**

   ```sh
   kubectl apply -f deploy/namespace.yaml
   make -C deploy auth-secret
   ```

   La commande affiche l’utilisateur et le mot de passe Basic générés. Le
   token API est stocké dans le même Secret, sous la clé `api-token`.

3. **Construire et déployer l’API et le web**

   ```sh
   make -C deploy build
   make -C deploy deploy
   ```

   `make deploy` force un rollout : une image `:dev` reconstruite est bien
   chargée par les pods.

4. **Ouvrir l’interface**

   ```sh
   make -C deploy port-forward
   ```

   Ouvrez <http://localhost:3000> et connectez-vous avec les identifiants
   affichés à l’étape 2.

Le détail du déploiement, du RBAC, des NetworkPolicies, des imports et de
l’ingress se trouve dans [`deploy/README.md`](deploy/README.md).

## Développement local

```sh
pnpm install
pnpm --filter @factorio/shared build
```

### API

```sh
cd apps/api
API_TOKEN=dev-token pnpm dev
```

L’API écoute sur le port `3001` et utilise le kubeconfig courant. Copiez
`apps/api/.env.example` pour la liste des variables.

### Web

```sh
cp apps/web/.env.example apps/web/.env.local
# API_TOKEN doit correspondre à celui de l’API.
cd apps/web
pnpm dev
```

Le web écoute sur <http://localhost:3000>, charge `.env.local` et proxifie
`/api` vers l’API. Les identifiants Basic de développement sont définis par
`WEB_AUTH_USER` et `WEB_AUTH_PASSWORD`.

### Agent

```sh
cd apps/agent
make run
```

L’agent utilise le kubeconfig courant et doit pouvoir créer les ressources
dans le namespace cible.

### Tests et lint

```sh
pnpm test                          # API + web
pnpm --filter @factorio/api test
pnpm --filter @factorio/web test
pnpm lint
make -C apps/agent fmt lint test
```

## Utilisation

- **Créer un serveur** depuis le formulaire de la page d’accueil.
- **Réglages** : onglet Configuration. Un conflit 409 signifie que la
  configuration a changé ailleurs ; rechargez les valeurs à jour.
- **Console** : commandes RCON. Les commandes sont auditées dans les logs de
  l’API, jamais leur sortie.
- **Sauvegardes** : autosaves Factorio, copies de sécurité, restauration et
  import. Un import est limité à 1 GiB et à l’espace libre du volume.
- **Suppression** : l’option « Conserver les données » détache le PVC. Un
  serveur recréé avec le même nom le réadopte.
- **Opérations** : une restauration ou un import verrouille les actions
  jusqu’à la fin de l’opération.

Les procédures d’exploitation, de rotation de secret, de sauvegarde et de
dépannage sont dans [`docs/runbook.md`](docs/runbook.md).

## Sécurité

- L’UI utilise HTTP Basic auth ; l’API n’accepte qu’un token bearer interne
  injecté par le serveur Next. Le navigateur ne voit jamais ce token.
- Les mutations same-origin sont vérifiées côté web.
- Les NetworkPolicies limitent l’accès à l’API, aux ports saves/RCON et au
  trafic UDP du jeu.
- Les pods Factorio et d’opération n’automontent pas de token de compte de
  service.
- TLS et OIDC ne sont pas inclus. Pour un accès hors localhost/LAN, placez
  l’UI derrière un Ingress TLS ou un VPN. N’exposez pas l’API directement.

## CI et contribution

Les PR exécutent :

- `Agent lint` et `Agent test` ;
- `API` : format, lint, tests et build ;
- `Web` : lint, tests, typecheck et build ;
- `Docker (api)`, `Docker (web)`, `Docker (agent)` : validation des images.

Les merges se font en **squash**. Les checks obligatoires ne peuvent pas être
activés sur ce dépôt privé sans GitHub Pro ; les noms de jobs sont stables
pour pouvoir les activer plus tard.

Un template de PR rappelle les vérifications minimales.

## Documentation

- [`deploy/README.md`](deploy/README.md) — déploiement, auth, RBAC,
  NetworkPolicies, imports, metrics et ingress.
- [`docs/runbook.md`](docs/runbook.md) — exploitation et dépannage.
- [`apps/agent/README.md`](apps/agent/README.md) — opérateur et CRDs.
