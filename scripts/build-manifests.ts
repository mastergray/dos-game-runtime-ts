// realizes: docs/deployment-manifest-spec.md > §2.4 Static build

// Dependencies:
import { build, type Plugin } from "esbuild";                                                      // Bundles each game's main.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";   // Reads the sources, writes the folder
import { createRequire } from "node:module";                                                        // Finds the emulators package
import { dirname, join, resolve } from "node:path";                                                  // Locates sources and outputs
import { fileURLToPath } from "node:url";                                                            // Locates this package
import { parseManifest } from "../manifests/shell/manifest.ts";                                      // Validates a manifest file
import { indexPageFor, shellPageFor } from "../manifests/shell/pages.ts";                            // Fills the page and the index
import { entriesFor, zip } from "./bundle.ts";                                                       // Packs the game

// Type dependencies:
import type { GameManifest } from "../manifests/shell/manifest.types.ts";                           // A validated manifest

/**
 *
 * Constants
 *
 */

const USAGE = [                                                    // Printed when no argument is given
    "Usage: dos-build-manifests <slug> [--out <dir>]        build one game into <dir> (default <root>/dist/<slug>)",
    "       dos-build-manifests --all [--out <dir>]         build every game into <dir>/<slug> and the index at <dir>/index.html (default <root>/dist)",
    "       ... --root <dir>                                 the project: manifests/<slug>/ under it, game folders relative to it (default: the current directory)",
    "       ... --base <slug>=<url>                          the folder a game is hosted in, for its index link; may repeat (default ./<slug>/)",
    "       ... --runtime <dir>                              bundle against a local checkout of dos-game-runtime-ts instead of the installed package, to try a runtime change before publishing it",
    "       (from this repository: npm run build-manifests -- ...)",
].join("\n");
const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));                         // This package, wherever it is installed
const SHELL_DIR = join(PACKAGE_ROOT, "manifests", "shell");                                   // The shared page, index template and fonts
const EMULATORS_DIR = join(dirname(createRequire(import.meta.url).resolve("emulators/package.json")), "dist");   // js-dos runtime assets
const EMULATOR_FILES = ["wdosbox.js", "wdosbox.wasm"];                                        // What the dosbox backend fetches at run time
const FONT_FILES = ["WebPlus_IBM_VGA_8x16.woff", "LICENSE.TXT"];                              // The page font and its licence

/**
 *
 * Functions
 *
 */

// HELPER :: [STRING] -> {slugs:[STRING], all:BOOLEAN, out:STRING?, root:STRING, runtime:STRING?, bases:{STRING:STRING}}
// Reads the arguments: slugs or --all, an optional --out, the project --root (the current directory by default), an optional
// --runtime checkout, and any --base slug=url pairs.
const parseArgs = (args: ReadonlyArray<string>): { readonly slugs: ReadonlyArray<string>; readonly all: boolean; readonly out: string | undefined; readonly root: string; readonly runtime: string | undefined; readonly bases: Readonly<Record<string, string>> } => {
    const slugs: string[] = [];
    const bases: Record<string, string> = {};
    let all = false;
    let out: string | undefined;
    let root = process.cwd();
    let runtime: string | undefined;
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i] ?? "";
        if (arg === "--all") { all = true; continue; }
        if (arg === "--out") { out = args[i + 1]; i += 1; if (out === undefined) throw new Error("--out needs a directory"); continue; }
        if (arg === "--root") { const dir = args[i + 1]; i += 1; if (dir === undefined) throw new Error("--root needs a directory"); root = resolve(dir); continue; }
        if (arg === "--runtime") { const dir = args[i + 1]; i += 1; if (dir === undefined) throw new Error("--runtime needs a directory"); runtime = resolve(dir); continue; }
        if (arg === "--base") {
            const pair = args[i + 1] ?? ""; i += 1;
            const eq = pair.indexOf("=");
            if (eq <= 0) throw new Error(`--base needs <slug>=<url>, got "${pair}"`);
            bases[pair.slice(0, eq)] = pair.slice(eq + 1);
            continue;
        }
        if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
        slugs.push(arg);
    }
    return { slugs, all, out, root, runtime, bases };
};

// HELPER :: STRING, STRING -> gameManifest
// Reads and validates <root>/manifests/<slug>/manifest.json; throws naming the file when it is missing or malformed.
const manifestFor = (root: string, slug: string): GameManifest => {
    const file = join(root, "manifests", slug, "manifest.json");
    if (!existsSync(file)) throw new Error(`no manifest at ${file}`);
    const manifest = parseManifest(readFileSync(file, "utf8"), file);
    if (manifest.metadata.slug !== slug) throw new Error(`${file}: slug "${manifest.metadata.slug}" does not match its folder "${slug}"`);
    return manifest;
};

// HELPER :: STRING, STRING -> VOID
// Copies the page font and its licence into <dir>/fonts.
const copyFonts = (dir: string): void => {
    mkdirSync(join(dir, "fonts"), { recursive: true });
    for (const name of FONT_FILES) copyFileSync(join(SHELL_DIR, "fonts", name), join(dir, "fonts", name));
};

// HELPER :: STRING? -> [plugin]
// With a runtime checkout, an esbuild plugin that resolves the package's entry points there: the shell, the manifest module and
// the runtime itself, so a main.ts written against the installed package bundles against the checkout instead.
const runtimePlugins = (runtime: string | undefined): Plugin[] => runtime === undefined ? [] : [{
    name: "local-runtime",
    setup: (api) => {
        const entries: Readonly<Record<string, string>> = {
            "dos-game-runtime-ts": join(runtime, "src", "index.ts"),
            "dos-game-runtime-ts/shell": join(runtime, "manifests", "shell", "shell.ts"),
            "dos-game-runtime-ts/manifest": join(runtime, "manifests", "shell", "manifest.ts"),
        };
        api.onResolve({ filter: /^dos-game-runtime-ts(\/.*)?$/ }, (args) => {
            const path = entries[args.path];
            if (path === undefined) return { errors: [{ text: `${args.path} is not an entry point of the runtime checkout` }] };
            return { path };
        });
    },
}];

// HELPER :: STRING, gameManifest, STRING, STRING? -> PROMISE(VOID)
// Builds one game of the project at root into dir: the filled page, the bundled script, the validated manifest, the packed
// game (its folder resolved against root), fonts and emulator files. Every reference inside is relative, so the folder works
// at any address. With a runtime checkout the script bundles against it.
const buildGame = async (root: string, manifest: GameManifest, dir: string, runtime: string | undefined): Promise<void> => {
    const slug = manifest.metadata.slug;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), shellPageFor(readFileSync(join(SHELL_DIR, "index.html"), "utf8"), manifest));
    const result = await build({ entryPoints: [join(root, "manifests", slug, "main.ts")], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", logLevel: "silent", plugins: runtimePlugins(runtime) });
    const output = result.outputFiles[0];
    if (output === undefined) throw new Error(`esbuild produced no output for ${slug}`);
    writeFileSync(join(dir, "main.js"), output.text);
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    const entries = entriesFor(manifest, root);
    writeFileSync(join(dir, "game.jsdos"), zip(entries));
    copyFonts(dir);
    mkdirSync(join(dir, "emulators"), { recursive: true });
    for (const name of EMULATOR_FILES) copyFileSync(join(EMULATORS_DIR, name), join(dir, "emulators", name));
    console.log(`built ${slug} into ${dir} (${entries.length} game entries)`);
};

// HELPER :: [gameManifest], STRING, {STRING:STRING} -> VOID
// Writes the games index into dir with its font, linking each game at its base or its own folder beside the index.
const buildIndex = (manifests: ReadonlyArray<GameManifest>, dir: string, bases: Readonly<Record<string, string>>): void => {
    mkdirSync(dir, { recursive: true });
    const hrefFor = (slug: string): string | undefined => { const base = bases[slug]; return base === undefined ? undefined : base.endsWith("/") ? base : `${base}/`; };
    writeFileSync(join(dir, "index.html"), indexPageFor(readFileSync(join(SHELL_DIR, "games.html"), "utf8"), manifests, hrefFor));
    copyFonts(dir);
    console.log(`wrote the index of ${manifests.length} games into ${dir}`);
};

// HELPER :: VOID -> PROMISE(VOID)
// Entry point: one slug builds into --out or <root>/dist/<slug>; --all builds every manifest of the project into --out or
// <root>/dist, plus the index.
const main = async (): Promise<void> => {
    const { slugs, all, out, root, runtime, bases } = parseArgs(process.argv.slice(2));
    if (!all && slugs.length === 0) {
        console.error(USAGE);
        throw new Error("a slug or --all is required");
    }
    const manifestsDir = join(root, "manifests");
    if (all) {
        const dir = resolve(out ?? join(root, "dist"));
        const found = (existsSync(manifestsDir) ? readdirSync(manifestsDir) : []).filter((name) => existsSync(join(manifestsDir, name, "manifest.json"))).sort();
        if (found.length === 0) throw new Error(`no manifests under ${manifestsDir}`);
        const manifests = found.map((slug) => manifestFor(root, slug));
        for (const manifest of manifests) await buildGame(root, manifest, join(dir, manifest.metadata.slug), runtime);
        buildIndex(manifests, dir, bases);
        return;
    }
    for (const slug of slugs) {
        const manifest = manifestFor(root, slug);
        await buildGame(root, manifest, resolve(out ?? join(root, "dist", slug)), runtime);
    }
};

await main();
