export function calculateSkillPool(attributeValue) { return 100 + (Number(attributeValue) || 0) * 10; }
export function calculateSkillsTotal(skills, skillKeys = Object.keys(skills ?? {})) {
  return skillKeys.reduce((total, key) => total + Math.max(10, Number(skills?.[key]) || 10), 0);
}
export function calculateSkillTotals(attribute, skillKeys) {
  const skills = attribute?.skills ?? {};
  const skillsTotal = calculateSkillsTotal(skills, skillKeys);
  const poolTotal = calculateSkillPool(attribute?.value);
  return { poolTotal, skillsTotal, remainingPoints: poolTotal - skillsTotal };
}
export function calculateRemainingSkillPoints(attributeValue, skills, skillKeys = Object.keys(skills ?? {})) {
  return calculateSkillPool(attributeValue) - calculateSkillsTotal(skills, skillKeys);
}
export function calculateMaxHealth(attributes) { return 10 + (Number(attributes?.fisico?.value) || 0) + (Number(attributes?.mental?.value) || 0); }
export function calculateMaxMana(attributes) { return 10 + (Number(attributes?.magia?.value) || 0) + (Number(attributes?.mental?.value) || 0); }
export function calculateMaxSanity(attributes) { return 10 + (Number(attributes?.social?.value) || 0) + (Number(attributes?.mental?.value) || 0); }
export function calculateMovement(attributes) { return Math.ceil(((Number(attributes?.combate?.value) || 0) + (Number(attributes?.fisico?.value) || 0)) / 5); }
export function calculateCharacterDerivedData(system) {
  const attributes = system?.attributes ?? {};
  return { vidaMax: calculateMaxHealth(attributes), manaMax: calculateMaxMana(attributes), sanidadeMax: calculateMaxSanity(attributes), movimento: calculateMovement(attributes) };
}
export function validateSkillChange(system, attributeKey, skillKey, value, skillKeys) {
  const nextSystem = foundry.utils.deepClone(system);
  nextSystem.attributes[attributeKey].skills[skillKey] = Math.max(10, Number(value) || 10);
  const totals = calculateSkillTotals(nextSystem.attributes[attributeKey], skillKeys);
  return { ...totals, valid: totals.remainingPoints >= 0, value: nextSystem.attributes[attributeKey].skills[skillKey] };
}
