import { describe, expect, it } from "vitest";
import { AMS_SLOTS, FILAMENT_SLOTS, perPlate, planPlates, purge, slotOf, towerSpot } from "../../src/bambu/plates.ts";

const [black, white, red, blue, gold, green] = ["#1d1c21", "#ece9e2", "#b3191e", "#2f86e0", "#c9a227", "#3f9651"];
const token = (colours: string[]) => ({ spec: { diameter: 45 }, parts: { base: true, front: true, icon: true, frame: true }, colours: { base: colours[0], front: colours[1], icon: colours[2], frame: colours[3] } });

describe("filaments", () => {
  it("finds a colour's slot, in any case", () => expect(slotOf("#1D1C21" as never)).toBe(0));
  it("prints a colour of your own in the filament most like it", () => {
    expect(FILAMENT_SLOTS[slotOf("#ff2020" as never)].name).toBe("Red");
    expect(FILAMENT_SLOTS[slotOf("#f5d000" as never)].name).toBe("Yellow");
    expect(FILAMENT_SLOTS[slotOf("#101010" as never)].name).toBe("Black");
    expect(FILAMENT_SLOTS[slotOf("#6020a0" as never)].name).toBe("Purple");
  });
  it("refuses what isn't a colour", () => expect(() => slotOf("team" as never)).toThrow());
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
  it("fits nine 45 mm coins on the A1 mini, its tower narrowed into the strip beside them", () => {
    const items = Array.from({ length: 17 }, (_, i) => ({ title: `t${i}`, group: "Good", token: token([black, blue, blue, blue]) }));
    const plan = planPlates(items as never, { bed: 180 });
    expect(plan.plates.map((p) => p.items.length)).toEqual([9, 8]);
    expect(plan.tower).toBe(20);
    // the tower (its brim 3.2 mm round it) right of the third column and on the bed
    const { x } = towerSpot(45, 180, plan.tower);
    expect(x - 3.2).toBeGreaterThan(8 + 3 * 45 + 2 * 3);
    expect(x + plan.tower + 3.2).toBeLessThan(180);
  });
  it("keeps Bambu's 35 mm tower, and a token's place for it, where a narrower one wouldn't save a plate", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ title: `t${i}`, group: "Good", token: token([black, blue, blue, blue]) }));
    const plan = planPlates(items as never);
    expect(plan.tower).toBe(35);
    expect(plan.plates[0].capacity).toBe(24);
  });
});


describe("coins with sides on a plate", () => {
  it("are spaced by the circle round their corners, so neighbours never meet", () => {
    const items = (outline?: string) => Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, group: "g", token: { ...token([black, white, red, gold]), spec: { diameter: 40, ...(outline ? { outline } : {}) } } }));
    const round = planPlates(items() as never).plates[0], square = planPlates(items("square") as never).plates[0];
    expect(round.diameter).toBe(40);
    expect(square.diameter).toBeGreaterThan(40);   // its corners reach past 40 mm
    expect(square.capacity).toBeLessThanOrEqual(round.capacity);
  });
});
