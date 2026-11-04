// Local test server: the real app with Firebase replaced by a local mock, plus
// the icon review tool, which saves choices to tools/icon-review/choices.json.
import fs from "node:fs";
import { threeBySource } from "../../vite.config.js";
import { fileURLToPath } from "node:url";

const mock = fileURLToPath(new URL("./firebase-mock.js", import.meta.url));
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

export default {
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { alias: [{ find: /^\.\/firebase\.js$/, replacement: mock }, threeBySource] },
  server: { port: 5198, strictPort: true },
  plugins: [reviewStore],
};
