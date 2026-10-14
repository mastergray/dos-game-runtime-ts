// realizes: docs/deployment-manifest-spec.md > §1.2 declarations, §2.1 packer (the conf and the entries), §4 validation

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import { readFileSync } from "node:fs";                          // Reads the committed schema file and the fixture
import { fileURLToPath } from "node:url";                        // Locates the repo root and the fixture
import {
    isDosboxSettings,                                            // Predicate under test
    isGameControls,                                              // Predicate under test
    isGameLoad,                                                  // Predicate under test
    isGameManifest,                                              // Predicate under test
    isGameMetadata,                                              // Predicate under test
    isGameSaves,                                                 // Predicate under test
    isGameStatus,                                                // Predicate under test
    isKeyboardPolicy,                                            // Predicate under test
    isMousePolicy,                                               // Predicate under test
    isLayoutComponent,                                           // Predicate under test
    isTouchLayout,                                               // Predicate under test
    manifestProblem,                                             // Names the failing part
} from "../../manifests/shell/manifest.types.ts";
import { MANIFEST_SCHEMA, dosboxConfFor, parseManifest } from "../../manifests/shell/manifest.ts";   // Parser, conf writer and schema under test
import { entriesFor, namesIn, textOf, zip } from "../../scripts/bundle.ts";                          // Packer pieces under test
import { schemaText } from "../../scripts/manifest-schema.ts";                                       // What the schema script writes

// Type dependencies:
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner
import type { GameManifest } from "../../manifests/shell/manifest.types.ts";   // The valid shape the cases vary

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {result:BOOLEAN}
// Snapshot of one predicate evaluation.
interface PredicateSnapshot {
    result: boolean;                                             // What the predicate returned
}

/**
 *
 * Constants
 *
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));   // The packer resolves sources against this
const SCHEMA_FILE = fileURLToPath(new URL("../../manifests/shell/manifest.schema.json", import.meta.url));   // The committed schema

const KEY_ENTER = { kind: "key", code: "Enter" } as const;       // A valid key target
const VALID: GameManifest = {                                    // A manifest every part of which is valid
    metadata: { slug: "fixture", name: "Fixture Game", year: 1990, genre: "test", hints: ["Any key"], status: { verified: ["boot"] } },
    load: { source: "tests/support/fixtures/manifest-game", autoexec: ["GAME.EXE"] },
    saves: { key: "fixture", method: "nothing is saved" },
    controls: {},
};

// HELPER :: OBJECT, STRING, UNKNOWN? -> OBJECT
// A shallow copy of base with key set to value, or removed when value is omitted.
const withKey = (base: object, key: string, ...value: [unknown?]): object => {
    const copy: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    if (value.length === 0) delete copy[key]; else copy[key] = value[0];
    return copy;
};

// HELPER :: STRING, (UNKNOWN -> BOOLEAN), UNKNOWN, BOOLEAN -> testCase
// Builds a case that evaluates predicate on input and expects result.
const predicateCase = (label: string, predicate: (value: unknown) => boolean, input: unknown, expected: boolean): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert(expected ? "returns true" : "returns false", () => ({ result: predicate(input) }), P.equals<PredicateSnapshot>({ result: expected }))
        .start(undefined),
});

// HELPER :: STRING, (VOID -> UNKNOWN), UNKNOWN -> testCase
// Builds a case that computes a value and expects it to equal expected.
const valueCase = (label: string, compute: () => unknown, expected: unknown): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("equals the expected value", () => ({ value: compute() }), P.equals({ value: expected }))
        .start(undefined),
});

// HELPER :: STRING, (VOID -> UNKNOWN), STRING -> testCase
// Builds a case that expects compute to throw an Error whose message contains text.
const throwsCase = (label: string, compute: () => unknown, text: string): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("throws an error naming the problem", (): { threw: boolean; named: boolean } => {
            try { compute(); return { threw: false, named: false }; } catch (error) { return { threw: true, named: String(error).includes(text) }; }
        }, P.equals<{ threw: boolean; named: boolean }>({ threw: true, named: true }))
        .start(undefined),
});

/**
 *
 * Test File
 *
 */

const testFile: TestFile = {
    label: "deployment manifest",
    cases: [
        // isGameStatus
        predicateCase("isGameStatus accepts an empty verified list", isGameStatus, { verified: [] }, true),
        predicateCase("isGameStatus accepts every check with notes", isGameStatus, { verified: ["boot", "input", "sound", "save"], notes: "ok" }, true),
        predicateCase("isGameStatus rejects an unknown check", isGameStatus, { verified: ["played"] }, false),
        predicateCase("isGameStatus rejects a missing verified", isGameStatus, {}, false),

        // isGameMetadata
        predicateCase("isGameMetadata accepts the fixture metadata", isGameMetadata, VALID.metadata, true),
        predicateCase("isGameMetadata accepts an optional title and aspect ratio", isGameMetadata, { ...VALID.metadata, title: "FIXTURE", aspectRatio: 16 / 10 }, true),
        predicateCase("isGameMetadata rejects an upper-case slug", isGameMetadata, withKey(VALID.metadata, "slug", "Fixture"), false),
        predicateCase("isGameMetadata rejects a slug with a slash", isGameMetadata, withKey(VALID.metadata, "slug", "a/b"), false),
        predicateCase("isGameMetadata rejects a fractional year", isGameMetadata, withKey(VALID.metadata, "year", 1990.5), false),
        predicateCase("isGameMetadata rejects a zero aspect ratio", isGameMetadata, withKey(VALID.metadata, "aspectRatio", 0), false),
        predicateCase("isGameMetadata rejects an empty hint", isGameMetadata, withKey(VALID.metadata, "hints", [""]), false),
        predicateCase("isGameMetadata rejects a missing status", isGameMetadata, withKey(VALID.metadata, "status"), false),

        // isDosboxSettings
        predicateCase("isDosboxSettings accepts an empty object", isDosboxSettings, {}, true),
        predicateCase("isDosboxSettings accepts cga at fixed cycles", isDosboxSettings, { machine: "cga", cycles: "fixed 600", memsize: 1, aspect: true }, true),
        predicateCase("isDosboxSettings rejects an unknown machine", isDosboxSettings, { machine: "pcjr" }, false),
        predicateCase("isDosboxSettings rejects a zero memsize", isDosboxSettings, { memsize: 0 }, false),
        predicateCase("isDosboxSettings rejects a numeric cycles", isDosboxSettings, { cycles: 600 }, false),

        // isGameLoad
        predicateCase("isGameLoad accepts source and autoexec alone", isGameLoad, VALID.load, true),
        predicateCase("isGameLoad accepts stage, overlay and dosbox", isGameLoad, { ...VALID.load, stage: "GAME", overlay: { "GAME.CFG": "a/b" }, dosbox: { machine: "cga" } }, true),
        predicateCase("isGameLoad rejects an empty autoexec", isGameLoad, withKey(VALID.load, "autoexec", []), false),
        predicateCase("isGameLoad rejects an overlay array", isGameLoad, withKey(VALID.load, "overlay", ["GAME.CFG"]), false),
        predicateCase("isGameLoad rejects an overlay with an empty file", isGameLoad, withKey(VALID.load, "overlay", { "GAME.CFG": "" }), false),
        predicateCase("isGameLoad rejects a missing source", isGameLoad, withKey(VALID.load, "source"), false),

        // isGameSaves
        predicateCase("isGameSaves accepts key and method", isGameSaves, VALID.saves, true),
        predicateCase("isGameSaves accepts files", isGameSaves, { ...VALID.saves, files: ["SAVE.*"] }, true),
        predicateCase("isGameSaves rejects an empty key", isGameSaves, withKey(VALID.saves, "key", ""), false),
        predicateCase("isGameSaves rejects a non-string file", isGameSaves, withKey(VALID.saves, "files", [1]), false),

        // control policies
        predicateCase("isKeyboardPolicy accepts a reject list of codes", isKeyboardPolicy, { enabled: true, reject: ["F11", "Escape"] }, true),
        predicateCase("isKeyboardPolicy rejects a code with a space", isKeyboardPolicy, { reject: ["Key A"] }, false),
        predicateCase("isMousePolicy accepts a disabled absolute mouse", isMousePolicy, { enabled: false, touch: "absolute", pointerLock: false, sensitivity: 2 }, true),
        predicateCase("isMousePolicy rejects an unknown touch mode", isMousePolicy, { touch: "relative" }, false),
        predicateCase("isMousePolicy rejects a zero sensitivity", isMousePolicy, { sensitivity: 0 }, false),
        predicateCase("isMousePolicy accepts a positive scale", isMousePolicy, { scale: { x: 0.5, y: 1 } }, true),
        predicateCase("isMousePolicy rejects a scale with a zero axis", isMousePolicy, { scale: { x: 0.5, y: 0 } }, false),
        predicateCase("isLayoutComponent accepts a bare d-pad", isLayoutComponent, { component: "dpad" }, true),
        predicateCase("isLayoutComponent accepts a mapped d-pad in a region", isLayoutComponent, { component: "dpad", region: "left", map: { up: KEY_ENTER }, diagonals: false }, true),
        predicateCase("isLayoutComponent accepts a key with a label and code", isLayoutComponent, { component: "key", label: "FIRE", code: "Space", region: "lower-right" }, true),
        predicateCase("isLayoutComponent accepts each group", isLayoutComponent, { component: "letters" }, true),
        predicateCase("isLayoutComponent accepts letters in columns", isLayoutComponent, { component: "letters", columns: 4 }, true),
        predicateCase("isLayoutComponent accepts a keyboard opening on numbers", isLayoutComponent, { component: "keyboard", pane: "numbers" }, true),
        predicateCase("isLayoutComponent accepts a keyboard opening on the arrows", isLayoutComponent, { component: "keyboard", pane: "arrows" }, true),
        predicateCase("isLayoutComponent rejects an unknown keyboard pane", isLayoutComponent, { component: "keyboard", pane: "symbols" }, false),
        predicateCase("isLayoutComponent rejects zero columns", isLayoutComponent, { component: "letters", columns: 0 }, false),
        predicateCase("isLayoutComponent rejects fractional columns", isLayoutComponent, { component: "digits", columns: 2.5 }, false),
        predicateCase("isLayoutComponent accepts an inline component", isLayoutComponent, { component: "keys", inline: true, keys: [{ label: "A", code: "KeyA" }] }, true),
        predicateCase("isLayoutComponent rejects a non-boolean inline", isLayoutComponent, { component: "dpad", inline: 1 }, false),
        predicateCase("isLayoutComponent accepts a keys row", isLayoutComponent, { component: "keys", keys: [{ label: "Enter", code: "Enter" }, { label: "Esc", code: "Escape" }] }, true),
        predicateCase("isLayoutComponent rejects an empty keys row", isLayoutComponent, { component: "keys", keys: [] }, false),
        predicateCase("isLayoutComponent rejects a keys row with a bad code", isLayoutComponent, { component: "keys", keys: [{ label: "A", code: "Key A" }] }, false),
        predicateCase("isLayoutComponent rejects an unknown component", isLayoutComponent, { component: "trackpad" }, false),
        predicateCase("isLayoutComponent rejects an unknown region", isLayoutComponent, { component: "digits", region: "middle" }, false),
        predicateCase("isLayoutComponent rejects a key without a label", isLayoutComponent, { component: "key", code: "Space" }, false),
        predicateCase("isLayoutComponent rejects a key with a bad code", isLayoutComponent, { component: "key", label: "A", code: "Key A" }, false),
        predicateCase("isTouchLayout accepts an empty object", isTouchLayout, {}, true),
        predicateCase("isTouchLayout accepts lists per orientation", isTouchLayout, { landscape: [{ component: "dpad" }], portrait: [{ component: "fkeys" }] }, true),
        predicateCase("isTouchLayout rejects a list with a bad component", isTouchLayout, { landscape: [{ component: "key" }] }, false),
        predicateCase("isTouchLayout rejects a non-list orientation", isTouchLayout, { portrait: { component: "dpad" } }, false),
        predicateCase("isGameControls accepts an empty object", isGameControls, {}, true),
        predicateCase("isGameControls rejects a bad keyboard policy", isGameControls, { keyboard: { enabled: "yes" } }, false),

        // isGameManifest and manifestProblem
        predicateCase("isGameManifest accepts the fixture manifest", isGameManifest, VALID, true),
        predicateCase("isGameManifest rejects a missing controls part", isGameManifest, withKey(VALID, "controls"), false),
        valueCase("manifestProblem is null for the fixture", () => manifestProblem(VALID), null),
        valueCase("manifestProblem names a missing part", () => manifestProblem(withKey(VALID, "saves")), "manifest has no saves"),
        valueCase("manifestProblem names an invalid part", () => manifestProblem(withKey(VALID, "load", { source: "x" })), "manifest load is invalid"),
        valueCase("manifestProblem names a non-object", () => manifestProblem("manifest"), "manifest is not an object"),

        // parseManifest
        valueCase("parseManifest returns the parsed manifest without its $schema key", () => parseManifest(JSON.stringify({ $schema: "./x.json", ...VALID })), VALID),
        throwsCase("parseManifest names the source on bad JSON", () => parseManifest("{", "kb/manifest.json"), "kb/manifest.json: not JSON"),
        throwsCase("parseManifest names the failing part", () => parseManifest(JSON.stringify(withKey(VALID, "metadata"))), "manifest has no metadata"),

        // dosboxConfFor
        valueCase("dosboxConfFor writes the template for a plain load", () => dosboxConfFor(VALID.load),
            "[sdl]\nautolock=true\n\n[dosbox]\nmachine=svga_s3\nmemsize=16\n\n[cpu]\ncore=auto\ncputype=auto\ncycles=auto\n\n[render]\naspect=false\n\n[autoexec]\nmount c .\nc:\nGAME.EXE\n"),
        valueCase("dosboxConfFor applies dosbox settings and several autoexec lines", () => dosboxConfFor({ ...VALID.load, dosbox: { machine: "cga", cycles: "fixed 600", memsize: 4, aspect: true }, autoexec: ["SBFMDRV.COM", "T.EXE"] }),
            "[sdl]\nautolock=true\n\n[dosbox]\nmachine=cga\nmemsize=4\n\n[cpu]\ncore=auto\ncputype=auto\ncycles=fixed 600\n\n[render]\naspect=true\n\n[autoexec]\nmount c .\nc:\nSBFMDRV.COM\nT.EXE\n"),
        valueCase("dosboxConfFor changes into the stage directory", () => dosboxConfFor({ ...VALID.load, stage: "SIMCITY" }).split("\n").slice(-4),
            ["c:", "cd SIMCITY", "GAME.EXE", ""]),

        // entriesFor over the fixture folder
        valueCase("entriesFor lists the folder, its directories and the .jsdos entries", () => entriesFor(VALID, REPO_ROOT).map((entry) => entry.name),
            ["DATA/", "DATA/LEVEL1.DAT", "GAME.CFG", "GAME.EXE", ".jsdos/", ".jsdos/dosbox.conf", ".jsdos/jsdos.json"]),
        valueCase("entriesFor replaces an overlaid file's bytes", () => {
            const manifest = { ...VALID, load: { ...VALID.load, overlay: { "GAME.CFG": "tests/support/fixtures/manifest-game-GAME.CFG" } } };
            return new TextDecoder().decode(entriesFor(manifest, REPO_ROOT).find((entry) => entry.name === "GAME.CFG")?.data);
        }, "overlaid\r\n"),
        valueCase("entriesFor adds an overlay file the folder lacks", () => {
            const manifest = { ...VALID, load: { ...VALID.load, overlay: { "EXTRA.TXT": "tests/support/fixtures/manifest-game-GAME.CFG" } } };
            return entriesFor(manifest, REPO_ROOT).map((entry) => entry.name).includes("EXTRA.TXT");
        }, true),
        valueCase("entriesFor stages the folder under the stage directory with the conf outside it", () => entriesFor({ ...VALID, load: { ...VALID.load, stage: "GAME" } }, REPO_ROOT).map((entry) => entry.name),
            ["GAME/", "GAME/DATA/", "GAME/DATA/LEVEL1.DAT", "GAME/GAME.CFG", "GAME/GAME.EXE", ".jsdos/", ".jsdos/dosbox.conf", ".jsdos/jsdos.json"]),
        valueCase("the packed archive reads back its names and the generated conf", () => {
            const archive = zip(entriesFor(VALID, REPO_ROOT));
            return { names: namesIn(archive).length, conf: textOf(archive, ".jsdos/dosbox.conf") === dosboxConfFor(VALID.load), game: textOf(archive, "GAME.EXE") };
        }, { names: 7, conf: true, game: "game\r\n" }),

        // the committed schema
        valueCase("manifest.schema.json matches what the schema script writes", () => readFileSync(SCHEMA_FILE, "utf8") === schemaText(), true),
        valueCase("the schema requires the four parts", () => MANIFEST_SCHEMA.required, ["metadata", "load", "saves", "controls"]),
    ],
};

export default testFile;
