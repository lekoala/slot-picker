import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  // Compare the raw pathname before normalize(): on Windows normalize("/")
  // returns "\\", which never equals "/" and breaks the root route.
  const pathname = decodeURIComponent(url.pathname);
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let path = join(root, pathname === "/" ? "demo/index.html" : relative);
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");

  if (!existsSync(path)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.setHeader("content-type", types.get(extname(path)) || "application/octet-stream");
  createReadStream(path).pipe(response);
});

// Release keep-alive sockets so the process really exits; otherwise a lingering
// server keeps the port busy after the test run.
function shutdown() {
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

server.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
