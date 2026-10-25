import { readFileSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Level } from "level";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "packs/habilidades-da.db");
const outputPath = resolve(root, "packs/habilidades-da");
const stagingPath = resolve(root, "packs/.habilidades-da.generated");
const replaceExisting = process.argv.includes("--replace");

const expectedNames = [
  "Empunhadura do Mais Forte",
  "Investida Brutal",
  "Postura de Jotun",
  "Queda do Predador",
  "Rugido dos Jotun",
  "Vitória do Mais Forte",
  "Filho de Hel",
  "Manifestação de Hel",
  "Conversão Profana",
  "Última Centelha"
  ,"Ás na Manga"
  ,"Redistribuição de Magia"
  ,"Sifão de Mana"
  ,"Truque de Mestre"
  ,"Frenesi do Lutador"
  ,"Punhos Abrasivos"
  ,"Chutes em Meia Lua"
  ,"Plumagem de um Pugilista"
  ,"Peso Pesado"
  ,"Armar Guarda"
];

export function readSourceItems() {
  const lines = readFileSync(sourcePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Linha ${index + 1} inválida em ${sourcePath}: ${error.message}`);
    }
  });

  if (items.length !== expectedNames.length) {
    throw new Error(`Esperados ${expectedNames.length} Items; encontrados ${items.length}.`);
  }
  if (items.some((item) => item.type !== "habilidadeDa")) {
    throw new Error("A fonte contém um registro que não é do tipo habilidadeDa.");
  }
  if (items.some((item) => !item._id || !item.name)) {
    throw new Error("Todo Item precisa de _id e name.");
  }
  if (JSON.stringify(items.map(({ name }) => name)) !== JSON.stringify(expectedNames)) {
    throw new Error("A ordem ou os nomes dos Items não correspondem ao compêndio esperado.");
  }
  return items;
}

export async function generateHabilidadesDaPack() {
  const items = readSourceItems();
  try {
    await stat(outputPath);
    if (!replaceExisting) {
      throw new Error(`O diretório ${outputPath} já existe. Faça backup e execute novamente com --replace.`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rm(stagingPath, { recursive: true, force: true });
  await mkdir(dirname(stagingPath), { recursive: true });

  const db = new Level(stagingPath, { keyEncoding: "utf8", valueEncoding: "utf8" });
  try {
    for (const item of items) {
      const normalized = { ...item, folder: null };
      await db.put(`!items!${item._id}`, JSON.stringify(normalized));
    }
  } finally {
    await db.close();
  }

  if (replaceExisting) await rm(outputPath, { recursive: true, force: true });
  await rename(stagingPath, outputPath);
  console.log(`Compêndio gerado: ${items.length} Items em ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateHabilidadesDaPack().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
