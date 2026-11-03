// UI test server: the real app with Firebase replaced by a local mock.
import { fileURLToPath } from "node:url";
const mock = fileURLToPath(new URL("./firebase-mock.js", import.meta.url));
export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { alias: [{ find: /^\.\/firebase\.js$/, replacement: mock }] },
  server: { port: 5198, strictPort: true },
};
