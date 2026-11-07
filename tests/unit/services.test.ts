import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../src/types.ts";

const put = vi.fn(async () => {});
const list = vi.fn(async (): Promise<Role[]> => []);
vi.mock("../../src/adapters/firebase-roles.ts", () => ({ firestoreRoles: { list, put } }));
const { isAdmin, ADMIN_UID, roleId, loadRoles, uploadRoles } = await import("../../src/services.ts");

beforeEach(() => { put.mockClear(); list.mockReset(); });

describe("the admin", () => {
  it("is the admin's account", () => {
    expect(isAdmin({ uid: ADMIN_UID, email: null, photoURL: null })).toBe(true);
    expect(isAdmin({ uid: "someone", email: "someone@example.com", photoURL: null })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("the role library", () => {
  it("makes ids without accents or symbols", () => {
    expect(roleId("Night Watch")).toBe("night_watch");
    expect(roleId("Rope-Maker")).toBe("rope_maker");
    expect(roleId("Él  Niño!")).toBe("el_nino");
  });
  it("loads by team order, then by name", async () => {
    const r = (en: string, team: string) => ({ id: roleId(en), en, team, edition: "" }) as Role;
    list.mockResolvedValue([r("Warlord", "demon"), r("Weaver", "townsfolk"), r("Baker", "townsfolk"), r("Hermit", "outsider")]);
    expect((await loadRoles()).map((x) => x.en)).toEqual(["Baker", "Weaver", "Hermit", "Warlord"]);
  });
  it("uploads only valid roles, each with its fields filled", async () => {
    const n = await uploadRoles([{ en: "Baker", team: "townsfolk", body: "<path/>" }, { en: "No body", team: "townsfolk" }, null as never]);
    expect(n).toBe(1);
    const [[written]] = put.mock.calls as unknown as [[Role[]]];
    expect(written).toEqual([{ id: "baker", en: "Baker", es: "Baker", names: {}, fem: {}, team: "townsfolk", edition: "", reminders: { en: [], es: [] }, icon: "", author: "", g: "", body: "<path/>" }]);
  });
  it("refuses a file with no valid roles", async () => {
    await expect(uploadRoles([{ en: "x" }])).rejects.toThrow(/expected format/);
    expect(put).not.toHaveBeenCalled();
  });
});
