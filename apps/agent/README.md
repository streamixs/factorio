# Factorio agent

Opérateur Kubernetes écrit avec controller-runtime. Il réconcilie les CRDs
`FactorioServer` et `FactorioOperation` et possède tout le cycle de vie des
pods Factorio.

## Ressources gérées

Un `FactorioServer` produit :

- un Deployment `Recreate` avec le conteneur Factorio et le sidecar `saves` ;
- un Service UDP (`ClusterIP`, `NodePort` ou `LoadBalancer`) ;
- un PVC `<nom>-data` pour les sauvegardes, la configuration et les mods ;
- les ConfigMaps de réglages et les Secrets de credentials/RCON.

Une `FactorioOperation` :

- arrête le serveur si nécessaire ;
- exécute un Job de restauration ou d’import sur le PVC ;
- redémarre le serveur si l’opération l’avait arrêté ;
- conserve les 3 dernières copies `pre-restore-*`/`pre-import-*` ;
- supprime l’historique terminal après 7 jours.

## Commandes

```sh
make install                         # CRDs
make docker-build IMG=factorio-agent:dev
make deploy IMG=factorio-agent:dev    # installe et redémarre l’agent
make run                             # exécution locale avec le kubeconfig courant
make fmt lint test                   # vérifications
make manifests generate              # après modification des types/markers
./bin/manager --version              # version injectée au build
```

L’image doit être accessible au cluster. OrbStack partage les images locales ;
pour un autre cluster, poussez l’image dans un registry et passez son nom
complet à `IMG`.

Les tests utilisent envtest et téléchargent les binaires Kubernetes via
`make setup-envtest`. Les tests e2e Kind ne font pas partie de la CI.

## Documentation

- [README racine](../../README.md) — vue d’ensemble et démarrage rapide.
- [Déploiement](../../deploy/README.md) — API, web, auth, RBAC, NetworkPolicies.
- [Runbook](../../docs/runbook.md) — exploitation et dépannage.
