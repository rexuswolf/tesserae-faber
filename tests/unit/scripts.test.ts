import { describe, expect, it } from "vitest";
import { idKey, readLink, scriptLink } from "../../src/scripts.ts";

describe("script links", () => {
  it("round-trip a name and its characters", () => {
    const link = scriptLink({ name: "Bread & Circuses", ids: ["baker", "warlord"] }, "https://x/botc");
    expect(readLink(link.slice(link.indexOf("#")))).toEqual({ name: "Bread & Circuses", ids: ["baker", "warlord"] });
  });
  it("read ids as the Script Tool's, without repeats", () => expect(readLink("#s=X~Night_Watch.nightwatch.warlord")?.ids).toEqual(["nightwatch", "warlord"]));
  it("are null when the fragment isn't a script", () => {
    for (const h of ["", "#x", "#s=name~", "#s=a~%E0%A4%A"]) expect(readLink(h)).toBeNull();
  });
  it("idKey: lower case, no accents, letters and digits", () => expect(idKey("Rope-Máker 2")).toBe("ropemaker2"));
});
