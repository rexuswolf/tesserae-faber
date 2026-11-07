// Types for the libraries that ship without them.

/** imagetracerjs (loaded only to trace a homebrew picture): the one call we make. */
declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(imgd: ImageData, options?: Record<string, unknown>): string;
  };
  export default ImageTracer;
}

declare const __BUILD__: string;
