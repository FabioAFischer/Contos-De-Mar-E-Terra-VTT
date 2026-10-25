export const CREATURE_SIZE_OPTIONS = Object.freeze([
  { key: "miudo", label: "CMET.CreatureSize.Miudo" },
  { key: "pequeno", label: "CMET.CreatureSize.Pequeno" },
  { key: "medio", label: "CMET.CreatureSize.Medio" },
  { key: "grande", label: "CMET.CreatureSize.Grande" },
  { key: "enorme", label: "CMET.CreatureSize.Enorme" },
  { key: "colossal", label: "CMET.CreatureSize.Colossal" }
]);

export const CREATURE_SIZE_STAGES = Object.freeze(CREATURE_SIZE_OPTIONS.map(({ key }) => key));
