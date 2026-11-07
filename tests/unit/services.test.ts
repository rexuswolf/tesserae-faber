import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../src/types.ts";

const put = vi.fn(async () => {});
const list = vi.fn(async (): Promise<Role[]> => []);
vi.mock("../../src/adapters/firebase-roles.ts", () => ({ firestoreRoles: { list, put } }));
const { isAdmin, roleId, loadRoles, uploadRoles } = await import("../../src/services.ts");

beforeEach(() => { put.mockClear(); list.mockReset(); });

describe("the admin", () => {
  it("is the admin's address, in any case", () => {
    expect(isAdmin({ email: "FrancisJMP99@gmail.com", photoURL: null })).toBe(true);
    expect(isAdmin({ email: "someone@example.com", photoURL: null })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("the role library", () => {
  it("makes ids without accents or symbols", () => {
    expect(roleId("Fortune Teller")).toBe("fortune_teller");
    expect(roleId("Pit-Hag")).toBe("pit_hag");
    expect(roleId("Él  Niño!")).toBe("el_nino");
  });
  it("loads by team order, then by name", async () => {
    const r = (en: string, team: string) => ({ id: roleId(en), en, team, edition: "" }) as Role;
    list.mockResolvedValue([r("Imp", "demon"), r("Washerwoman", "townsfolk"), r("Chef", "townsfolk"), r("Drunk", "outsider")]);
    expect((await loadRoles()).map((x) => x.en)).toEqual(["Chef", "Washerwoman", "Drunk", "Imp"]);
  });
  it("uploads only valid roles, each with its fields filled", async () => {
    const n = await uploadRoles([{ en: "Chef", team: "townsfolk", body: "<path/>" }, { en: "No body", team: "townsfolk" }, null as never]);
    expect(n).toBe(1);
    const [[written]] = put.mock.calls as unknown as [[Role[]]];
    expect(written).toEqual([{ id: "chef", en: "Chef", es: "Chef", names: {}, fem: {}, team: "townsfolk", edition: "", reminders: { en: [], es: [] }, icon: "", author: "", g: "", body: "<path/>" }]);
  });
  it("refuses a file with no valid roles", async () => {
    await expect(uploadRoles([{ en: "x" }])).rejects.toThrow(/expected format/);
    expect(put).not.toHaveBeenCalled();
  });
});
