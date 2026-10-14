// realizes: docs/deployment-manifest-spec.md > §2.3 Page shell (the state layer)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    GROUP_ROWS,                                                  // The fixed key groups
    KEYBOARD_PANES,                                              // The phone-style keyboard's panes
    KEYBOARD_TABS,                                               // The tabs above it
    KEYBOARD_TOP_ROW,                                            // Esc and the function keys
    COMPASS_KEYS,                                                // The compass
    COMPASS_SIDE,                                                   // The keys beside it
    keyboardTabsFor,                                             // Function under test
    keyboardPanesFor,                                            // Function under test
    keyboardStyleFrom,                                           // Function under test
    keyboardTopFor,                                              // Function under test
    nextKeyboardStyle,                                           // Function under test
    keyboardStyleLabel,                                          // Function under test
    MENU_BAR,                                                    // The pull-down menus
    aspectRatioFor,                                              // Function under test
    chordFor,                                                    // Function under test
    confirmTextsFor,                                             // Function under test
    controlsConfigFor,                                           // Function under test
    dpadFor,                                                     // Function under test
    footerText,                                                  // Function under test
    headingFor,                                                  // Function under test
    indexEntryFor,                                               // Function under test
    settingFrom,                                                 // Function under test
    settingText,                                                 // Function under test
    nextTheme,                                                   // Function under test
    themeFrom,                                                   // Function under test
    themeLabel,                                                  // Function under test
    SCREEN_MODES,                                                // The screen choices
    screenModeFrom,                                              // Function under test
    isModifier,                                                  // Function under test
    layoutFor,                                                   // Function under test
    playTimeText,                                                // Function under test
    regionOf,                                                    // Function under test
    rowsOf,                                                      // Function under test
    toggledLatch,                                                // Function under test
} from "../../manifests/shell/page-state.ts";
import { indexPageFor, shellPageFor } from "../../manifests/shell/pages.ts";   // Page fillers under test

// Type dependencies:
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner
import type { GameManifest } from "../../manifests/shell/manifest.types.ts";   // The valid shape the cases vary
import type { InputSurface } from "../../src/index.ts";          // Surfaces handed to the controls config

/**
 *
 * Constants
 *
 */

const PLAIN: GameManifest = {                                    // A manifest with no controls of its own
    metadata: { slug: "plain", name: "Plain Game", genre: "test", status: { verified: [] } },
    load: { source: "x", autoexec: ["GAME.EXE"] },
    saves: { key: "plain", method: "nothing is kept" },
    controls: {},
};
const TUNED: GameManifest = {                                    // A manifest that sets every control field
    ...PLAIN,
    metadata: { ...PLAIN.metadata, title: "TUNED!", aspectRatio: 16 / 10 },
    controls: {
        keyboard: { enabled: false, reject: ["F11"] },
        mouse: { enabled: false, touch: "none", pointerLock: true, sensitivity: 2 },
        touch: {
            landscape: [
                { component: "dpad", region: "left", diagonals: false, map: { up: { kind: "key", code: "KeyW" } } },
                { component: "letters", region: "upper-right" },
                { component: "key", label: "FIRE", code: "Space" },
            ],
        },
    },
};
const KEYS_ONLY: GameManifest = { ...PLAIN, controls: { touch: { portrait: [{ component: "fkeys" }] } } };   // No d-pad anywhere
const NOOP = (): void => {};                                     // Placeholder for surface methods
const surface = (): InputSurface => ({ addEventListener: NOOP, removeEventListener: NOOP, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }), setPointerCapture: NOOP, releasePointerCapture: NOOP } as unknown as InputSurface);

// HELPER :: STRING, (VOID -> UNKNOWN), UNKNOWN -> testCase
// Builds a case that computes a value and expects it to equal expected.
const valueCase = (label: string, compute: () => unknown, expected: unknown): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("equals the expected value", () => ({ value: compute() }), P.equals({ value: expected }))
        .start(undefined),
});

/**
 *
 * Test File
 *
 */

const testFile: TestFile = {
    label: "page state",
    cases: [
        // Presentation
        valueCase("headingFor upper-cases the name when there is no title", () => headingFor(PLAIN), "PLAIN GAME"),
        valueCase("headingFor uses the title when given", () => headingFor(TUNED), "TUNED!"),
        valueCase("aspectRatioFor defaults to 4:3", () => aspectRatioFor(PLAIN), 4 / 3),
        valueCase("aspectRatioFor uses the manifest's ratio", () => aspectRatioFor(TUNED), 16 / 10),
        valueCase("confirmTextsFor names the save method and the game", () => confirmTextsFor(PLAIN), { restart: "Restart the game? Your nothing is kept.", clear: "Delete every save for Plain Game and restart?" }),

        // Layout
        valueCase("layoutFor defaults both orientations to a d-pad with Enter and Escape", () => [layoutFor(PLAIN, "landscape"), layoutFor(PLAIN, "portrait")].map((list) => list.map((c) => c.component)),
            [["dpad", "key", "key"], ["dpad", "key", "key"]]),
        valueCase("layoutFor uses the manifest's landscape list", () => layoutFor(TUNED, "landscape").map((c) => c.component), ["dpad", "letters", "key"]),
        valueCase("layoutFor falls back to the other orientation's list", () => layoutFor(TUNED, "portrait").map((c) => c.component), ["dpad", "letters", "key"]),
        valueCase("regionOf uses the region when given and defaults by kind", () => [
            regionOf({ component: "dpad" }), regionOf({ component: "key", label: "A", code: "KeyA" }), regionOf({ component: "keys", keys: [{ label: "A", code: "KeyA" }] }), regionOf({ component: "letters" }), regionOf({ component: "digits", region: "lower-left" }),
        ], ["left", "lower-right", "lower-right", "upper-right", "lower-left"]),
        valueCase("dpadFor finds the landscape d-pad with its options", () => dpadFor(TUNED), { component: "dpad", region: "left", diagonals: false, map: { up: { kind: "key", code: "KeyW" } } }),
        valueCase("dpadFor is null when no orientation places one", () => dpadFor(KEYS_ONLY), null),
        valueCase("the groups have the expected rows and unique codes", () => {
            const rows = Object.values(GROUP_ROWS).map((group) => group.map((row) => row.length));
            const codes = Object.values(GROUP_ROWS).flat(2).map((key) => key.code);
            return { rows, unique: new Set(codes).size === codes.length };
        }, { rows: [[3], [10], [6, 6], [10, 9, 7]], unique: true }),
        valueCase("the keyboard has Esc and F1-F12 in its fixed row, three four-row panes with every letter, digit and punctuation key, arrows that repeat, Enter on every pane, and three tabs", () => {
            const flat = (pane: "letters" | "numbers" | "arrows") => KEYBOARD_PANES[pane].flat();
            const codes = (pane: "letters" | "numbers" | "arrows") => new Set(flat(pane).map((key) => key.code));
            const punctuation = ["Minus", "Equal", "BracketLeft", "BracketRight", "Backslash", "Quote", "Backquote", "Slash", "Comma", "Period", "Semicolon"];
            return {
                top: KEYBOARD_TOP_ROW.map((key) => key.code),
                rows: [KEYBOARD_PANES.letters.length, KEYBOARD_PANES.numbers.length, KEYBOARD_PANES.arrows.length],
                letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").every((l) => codes("letters").has(`Key${l}`)),
                digits: [..."1234567890"].every((d) => codes("numbers").has(`Digit${d}`)),
                punctuation: punctuation.every((code) => codes("numbers").has(code)),
                arrows: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Numpad7", "Numpad9", "Numpad1", "Numpad3"].every((code) => flat("arrows").some((key) => key.code === code && key.repeat === true)),
                centreEsc: KEYBOARD_PANES.arrows[1]?.[2]?.code === "Escape",
                lowerCase: flat("letters").filter((key) => key.code.startsWith("Key")).every((key) => key.label === key.label.toLowerCase() && key.shifted === key.label.toUpperCase()),
                enter: (["letters", "numbers", "arrows"] as const).every((pane) => KEYBOARD_PANES[pane].at(-1)?.some((key) => key.code === "Enter") === true),
                tabs: KEYBOARD_TABS.map((tab) => `${tab.pane}:${tab.label}`),
            };
        }, { top: ["Escape", ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)], rows: [4, 4, 4], letters: true, digits: true, punctuation: true, arrows: true, centreEsc: true, lowerCase: true, enter: true, tabs: ["letters:ABC", "numbers:123", "arrows:Nav"] }),
        valueCase("the digits and punctuation carry their shifted glyphs", () => {
            const shifted = (pane: "letters" | "numbers", labels: string): string => labels.split("").map((label) => KEYBOARD_PANES[pane].flat().find((key) => key.label === label)?.shifted ?? "?").join("");
            return { digits: shifted("numbers", "1290"), symbols: shifted("numbers", "-=/"), letters: shifted("letters", ";,.") };
        }, { digits: "!@()", symbols: "_+?", letters: ":<>" }),
        valueCase("rowsOf gives alphabetical letters four across with the remainder last", () => rowsOf("letters", 4).map((row) => row.map((key) => key.shifted).join("")), ["ABCD", "EFGH", "IJKL", "MNOP", "QRST", "UVWX", "YZ"]),
        valueCase("rowsOf gives digits five across with their codes", () => rowsOf("digits", 5).map((row) => row.map((key) => key.code)), [["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"], ["Digit6", "Digit7", "Digit8", "Digit9", "Digit0"]]),

        // Controls config
        valueCase("controlsConfigFor defaults keyboard on, mouse absolute, and arrows on the d-pad surface", () => {
            const config = controlsConfigFor(PLAIN, surface());
            return { keyboard: config.keyboard, mouse: config.mouse, dpads: config.dpads?.length, diagonals: config.dpads?.[0]?.diagonals, map: config.dpads?.[0]?.map, buttons: config.buttons };
        }, {
            keyboard: { enabled: true }, mouse: { enabled: true, touch: "absolute", pointerLock: false }, dpads: 1, diagonals: true,
            map: { up: { kind: "key", code: "ArrowUp" }, down: { kind: "key", code: "ArrowDown" }, left: { kind: "key", code: "ArrowLeft" }, right: { kind: "key", code: "ArrowRight" } },
            buttons: [],
        }),
        valueCase("controlsConfigFor maps every policy field, the d-pad options, and rejects listed codes", () => {
            const config = controlsConfigFor(TUNED, surface());
            return { enabled: config.keyboard?.enabled, rejectsF11: config.keyboard?.filter?.("F11"), allowsF1: config.keyboard?.filter?.("F1"), mouse: config.mouse, diagonals: config.dpads?.[0]?.diagonals, map: config.dpads?.[0]?.map };
        }, { enabled: false, rejectsF11: false, allowsF1: true, mouse: { enabled: false, touch: "none", pointerLock: true, sensitivity: 2 }, diagonals: false, map: { up: { kind: "key", code: "KeyW" } } }),
        valueCase("controlsConfigFor builds no d-pad without a surface or without a component", () => [controlsConfigFor(PLAIN, null).dpads?.length, controlsConfigFor(KEYS_ONLY, surface()).dpads?.length], [0, 0]),

        // Latches
        valueCase("isModifier knows the three latching keys", () => ["ShiftLeft", "ControlLeft", "AltLeft", "KeyA", "Enter"].map(isModifier), [true, true, true, false, false]),
        valueCase("toggledLatch adds, removes and ignores plain keys", () => {
            const one = toggledLatch(new Set(), "ShiftLeft");
            const two = toggledLatch(one, "AltLeft");
            const back = toggledLatch(two, "ShiftLeft");
            const same = toggledLatch(back, "KeyA");
            return [[...one], [...two], [...back], [...same]];
        }, [["ShiftLeft"], ["ShiftLeft", "AltLeft"], ["AltLeft"], ["AltLeft"]]),
        valueCase("chordFor holds the latches before the key", () => chordFor(new Set(["ShiftLeft"]), "KeyY"), ["ShiftLeft", "KeyY"]),
        valueCase("chordFor is just the key with no latches", () => chordFor(new Set(), "KeyY"), ["KeyY"]),

        // compass style
        valueCase("keyboardTabsFor has tabs only for the tabs style", () => [keyboardTabsFor("tabs").map((tab) => tab.pane), keyboardTabsFor("phone").length, keyboardTabsFor("compass").length], [["letters", "numbers", "arrows"], 0, 0]),
        valueCase("keyboardTopFor puts the compass block only over the compass style", () => ["tabs", "phone", "compass"].map((s) => keyboardTopFor(s as "tabs")), ["row", "row", "block"]),
        valueCase("keyboardPanesFor gives the phone style letters and numbers switched from the bottom row", () => { const panes = keyboardPanesFor("phone"); const switches = (rows: ReadonlyArray<ReadonlyArray<{ readonly pane?: string }>>) => (rows[rows.length - 1] ?? []).map((key) => key.pane).filter((pane) => pane !== undefined); return [Object.keys(panes), switches(panes.letters ?? []), switches(panes.numbers ?? [])]; }, [["letters", "numbers"], ["numbers"], ["letters"]]),
        valueCase("keyboardStyleFrom takes a known style, else the fallback", () => [keyboardStyleFrom("compass"), keyboardStyleFrom(null), keyboardStyleFrom(null, "phone"), keyboardStyleFrom("typewriter", "compass")], ["compass", "tabs", "phone", "compass"]),
        valueCase("nextKeyboardStyle cycles tabs, phone, compass", () => ["tabs", "phone", "compass"].map((s) => nextKeyboardStyle(s as "tabs")), ["phone", "compass", "tabs"]),
        valueCase("keyboardStyleLabel names the style", () => keyboardStyleLabel("compass"), "Keyboard: Compass"),
        valueCase("keyboardPanesFor gives the compass style two panes that switch from their bottom row", () => { const panes = keyboardPanesFor("compass"); const last = (rows: ReadonlyArray<ReadonlyArray<{ readonly label: string; readonly pane?: string }>>) => rows[rows.length - 1]?.[0]; return [Object.keys(panes), last(panes.letters ?? [])?.pane, last(panes.letters ?? [])?.label, last(panes.numbers ?? [])?.pane]; }, [["letters", "numbers"], "numbers", "123", "letters"]),
        valueCase("COMPASS_KEYS is three by three with Escape at the centre and the arrows on the cross", () => [COMPASS_KEYS.map((row) => row.length), COMPASS_KEYS[1]?.[1]?.code, COMPASS_KEYS[0]?.[1]?.code, COMPASS_KEYS[1]?.[0]?.code, COMPASS_KEYS[1]?.[2]?.code, COMPASS_KEYS[2]?.[1]?.code], [[3, 3, 3], "Escape", "ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"]),
        valueCase("COMPASS_SIDE holds F1 to F12 then the editing keys", () => COMPASS_SIDE.flat().map((key) => key.code), ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Insert", "Delete", "Home", "End", "PageUp", "PageDown"]),

        // Menu bar
        valueCase("MENU_BAR drops every dialog item exactly once", () => MENU_BAR.flatMap((menu) => menu.items).sort(), ["clear", "fullscreen", "keyboard", "menubar", "mute", "restart", "theme", "touch"]),

        // Remembered settings
        valueCase("settingFrom reads on and off and falls back otherwise", () => [settingFrom("on", false), settingFrom("off", true), settingFrom(null, true), settingFrom("yes", false)], [true, false, true, false]),
        valueCase("settingText round-trips through settingFrom", () => [settingFrom(settingText(true), false), settingFrom(settingText(false), true)], [true, false]),

        // Screen modes
        valueCase("SCREEN_MODES has normal, every fullscreen pairing, and the two window stretches", () => SCREEN_MODES.map((mode) => `${mode.fullscreen ? "fs" : "win"}/${mode.stretch ? "stretch" : "fit"}/${mode.bar ? "bar" : "nobar"}`),
            ["win/fit/bar", "fs/fit/nobar", "fs/stretch/nobar", "fs/fit/bar", "fs/stretch/bar", "win/stretch/nobar", "win/stretch/bar"]),
        valueCase("screenModeFrom takes a known mode and defaults to normal", () => [screenModeFrom("stretch").id, screenModeFrom(null).id, screenModeFrom("huge").id], ["stretch", "normal", "normal"]),

        // Themes
        valueCase("themeFrom takes a known theme and defaults to black", () => [themeFrom("blue"), themeFrom(null), themeFrom("neon")], ["blue", "black", "black"]),
        valueCase("nextTheme cycles through the set and wraps", () => (["black", "dark-grey", "grey", "blue", "teal", "beige", "off-white"] as const).map(nextTheme), ["dark-grey", "grey", "blue", "teal", "beige", "off-white", "black"]),
        valueCase("themeLabel names the theme on the toggle", () => themeLabel("grey"), "Theme: Grey"),

        // Pages
        valueCase("shellPageFor fills the title and name, escaped", () => shellPageFor("<title>{{title}}</title><h1>{{name}}</h1>", { ...PLAIN, metadata: { ...PLAIN.metadata, name: "Rock & Roll" } }), "<title>ROCK &amp; ROLL</title><h1>Rock &amp; Roll</h1>"),
        valueCase("indexPageFor lists games by name with the count and a base per slug", () => indexPageFor("{{count}}:{{games}}", [{ ...PLAIN, metadata: { ...PLAIN.metadata, slug: "zed", name: "Zed" } }, { ...PLAIN, metadata: { ...PLAIN.metadata, slug: "abc", name: "Abc", status: { verified: ["boot"] } } }], (slug) => slug === "zed" ? "https://z.example/zed/" : undefined).replace(/\s+/g, " ").trim(),
            '2: <a class="game" href="./abc/"><span class="name">Abc</span><span class="meta">test</span></a> <a class="game unplayed" href="https://z.example/zed/"><span class="name">Zed</span><span class="meta">test</span></a>'),

        // Index
        valueCase("indexEntryFor derives the line from metadata, marking an unplayed page", () => indexEntryFor(PLAIN), { href: "./plain/", name: "Plain Game", meta: "test", played: false }),
        valueCase("indexEntryFor shows the year before the genre and takes a base", () => indexEntryFor({ ...PLAIN, metadata: { ...PLAIN.metadata, year: 1991, status: { verified: ["boot"] } } }, "https://games.example/"), { href: "https://games.example/plain/", name: "Plain Game", meta: "1991 · test", played: true }),

        // Footer
        valueCase("playTimeText formats minutes and seconds", () => playTimeText(65000, 0), "Play time 1:05"),
        valueCase("playTimeText formats hours", () => playTimeText(3661000, 0), "Play time 1:01:01"),
        valueCase("footerText shows the problem over the play time", () => footerText({ startedAt: 0, problem: "Could not save." }, 5000), "Could not save."),
        valueCase("footerText shows the play time with no problem", () => footerText({ startedAt: 0, problem: "" }, 5000), "Play time 0:05"),
    ],
};

export default testFile;
