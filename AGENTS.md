
# AGENTS.md

# Contos de Mar e Terra — Diretrizes de Desenvolvimento

Este arquivo define as regras técnicas, arquiteturais e de domínio que devem ser seguidas por qualquer agente de IA ou desenvolvedor que trabalhe neste projeto.

O sistema é desenvolvido para **Foundry Virtual Tabletop v14.368**.

Antes de realizar qualquer alteração relevante no projeto, leia este arquivo integralmente.

As regras aqui descritas têm prioridade sobre convenções genéricas, suposições sobre outros sistemas de RPG ou padrões herdados de versões antigas do Foundry.

---

# 1. Objetivo do projeto

**Contos de Mar e Terra** é um sistema próprio de RPG implementado como um Game System para Foundry VTT.

O projeto deve priorizar:

- manutenção simples;
- separação clara de responsabilidades;
- reutilização de código;
- compatibilidade com Foundry VTT v14;
- facilidade de evolução das regras;
- preservação de dados existentes;
- boa experiência de usuário;
- arquitetura compreensível por outros desenvolvedores.

Não implementar regras que ainda não tenham sido definidas.

Quando uma regra estiver ausente ou ambígua, mantenha a estrutura preparada para evolução futura, mas não invente comportamento.

---

# 2. Ambiente alvo

Versão principal:

```text
Foundry Virtual Tabletop v14.368
Tecnologias principais:

JavaScript ES Modules
Handlebars
CSS
Foundry VTT API
ApplicationV2
TypeDataModel
O projeto NÃO deve adicionar frameworks frontend sem necessidade.

Não adicionar:

React
Vue
Svelte
Angular
Bootstrap
Tailwind
jQuery adicional
O sistema deve utilizar os recursos nativos do Foundry sempre que possível.

3. Estrutura esperada do projeto
A estrutura geral deve permanecer organizada aproximadamente desta forma:

contos-de-mar-e-terra/
│
├── AGENTS.md
├── README.md
├── system.json
├── contos-de-mar-e-terra.mjs
│
├── module/
│   │
│   ├── config/
│   │   ├── constants.mjs
│   │   ├── character-config.mjs
│   │   ├── weapon-config.mjs
│   │   └── ...
│   │
│   ├── data-models/
│   │   │
│   │   ├── actor/
│   │   │   └── personagem-data.mjs
│   │   │
│   │   ├── item/
│   │   │   ├── equipamento-data.mjs
│   │   │   ├── habilidade-data.mjs
│   │   │   ├── magia-data.mjs
│   │   │   ├── arma-data.mjs
│   │   │   └── ...
│   │   │
│   │   └── register.mjs
│   │
│   ├── sheets/
│   │   │
│   │   ├── actor/
│   │   │   └── personagem-sheet.mjs
│   │   │
│   │   ├── item/
│   │   │   ├── item-sheet.mjs
│   │   │   ├── arma-sheet.mjs
│   │   │   └── ...
│   │   │
│   │   └── register.mjs
│   │
│   ├── services/
│   │   ├── character-calculations.mjs
│   │   └── ...
│   │
│   ├── helpers/
│   │   └── ...
│   │
│   └── hooks/
│       └── ...
│
├── templates/
│   │
│   ├── actor/
│   │   └── personagem-sheet.hbs
│   │
│   └── item/
│       ├── item-sheet.hbs
│       ├── arma-sheet.hbs
│       └── ...
│
├── styles/
│   └── contos-de-mar-e-terra.css
│
├── lang/
│   ├── pt-BR.json
│   └── en.json
│
└── packs/
Não criar arquivos duplicados como:

personagem-sheet-new.mjs
personagem-sheet-v2.mjs
personagem-sheet-fixed.mjs
arma-sheet-final.mjs
Corrigir os arquivos oficiais existentes.

4. Separação de responsabilidades
Cada camada possui uma responsabilidade específica.

Data Models
Responsáveis por:

estrutura persistida;
tipos de campos;
defaults;
validações estruturais;
organização dos dados.
Não devem conter lógica visual.

Config
Responsável por definições estáticas e registries reutilizáveis.

Exemplos:

atributos
perícias
qualidades
tipos de dano
características de armas
categorias de equipamentos
Configuração é a fonte de verdade para valores enumerados.

Evitar repetir arrays equivalentes em vários arquivos.

Services
Responsáveis por regras de domínio reutilizáveis.

Exemplo:

calculateSkillPool(attributeValue)
calculateSkillsTotal(skills)
calculateMovement(attributes)
calculateMaxHealth(attributes)

Services devem, sempre que possível, ser funções puras.

Não acessar DOM dentro de services.

Não usar:

document.querySelector(...)

em lógica de domínio.

Sheets
Responsáveis por:

preparar contexto;
coordenar interação;
responder a eventos da interface;
chamar services;
atualizar documentos Foundry;
preservar estado visual da interface.
Evitar colocar fórmulas complexas diretamente na Sheet.

Templates
Templates devem cuidar principalmente da apresentação.

Não implementar regras de negócio complexas em Handlebars.

Não duplicar cálculos no template.

CSS
Responsável somente por apresentação.

Não depender de CSS para garantir regras mecânicas.

Exemplo:

<input min="10">

não substitui validação de perícia mínima na lógica.

5. APIs do Foundry
O projeto utiliza Foundry VTT v14.

Utilize APIs modernas sempre que disponíveis.

6. Imports do Foundry
NUNCA importar namespaces internos do Foundry como módulos ES.

ERRADO:

import { HandlebarsApplicationMixin } from "foundry.applications.api";
import { ActorSheetV2 } from "foundry.applications.sheets";
import { ItemSheetV2 } from "foundry.applications.sheets";
import { TypeDataModel } from "foundry.abstract";
import { NumberField } from "foundry.data.fields";

Esses nomes não são módulos ESM importáveis pelo navegador.

CORRETO:

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;

const { TypeDataModel } = foundry.abstract;

const {
  NumberField,
  StringField,
  BooleanField,
  SchemaField,
  ArrayField,
  HTMLField
} = foundry.data.fields;

Imports ES devem ser utilizados para arquivos internos do sistema:

import { PersonagemData } from "./actor/personagem-data.mjs";
import { PersonagemSheet } from "./actor/personagem-sheet.mjs";

Regra:

API do Foundry
→ objeto global foundry

Arquivos CMET
→ import/export ES Modules
7. Registro de Data Models
Registrar Data Models durante o ciclo apropriado de inicialização.

Exemplo conceitual:

CONFIG.Actor.dataModels.personagem = PersonagemData;

CONFIG.Item.dataModels.equipamento = EquipamentoData;
CONFIG.Item.dataModels.habilidade = HabilidadeData;
CONFIG.Item.dataModels.magia = MagiaData;
CONFIG.Item.dataModels.arma = ArmaData;

Não registrar tipos inexistentes.

Não sobrescrever registries de outros documentos.

8. Registro de Sheets
Usar:

foundry.applications.apps.DocumentSheetConfig

A assinatura utilizada deve ser posicional.

Exemplo:

DocumentSheetConfig.registerSheet(
  foundry.documents.Actor,
  game.system.id,
  PersonagemSheet,
  {
    types: ["personagem"],
    makeDefault: true,
    label: "CMET.Sheets.Personagem"
  }
);

Para Items:

DocumentSheetConfig.registerSheet(
  foundry.documents.Item,
  game.system.id,
  ArmaSheet,
  {
    types: ["arma"],
    makeDefault: true,
    label: "CMET.Sheets.Arma"
  }
);

Não utilizar:

DocumentSheetConfig.registerSheet({
  ...
});

Não registrar uma Sheet específica como default para tipos aos quais ela não pertence.

9. Ciclo de inicialização
O entry point deve permanecer simples.

Exemplo conceitual:

Hooks.once("init", () => {
  registerDataModels();
  registerSheets();

  CONFIG.contosDeMarETerra = {
    systemId: game.system.id
  };
});

Evitar executar APIs que dependam da configuração completa do Foundry cedo demais.

Em particular, não utilizar durante init apenas para diagnóstico:

DocumentSheetConfig.getSheetClassesForSubType(...)

se essa API depender de estruturas que ainda não foram inicializadas.

Diagnósticos que precisem do Foundry completamente inicializado devem acontecer em:

Hooks.once("ready", ...)

quando apropriado.

10. ApplicationV2
Actors e Items devem utilizar as APIs modernas.

Exemplo:

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class PersonagemSheet
  extends HandlebarsApplicationMixin(ActorSheetV2) {
}

Para Items:

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class ArmaSheet
  extends HandlebarsApplicationMixin(ItemSheetV2) {
}

Evitar arquitetura legacy baseada em ActorSheet/ItemSheet antigo quando a API V2 atender à necessidade.

11. PARTS
Se uma Sheet utiliza static PARTS, cada part deve possuir uma responsabilidade clara.

Exemplo:

static PARTS = {
  main: {
    template: "systems/contos-de-mar-e-terra/templates/actor/personagem-sheet.hbs"
  }
};

Não fragmentar uma Sheet em dezenas de PARTS sem necessidade.

Cada template/part deve possuir estrutura HTML válida.

12. Tabs da ApplicationV2
Quando uma Sheet possuir abas, utilizar preferencialmente a infraestrutura nativa da ApplicationV2.

Definir:

static TABS

Exemplo conceitual:

static TABS = {
  primary: {
    tabs: [
      {
        id: "configuracao",
        label: "CMET.Navigation.Configuration"
      },
      {
        id: "descricao",
        label: "CMET.Navigation.Description"
      }
    ],
    initial: "configuracao"
  }
};

Os IDs devem ser consistentes entre JavaScript e Handlebars.

Se o ID é:

descricao
não usar:

description
em outro ponto.

13. HTML das tabs
O grupo deve corresponder ao grupo definido em static TABS.

Exemplo:

<nav class="tabs" data-group="primary">

  <button
    type="button"
    data-group="primary"
    data-tab="configuracao"
  >
    Configuração
  </button>

  <button
    type="button"
    data-group="primary"
    data-tab="descricao"
  >
    Descrição
  </button>

</nav>

Conteúdo:

<section
  class="tab"
  data-group="primary"
  data-tab="configuracao"
>
</section>

<section
  class="tab"
  data-group="primary"
  data-tab="descricao"
>
</section>

Quando o template utilizar os dados preparados pelo Foundry, usar também as classes apropriadas provenientes do contexto das tabs.

14. Botões dentro de forms
Sheets são frequentemente renderizadas como <form>.

Botões que não devem enviar o formulário precisam declarar:

type="button"

Especialmente:

tabs
botões de abrir Item
botões auxiliares
controles de UI
Não depender do comportamento padrão do HTML.

15. Estado visual da interface
Scroll e aba ativa são estado de interface.

Eles NÃO pertencem ao Actor ou Item.

Nunca criar:

actor.system.ui.scroll
actor.system.activeTab
item.system.scrollPosition
A Sheet deve preservar esses dados localmente.

16. Preservação de scroll
Updates no documento podem provocar rerender.

Um rerender NÃO deve jogar o usuário de volta para o topo quando ele estiver editando uma área longa.

Sheets relevantes devem preservar:

aba ativa
scrollTop
Quando houver várias abas, preferir:

scrollByTab = {
  atributos: 0,
  equipamentos: 0,
  habilidades: 0,
  magias: 0,
  biografia: 0
};

Esse estado existe apenas durante a vida da aplicação.

17. Scroll da PersonagemSheet
A PersonagemSheet deve manter:

Header
Recursos
Navegação
visíveis.

Somente a região de conteúdo das abas deve rolar.

Evitar scroll independente em cada card de atributo.

18. Scroll da ArmaSheet
Foi confirmado no DOM do Foundry v14 que a raiz da ArmaSheet possui:

<form class="
  application
  sheet
  cmet-sheet
  cmet-item-sheet
  cmet-weapon-sheet
">

E que:

.window-content
é a região correta para scroll da ficha atual.

Utilizar:

.application.cmet-weapon-sheet .window-content {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

Não resolver scroll utilizando alturas mágicas como:

height: 500px;
max-height: 520px;

19. CSS e DOM real
Antes de criar ou corrigir CSS, verificar as classes que realmente existem no DOM.

Não basear uma arquitetura visual inteira em uma classe hipotética.

Erro já identificado anteriormente:

.cmet-character-sheet {
  ...
}

quando .cmet-character-sheet não existia no DOM.

A raiz real da PersonagemSheet possui:

cmet-actor-sheet
A raiz real da ArmaSheet possui:

cmet-weapon-sheet
Preferir seletores como:

.application.cmet-actor-sheet ...
.application.cmet-weapon-sheet ...

20. CSS escopado
Não alterar globalmente componentes do Foundry.

ERRADO:

.window-content {
  background: ...
}

input {
  background: ...
}

CORRETO:

.application.cmet-actor-sheet .window-content {
  ...
}

.application.cmet-weapon-sheet input[type="number"] {
  ...
}

21. Inputs
Não criar seletores genéricos que deformem checkboxes.

Evitar:

.cmet-weapon-sheet input {
  width: 100%;
}

Preferir:

.application.cmet-weapon-sheet input[type="text"],
.application.cmet-weapon-sheet input[type="number"] {
  ...
}

E tratar checkbox separadamente:

.application.cmet-weapon-sheet input[type="checkbox"] {
  width: auto;
  flex: 0 0 auto;
}

22. Paleta CMET
A identidade visual utiliza custom properties.

Base atual:

.application.cmet-sheet {
  --cmet-bg: #11171a;

  --cmet-surface: #192226;
  --cmet-surface-alt: #202c31;
  --cmet-surface-raised: #28373d;

  --cmet-border: #3b5057;
  --cmet-border-soft: #2b3a40;

  --cmet-text: #e7e2d8;
  --cmet-text-muted: #9faeb2;

  --cmet-accent: #4f8f92;
  --cmet-accent-bright: #69b4b3;
  --cmet-accent-dark: #326568;

  --cmet-gold: #b99a5e;

  --cmet-danger: #b85f5f;
  --cmet-warning: #c49a52;
  --cmet-success: #669b76;
}

Pode haver pequenos ajustes de contraste, mas preservar a identidade geral:

grafite
azul-petróleo
verde-marinho
bege claro
dourado discreto
Evitar retornar ao padrão:

preto + roxo + laranja
do tema default do Foundry.

23. CSS variables
As variáveis devem estar declaradas em um elemento que realmente exista e seja ancestral dos componentes.

Não basta declarar variáveis sem utilizá-las.

Exemplo:

.application.cmet-weapon-sheet input[type="number"] {
  background: var(--cmet-surface-raised);
  color: var(--cmet-text);
  border: 1px solid var(--cmet-border);
}

24. i18n
Todo texto visível e reutilizável deve utilizar internacionalização quando apropriado.

Namespace principal:

CMET
Exemplo:

CMET.Fields.Race
CMET.Navigation.Attributes
CMET.Attributes.Fisico
CMET.Sheets.Arma
O sistema também deve definir labels de tipos esperados pelo Foundry:

TYPES.Actor.personagem
TYPES.Item.arma
25. Idiomas
Manter:

lang/pt-BR.json
lang/en.json
No manifesto:

"languages": [
  {
    "lang": "pt-BR",
    "name": "Português (Brasil)",
    "path": "lang/pt-BR.json"
  },
  {
    "lang": "en",
    "name": "English",
    "path": "lang/en.json"
  }
]

Ao adicionar uma chave utilizada pela interface, adicioná-la em ambos os arquivos.

Não deixar chaves como:

CMET.Fields.X
TYPES.Item.arma
visíveis ao jogador.

26. Fonte única de verdade
Conceitos enumerados devem possuir uma única configuração canônica.

Exemplos:

atributos
perícias
qualidades de itens
tipos de dano
características de armas
categorias de armas
Não manter listas independentes em:

Data Model
Sheet
template
service
quando todas representam o mesmo conceito.

27. Actor personagem
O tipo principal de personagem jogável é:

Actor.type = "personagem"
Não existe necessidade de classe obrigatória.

O sistema atual utiliza progressão por habilidades, não arquitetura rígida baseada em classes.

Não criar:

system.classe
como requisito estrutural.

28. Nome e imagem do Actor
Utilizar propriedades nativas do Foundry:

actor.name
actor.img
Não duplicar em:

system.identity.name
system.identity.image
29. Estrutura conceitual do personagem
A estrutura persistida deve seguir aproximadamente:

system: {
  identity: {
    raca: "",
    idade: null
  },

  progression: {
    nivel: 1,
    experiencia: 0
  },

  attributes: {
    fisico: {
      value: 0,
      skills: {}
    },

    combate: {
      value: 0,
      skills: {}
    },

    magia: {
      value: 0,
      skills: {}
    },

    mental: {
      value: 0,
      skills: {}
    },

    social: {
      value: 0,
      skills: {}
    }
  },

  resources: {
    vida: {
      value: 10
    },

    mana: {
      value: 10
    },

    sanidade: {
      value: 10
    }
  },

  actions: {
    max: 1
  },

  currency: {
    gyllen: 0
  },

  biography: {
    historia: "",
    personalidade: "",
    ideais: "",
    defeitos: ""
  }
}

30. Atributos
Existem exatamente cinco atributos:

Físico
Combate
Magia
Mental
Social
Chaves canônicas:

fisico
combate
magia
mental
social
Valor inicial:

0
31. Atributos não são roláveis
REGRA IMPORTANTE:

Atributos não representam testes normais.

Não implementar:

rollAttribute
Teste de Físico
Teste de Combate
Teste de Mental
Atributos existem principalmente para:

gerar pontos de perícia
participar de cálculos derivados
servir de referência para regras específicas
As rolagens comuns do sistema acontecem pelas perícias.

32. Perícias
Cada atributo possui exatamente 10 perícias.

Toda perícia começa em:

10
33. Perícias de Físico
fortitude
empurrar
correr
escalar
esconder
escutar
folego
nadar
sentir
ver
34. Perícias de Combate
arcos
armasDeHaste
armasDeImpacto
arremessar
bloquear
chicotes
corpoACorpo
espadas
esquivar
laminas
35. Perícias de Mental
alquimia
cartografia
biologia
gastronomia
artesanato
historia
investigar
linguas
lockPick
medicina
36. Perícias de Social
acalmar
disfarce
distrair
intimidar
intuir
mentir
persuadir
provocar
seduzir
vontade
37. Perícias de Magia
abjuracao
adivinhacao
encantamento
evocacao
ilusao
invocacao
necromancia
restauracao
rituais
transmutacao
38. Pool de perícias
Cada uma das 10 perícias começa em 10.

Portanto:

baseTotal = 100
Cada ponto de atributo concede:

10 pontos adicionais
Fórmula:

poolTotal = 100 + (attributeValue * 10)
Exemplo:

Físico = 11

pool = 100 + 110
pool = 210
39. Cálculos do pool
Calcular dinamicamente:

poolTotal
skillsTotal
remainingPoints
Fórmulas:

poolTotal =
100 + atributo * 10

skillsTotal =
soma das 10 perícias

remainingPoints =
poolTotal - skillsTotal
Esses valores são derivados.

Não persistir no Actor.

40. Limite mínimo das perícias
Uma perícia não pode normalmente ficar abaixo de:

10
Não depender somente de:

min="10"

Validar também na lógica.

41. Aumento acima do pool
Se aumentar uma perícia fizer:

skillsTotal > poolTotal
rejeitar o aumento.

Exibir notificação localizada.

Exemplo:

Você não possui pontos suficientes para aumentar esta perícia.
42. Redução de atributo
Uma redução de atributo pode tornar:

remainingPoints < 0
Nesse caso:

NÃO reduzir perícias automaticamente.

NÃO apagar dados.

NÃO escolher quais perícias devem perder pontos.

Permitir o atributo diminuir.

Marcar o grupo como inválido.

Enquanto inválido:

permitir reduzir perícias
impedir aumentar perícias
O jogador corrige a distribuição manualmente.

43. Recursos derivados
Fórmulas atuais:

Vida máxima =
10 + Físico + Mental
Mana máxima =
10 + Magia + Mental
Sanidade máxima =
10 + Social + Mental
Movimento =
ceil((Combate + Físico) / 5)
Esses máximos não devem ser persistidos quando puderem ser calculados.

44. Recursos atuais
Persistir:

system.resources.vida.value
system.resources.mana.value
system.resources.sanidade.value
Não permitir normalmente:

value < 0
ou:

value > max
Se o máximo diminuir abaixo do valor atual, limitar o atual ao novo máximo sem criar loops de render/update.

45. Ações
Persistir:

system.actions.max
Ainda NÃO existe fórmula automática definida para ações máximas.

Não inventar uma.

46. Navegação da PersonagemSheet
Não existe aba:

Geral
A navegação atual é:

Atributos
Equipamentos
Habilidades
Magias
Biografia
A aba inicial é:

Atributos
47. Embedded Items
Itens pertencentes a personagens devem utilizar o sistema nativo do Foundry.

Usar:

actor.items
Não criar:

actor.system.weapons
actor.system.spells
actor.system.abilities
actor.system.inventory
para armazenar documentos que devem ser Items.

Fluxo esperado:

Item Directory / Compendium
        ↓
drag-and-drop
        ↓
Embedded Item no Actor
48. Tipos atuais de Item
Tipos principais previstos atualmente:

equipamento
habilidade
magia
arma
Não converter automaticamente um tipo existente para outro sem necessidade.

49. Nome e imagem de Items
Usar propriedades nativas:

item.name
item.img
Não criar:

system.name
system.image
50. Item arma
O tipo:

Item.type = "arma"
representa armas utilizáveis por personagens.

A arma deve armazenar dados estruturados para permitir automações futuras.

Nesta fase, armazenar os dados não implica automaticamente executar seus efeitos.

51. Configuração central das armas
Manter configuração central para:

qualidades
perícias de combate
tipos de dano
características
Preferencialmente:

module/config/weapon-config.mjs
ou arquivo equivalente da camada config.

52. Qualidade da arma
Valores atuais:

inicial
sucata
danificado
desgastado
normal
polido
excepcional
obraPrima
Default:

normal
Qualidade é diferente de raridade.

Não criar campo de raridade automaticamente.

53. Perícia de combate da arma
Campo:

system.combatSkill
Determina qual perícia será futuramente utilizada para atacar.

Exemplo:

Espada Bastarda
combatSkill = espadas
Não confundir nome da arma com categoria mecânica.

54. Perícias ofensivas de arma
Utilizar chaves canônicas existentes.

Exemplos atualmente aplicáveis:

arcos
armasDeHaste
armasDeImpacto
arremessar
chicotes
corpoACorpo
espadas
laminas
Não criar cópias alternativas das mesmas perícias.

55. Dano da arma
Estrutura:

damage: {
  formula: "",
  types: {}
}

formula armazena valores como:

2d8
1d12
2d10
Não executar Roll automaticamente apenas porque existe fórmula.

56. Tipos de dano
Uma arma pode possuir múltiplos tipos simultaneamente.

Tipos atuais:

cortante
impacto
perfurante

cortanteMagico
impactoMagico
perfuranteMagico

fogo
raio
frio
radiante
necrotico
veneno
Preferir estrutura explícita e estável.

Não armazenar:

"Cortante, Perfurante"
como string.

57. Características das armas
Características atuais:

umaMao
duasMaos
pontoFraco
impacto
armaDeHaste
alcance
versatil
arremessavel
puxar
retaliar
punhal
sequencial
golpeDeRetaguarda
recarregar
executar
armaDeManobra
cortarProjeteis
Não persistir labels traduzidos.

Labels vêm do i18n/config.

58. Estrutura das características
Características devem ser objetos estruturados.

Exemplo:

characteristics: {
  umaMao: {
    enabled: false
  },

  alcance: {
    enabled: false,
    spaces: 0
  },

  sequencial: {
    enabled: false,
    damageFormula: ""
  }
}

Não armazenar características como uma string:

"Uma mão, Alcance, Executar"
59. Características parametrizadas
REGRA GERAL:

Se uma característica possui configuração própria, utilizar:

{
  enabled,
  ...parameters
}

Isso deve ser preferido a criar campos paralelos desconectados.

Exemplo:

alcance: {
  enabled: true,
  spaces: 10
}

60. Preservação de parâmetros
Desmarcar uma característica NÃO deve apagar seus parâmetros.

Exemplo:

Alcance:
enabled = true
spaces = 10
Ao desmarcar:

enabled = false
spaces = 10
Ao marcar novamente:

enabled = true
spaces = 10
Essa regra evita perda acidental de configuração.

61. Característica Alcance
Decisão atual:

Alcance é uma característica da arma.

Não existe mais necessidade de uma seção visual separada:

Arma à distância
A estrutura principal é:

characteristics: {
  alcance: {
    enabled: false,
    spaces: 0
  }
}

Interface:

☐ Alcance
Quando marcada:

☑ Alcance

Espaços de alcance
[10] espaços
62. Dados antigos de alcance
Versões anteriores da arma utilizaram:

system.range.ranged
system.range.max
Esses campos não devem ser utilizados como fonte principal nas novas implementações.

Se existirem dados antigos:

range.ranged = true
range.max = 10
e ainda não existir configuração nova, migrar para:

characteristics.alcance.enabled = true
characteristics.alcance.spaces = 10
Não perder dados existentes.

63. Característica Sequencial
Estrutura prevista:

sequencial: {
  enabled: false,
  damageFormula: ""
}

Exemplo:

Sequencial (1d8)
Não executar automaticamente nesta etapa.

64. Característica Executar
Estrutura prevista:

executar: {
  enabled: false,
  damageFormula: ""
}

Não executar automaticamente nesta etapa.

65. Puxar
A documentação possui descrições duplicadas ou parcialmente divergentes para Puxar.

Utilizar uma única chave canônica:

puxar
Não criar:

puxar1
puxar2
A regra exata poderá ser refinada posteriormente.

66. Prender e Pancada
Existem referências a:

Prender
Pancada
em armas já documentadas, mas essas características ainda não possuem definição formal consolidada.

Não inventar regras.

Manter TODO técnico até a regra ser definida.

67. Arma equipada
Campo:

system.equipped
Boolean.

Nesta fase representa apenas estado.

Não aplicar automaticamente limites de:

mãos
slots
arma principal
arma secundária
até essas regras serem definidas.

68. Descrição da arma
Campo:

system.description
Não duplicar descrição.

A ArmaSheet possui navegação dedicada:

Configuração
Descrição
A aba Descrição deve utilizar a maior parte do espaço disponível para edição do texto.

Não colocar uma textarea pequena no final da configuração.

69. Tabs da ArmaSheet
A ArmaSheet deve possuir:

Configuração
Descrição
A aba inicial:

Configuração
Utilizar o sistema nativo de tabs da ApplicationV2.

Não criar um sistema paralelo de tabs sem necessidade.

70. Configuração da ArmaSheet
A aba Configuração contém:

imagem
nome
qualidade
perícia de combate
equipada
dano
tipos de dano
características
Não colocar descrição nessa aba.

71. Descrição da ArmaSheet
A aba Descrição contém somente conteúdo descritivo e elementos diretamente relacionados à descrição.

A área deve:

usar toda a largura disponível
crescer verticalmente
continuar editável
persistir no Item
72. Migrações
Quando uma estrutura persistida mudar, preservar dados antigos.

Não simplesmente remover um campo e esperar que Items existentes se adaptem.

Migrações devem:

ser explícitas
não sobrescrever dados novos
não causar loops
não executar update infinito em render
não apagar informação silenciosamente
73. Não migrar durante render sem controle
Evitar:

_prepareContext() {
  this.item.update(...);
}

como solução genérica de migração.

_prepareContext deve preferencialmente preparar contexto.

Updates durante render podem causar ciclos difíceis de controlar.

Criar mecanismo de migração explícito ou atualização protegida quando necessário.

74. Compatibilidade de dados
Ao alterar um Data Model já utilizado:

verificar Items existentes
definir defaults
definir estratégia de migração
testar reload
testar Embedded Items
Nunca assumir que todos os documentos serão recém-criados.

75. Single source of truth
Nunca criar duas fontes principais para o mesmo conceito.

Exemplo incorreto:

range.max
characteristics.alcance.spaces
sendo ambos utilizados simultaneamente como alcance atual da arma.

Após migração, deve existir uma fonte canônica.

76. Nomes técnicos
Chaves persistidas devem:

não usar espaços
não usar acentos
não usar labels traduzidos
usar camelCase quando apropriado
Exemplo:

armasDeHaste
obraPrima
cortanteMagico
umaMao
duasMaos
golpeDeRetaguarda
cortarProjeteis
77. Métodos reutilizáveis
Se uma lógica aparece em mais de um local, extrair para helper/service apropriado.

Evitar duplicação como:

// personagem-sheet.mjs
calcularMovimento(...)

// outro arquivo
calcularMovimentoNovamente(...)

Criar uma única implementação.

78. Funções pequenas e focadas
Métodos devem possuir responsabilidade clara.

Evitar funções que:

calculam regras
alteram DOM
fazem update
criam notificações
formatam texto
tudo ao mesmo tempo.

Separar quando isso melhorar a compreensão e reutilização.

79. Nomes de métodos
Preferir nomes que indiquem intenção.

Bom:

calculateSkillPool()
calculateMovement()
prepareAttributeGroups()
validateSkillIncrease()
restoreScrollPosition()

Evitar:

doStuff()
process()
handleData()
calculateEverything()

80. Document updates
Utilizar APIs do Foundry para persistência.

Não alterar objetos internos diretamente esperando que o Foundry persista.

Preferir:

actor.update(...)
item.update(...)

quando uma alteração persistida for necessária.

81. Dados derivados
Sempre que um valor puder ser calculado de maneira confiável e barata, preferir derivá-lo em vez de persistir cópias.

Exemplos:

Vida máxima
Mana máxima
Sanidade máxima
Movimento
poolTotal
skillsTotal
remainingPoints
Evitar inconsistência entre valor salvo e valor calculável.

82. Configuração vs dado persistido
Registry/configuração define:

quais opções existem
labels
tipos de parâmetros
metadados de UI
O Item/Actor persiste:

estado escolhido
valores
parâmetros
Exemplo:

Registry:

alcance: {
  label: "CMET.WeaponCharacteristics.Range",
  parameters: {
    spaces: {
      type: "number"
    }
  }
}

Item:

alcance: {
  enabled: true,
  spaces: 10
}

Não persistir label dentro do Item.

83. Templates gerados por config
Quando vários elementos possuem estrutura equivalente, preferir preparar uma coleção no contexto e iterar no template.

Exemplo:

characteristics: [
  {
    key: "umaMao",
    label: "...",
    enabled: true
  },
  {
    key: "alcance",
    label: "...",
    enabled: true,
    parameters: [...]
  }
]

Em vez de escrever manualmente cada característica em HTML.

84. Contexto de apresentação
Objetos preparados para Handlebars podem possuir dados derivados adicionais.

Exemplo:

{
  key,
  label,
  value,
  valid,
  cssClass
}

Esses objetos não precisam ser persistidos.

Não confundir contexto visual com Data Model.

85. Descrição e Rich Text
Não introduzir um editor complexo apenas por estética.

Se o Foundry já oferecer infraestrutura apropriada e o projeto estiver preparado para ela, pode ser utilizada.

Caso contrário, um campo textual editável e bem dimensionado é aceitável.

A prioridade é:

edição confiável
persistência
boa área de trabalho
86. Logs
Logs temporários de diagnóstico devem ser removidos após resolver o problema.

Evitar deixar:

console.log(CONFIG.Actor.dataModels);
console.log(this.actor);
console.log(context);

em cada render.

Pode existir um log simples de inicialização durante desenvolvimento:

CMET | Contos de Mar e Terra inicializado
87. Diagnóstico antes de corrigir
Quando houver bug de UI ou CSS:

inspecionar DOM real;
identificar elemento responsável;
verificar Computed Styles;
verificar seletor vencedor;
confirmar causa;
alterar código.
Não ficar aumentando especificidade ou adicionando !important sem diagnóstico.

88. !important
Evitar !important.

Pode ser usado quando:

uma regra do core Foundry precisa ser sobrescrita
e a especificidade normal não é suficiente ou não é apropriada
Quando utilizado, documentar o motivo.

Não usar como solução genérica para CSS mal estruturado.

89. UX
Rerenders devem preservar contexto do usuário sempre que possível.

Evitar:

voltar ao topo
voltar à primeira tab
fechar seção aberta
apagar valores condicionais
por causa de uma edição simples.

90. Campos condicionais
Quando um checkbox habilita parâmetros adicionais:

desmarcar deve esconder
marcar deve mostrar
Mas, por padrão:

desmarcar NÃO apaga parâmetros
Exemplo:

Alcance = false
spaces continua salvo
91. Estados visuais
Estados como:

válido
inválido
pontos disponíveis
todos distribuídos
excedido
não devem depender somente de cor.

Utilizar também:

texto
ícone
label
para comunicar estado.

92. Não inventar regras
Esta é uma das regras mais importantes deste arquivo.

Se uma mecânica ainda não foi definida, NÃO assumir comportamento baseado em:

D&D
Pathfinder
Call of Cthulhu
Tormenta
outros sistemas
Exemplo:

se não existe regra de peso para armas, não criar:

peso
encumbrance
capacidade de carga
sem solicitação.

93. Não adicionar campos "porque podem ser úteis"
Não criar automaticamente:

peso
preço
raridade
durabilidade
munição
slots
categoria comercial
fabricante
material
só porque são comuns em outros sistemas.

Adicionar dados quando houver necessidade real ou regra definida.

94. Não avançar etapas
Quando a tarefa solicitar somente modelagem, não implementar automação.

Exemplo:

se a tarefa é criar o Item arma, não implementar automaticamente:

ataque
dano no alvo
crítico
condições
chat card
munição
Active Effects
A implementação deve respeitar o escopo solicitado.

95. Validação
Ao implementar mudanças relevantes, validar:

sintaxe dos .mjs
JSON válido
imports relativos
exports
paths case-sensitive
manifest
i18n
Data Models
registro de Sheets
persistência após reload
Linux diferencia maiúsculas e minúsculas.

96. Testes manuais mínimos para Sheets
Sempre testar:

abrir
editar
fechar
abrir novamente
recarregar Foundry
redimensionar janela
scroll
tabs
Para Embedded Items:

criar no diretório
arrastar para Actor
editar cópia embedded
confirmar que o Item original não mudou
97. Testes de DOM quando necessários
Quando um bug depender do Foundry renderizado, utilizar DevTools para confirmar o DOM real.

Exemplos úteis:

document.querySelector(".cmet-actor-sheet")
document.querySelector(".cmet-weapon-sheet")

E:

getComputedStyle(element)

Não deduzir cegamente como ApplicationV2 renderizou a estrutura.

98. Código morto
Após refatoração:

remover CSS não utilizado
remover imports não utilizados
remover helpers obsoletos
remover listeners duplicados
remover logs temporários
Não manter duas implementações concorrentes da mesma funcionalidade.

99. Eventos
Não registrar listeners globais repetidamente a cada render.

Evitar:

window.addEventListener(...)
document.addEventListener(...)

dentro de _onRender sem estratégia de cleanup.

Listeners vinculados ao HTML substituído pelo próprio render são preferíveis quando apropriado.

100. Segurança de updates
Evitar loops:

render
→ update
→ render
→ update
Especialmente em:

_prepareContext
_onRender
_preparePartContext
Updates automáticos devem possuir condição clara para acontecer apenas quando necessário.

101. Configuração futura
A arquitetura deve permanecer preparada para novos tipos de Item, como:

armadura
foco
consumível
sem transformar arma-sheet.mjs em uma Sheet genérica gigante.

Reutilizar infraestrutura compartilhada quando fizer sentido, mas permitir especialização por tipo.

102. Item Sheets extensas
Items com muitos dados devem ser organizados por responsabilidade.

Preferir tabs a um formulário vertical interminável.

Exemplo atual da arma:

Configuração
Descrição
Novas tabs só devem ser adicionadas quando houver quantidade suficiente de conteúdo para justificar.

103. Referências externas
Outros sistemas Foundry, como D&D5e, podem ser usados como referência para:

UX
organização de Sheets
arquitetura de aplicações
padrões de interação
Não copiar regras de RPG desses sistemas.

Não criar dependência do sistema D&D5e.

Não copiar código sem compreender como ele funciona e se é compatível com o CMET.

104. Comentários e TODOs
TODOs devem ser objetivos.

Bom:

// TODO: Formalizar a regra de "Prender" quando a mecânica for definida.

Evitar:

// TODO arrumar depois

Não deixar comentários descrevendo código óbvio.

105. Critério de conclusão
Uma tarefa só está concluída quando:

o comportamento solicitado funciona
os dados persistem
não existem erros novos no console
o código respeita a arquitetura
não existe duplicação desnecessária
não foram inventadas regras
UI continua utilizável
reload não quebra os dados
Mudança visual só está concluída quando realmente aparece na aplicação renderizada.

106. Relatório do agente
Ao concluir uma tarefa relevante, informar de forma objetiva:

arquivos criados
arquivos alterados
causa do problema, quando houver
decisões técnicas tomadas
testes executados
limitações
TODOs restantes
Não afirmar que algo foi testado no Foundry se apenas foi validado estaticamente.

Distinguir:

validado por código
de:

precisa de teste manual no Foundry
107. Regra final
Antes de implementar qualquer solução:

entenda a estrutura existente
reuse o que já existe
identifique a fonte de verdade
confirme a API correta
preserve dados
não invente regra
A prioridade do projeto é manter uma base consistente que possa crescer sem exigir reescritas constantes.