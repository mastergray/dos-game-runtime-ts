// realizes: docs/headless-browser-dos-runtime-spec.md > §16 InputMapper (§16.1, §16.2, §16.3 browser)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestCase, TestFile } from "../run.ts";                           // Case and manifest contracts consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type {
    AnalogStick,                                                   // Stick primitive kept in-page
    AnalogStickMap,                                                // Map type; invalid maps are cast to it
    Button,                                                        // Button primitive kept in-page
    DPad,                                                          // D-pad primitive kept in-page
    DPadMap,                                                       // Map type; invalid maps are cast to it
    DosInput,                                                      // Input the mapper drives
    InputMapper,                                                   // Class under test, kept in-page
    InputMapperConfig,                                             // Config type; the invalid config is cast to it
    InputTarget,                                                   // Target type for bindButton
    JoystickAxis,                                                  // Axis literal in the snapshot
    JoystickButton,                                                // Joystick button literal in the snapshot
    KeyCode,                                                       // Key code in the snapshot
    MouseButton,                                                   // Mouse button literal in the snapshot
    Trackpad,                                                      // Trackpad primitive kept in-page
    TrackpadMap,                                                   // Map type; invalid maps are cast to it
} from "../../src/index.ts";
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page
import type FakeTimer from "../support/FakeTimer.ts";                         // Timer double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {dx:NUMBER, dy:NUMBER, pointers:NUMBER}
// One trackpad move event as the primitive emitted it, as plain JSON.
interface MoveSnapshot {
    dx: number;                                                    // Horizontal delta
    dy: number;                                                    // Vertical delta
    pointers: number;                                              // Pointer count at the time
}

// INTERFACE :: {session:fakeEmulatorSession, input:dosInput, mapper:inputMapper, timer:fakeTimer, button:button?, dpad:dPad?, stick:analogStick?, trackpad:trackpad?, pad:dPad?, unbind:(VOID -> VOID)?, moves:[moveSnapshot]}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    session: FakeEmulatorSession;                                  // The session double behind the input
    input: DosInput;                                               // The input the mapper drives
    mapper: InputMapper;                                           // The mapper under test
    timer: FakeTimer;                                              // Timer injected into Button and Trackpad
    button?: Button;                                               // Button on #surface, when setup made one
    dpad?: DPad;                                                   // DPad on #surface, when setup made one
    stick?: AnalogStick;                                           // AnalogStick on #surface, when setup made one
    trackpad?: Trackpad;                                           // Trackpad on #surface, when setup made one
    pad?: DPad;                                                    // DPad on #pad inside #extra, when setup made one
    unbind?: () => void;                                           // Unsubscribe returned by the last bind a step kept
    moves: MoveSnapshot[];                                         // Trackpad move events, recorded by a second listener
}

// INTERFACE :: {method:STRING, args:[UNKNOWN]}
// One recorded session call, as plain JSON.
interface CallSnapshot {
    method: string;                                                // Session method name
    args: unknown[];                                               // Arguments as given
}

// INTERFACE :: {x:NUMBER, y:NUMBER}
// A viewport point in CSS pixels.
interface Point {
    x: number;                                                     // clientX
    y: number;                                                     // clientY
}

// INTERFACE :: {button:BOOLEAN?, dpad:BOOLEAN?, stick:BOOLEAN?, trackpad:BOOLEAN?, pad:BOOLEAN?}
// Which primitives the in-page setup constructs and attaches.
interface SetupOptions {
    button?: boolean;                                              // Button on #surface
    dpad?: boolean;                                                // DPad on #surface
    stick?: boolean;                                               // AnalogStick on #surface
    trackpad?: boolean;                                            // Trackpad on #surface
    pad?: boolean;                                                 // DPad on a new #pad inside #extra
}

// INTERFACE :: {keysDown:[keyCode], mouseButtonsDown:[mouseButton], joystickButtonsDown:[joystickButton], joystickAxes:{x:NUMBER|STRING, y:NUMBER|STRING}}
// DosInput snapshot as plain JSON; axis values may be tokenized (see the joystick case).
interface InputSnapshot {
    keysDown: KeyCode[];                                           // Held keys, sorted
    mouseButtonsDown: MouseButton[];                               // Held mouse buttons
    joystickButtonsDown: JoystickButton[];                         // Held joystick buttons
    joystickAxes: Record<JoystickAxis, number | string>;           // Axis values
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout
const EMPTY_INPUT: InputSnapshot = { keysDown: [], mouseButtonsDown: [], joystickButtonsDown: [], joystickAxes: { x: 0, y: 0 } };   // Nothing held
const INVALID_CONFIG: ErrorSnapshot = { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" };   // Expected rejection of a bad map or config
const DESTROYED: ErrorSnapshot = { isRuntimeError: true, code: 8, label: "DESTROYED" };               // Expected rejection after destroy

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: a FakeEmulatorSession, a DosInput over it, an InputMapper over the input, and the requested primitives, attached.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { AnalogStick, Button, DPad, DosInput, DosRuntimeError, InputMapper, Trackpad } = window.harness.runtime;
    const { FakeEmulatorSession, FakeTimer } = window.harness.doubles;
    const surface = document.querySelector("#surface") as HTMLElement;
    const session = new FakeEmulatorSession();
    const input = new DosInput({ session });
    const scratch: Scratch = { session, input, mapper: new InputMapper({ input }), timer: new FakeTimer(), moves: [] };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { callsOf: () => CallSnapshot[] }).callsOf = () =>
        scratch.session.calls.map((c) => ({ method: c.method, args: [...c.args] }));
    (globalThis as unknown as { inputOf: () => InputSnapshot }).inputOf = () => {
        const s = scratch.input.snapshot;
        return { keysDown: [...s.keysDown], mouseButtonsDown: [...s.mouseButtonsDown], joystickButtonsDown: [...s.joystickButtonsDown], joystickAxes: { x: s.joystickAxes.x, y: s.joystickAxes.y } };
    };
    (globalThis as unknown as { pointAt: (selector: string, dx: number, dy: number) => Point }).pointAt = (selector, dx, dy) => {
        const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
        return { x: rect.left + rect.width / 2 + dx, y: rect.top + rect.height / 2 + dy };
    };
    (globalThis as unknown as { errorOf: (fn: () => unknown) => ErrorSnapshot }).errorOf = (fn) => {
        try { fn(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
        }
    };
    if (options.button === true) { scratch.button = new Button({ surface, timer: scratch.timer }); scratch.button.attach(); }
    if (options.dpad === true) { scratch.dpad = new DPad({ surface }); scratch.dpad.attach(); }
    if (options.stick === true) { scratch.stick = new AnalogStick({ surface }); scratch.stick.attach(); }
    if (options.trackpad === true) {
        scratch.trackpad = new Trackpad({ surface, timer: scratch.timer });
        scratch.trackpad.on("move", (event) => { scratch.moves.push({ dx: event.dx, dy: event.dy, pointers: event.pointers }); });
        scratch.trackpad.attach();
    }
    if (options.pad === true) {
        const element = document.createElement("div");
        element.id = "pad";
        element.style.width = "200px";
        element.style.height = "200px";
        element.style.touchAction = "none";
        (document.querySelector("#extra") as HTMLElement).appendChild(element);
        scratch.pad = new DPad({ surface: element });
        scratch.pad.attach();
    }
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> [callSnapshot]
// Plain-JSON copy of the session's recorded calls.
const callsOf = (): CallSnapshot[] => scratchOf().session.calls.map((c) => ({ method: c.method, args: [...c.args] }));

// HELPER :: VOID -> inputSnapshot
// Plain-JSON copy of the DosInput snapshot.
const inputOf = (): InputSnapshot => {
    const s = scratchOf().input.snapshot;
    return { keysDown: [...s.keysDown], mouseButtonsDown: [...s.mouseButtonsDown], joystickButtonsDown: [...s.joystickButtonsDown], joystickAxes: { x: s.joystickAxes.x, y: s.joystickAxes.y } };
};

// HELPER :: STRING, NUMBER, NUMBER -> point
// The element's center offset by (dx, dy) CSS pixels, in viewport coordinates.
const pointAt = (selector: string, dx: number, dy: number): Point => {
    const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    return { x: rect.left + rect.width / 2 + dx, y: rect.top + rect.height / 2 + dy };
};

// HELPER :: (VOID -> UNKNOWN) -> errorSnapshot
// Runs fn and snapshots what it threw; a non-throwing fn gives a non-error snapshot.
const errorOf = (fn: () => unknown): ErrorSnapshot => {
    const { DosRuntimeError } = window.harness.runtime;
    try { fn(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
        return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
    }
};

// HELPER :: STRING, inputTarget, callSnapshot, callSnapshot, inputSnapshot -> testCase
// Builds the bindButton case for one target kind: pointerdown presses the target, pointerup releases it.
const buttonCase = (label: string, target: InputTarget, press: CallSnapshot, release: CallSnapshot, held: InputSnapshot): TestCase => ({
    label,
    run: () => withHarness((url) => CTGBrowserTest.init(`bindButton ${target.kind}`)
        .interact("set up a Button on #surface and bind it to the target", async ({ page }) => {
            await page.evaluate(setup, { button: true } as SetupOptions);
            await page.evaluate((t: InputTarget) => {
                const s = scratchOf();
                s.mapper.bindButton(s.button as Button, t);
            }, target);
        })
        .assertPage("pointerdown on the button's surface presses the target",
            (page) => page.evaluate(() => {
                window.harness.pointer("#surface", "pointerdown", { pointerId: 1 });
                return { calls: callsOf(), input: inputOf() };
            }),
            P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({ calls: [press], input: held }))
        .assertPage("pointerup releases it",
            (page) => page.evaluate(() => {
                window.harness.pointer("#surface", "pointerup", { pointerId: 1 });
                return { calls: callsOf().slice(1), input: inputOf() };
            }),
            P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({ calls: [release], input: EMPTY_INPUT }))
        .start(url, { timeout: TIMEOUT })),
});

const testFile: TestFile = {
    label: "InputMapper",
    skip: await browserSkipReason(),
    cases: [
        // bindButton: press -> press(target), release -> release(target), per target kind
        buttonCase(
            "bindButton with a key target: press sends keyDown, release sends keyUp",
            { kind: "key", code: "Space" },
            { method: "sendKey", args: ["Space", true] },
            { method: "sendKey", args: ["Space", false] },
            { ...EMPTY_INPUT, keysDown: ["Space"] },
        ),
        buttonCase(
            "bindButton with a mouseButton target: press sends mouseDown, release sends mouseUp",
            { kind: "mouseButton", button: "left" },
            { method: "sendMouseButton", args: ["left", true] },
            { method: "sendMouseButton", args: ["left", false] },
            { ...EMPTY_INPUT, mouseButtonsDown: ["left"] },
        ),
        buttonCase(
            "bindButton with a joystickButton target: press sends joystickButtonDown, release sends joystickButtonUp",
            { kind: "joystickButton", button: 0 },
            { method: "sendJoystickButton", args: [0, true] },
            { method: "sendJoystickButton", args: [0, false] },
            { ...EMPTY_INPUT, joystickButtonsDown: [0] },
        ),

        // bindDPad: each press/release event maps through the map; directions without an entry are ignored
        {
            label: "bindDPad presses and releases the mapped direction's target; a direction without an entry is ignored",
            run: () => withHarness((url) => CTGBrowserTest.init("bindDPad")
                .interact("set up a DPad on #surface and bind up -> ArrowUp, right -> ArrowRight", async ({ page }) => {
                    await page.evaluate(setup, { dpad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindDPad(s.dpad as DPad, { up: { kind: "key", code: "ArrowUp" }, right: { kind: "key", code: "ArrowRight" } });
                    });
                })
                .assertPage("pointerdown at the top-edge center presses up's target",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 0, -100);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowUp", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowUp"] },
                    }))
                .assertPage("moving to the right-edge center releases up's target and presses right's",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 100, 0);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowUp", false] }, { method: "sendKey", args: ["ArrowRight", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowRight"] },
                    }))
                .assertPage("moving to the bottom-edge center (down, unmapped) releases right's target and presses nothing",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 0, 100);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(3), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowRight", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },

        // bindAnalogStick, joystick mode
        {
            // NOTE: Axis values are compared against AnalogStick.valueFor computed in-page; a matching argument is replaced by the token
            // "valueFor.x"/"valueFor.y" so the expected snapshot is static while a mismatch still shows the raw number.
            // NOTE: DosInput forwards an axis value only when it differs from the last one (§5.2), so the session sees an axis call only when it changes.
            label: "bindAnalogStick in joystick mode forwards change as joystickAxis x and y with the stick's value, and release as both 0",
            run: () => withHarness((url) => CTGBrowserTest.init("bindAnalogStick joystick")
                .interact("set up an AnalogStick on #surface, bind it in joystick mode, pointerdown at the center", async ({ page }) => {
                    await page.evaluate(setup, { stick: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindAnalogStick(s.stick as AnalogStick, { mode: "joystick" });
                        const p = pointAt("#surface", 0, 0);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, clientX: p.x, clientY: p.y });
                    });
                })
                .assertPage("a drag to +50, 0 forwards joystickAxis(x, valueFor.x); y stays at valueFor.y = 0",
                    (page) => page.evaluate(() => {
                        const { AnalogStick } = window.harness.runtime;
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        const v = AnalogStick.valueFor({ x: 50, y: 0 }, Math.min(rect.width, rect.height) / 2, AnalogStick.DEFAULT_DEAD_ZONE);
                        const token = (axis: unknown, value: unknown): unknown => (axis === "x" && value === v.x ? "valueFor.x" : axis === "y" && value === v.y ? "valueFor.y" : value);
                        const p = pointAt("#surface", 50, 0);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        const i = inputOf();
                        return {
                            valueFor: { xNonZero: v.x !== 0, y: v.y },
                            calls: callsOf().map((c) => ({ method: c.method, args: [c.args[0], token(c.args[0], c.args[1])] })),
                            joystickAxes: { x: token("x", i.joystickAxes.x), y: token("y", i.joystickAxes.y) },
                        };
                    }),
                    P.equals<{ valueFor: { xNonZero: boolean; y: number }; calls: CallSnapshot[]; joystickAxes: { x: unknown; y: unknown } }>({
                        valueFor: { xNonZero: true, y: 0 },
                        calls: [{ method: "sendJoystickAxis", args: ["x", "valueFor.x"] }],
                        joystickAxes: { x: "valueFor.x", y: "valueFor.y" },
                    }))
                .assertPage("a drag on to +30, +40 forwards joystickAxis(x, valueFor.x) then (y, valueFor.y)",
                    (page) => page.evaluate(() => {
                        const { AnalogStick } = window.harness.runtime;
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        const v = AnalogStick.valueFor({ x: 30, y: 40 }, Math.min(rect.width, rect.height) / 2, AnalogStick.DEFAULT_DEAD_ZONE);
                        const token = (axis: unknown, value: unknown): unknown => (axis === "x" && value === v.x ? "valueFor.x" : axis === "y" && value === v.y ? "valueFor.y" : value);
                        const p = pointAt("#surface", 30, 40);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        const i = inputOf();
                        return {
                            valueFor: { xNonZero: v.x !== 0, yNonZero: v.y !== 0 },
                            calls: callsOf().slice(1).map((c) => ({ method: c.method, args: [c.args[0], token(c.args[0], c.args[1])] })),
                            joystickAxes: { x: token("x", i.joystickAxes.x), y: token("y", i.joystickAxes.y) },
                        };
                    }),
                    P.equals<{ valueFor: { xNonZero: boolean; yNonZero: boolean }; calls: CallSnapshot[]; joystickAxes: { x: unknown; y: unknown } }>({
                        valueFor: { xNonZero: true, yNonZero: true },
                        calls: [{ method: "sendJoystickAxis", args: ["x", "valueFor.x"] }, { method: "sendJoystickAxis", args: ["y", "valueFor.y"] }],
                        joystickAxes: { x: "valueFor.x", y: "valueFor.y" },
                    }))
                .assertPage("pointerup forwards joystickAxis(x, 0) and (y, 0)",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 30, 40);
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(3), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendJoystickAxis", args: ["x", 0] }, { method: "sendJoystickAxis", args: ["y", 0] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },

        // bindAnalogStick, keys mode
        {
            label: "bindAnalogStick in keys mode with the default threshold presses right at x = 0.6 and releases it at 0.4",
            run: () => withHarness((url) => CTGBrowserTest.init("bindAnalogStick keys")
                .interact("set up an AnalogStick on #surface, bind it in keys mode with right -> ArrowRight, pointerdown at the center", async ({ page }) => {
                    await page.evaluate(setup, { stick: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindAnalogStick(s.stick as AnalogStick, { mode: "keys", keys: { right: { kind: "key", code: "ArrowRight" } } });
                        const p = pointAt("#surface", 0, 0);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, clientX: p.x, clientY: p.y });
                    });
                })
                .assertPage("a move to x = 0.6 of the radius presses ArrowRight",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 60, 0);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowRight", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowRight"] },
                    }))
                .assertPage("a move back to x = 0.4 of the radius releases it",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#surface", 40, 0);
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowRight", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },

        // bindTrackpad
        {
            label: "bindTrackpad with defaults forwards a one-finger move as mouseMove(dx, dy) of the trackpad's move deltas",
            run: () => withHarness((url) => CTGBrowserTest.init("bindTrackpad move")
                .interact("set up a Trackpad on #surface, bind it with an empty map, drag one finger from the center by +5,+3 then +12,+7", async ({ page }) => {
                    await page.evaluate(setup, { trackpad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindTrackpad(s.trackpad as Trackpad, {});
                        const a = pointAt("#surface", 0, 0);
                        const b = pointAt("#surface", 5, 3);
                        const c = pointAt("#surface", 12, 7);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, clientX: a.x, clientY: a.y, timeStamp: 0 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: b.x, clientY: b.y, timeStamp: 10 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, clientX: c.x, clientY: c.y, timeStamp: 20 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, clientX: c.x, clientY: c.y, timeStamp: 30 });
                    });
                })
                .assertPage("the session saw one sendMouseMotion per trackpad move, with its deltas",
                    (page) => page.evaluate(() => ({ moves: scratchOf().moves.map((m) => ({ ...m })), calls: callsOf() })),
                    P.equals<{ moves: MoveSnapshot[]; calls: CallSnapshot[] }>({
                        moves: [{ dx: 5, dy: 3, pointers: 1 }, { dx: 7, dy: 4, pointers: 1 }],
                        calls: [{ method: "sendMouseMotion", args: [5, 3] }, { method: "sendMouseMotion", args: [7, 4] }],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "bindTrackpad: a two-finger tap presses then releases the twoFingerTap target",
            run: () => withHarness((url) => CTGBrowserTest.init("bindTrackpad two-finger tap")
                .interact("set up a Trackpad on #surface, bind twoFingerTap -> right mouse button, tap with pointer ids 1 and 2 within 250 ms", async ({ page }) => {
                    await page.evaluate(setup, { trackpad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindTrackpad(s.trackpad as Trackpad, { twoFingerTap: { kind: "mouseButton", button: "right" } });
                        const a = pointAt("#surface", -20, 0);
                        const b = pointAt("#surface", 20, 0);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, clientX: a.x, clientY: a.y, timeStamp: 0 });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, clientX: b.x, clientY: b.y, timeStamp: 10 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, clientX: a.x, clientY: a.y, timeStamp: 100 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 2, clientX: b.x, clientY: b.y, timeStamp: 120 });
                    });
                })
                .assertPage("right mouse button down then up, nothing held",
                    (page) => page.evaluate(() => ({ calls: callsOf(), input: inputOf() })),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendMouseButton", args: ["right", true] }, { method: "sendMouseButton", args: ["right", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "bindTrackpad: holdStart presses the hold target and holdEnd releases it",
            run: () => withHarness((url) => CTGBrowserTest.init("bindTrackpad hold")
                .interact("set up a Trackpad on #surface, bind hold -> left mouse button, pointerdown at the center", async ({ page }) => {
                    await page.evaluate(setup, { trackpad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindTrackpad(s.trackpad as Trackpad, { hold: { kind: "mouseButton", button: "left" } });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, timeStamp: 0 });
                    });
                })
                .assertPage("advancing the timer 400 ms with no movement presses the hold target",
                    (page) => page.evaluate(() => {
                        scratchOf().timer.advance(400);
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendMouseButton", args: ["left", true] }],
                        input: { ...EMPTY_INPUT, mouseButtonsDown: ["left"] },
                    }))
                .assertPage("pointerup releases it",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, timeStamp: 500 });
                        return { calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendMouseButton", args: ["left", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },

        // Unsubscribe, bindings, unbindAll, destroy
        {
            label: "the Unsubscribe from bindButton, called while the button is pressed, sends the release and bindings drops by one",
            run: () => withHarness((url) => CTGBrowserTest.init("unsubscribe releases")
                .interact("set up a Button on #surface and a DPad on #pad, bind both, press the button", async ({ page }) => {
                    await page.evaluate(setup, { button: true, pad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.unbind = s.mapper.bindButton(s.button as Button, { kind: "key", code: "Space" });
                        s.mapper.bindDPad(s.pad as DPad, { up: { kind: "key", code: "ArrowUp" } });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1 });
                    });
                })
                .assertPage("two bindings, Space held",
                    (page) => page.evaluate(() => ({ bindings: scratchOf().mapper.bindings, calls: callsOf(), input: inputOf() })),
                    P.equals<{ bindings: number; calls: CallSnapshot[]; input: InputSnapshot }>({
                        bindings: 2,
                        calls: [{ method: "sendKey", args: ["Space", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["Space"] },
                    }))
                .assertPage("unsubscribing sends Space up and leaves one binding; the later pointerup sends nothing",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        (s.unbind as () => void)();
                        const bindings = s.mapper.bindings;
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1 });
                        return { bindings, calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ bindings: number; calls: CallSnapshot[]; input: InputSnapshot }>({
                        bindings: 1,
                        calls: [{ method: "sendKey", args: ["Space", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            // NOTE: The order in which unbindAll releases the two held keys is unspecified, so its calls are compared sorted by key code.
            label: "bindings counts live bindings; unbindAll sets it to 0 and releases everything held",
            run: () => withHarness((url) => CTGBrowserTest.init("unbindAll")
                .interact("set up a Button on #surface and a DPad on #pad, bind both, press the button and push the pad up", async ({ page }) => {
                    await page.evaluate(setup, { button: true, pad: true } as SetupOptions);
                    await page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.bindButton(s.button as Button, { kind: "key", code: "Space" });
                        s.mapper.bindDPad(s.pad as DPad, { up: { kind: "key", code: "ArrowUp" } });
                        const top = pointAt("#pad", 0, -100);
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1 });
                        window.harness.pointer("#pad", "pointerdown", { pointerId: 2, clientX: top.x, clientY: top.y });
                    });
                })
                .assertPage("two bindings, ArrowUp and Space held",
                    (page) => page.evaluate(() => ({ bindings: scratchOf().mapper.bindings, input: inputOf() })),
                    P.equals<{ bindings: number; input: InputSnapshot }>({ bindings: 2, input: { ...EMPTY_INPUT, keysDown: ["ArrowUp", "Space"] } }))
                .assertPage("unbindAll gives 0 bindings, releases both keys, and later pointerups send nothing",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.unbindAll();
                        const bindings = s.mapper.bindings;
                        const released = callsOf().slice(2).sort((a, b) => String(a.args[0]).localeCompare(String(b.args[0])));
                        const top = pointAt("#pad", 0, -100);
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1 });
                        window.harness.pointer("#pad", "pointerup", { pointerId: 2, clientX: top.x, clientY: top.y });
                        return { bindings, released, callCount: callsOf().length, input: inputOf() };
                    }),
                    P.equals<{ bindings: number; released: CallSnapshot[]; callCount: number; input: InputSnapshot }>({
                        bindings: 0,
                        released: [{ method: "sendKey", args: ["ArrowUp", false] }, { method: "sendKey", args: ["Space", false] }],
                        callCount: 4,
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "destroy then bindButton throws DESTROYED",
            run: () => withHarness((url) => CTGBrowserTest.init("destroy rejects binds")
                .interact("set up a Button on #surface", async ({ page }) => { await page.evaluate(setup, { button: true } as SetupOptions); })
                .assertPage("bindButton after destroy throws DESTROYED",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        s.mapper.destroy();
                        return errorOf(() => s.mapper.bindButton(s.button as Button, { kind: "key", code: "Space" }));
                    }),
                    P.equals<ErrorSnapshot>(DESTROYED))
                .start(url, { timeout: TIMEOUT }))
        },

        // Validation
        {
            label: "bindDPad, bindAnalogStick and bindTrackpad throw INVALID_CONFIG for a map that fails its predicate",
            run: () => withHarness((url) => CTGBrowserTest.init("invalid maps")
                .interact("set up a DPad, an AnalogStick and a Trackpad on #surface", async ({ page }) => {
                    await page.evaluate(setup, { dpad: true, stick: true, trackpad: true } as SetupOptions);
                })
                .assertPage("each invalid map is rejected with INVALID_CONFIG",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        return {
                            dpad: errorOf(() => s.mapper.bindDPad(s.dpad as DPad, { up: { kind: "nope" } } as unknown as DPadMap)),
                            stick: errorOf(() => s.mapper.bindAnalogStick(s.stick as AnalogStick, { mode: "bogus" } as unknown as AnalogStickMap)),
                            trackpad: errorOf(() => s.mapper.bindTrackpad(s.trackpad as Trackpad, { move: "sideways" } as unknown as TrackpadMap)),
                        };
                    }),
                    P.equals<{ dpad: ErrorSnapshot; stick: ErrorSnapshot; trackpad: ErrorSnapshot }>({ dpad: INVALID_CONFIG, stick: INVALID_CONFIG, trackpad: INVALID_CONFIG }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "constructor throws INVALID_CONFIG when input is not a DosInput",
            run: () => withHarness((url) => CTGBrowserTest.init("constructor rejects")
                .interact("define the page helpers", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("new InputMapper({ input: {} }) throws INVALID_CONFIG",
                    (page) => page.evaluate(() => {
                        const { InputMapper } = window.harness.runtime;
                        return errorOf(() => new InputMapper({ input: {} } as unknown as InputMapperConfig));
                    }),
                    P.equals<ErrorSnapshot>(INVALID_CONFIG))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
