import { describe, expect, it } from "vitest";

import { backupLabel } from "./backups";

describe("backupLabel", () => {
  it("labels the current world", () => {
    expect(backupLabel("world.zip")).toBe("monde actuel");
  });

  it("labels autosave slots", () => {
    expect(backupLabel("_autosave1.zip")).toBe("autosave 1");
    expect(backupLabel("_autosave5.zip")).toBe("autosave 5");
  });

  it("labels pre-restore and pre-import copies", () => {
    expect(backupLabel("pre-restore-20260101T000000Z-world.zip")).toBe(
      "avant restauration",
    );
    expect(backupLabel("pre-import-20260101T000000Z-world.zip")).toBe(
      "avant import",
    );
  });

  it("does not label manual or unknown saves", () => {
    expect(backupLabel("test.zip")).toBeUndefined();
    expect(backupLabel("_autosave.zip")).toBeUndefined();
  });
});
