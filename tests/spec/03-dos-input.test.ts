// realizes: docs/headless-browser-dos-runtime-spec.md > §5 DosInput (§5.1 declarations, §5.2 behavior, §5.3 tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    DosInput,                                                    // Class under test, via the public surface
    DosRuntimeError,                                             // Narrows thrown values and names codes
} from "../../src/index.ts";
import FakeEmulatorSession from "../support/FakeEmulatorSession.ts";   // Records every session call
import {
    errorSnapshot,                                               // Reduces a thrown value to {isRuntimeError, code, label}
    thrownBy,                                                    // Captures a thrown value for comparison
} from "../support/fixtures.ts";

// Type dependencies:
import type {
    DosInputConfig,                                              // Config shape; invalid inputs are cast to it
    DosInputSnapshot,                                            // Snapshot getter shape
    JoystickAxis,                                                // Axis argument; invalid inputs are cast to it
    JoystickButton,                                              // Button argument; invalid inputs are cast to it
    MouseButton,                                                 // Button argument; invalid inputs are cast to it
} from "../../src/index.ts";
import type { FakeSessionCall } from "../support/FakeEmulatorSession.ts";   // Recorded call shape
import type { ErrorSnapshot } from "../support/fixtures.ts";                 // Snapshot shape for equals comparison
import type { TestCase, TestFile } from "../run.ts";                         // Manifest contract consumed by the runner

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: errorSnapshot & {dataIsRejected:BOOLEAN}
// A rejection snapshot recording whether data is the rejected value itself.
interface RejectionSnapshot extends ErrorSnapshot {
    dataIsRejected: boolean;                                     // error.data === the value passed
}

// INTERFACE :: {input:dosInput, session:fakeEmulatorSession}
// Subject for cases that drive an input over a fake session.
interface Rig {
    input: DosInput;                                             // Instance under test
    session: FakeEmulatorSession;                                // Its session double
}

/**
 *
 * Constants
 *
 */

const EMPTY_SNAPSHOT: DosInputSnapshot = {                       // What snapshot reads when nothing is held
    keysDown: [],
    mouseButtonsDown: [],
    joystickButtonsDown: [],
    joystickAxes: { x: 0, y: 0 },
};

// HELPER :: VOID -> rig
// A fresh input over a fresh fake session.
const rig = (): Rig => {
    const session = new FakeEmulatorSession();
    return { input: new DosInput({ session }), session };
};

// HELPER :: UNKNOWN, UNKNOWN -> rejectionSnapshot
// Snapshot of a thrown value plus whether its data is the rejected value.
const rejection = (thrown: unknown, rejected: unknown): RejectionSnapshot => ({
    ...errorSnapshot(thrown, DosRuntimeError),
    dataIsRejected: DosRuntimeError.is(thrown) && Object.is(thrown.data, rejected),
});

const INVALID_CONFIG: RejectionSnapshot = { isRuntimeError: true, code: 1, label: "INVALID_CONFIG", dataIsRejected: true };   // Expected argument rejection
const DESTROYED: ErrorSnapshot = { isRuntimeError: true, code: 8, label: "DESTROYED" };                                       // Expected post-destroy rejection

// HELPER :: STRING, (dosInput -> VOID), UNKNOWN -> testCase
// Case: calling the method with rejected as an argument throws INVALID_CONFIG with data the rejected value, and the session is not called.
const rejectsArgument = (label: string, call: (input: DosInput) => void, rejected: unknown): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("call with the rejected argument", () => { const r = rig(); return { ...r, thrown: thrownBy(() => call(r.input)) }; })
        .assert("throws INVALID_CONFIG and sends nothing", (state) => ({ ...rejection(state.subject.thrown, rejected), calls: state.subject.session.calls.length }), P.equals<RejectionSnapshot & { calls: number }>({ ...INVALID_CONFIG, calls: 0 }))
        .start(undefined),
});

// HELPER :: STRING, (dosInput -> VOID), [fakeSessionCall], dosInputSnapshot -> testCase
// Case: after the calls, the session saw exactly the expected calls and snapshot reads as expected.
const sends = (label: string, calls: (input: DosInput) => void, expectedCalls: FakeSessionCall[], expectedSnapshot: DosInputSnapshot): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("drive the input", () => { const r = rig(); calls(r.input); return r; })
        .assert("session calls and snapshot match", (state) => ({ calls: state.subject.session.calls, snapshot: state.subject.input.snapshot }), P.equals<{ calls: FakeSessionCall[]; snapshot: DosInputSnapshot }>({ calls: expectedCalls, snapshot: expectedSnapshot }))
        .start(undefined),
});

// HELPER :: STRING, (dosInput -> VOID) -> testCase
// Case: after destroy, the method throws DESTROYED.
const throwsAfterDestroy = (label: string, call: (input: DosInput) => void): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("destroy then call", () => { const r = rig(); r.input.destroy(); return thrownBy(() => call(r.input)); })
        .assert("throws DESTROYED", (state) => errorSnapshot(state.subject, DosRuntimeError), P.equals<ErrorSnapshot>(DESTROYED))
        .start(undefined),
});

// HELPER :: STRING, [UNKNOWN] -> fakeSessionCall
// A recorded call literal.
const call = (method: string, args: unknown[]): FakeSessionCall => ({ method, args });

const testFile: TestFile = {
    label: "DosInput",
    cases: [
        {
            label: "constructor rejects a config without a session with INVALID_CONFIG and data the config",
            run: () => CTGTest.init("constructor rejects")
                .stage("construct with an empty object", () => { const config = {} as DosInputConfig; return rejection(thrownBy(() => new DosInput(config)), config); })
                .assert("throws INVALID_CONFIG", (state) => state.subject, P.equals<RejectionSnapshot>(INVALID_CONFIG))
                .start(undefined),
        },
        {
            label: "constructor rejects a session missing a method with INVALID_CONFIG",
            run: () => CTGTest.init("constructor rejects bad session")
                .stage("construct with a partial session", () => { const config = { session: { soundFrequency: 44100 } } as unknown as DosInputConfig; return rejection(thrownBy(() => new DosInput(config)), config); })
                .assert("throws INVALID_CONFIG", (state) => state.subject, P.equals<RejectionSnapshot>(INVALID_CONFIG))
                .start(undefined),
        },
        {
            label: "a new input holds nothing: snapshot is empty, isDestroyed is false, the session was not called",
            run: () => CTGTest.init("initial state")
                .stage("construct", rig)
                .assert("empty snapshot", (state) => ({ snapshot: state.subject.input.snapshot, isDestroyed: state.subject.input.isDestroyed, calls: state.subject.session.calls.length }), P.equals<{ snapshot: DosInputSnapshot; isDestroyed: boolean; calls: number }>({ snapshot: EMPTY_SNAPSHOT, isDestroyed: false, calls: 0 }))
                .start(undefined),
        },
        {
            label: "init returns an instance constructed as by the constructor",
            run: () => CTGTest.init("init")
                .stage("init", () => DosInput.init({ session: new FakeEmulatorSession() }))
                .assert("instance with an empty snapshot", (state) => ({ isInput: state.subject instanceof DosInput, snapshot: state.subject.snapshot }), P.equals<{ isInput: boolean; snapshot: DosInputSnapshot }>({ isInput: true, snapshot: EMPTY_SNAPSHOT }))
                .start(undefined),
        },

        // Argument rejection, one per method
        rejectsArgument("keyDown rejects a code that is not a KeyCode", (input) => input.keyDown("Arrow Up"), "Arrow Up"),
        rejectsArgument("keyUp rejects a code that is not a KeyCode", (input) => input.keyUp(""), ""),
        rejectsArgument("keyPress rejects a code that is not a KeyCode", (input) => input.keyPress("Arrow-Up"), "Arrow-Up"),
        rejectsArgument("mouseMove rejects a non-finite dx", (input) => input.mouseMove(NaN, 0), NaN),
        rejectsArgument("mouseMove rejects a non-finite dy", (input) => input.mouseMove(0, Infinity), Infinity),
        rejectsArgument("mouseMoveTo rejects x -0.001", (input) => input.mouseMoveTo(-0.001, 0), -0.001),
        rejectsArgument("mouseMoveTo rejects x 1.001", (input) => input.mouseMoveTo(1.001, 0), 1.001),
        rejectsArgument("mouseMoveTo rejects a non-finite x", (input) => input.mouseMoveTo(NaN, 0), NaN),
        rejectsArgument("mouseMoveTo rejects a string x", (input) => input.mouseMoveTo("0.5" as unknown as number, 0), "0.5"),
        rejectsArgument("mouseMoveTo rejects y -0.001", (input) => input.mouseMoveTo(0, -0.001), -0.001),
        rejectsArgument("mouseMoveTo rejects y 1.001", (input) => input.mouseMoveTo(0, 1.001), 1.001),
        rejectsArgument("mouseMoveTo rejects a non-finite y", (input) => input.mouseMoveTo(0, NaN), NaN),
        rejectsArgument("mouseMoveTo rejects a string y", (input) => input.mouseMoveTo(0, "0.5" as unknown as number), "0.5"),
        rejectsArgument("mouseDown rejects a button outside the set", (input) => input.mouseDown("back" as MouseButton), "back"),
        rejectsArgument("mouseUp rejects a button outside the set", (input) => input.mouseUp("back" as MouseButton), "back"),
        rejectsArgument("joystickButtonDown rejects a button outside 0..3", (input) => input.joystickButtonDown(4 as JoystickButton), 4),
        rejectsArgument("joystickButtonUp rejects a button outside 0..3", (input) => input.joystickButtonUp(-1 as JoystickButton), -1),
        rejectsArgument("joystickAxis rejects an axis outside the set", (input) => input.joystickAxis("z" as JoystickAxis, 0), "z"),
        rejectsArgument("joystickAxis rejects a non-finite value", (input) => input.joystickAxis("x", NaN), NaN),
        rejectsArgument("joystickAxis rejects 1.0001", (input) => input.joystickAxis("x", 1.0001), 1.0001),
        rejectsArgument("joystickAxis rejects -1.0001", (input) => input.joystickAxis("x", -1.0001), -1.0001),

        // Forwarding and idempotent holds
        sends("keyDown forwards to the session and records the key",
            (input) => input.keyDown("ArrowUp"),
            [call("sendKey", ["ArrowUp", true])],
            { ...EMPTY_SNAPSHOT, keysDown: ["ArrowUp"] }),
        sends("keyDown twice sends once and the snapshot is unchanged",
            (input) => { input.keyDown("ArrowUp"); input.keyDown("ArrowUp"); },
            [call("sendKey", ["ArrowUp", true])],
            { ...EMPTY_SNAPSHOT, keysDown: ["ArrowUp"] }),
        sends("keyUp without keyDown sends nothing",
            (input) => input.keyUp("ArrowUp"),
            [],
            EMPTY_SNAPSHOT),
        sends("keyDown then keyUp sends both and releases the key",
            (input) => { input.keyDown("ArrowUp"); input.keyUp("ArrowUp"); },
            [call("sendKey", ["ArrowUp", true]), call("sendKey", ["ArrowUp", false])],
            EMPTY_SNAPSHOT),
        sends("keyPress sends down then up synchronously",
            (input) => input.keyPress("Enter"),
            [call("sendKey", ["Enter", true]), call("sendKey", ["Enter", false])],
            EMPTY_SNAPSHOT),
        sends("snapshot lists keysDown sorted",
            (input) => { input.keyDown("KeyZ"); input.keyDown("KeyA"); },
            [call("sendKey", ["KeyZ", true]), call("sendKey", ["KeyA", true])],
            { ...EMPTY_SNAPSHOT, keysDown: ["KeyA", "KeyZ"] }),
        sends("mouseMove forwards both deltas unchanged",
            (input) => input.mouseMove(3, -2),
            [call("sendMouseMotion", [3, -2])],
            EMPTY_SNAPSHOT),
        sends("mouseMove(0, 0) sends nothing",
            (input) => input.mouseMove(0, 0),
            [],
            EMPTY_SNAPSHOT),
        sends("mouseMove with one zero delta is still forwarded",
            (input) => input.mouseMove(0, 5),
            [call("sendMouseMotion", [0, 5])],
            EMPTY_SNAPSHOT),
        sends("mouseMoveTo accepts 0 and forwards to sendMousePosition",
            (input) => input.mouseMoveTo(0, 0),
            [call("sendMousePosition", [0, 0])],
            EMPTY_SNAPSHOT),
        sends("mouseMoveTo accepts 1 and forwards to sendMousePosition",
            (input) => input.mouseMoveTo(1, 1),
            [call("sendMousePosition", [1, 1])],
            EMPTY_SNAPSHOT),
        sends("mouseMoveTo forwards both coordinates unchanged",
            (input) => input.mouseMoveTo(0.25, 0.75),
            [call("sendMousePosition", [0.25, 0.75])],
            EMPTY_SNAPSHOT),
        sends("mouseMoveTo with the same position twice forwards twice: not deduplicated",
            (input) => { input.mouseMoveTo(0.25, 0.75); input.mouseMoveTo(0.25, 0.75); },
            [call("sendMousePosition", [0.25, 0.75]), call("sendMousePosition", [0.25, 0.75])],
            EMPTY_SNAPSHOT),
        sends("mouseDown twice sends once",
            (input) => { input.mouseDown("left"); input.mouseDown("left"); },
            [call("sendMouseButton", ["left", true])],
            { ...EMPTY_SNAPSHOT, mouseButtonsDown: ["left"] }),
        sends("mouseUp without mouseDown sends nothing",
            (input) => input.mouseUp("right"),
            [],
            EMPTY_SNAPSHOT),
        sends("mouseDown then mouseUp sends both and releases the button",
            (input) => { input.mouseDown("right"); input.mouseUp("right"); },
            [call("sendMouseButton", ["right", true]), call("sendMouseButton", ["right", false])],
            EMPTY_SNAPSHOT),
        sends("joystickButtonDown twice sends once",
            (input) => { input.joystickButtonDown(2); input.joystickButtonDown(2); },
            [call("sendJoystickButton", [2, true])],
            { ...EMPTY_SNAPSHOT, joystickButtonsDown: [2] }),
        sends("joystickButtonUp without joystickButtonDown sends nothing",
            (input) => input.joystickButtonUp(0),
            [],
            EMPTY_SNAPSHOT),
        sends("joystickAxis accepts -1 and 1 and records them",
            (input) => { input.joystickAxis("x", -1); input.joystickAxis("y", 1); },
            [call("sendJoystickAxis", ["x", -1]), call("sendJoystickAxis", ["y", 1])],
            { ...EMPTY_SNAPSHOT, joystickAxes: { x: -1, y: 1 } }),
        sends("joystickAxis with the same value twice forwards once",
            (input) => { input.joystickAxis("x", 0.5); input.joystickAxis("x", 0.5); },
            [call("sendJoystickAxis", ["x", 0.5])],
            { ...EMPTY_SNAPSHOT, joystickAxes: { x: 0.5, y: 0 } }),
        sends("releaseAll sends key ups, mouse ups, joystick button ups, then zero axes, in that order, and empties the snapshot",
            (input) => {
                input.keyDown("KeyB"); input.keyDown("KeyA");
                input.mouseDown("left");
                input.joystickButtonDown(1);
                input.joystickAxis("y", 0.75);
                input.releaseAll();
            },
            [
                call("sendKey", ["KeyB", true]), call("sendKey", ["KeyA", true]),
                call("sendMouseButton", ["left", true]),
                call("sendJoystickButton", [1, true]),
                call("sendJoystickAxis", ["y", 0.75]),
                call("sendKey", ["KeyA", false]), call("sendKey", ["KeyB", false]),
                call("sendMouseButton", ["left", false]),
                call("sendJoystickButton", [1, false]),
                call("sendJoystickAxis", ["y", 0]),
            ],
            EMPTY_SNAPSHOT),
        sends("releaseAll with nothing held sends nothing",
            (input) => input.releaseAll(),
            [],
            EMPTY_SNAPSHOT),
        {
            label: "snapshot is a fresh object on each read",
            run: () => CTGTest.init("fresh snapshot")
                .stage("construct", rig)
                .assert("two reads are equal but not the same object", (state) => { const a = state.subject.input.snapshot; const b = state.subject.input.snapshot; return { same: a === b, equal: JSON.stringify(a) === JSON.stringify(b) }; }, P.equals<{ same: boolean; equal: boolean }>({ same: false, equal: true }))
                .start(undefined),
        },
        {
            label: "a session error propagates unchanged",
            run: () => CTGTest.init("session error propagates")
                .stage("script sendKey to throw and call keyDown", () => {
                    const r = rig();
                    const failure = new Error("session failed");
                    r.session.script("sendKey", "throw", failure);
                    return { failure, thrown: thrownBy(() => r.input.keyDown("KeyA")) };
                })
                .assert("the same value is thrown", (state) => state.subject.thrown === state.subject.failure, P.equals<boolean>(true))
                .start(undefined),
        },

        // destroy
        {
            label: "destroy releases everything, marks destroyed, and a second destroy is a no-op",
            run: () => CTGTest.init("destroy")
                .stage("hold a key, destroy twice", () => { const r = rig(); r.input.keyDown("KeyA"); r.input.destroy(); r.input.destroy(); return r; })
                .assert("one release sent, destroyed, snapshot empty", (state) => ({ calls: state.subject.session.calls, isDestroyed: state.subject.input.isDestroyed, snapshot: state.subject.input.snapshot }), P.equals<{ calls: FakeSessionCall[]; isDestroyed: boolean; snapshot: DosInputSnapshot }>({
                    calls: [call("sendKey", ["KeyA", true]), call("sendKey", ["KeyA", false])], isDestroyed: true, snapshot: EMPTY_SNAPSHOT,
                }))
                .start(undefined),
        },
        throwsAfterDestroy("keyDown throws DESTROYED after destroy", (input) => input.keyDown("KeyA")),
        throwsAfterDestroy("keyUp throws DESTROYED after destroy", (input) => input.keyUp("KeyA")),
        throwsAfterDestroy("keyPress throws DESTROYED after destroy", (input) => input.keyPress("KeyA")),
        throwsAfterDestroy("mouseMove throws DESTROYED after destroy", (input) => input.mouseMove(1, 1)),
        throwsAfterDestroy("mouseMoveTo throws DESTROYED after destroy", (input) => input.mouseMoveTo(0.5, 0.5)),
        throwsAfterDestroy("mouseDown throws DESTROYED after destroy", (input) => input.mouseDown("left")),
        throwsAfterDestroy("mouseUp throws DESTROYED after destroy", (input) => input.mouseUp("left")),
        throwsAfterDestroy("joystickButtonDown throws DESTROYED after destroy", (input) => input.joystickButtonDown(0)),
        throwsAfterDestroy("joystickButtonUp throws DESTROYED after destroy", (input) => input.joystickButtonUp(0)),
        throwsAfterDestroy("joystickAxis throws DESTROYED after destroy", (input) => input.joystickAxis("x", 0.5)),
        throwsAfterDestroy("releaseAll throws DESTROYED after destroy", (input) => input.releaseAll()),
    ],
};

export default testFile;
