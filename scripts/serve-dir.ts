// realizes: docs/deployment-manifest-spec.md > §2.4 Static build (serving a build for a look)

// Dependencies:
import { createServer } from "node:http";                           // The server
import { existsSync, statSync } from "node:fs";                     // Refuses paths that do not exist or are folders
import { readFile } from "node:fs/promises";                        // Serves files
import { extname, join, normalize, resolve } from "node:path";      // Maps paths to files

/**
 *
 * Constants
 *
 */

const USAGE = "Usage: dos-serve-dir <dir> [port] [host]   serve a built folder with the cross-origin isolation headers (port 8080, loopback; host 0.0.0.0 serves the LAN)";
const MIME: Readonly<Record<string, string>> = {                    // Content types by extension
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".css": "text/css",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
    ".jsdos": "application/zip",
};
const ISOLATION_HEADERS = {                                         // Lets js-dos worker mode use SharedArrayBuffer
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cache-Control": "no-store",
} as const;

/**
 *
 * Functions
 *
 */

// HELPER :: STRING, STRING -> STRING?
// Maps a request path to a file under root: a folder serves its index.html; anything outside root, missing or a folder without
// an index is null.
const fileFor = (root: string, pathname: string): string | null => {
    const file = normalize(join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return null;
    if (existsSync(file) && statSync(file).isDirectory()) { const index = join(file, "index.html"); return existsSync(index) ? index : null; }
    return existsSync(file) && statSync(file).isFile() ? file : null;
};

// HELPER :: VOID -> VOID
// Entry point: serves the folder until stopped.
const main = (): void => {
    const [dirArg, portArg, hostArg] = process.argv.slice(2);
    if (dirArg === undefined) { console.error(USAGE); throw new Error("a directory is required"); }
    const root = resolve(dirArg);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
    const port = portArg === undefined ? 8080 : Number(portArg);
    if (!Number.isInteger(port) || port <= 0) throw new Error(`${portArg} is not a port`);
    const host = hostArg ?? "127.0.0.1";
    const server = createServer((request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname !== "/" && !pathname.endsWith("/") && !extname(pathname) && fileFor(root, `${pathname}/`) !== null) {
            response.writeHead(302, { Location: `${pathname}/` });                          // A folder without its slash: relative assets need it
            response.end();
            return;
        }
        const file = fileFor(root, pathname);
        if (file === null) { response.writeHead(404, { "Content-Type": "text/plain" }); response.end(`not found: ${pathname}`); return; }
        readFile(file).then((bytes) => {
            response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", ...ISOLATION_HEADERS });
            response.end(bytes);
        }).catch((error: unknown) => { response.writeHead(500, { "Content-Type": "text/plain" }); response.end(String(error)); });
    });
    server.listen(port, host, () => { console.log(`serving ${root} at http://${host}:${port}/`); });
};

main();
