// Local matching agent + static server.
//
// Runs the real matching algorithm once at startup, then watches
// data/startups.json, data/companies.json, and data/contacts.json — any time
// one changes (e.g. you add a startup or edit a company's priorities), it
// automatically re-runs the algorithm and rewrites data/matches.json and
// data/intro_packets.json, so the dashboard always reflects the latest data
// on the next page load. No manual "re-run the generator" step, no cloud
// deployment — just `node server.js`.
//
// Usage: node server.js [port]   (defaults to 8000)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { runGeneration } = require("./scripts/generate-data");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};

function regenerate(reason) {
  try {
    const result = runGeneration();
    const stamp = new Date().toLocaleTimeString();
    console.log(
      `[matching-agent ${stamp}] ${reason} → recomputed ${result.matches} matches / ${result.packets} intro packets ` +
        `(${result.companies} companies x ${result.startups} startups).`
    );
  } catch (err) {
    console.error(`[matching-agent] regeneration failed: ${err.message}`);
  }
}

// Run once at startup so the dashboard opens with fresh data even if the
// source files changed while the server wasn't running.
regenerate("startup");

// Watch the source data and keep matches.json / intro_packets.json in sync
// automatically. Debounced because editors often emit multiple change
// events for a single save.
let debounceTimer = null;
["startups.json", "companies.json", "contacts.json"].forEach((file) => {
  fs.watch(path.join(DATA_DIR, file), () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => regenerate(`${file} changed`), 300);
  });
});

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const requested = path.normalize(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.join(ROOT, requested);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[matching-agent] Dashboard running at http://localhost:${PORT}`);
  console.log(`[matching-agent] Watching data/startups.json, data/companies.json, data/contacts.json for changes...`);
});
