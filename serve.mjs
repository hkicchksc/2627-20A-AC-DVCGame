import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachRemoteRelay, lanAddresses } from "./remote-relay.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
const port = Number(process.env.PORT || 5174);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/backstage/") {
    res.writeHead(308, { Location: "/backstage" });
    res.end();
    return;
  }
  if (pathname === "/remote-host") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ port, addresses: lanAddresses() }));
    return;
  }
  if (pathname === "/backstage") pathname = "/backstage.html";
  else if (pathname === "/") pathname = "/v2.html";
  else if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.normalize(path.join(root, pathname));
  if (file !== root && !file.startsWith(rootWithSep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  });
});

const takeRemote = attachRemoteRelay();
server.on("upgrade", (req, socket) => {
  if (!takeRemote(req, socket)) socket.destroy();
});

server.on("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  console.error(`Ways of Tuning is already running at http://127.0.0.1:${port}. Close that window, or run start.bat again.`);
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Ways of Tuning game view at http://127.0.0.1:${port}/`);
  console.log(`Backstage at http://127.0.0.1:${port}/backstage`);
  for (const address of lanAddresses()) {
    console.log(`Other computers: http://${address}:${port}/backstage`);
  }
});
