// Types for the libraries that ship without them.

/** imagetracerjs (loaded only to trace a homebrew picture): the one call we make. */
declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(imgd: ImageData, options?: Record<string, unknown>): string;
  };
  export default ImageTracer;
}

declare const __BUILD__: string;

/** clipper-lib (Clipper 1, Angus Johnson): offsetting and joining polygons, for a piece's outline. The calls we make. */
declare module "clipper-lib" {
  interface IntPoint { X: number; Y: number }
  type Path = IntPoint[];
  type Paths = Path[];
  const ClipperLib: {
    Clipper: { new (): { AddPaths(p: Paths, type: number, closed: boolean): void; Execute(clip: number, out: Paths, a: number, b: number): boolean }; Orientation(p: Path): boolean; Area(p: Path): number };
    ClipperOffset: new (miter?: number, arcTolerance?: number) => { AddPaths(p: Paths, join: number, end: number): void; Execute(out: Paths, delta: number): void };
    Paths: new () => Paths;
    JoinType: { jtRound: number };
    EndType: { etClosedPolygon: number };
    PolyType: { ptSubject: number };
    ClipType: { ctUnion: number };
    PolyFillType: { pftNonZero: number };
  };
  export default ClipperLib;
}
