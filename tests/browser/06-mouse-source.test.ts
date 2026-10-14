// realizes: docs/headless-browser-dos-runtime-spec.md > §10 MouseSource (§10.3)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { DosInput, MouseButton, MouseSource, MouseSourceConfig, MouseTouchMode, PointerLockLike } from "../../src/index.ts";   // Instance types kept in-page
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {requests:NUMBER, exits:NUMBER}
// Calls the in-page pointer lock target has received.
interface LockCounts {
    requests: number;                                              // requestPointerLock calls
    exits: number;                                                 // ownerDocument.exitPointerLock calls
}

// INTERFACE :: {source:mouseSource?, input:dosInput?, session:fakeEmulatorSession?, lockCounts:lockCounts?}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    source?: MouseSource;                                          // The source under test
    input?: DosInput;                                              // The input it forwards to
    session?: FakeEmulatorSession;                                 // The session double behind the input
    lockCounts?: LockCounts;                                       // Calls on the pointer lock target, when setup gave one
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

// INTERFACE :: {sensitivity:NUMBER?, attach:BOOLEAN?, locked:BOOLEAN?, touch:mouseTouchMode?}
// Options for the in-page setup.
interface SetupOptions {
    sensitivity?: number;                                          // Passed through to the config when given
    attach?: boolean;                                              // Whether setup calls attach(); defaults to true
    locked?: boolean;                                              // Whether setup passes a pointerLock whose pointerLockElement is itself
    touch?: MouseTouchMode;                                        // Passed through to the config when given
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout
const OFFSET: Point = { x: 10, y: 5 };                             // Second-step movement used by the touch case

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: constructs a MouseSource on #surface over a DosInput and a FakeEmulatorSession, and defines the page globals below.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { DosInput, MouseSource } = window.harness.runtime;
    const { FakeEmulatorSession } = window.harness.doubles;
    const scratch: Scratch = {};
    const surface = document.querySelector("#surface") as HTMLElement;
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The scratchOf/callsOf/centerOf helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { callsOf: () => CallSnapshot[] }).callsOf = () =>
        (scratch.session as FakeEmulatorSession).calls.map((c) => ({ method: c.method, args: [...c.args] }));
    (globalThis as unknown as { centerOf: () => Point }).centerOf = () => {
        const rect = surface.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    scratch.session = new FakeEmulatorSession();
    scratch.input = new DosInput({ session: scratch.session });
    const config: { input: DosInput; surface: HTMLElement; sensitivity?: number; pointerLock?: PointerLockLike; touch?: MouseTouchMode } = { input: scratch.input, surface };
    if (options.sensitivity !== undefined) config.sensitivity = options.sensitivity;
    if (options.touch !== undefined) config.touch = options.touch;
    if (options.locked === true) {
        const counts: LockCounts = { requests: 0, exits: 0 };
        const lockTarget = { requestPointerLock() { counts.requests++; }, ownerDocument: { exitPointerLock() { counts.exits++; }, pointerLockElement: null as unknown } };
        lockTarget.ownerDocument.pointerLockElement = lockTarget;
        scratch.lockCounts = counts;
        config.pointerLock = lockTarget as unknown as PointerLockLike;   // pointerLockElement is typed Element | null; the spec observes lock through a plain object that is its own lock element
    }
    scratch.source = new MouseSource(config);
    if (options.attach !== false) scratch.source.attach();
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> [callSnapshot]
// Plain-JSON copy of the session's recorded calls.
const callsOf = (): CallSnapshot[] => (scratchOf().session as FakeEmulatorSession).calls.map((c) => ({ method: c.method, args: [...c.args] }));

// HELPER :: VOID -> point
// Center of #surface in viewport pixels, rounded to whole pixels.
const centerOf = (): Point => {
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
};

const testFile: TestFile = {
    label: "MouseSource",
    skip: await browserSkipReason(),
    cases: [
        // Movement, unlocked: absolute positions over the surface
        {
            label: "page.mouse.move to the surface's center gives exactly one sendMousePosition(0.5, 0.5)",
            run: () => withHarness((url) => CTGBrowserTest.init("real move to center")
                .interact("mount on #surface and move the real mouse to its center", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                })
                .assertPage("one sendMousePosition(0.5, 0.5)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "page.mouse.move to the surface's top-left corner plus 20 px gives sendMousePosition(0.1, 0.1)",
            run: () => withHarness((url) => CTGBrowserTest.init("real move near corner")
                .interact("mount on #surface and move the real mouse 20 px in from its top-left corner", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const corner = await page.evaluate((): Point => {
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        return { x: rect.left, y: rect.top };
                    });
                    await page.mouse.move(corner.x + 20, corner.y + 20);
                })
                .assertPage("one sendMousePosition(0.1, 0.1)",
                    (page) => page.evaluate(() => callsOf().map((c) => ({ method: c.method, args: c.args.map((a) => typeof a === "number" ? Math.round(a * 10000) / 10000 : a) }))),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.1, 0.1] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a synthetic move 50 px outside the surface clamps to 0 or 1",
            run: () => withHarness((url) => CTGBrowserTest.init("position clamps")
                .interact("mount, then move 50 px left of and above the surface, then 50 px right of and below it", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: rect.left - 50, clientY: rect.top - 50, buttons: 0 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: rect.left + rect.width + 50, clientY: rect.top + rect.height + 50, buttons: 0 });
                    });
                })
                .assertPage("sendMousePosition(0, 0) then sendMousePosition(1, 1)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0, 0] }, { method: "sendMousePosition", args: [1, 1] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "page.mouse.down() at the center gives sendMousePosition(0.5, 0.5) then sendMouseButton(left, true), and up() gives (left, false)",
            run: () => withHarness((url) => CTGBrowserTest.init("real press sends position first")
                .interact("mount and move the real mouse to the center", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                })
                .assertPage("the move sent one position", (page) => page.evaluate(callsOf), P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }]))
                .interact("press the real left button", async ({ page }) => { await page.mouse.down(); })
                .assertPage("the press sent the position, then left down",
                    (page) => page.evaluate(() => callsOf().slice(1)),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }, { method: "sendMouseButton", args: ["left", true] }]))
                .interact("release the real left button", async ({ page }) => { await page.mouse.up(); })
                .assertPage("the release sent left up",
                    (page) => page.evaluate(() => callsOf().slice(3)),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseButton", args: ["left", false] }]))
                .start(url, { timeout: TIMEOUT }))
        },

        // Movement, locked: relative deltas from movementX/movementY
        {
            label: "a pointerLock whose pointerLockElement is itself makes isLocked true; lock and unlock call it without throwing",
            run: () => withHarness((url) => CTGBrowserTest.init("locked via pointerLock")
                .interact("mount with a pointerLock that is its own lock element", async ({ page }) => { await page.evaluate(setup, { locked: true } as SetupOptions); })
                .assertPage("isLocked is true; lock and unlock each reach the target once",
                    (page) => page.evaluate((): { isLocked: boolean; threw: boolean; counts: LockCounts } => {
                        const source = scratchOf().source as MouseSource;
                        const isLocked = source.isLocked;
                        let threw = false;
                        try { source.lock(); source.unlock(); } catch { threw = true; }
                        return { isLocked, threw, counts: { ...(scratchOf().lockCounts as LockCounts) } };
                    }),
                    P.equals<{ isLocked: boolean; threw: boolean; counts: LockCounts }>({ isLocked: true, threw: false, counts: { requests: 1, exits: 1 } }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "locked: a synthetic move with movementX +10 gives one mouseMove(10, 0)",
            run: () => withHarness((url) => CTGBrowserTest.init("locked delta")
                .interact("mount locked and dispatch one move with movementX 10", async ({ page }) => {
                    await page.evaluate(setup, { locked: true } as SetupOptions);
                    await page.evaluate(() => {
                        (document.querySelector("#surface") as HTMLElement).dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, movementX: 10, movementY: 0, bubbles: true }));
                    });
                })
                .assertPage("one sendMouseMotion(10, 0)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseMotion", args: [10, 0] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "locked: sensitivity 2 doubles the delta",
            run: () => withHarness((url) => CTGBrowserTest.init("locked sensitivity")
                .interact("mount locked with sensitivity 2 and dispatch one move with movementX 10", async ({ page }) => {
                    await page.evaluate(setup, { locked: true, sensitivity: 2 } as SetupOptions);
                    await page.evaluate(() => {
                        (document.querySelector("#surface") as HTMLElement).dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, movementX: 10, movementY: 0, bubbles: true }));
                    });
                })
                .assertPage("one sendMouseMotion(20, 0)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseMotion", args: [20, 0] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "locked: sub-pixel remainders accumulate: three moves scaling to +0.4 give one mouseMove(1, 0)",
            // NOTE: Chromium truncates a fractional movementX in the PointerEvent init to 0 (it is a long), so +0.4 per move is produced as movementX 1 at sensitivity 0.4.
            run: () => withHarness((url) => CTGBrowserTest.init("locked remainder accumulation")
                .interact("mount locked with sensitivity 0.4 and dispatch three moves with movementX 1", async ({ page }) => {
                    await page.evaluate(setup, { locked: true, sensitivity: 0.4 } as SetupOptions);
                    await page.evaluate(() => {
                        const surface = document.querySelector("#surface") as HTMLElement;
                        for (let i = 0; i < 3; i++) surface.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, movementX: 1, movementY: 0, bubbles: true }));
                    });
                })
                .assertPage("exactly one sendMouseMotion(1, 0)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseMotion", args: [1, 0] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "locked: pointerdown sends no position, only the button",
            run: () => withHarness((url) => CTGBrowserTest.init("locked press")
                .interact("mount locked and dispatch a left pointerdown at the center", async ({ page }) => {
                    await page.evaluate(setup, { locked: true } as SetupOptions);
                    await page.evaluate(() => { window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 }); });
                })
                .assertPage("only sendMouseButton(left, true)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseButton", args: ["left", true] }]))
                .start(url, { timeout: TIMEOUT }))
        },

        // Buttons
        {
            label: "a synthetic pointerdown with button 2 maps to right and 1 to middle",
            run: () => withHarness((url) => CTGBrowserTest.init("buttons")
                .interact("mount, then synthetic pointerdown/up at the center with button 2, then with button 1", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, buttons: 2 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "mouse", button: 2, buttons: 0 });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 1, buttons: 4 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "mouse", button: 1, buttons: 0 });
                    });
                })
                .assertPage("position then right down, right up, position then middle down, middle up",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([
                        { method: "sendMousePosition", args: [0.5, 0.5] },
                        { method: "sendMouseButton", args: ["right", true] },
                        { method: "sendMouseButton", args: ["right", false] },
                        { method: "sendMousePosition", args: [0.5, 0.5] },
                        { method: "sendMouseButton", args: ["middle", true] },
                        { method: "sendMouseButton", args: ["middle", false] },
                    ]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a synthetic pointercancel after pointerdown releases the held button",
            run: () => withHarness((url) => CTGBrowserTest.init("pointercancel releases")
                .interact("mount, press left at the center, cancel", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 });
                        window.harness.pointer("#surface", "pointercancel", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0 });
                    });
                })
                .assertPage("position, left down, then left up, and no mouse button held",
                    (page) => page.evaluate(() => ({ calls: callsOf(), mouseButtonsDown: (scratchOf().input as DosInput).snapshot.mouseButtonsDown })),
                    P.equals<{ calls: CallSnapshot[]; mouseButtonsDown: readonly MouseButton[] }>({
                        calls: [{ method: "sendMousePosition", args: [0.5, 0.5] }, { method: "sendMouseButton", args: ["left", true] }, { method: "sendMouseButton", args: ["left", false] }],
                        mouseButtonsDown: [],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with the default touch none, touch reads none and events with pointerType touch are ignored",
            run: () => withHarness((url) => CTGBrowserTest.init("touch ignored")
                .interact("mount and dispatch a touch down, two moves and an up", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate((offset: Point) => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: center.x, clientY: center.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: center.x, clientY: center.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: center.x + offset.x, clientY: center.y + offset.y });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: center.x + offset.x, clientY: center.y + offset.y });
                    }, OFFSET);
                })
                .assertPage("touch reads none and no session call",
                    (page) => page.evaluate(() => ({ touch: (scratchOf().source as MouseSource).touch, calls: callsOf() })),
                    P.equals<{ touch: MouseTouchMode; calls: CallSnapshot[] }>({ touch: "none", calls: [] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with touch absolute, a touch down at the center gives sendMousePosition(0.5, 0.5) then left down, a touch move gives a position, a second touch id while the first is down gives nothing, and its up gives left up",
            run: () => withHarness((url) => CTGBrowserTest.init("touch absolute")
                .interact("mount with touch absolute and press a touch at the center", async ({ page }) => {
                    await page.evaluate(setup, { touch: "absolute" } as SetupOptions);
                    await page.evaluate(() => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: center.x, clientY: center.y });
                    });
                })
                .assertPage("touch reads absolute; the press sent the position, then left down",
                    (page) => page.evaluate(() => ({ touch: (scratchOf().source as MouseSource).touch, calls: callsOf() })),
                    P.equals<{ touch: MouseTouchMode; calls: CallSnapshot[] }>({
                        touch: "absolute",
                        calls: [{ method: "sendMousePosition", args: [0.5, 0.5] }, { method: "sendMouseButton", args: ["left", true] }],
                    }))
                .interact("move the touch to the top-left corner plus 20 px", async ({ page }) => {
                    await page.evaluate(() => {
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: rect.left + 20, clientY: rect.top + 20 });
                    });
                })
                .assertPage("the move sent sendMousePosition(0.1, 0.1)",
                    (page) => page.evaluate(() => callsOf().slice(2).map((c) => ({ method: c.method, args: c.args.map((a) => typeof a === "number" ? Math.round(a * 10000) / 10000 : a) }))),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.1, 0.1] }]))
                .interact("press and move a second touch id while the first is held", async ({ page }) => {
                    await page.evaluate((offset: Point) => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, pointerType: "touch", clientX: center.x, clientY: center.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 2, pointerType: "touch", clientX: center.x + offset.x, clientY: center.y + offset.y });
                    }, OFFSET);
                })
                .assertPage("the second touch sent nothing", (page) => page.evaluate(() => callsOf().slice(3)), P.equals<CallSnapshot[]>([]))
                .interact("lift the first touch", async ({ page }) => {
                    await page.evaluate(() => {
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: rect.left + 20, clientY: rect.top + 20 });
                    });
                })
                .assertPage("the lift sent left up",
                    (page) => page.evaluate(() => callsOf().slice(3)),
                    P.equals<CallSnapshot[]>([{ method: "sendMouseButton", args: ["left", false] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with touch absolute, a mouse pointer is still handled: page.mouse.move to the center gives sendMousePosition(0.5, 0.5)",
            run: () => withHarness((url) => CTGBrowserTest.init("touch absolute keeps mouse")
                .interact("mount with touch absolute and move the real mouse to the center", async ({ page }) => {
                    await page.evaluate(setup, { touch: "absolute" } as SetupOptions);
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                })
                .assertPage("one sendMousePosition(0.5, 0.5)",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "contextmenu on the surface is prevented",
            run: () => withHarness((url) => CTGBrowserTest.init("contextmenu prevented")
                .interact("mount", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("a mouse contextmenu dispatched on #surface has defaultPrevented true",
                    (page) => page.evaluate(() => {
                        const event = new PointerEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", button: 2, buttons: 0 });
                        (document.querySelector("#surface") as HTMLElement).dispatchEvent(event);
                        return event.defaultPrevented;
                    }),
                    P.isTrue())
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "contextmenu on the surface is still prevented while enabled is false",
            run: () => withHarness((url) => CTGBrowserTest.init("contextmenu prevented while disabled")
                .interact("mount and close the gate", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => { (scratchOf().source as MouseSource).enabled = false; });
                })
                .assertPage("a mouse contextmenu dispatched on #surface has defaultPrevented true",
                    (page) => page.evaluate(() => {
                        const event = new PointerEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", button: 2, buttons: 0 });
                        (document.querySelector("#surface") as HTMLElement).dispatchEvent(event);
                        return event.defaultPrevented;
                    }),
                    P.equals<boolean>(true))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled = false while left is held releases it and a later move sends nothing; enabled = true then a move sends a position again",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled gate")
                .interact("mount, move the real mouse to the center and press left", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                    await page.mouse.down();
                })
                .assertPage("position, position, left down",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([
                        { method: "sendMousePosition", args: [0.5, 0.5] },
                        { method: "sendMousePosition", args: [0.5, 0.5] },
                        { method: "sendMouseButton", args: ["left", true] },
                    ]))
                .interact("close the gate, then move the real mouse 20 px right", async ({ page }) => {
                    await page.evaluate(() => { (scratchOf().source as MouseSource).enabled = false; });
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x + 20, center.y);
                })
                .assertPage("enabled is false, left was released, the move sent nothing, and no button is held",
                    (page) => page.evaluate(() => ({
                        enabled: (scratchOf().source as MouseSource).enabled,
                        calls: callsOf().slice(3),
                        mouseButtonsDown: (scratchOf().input as DosInput).snapshot.mouseButtonsDown,
                    })),
                    P.equals<{ enabled: boolean; calls: CallSnapshot[]; mouseButtonsDown: readonly MouseButton[] }>({
                        enabled: false,
                        calls: [{ method: "sendMouseButton", args: ["left", false] }],
                        mouseButtonsDown: [],
                    }))
                .interact("reopen the gate, then move the real mouse back to the center", async ({ page }) => {
                    await page.evaluate(() => { (scratchOf().source as MouseSource).enabled = true; });
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                })
                .assertPage("the move sent sendMousePosition(0.5, 0.5)",
                    (page) => page.evaluate(() => callsOf().slice(4)),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled = 1 throws INVALID_CONFIG and enabled stays true",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled setter rejects")
                .interact("mount", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("the rejection is INVALID_CONFIG and enabled stays true",
                    (page) => page.evaluate((): { rejection: ErrorSnapshot; enabled: boolean } => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const source = scratchOf().source as MouseSource;
                        let rejection: ErrorSnapshot = { isRuntimeError: false, code: null, label: null };
                        try { source.enabled = 1 as unknown as boolean; } catch (e) {
                            rejection = DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                        return { rejection, enabled: source.enabled };
                    }),
                    P.equals<{ rejection: ErrorSnapshot; enabled: boolean }>({ rejection: { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" }, enabled: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "lock and unlock without pointerLock throw UNSUPPORTED; isLocked is false",
            run: () => withHarness((url) => CTGBrowserTest.init("lock unsupported")
                .interact("mount without pointerLock", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("both throw UNSUPPORTED and the source is not locked",
                    (page) => page.evaluate((): { lock: ErrorSnapshot; unlock: ErrorSnapshot; isLocked: boolean } => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const source = scratchOf().source as MouseSource;
                        const attempt = (fn: () => void): ErrorSnapshot => {
                            try { fn(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                                return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                            }
                        };
                        return { lock: attempt(() => source.lock()), unlock: attempt(() => source.unlock()), isLocked: source.isLocked };
                    }),
                    P.equals<{ lock: ErrorSnapshot; unlock: ErrorSnapshot; isLocked: boolean }>({
                        lock: { isRuntimeError: true, code: 13, label: "UNSUPPORTED" },
                        unlock: { isRuntimeError: true, code: 13, label: "UNSUPPORTED" },
                        isLocked: false,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "sensitivity setter rejects 0, -1, NaN and a string with INVALID_CONFIG and accepts 0.5",
            run: () => withHarness((url) => CTGBrowserTest.init("sensitivity setter")
                .interact("mount with the default sensitivity", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("four rejections leave the default; 0.5 is accepted",
                    (page) => page.evaluate((): { rejections: ErrorSnapshot[]; afterRejections: number; accepted: number } => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const source = scratchOf().source as MouseSource;
                        const attempt = (value: unknown): ErrorSnapshot => {
                            try { source.sensitivity = value as number; return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                                return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                            }
                        };
                        const rejections = [attempt(0), attempt(-1), attempt(NaN), attempt("2")];
                        const afterRejections = source.sensitivity;
                        source.sensitivity = 0.5;
                        return { rejections, afterRejections, accepted: source.sensitivity };
                    }),
                    P.equals<{ rejections: ErrorSnapshot[]; afterRejections: number; accepted: number }>({
                        rejections: [
                            { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                            { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                            { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                            { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        ],
                        afterRejections: 1,
                        accepted: 0.5,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "attach twice is a no-op; detach stops forwarding and releases held buttons; destroy detaches; both idempotent",
            run: () => withHarness((url) => CTGBrowserTest.init("attach detach destroy")
                .interact("mount and attach a second time", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => { (scratchOf().source as MouseSource).attach(); });
                })
                .assertPage("attached once: a move forwards one position and a press forwards the position and the button once",
                    (page) => page.evaluate(() => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: center.x, clientY: center.y, buttons: 0 });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", clientX: center.x, clientY: center.y, button: 0, buttons: 1 });
                        return { isAttached: (scratchOf().source as MouseSource).isAttached, calls: callsOf() };
                    }),
                    P.equals<{ isAttached: boolean; calls: CallSnapshot[] }>({
                        isAttached: true,
                        calls: [
                            { method: "sendMousePosition", args: [0.5, 0.5] },
                            { method: "sendMousePosition", args: [0.5, 0.5] },
                            { method: "sendMouseButton", args: ["left", true] },
                        ],
                    }))
                .assertPage("detach releases the held button and later events are not forwarded; detach again is a no-op",
                    (page) => page.evaluate(() => {
                        const source = scratchOf().source as MouseSource;
                        source.detach();
                        source.detach();
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: center.x, clientY: center.y, buttons: 0 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: center.x + 20, clientY: center.y, buttons: 0 });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, buttons: 2 });
                        return { isAttached: source.isAttached, calls: callsOf().slice(3), mouseButtonsDown: (scratchOf().input as DosInput).snapshot.mouseButtonsDown };
                    }),
                    P.equals<{ isAttached: boolean; calls: CallSnapshot[]; mouseButtonsDown: readonly MouseButton[] }>({
                        isAttached: false,
                        calls: [{ method: "sendMouseButton", args: ["left", false] }],
                        mouseButtonsDown: [],
                    }))
                .assertPage("attach again, then destroy twice detaches",
                    (page) => page.evaluate(() => {
                        const source = scratchOf().source as MouseSource;
                        source.attach();
                        const attachedAgain = source.isAttached;
                        source.destroy();
                        source.destroy();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 });
                        return { attachedAgain, isAttached: source.isAttached, callCount: callsOf().length };
                    }),
                    P.equals<{ attachedAgain: boolean; isAttached: boolean; callCount: number }>({ attachedAgain: true, isAttached: false, callCount: 4 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "constructor throws INVALID_CONFIG for a non-DosInput input, a surface without getBoundingClientRect, sensitivity 0, and null",
            run: () => withHarness((url) => CTGBrowserTest.init("constructor rejects")
                .assertPage("all four rejections are INVALID_CONFIG",
                    (page) => page.evaluate((): ErrorSnapshot[] => {
                        const { DosInput, DosRuntimeError, MouseSource } = window.harness.runtime;
                        const { FakeEmulatorSession } = window.harness.doubles;
                        const snap = (thrown: unknown): ErrorSnapshot => DosRuntimeError.is(thrown) ? { isRuntimeError: true, code: thrown.code, label: thrown.label } : { isRuntimeError: false, code: null, label: null };
                        const attempt = (config: unknown): ErrorSnapshot => { try { new MouseSource(config as MouseSourceConfig); return { isRuntimeError: false, code: null, label: null }; } catch (e) { return snap(e); } };
                        const input = new DosInput({ session: new FakeEmulatorSession() });
                        const surface = document.querySelector("#surface") as HTMLElement;
                        const noRect = { addEventListener: () => undefined, removeEventListener: () => undefined };
                        return [attempt({ input: {}, surface }), attempt({ input, surface: noRect }), attempt({ input, surface, sensitivity: 0 }), attempt(null)];
                    }),
                    P.equals<ErrorSnapshot[]>([
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                    ]))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
