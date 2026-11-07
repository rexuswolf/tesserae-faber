// The shapes shared across the app: what a character is, how a token is designed (its spec),
// what the engine builds from them, and what the print queue, plates and estimates pass around.
import type { BufferGeometry, Shape } from "three";
import type { Font } from "three/addons/loaders/FontLoader.js";

/** An "#rrggbb" colour. */
export type Hex = string;
/** A part's colour in a spec: a filament's hex, or "team" for the character's team colour. */
export type ColourRef = Hex | "team";

export type Team = "townsfolk" | "outsider" | "minion" | "demon" | "traveller" | "fabled" | "loric" | "info";

// ---------------------------------------------------------------- characters

/** A token's own icon, or a library one: SVG markup placed in the engine's icon square by `g`. */
export interface TokenIcon {
  id: string;
  /** "upload", "game-icons" or "script" (a script's image, traced or as it came). */
  source?: string;
  name?: string;
  author?: string;
  /** The picture a script linked, kept so the script can be exported as it came. */
  url?: string;
  /** How it was traced (icons.ts's TRACE_VERSION), for icons traced from a picture. */
  traced?: number;
  g: string;
  body: string;
}

/**
 * A character from the catalog (the role library), a script's own (homebrew) character, or
 * one of the grimoire's info tokens (kind "info", drawn as a card); a collection's condition rings are kind "ring".
 */
export interface Role {
  id: string;
  /** The English name; `es` the Spanish (the library's own), `names[translation id]` the rest. */
  en: string;
  es?: string;
  names?: Record<string, string>;
  /** Feminine names, by translation id, where a translation has one. */
  fem?: Record<string, string>;
  team: Team;
  /** Its own colour, for "team" in its design, over its team's (a collection's token can have one). */
  colour?: Hex;
  /** An edition id ("tb", "grimoire"…), or for a homebrew character its script's view ("s:<id>"). */
  edition: string;
  /** Reminder words by translation id. */
  reminders?: Record<string, string[]>;
  /** The icon: vector markup (`body`) or traced path data (`d`), placed in the icon square by `g`. */
  body?: string;
  d?: string[];
  g?: string;
  /** The icon's name and author on game-icons.net (credited). */
  icon?: string;
  author?: string;
  kind?: "homebrew" | "info" | "ring";
  /** A homebrew character's script name (its edition, on the Edition back). */
  editionName?: string;
  /** A collection's token: the collection's name, for a back that prints it (TokenSpec.backText). */
  collectionName?: string;
  ability?: string;
  /** A homebrew character whose icon is still on its way. */
  loading?: boolean;
  /** What the engine caches the icon's shapes by, when it isn't the id (a token whose icon can change). */
  iconKey?: string;
  /** A two-state token's other state, drawn on its back like a second front (a coin's only: see SHAPE_FEATURES). */
  flip?: RoleFlip;
}

/** A two-state token's other state: its name (as a character's: English, Spanish, the rest by
 *  language) and its icon (markup placed by `g`, credited like a character's when it's game-icons.net's). */
export interface RoleFlip {
  en: string;
  es?: string;
  names?: Record<string, string>;
  body: string;
  g: string;
  icon?: string;
  author?: string;
  /** What the engine caches its icon's shapes by. */
  iconKey: string;
}

// ---------------------------------------------------------------- the design (spec)

/** A token's shape: a coin, a card (Clocktower's Grimoire) or a condition ring (see SHAPE_FEATURES). */
export type TokenShape = "coin" | "card" | "ring";
export type TokenStyle = "classic" | "window" | "solo" | "double";
/** A coin's side edge. */
export type CoinEdge = "smooth" | "reeded" | "segmented";
export type MagnetKind = "none" | "pocket" | "hidden";
/** The face parts that can stand out of the coin. */
export type ReliefPart = "text" | "frame" | "icon";
export type Relief = Record<ReliefPart, boolean>;

/**
 * What a coin's back is: "design", one of the back designs (BACK_STYLES); "match", a face like the
 * front (its layout, text, icon and frame), so the coin reads the same whichever way up; "own", a
 * face with a layout, text, icon and frame of its own (BackFace). A two-state token's back is
 * always a face, its other state: drawn like the front with "design" and "match", with the back's
 * own settings with "own".
 */
export type BackMode = "design" | "match" | "own";
/** The fields that make a face's look (layout, name, icon, frame): a back face of its own sets them apart from the front's. */
export type FaceField = "style" | "textSize" | "spacing" | "maxArc" | "iconScale" | "frame" | "frameWidth";
/** A coin's back face (see BackMode): its own look ("own" only), its relief and its colours (both
 *  "match" and "own"); anything left out is the front's. */
export interface BackFace extends Partial<Pick<TokenSpec, FaceField>> {
  relief?: Partial<Relief>;
  colours?: Partial<Pick<SpecColours, "front" | "frame">>;
}

export interface SpecColours {
  base: ColourRef;
  front: ColourRef;
  frame: ColourRef;
  back: ColourRef;
}

/** The mark between repeats of a condition ring's name. */
export type RingSeparator = "dot" | "diamond" | "star" | "none";

/** How a token is designed (DEFAULT_SPEC has every field). Lengths are in mm. */
export interface TokenSpec {
  style: TokenStyle;
  relief: Relief;
  reliefHeight: number;
  /** Raised parts' walls slope in by this much at the top (mm; unset or 0: straight walls). */
  reliefBevel?: number;
  magnet: MagnetKind;
  /** "<diameter>x<thickness>", mm. */
  magnetSize: string;
  /** The translation the token is printed in ("en", "es", "es-castelgard"…). */
  lang: string;
  diameter: number;
  height: number;
  depth: number;
  iconScale: number;
  iconOffsetY: number;
  textSize: number;
  spacing: number;
  margin: number;
  maxArc: number;
  /** A FRAME_STYLES id. */
  frame: string;
  frameWidth: number;
  /** A BACK_STYLES id (or one of the older "seal", "clock", "rings", "name"); shapeSpec makes it
   *  FACE_BACK when the back is a face. */
  back: string;
  /** What the back is: a design, or a face (see BackMode). */
  backMode: BackMode;
  /** The back face's own settings. */
  backFace?: BackFace;
  customSvg: string | null;
  colours: SpecColours;
  /** The token's own icon, in place of its character's. */
  icon?: TokenIcon;
  /** A condition ring's miniature base (mm): "25", "32" or "40" (see ringSize). */
  ringBase: string;
  /** A condition ring's mark between repeats of its name (RING_SEPARATORS): a dot, a diamond, a star or nothing. */
  separator: RingSeparator;
  /** A reminder's coin size, when the character style sets one. */
  reminderDiameter?: number;
  /** A linked token's (a reminder's, see reminderSpec): its own token, without its character's other state. */
  linked?: boolean;
  /** A reminder's word sized by its length and its icon fitted round it (AUTO_TEXT): true for the
   *  defaults, or some of them; unset, the word is textSize and the icon iconScale, as always. */
  autoText?: boolean | Partial<AutoText>;
  /** The collection's style (StyleDef) a style is, or started from: what it resets to. */
  preset?: string;
  fromPreset?: string;
  /** A background pattern on the front, behind the icon, the name and the frame (see PatternSpec); none when unset. */
  frontPattern?: PatternSpec | null;
  /** A background pattern on the back, behind its design. */
  backPattern?: PatternSpec | null;
  /** A coin's side edge (canto): smooth when unset; "reeded", ridges all round like a real coin;
   *  "segmented", reeded sections alternating with smooth ones. See COIN_EDGES. */
  edge?: CoinEdge;
  /** The name a back design prints (Edition, medallion, shield): unset, the edition's (a collection's
   *  token: its catalog's); "collection", the collection's own name (a token outside one: as unset). */
  backText?: "collection";
  /** Older window designs (normalizeSpec turns them into relief). */
  windowFinish?: string;
  windowDepth?: number;
}

/** A background pattern's id (the engine's PATTERNS): thin lines in a harlequin grid, or a checkerboard of filled rhombi. */
export type PatternId = "rombos-lineas" | "damero-rombos" | "escamas" | "escamas-relleno" | "rayas" | "cuartelado" | "damero";
/**
 * A background pattern: it runs behind everything on the face, continuous, and the icon, the name
 * and the frame (on the back, its design) sit on it, each with a halo of coin colour round it
 * (`halo`, mm, at least 0.6) so they read. It is a flush inlay like the rest of the face, in a colour
 * the token already has (it goes into that part: never a filament of its own). `scale` is a rhombus's
 * width (mm; a scale's width for "escamas", the stripes' period for "rayas", a square's side for
 * "damero"; "cuartelado", the face quartered, has none), `line` the line's width ("rombos-lineas",
 * "escamas") or the gap between cells ("damero-rombos", "escamas-relleno", "rayas", "cuartelado", "damero"),
 * at least 0.6 mm. `colour` picks the front's part: "frame", "front" (the name's), "team" (whichever
 * is the team colour) or a hex one of them has; a back pattern is always the back's colour.
 */
export interface PatternSpec { id: PatternId; scale?: number; line?: number; halo?: number; colour?: ColourRef | "frame" | "front" | "back" }

/** Auto text (see AUTO_TEXT in the engine): the word's tallest (mm, by its ink), the arc a short word
 *  fills (°), the icon's largest (as iconScale) and, if given, the widest arc for a long word (°). */
export interface AutoText { cap: number; arc: number; icon: number; maxArc?: number }

/** A spec as it may come in: any field left out takes DEFAULT_SPEC's. */
export type SpecInput = Partial<Omit<TokenSpec, "colours">> & {
  colours?: Partial<SpecColours>;
};

// ---------------------------------------------------------------- the engine

export interface Glyph {
  shapes: Shape[];
  advance: number;
  center: number;
  /** Outline points in font units about the advance centre (cached). */
  points?: [number, number][];
}

/** The loaded library: roles, the lettering font and caches (see loadLibrary). */
export interface Library {
  roles: Role[];
  font: Font;
  capHeight: number;
  sealSvg: string | null;
  seal: Shape[];
  glyphs: Map<string, Glyph>;
  icons: Map<string, Shape[]>;
  glyphPaths?: Map<string, string>;
}

/** The parts a token is built from. Geometry is null for parts the design leaves out. */
/** A back that is a face (a two-state token's, or one that matches the front or has its own) is drawn like a
 *  front: `back` its name (and window), `backIcon` and `backFrame`. */
export type PartName = "base" | "front" | "icon" | "frame" | "back" | "backIcon" | "backFrame";
/** The parts with a filament of their own; `hole` is the preview's pocket. */
export type PartColours = Record<PartName, Hex> & { hole?: Hex };

export interface TokenParts {
  base: BufferGeometry | null;
  front: BufferGeometry | null;
  icon?: BufferGeometry | null;
  frame: BufferGeometry | null;
  back: BufferGeometry | null;
  backIcon?: BufferGeometry | null;
  backFrame?: BufferGeometry | null;
  /** The magnet hole, a negative part for the slicer. */
  magnet?: BufferGeometry | null;
  /** Preview only: the open pocket, the magnet and its cavity's outline. */
  hole?: BufferGeometry | null;
  magnetBody?: BufferGeometry;
  cavity?: BufferGeometry;
}

/** Where the magnet goes (see magnetLayout); z in model coordinates, the back face at 0. */
export interface MagnetLayout {
  kind: "pocket" | "hidden";
  md: number;
  mt: number;
  radius: number;
  faceUp: boolean;
  z0: number;
  z1: number;
  minHeight: number;
  /** Hidden magnets: the print height to pause at. */
  pauseZ?: number;
}

/** How the name came out: its letters' height, how much it shrank, the arc it spans (null off a coin's curve). */
export interface NameInfo {
  letterHeight: number;
  scale: number;
  total: number | null;
  lines?: number;
  /** A condition ring's: how many times the name goes round. */
  repeats?: number;
}

/** A card's footprint (info tokens), mm. */
export interface Foot {
  w: number;
  h: number;
}

/** Each face part's volume standing out of the coin (mm³). */
export type Above = Partial<Record<PartName, number>>;

/** A token as buildToken makes it. */
export interface Token {
  parts: TokenParts;
  colours: PartColours;
  name: NameInfo;
  /** The spec as built: defaults filled in, a thicker coin for a magnet, the depth that fits. */
  spec: TokenSpec;
  magnet: MagnetLayout | null;
  /** The deepest inlay that fits, when the spec asked for more; null when it fit. */
  depthClamped: number | null;
  above?: Above;
  /** A back face's: how its name came out (a two-state token's, its other state's). */
  backName?: NameInfo;
  card?: boolean;
  foot?: Foot;
}

// ---------------------------------------------------------------- the print queue and plates

/**
 * A token's look as changed from its design's, field by field ("colours" colour by colour). A null
 * field is one its design has and the token doesn't: it takes the default (DEFAULT_SPEC's).
 */
export type LookChanges = { [K in Exclude<keyof TokenSpec, "colours">]?: TokenSpec[K] | null } & { colours?: Partial<SpecColours> };

/**
 * One of your designs, made in the Taller: a named look for one shape (a TokenSpec without
 * content: no name, icon or other state), kept once for every collection. Colours that are a
 * group's say "team", so it fits any collection. `from` is the design it was made from (a
 * collection's, as it was then), which its fields can be set back to.
 */
export interface MyDesign { id: string; name: string; spec: TokenSpec; from?: { name: string; spec: TokenSpec } }

/**
 * A collection's style as kept before designs were yours (49eeec0): each collection had its own,
 * the first of a shape the one its tokens used. `tpl` is the collection's style (StyleDef) it's
 * named after while it has no name of its own. Read once, to make your designs and the defaults.
 */
export interface Style { id: string; name?: string; tpl?: string; spec: TokenSpec }

/**
 * What a token has of its own. Content: its printed text, feminine name and icon. Its design, when
 * not the one it has by default (a reference: "c:<id>" one of the collection's, "u:<id>" one of
 * yours), and its own changes to that design's look. `spec` is how older versions kept a token's
 * whole design: read once, it becomes `look`.
 */
export interface TokenOverride {
  text?: string | null;
  fem?: boolean;
  icon?: TokenIcon;
  style?: string;
  look?: LookChanges;
  spec?: TokenSpec;
}

/** One copy of a picked token, as the sheet would draw it now. */
export interface QueueEntry {
  roleId: string;
  /** The reminder's index, null for the character's own token. */
  ri: number | null;
  reminder: string | null;
  text: string | null;
  /** The token has its own changes. */
  custom: boolean;
  spec: TokenSpec;
  /** The token key ("c:imp", "r:imp:0") and, one per copy, that key with "#<copy>". */
  pick?: string;
  key?: string;
}

/** The least a plate plan needs of a token: its size, which parts it has and their colours. */
export interface PlanToken {
  spec: Pick<TokenSpec, "diameter">;
  /** A condition ring's hole (mm across): it takes up its outer diameter on the plate, but has no body there. */
  hole?: number;
  parts: Partial<Record<PartName, unknown>>;
  colours: Record<PartName, Hex>;
  foot?: Foot;
}

/** A token going onto a plate: `group` keeps plates apart (Good, Evil…), `title` names it. */
export interface PlateItem<T extends PlanToken = PlanToken> {
  token: T;
  title: string;
  group: string;
}

export interface Plate<I extends PlateItem = PlateItem> {
  name: string;
  group: string;
  diameter: number;
  foot: number | Foot;
  capacity: number;
  items: (I & { slots: Set<number> })[];
  /** Filament slots the plate uses. */
  slots: Set<number>;
}

export interface PlatePlan<I extends PlateItem = PlateItem> {
  plates: Plate<I>[];
  bed: number;
}

/** A token's part volumes (mm³) for the estimates; `above` the relief's share. */
export type Volumes = Partial<Record<PartName | "magnet" | "hole" | "magnetBody" | "cavity", number>> & {
  base: number;
  above?: Above;
};
