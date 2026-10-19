export function getActorUpdateAuthority(actor) {
  if (!actor) return null;

  const activeUsers = Array.from(game.users ?? []).filter((user) => user.active);
  const owners = activeUsers
    .filter((user) => !user.isGM && actor.testUserPermission(user, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (owners[0]) return owners[0];

  return activeUsers
    .filter((user) => user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export function isAuthoritativeGM() {
  const activeGMs = Array.from(game.users ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id));
  return activeGMs[0]?.id === game.user?.id;
}
