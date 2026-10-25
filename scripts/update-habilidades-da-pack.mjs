const replaceExisting = process.argv.includes("--replace");
import { generateHabilidadesDaPack } from "./generate-habilidades-da-pack.mjs";

async function update() {
  if (!replaceExisting) throw new Error("Use --replace após fechar o Foundry e realizar backup do LevelDB.");
  await generateHabilidadesDaPack();
}

update().catch((error) => { console.error(error.message); process.exitCode = 1; });
