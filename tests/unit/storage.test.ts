import { describe, expect, it } from "vitest";
import { memoryStore, webStorage } from "../../src/adapters/web-storage.ts";
import { readJSON, writeJSON } from "../../src/services.ts";

describe("webStorage", () => {
  it("never throws when the browser blocks its storage", () => {
    const blocked = webStorage(() => { throw new DOMException("blocked", "SecurityError"); });
    expect(blocked.get("k")).toBeNull();
    expect(blocked.set("k", "v")).toBe(false);
    expect(() => blocked.remove("k")).not.toThrow();
    expect(blocked.keys()).toEqual([]);
  });
  it("says false when a value doesn't fit", () => {
    const full = webStorage(() => ({ setItem() { throw new DOMException("full", "QuotaExceededError"); } }) as unknown as Storage);
    expect(full.set("k", "v")).toBe(false);
  });
});

describe("readJSON / writeJSON", () => {
  it("round-trips a value", () => {
    const s = memoryStore();
    expect(writeJSON("k", { a: [1, 2] }, s)).toBe(true);
    expect(readJSON("k", null, s)).toEqual({ a: [1, 2] });
  });
  it("gives the fallback when there's nothing, null or not JSON", () => {
    const s = memoryStore();
    s.set("bad", "{nope"); s.set("null", "null");
    for (const k of ["missing", "bad", "null"]) expect(readJSON(k, 7, s)).toBe(7);
  });
  it("says false for a value that can't be written", () => {
    const loop: Record<string, unknown> = {}; loop.self = loop;
    expect(writeJSON("k", loop, memoryStore())).toBe(false);
  });
});
