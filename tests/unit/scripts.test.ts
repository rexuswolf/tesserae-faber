import { describe, expect, it } from "vitest";
import { idKey, readLink, scriptLink } from "../../src/scripts.ts";

describe("script links", () => {
  it("round-trip a name and its characters", () => {
    const link = scriptLink({ name: "Trouble & Brewing", ids: ["washerwoman", "imp"] }, "https://x/botc");
    expect(readLink(link.slice(link.indexOf("#")))).toEqual({ name: "Trouble & Brewing", ids: ["washerwoman", "imp"] });
  });
  it("read ids as the Script Tool's, without repeats", () => expect(readLink("#s=X~Fortune_Teller.fortuneteller.imp")?.ids).toEqual(["fortuneteller", "imp"]));
  it("are null when the fragment isn't a script", () => {
    for (const h of ["", "#x", "#s=name~", "#s=a~%E0%A4%A"]) expect(readLink(h)).toBeNull();
  });
  it("idKey: lower case, no accents, letters and digits", () => expect(idKey("Pit-Hág 2")).toBe("pithag2"));
});
