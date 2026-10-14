// realizes: docs/deployment-manifest-spec.md > §2.1 Packer

// Dependencies:
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";   // Reads manifests and confs, writes bundles
import { join, resolve } from "node:path";                                                    // Locates manifests and outputs
import { fileURLToPath } from "node:url";                                                     // Locates the repo root
import { parseManifest } from "../manifests/shell/manifest.ts";                               // Validates a manifest file
import { entriesFor, entriesUnder, withJsdosEntries, zip } from "./bundle.ts";                // Builds the archive

/**
 *
 * Constants
 *
 */

const USAGE = [                                                    // Printed when no argument is given
    "Usage: npm run pack-bundle -- <slug>              pack manifests/<slug>/manifest.json",
    "       npm run pack-bundle -- --all               pack every manifest",
    "       npm run pack-bundle -- <game dir> [dosbox.conf] [out.jsdos]   pack a folder with a conf (probing)",
].join("\n");
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));                            // Repository root
const MANIFESTS_DIR = join(REPO_ROOT, "manifests");                                           // One folder per manifest game
const MANIFEST_BUNDLES_DIR = join(REPO_ROOT, "tests", "browser", "harness", "manifests");     // Git-ignored packed manifest games
const DEFAULT_OUT = join(REPO_ROOT, "tests", "browser", "harness", "test.jsdos");             // Git-ignored harness bundle (probing)
const DEFAULT_CONF = join(REPO_ROOT, "docs", "probes", "js-dos-8.4.2", "example-dosbox.conf");   // The conf shape, running GAME.EXE (probing)

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> STRING?
// The manifest file for a slug, or null when the slug has none.
const manifestFileFor = (slug: string): string | null => {
    const file = join(MANIFESTS_DIR, slug, "manifest.json");
    return /^[a-z0-9][a-z0-9-]*$/.test(slug) && existsSync(file) ? file : null;
};

// HELPER :: STRING -> VOID
// Packs one manifest game into tests/browser/harness/manifests/<slug>.jsdos.
const packManifest = (file: string): void => {
    const manifest = parseManifest(readFileSync(file, "utf8"), file);
    const entries = entriesFor(manifest, REPO_ROOT);
    const out = join(MANIFEST_BUNDLES_DIR, `${manifest.metadata.slug}.jsdos`);
    mkdirSync(MANIFEST_BUNDLES_DIR, { recursive: true });
    writeFileSync(out, zip(entries));
    console.log(`packed ${entries.length} entries into ${out}`);
};

// HELPER :: STRING, STRING?, STRING? -> VOID
// Packs a game folder with a conf file into an output bundle: the probing form that predates manifests.
const packFolder = (gameDir: string, confArg?: string, outArg?: string): void => {
    const conf = new Uint8Array(readFileSync(resolve(confArg ?? DEFAULT_CONF)));
    const out = resolve(outArg ?? DEFAULT_OUT);
    const entries = withJsdosEntries(entriesUnder(resolve(gameDir)), conf);
    mkdirSync(resolve(out, ".."), { recursive: true });
    writeFileSync(out, zip(entries));
    console.log(`packed ${entries.length} entries into ${out}`);
};

// HELPER :: VOID -> VOID
// Entry point: a slug packs its manifest, --all packs every manifest, anything else is a game folder.
const main = (): void => {
    const [first, second, third] = process.argv.slice(2);
    if (first === undefined) {
        console.error(USAGE);
        throw new Error("a slug, --all, or a game directory is required");
    }
    if (first === "--all") {
        const files = readdirSync(MANIFESTS_DIR).map(manifestFileFor).filter((file): file is string => file !== null);
        if (files.length === 0) throw new Error(`no manifests under ${MANIFESTS_DIR}`);
        for (const file of files) packManifest(file);
        return;
    }
    const manifestFile = manifestFileFor(first);
    if (manifestFile !== null) {
        packManifest(manifestFile);
        return;
    }
    packFolder(first, second, third);
};

main();
