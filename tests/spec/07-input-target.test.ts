// realizes: docs/headless-browser-dos-runtime-spec.md > §16 InputMapper (§16.1 predicates, §16.2 press/release, §16.3 spec/07-input-target tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    DosInput,                                                    // Real input the statics drive and isInputMapperConfig requires
    InputMapper,                                                 // Class under test, via the public surface
    isAnalogStickMap,                                            // Predicate under test
    isDPadMap,                                                   // Predicate under test
    isInputMapperConfig,                                         // Predicate under test
    isInputTarget,                                               // Predicate under test
    isTrackpadMap,                                               // Predicate under test
} from "../../src/index.ts";
import FakeEmulatorSession from "../support/FakeEmulatorSession.ts";   // Records every session call

// Type dependencies:
import type {
    AnalogStickMap,                                              // Accepted stick map literal
    DosInputSnapshot,                                            // Snapshot getter shape
    DPadMap,                                                     // Accepted pad map literal
    InputTarget,                                                 // Target argument of press/release
    TrackpadMap,                                                 // Accepted trackpad map literal
} from "../../src/index.ts";
import type { FakeSessionCall } from "../support/FakeEmulatorSession.ts";   // Recorded call shape
import type { TestCase, TestFile } from "../run.ts";                         // Manifest contract consumed by the runner

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {calls:[fakeSessionCall], snapshot:dosInputSnapshot}
// What the session saw and what the input holds afterwards.
interface Observed {
    calls: FakeSessionCall[];                                    // Session calls in order
    snapshot: DosInputSnapshot;                                  // input.snapshot afterwards
}

/**
 *
 * Constants
 *
 */

const KEY: InputTarget = { kind: "key", code: "KeyA" };                         // A valid key target
const MOUSE: InputTarget = { kind: "mouseButton", button: "left" };             // A valid mouse button target
const JOYSTICK: InputTarget = { kind: "joystickButton", button: 1 };            // A valid joystick button target
const BAD_TARGET = { kind: "key", code: "Key A" };                              // Fails isInputTarget: code is not a KeyCode

const FULL_DPAD_MAP: DPadMap = {                                               // Every optional field present and valid
    up: { kind: "key", code: "ArrowUp" },
    down: { kind: "key", code: "ArrowDown" },
    left: MOUSE,
    right: JOYSTICK,
};

const FULL_STICK_MAP: AnalogStickMap = { mode: "keys", keys: FULL_DPAD_MAP, threshold: 0.5 };   // Every field present and valid

const FULL_TRACKPAD_MAP: TrackpadMap = {                                        // Every optional field present and valid
    move: "mouse",
    tap: MOUSE,
    twoFingerTap: { kind: "mouseButton", button: "right" },
    hold: KEY,
    twoFingerMove: { kind: "keyWheel", up: "PageUp", down: "PageDown" },
};

const EMPTY_SNAPSHOT: DosInputSnapshot = {                                      // What snapshot reads when nothing is held
    keysDown: [],
    mouseButtonsDown: [],
    joystickButtonsDown: [],
    joystickAxes: { x: 0, y: 0 },
};

// HELPER :: STRING, (UNKNOWN -> BOOLEAN), UNKNOWN, BOOLEAN -> testCase
// Case: predicate applied to value returns expected.
const verdict = (label: string, predicate: (value: unknown) => boolean, value: unknown, expected: boolean): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert(expected ? "accepted" : "rejected", () => predicate(value), P.equals<boolean>(expected))
        .start(undefined),
});

// HELPER :: VOID -> dosInput
// A real input over a fresh fake session, for isInputMapperConfig inputs.
const freshInput = (): DosInput => new DosInput({ session: new FakeEmulatorSession() });

// HELPER :: STRING, (dosInput -> VOID), observed -> testCase
// Case: driving a real input over a fake session through the statics leaves the expected calls and snapshot.
const drives = (label: string, drive: (input: DosInput) => void, expected: Observed): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("drive a real input over a fake session", () => {
            const session = new FakeEmulatorSession();
            const input = new DosInput({ session });
            drive(input);
            return { session, input };
        })
        .assert("session calls and snapshot match", (state) => ({ calls: state.subject.session.calls, snapshot: state.subject.input.snapshot }), P.equals<Observed>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "InputMapper targets",
    cases: [

        // isInputTarget
        verdict("isInputTarget accepts a key target with a KeyCode", isInputTarget, KEY, true),
        verdict("isInputTarget accepts a mouseButton target with a MouseButton", isInputTarget, MOUSE, true),
        verdict("isInputTarget accepts a joystickButton target with a JoystickButton", isInputTarget, JOYSTICK, true),
        verdict("isInputTarget rejects a value that is not an object", isInputTarget, null, false),
        verdict("isInputTarget rejects a kind outside key, mouseButton and joystickButton", isInputTarget, { kind: "wheel", code: "KeyA" }, false),
        verdict("isInputTarget rejects a key target whose code is not a KeyCode", isInputTarget, BAD_TARGET, false),
        verdict("isInputTarget rejects a mouseButton target whose button is not a MouseButton", isInputTarget, { kind: "mouseButton", button: "back" }, false),
        verdict("isInputTarget rejects a joystickButton target whose button is not a JoystickButton", isInputTarget, { kind: "joystickButton", button: 4 }, false),

        // isDPadMap
        verdict("isDPadMap accepts a map with every direction mapped to an InputTarget", isDPadMap, FULL_DPAD_MAP, true),
        verdict("isDPadMap accepts an empty map: every direction is optional", isDPadMap, {}, true),
        verdict("isDPadMap rejects a value that is not an object", isDPadMap, null, false),
        verdict("isDPadMap rejects up that is not an InputTarget", isDPadMap, { ...FULL_DPAD_MAP, up: BAD_TARGET }, false),
        verdict("isDPadMap rejects down that is not an InputTarget", isDPadMap, { ...FULL_DPAD_MAP, down: BAD_TARGET }, false),
        verdict("isDPadMap rejects left that is not an InputTarget", isDPadMap, { ...FULL_DPAD_MAP, left: BAD_TARGET }, false),
        verdict("isDPadMap rejects right that is not an InputTarget", isDPadMap, { ...FULL_DPAD_MAP, right: BAD_TARGET }, false),

        // isAnalogStickMap
        verdict("isAnalogStickMap accepts keys mode with a DPadMap and a finite threshold", isAnalogStickMap, FULL_STICK_MAP, true),
        verdict("isAnalogStickMap accepts joystick mode alone: keys and threshold are optional", isAnalogStickMap, { mode: "joystick" }, true),
        verdict("isAnalogStickMap rejects a value that is not an object", isAnalogStickMap, null, false),
        verdict("isAnalogStickMap rejects a missing mode", isAnalogStickMap, { keys: FULL_DPAD_MAP, threshold: 0.5 }, false),
        verdict("isAnalogStickMap rejects a mode outside joystick and keys", isAnalogStickMap, { ...FULL_STICK_MAP, mode: "mouse" }, false),
        verdict("isAnalogStickMap rejects keys that is not a DPadMap", isAnalogStickMap, { ...FULL_STICK_MAP, keys: { up: BAD_TARGET } }, false),
        verdict("isAnalogStickMap rejects a threshold that is not a finite number", isAnalogStickMap, { ...FULL_STICK_MAP, threshold: NaN }, false),

        // isTrackpadMap
        verdict("isTrackpadMap accepts a map with every field present and a keyWheel twoFingerMove", isTrackpadMap, FULL_TRACKPAD_MAP, true),
        verdict("isTrackpadMap accepts an empty map: every field is optional", isTrackpadMap, {}, true),
        verdict("isTrackpadMap accepts move none and twoFingerMove none", isTrackpadMap, { ...FULL_TRACKPAD_MAP, move: "none", twoFingerMove: "none" }, true),
        verdict("isTrackpadMap rejects a value that is not an object", isTrackpadMap, null, false),
        verdict("isTrackpadMap rejects a move outside mouse and none", isTrackpadMap, { ...FULL_TRACKPAD_MAP, move: "scroll" }, false),
        verdict("isTrackpadMap rejects a tap that is not an InputTarget", isTrackpadMap, { ...FULL_TRACKPAD_MAP, tap: BAD_TARGET }, false),
        verdict("isTrackpadMap rejects a twoFingerTap that is not an InputTarget", isTrackpadMap, { ...FULL_TRACKPAD_MAP, twoFingerTap: BAD_TARGET }, false),
        verdict("isTrackpadMap rejects a hold that is not an InputTarget", isTrackpadMap, { ...FULL_TRACKPAD_MAP, hold: BAD_TARGET }, false),
        verdict("isTrackpadMap rejects a twoFingerMove string other than none", isTrackpadMap, { ...FULL_TRACKPAD_MAP, twoFingerMove: "mouse" }, false),
        verdict("isTrackpadMap rejects a twoFingerMove object whose kind is not keyWheel", isTrackpadMap, { ...FULL_TRACKPAD_MAP, twoFingerMove: { kind: "wheel", up: "PageUp", down: "PageDown" } }, false),
        verdict("isTrackpadMap rejects a keyWheel whose up is not a KeyCode", isTrackpadMap, { ...FULL_TRACKPAD_MAP, twoFingerMove: { kind: "keyWheel", up: "Page Up", down: "PageDown" } }, false),
        verdict("isTrackpadMap rejects a keyWheel whose down is not a KeyCode", isTrackpadMap, { ...FULL_TRACKPAD_MAP, twoFingerMove: { kind: "keyWheel", up: "PageUp", down: "Page Down" } }, false),

        // isInputMapperConfig
        verdict("isInputMapperConfig accepts a config whose input is a DosInput", isInputMapperConfig, { input: freshInput() }, true),
        verdict("isInputMapperConfig rejects a value that is not an object", isInputMapperConfig, null, false),
        verdict("isInputMapperConfig rejects an input that is not a DosInput", isInputMapperConfig, { input: { session: new FakeEmulatorSession() } }, false),

        // press / release: the one switch from InputTarget to a DosInput call
        drives("press with a key target calls keyDown",
            (input) => InputMapper.press(input, KEY),
            { calls: [{ method: "sendKey", args: ["KeyA", true] }], snapshot: { ...EMPTY_SNAPSHOT, keysDown: ["KeyA"] } }),
        drives("release with a key target calls keyUp",
            (input) => { InputMapper.press(input, KEY); InputMapper.release(input, KEY); },
            { calls: [{ method: "sendKey", args: ["KeyA", true] }, { method: "sendKey", args: ["KeyA", false] }], snapshot: EMPTY_SNAPSHOT }),
        drives("press with a mouseButton target calls mouseDown",
            (input) => InputMapper.press(input, MOUSE),
            { calls: [{ method: "sendMouseButton", args: ["left", true] }], snapshot: { ...EMPTY_SNAPSHOT, mouseButtonsDown: ["left"] } }),
        drives("release with a mouseButton target calls mouseUp",
            (input) => { InputMapper.press(input, MOUSE); InputMapper.release(input, MOUSE); },
            { calls: [{ method: "sendMouseButton", args: ["left", true] }, { method: "sendMouseButton", args: ["left", false] }], snapshot: EMPTY_SNAPSHOT }),
        drives("press with a joystickButton target calls joystickButtonDown",
            (input) => InputMapper.press(input, JOYSTICK),
            { calls: [{ method: "sendJoystickButton", args: [1, true] }], snapshot: { ...EMPTY_SNAPSHOT, joystickButtonsDown: [1] } }),
        drives("release with a joystickButton target calls joystickButtonUp",
            (input) => { InputMapper.press(input, JOYSTICK); InputMapper.release(input, JOYSTICK); },
            { calls: [{ method: "sendJoystickButton", args: [1, true] }, { method: "sendJoystickButton", args: [1, false] }], snapshot: EMPTY_SNAPSHOT }),
    ],
};

export default testFile;
