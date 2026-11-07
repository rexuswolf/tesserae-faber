// Test adapter for RoleLibraryPort (src/ports.ts): the local library file; uploads go nowhere.
const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const firestoreRoles = {
  async list() {
    const roles = await (await fetch("/admin-data/roles_game_icons.json")).json();
    return roles.map((r) => ({ id: roleId(r.en), ...r }));
  },
  put: async () => {},
};
