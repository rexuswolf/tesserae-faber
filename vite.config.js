// three ships as one big file, which a bundle can't split. Its source, file by file, lets the
// WebGL renderer go with the 3D preview (src/engine/viewer.js), loaded after the app starts.
export const threeBySource = { find: /^three$/, replacement: "three/src/Three.js" };

export default {
  resolve: { alias: [threeBySource] },
};
