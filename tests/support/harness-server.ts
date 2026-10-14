// Dependencies:
import { createServer } from "node:http";                          // Loopback HTTP server for the harness page
import { readFile } from "node:fs/promises";                       // Reads static files on request
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";   // Refuses paths that do not exist or are folders; discovers manifests
import { extname, join, normalize } from "node:path";              // Resolves request paths under the served roots
import { fileURLToPath } from "node:url";                          // Converts this module's URL to a filesystem path
import { build } from "esbuild";                                   // Bundles src/ and the harness entry in memory
import { parseManifest } from "../../manifests/shell/manifest.ts";   // Validates each manifest at start
import { indexPageFor, shellPageFor } from "../../manifests/shell/pages.ts";   // Fills the shell page and the games index

// Type dependencies:
import type { IncomingMessage, ServerResponse } from "node:http";  // Request and response types for the handler
import type { GameManifest } from "../../manifests/shell/manifest.types.ts";   // A parsed manifest, served to its page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {url:STRING, stop:(VOID -> PROMISE(VOID))}
// A running harness server: its base URL and how to stop it.
export interface HarnessServer {
    url: string;                                                   // http://127.0.0.1:<port>
    stop: () => Promise<void>;                                     // Closes the listener
}

/**
 *
 * Constants
 *
 */

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));                   // Repository root
const HARNESS_DIR = join(PACKAGE_ROOT, "tests", "browser", "harness");                    // Page, entry and bundle
const EMULATORS_DIR = join(PACKAGE_ROOT, "node_modules", "emulators", "dist");           // js-dos runtime assets
const HARNESS_ENTRY = join(HARNESS_DIR, "main.ts");                                       // Bundled to /harness.js
const DEPLOYMENTS_DIR = join(PACKAGE_ROOT, "deployments");                                // Game pages served under /<name>/; a folder without a bundle (the games index) is static
const MANIFESTS_DIR = join(PACKAGE_ROOT, "manifests");                                    // Manifest game pages served under /manifests/<slug>/
const MANIFEST_SHELL_DIR = join(MANIFESTS_DIR, "shell");                                  // The shared page markup and fonts
const MANIFEST_BUNDLES_DIR = join(HARNESS_DIR, "manifests");                              // /manifests/<slug>/game.jsdos -> git-ignored packed game
const MIME: Readonly<Record<string, string>> = {                                          // Content types by extension
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".jsdos": "application/zip",
    ".map": "application/json",
    ".symbols": "text/plain",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};
const ISOLATION_HEADERS = {                                                               // Lets js-dos worker mode use SharedArrayBuffer
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cache-Control": "no-store",
} as const;

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> PROMISE(STRING)
// Bundles one TypeScript entry (and through it src/index.ts) into one ESM script.
const bundleEntry = async (entry: string): Promise<string> => {
    const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        target: "es2022",
        sourcemap: "inline",
        logLevel: "silent",
    });
    const output = result.outputFiles[0];
    if (output === undefined) throw new Error(`esbuild produced no output for ${entry}`);
    return output.text;
};

// HELPER :: VOID -> {STRING: gameManifest}
// Reads and validates every manifests/<slug>/manifest.json; a bad one throws here, at start, naming its file.
// NOTE: The folder name must equal the manifest's slug, since both name the route.
const discoverManifests = (): Record<string, GameManifest> => {
    const manifests: Record<string, GameManifest> = {};
    if (!existsSync(MANIFESTS_DIR)) return manifests;
    for (const name of readdirSync(MANIFESTS_DIR).sort()) {
        const file = join(MANIFESTS_DIR, name, "manifest.json");
        if (!existsSync(file)) continue;
        const manifest = parseManifest(readFileSync(file, "utf8"), file);
        if (manifest.metadata.slug !== name) throw new Error(`${file}: slug "${manifest.metadata.slug}" does not match its folder "${name}"`);
        manifests[name] = manifest;
    }
    return manifests;
};

// HELPER :: STRING -> STRING?
// Maps a request path to a file under one of the served roots, or null when it is outside both.
const fileFor = (pathname: string): string | null => {
    if (pathname.startsWith("/emulators/")) {
        const file = normalize(join(EMULATORS_DIR, pathname.slice("/emulators/".length)));
        return file.startsWith(EMULATORS_DIR) ? file : null;
    }
    if (pathname.startsWith("/manifests/fonts/")) {                                              // The index page's font, from the shell
        const file = normalize(join(MANIFEST_SHELL_DIR, pathname.slice("/manifests/".length)));
        return file.startsWith(MANIFEST_SHELL_DIR) ? file : null;
    }
    const manifestPage = /^\/manifests\/([a-z0-9-]+)\/(.+)$/.exec(pathname);
    if (manifestPage !== null && manifestPage[1] !== undefined && manifestPage[2] !== undefined) {
        const [, slug, rest] = manifestPage;
        if (rest === "game.jsdos") return join(MANIFEST_BUNDLES_DIR, `${slug}.jsdos`);
        if (rest.startsWith("emulators/")) {
            const file = normalize(join(EMULATORS_DIR, rest.slice("emulators/".length)));
            return file.startsWith(EMULATORS_DIR) ? file : null;
        }
        if (rest.startsWith("fonts/")) {
            const file = normalize(join(MANIFEST_SHELL_DIR, rest));
            return file.startsWith(MANIFEST_SHELL_DIR) ? file : null;
        }
        const file = normalize(join(MANIFESTS_DIR, slug, rest));
        return file.startsWith(join(MANIFESTS_DIR, slug)) ? file : null;
    }
    const deployment = /^\/([a-z0-9-]+)(\/.*)?$/.exec(pathname);
    if (deployment !== null && deployment[1] !== undefined && existsSync(join(DEPLOYMENTS_DIR, deployment[1], "index.html"))) {
        const name = deployment[1];
        const rest = deployment[2] ?? "/";
        if (rest === "/" || rest === "") return join(DEPLOYMENTS_DIR, name, "index.html");
        if (rest === "/game.jsdos") return join(HARNESS_DIR, `${name}.jsdos`);                   // Git-ignored packed game, named after its page
        const file = normalize(join(DEPLOYMENTS_DIR, name, rest));
        return file.startsWith(join(DEPLOYMENTS_DIR, name)) ? file : null;
    }
    const file = normalize(join(HARNESS_DIR, pathname === "/" ? "index.html" : pathname));
    return file.startsWith(HARNESS_DIR) ? file : null;
};


// HELPER :: ARRAY<STRING, STRING>, ARRAY<STRING, gameManifest> -> (incomingMessage, serverResponse -> PROMISE(VOID))
// Builds the request handler over pre-bundled scripts keyed by their served path and the discovered manifests.
const handlerFor = (scripts: Readonly<Record<string, string>>, manifests: Readonly<Record<string, GameManifest>>) => async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const script = scripts[pathname];
    if (script !== undefined) {
        response.writeHead(200, { "Content-Type": MIME[".js"] ?? "application/javascript", ...ISOLATION_HEADERS });
        response.end(script);
        return;
    }
    if (pathname === "/manifests") {
        response.writeHead(302, { Location: "/manifests/" });
        response.end();
        return;
    }
    if (pathname === "/manifests/") {
        response.writeHead(200, { "Content-Type": MIME[".html"] ?? "text/html", ...ISOLATION_HEADERS });
        response.end(indexPageFor(await readFile(join(MANIFEST_SHELL_DIR, "games.html"), "utf8"), Object.values(manifests)));
        return;
    }
    const manifestRoute = /^\/manifests\/([a-z0-9-]+)(\/(manifest\.json)?)?$/.exec(pathname);
    if (manifestRoute !== null && manifestRoute[1] !== undefined) {
        const manifest = manifests[manifestRoute[1]];
        if (manifest === undefined) {
            response.writeHead(404, { "Content-Type": "text/plain", ...ISOLATION_HEADERS });
            response.end(`no manifest for ${manifestRoute[1]}`);
            return;
        }
        if (manifestRoute[3] === "manifest.json") {
            response.writeHead(200, { "Content-Type": MIME[".json"] ?? "application/json", ...ISOLATION_HEADERS });
            response.end(JSON.stringify(manifest));
            return;
        }
        if (manifestRoute[2] === undefined) {
            response.writeHead(302, { Location: `${pathname}/` });
            response.end();
            return;
        }
        response.writeHead(200, { "Content-Type": MIME[".html"] ?? "text/html", ...ISOLATION_HEADERS });
        response.end(shellPageFor(await readFile(join(MANIFEST_SHELL_DIR, "index.html"), "utf8"), manifest));
        return;
    }
    const file = fileFor(pathname);
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {                       // A folder is not found: reading it would fail after the headers went out
        const hint = file !== null && file.endsWith(".jsdos") && file.startsWith(MANIFEST_BUNDLES_DIR) ? " (not packed: run npm run pack-bundle -- <slug>)" : "";
        response.writeHead(404, { "Content-Type": "text/plain", ...ISOLATION_HEADERS });
        response.end(`not found: ${pathname}${hint}`);
        return;
    }
    response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", ...ISOLATION_HEADERS });
    response.end(await readFile(file));
};

// HELPER :: NUMBER, STRING? -> PROMISE(harnessServer)
// Bundles the harness, then listens on the given port (0 for a free one); on loopback unless a host is given.
// NOTE: A LAN host lets a phone reach the page; such a page is not a secure context, and the harness then boots js-dos in direct mode.
export const startHarnessServer = async (port: number, host = "127.0.0.1"): Promise<HarnessServer> => {
    const scripts: Record<string, string> = { "/harness.js": await bundleEntry(HARNESS_ENTRY) };
    for (const name of (existsSync(DEPLOYMENTS_DIR) ? readdirSync(DEPLOYMENTS_DIR) : []).filter((name) => existsSync(join(DEPLOYMENTS_DIR, name, "index.html")))) {   // Every hand page
        const entry = join(DEPLOYMENTS_DIR, name, "main.ts");
        if (existsSync(entry)) scripts[`/${name}/main.js`] = await bundleEntry(entry);
    }
    const manifests = discoverManifests();
    for (const slug of Object.keys(manifests)) {
        const entry = join(MANIFESTS_DIR, slug, "main.ts");
        if (existsSync(entry)) scripts[`/manifests/${slug}/main.js`] = await bundleEntry(entry);
    }
    const server = createServer((request, response) => {
        handlerFor(scripts, manifests)(request, response).catch((error: unknown) => {
            response.writeHead(500, { "Content-Type": "text/plain" });
            response.end(String(error));
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("harness server did not bind a TCP port");
    return {
        url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}`,
        stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
};
