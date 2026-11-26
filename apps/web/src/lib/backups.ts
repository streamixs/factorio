/**
 * Labels the save files shown in the backups panel. The main world is
 * `world.zip`; Factorio rotates the `_autosaveN.zip` slots separately.
 */
export function backupLabel(name: string): string | undefined {
  if (name === "world.zip") {
    return "monde actuel";
  }

  const autosave = /^_autosave(\d+)\.zip$/.exec(name);
  if (autosave !== null) {
    return `autosave ${autosave[1]}`;
  }

  if (name.startsWith("pre-restore-")) {
    return "avant restauration";
  }
  if (name.startsWith("pre-import-")) {
    return "avant import";
  }

  return undefined;
}
