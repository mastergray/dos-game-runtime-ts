// realizes: docs/deployment-manifest-spec.md > §1 Shape (§1.2 declarations, §1.3 meaning, §4 validation)

// Type dependencies:
import {
    isDPadMap,                                                     // Guards a d-pad component's map
    isKeyCode,                                                     // Guards keyboard reject lists and key components
    isMouseTouchMode,                                              // Guards the mouse policy's touch mode
    type DPadMap,                                                  // Direction to target map, the runtime's own
    type KeyCode,                                                  // DOM KeyboardEvent.code value
    type MouseTouchMode,                                           // "none" | "absolute"
} from "../../src/index.ts";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {metadata:gameMetadata, load:gameLoad, saves:gameSaves, controls:gameControls}
// Everything one game page needs, in the order the player meets it.
export interface GameManifest {
    readonly metadata: GameMetadata;                               // Identity and presentation
    readonly load: GameLoad;                                       // Bundle contents and DOSBox settings
    readonly saves: GameSaves;                                     // Persistence key and the game's own save method
    readonly controls: GameControls;                               // Keyboard, mouse and touch policy
}

// INTERFACE :: {slug:STRING, name:STRING, title:STRING?, year:NUMBER?, genre:STRING, aspectRatio:NUMBER?, hints:[STRING]?, status:gameStatus}
// What the index and the title screen show.
export interface GameMetadata {
    readonly slug: string;                                         // URL segment and folder name: lower-case [a-z0-9-]
    readonly name: string;                                         // Display name: "My Game"
    readonly title?: string;                                       // Splash heading when it differs from name upper-cased
    readonly year?: number;                                        // Release year for the index line; omitted when unsure
    readonly genre: string;                                        // Index line after the year: "strategy RPG"
    readonly aspectRatio?: number;                                 // Picture aspect for DosDisplay; 4/3 when omitted
    readonly hints?: ReadonlyArray<string>;                        // Title-screen lines for every-boot prompts
    readonly status: GameStatus;                                   // What has been verified
}

// TYPE :: "boot" | "input" | "sound" | "save"
// One verification: the game boots to its title, its controls reach it, sound is heard, a save survives a reload.
export type GameCheck = "boot" | "input" | "sound" | "save";

// INTERFACE :: {verified:[gameCheck], notes:STRING?}
// The record of what was tested, so the index and a reviewer can tell a booted page from a played one.
export interface GameStatus {
    readonly verified: ReadonlyArray<GameCheck>;                   // Checks that passed; empty for an untested manifest
    readonly notes?: string;                                       // Anything a player of this page should know that is not a hint
}

// TYPE :: "svga_s3" | "vgaonly" | "ega" | "cga" | "tandy" | "hercules"
// The DOSBox machine types a manifest may select.
export type DosboxMachine = "svga_s3" | "vgaonly" | "ega" | "cga" | "tandy" | "hercules";

// INTERFACE :: {machine:dosboxMachine?, cycles:STRING?, memsize:NUMBER?, aspect:BOOLEAN?}
// The DOSBox keys any game so far has needed to change; everything else is the template.
export interface DosboxSettings {
    readonly machine?: DosboxMachine;                              // Template: svga_s3
    readonly cycles?: string;                                      // DOSBox cycles value: "auto", "fixed 600", "max"; template: auto
    readonly memsize?: number;                                     // MB, a positive integer; template: 16
    readonly aspect?: boolean;                                     // DOSBox aspect correction; template: false (the page letterboxes instead)
}

// INTERFACE :: {source:STRING, stage:STRING?, overlay:{STRING:STRING}?, dosbox:dosboxSettings?, autoexec:[STRING]}
// How the bundle is built: which files, shaped how, with what conf.
export interface GameLoad {
    readonly source: string;                                       // Game folder: absolute, or relative to the repo root
    readonly stage?: string;                                       // Pack the folder under this directory inside C:; root when omitted
    readonly overlay?: Readonly<Record<string, string>>;           // Archive path -> repo file placed over the folder before packing
    readonly dosbox?: DosboxSettings;                              // Settings that differ from the template
    readonly autoexec: ReadonlyArray<string>;                      // Lines after "mount c ." and "c:"; "cd <stage>" is added when staged
}

// INTERFACE :: {key:STRING, method:STRING, files:[STRING]?}
// Where progress lives on this origin and how the game itself saves.
export interface GameSaves {
    readonly key: string;                                          // DosStorage key; one overlay per game per origin
    readonly method: string;                                       // One line for the restart confirm: "your last in-game save (Q on the map) is kept"
    readonly files?: ReadonlyArray<string>;                        // Names or globs the game writes; informational until the filesystem API
}

// INTERFACE :: {enabled:BOOLEAN?, reject:[keyCode]?}
// Physical keyboard policy.
export interface KeyboardPolicy {
    readonly enabled?: boolean;                                    // Starts enabled; true when omitted
    readonly reject?: ReadonlyArray<KeyCode>;                      // Codes left to the page; none when omitted
}

// INTERFACE :: {enabled:BOOLEAN?, touch:mouseTouchMode?, pointerLock:BOOLEAN?, sensitivity:NUMBER?}
// Physical mouse policy.
export interface MousePolicy {
    readonly enabled?: boolean;                                    // Starts enabled; true when omitted. False for games whose intro buffers clicks
    readonly touch?: MouseTouchMode;                               // "absolute" when omitted
    readonly pointerLock?: boolean;                                // false when omitted
    readonly sensitivity?: number;                                 // Positive locked-delta multiplier; 1 when omitted
}

// TYPE :: "left" | "right" | "upper-left" | "upper-right" | "lower-left" | "lower-right"
// Where a component sits in landscape: a whole side column, or one of its halves.
export type LandscapeRegion = "left" | "right" | "upper-left" | "upper-right" | "lower-left" | "lower-right";

// INTERFACE :: {component:"dpad", region:landscapeRegion?, map:dPadMap?, diagonals:BOOLEAN?}
// A d-pad component: arrows unless mapped.
export interface DpadComponent {
    readonly component: "dpad";                                    // Discriminant
    readonly region?: LandscapeRegion;                             // Landscape placement; "left" when omitted
    readonly inline?: boolean;                                     // Sits in a row beside the previous component of its slot; false when omitted
    readonly map?: DPadMap;                                        // Direction to target map; arrows when omitted
    readonly diagonals?: boolean;                                  // Two directions at once; true when omitted
}

// INTERFACE :: {component:"key", region:landscapeRegion?, label:STRING, code:keyCode}
// One keycap that sends one key.
export interface KeyComponent {
    readonly component: "key";                                     // Discriminant
    readonly region?: LandscapeRegion;                             // Landscape placement; "lower-right" when omitted
    readonly inline?: boolean;                                     // Sits in a row beside the previous component of its slot; false when omitted
    readonly label: string;                                        // Printed on the key
    readonly code: KeyCode;                                        // Sent while pressed
}

// INTERFACE :: {component:"keys", region:landscapeRegion?, keys:[{label:STRING, code:keyCode}]}
// One row of named keys, for the few a game wants side by side: Enter and Esc, Space and Enter.
export interface KeysComponent {
    readonly component: "keys";                                    // Discriminant
    readonly region?: LandscapeRegion;                             // Landscape placement; "lower-right" when omitted
    readonly inline?: boolean;                                     // Sits in a row beside the previous component of its slot; false when omitted
    readonly keys: ReadonlyArray<{ readonly label: string; readonly code: KeyCode }>;   // Left to right
}

// INTERFACE :: {component:"modifiers"|"digits"|"fkeys"|"letters", region:landscapeRegion?, inline:BOOLEAN?, columns:NUMBER?}
// A fixed group of keys: Shift, Ctrl and Alt latches; 0 to 9; F1 to F12; the letters as three qwerty rows. With columns,
// letters go alphabetical and digits in order, that many across: narrower, so a side column takes less from the picture.
export interface GroupComponent {
    readonly component: "modifiers" | "digits" | "fkeys" | "letters";   // Which group
    readonly region?: LandscapeRegion;                             // Landscape placement; "upper-right" when omitted
    readonly inline?: boolean;                                     // Sits in a row beside the previous component of its slot; false when omitted
    readonly columns?: number;                                     // Letters and digits only: keys per row, 1 to 10; qwerty and one row when omitted
}

// TYPE :: dpadComponent | keyComponent | groupComponent
// One placed control.
// TYPE :: "letters" | "numbers" | "arrows"
// The keyboard's panes: qwerty; digits and punctuation; arrows with the editing keys. Esc and the function keys are a fixed row.
export type KeyboardPane = "letters" | "numbers" | "arrows";

// TYPE :: "tabs" | "phone" | "compass"
// How the keyboard is arranged: tabs (an ABC, 123, Nav tab row over a slim Esc and F-key row and three panes), phone (the same
// row and panes, switched from 123, ABC and Nav keys on the bottom row), or compass (a compass d-pad with Esc at its centre beside
// the function and editing keys, above the letters and numbers panes). The manifest's choice is the start; the player cycles
// them under View and the choice is remembered.
export type KeyboardStyle = "tabs" | "phone" | "compass";

// INTERFACE :: {component:"keyboard", region:landscapeRegion?, inline:BOOLEAN?, pane:keyboardPane?, style:keyboardStyle?}
// A phone-style keyboard: three panes in one footprint, swapped by ABC, 123 and Fn keys, each with Enter, Space, Backspace,
// Ctrl and Alt on its bottom row.
export interface KeyboardComponent {
    readonly component: "keyboard";                                // Discriminant
    readonly region?: LandscapeRegion;                             // Landscape placement; "upper-right" when omitted
    readonly inline?: boolean;                                     // Sits in a row beside the previous component of its slot; false when omitted
    readonly pane?: KeyboardPane;                                  // The pane shown first; "letters" when omitted
    readonly style?: KeyboardStyle;                                // The arrangement to start on; "tabs" when omitted
}

// TYPE :: dpadComponent | keyComponent | keysComponent | keyboardComponent | groupComponent
// One placed control.
export type LayoutComponent = DpadComponent | KeyComponent | KeysComponent | KeyboardComponent | GroupComponent;

// INTERFACE :: {landscape:[layoutComponent]?, portrait:[layoutComponent]?}
// The on-screen controls per orientation. Landscape components fill side columns beside the picture; portrait components
// stack below it in order. An absent orientation gets the shell default: a d-pad with Enter and Escape.
export interface TouchLayout {
    readonly landscape?: ReadonlyArray<LayoutComponent>;           // Beside the picture
    readonly portrait?: ReadonlyArray<LayoutComponent>;            // Below the picture
}

// INTERFACE :: {keyboard:keyboardPolicy?, mouse:mousePolicy?, touch:touchLayout?}
// Control policy without DOM references; the shell builds the surfaces.
export interface GameControls {
    readonly keyboard?: KeyboardPolicy;                            // Absent: keyboard on with no reject list
    readonly mouse?: MousePolicy;                                  // Absent: mouse on, absolute touch, no pointer lock
    readonly touch?: TouchLayout;                                  // Absent: a d-pad with Enter and Escape in both orientations
}

/**
 *
 * Constants
 *
 */

const CHECKS: ReadonlySet<string> = new Set(["boot", "input", "sound", "save"]);                       // Every GameCheck
const MACHINES: ReadonlySet<string> = new Set(["svga_s3", "vgaonly", "ega", "cga", "tandy", "hercules"]);   // Every DosboxMachine
const SLUG = /^[a-z0-9][a-z0-9-]*$/;                                                                  // One URL segment, lower-case
const REGIONS: ReadonlySet<string> = new Set(["left", "right", "upper-left", "upper-right", "lower-left", "lower-right"]);   // Every LandscapeRegion

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a non-empty string
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is absent or a non-empty string
const isOptionalText = (value: unknown): value is string | undefined => value === undefined || isText(value);

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is absent or a boolean
const isOptionalBoolean = (value: unknown): value is boolean | undefined => value === undefined || typeof value === "boolean";

// PREDICATE :: UNKNOWN, (UNKNOWN -> BOOLEAN) -> BOOLEAN
// True when value is an array whose every element passes the predicate
const isListOf = (value: unknown, predicate: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(predicate);

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameCheck
export function isGameCheck(value: unknown): value is GameCheck {
    return typeof value === "string" && CHECKS.has(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameStatus: verified a list of GameCheck, notes absent or text
export function isGameStatus(value: unknown): value is GameStatus {
    if (typeof value !== "object" || value === null) return false;
    const status = value as GameStatus;
    return isListOf(status.verified, isGameCheck) && isOptionalText(status.notes);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameMetadata: a slug, name and genre, optional title, integer year, positive aspectRatio and text hints, and a GameStatus
export function isGameMetadata(value: unknown): value is GameMetadata {
    if (typeof value !== "object" || value === null) return false;
    const metadata = value as GameMetadata;
    return typeof metadata.slug === "string" && SLUG.test(metadata.slug)
        && isText(metadata.name)
        && isOptionalText(metadata.title)
        && (metadata.year === undefined || Number.isInteger(metadata.year))
        && isText(metadata.genre)
        && (metadata.aspectRatio === undefined || (Number.isFinite(metadata.aspectRatio) && metadata.aspectRatio > 0))
        && (metadata.hints === undefined || isListOf(metadata.hints, isText))
        && isGameStatus(metadata.status);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a DosboxMachine
export function isDosboxMachine(value: unknown): value is DosboxMachine {
    return typeof value === "string" && MACHINES.has(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a DosboxSettings: every field absent or of its type, memsize a positive integer
export function isDosboxSettings(value: unknown): value is DosboxSettings {
    if (typeof value !== "object" || value === null) return false;
    const settings = value as DosboxSettings;
    return (settings.machine === undefined || isDosboxMachine(settings.machine))
        && isOptionalText(settings.cycles)
        && (settings.memsize === undefined || (Number.isInteger(settings.memsize) && settings.memsize > 0))
        && isOptionalBoolean(settings.aspect);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameLoad: a source, optional stage text, optional overlay of text to text, optional DosboxSettings, and a non-empty autoexec of text
export function isGameLoad(value: unknown): value is GameLoad {
    if (typeof value !== "object" || value === null) return false;
    const load = value as GameLoad;
    const overlayOk = load.overlay === undefined
        || (typeof load.overlay === "object" && load.overlay !== null && !Array.isArray(load.overlay)
            && Object.entries(load.overlay).every(([path, file]) => isText(path) && isText(file)));
    return isText(load.source)
        && isOptionalText(load.stage)
        && overlayOk
        && (load.dosbox === undefined || isDosboxSettings(load.dosbox))
        && isListOf(load.autoexec, isText) && load.autoexec.length > 0;
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameSaves: a key and method, files absent or a list of text
export function isGameSaves(value: unknown): value is GameSaves {
    if (typeof value !== "object" || value === null) return false;
    const saves = value as GameSaves;
    return isText(saves.key) && isText(saves.method) && (saves.files === undefined || isListOf(saves.files, isText));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a KeyboardPolicy: enabled absent or boolean, reject absent or a list of KeyCode
export function isKeyboardPolicy(value: unknown): value is KeyboardPolicy {
    if (typeof value !== "object" || value === null) return false;
    const policy = value as KeyboardPolicy;
    return isOptionalBoolean(policy.enabled) && (policy.reject === undefined || isListOf(policy.reject, isKeyCode));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a MousePolicy: enabled and pointerLock absent or boolean, touch absent or a MouseTouchMode, sensitivity absent or positive
export function isMousePolicy(value: unknown): value is MousePolicy {
    if (typeof value !== "object" || value === null) return false;
    const policy = value as MousePolicy;
    return isOptionalBoolean(policy.enabled)
        && (policy.touch === undefined || isMouseTouchMode(policy.touch))
        && isOptionalBoolean(policy.pointerLock)
        && (policy.sensitivity === undefined || (Number.isFinite(policy.sensitivity) && policy.sensitivity > 0));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a LandscapeRegion
export function isLandscapeRegion(value: unknown): value is LandscapeRegion {
    return typeof value === "string" && REGIONS.has(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a LayoutComponent: a known component with a valid optional region, and the fields its kind requires
export function isLayoutComponent(value: unknown): value is LayoutComponent {
    if (typeof value !== "object" || value === null) return false;
    const component = value as Record<string, unknown>;
    if (component["region"] !== undefined && !isLandscapeRegion(component["region"])) return false;
    if (!isOptionalBoolean(component["inline"])) return false;
    switch (component["component"]) {
        case "dpad": return (component["map"] === undefined || isDPadMap(component["map"])) && isOptionalBoolean(component["diagonals"]);
        case "key": return isText(component["label"]) && isKeyCode(component["code"]);
        case "keys": return isListOf(component["keys"], (key) => typeof key === "object" && key !== null && isText((key as { label?: unknown }).label) && isKeyCode((key as { code?: unknown }).code)) && (component["keys"] as unknown[]).length > 0;
        case "keyboard": return (component["pane"] === undefined || ["letters", "numbers", "arrows"].includes(component["pane"] as string))
            && (component["style"] === undefined || ["tabs", "phone", "compass"].includes(component["style"] as string));
        case "modifiers": case "digits": case "fkeys": case "letters":
            return component["columns"] === undefined || (Number.isInteger(component["columns"]) && (component["columns"] as number) >= 1 && (component["columns"] as number) <= 10);
        default: return false;
    }
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a TouchLayout: each orientation absent or a list of LayoutComponents
export function isTouchLayout(value: unknown): value is TouchLayout {
    if (typeof value !== "object" || value === null) return false;
    const layout = value as TouchLayout;
    return (layout.landscape === undefined || isListOf(layout.landscape, isLayoutComponent))
        && (layout.portrait === undefined || isListOf(layout.portrait, isLayoutComponent));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameControls: each policy absent or valid
export function isGameControls(value: unknown): value is GameControls {
    if (typeof value !== "object" || value === null) return false;
    const controls = value as GameControls;
    return (controls.keyboard === undefined || isKeyboardPolicy(controls.keyboard))
        && (controls.mouse === undefined || isMousePolicy(controls.mouse))
        && (controls.touch === undefined || isTouchLayout(controls.touch));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a GameManifest: all four parts present and valid
export function isGameManifest(value: unknown): value is GameManifest {
    if (typeof value !== "object" || value === null) return false;
    const manifest = value as GameManifest;
    return isGameMetadata(manifest.metadata) && isGameLoad(manifest.load) && isGameSaves(manifest.saves) && isGameControls(manifest.controls);
}

// HELPER :: UNKNOWN -> STRING?
// Names the first part of a manifest that fails its predicate, or null when the whole manifest is valid; for error messages at the read points
export function manifestProblem(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return "manifest is not an object";
    const manifest = value as Record<string, unknown>;
    const parts: ReadonlyArray<[string, (part: unknown) => boolean]> = [
        ["metadata", isGameMetadata], ["load", isGameLoad], ["saves", isGameSaves], ["controls", isGameControls],
    ];
    for (const [name, predicate] of parts) {
        if (manifest[name] === undefined) return `manifest has no ${name}`;
        if (!predicate(manifest[name])) return `manifest ${name} is invalid`;
    }
    return null;
}
