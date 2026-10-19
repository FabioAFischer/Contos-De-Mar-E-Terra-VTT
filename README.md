# Contos de Mar e Terra

Fundação inicial do sistema **Contos de Mar e Terra**, em desenvolvimento para Foundry Virtual Tabletop v14.368.

## Estado atual

O sistema possui o Actor `personagem` e os Items `equipamento`, `habilidade` e `magia`. O Data Model do personagem já organiza identidade, progressão, atributos, perícias, recursos, ações, moeda e biografia. A ficha V2 possui abas, cálculos derivados, validação básica de perícias e gerenciamento de Embedded Items. Combate, rolagens, progressão automática, árvore de habilidades e automações ainda não fazem parte desta etapa.

## Organização

- `contos-de-mar-e-terra.mjs`: ponto de entrada e hook de inicialização.
- `module/data-models/`: Data Models por tipo e registro dos modelos.
- `module/sheets/`: sheets V2 e registro no Foundry.
- `module/config/`: constantes estáveis do sistema.
- `module/services/character-calculations.mjs`: cálculos derivados e validação da distribuição de perícias.
- `templates/`: templates Handlebars das sheets.
- `styles/`: CSS prefixado com `cmet-`.
- `lang/`: traduções, atualmente `pt-BR`.
- `services/` e `helpers/`: reservados para serviços e helpers quando houver uso real.

Para adicionar um Data Model, crie o arquivo no subdiretório do documento, importe-o em `module/data-models/register.mjs` e registre-o em `CONFIG.Actor.dataModels` ou `CONFIG.Item.dataModels`. Sheets novas ficam em `module/sheets/`; regras de domínio devem ser extraídas para serviços próprios quando forem implementadas.
