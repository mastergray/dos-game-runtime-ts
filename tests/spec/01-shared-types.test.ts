// realizes: docs/headless-browser-dos-runtime-spec.md > §2 Shared Types (§2.1 predicates, §2.2 meaning, §2.3 tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    isEmulatorAdapter,                                           // Predicate under test
    isEmulatorSession,                                           // Predicate under test
    isEmulatorStartConfig,                                       // Predicate under test
    isFiniteNumber,                                              // Predicate under test
    isFrameScheduler,                                            // Predicate under test
    isInputSurface,                                              // Predicate under test
    isJoystickAxis,                                              // Predicate under test
    isJoystickButton,                                            // Predicate under test
    isKeyCode,                                                   // Predicate under test
    isMouseButton,                                               // Predicate under test
    isNonEmptyString,                                            // Predicate under test
    isPointerEventLike,                                          // Predicate under test
    isRect,                                                      // Predicate under test
    isVector2,                                                   // Predicate under test
} from "../../src/index.ts";
import FakeEmulatorAdapter from "../support/FakeEmulatorAdapter.ts";   // Accepted input for isEmulatorAdapter
import FakeEmulatorSession from "../support/FakeEmulatorSession.ts";   // Accepted input for isEmulatorSession

// Type dependencies:
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner

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

const NOOP = (): void => {};                                     // Placeholder function for method-shaped inputs

const SESSION_METHODS = [                                        // Every method isEmulatorSession requires
    "sendKey", "sendMouseMotion", "sendMousePosition", "sendMouseButton", "sendJoystickButton", "sendJoystickAxis",
    "pause", "resume", "persist", "exit", "onFrame", "onSound", "onExit",
] as const;

// HELPER :: STRING, (UNKNOWN -> BOOLEAN), UNKNOWN, BOOLEAN -> testCase
// Builds a case that evaluates predicate on input and expects result.
const predicateCase = (label: string, predicate: (value: unknown) => boolean, input: unknown, expected: boolean): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert(expected ? "returns true" : "returns false", () => ({ result: predicate(input) }), P.equals<PredicateSnapshot>({ result: expected }))
        .start(undefined),
});

// HELPER :: VOID -> {[STRING]:UNKNOWN}
// A plain object meeting every isEmulatorSession condition.
const sessionLike = (): Record<string, unknown> => {
    const object: Record<string, unknown> = { soundFrequency: 44100 };
    for (const method of SESSION_METHODS) object[method] = NOOP;
    return object;
};

// HELPER :: VOID -> {[STRING]:UNKNOWN}
// A plain object meeting every isPointerEventLike condition.
const pointerEventLike = (): Record<string, unknown> => ({
    type: "pointerdown", pointerId: 1, pointerType: "touch", clientX: 10, clientY: 20, button: 0, buttons: 1, timeStamp: 100, preventDefault: NOOP,
});

// HELPER :: VOID -> {[STRING]:UNKNOWN}
// A plain object meeting every isInputSurface condition, with the optional capture methods present.
const inputSurfaceLike = (): Record<string, unknown> => ({
    addEventListener: NOOP, removeEventListener: NOOP, getBoundingClientRect: NOOP, setPointerCapture: NOOP, releasePointerCapture: NOOP,
});

// HELPER :: {[STRING]:UNKNOWN}, STRING, UNKNOWN? -> {[STRING]:UNKNOWN}
// Copies object with key replaced by value, or removed when value is not given.
const withKey = (object: Record<string, unknown>, key: string, ...value: [unknown?]): Record<string, unknown> => {
    const copy = { ...object };
    if (value.length === 0) delete copy[key];
    else copy[key] = value[0];
    return copy;
};

const testFile: TestFile = {
    label: "shared types",
    cases: [
        // isNonEmptyString: string, at least one non-whitespace character
        predicateCase("isNonEmptyString accepts a string with a non-whitespace character", isNonEmptyString, "a", true),
        predicateCase("isNonEmptyString rejects a non-string", isNonEmptyString, 1, false),
        predicateCase("isNonEmptyString rejects the empty string", isNonEmptyString, "", false),
        predicateCase("isNonEmptyString rejects a whitespace-only string", isNonEmptyString, "  ", false),

        // isFiniteNumber
        predicateCase("isFiniteNumber accepts 0", isFiniteNumber, 0, true),
        predicateCase("isFiniteNumber accepts -1.5", isFiniteNumber, -1.5, true),
        predicateCase("isFiniteNumber rejects NaN", isFiniteNumber, NaN, false),
        predicateCase("isFiniteNumber rejects Infinity", isFiniteNumber, Infinity, false),
        predicateCase("isFiniteNumber rejects the string \"1\"", isFiniteNumber, "1", false),

        // isKeyCode: non-empty string of ASCII letters and digits only
        predicateCase("isKeyCode accepts \"ArrowUp\"", isKeyCode, "ArrowUp", true),
        predicateCase("isKeyCode rejects a non-string", isKeyCode, 38, false),
        predicateCase("isKeyCode rejects \"\"", isKeyCode, "", false),
        predicateCase("isKeyCode rejects \"Arrow Up\"", isKeyCode, "Arrow Up", false),
        predicateCase("isKeyCode rejects \"Arrow-Up\"", isKeyCode, "Arrow-Up", false),

        // isMouseButton: closed set
        predicateCase("isMouseButton accepts \"left\"", isMouseButton, "left", true),
        predicateCase("isMouseButton accepts \"middle\"", isMouseButton, "middle", true),
        predicateCase("isMouseButton accepts \"right\"", isMouseButton, "right", true),
        predicateCase("isMouseButton rejects a string outside the set", isMouseButton, "back", false),
        predicateCase("isMouseButton rejects a number", isMouseButton, 0, false),

        // isJoystickButton: 0 | 1 | 2 | 3
        predicateCase("isJoystickButton accepts 0", isJoystickButton, 0, true),
        predicateCase("isJoystickButton accepts 3", isJoystickButton, 3, true),
        predicateCase("isJoystickButton rejects 4", isJoystickButton, 4, false),
        predicateCase("isJoystickButton rejects -1", isJoystickButton, -1, false),
        predicateCase("isJoystickButton rejects the string \"0\"", isJoystickButton, "0", false),

        // isJoystickAxis: "x" | "y"
        predicateCase("isJoystickAxis accepts \"x\"", isJoystickAxis, "x", true),
        predicateCase("isJoystickAxis accepts \"y\"", isJoystickAxis, "y", true),
        predicateCase("isJoystickAxis rejects \"z\"", isJoystickAxis, "z", false),

        // isVector2: object with finite x and y
        predicateCase("isVector2 accepts {x, y} finite", isVector2, { x: 1, y: -2.5 }, true),
        predicateCase("isVector2 rejects null", isVector2, null, false),
        predicateCase("isVector2 rejects a non-finite x", isVector2, { x: NaN, y: 0 }, false),
        predicateCase("isVector2 rejects a missing y", isVector2, { x: 0 }, false),

        // isRect: object with finite left, top, width, height
        predicateCase("isRect accepts finite left, top, width, height", isRect, { left: 0, top: 0, width: 10, height: 20 }, true),
        predicateCase("isRect rejects a non-object", isRect, "rect", false),
        predicateCase("isRect rejects a non-finite left", isRect, { left: Infinity, top: 0, width: 10, height: 20 }, false),
        predicateCase("isRect rejects a missing top", isRect, { left: 0, width: 10, height: 20 }, false),
        predicateCase("isRect rejects a non-finite width", isRect, { left: 0, top: 0, width: NaN, height: 20 }, false),
        predicateCase("isRect rejects a string height", isRect, { left: 0, top: 0, width: 10, height: "20" }, false),

        // isPointerEventLike
        predicateCase("isPointerEventLike accepts the full shape", isPointerEventLike, pointerEventLike(), true),
        predicateCase("isPointerEventLike rejects a type outside the set", isPointerEventLike, withKey(pointerEventLike(), "type", "click"), false),
        predicateCase("isPointerEventLike rejects a non-number pointerId", isPointerEventLike, withKey(pointerEventLike(), "pointerId", "1"), false),
        predicateCase("isPointerEventLike rejects a pointerType outside the set", isPointerEventLike, withKey(pointerEventLike(), "pointerType", "stylus"), false),
        predicateCase("isPointerEventLike rejects a non-finite clientX", isPointerEventLike, withKey(pointerEventLike(), "clientX", NaN), false),
        predicateCase("isPointerEventLike rejects a non-finite clientY", isPointerEventLike, withKey(pointerEventLike(), "clientY", Infinity), false),
        predicateCase("isPointerEventLike rejects a non-number button", isPointerEventLike, withKey(pointerEventLike(), "button", "0"), false),
        predicateCase("isPointerEventLike rejects a non-number buttons", isPointerEventLike, withKey(pointerEventLike(), "buttons", null), false),
        predicateCase("isPointerEventLike rejects a non-finite timeStamp", isPointerEventLike, withKey(pointerEventLike(), "timeStamp", NaN), false),
        predicateCase("isPointerEventLike rejects a missing preventDefault", isPointerEventLike, withKey(pointerEventLike(), "preventDefault"), false),

        // isInputSurface: three required methods, two optional ones
        predicateCase("isInputSurface accepts the required methods with capture methods present", isInputSurface, inputSurfaceLike(), true),
        predicateCase("isInputSurface accepts the required methods with capture methods absent", isInputSurface, withKey(withKey(inputSurfaceLike(), "setPointerCapture"), "releasePointerCapture"), true),
        predicateCase("isInputSurface rejects a missing addEventListener", isInputSurface, withKey(inputSurfaceLike(), "addEventListener"), false),
        predicateCase("isInputSurface rejects a missing removeEventListener", isInputSurface, withKey(inputSurfaceLike(), "removeEventListener"), false),
        predicateCase("isInputSurface rejects a missing getBoundingClientRect", isInputSurface, withKey(inputSurfaceLike(), "getBoundingClientRect"), false),
        predicateCase("isInputSurface rejects a setPointerCapture that is not a function", isInputSurface, withKey(inputSurfaceLike(), "setPointerCapture", true), false),
        predicateCase("isInputSurface rejects a releasePointerCapture that is not a function", isInputSurface, withKey(inputSurfaceLike(), "releasePointerCapture", true), false),

        // isFrameScheduler
        predicateCase("isFrameScheduler accepts request and cancel functions", isFrameScheduler, { request: NOOP, cancel: NOOP }, true),
        predicateCase("isFrameScheduler rejects a missing request", isFrameScheduler, { cancel: NOOP }, false),
        predicateCase("isFrameScheduler rejects a missing cancel", isFrameScheduler, { request: NOOP }, false),

        // isEmulatorSession: every method a function, soundFrequency a number
        predicateCase("isEmulatorSession accepts a FakeEmulatorSession", isEmulatorSession, new FakeEmulatorSession(), true),
        predicateCase("isEmulatorSession rejects a non-object", isEmulatorSession, null, false),
        predicateCase("isEmulatorSession rejects a non-number soundFrequency", isEmulatorSession, withKey(sessionLike(), "soundFrequency", "44100"), false),
        ...SESSION_METHODS.map((method) =>
            predicateCase(`isEmulatorSession rejects an object missing ${method}`, isEmulatorSession, withKey(sessionLike(), method), false)),

        // isEmulatorAdapter: start a function, type a non-empty string
        predicateCase("isEmulatorAdapter accepts a FakeEmulatorAdapter", isEmulatorAdapter, new FakeEmulatorAdapter(), true),
        predicateCase("isEmulatorAdapter rejects a non-object", isEmulatorAdapter, undefined, false),
        predicateCase("isEmulatorAdapter rejects an empty type", isEmulatorAdapter, { type: "", start: NOOP }, false),
        predicateCase("isEmulatorAdapter rejects a missing start", isEmulatorAdapter, { type: "fake" }, false),

        // isEmulatorStartConfig: bundle a Uint8Array, changes absent or a Uint8Array
        predicateCase("isEmulatorStartConfig accepts a bundle alone", isEmulatorStartConfig, { bundle: new Uint8Array(1) }, true),
        predicateCase("isEmulatorStartConfig accepts a bundle with changes", isEmulatorStartConfig, { bundle: new Uint8Array(1), changes: new Uint8Array(1) }, true),
        predicateCase("isEmulatorStartConfig rejects a non-object", isEmulatorStartConfig, "bundle", false),
        predicateCase("isEmulatorStartConfig rejects a bundle that is not a Uint8Array", isEmulatorStartConfig, { bundle: [1] }, false),
        predicateCase("isEmulatorStartConfig rejects changes that are not a Uint8Array", isEmulatorStartConfig, { bundle: new Uint8Array(1), changes: "x" }, false),
    ],
};

export default testFile;
