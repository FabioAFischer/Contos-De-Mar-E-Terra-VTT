import { readFileSync } from "node:fs";
import { mkdir, rm, rename, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Level } from "level";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "packs/habilidades-da.db");
const outputPath = resolve(root, "packs/habilidades-da");
const stagingPath = resolve(root, "packs/.habilidades-da.updated");
const replaceExisting = process.argv.includes("--replace");
const draummaIds = new Set([
  "draumma-as-na-manga", "draumma-redistribuicao-de-magia", "draumma-sifao-de-mana", "draumma-truque-de-mestre",
  "noris-frenesi-do-lutador", "noris-punhos-abrasivos", "noris-chutes-meia-lua", "noris-plumagem-pugilista", "noris-peso-pesado", "noris-armar-guarda"
]);

function sourceItems() {
  return readFileSync(sourcePath, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter((item) => draummaIds.has(item._id));
}

async function readCurrentItems() {
  const db = new Level(outputPath, { keyEncoding: "utf8", valueEncoding: "utf8" });
  const entries = [];
  try {
    await db.open();
    for await (const [key, value] of db.iterator()) if (String(key).startsWith("!items!")) entries.push([String(key), JSON.parse(value)]);
  } finally { await db.close(); }
  return entries;
}

async function update() {
  if (!replaceExisting) throw new Error("Use --replace após fechar o Foundry e realizar backup do LevelDB.");
  await stat(outputPath);
  const existing = await readCurrentItems();
  const merged = [...existing];
  const existingKeys = new Set(existing.map(([key]) => key));
  for (const item of sourceItems()) {
    const key = `!items!${item._id}`;
    const index = merged.findIndex(([entryKey]) => entryKey === key);
    const normalized = { ...item, folder: null };
    if (index >= 0) merged[index] = [key, normalized];
    else merged.push([key, normalized]);
  }
  const missingCount = [...draummaIds].filter((id) => !existingKeys.has(`!items!${id}`)).length;
  if (merged.length !== existing.length + missingCount) throw new Error(`Esperadas ${existing.length + missingCount} entradas; obtidas ${merged.length}.`);
  await rm(stagingPath, { recursive: true, force: true });
  await mkdir(dirname(stagingPath), { recursive: true });
  const db = new Level(stagingPath, { keyEncoding: "utf8", valueEncoding: "utf8" });
  try { for (const [key, item] of merged) await db.put(key, JSON.stringify(item)); }
  finally { await db.close(); }
  await rm(outputPath, { recursive: true, force: true });
  await rename(stagingPath, outputPath);
  console.log(`Compêndio atualizado: ${merged.length} entradas.`);
  for (const id of draummaIds) console.log(`${id}: ${merged.find(([key]) => key === `!items!${id}`)?.[1]?.name ?? "ausente"}`);
}

update().catch((error) => { console.error(error.message); process.exitCode = 1; });
