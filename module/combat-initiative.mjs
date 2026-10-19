const { Combat } = foundry.documents;

export class CmetCombat extends Combat {
  _sortCombatants(a, b) {
    const ia = Number.isFinite(Number(a.initiative)) ? Number(a.initiative) : Infinity;
    const ib = Number.isFinite(Number(b.initiative)) ? Number(b.initiative) : Infinity;
    return (ia - ib) || (a.id > b.id ? 1 : -1);
  }
}

export function registerCombatInitiative() {
  CONFIG.Combat.documentClass = CmetCombat;
  CONFIG.Combat.initiative.formula = "1d100";
}
