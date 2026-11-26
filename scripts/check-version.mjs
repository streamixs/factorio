#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packages = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "libs/shared/package.json",
];

const version = (await readFile(join(root, "VERSION"), "utf8")).trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION must be SemVer, got ${JSON.stringify(version)}`);
  process.exit(1);
}

for (const relative of packages) {
  const json = JSON.parse(await readFile(join(root, relative), "utf8"));
  if (json.version !== version) {
    console.error(
      `${relative} has version ${json.version}, expected ${version}`,
    );
    process.exit(1);
  }
}

const ref = process.env.GITHUB_REF_NAME;
if (ref?.startsWith("v") && ref !== `v${version}`) {
  console.error(`Git tag ${ref} does not match VERSION ${version}`);
  process.exit(1);
}

console.log(`Platform version ${version} is consistent.`);
