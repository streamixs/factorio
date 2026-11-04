# Golden files

Expected JSON output rendered from the sample custom resource at
`config/samples/games_v1alpha1_factorioserver.yaml`.

These files are **not** full Factorio default configuration. They contain only
the keys produced by the typed fields set in the sample. A field left unset
(`nil` pointer) is omitted so that Factorio applies its own default.

| File | Source | Mounted as |
|---|---|---|
| `server-settings.golden.json` | `spec.server` | Secret `server-settings.json` |
| `map-gen-settings.golden.json` | `spec.mapGenSettings` | ConfigMap `map-gen-settings.json` |
| `map-settings.golden.json` | `spec.mapSettings` | ConfigMap `map-settings.json` |

## Rendering rules the builder must follow

1. Only non-nil typed fields are written. A `nil` pointer means "leave the key
   out and let Factorio decide".
2. API fields are camelCase, Factorio keys are snake_case. The mapping is
   explicit per field, not reflection-based:
   `maxPlayers` → `max_players`, `terrainSegmentation` →
   `terrain_segmentation`, `autoplaceControls` → `autoplace_controls`,
   `enemyEvolution` → `enemy_evolution`, `timeFactor` → `time_factor`.
3. `raw` is applied last. If a key is produced both by a typed field and by
   `raw`, rendering must fail with a conflict error; there is no silent
   overwrite.
4. Output is indented with two spaces, keys are sorted, and the file ends with
   a newline. This keeps the content stable so its checksum can be used to
   trigger a rollout.
5. Map keys use Factorio names (`coal`, `iron-ore`, `enemy-base`, …). List order
   is preserved for `starting_points`.

## Not covered yet

| File | Why |
|---|---|
| `mod-list.json` | Needs `spec.mods`, not modeled yet |
| `mod-settings.json` | Depends on the Factorio version; may not exist |
| `server-adminlist.json` | Needs access-list fields in the CR |
| `server-whitelist.json` | Needs access-list fields in the CR |
| `server-banlist.json` | Needs access-list fields in the CR |

`server-id.json` and `player-data.json` are never generated: the first is the
server identity and must be preserved on the data volume, the second is a
client-side file.
