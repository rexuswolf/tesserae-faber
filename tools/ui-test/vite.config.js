// Local test server: the real app with its Firebase adapters replaced by local ones, plus
// the icon review tool, which saves choices to tools/icon-review/choices.json.
import fs from "node:fs";
import { threeBySource } from "../../vite.config.js";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));

// the test page hooks run before the app (they set the language it starts in)
const testHooks = {
  name: "test-hooks",
  transformIndexHtml: (html) => html.replace('<script type="module" src="/src/main.ts">', '<script type="module" src="/tools/ui-test/test-hooks.js"></script>\n<script type="module" src="/src/main.ts">'),
};
const choicesFile = fileURLToPath(new URL("../icon-review/choices.json", import.meta.url));

const reviewStore = {
  name: "icon-review-store",
  configureServer(server) {
    server.middlewares.use("/__review/choices", (req, res) => {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            fs.writeFileSync(choicesFile, JSON.stringify(JSON.parse(body), null, 1));
            res.statusCode = 204; res.end();
          } catch (err) { res.statusCode = 400; res.end(String(err)); }
        });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(fs.existsSync(choicesFile) ? fs.readFileSync(choicesFile) : "{}");
    });
  },
};

// The app's modules are TypeScript now; prototype pages written before still ask for
// "/src/<path>.js". Those get the .ts file, when there's no .js of that name.
const srcJs = {
  name: "src-js-to-ts",
  enforce: "pre",
  resolveId(id) {
    const m = /^\/src\/(.+)\.js$/.exec(id);
    if (!m) return null;
    const ts = fileURLToPath(new URL(`../../src/${m[1]}.ts`, import.meta.url));
    return !fs.existsSync(ts.slice(0, -3) + ".js") && fs.existsSync(ts) ? ts : null;
  },
};

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { alias: [
    { find: /^\.\/adapters\/firebase-auth\.ts$/, replacement: here("./mock-auth.js") },
    { find: /^\.\/adapters\/firebase-roles\.ts$/, replacement: here("./mock-roles.js") },
    threeBySource,
  ] },
  define: { __BUILD__: JSON.stringify("test") },
  server: { port: 5198, strictPort: true },
  plugins: [reviewStore, srcJs, testHooks],
};
