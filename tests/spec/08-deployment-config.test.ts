// realizes: docs/headless-browser-dos-runtime-spec.md > §18b DosDeployment (§18b.1 predicates, §18b.3 spec/08-deployment-config tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    isButtonControl,                                             // Predicate under test
    isControlsConfig,                                            // Predicate under test
    isDosDeploymentConfig,                                       // Predicate under test
    isDPadControl,                                               // Predicate under test
    isKeyboardControl,                                           // Predicate under test
    isMouseControl,                                              // Predicate under test
    isStickControl,                                              // Predicate under test
    isTrackpadControl,                                           // Predicate under test
    MouseSource,                                                 // Its absolute-position correction under test
} from "../../src/index.ts";
import FakeEmulatorAdapter from "../support/FakeEmulatorAdapter.ts";   // An EmulatorAdapter for the adapter field

// Type dependencies:
import type {
    ButtonControl,                                               // Accepted button control literal
    ControlsConfig,                                              // Accepted controls literal
    DPadControl,                                                 // Accepted d-pad control literal
    InputSurface,                                                // Surface literal shape
    KeyboardControl,                                             // Accepted keyboard control literal
    MouseControl,                                                // Accepted mouse control literal
    StickControl,                                                // Accepted stick control literal
    TrackpadControl,                                             // Accepted trackpad control literal
} from "../../src/index.ts";
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner

/**
 *
 * Constants
 *
 */

// A surface under Node: the three InputSurface functions on a plain object, no DOM needed.
const SURFACE: InputSurface = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
};

const NOT_SURFACE = {};                                                         // Fails isInputSurface: no functions
const BAD_TARGET = { kind: "nope" };                                            // Fails isInputTarget: unknown kind

const FULL_KEYBOARD: KeyboardControl = { enabled: true, filter: () => true, preventDefault: false };            // Every field present and valid
const FULL_MOUSE: MouseControl = { enabled: false, sensitivity: 2, scale: { x: 0.5, y: 1 }, offset: { x: 0.03, y: -0.05 }, touch: "absolute", pointerLock: true };   // Every field present and valid
const FULL_BUTTON: ButtonControl = {                                                                            // Every field present and valid
    surface: SURFACE,
    target: { kind: "key", code: "Space" },
    hold: { kind: "key", code: "ShiftLeft" },
    holdDelayMs: 400,
};
const FULL_DPAD: DPadControl = {                                                                                // Every field present and valid
    surface: SURFACE,
    map: { up: { kind: "key", code: "ArrowUp" }, down: { kind: "key", code: "ArrowDown" } },
    deadZone: 0.2,
    diagonals: true,
};
const FULL_STICK: StickControl = { surface: SURFACE, map: { mode: "joystick" }, deadZone: 0.1, radius: 80 };   // Every field present and valid
const FULL_TRACKPAD: TrackpadControl = {                                                                        // Every field present and valid
    surface: SURFACE,
    map: { move: "mouse", tap: { kind: "mouseButton", button: "left" } },
    sensitivity: 1.5,
    tapMaxMs: 200,
    tapMaxDistance: 10,
    holdDelayMs: 500,
};
const FULL_CONTROLS: ControlsConfig = {                                                                         // Every field present and valid
    keyboard: FULL_KEYBOARD,
    mouse: FULL_MOUSE,
    buttons: [FULL_BUTTON],
    dpads: [FULL_DPAD],
    sticks: [FULL_STICK],
    trackpads: [FULL_TRACKPAD],
};

// NOTE: canvas and container are checked only when the DOM globals exist (§18b.3). Under Node any object passes those two
// conditions, so plain objects stand in for them here and no case violates them: that belongs to a DOM environment.
const FULL_CONFIG = {                                                                                           // Every field present and valid
    canvas: {},
    container: {},
    game: { bundle: "/game.jsdos" },
    controls: FULL_CONTROLS,
    keyboardTarget: { addEventListener: () => undefined, removeEventListener: () => undefined },
    adapter: new FakeEmulatorAdapter(),
    fetch: () => Promise.reject(new Error("not called")),
};

/**
 *
 * Functions
 *
 */

// HELPER :: STRING, (UNKNOWN -> BOOLEAN), UNKNOWN, BOOLEAN -> testCase
// Case: predicate applied to value returns expected.
const verdict = (label: string, predicate: (value: unknown) => boolean, value: unknown, expected: boolean): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert(expected ? "accepted" : "rejected", () => predicate(value), P.equals<boolean>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "DosDeployment config",
    cases: [

        // isKeyboardControl
        verdict("isKeyboardControl accepts enabled, filter and preventDefault all present and valid", isKeyboardControl, FULL_KEYBOARD, true),
        verdict("isKeyboardControl accepts an empty object: every field is optional", isKeyboardControl, {}, true),
        verdict("isKeyboardControl rejects a value that is not an object", isKeyboardControl, null, false),
        verdict("isKeyboardControl rejects enabled that is not a boolean", isKeyboardControl, { ...FULL_KEYBOARD, enabled: "yes" }, false),
        verdict("isKeyboardControl rejects filter that is not a function", isKeyboardControl, { ...FULL_KEYBOARD, filter: "ArrowUp" }, false),
        verdict("isKeyboardControl rejects preventDefault that is not a boolean", isKeyboardControl, { ...FULL_KEYBOARD, preventDefault: 1 }, false),

        // MouseSource.corrected: scale, then offset, pinned at the edge inside the offset's margin, clamped
        {
            label: "MouseSource.corrected scales, shifts, pins inside the margin and clamps",
            run: () => CTGTest.init("MouseSource.corrected")
                .assert("identity when unscaled and unshifted", () => MouseSource.corrected(0.3, 1, 0), P.equals(0.3))
                .assert("scale halves the position", () => MouseSource.corrected(0.6, 0.5, 0), P.equals(0.3))
                .assert("offset shifts after the scale", () => MouseSource.corrected(0.6, 0.5, 0.016), P.equals(0.316))
                .assert("inside a positive offset's margin the position pins at 0", () => MouseSource.corrected(0.02, 0.5, 0.016), P.equals(0))
                .assert("inside a negative offset's margin the position pins at 1", () => MouseSource.corrected(0.99, 1, -0.05), P.equals(1))
                .assert("the high end clamps at 1", () => MouseSource.corrected(1, 1, 0.3), P.equals(1))
                .assert("inward settles a position on the low edge inside it", () => MouseSource.inward(0), P.equals(MouseSource.EDGE_INSET))
                .assert("inward settles a position on the high edge inside it", () => MouseSource.inward(1), P.equals(1 - MouseSource.EDGE_INSET))
                .assert("inward leaves an interior position alone", () => MouseSource.inward(0.4), P.equals(0.4))
                .start(undefined),
        },

        // isMouseControl
        verdict("isMouseControl accepts enabled, sensitivity, touch and pointerLock all present and valid", isMouseControl, FULL_MOUSE, true),
        verdict("isMouseControl accepts an empty object: every field is optional", isMouseControl, {}, true),
        verdict("isMouseControl rejects a scale with a zero axis", isMouseControl, { ...FULL_MOUSE, scale: { x: 0, y: 1 } }, false),
        verdict("isMouseControl rejects a scale missing an axis", isMouseControl, { ...FULL_MOUSE, scale: { x: 0.5 } }, false),
        verdict("isMouseControl rejects an offset that is not finite", isMouseControl, { ...FULL_MOUSE, offset: { x: Infinity, y: 0 } }, false),
        verdict("isMouseControl rejects a value that is not an object", isMouseControl, null, false),
        verdict("isMouseControl rejects enabled that is not a boolean", isMouseControl, { ...FULL_MOUSE, enabled: "no" }, false),
        verdict("isMouseControl rejects sensitivity that is not a finite number", isMouseControl, { ...FULL_MOUSE, sensitivity: NaN }, false),
        verdict("isMouseControl rejects touch that is not a MouseTouchMode", isMouseControl, { ...FULL_MOUSE, touch: "relative" }, false),
        verdict("isMouseControl rejects pointerLock that is not a boolean", isMouseControl, { ...FULL_MOUSE, pointerLock: "canvas" }, false),

        // isButtonControl
        verdict("isButtonControl accepts surface, target, hold and holdDelayMs all present and valid", isButtonControl, FULL_BUTTON, true),
        verdict("isButtonControl accepts surface and target alone: hold and holdDelayMs are optional", isButtonControl, { surface: SURFACE, target: FULL_BUTTON.target }, true),
        verdict("isButtonControl rejects a value that is not an object", isButtonControl, null, false),
        verdict("isButtonControl rejects a surface that is not an InputSurface", isButtonControl, { ...FULL_BUTTON, surface: NOT_SURFACE }, false),
        verdict("isButtonControl rejects a target that is not an InputTarget", isButtonControl, { ...FULL_BUTTON, target: BAD_TARGET }, false),
        verdict("isButtonControl rejects a hold that is not an InputTarget", isButtonControl, { ...FULL_BUTTON, hold: BAD_TARGET }, false),
        verdict("isButtonControl rejects a holdDelayMs that is not a finite number", isButtonControl, { ...FULL_BUTTON, holdDelayMs: Infinity }, false),

        // isDPadControl
        verdict("isDPadControl accepts surface, map, deadZone and diagonals all present and valid", isDPadControl, FULL_DPAD, true),
        verdict("isDPadControl accepts surface and map alone: deadZone and diagonals are optional", isDPadControl, { surface: SURFACE, map: {} }, true),
        verdict("isDPadControl rejects a value that is not an object", isDPadControl, null, false),
        verdict("isDPadControl rejects a surface that is not an InputSurface", isDPadControl, { ...FULL_DPAD, surface: NOT_SURFACE }, false),
        verdict("isDPadControl rejects a map that is not a DPadMap", isDPadControl, { ...FULL_DPAD, map: { up: BAD_TARGET } }, false),
        verdict("isDPadControl rejects a deadZone that is not a finite number", isDPadControl, { ...FULL_DPAD, deadZone: NaN }, false),
        verdict("isDPadControl rejects diagonals that is not a boolean", isDPadControl, { ...FULL_DPAD, diagonals: "yes" }, false),

        // isStickControl
        verdict("isStickControl accepts surface, map, deadZone and radius all present and valid", isStickControl, FULL_STICK, true),
        verdict("isStickControl accepts surface and map alone: deadZone and radius are optional", isStickControl, { surface: SURFACE, map: { mode: "keys" } }, true),
        verdict("isStickControl rejects a value that is not an object", isStickControl, null, false),
        verdict("isStickControl rejects a surface that is not an InputSurface", isStickControl, { ...FULL_STICK, surface: NOT_SURFACE }, false),
        verdict("isStickControl rejects a map that is not an AnalogStickMap", isStickControl, { ...FULL_STICK, map: { mode: "mouse" } }, false),
        verdict("isStickControl rejects a deadZone that is not a finite number", isStickControl, { ...FULL_STICK, deadZone: NaN }, false),
        verdict("isStickControl rejects a radius that is not a finite number", isStickControl, { ...FULL_STICK, radius: "80" }, false),

        // isTrackpadControl
        verdict("isTrackpadControl accepts surface, map, sensitivity, tapMaxMs, tapMaxDistance and holdDelayMs all present and valid", isTrackpadControl, FULL_TRACKPAD, true),
        verdict("isTrackpadControl accepts surface and map alone: the numeric options are optional", isTrackpadControl, { surface: SURFACE, map: {} }, true),
        verdict("isTrackpadControl rejects a value that is not an object", isTrackpadControl, null, false),
        verdict("isTrackpadControl rejects a surface that is not an InputSurface", isTrackpadControl, { ...FULL_TRACKPAD, surface: NOT_SURFACE }, false),
        verdict("isTrackpadControl rejects a map that is not a TrackpadMap", isTrackpadControl, { ...FULL_TRACKPAD, map: { move: "scroll" } }, false),
        verdict("isTrackpadControl rejects a sensitivity that is not a finite number", isTrackpadControl, { ...FULL_TRACKPAD, sensitivity: NaN }, false),
        verdict("isTrackpadControl rejects a tapMaxMs that is not a finite number", isTrackpadControl, { ...FULL_TRACKPAD, tapMaxMs: NaN }, false),
        verdict("isTrackpadControl rejects a tapMaxDistance that is not a finite number", isTrackpadControl, { ...FULL_TRACKPAD, tapMaxDistance: NaN }, false),
        verdict("isTrackpadControl rejects a holdDelayMs that is not a finite number", isTrackpadControl, { ...FULL_TRACKPAD, holdDelayMs: NaN }, false),

        // isControlsConfig
        verdict("isControlsConfig accepts every control present and valid", isControlsConfig, FULL_CONTROLS, true),
        verdict("isControlsConfig accepts an empty object: every control is optional", isControlsConfig, {}, true),
        verdict("isControlsConfig rejects a value that is not an object", isControlsConfig, null, false),
        verdict("isControlsConfig rejects a keyboard that is not a KeyboardControl", isControlsConfig, { ...FULL_CONTROLS, keyboard: { enabled: "yes" } }, false),
        verdict("isControlsConfig rejects a mouse that is not a MouseControl", isControlsConfig, { ...FULL_CONTROLS, mouse: { touch: "relative" } }, false),
        verdict("isControlsConfig rejects buttons that is not an array", isControlsConfig, { ...FULL_CONTROLS, buttons: FULL_BUTTON }, false),
        verdict("isControlsConfig rejects buttons holding an entry that is not a ButtonControl", isControlsConfig, { ...FULL_CONTROLS, buttons: [FULL_BUTTON, { ...FULL_BUTTON, target: BAD_TARGET }] }, false),
        verdict("isControlsConfig rejects dpads that is not an array", isControlsConfig, { ...FULL_CONTROLS, dpads: FULL_DPAD }, false),
        verdict("isControlsConfig rejects dpads holding an entry that is not a DPadControl", isControlsConfig, { ...FULL_CONTROLS, dpads: [{ ...FULL_DPAD, surface: NOT_SURFACE }] }, false),
        verdict("isControlsConfig rejects sticks that is not an array", isControlsConfig, { ...FULL_CONTROLS, sticks: FULL_STICK }, false),
        verdict("isControlsConfig rejects sticks holding an entry that is not a StickControl", isControlsConfig, { ...FULL_CONTROLS, sticks: [{ ...FULL_STICK, map: { mode: "mouse" } }] }, false),
        verdict("isControlsConfig rejects trackpads that is not an array", isControlsConfig, { ...FULL_CONTROLS, trackpads: FULL_TRACKPAD }, false),
        verdict("isControlsConfig rejects trackpads holding an entry that is not a TrackpadControl", isControlsConfig, { ...FULL_CONTROLS, trackpads: [{ ...FULL_TRACKPAD, map: { move: "scroll" } }] }, false),

        // isDosDeploymentConfig
        verdict("isDosDeploymentConfig accepts every field present and valid", isDosDeploymentConfig, FULL_CONFIG, true),
        verdict("isDosDeploymentConfig accepts canvas, container and game alone: controls, keyboardTarget, adapter and fetch are optional", isDosDeploymentConfig,
            { canvas: FULL_CONFIG.canvas, container: FULL_CONFIG.container, game: FULL_CONFIG.game }, true),
        verdict("isDosDeploymentConfig rejects a value that is not an object", isDosDeploymentConfig, null, false),
        verdict("isDosDeploymentConfig rejects a game that is not a DosGameConfig", isDosDeploymentConfig, { ...FULL_CONFIG, game: { bundle: "" } }, false),
        verdict("isDosDeploymentConfig rejects controls that is not a ControlsConfig", isDosDeploymentConfig, { ...FULL_CONFIG, controls: { buttons: "none" } }, false),
        verdict("isDosDeploymentConfig rejects a keyboardTarget without addEventListener and removeEventListener", isDosDeploymentConfig, { ...FULL_CONFIG, keyboardTarget: {} }, false),
        verdict("isDosDeploymentConfig rejects an adapter that is not an EmulatorAdapter", isDosDeploymentConfig, { ...FULL_CONFIG, adapter: { type: "fake" } }, false),
        verdict("isDosDeploymentConfig rejects a fetch that is not a function", isDosDeploymentConfig, { ...FULL_CONFIG, fetch: "https://example.test" }, false),
    ],
};

export default testFile;
