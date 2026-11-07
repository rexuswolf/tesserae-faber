import { describe, expect, it } from "vitest";
import { AMS_SLOTS, FILAMENT_SLOTS, perPlate, planPlates, purge, slotOf } from "../../src/bambu/plates.ts";

const [black, white, red, blue, gold, green] = ["#1d1c21", "#ece9e2", "#b3191e", "#2f86e0", "#c9a227", "#3f9651"];
const token = (colours: string[]) => ({ spec: { diameter: 45 }, parts: { base: true, front: true, icon: true, frame: true }, colours: { base: colours[0], front: colours[1], icon: colours[2], frame: colours[3] } });

describe("filaments", () => {
  it("finds a colour's slot, in any case", () => expect(slotOf("#1D1C21" as never)).toBe(0));
  it("refuses a colour it has no filament for", () => expect(() => slotOf("#123456" as never)).toThrow());
  it("purges nothing for the same filament, and within Bambu's cap otherwise", () => {
    for (let a = 0; a < FILAMENT_SLOTS.length; a++) for (let b = 0; b < FILAMENT_SLOTS.length; b++) {
      const p = purge(a, b);
      if (a === b) expect(p).toBe(0); else { expect(p).toBeGreaterThan(0); expect(p).toBeLessThanOrEqual(900); }
    }
  });
});

describe("planPlates", () => {
  it("places every token once, one group per plate, within capacity and the AMS's filaments", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      title: `t${i}`, group: i % 3 ? "Good" : "Evil",
      token: token(i % 2 ? [black, white, red, gold] : [black, blue, green, gold]),
    }));
    const { plates } = planPlates(items as never);
    expect(plates.flatMap((p) => p.items).length).toBe(items.length);
    for (const p of plates) {
      expect(p.items.every((it) => it.group === p.group)).toBe(true);
      expect(p.items.length).toBeLessThanOrEqual(perPlate(45));
      expect(p.slots.size).toBeLessThanOrEqual(AMS_SLOTS);
    }
  });
  it("refuses a token needing more filaments than the AMS holds", () => {
    const t = { ...token([black, white, red, blue]), parts: { base: true, front: true, icon: true, frame: true, back: true }, colours: { ...token([black, white, red, blue]).colours, back: gold } };
    expect(() => planPlates([{ title: "x", group: "Good", token: t }] as never)).toThrow(/filaments/);
  });
});
