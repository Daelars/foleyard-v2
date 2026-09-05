// THROWAWAY. One-command local preview. Keeps app APIs off the tailnet preview listener.
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3011"], { cwd: root, stdio: "inherit", windowsHide: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (!(pathname === "/prototype/repo-audit" || pathname.startsWith("/_next/") || pathname.startsWith("/__nextjs_font/") || pathname === "/favicon.ico")) {
    res.writeHead(404); res.end("Prototype preview only"); return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  const upstream = http.request({ hostname: "127.0.0.1", port: 3011, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on("error", () => { res.writeHead(503); res.end("Prototype is starting. Refresh shortly."); });
  req.pipe(upstream);
});
// Next's development runtime needs its HMR connection to finish client startup.
server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, "http://localhost").pathname !== "/_next/webpack-hmr") {
    socket.destroy(); return;
  }
  const upstream = http.request({ hostname: "127.0.0.1", port: 3011, path: req.url, headers: req.headers });
  upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`);
    for (let i = 0; i < response.rawHeaders.length; i += 2) socket.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`);
    socket.write("\r\n");
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.on("error", () => socket.destroy());
    socket.on("error", () => upstreamSocket.destroy());
    socket.pipe(upstreamSocket).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  upstream.on("response", () => socket.destroy());
  upstream.end();
});
server.listen(3012, "127.0.0.1", () => console.log("Audit preview: http://127.0.0.1:3012/prototype/repo-audit"));
function stop() { server.close(); child.kill(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
