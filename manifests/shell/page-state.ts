// realizes: docs/deployment-manifest-spec.md > §2.3 Page shell (the state layer, with no DOM access)

// Type dependencies:
import type { ControlsConfig, InputSurface, InputTarget, KeyCode } from "../../src/index.ts";   // What the runtime takes from the controls
import type { DpadComponent, GameManifest, KeyboardPane, KeyboardStyle, LandscapeRegion, LayoutComponent } from "./manifest.types.ts";   // What the page reads

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "landscape" | "portrait"
// Which layout list is in effect.
export type Orientation = "landscape" | "portrait";

// INTERFACE :: {label:STRING, code:keyCode, wide:BOOLEAN, pane:"letters"|"numbers"?}
// One keycap of a group or keyboard component; a key with a pane switches the keyboard to it instead of sending a code.
export interface GroupKey {
    readonly label: string;                                        // Printed on the key
    readonly code: KeyCode;                                        // Sent while pressed; "" for a pane switch
    readonly wide: boolean;                                        // Drawn wider than its row mates
    readonly pane?: KeyboardPane;                                  // The pane this key shows
    readonly shifted?: string;                                     // The label while Shift is latched, for keys whose glyph changes
    readonly repeat?: boolean;                                     // Repeats while held, as a real key does; the arrows
}

// INTERFACE :: {restart:STRING, clear:STRING}
// The two confirm questions.
export interface ConfirmTexts {
    readonly restart: string;                                      // Before a restart
    readonly clear: string;                                        // Before clearing saves
}

// INTERFACE :: {href:STRING, name:STRING, meta:STRING, played:BOOLEAN}
// One line of the games index, derived from a manifest's metadata.
export interface IndexEntry {
    readonly href: string;                                         // Where the page is, from the index
    readonly name: string;                                         // Display name
    readonly meta: string;                                         // "year · genre", or the genre alone
    readonly played: boolean;                                      // Whether any check beyond nothing passed; the index marks the rest
}

// INTERFACE :: {startedAt:NUMBER, problem:STRING}
// What the dialog footer is computed from.
export interface FooterState {
    readonly startedAt: number;                                    // performance.now() at the last boot
    readonly problem: string;                                      // The last save failure, or ""
}

/**
 *
 * Constants
 *
 */

const key = (code: string): InputTarget => ({ kind: "key", code });                     // Shorthand for a key target
const g = (label: string, code: KeyCode, wide = false): GroupKey => ({ label, code, wide });   // Shorthand for a group key
const gs = (label: string, shifted: string, code: KeyCode): GroupKey => ({ label, code, wide: false, shifted });   // A key whose glyph shifts
const letterKey = (letter: string): GroupKey => gs(letter.toLowerCase(), letter, `Key${letter}`);   // A letter: lower case, upper case while Shift is latched
const DEFAULT_DPAD = { up: key("ArrowUp"), down: key("ArrowDown"), left: key("ArrowLeft"), right: key("ArrowRight") } as const;   // Arrows
const DEFAULT_LAYOUT: ReadonlyArray<LayoutComponent> = [                                // A d-pad with Enter and Escape
    { component: "dpad", region: "left" },
    { component: "key", label: "Enter", code: "Enter", region: "lower-right" },
    { component: "key", label: "Esc", code: "Escape", region: "lower-right" },
];
const MODIFIERS: ReadonlySet<KeyCode> = new Set(["ShiftLeft", "ControlLeft", "AltLeft"]);   // The latching keys

// The fixed groups, as rows of keys.
export const GROUP_ROWS: Readonly<Record<"modifiers" | "digits" | "fkeys" | "letters", ReadonlyArray<ReadonlyArray<GroupKey>>>> = {
    modifiers: [[g("Shift", "ShiftLeft"), g("Ctrl", "ControlLeft"), g("Alt", "AltLeft")]],
    digits: [[gs("1", "!", "Digit1"), gs("2", "@", "Digit2"), gs("3", "#", "Digit3"), gs("4", "$", "Digit4"), gs("5", "%", "Digit5"), gs("6", "^", "Digit6"), gs("7", "&", "Digit7"), gs("8", "*", "Digit8"), gs("9", "(", "Digit9"), gs("0", ")", "Digit0")]],
    fkeys: [
        [g("F1", "F1"), g("F2", "F2"), g("F3", "F3"), g("F4", "F4"), g("F5", "F5"), g("F6", "F6")],
        [g("F7", "F7"), g("F8", "F8"), g("F9", "F9"), g("F10", "F10"), g("F11", "F11"), g("F12", "F12")],
    ],
    letters: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) => row.split("").map((letter) => letterKey(letter))),
};

const arrow = (label: string, code: KeyCode, wide = true): GroupKey => ({ label, code, wide, repeat: true });   // An arrow key: repeats while held
const SPACER: GroupKey = { label: "", code: "", wide: true };                                            // An empty place in a row
const BOTTOM: ReadonlyArray<GroupKey> = [g("Ctrl", "ControlLeft"), g("Alt", "AltLeft"), g("Space", "Space", true), g("Enter", "Enter", true)];   // Every pane's last row
// INTERFACE :: {title:STRING, items:[menuItem]}
// One pull-down of the QBasic-style menu bar: a title on the bar (first letter highlighted) and the dialog items it drops.
export type MenuItem = "fullscreen" | "touch" | "menubar" | "keyboard" | "theme" | "mute" | "restart" | "clear";
export interface MenuBarMenu {
    readonly title: string;                                        // On the bar: "Game"
    readonly items: ReadonlyArray<MenuItem>;                       // The buttons it drops, in order
}
// The menu bar, left to right: what the game does, how it is shown, what it sounds like.
export const MENU_BAR: ReadonlyArray<MenuBarMenu> = [
    { title: "Game", items: ["restart", "clear"] },
    { title: "View", items: ["fullscreen", "touch", "menubar", "keyboard", "theme"] },
    { title: "Sound", items: ["mute"] },
];
// The tabs above the keyboard, in order, with their labels.
export const KEYBOARD_TABS: ReadonlyArray<{ readonly pane: KeyboardPane; readonly label: string }> = [
    { pane: "letters", label: "ABC" }, { pane: "numbers", label: "123" }, { pane: "arrows", label: "Nav" },
];
// INTERFACE :: {id:keyboardStyle, label:STRING}
// One keyboard style on the View toggle.
export interface KeyboardStyleChoice {
    readonly id: KeyboardStyle;
    readonly label: string;                                        // On the toggle: "Compass"
    readonly description: string;                                  // In the chooser: what the style looks like
}
// The styles in cycling order.
export const KEYBOARD_STYLES: ReadonlyArray<KeyboardStyleChoice> = [
    { id: "tabs", label: "Tabs", description: "ABC/123/Nav" },
    { id: "phone", label: "Phone", description: "Mobile Phone" },
    { id: "compass", label: "Compass", description: "Full Keyboard With D-Pad" },
];

// HELPER :: STRING?, keyboardStyle -> keyboardStyle
// The remembered style when it is one of the set, else the fallback (the manifest's, or tabs).
export const keyboardStyleFrom = (stored: string | null, fallback: KeyboardStyle = "tabs"): KeyboardStyle => KEYBOARD_STYLES.find((style) => style.id === stored)?.id ?? fallback;

// HELPER :: keyboardStyle -> keyboardStyle
// The style after this one on the toggle, wrapping to the first.
export const nextKeyboardStyle = (id: KeyboardStyle): KeyboardStyle => KEYBOARD_STYLES[(KEYBOARD_STYLES.findIndex((style) => style.id === id) + 1) % KEYBOARD_STYLES.length]?.id ?? "tabs";

// HELPER :: keyboardStyle -> STRING
// The toggle's label for a style.
export const keyboardStyleLabel = (id: KeyboardStyle): string => `Keyboard: ${KEYBOARD_STYLES.find((style) => style.id === id)?.label ?? "Tabs"}`;

// HELPER :: keyboardStyle -> [{pane, label}]
// The tabs for a style: only the tabs style has a tab row; the others switch panes from keys on the bottom row.
export const keyboardTabsFor = (style: KeyboardStyle): ReadonlyArray<{ readonly pane: KeyboardPane; readonly label: string }> =>
    style === "tabs" ? KEYBOARD_TABS : [];

// HELPER :: keyboardStyle -> "row" | "block"
// What sits above the panes: the slim Esc and F-key row, or the compass block with the compass.
export const keyboardTopFor = (style: KeyboardStyle): "row" | "block" => style === "compass" ? "block" : "row";
// The compass-style block above the panes: a compass d-pad with Esc at its centre and the numpad corners as diagonals, and
// beside it the function keys in two rows with the editing keys under them.
export const COMPASS_KEYS: ReadonlyArray<ReadonlyArray<GroupKey>> = [
    [arrow("\u2196", "Numpad7"), arrow("\u25b2", "ArrowUp"), arrow("\u2197", "Numpad9")],
    [arrow("\u25c0", "ArrowLeft"), g("Esc", "Escape"), arrow("\u25b6", "ArrowRight")],
    [arrow("\u2199", "Numpad1"), arrow("\u25bc", "ArrowDown"), arrow("\u2198", "Numpad3")],
];
export const COMPASS_SIDE: ReadonlyArray<ReadonlyArray<GroupKey>> = [
    GROUP_ROWS.fkeys[0] ?? [],
    GROUP_ROWS.fkeys[1] ?? [],
    [g("Ins", "Insert"), g("Del", "Delete"), g("Home", "Home"), g("End", "End"), g("PgUp", "PageUp"), g("PgDn", "PageDown")],   // Tab is on the 123 pane
];
// The fixed row above every pane: Esc and the function keys, as on a real keyboard.
export const KEYBOARD_TOP_ROW: ReadonlyArray<GroupKey> = [g("Esc", "Escape"), ...(GROUP_ROWS.fkeys[0] ?? []), ...(GROUP_ROWS.fkeys[1] ?? [])];
// The phone-style keyboard's three panes, switched by the tabs above it. Shift, Ctrl and Alt latch; every pane ends in Ctrl,
// Alt, Space and Enter. The arrows pane is a compass: the arrows with the numpad corners as diagonals, the editing keys around.
export const KEYBOARD_PANES: Readonly<Record<KeyboardPane, ReadonlyArray<ReadonlyArray<GroupKey>>>> = {
    letters: [
        GROUP_ROWS.letters[0] ?? [],
        [...(GROUP_ROWS.letters[1] ?? []), gs(";", ":", "Semicolon")],
        [g("Shift", "ShiftLeft", true), ...(GROUP_ROWS.letters[2] ?? []), gs(",", "<", "Comma"), gs(".", ">", "Period"), g("\u232b", "Backspace", true)],
        BOTTOM,
    ],
    numbers: [
        GROUP_ROWS.digits[0] ?? [],
        [gs("-", "_", "Minus"), gs("=", "+", "Equal"), gs("[", "{", "BracketLeft"), gs("]", "}", "BracketRight"), gs("\\", "|", "Backslash"), gs("'", "\"", "Quote"), gs("`", "~", "Backquote"), gs("/", "?", "Slash"), g("Tab", "Tab")],
        [g("Shift", "ShiftLeft", true), gs(",", "<", "Comma"), gs(".", ">", "Period"), gs(";", ":", "Semicolon"), g("\u232b", "Backspace", true)],
        BOTTOM,
    ],
    arrows: [
        [g("Ins", "Insert"), arrow("\u2196", "Numpad7"), arrow("\u25b2", "ArrowUp"), arrow("\u2197", "Numpad9"), g("Del", "Delete")],
        [g("Home", "Home"), arrow("\u25c0", "ArrowLeft"), g("Esc", "Escape", true), arrow("\u25b6", "ArrowRight"), g("End", "End")],
        [g("PgUp", "PageUp"), arrow("\u2199", "Numpad1"), arrow("\u25bc", "ArrowDown"), arrow("\u2198", "Numpad3"), g("PgDn", "PageDown")],
        BOTTOM,
    ],
};
// A pane switch: shows the pane instead of sending a code, like the 123 and ABC keys of a phone keyboard.
const toPane = (label: string, pane: KeyboardPane): GroupKey => ({ label, code: "", wide: false, pane });
// The compass style's panes: letters and numbers as in the phone style, with the switch at the start of the bottom row and
// no Nav pane, since the compass above covers it.
export const COMPASS_PANES: Readonly<Partial<Record<KeyboardPane, ReadonlyArray<ReadonlyArray<GroupKey>>>>> = {
    letters: [...KEYBOARD_PANES.letters.slice(0, -1), [toPane("123", "numbers"), ...BOTTOM]],
    numbers: [...KEYBOARD_PANES.numbers.slice(0, -1), [toPane("ABC", "letters"), ...BOTTOM]],
};
// The phone style's panes: letters and numbers, switched from a 123 / ABC key at the start of the bottom row as on a phone
// keyboard; no tab row and no Nav pane.
export const PHONE_PANES: Readonly<Partial<Record<KeyboardPane, ReadonlyArray<ReadonlyArray<GroupKey>>>>> = {
    letters: [...KEYBOARD_PANES.letters.slice(0, -1), [toPane("123", "numbers"), ...BOTTOM]],
    numbers: [...KEYBOARD_PANES.numbers.slice(0, -1), [toPane("ABC", "letters"), ...BOTTOM]],
};
// HELPER :: keyboardStyle -> {keyboardPane: [[groupKey]]}
// The panes a style shows.
export const keyboardPanesFor = (style: KeyboardStyle): Readonly<Partial<Record<KeyboardPane, ReadonlyArray<ReadonlyArray<GroupKey>>>>> =>
    style === "compass" ? COMPASS_PANES : style === "phone" ? PHONE_PANES : KEYBOARD_PANES;
const ALPHABET: ReadonlyArray<GroupKey> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letterKey);   // Letters in order
const DIGITS: ReadonlyArray<GroupKey> = GROUP_ROWS.digits[0] ?? [];                                                        // 1 to 0 in order

/**
 *
 * Functions
 *
 */

// HELPER :: gameManifest -> STRING
// The splash heading: the title when given, else the name in capitals.
export const headingFor = (manifest: GameManifest): string => manifest.metadata.title ?? manifest.metadata.name.toUpperCase();

// HELPER :: gameManifest -> [STRING]
// The hint lines shown under PLAY; none when the manifest has none.
export const hintsFor = (manifest: GameManifest): ReadonlyArray<string> => manifest.metadata.hints ?? [];

// HELPER :: gameManifest -> NUMBER
// The picture aspect ratio handed to the display.
export const aspectRatioFor = (manifest: GameManifest): number => manifest.metadata.aspectRatio ?? 4 / 3;

// HELPER :: gameManifest -> confirmTexts
// The restart and clear questions, naming the game and its save method.
export const confirmTextsFor = (manifest: GameManifest): ConfirmTexts => ({
    restart: `Restart the game? Your ${manifest.saves.method}.`,
    clear: `Delete every save for ${manifest.metadata.name} and restart?`,
});

// HELPER :: gameManifest, orientation -> [layoutComponent]
// The components for an orientation: the manifest's list, else the other orientation's list, else the default.
export const layoutFor = (manifest: GameManifest, orientation: Orientation): ReadonlyArray<LayoutComponent> => {
    const touch = manifest.controls.touch;
    return touch?.[orientation] ?? touch?.[orientation === "landscape" ? "portrait" : "landscape"] ?? DEFAULT_LAYOUT;
};

// HELPER :: layoutComponent -> landscapeRegion
// Where a component sits in landscape: its region, else the default for its kind.
export const regionOf = (component: LayoutComponent): LandscapeRegion =>
    component.region ?? (component.component === "dpad" ? "left" : component.component === "key" || component.component === "keys" ? "lower-right" : "upper-right");

// HELPER :: gameManifest -> dpadComponent?
// The d-pad the page builds, if any orientation places one; the landscape list wins when both do.
export const dpadFor = (manifest: GameManifest): DpadComponent | null => {
    for (const orientation of ["landscape", "portrait"] as const) {
        const found = layoutFor(manifest, orientation).find((component): component is DpadComponent => component.component === "dpad");
        if (found !== undefined) return found;
    }
    return null;
};

// HELPER :: gameManifest, inputSurface? -> controlsConfig
// The runtime's controls config from the manifest's policy and the d-pad surface built for it; keys are sent by the page, not here.
// NOTE: The keyboard reject list becomes a filter that rejects those codes; everything else maps field for field.
export const controlsConfigFor = (manifest: GameManifest, dpadSurface: InputSurface | null): ControlsConfig => {
    const { keyboard, mouse } = manifest.controls;
    const rejected = new Set(keyboard?.reject ?? []);
    const dpad = dpadFor(manifest);
    return {
        keyboard: { enabled: keyboard?.enabled ?? true, ...(rejected.size > 0 ? { filter: (code: string) => !rejected.has(code) } : {}) },
        mouse: { enabled: mouse?.enabled ?? true, touch: mouse?.touch ?? "absolute", pointerLock: mouse?.pointerLock ?? false, ...(mouse?.sensitivity !== undefined ? { sensitivity: mouse.sensitivity } : {}), ...(mouse?.scale !== undefined ? { scale: mouse.scale } : {}), ...(mouse?.offset !== undefined ? { offset: mouse.offset } : {}) },
        dpads: dpadSurface === null || dpad === null ? [] : [{ surface: dpadSurface, diagonals: dpad.diagonals ?? true, map: dpad.map ?? DEFAULT_DPAD }],
        buttons: [],
    };
};

// HELPER :: "letters" | "digits", NUMBER -> [[groupKey]]
// Letters in alphabetical order, or digits in order, as rows of the given width; the last row holds the remainder.
export const rowsOf = (group: "letters" | "digits", columns: number): ReadonlyArray<ReadonlyArray<GroupKey>> => {
    const keys = group === "letters" ? ALPHABET : DIGITS;
    const rows: GroupKey[][] = [];
    for (let i = 0; i < keys.length; i += columns) rows.push(keys.slice(i, i + columns));
    return rows;
};

// HELPER :: keyCode -> BOOLEAN
// Whether a code is one of the latching modifiers.
export const isModifier = (code: KeyCode): boolean => MODIFIERS.has(code);

// HELPER :: SET(keyCode), keyCode -> SET(keyCode)
// The latches after tapping a modifier: toggled in or out; a plain key leaves them alone.
export const toggledLatch = (latches: ReadonlySet<KeyCode>, code: KeyCode): ReadonlySet<KeyCode> => {
    if (!isModifier(code)) return latches;
    const next = new Set(latches);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
};

// HELPER :: SET(keyCode), keyCode -> [keyCode]
// The codes to hold for one key press, modifiers first so the game sees them down before the key; released in reverse.
export const chordFor = (latches: ReadonlySet<KeyCode>, code: KeyCode): ReadonlyArray<KeyCode> => [...latches, code];

// HELPER :: NUMBER, NUMBER -> STRING
// "Play time m:ss", or h:mm:ss past an hour.
export const playTimeText = (now: number, startedAt: number): string => {
    const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
    const pad = (n: number): string => String(n).padStart(2, "0");
    return h > 0 ? `Play time ${h}:${pad(m)}:${pad(sec)}` : `Play time ${m}:${pad(sec)}`;
};

// CONSTANTS :: the browser-storage keys of the remembered settings, shared by every game on an origin
export const SETTING_KEYS = { touch: "dos-shell.touch", menuBar: "dos-shell.menu-bar", theme: "dos-shell.theme", screen: "dos-shell.screen", keyboard: "dos-shell.keyboard" } as const;

// INTERFACE :: {id:STRING, label:STRING, fullscreen:BOOLEAN, stretch:BOOLEAN, bar:BOOLEAN}
// One screen mode: whether the browser goes fullscreen, whether the picture is stretched to the edges regardless of aspect, and
// whether the menu bar stays on screen (forced on, so leaving needs no Escape) or every bit of chrome hides until the top edge
// is touched. Normal is the ordinary layout.
export type ScreenModeId = "normal" | "fullscreen" | "fullscreen-stretch" | "fullscreen-bar" | "fullscreen-stretch-bar" | "stretch" | "stretch-bar";
export interface ScreenMode {
    readonly id: ScreenModeId;
    readonly label: string;
    readonly fullscreen: boolean;
    readonly stretch: boolean;
    readonly bar: boolean;
}
// The modes offered under Screen mode, normal first. Without the bar, the top edge of the window brings it back.
export const SCREEN_MODES: ReadonlyArray<ScreenMode> = [
    { id: "normal", label: "Normal", fullscreen: false, stretch: false, bar: true },
    { id: "fullscreen", label: "Fullscreen", fullscreen: true, stretch: false, bar: false },
    { id: "fullscreen-stretch", label: "Fullscreen, stretched", fullscreen: true, stretch: true, bar: false },
    { id: "fullscreen-bar", label: "Fullscreen with menu bar", fullscreen: true, stretch: false, bar: true },
    { id: "fullscreen-stretch-bar", label: "Fullscreen, stretched, with menu bar", fullscreen: true, stretch: true, bar: true },
    { id: "stretch", label: "Stretched", fullscreen: false, stretch: true, bar: false },
    { id: "stretch-bar", label: "Stretched with menu bar", fullscreen: false, stretch: true, bar: true },
];
export const NORMAL_SCREEN: ScreenMode = SCREEN_MODES[0] as ScreenMode;

// HELPER :: STRING? -> screenMode
// The remembered screen mode when it is one of the set, else normal.
export const screenModeFrom = (stored: string | null): ScreenMode => SCREEN_MODES.find((mode) => mode.id === stored) ?? NORMAL_SCREEN;

// INTERFACE :: {id:STRING, label:STRING}
// One page theme: the data-theme value the page's tokens switch on, and its name on the toggle.
export type ThemeId = "black" | "dark-grey" | "grey" | "blue" | "teal" | "beige" | "off-white";
export interface Theme {
    readonly id: ThemeId;
    readonly label: string;
}
// The fixed set, in cycling order; the first is the default and the look every page had before themes.
export const THEMES: ReadonlyArray<Theme> = [
    { id: "black", label: "Black" },
    { id: "dark-grey", label: "Dark grey" },
    { id: "grey", label: "Grey" },
    { id: "blue", label: "Blue" },
    { id: "teal", label: "Teal" },
    { id: "beige", label: "Beige" },
    { id: "off-white", label: "Off white" },
];

// HELPER :: STRING? -> themeId
// The remembered theme when it is one of the set, else the default.
export const themeFrom = (stored: string | null): ThemeId => THEMES.find((theme) => theme.id === stored)?.id ?? "black";

// HELPER :: themeId -> themeId
// The theme after this one on the toggle, wrapping to the first.
export const nextTheme = (id: ThemeId): ThemeId => THEMES[(THEMES.findIndex((theme) => theme.id === id) + 1) % THEMES.length]?.id ?? "black";

// HELPER :: themeId -> STRING
// The toggle's label for a theme.
export const themeLabel = (id: ThemeId): string => `Theme: ${THEMES.find((theme) => theme.id === id)?.label ?? "Black"}`;

// HELPER :: STRING?, BOOLEAN -> BOOLEAN
// A remembered on/off setting: "on" or "off" as stored, else the device default.
export const settingFrom = (stored: string | null, fallback: boolean): boolean => stored === "on" ? true : stored === "off" ? false : fallback;

// HELPER :: BOOLEAN -> STRING
// How an on/off setting is stored.
export const settingText = (on: boolean): string => on ? "on" : "off";

// HELPER :: gameManifest, STRING? -> indexEntry
// The games index line for a manifest: its page under base (the index's own folder by default), the name, the year and genre,
// and whether anything has been verified, so an index built from every manifest marks the pages nobody has played yet.
export const indexEntryFor = (manifest: GameManifest, base = "./"): IndexEntry => ({
    href: `${base}${manifest.metadata.slug}/`,
    name: manifest.metadata.name,
    meta: manifest.metadata.year === undefined ? manifest.metadata.genre : `${manifest.metadata.year} · ${manifest.metadata.genre}`,
    played: manifest.metadata.status.verified.length > 0,
});

// HELPER :: footerState, NUMBER -> STRING
// The dialog footer: the last problem when there is one, else the play time.
export const footerText = (state: FooterState, now: number): string => state.problem !== "" ? state.problem : playTimeText(now, state.startedAt);
