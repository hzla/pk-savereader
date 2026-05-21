import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(repoRoot, "src/registry.ts");
const registryText = await import("node:fs/promises").then((fs) => fs.readFile(registryPath, "utf8"));

const rows = [...registryText.matchAll(/\{\s*key:\s*"([^"]+)",\s*title:\s*"([^"]+)".*?parser:\s*"([^"]+)".*?generation:\s*(\d+),\s*baseGame:\s*"([^"]+)"/gs)]
  .map((match) => ({
    key: match[1],
    title: match[2],
    parser: match[3],
    generation: match[4],
    baseGame: match[5],
    isBaseProfile: match[1].startsWith("base-")
  }));
const baseRows = rows.filter((row) => row.isBaseProfile);
const titleRows = rows.filter((row) => !row.isBaseProfile);

const output = [
  "# Supported Save Routing",
  "",
  "Generated from `src/registry.ts`.",
  "",
  "## Base Games",
  "",
  "| Base Game | Parser | Generation |",
  "| --- | --- | ---: |",
  ...baseRows.map((row) => `| ${row.baseGame} | ${row.parser} | ${row.generation} |`),
  "",
  "## Title Overrides",
  "",
  "| Title | Parser | Generation | Base Game |",
  "| --- | --- | ---: | --- |",
  ...titleRows.map((row) => `| ${row.title} | ${row.parser} | ${row.generation} | ${row.baseGame} |`),
  ""
].join("\n");

await mkdir(repoRoot, { recursive: true });
await writeFile(path.join(repoRoot, "SUPPORTED_TITLES.md"), output);
console.log(`Wrote ${baseRows.length} base game rows and ${titleRows.length} title override rows.`);
