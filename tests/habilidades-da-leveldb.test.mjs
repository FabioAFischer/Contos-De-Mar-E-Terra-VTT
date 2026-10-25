import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Level } from "level";

test("o LevelDB do compêndio contém Hrodnar, Marco, Draumma e Noris", async () => {
  const sourcePath = fileURLToPath(new URL("../packs/habilidades-da", import.meta.url));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "cmet-habilidades-da-"));
  const temporaryPath = join(temporaryRoot, "habilidades-da");
  await cp(sourcePath, temporaryPath, { recursive: true });
  const database = new Level(temporaryPath, {
    keyEncoding: "utf8",
    valueEncoding: "utf8"
  });
  const items = [];
  const ids = [
    "hrodnar-empunhadura", "hrodnar-investida", "hrodnar-postura", "hrodnar-queda",
    "hrodnar-rugido", "hrodnar-vitoria", "marco-filho-de-hel", "marco-manifestacao-de-hel",
    "marco-conversao-profana", "marco-ultima-centelha", "draumma-as-na-manga",
    "draumma-redistribuicao-de-magia", "draumma-sifao-de-mana", "draumma-truque-de-mestre",
    "noris-frenesi-do-lutador", "noris-punhos-abrasivos", "noris-chutes-meia-lua", "noris-plumagem-pugilista", "noris-peso-pesado", "noris-armar-guarda"
  ];

  try {
    await database.open();
    for (const id of ids) {
      const item = JSON.parse(await database.get(`!items!${id}`));
      if (item.type === "habilidadeDa") items.push(item);
    }
  } finally {
    await database.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  assert.equal(items.length, 20);
  assert.equal(items.filter((item) => item._id && item.system.associatedCharacter === "Hrodnar").length, 6);
  assert.equal(items.filter((item) => item._id && item.system.associatedCharacter === "Marco").length, 4);
  assert.equal(items.filter((item) => item._id && item.system.associatedCharacter === "Draumma").length, 4);
  assert.equal(items.filter((item) => item._id && item.system.associatedCharacter === "Noris").length, 6);
  assert.deepEqual(
    items.filter((item) => item._id && item.system.associatedCharacter === "Marco").map(({ name }) => name).sort(),
    ["Conversão Profana", "Filho de Hel", "Manifestação de Hel", "Última Centelha"].sort()
  );
});
