# Golden files

Expected JSON output rendered from the sample custom resource at
`config/samples/games_v1alpha1_factorioserver.yaml`.

These files contain the full Factorio defaults plus the values set in the
sample. The defaults are the 2.1.24 example files shipped with the image
(`/opt/factorio/data/*.example.json`), with `_comment_*` keys removed and a
neutral server name. They are embedded from `internal/config/defaults/`.

| File | Source | Mounted as |
|---|---|---|
| `server-settings.golden.json` | `spec.server` | Secret `server-settings.json` |
| `map-gen-settings.golden.json` | `spec.mapGenSettings` | ConfigMap `map-gen-settings.json` |
| `map-settings.golden.json` | `spec.mapSettings` | ConfigMap `map-settings.json` |

## Rendering rules

1. Each document starts from the embedded Factorio defaults. Factorio requires
   the complete property tree and rejects a file that misses keys such as
   `description`.
2. Typed fields override the defaults. A field left unset keeps the Factorio
   default. Nested objects are merged key by key; lists are replaced.
3. API fields are camelCase, Factorio keys are snake_case. The mapping is
   explicit per field, not reflection-based:
   `maxPlayers` → `max_players`, `terrainSegmentation` →
   `terrain_segmentation`, `autoplaceControls` → `autoplace_controls`,
   `enemyEvolution` → `enemy_evolution`, `timeFactor` → `time_factor`.
4. `raw` is applied last. A top-level key produced by a typed field is rejected
   with a conflict error; a key that only exists in the defaults may be
   overridden through `raw`.
5. Output is indented with two spaces, keys are sorted, and the file ends with
   a newline. This keeps the content stable so its checksum can trigger a
   rollout.
6. Map generation values are numbers, not GUI labels: `1` is the Factorio
   default for frequency, size, richness, terrain segmentation and starting
   area. Map keys use Factorio names (`coal`, `iron-ore`, `enemy-base`, …).
   List order is preserved for `starting_points`.

## Updating the golden files

After changing the renderer or the sample:

```sh
UPDATE_GOLDEN=1 go test ./internal/config -run TestRenderSampleMatchesGoldenFiles
```

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
