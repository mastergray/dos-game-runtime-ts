// realizes: docs/deployment-manifest-spec.md > §2.4 Static build

// Dependencies:
import { build } from "esbuild";                                                                   // Bundles each game's main.ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";   // Reads the sources, writes the folder
import { join, resolve } from "node:path";                                                           // Locates sources and outputs
import { fileURLToPath } from "node:url";                                                            // Locates the repo root
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
    "Usage: npm run build-manifests -- <slug> [--out <dir>]        build one game into <dir> (default dist/<slug>)",
    "       npm run build-manifests -- --all [--out <dir>]         build every game into <dir>/<slug> and the index at <dir>/index.html (default dist)",
    "       ... --base <slug>=<url>                                 the folder a game is hosted in, for its index link; may repeat (default ./<slug>/)",
].join("\n");
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));                            // Repository root
const MANIFESTS_DIR = join(REPO_ROOT, "manifests");                                           // One folder per manifest game
const SHELL_DIR = join(MANIFESTS_DIR, "shell");                                               // The shared page, index template and fonts
const EMULATORS_DIR = join(REPO_ROOT, "node_modules", "emulators", "dist");                   // js-dos runtime assets
const EMULATOR_FILES = ["wdosbox.js", "wdosbox.wasm"];                                        // What the dosbox backend fetches at run time
const FONT_FILES = ["WebPlus_IBM_VGA_8x16.woff", "LICENSE.TXT"];                              // The page font and its licence
const DEFAULT_OUT = join(REPO_ROOT, "dist");                                                  // Git-ignored build output

/**
 *
 * Functions
 *
 */

// HELPER :: [STRING] -> {slugs:[STRING], all:BOOLEAN, out:STRING?, bases:{STRING:STRING}}
// Reads the arguments: slugs or --all, an optional --out, and any --base slug=url pairs.
const parseArgs = (args: ReadonlyArray<string>): { readonly slugs: ReadonlyArray<string>; readonly all: boolean; readonly out: string | undefined; readonly bases: Readonly<Record<string, string>> } => {
    const slugs: string[] = [];
    const bases: Record<string, string> = {};
    let all = false;
    let out: string | undefined;
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i] ?? "";
        if (arg === "--all") { all = true; continue; }
        if (arg === "--out") { out = args[i + 1]; i += 1; if (out === undefined) throw new Error("--out needs a directory"); continue; }
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
    return { slugs, all, out, bases };
};

// HELPER :: STRING -> gameManifest
// Reads and validates manifests/<slug>/manifest.json; throws naming the file when it is missing or malformed.
const manifestFor = (slug: string): GameManifest => {
    const file = join(MANIFESTS_DIR, slug, "manifest.json");
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

// HELPER :: gameManifest, STRING -> PROMISE(VOID)
// Builds one game into dir: the filled page, the bundled script, the validated manifest, the packed game, fonts and emulator
// files. Every reference inside is relative, so the folder works at any address.
const buildGame = async (manifest: GameManifest, dir: string): Promise<void> => {
    const slug = manifest.metadata.slug;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), shellPageFor(readFileSync(join(SHELL_DIR, "index.html"), "utf8"), manifest));
    const result = await build({ entryPoints: [join(MANIFESTS_DIR, slug, "main.ts")], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", logLevel: "silent" });
    const output = result.outputFiles[0];
    if (output === undefined) throw new Error(`esbuild produced no output for ${slug}`);
    writeFileSync(join(dir, "main.js"), output.text);
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    const entries = entriesFor(manifest, REPO_ROOT);
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
// Entry point: one slug builds into --out or dist/<slug>; --all builds every manifest into --out or dist, plus the index.
const main = async (): Promise<void> => {
    const { slugs, all, out, bases } = parseArgs(process.argv.slice(2));
    if (!all && slugs.length === 0) {
        console.error(USAGE);
        throw new Error("a slug or --all is required");
    }
    if (all) {
        const dir = resolve(out ?? DEFAULT_OUT);
        const found = readdirSync(MANIFESTS_DIR).filter((name) => existsSync(join(MANIFESTS_DIR, name, "manifest.json"))).sort();
        if (found.length === 0) throw new Error(`no manifests under ${MANIFESTS_DIR}`);
        const manifests = found.map(manifestFor);
        for (const manifest of manifests) await buildGame(manifest, join(dir, manifest.metadata.slug));
        buildIndex(manifests, dir, bases);
        return;
    }
    for (const slug of slugs) {
        const manifest = manifestFor(slug);
        await buildGame(manifest, resolve(out ?? join(DEFAULT_OUT, slug)));
    }
};

await main();
