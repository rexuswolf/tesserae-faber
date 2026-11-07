// The app's entry: every part of it (src/app/), each wiring its own part of the page as it loads;
// the app itself starts when sign-in answers (boot.ts).
import "./handoff.ts";   // first: a browser arriving from midnight-mint.web.app brings its keepings
import "./app/context.ts";
import "./app/looks.ts";
import "./app/designs.ts";
import "./app/tokens.ts";
import "./app/language.ts";
import "./app/token-language.ts";
import "./app/boot.ts";
import "./app/sheet.ts";
import "./app/scripts-ui.ts";
import "./app/workshop.ts";
import "./app/design-sheet.ts";
import "./app/wiring.ts";
import "./app/queue.ts";
import "./app/guide.ts";
import "./app/credits.ts";
import "./app/admin.ts";
import "./app/taller.ts";
import "./app/creator.ts";
import { OWN, OWN_ID } from "./collection.ts";
import { keepGateLook } from "./app/context.ts";
import { applyOwnTheme, applyOwnBrand } from "./app/creator.ts";

if (OWN && OWN_ID) { applyOwnTheme(); applyOwnBrand(); keepGateLook(); }   // before the loading screen shows: it wears the collection's colours and mark too
