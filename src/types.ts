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
  ability?: string;
  /** A homebrew character whose icon is still on its way. */
  loading?: boolean;
  /** What the engine caches the icon's shapes by, when it isn't the id (a token whose icon can change). */
  iconKey?: string;
}

// ---------------------------------------------------------------- the design (spec)

/** A token's shape: a coin, a card (Clocktower's Grimoire) or a condition ring (see SHAPE_FEATURES). */
export type TokenShape = "coin" | "card" | "ring";
export type TokenStyle = "classic" | "window" | "solo" | "double";
export type MagnetKind = "none" | "pocket" | "hidden";
/** The face parts that can stand out of the coin. */
export type ReliefPart = "text" | "frame" | "icon";
export type Relief = Record<ReliefPart, boolean>;

export interface SpecColours {
  base: ColourRef;
  front: ColourRef;
  frame: ColourRef;
  back: ColourRef;
}

/** How a token is designed (DEFAULT_SPEC has every field). Lengths are in mm. */
export interface TokenSpec {
  style: TokenStyle;
  relief: Relief;
  reliefHeight: number;
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
  /** A BACK_STYLES id (or one of the older "seal", "clock", "rings", "name"). */
  back: string;
  customSvg: string | null;
  colours: SpecColours;
  /** The token's own icon, in place of its character's. */
  icon?: TokenIcon;
  /** A condition ring's miniature base (mm): "25", "32" or "40" (see ringSize). */
  ringBase: string;
  /** A reminder's coin size, when the character style sets one. */
  reminderDiameter?: number;
  /** The template (PRESETS) the set's design is, or a token's own design started from. */
  preset?: string;
  fromPreset?: string;
  /** Older window designs (normalizeSpec turns them into relief). */
  windowFinish?: string;
  windowDepth?: number;
}

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
export type PartName = "base" | "front" | "icon" | "frame" | "back";
/** The parts with a filament of their own; `hole` is the preview's pocket. */
export type PartColours = Record<PartName, Hex> & { hole?: Hex };

export interface TokenParts {
  base: BufferGeometry | null;
  front: BufferGeometry | null;
  icon?: BufferGeometry | null;
  frame: BufferGeometry | null;
  back: BufferGeometry | null;
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
  card?: boolean;
  foot?: Foot;
}

// ---------------------------------------------------------------- the print queue and plates

/** What a token's design is, apart from the set's: its own text, design, feminine name or icon. */
export interface TokenOverride {
  text?: string | null;
  spec?: TokenSpec;
  fem?: boolean;
  icon?: TokenIcon;
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
