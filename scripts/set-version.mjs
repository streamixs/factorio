#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2] ?? "";

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/set-version.mjs X.Y.Z");
  process.exit(1);
}

const packages = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "libs/shared/package.json",
];

await writeFile(join(root, "VERSION"), `${version}\n`);

for (const relative of packages) {
  const path = join(root, relative);
  const json = JSON.parse(await readFile(path, "utf8"));
  json.version = version;
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(`Set platform version to ${version}.`);
