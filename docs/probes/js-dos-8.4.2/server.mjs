// Probe static server: COOP/COEP headers, wasm mime, serves emulators dist at /emulators/
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const mime = { ".html": "text/html", ".js": "application/javascript", ".wasm": "application/wasm", ".jsdos": "application/zip", ".json": "application/json", ".map": "application/json", ".symbols": "text/plain" };

export function start(port = 0) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url, "http://x");
            let file;
            if (url.pathname.startsWith("/emulators/")) file = join(root, "node_modules/emulators/dist", url.pathname.slice("/emulators/".length));
            else file = join(root, url.pathname === "/" ? "index.html" : url.pathname);
            if (!existsSync(file)) { res.writeHead(404); res.end("not found " + url.pathname); return; }
            res.writeHead(200, {
                "Content-Type": mime[extname(file)] ?? "application/octet-stream",
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
                "Cache-Control": "no-store",
            });
            res.end(readFileSync(file));
        });
        server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((r) => server.close(r)) }));
    });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const { url } = await start(Number(process.env.PORT ?? 8787));
    console.log(url);
}
