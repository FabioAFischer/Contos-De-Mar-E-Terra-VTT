# Contos de Mar e Terra

Fundação inicial do sistema **Contos de Mar e Terra**, em desenvolvimento para Foundry Virtual Tabletop v14.368.

## Estado atual

O sistema possui o Actor `personagem` e os Items `equipamento`, `habilidade`, `magia`, `arma` e `habilidadeDa`. O Data Model do personagem já organiza identidade, progressão, atributos, perícias, recursos, ações, moeda e biografia. A ficha V2 possui abas, cálculos derivados, validação básica de perícias, gerenciamento de Embedded Items e automações estruturadas das habilidades DA de Hrodnar.

## Organização

- `contos-de-mar-e-terra.mjs`: ponto de entrada e hook de inicialização.
- `module/data-models/`: Data Models por tipo e registro dos modelos.
- `module/sheets/`: sheets V2 e registro no Foundry.
- `module/config/`: constantes estáveis do sistema.
- `module/services/character-calculations.mjs`: cálculos derivados e validação da distribuição de perícias.
- `templates/`: templates Handlebars das sheets.
- `styles/`: CSS prefixado com `cmet-`.
- `lang/`: traduções, atualmente `pt-BR`.
- `packs/habilidades-da.db`: fonte JSONL versionada dos dez Items do compêndio DA.
- `packs/habilidades-da/`: compêndio LevelDB gerado para Foundry VTT v14; a declaração em `system.json` aponta para este diretório.
- `services/` e `helpers/`: reservados para serviços e helpers quando houver uso real.

Para adicionar um Data Model, crie o arquivo no subdiretório do documento, importe-o em `module/data-models/register.mjs` e registre-o em `CONFIG.Actor.dataModels` ou `CONFIG.Item.dataModels`. Sheets novas ficam em `module/sheets/`; regras de domínio devem ser extraídas para serviços próprios quando forem implementadas.

## Compêndios

O compêndio `habilidades-da` mantém o JSON Lines como fonte de dados revisável e gera o diretório LevelDB compatível com Foundry v14. Cada linha é um Item `habilidadeDa`; a identificação de personagem fica em `system.associatedCharacter` e em `flags.contos-de-mar-e-terra.packCharacter`. Packs declarados como `Item` não devem conter registros de pasta. Para reconstruir o banco, execute `npm install` e `npm run generate:pack:habilidades-da`; o gerador valida a fonte e escreve as chaves `!items!<id>` no diretório LevelDB. Não editar o LevelDB manualmente nem importar os Items automaticamente para Actors.

### Migração de Vitória do Mais Forte

Ao iniciar o sistema, `migrateAbilityDaCopies()` procura cópias embedded de Vitória do Mais Forte em Actors do mundo e tokens da cena. Se encontrar o subefeito `hrodnar-desafio-ancestral` ainda baseado somente em uma operação `manual`, substitui apenas essa operação pelas operações estruturadas de Carapaça (4) e aumento de tamanho, preservando os demais campos personalizados e o estado `active`. Cópias ativas são reconciliadas após a atualização; nenhuma arma ou outro Item é alterado.

Para uma atualização manual, faça backup do mundo, recarregue o sistema e confirme na ficha do personagem que o subefeito contém `armorBonus` e `sizeIncrease`. Não exclua e recrie o Item: isso preserva o UUID, configurações personalizadas e o estado ativo.
