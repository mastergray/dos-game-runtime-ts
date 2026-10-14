// realizes: docs/headless-browser-dos-runtime-spec.md > §18b DosDeployment (§18b.1, §18b.2, §18b.3 browser); §3.2 UNSUPPORTED, FULLSCREEN_FAILED

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { randomUUID } from "node:crypto";                                      // Fresh storage key per persistence case
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type {
    ButtonControl,                                                 // Button control; the invalid one is cast to it
    ControlsConfig,                                                // Controls built in-page
    DPadControl,                                                   // D-pad control; the invalid one is cast to it
    DosDeployment,                                                 // Class under test, kept in-page
    DosStorage,                                                    // Storage the persistence cases configure, kept in-page
    InputTarget,                                                   // Target type; the invalid one is cast to it
    JoystickAxis,                                                  // Axis literal in the snapshot
    JoystickButton,                                                // Joystick button literal in the snapshot
    KeyCode,                                                       // Key code in the snapshot
    MouseButton,                                                   // Mouse button literal in the snapshot
} from "../../src/index.ts";
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page
import type FakeEmulatorAdapter from "../support/FakeEmulatorAdapter.ts";     // Adapter double kept in-page for startCalls

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {deployment:dosDeployment, session:fakeEmulatorSession}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    deployment: DosDeployment;                                     // The deployment under test
    session: FakeEmulatorSession;                                  // The session the adapter double resolves with
}

// INTERFACE :: {deployment:dosDeployment, adapter:fakeEmulatorAdapter, storage:dosStorage}
// Scratch state of the persistence cases, kept on globalThis between page.evaluate steps.
interface PersistScratch {
    deployment: DosDeployment;                                     // The deployment under test, built by DosDeployment.init
    adapter: FakeEmulatorAdapter;                                  // The adapter double, for startCalls
    storage: DosStorage;                                           // The real storage given in the config
}

// INTERFACE :: {key:STRING, persist:[NUMBER]??, stored:[NUMBER]?, changes:[NUMBER]?}
// What the persistence setup scripts, stores beforehand, and puts in game.changes.
interface PersistOptions {
    key: string;                                                   // Fresh storage key
    persist?: number[] | null;                                     // persist() resolves these bytes, or null; unscripted when absent
    stored?: number[];                                             // Saved into the storage before DosDeployment.init
    changes?: number[];                                            // game.changes given explicitly
}

// INTERFACE :: {keyboard:BOOLEAN?, mouse:BOOLEAN?, mouseEnabled:BOOLEAN?, button:BOOLEAN?, dpad:BOOLEAN?}
// Which controls the in-page setup puts in the config.
interface SetupOptions {
    keyboard?: boolean;                                            // controls.keyboard = {}
    mouse?: boolean;                                               // controls.mouse = {}
    button?: boolean;                                              // One button on #surface targeting Space
    dpad?: boolean;                                                // One d-pad on #pad inside #extra, up -> ArrowUp, right -> ArrowRight
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

// INTERFACE :: {keysDown:[keyCode], mouseButtonsDown:[mouseButton], joystickButtonsDown:[joystickButton], joystickAxes:{x:NUMBER, y:NUMBER}}
// DosInput snapshot as plain JSON.
interface InputSnapshot {
    keysDown: KeyCode[];                                           // Held keys, sorted
    mouseButtonsDown: MouseButton[];                               // Held mouse buttons
    joystickButtonsDown: JoystickButton[];                         // Held joystick buttons
    joystickAxes: Record<JoystickAxis, number>;                    // Axis values
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout
const EMPTY_INPUT: InputSnapshot = { keysDown: [], mouseButtonsDown: [], joystickButtonsDown: [], joystickAxes: { x: 0, y: 0 } };   // Nothing held
const INVALID_CONFIG: ErrorSnapshot = { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" };       // Expected rejection of a bad config
const ALREADY_STARTED: ErrorSnapshot = { isRuntimeError: true, code: 7, label: "ALREADY_STARTED" };     // Expected rejection of a second start
const UNSUPPORTED: ErrorSnapshot = { isRuntimeError: true, code: 13, label: "UNSUPPORTED" };             // Expected rejection of save() without storage
const FULLSCREEN_FAILED: ErrorSnapshot = { isRuntimeError: true, code: 10, label: "FULLSCREEN_FAILED" }; // Expected rejection of fullscreen without a gesture

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: a FakeEmulatorAdapter resolving a FakeEmulatorSession and a DosDeployment on the harness canvas and container
// with a Uint8Array bundle (no fetch) and the requested controls. Constructed, not started.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { DosDeployment } = window.harness.runtime;
    const { FakeEmulatorAdapter, FakeEmulatorSession } = window.harness.doubles;
    const session = new FakeEmulatorSession();
    const adapter = new FakeEmulatorAdapter().script("resolve", session);
    const controls: { -readonly [K in keyof ControlsConfig]: ControlsConfig[K] } = {};
    if (options.keyboard === true) controls.keyboard = {};
    if (options.mouse === true) controls.mouse = {};
    if (options.button === true) {
        controls.buttons = [{ surface: document.querySelector("#surface") as HTMLElement, target: { kind: "key", code: "Space" } }];
    }
    if (options.dpad === true) {
        const element = document.createElement("div");
        element.id = "pad";
        element.style.width = "200px";
        element.style.height = "200px";
        element.style.touchAction = "none";
        (document.querySelector("#extra") as HTMLElement).appendChild(element);
        controls.dpads = [{ surface: element, map: { up: { kind: "key", code: "ArrowUp" }, right: { kind: "key", code: "ArrowRight" } } }];
    }
    const deployment = new DosDeployment({
        canvas: document.querySelector("#canvas") as HTMLCanvasElement,
        container: document.querySelector("#container") as HTMLElement,
        game: { bundle: new Uint8Array([1]) },
        adapter,
        controls,
    });
    const scratch: Scratch = { deployment, session };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { callsOf: () => CallSnapshot[] }).callsOf = () =>
        scratch.session.calls.map((c) => ({ method: c.method, args: [...c.args] }));
    (globalThis as unknown as { inputOf: () => InputSnapshot }).inputOf = () => {
        const s = scratch.deployment.player.input.snapshot;
        return { keysDown: [...s.keysDown], mouseButtonsDown: [...s.mouseButtonsDown], joystickButtonsDown: [...s.joystickButtonsDown], joystickAxes: { x: s.joystickAxes.x, y: s.joystickAxes.y } };
    };
    (globalThis as unknown as { pointAt: (selector: string, dx: number, dy: number) => Point }).pointAt = (selector, dx, dy) => {
        const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
        return { x: rect.left + rect.width / 2 + dx, y: rect.top + rect.height / 2 + dy };
    };
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> [callSnapshot]
// Plain-JSON copy of the session's recorded calls.
const callsOf = (): CallSnapshot[] => scratchOf().session.calls.map((c) => ({ method: c.method, args: [...c.args] }));

// HELPER :: VOID -> inputSnapshot
// Plain-JSON copy of the player's DosInput snapshot.
const inputOf = (): InputSnapshot => {
    const s = scratchOf().deployment.player.input.snapshot;
    return { keysDown: [...s.keysDown], mouseButtonsDown: [...s.mouseButtonsDown], joystickButtonsDown: [...s.joystickButtonsDown], joystickAxes: { x: s.joystickAxes.x, y: s.joystickAxes.y } };
};

// HELPER :: STRING, NUMBER, NUMBER -> point
// The element's center offset by (dx, dy) CSS pixels, in viewport coordinates.
const pointAt = (selector: string, dx: number, dy: number): Point => {
    const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    return { x: rect.left + rect.width / 2 + dx, y: rect.top + rect.height / 2 + dy };
};

// HELPER :: VOID -> PROMISE(VOID)
// In-page: starts the deployment set up by setup().
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const startDeployment = async (): Promise<void> => {
    await (globalThis as unknown as { __scratch: Scratch }).__scratch.deployment.start();
};

// HELPER :: "button"|"dpad" -> errorSnapshot
// In-page: constructs a deployment whose one control is invalid and snapshots what the constructor threw.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const constructInvalid = (which: "button" | "dpad"): ErrorSnapshot => {
    const { DosDeployment, DosRuntimeError } = window.harness.runtime;
    const { FakeEmulatorAdapter, FakeEmulatorSession } = window.harness.doubles;
    const adapter = new FakeEmulatorAdapter().script("resolve", new FakeEmulatorSession());
    const surface = document.querySelector("#surface") as HTMLElement;
    const controls: ControlsConfig = which === "button"
        ? { buttons: [{ surface, target: { kind: "nope" } as unknown as InputTarget } as ButtonControl] }
        : { dpads: [{ surface: {}, map: { up: { kind: "key", code: "ArrowUp" } } } as unknown as DPadControl] };
    try {
        new DosDeployment({
            canvas: document.querySelector("#canvas") as HTMLCanvasElement,
            container: document.querySelector("#container") as HTMLElement,
            game: { bundle: new Uint8Array([1]) },
            adapter,
            controls,
        });
        return { isRuntimeError: false, code: null, label: null };
    } catch (e) {
        return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
    }
};

// HELPER :: persistOptions -> PROMISE(VOID)
// In-page: a real DosStorage on the key (holding stored when given), a FakeEmulatorSession whose persist is scripted,
// and a DosDeployment built by DosDeployment.init with that storage, then started.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setupPersistence = async (options: PersistOptions): Promise<void> => {
    const { DosDeployment, DosStorage } = window.harness.runtime;
    const { FakeEmulatorAdapter, FakeEmulatorSession } = window.harness.doubles;
    const session = new FakeEmulatorSession();
    if (options.persist !== undefined) session.script("persist", "resolve", options.persist === null ? null : new Uint8Array(options.persist));
    const adapter = new FakeEmulatorAdapter().script("resolve", session);
    const storage = DosStorage.init({ key: options.key });
    if (options.stored !== undefined) await storage.save(new Uint8Array(options.stored));
    const game = options.changes === undefined
        ? { bundle: new Uint8Array([1]) }
        : { bundle: new Uint8Array([1]), changes: new Uint8Array(options.changes) };
    const deployment = await DosDeployment.init({
        canvas: document.querySelector("#canvas") as HTMLCanvasElement,
        container: document.querySelector("#container") as HTMLElement,
        game,
        adapter,
        storage,
    });
    await deployment.start();
    const scratch: PersistScratch = { deployment, adapter, storage };
    (globalThis as unknown as { __persist: PersistScratch }).__persist = scratch;
};

// HELPER :: VOID -> PROMISE([NUMBER]?)
// In-page: startCalls[0].changes of the persistence setup's adapter, as plain JSON.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const startChanges = async (): Promise<number[] | null> => {
    const first = (globalThis as unknown as { __persist: PersistScratch }).__persist.adapter.startCalls[0];
    return first === undefined || first.changes === undefined ? null : Array.from(first.changes);
};

const testFile: TestFile = {
    label: "DosDeployment",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "start() resolves, isStarted is true, and keyboard and mouse are sources when their controls are present",
            run: () => withHarness((url) => CTGBrowserTest.init("start with keyboard and mouse")
                .interact("construct with keyboard and mouse controls and start", async ({ page }) => {
                    await page.evaluate(setup, { keyboard: true, mouse: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("isStarted true, keyboard a KeyboardSource, mouse a MouseSource",
                    (page) => page.evaluate(() => {
                        const { KeyboardSource, MouseSource } = window.harness.runtime;
                        const d = scratchOf().deployment;
                        return { isStarted: d.isStarted, keyboard: d.keyboard instanceof KeyboardSource, mouse: d.mouse instanceof MouseSource };
                    }),
                    P.equals<{ isStarted: boolean; keyboard: boolean; mouse: boolean }>({ isStarted: true, keyboard: true, mouse: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "keyboard and mouse are null when their controls are absent",
            run: () => withHarness((url) => CTGBrowserTest.init("start without keyboard and mouse")
                .interact("construct with no keyboard or mouse control and start", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("isStarted true, keyboard null, mouse null",
                    (page) => page.evaluate(() => {
                        const d = scratchOf().deployment;
                        return { isStarted: d.isStarted, keyboardNull: d.keyboard === null, mouseNull: d.mouse === null };
                    }),
                    P.equals<{ isStarted: boolean; keyboardNull: boolean; mouseNull: boolean }>({ isStarted: true, keyboardNull: true, mouseNull: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a keydown dispatched on the document (the default keyboardTarget) reaches the session",
            run: () => withHarness((url) => CTGBrowserTest.init("keydown reaches the session")
                .interact("construct with a keyboard control and start", async ({ page }) => {
                    await page.evaluate(setup, { keyboard: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("keydown ArrowUp on document sends sendKey(ArrowUp, true) and holds it",
                    (page) => page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp", bubbles: true }));
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowUp", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowUp"] },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a real page.mouse.move over the canvas reaches the session as a position",
            run: () => withHarness((url) => CTGBrowserTest.init("real mouse move")
                .interact("construct with a mouse control, start, move the real mouse to the canvas center", async ({ page }) => {
                    await page.evaluate(setup, { mouse: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                    const center = await page.evaluate(() => pointAt("#canvas", 0, 0));
                    await page.mouse.move(center.x, center.y);
                })
                .assertPage("the session saw sendMousePosition(0.5, 0.5)",
                    (page) => page.evaluate(() => callsOf()),
                    P.equals<CallSnapshot[]>([{ method: "sendMousePosition", args: [0.5, 0.5] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a synthetic pointerdown on a button surface presses its target and pointerup releases it",
            run: () => withHarness((url) => CTGBrowserTest.init("button control")
                .interact("construct with a button on #surface targeting Space and start", async ({ page }) => {
                    await page.evaluate(setup, { button: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("pointerdown presses Space",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1 });
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["Space", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["Space"] },
                    }))
                .assertPage("pointerup releases Space",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1 });
                        return { calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["Space", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a D-pad drag presses and releases its mapped directions",
            run: () => withHarness((url) => CTGBrowserTest.init("dpad control")
                .interact("construct with a d-pad on #pad mapping up -> ArrowUp, right -> ArrowRight and start", async ({ page }) => {
                    await page.evaluate(setup, { dpad: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("pointerdown at the top-edge center presses ArrowUp",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#pad", 0, -100);
                        window.harness.pointer("#pad", "pointerdown", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf(), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowUp", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowUp"] },
                    }))
                .assertPage("moving to the right-edge center releases ArrowUp and presses ArrowRight",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#pad", 100, 0);
                        window.harness.pointer("#pad", "pointermove", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(1), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowUp", false] }, { method: "sendKey", args: ["ArrowRight", true] }],
                        input: { ...EMPTY_INPUT, keysDown: ["ArrowRight"] },
                    }))
                .assertPage("pointerup releases ArrowRight",
                    (page) => page.evaluate(() => {
                        const p = pointAt("#pad", 100, 0);
                        window.harness.pointer("#pad", "pointerup", { pointerId: 1, clientX: p.x, clientY: p.y });
                        return { calls: callsOf().slice(3), input: inputOf() };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot }>({
                        calls: [{ method: "sendKey", args: ["ArrowRight", false] }],
                        input: EMPTY_INPUT,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "mouseEnabled = false releases a held left button and a later move sends nothing",
            run: () => withHarness((url) => CTGBrowserTest.init("mouseEnabled false while held")
                .interact("construct with a mouse control, start, press the left button on the canvas", async ({ page }) => {
                    await page.evaluate(setup, { mouse: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                    await page.evaluate(() => { window.harness.pointer("#canvas", "pointerdown", { pointerId: 1, pointerType: "mouse", button: 0 }); });
                })
                .assertPage("the left button is held",
                    (page) => page.evaluate(() => inputOf().mouseButtonsDown),
                    P.equals<MouseButton[]>(["left"]))
                .assertPage("mouseEnabled = false sends the left button up and reads back false",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        const before = s.session.calls.length;
                        s.deployment.mouseEnabled = false;
                        return { calls: callsOf().slice(before), input: inputOf(), mouseEnabled: s.deployment.mouseEnabled };
                    }),
                    P.equals<{ calls: CallSnapshot[]; input: InputSnapshot; mouseEnabled: boolean }>({
                        calls: [{ method: "sendMouseButton", args: ["left", false] }],
                        input: EMPTY_INPUT,
                        mouseEnabled: false,
                    }))
                .assertPage("a later pointermove over the canvas sends nothing",
                    (page) => page.evaluate(() => {
                        const before = scratchOf().session.calls.length;
                        const p = pointAt("#canvas", 10, 10);
                        window.harness.pointer("#canvas", "pointermove", { pointerId: 1, pointerType: "mouse", clientX: p.x, clientY: p.y });
                        return callsOf().slice(before);
                    }),
                    P.equals<CallSnapshot[]>([]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "mouseEnabled = false set before start yields a mouse source with enabled false after start",
            run: () => withHarness((url) => CTGBrowserTest.init("mouseEnabled false before start")
                .interact("construct with a mouse control, set mouseEnabled = false, start", async ({ page }) => {
                    await page.evaluate(setup, { mouse: true } as SetupOptions);
                    await page.evaluate(() => { scratchOf().deployment.mouseEnabled = false; });
                    await page.evaluate(startDeployment);
                })
                .assertPage("mouse source present with enabled false; mouseEnabled reads false",
                    (page) => page.evaluate(() => {
                        const d = scratchOf().deployment;
                        const mouse = d.mouse;
                        return { hasMouse: mouse !== null, sourceEnabled: mouse === null ? null : mouse.enabled, mouseEnabled: d.mouseEnabled };
                    }),
                    P.equals<{ hasMouse: boolean; sourceEnabled: boolean | null; mouseEnabled: boolean }>({ hasMouse: true, sourceEnabled: false, mouseEnabled: false }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "the session's exit makes isStarted false and a following keydown sends nothing",
            run: () => withHarness((url) => CTGBrowserTest.init("session exit")
                .interact("construct with a keyboard control, start, emit exit", async ({ page }) => {
                    await page.evaluate(setup, { keyboard: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                    await page.evaluate(() => { scratchOf().session.emitExit(); });
                })
                .assertPage("isStarted false and a keydown on document reaches no session call",
                    (page) => page.evaluate(() => {
                        const s = scratchOf();
                        const before = s.session.calls.length;
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp", bubbles: true }));
                        return { isStarted: s.deployment.isStarted, calls: callsOf().slice(before) };
                    }),
                    P.equals<{ isStarted: boolean; calls: CallSnapshot[] }>({ isStarted: false, calls: [] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "destroy() calls session.exit once and a second destroy() does nothing",
            run: () => withHarness((url) => CTGBrowserTest.init("destroy")
                .interact("construct with keyboard and mouse controls and start", async ({ page }) => {
                    await page.evaluate(setup, { keyboard: true, mouse: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("exit called once after the first destroy and still once after the second",
                    (page) => page.evaluate(async () => {
                        const s = scratchOf();
                        const exits = (): number => s.session.calls.filter((c) => c.method === "exit").length;
                        await s.deployment.destroy();
                        const afterFirst = exits();
                        await s.deployment.destroy();
                        return { afterFirst, afterSecond: exits() };
                    }),
                    P.equals<{ afterFirst: number; afterSecond: number }>({ afterFirst: 1, afterSecond: 1 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "construction rejects a button whose target is { kind: \"nope\" } with INVALID_CONFIG",
            run: () => withHarness((url) => CTGBrowserTest.init("invalid button target")
                .assertPage("constructor throws INVALID_CONFIG",
                    (page) => page.evaluate(constructInvalid, "button" as const),
                    P.equals<ErrorSnapshot>(INVALID_CONFIG))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "construction rejects a d-pad whose surface is {} with INVALID_CONFIG",
            run: () => withHarness((url) => CTGBrowserTest.init("invalid dpad surface")
                .assertPage("constructor throws INVALID_CONFIG",
                    (page) => page.evaluate(constructInvalid, "dpad" as const),
                    P.equals<ErrorSnapshot>(INVALID_CONFIG))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "start() twice throws ALREADY_STARTED",
            run: () => withHarness((url) => CTGBrowserTest.init("start twice")
                .interact("construct and start", async ({ page }) => {
                    await page.evaluate(setup, { keyboard: true } as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("second start rejects with ALREADY_STARTED",
                    (page) => page.evaluate(async (): Promise<ErrorSnapshot> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        try { await scratchOf().deployment.start(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>(ALREADY_STARTED))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with storage, save() stores the overlay persist() resolves and resolves true",
            run: () => withHarness((url) => CTGBrowserTest.init("save stores the overlay")
                .interact("init with a storage on a fresh key, persist scripted to [7, 8, 9], start", async ({ page }) => {
                    await page.evaluate(setupPersistence, { key: `test-${randomUUID()}`, persist: [7, 8, 9] } as PersistOptions);
                })
                .assertPage("save() resolves true and storage.load() returns [7, 8, 9]",
                    (page) => page.evaluate(async () => {
                        const s = (globalThis as unknown as { __persist: PersistScratch }).__persist;
                        const saved = await s.deployment.save();
                        const bytes = await s.storage.load();
                        return { saved, loaded: bytes === null ? null : Array.from(bytes) };
                    }),
                    P.equals<{ saved: boolean; loaded: number[] | null }>({ saved: true, loaded: [7, 8, 9] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with persist() resolving null, save() resolves false and leaves the stored overlay alone",
            run: () => withHarness((url) => CTGBrowserTest.init("save with nothing changed")
                .interact("init with a storage holding [1], persist scripted to null, start", async ({ page }) => {
                    await page.evaluate(setupPersistence, { key: `test-${randomUUID()}`, persist: null, stored: [1] } as PersistOptions);
                })
                .assertPage("save() resolves false and storage.load() still returns [1]",
                    (page) => page.evaluate(async () => {
                        const s = (globalThis as unknown as { __persist: PersistScratch }).__persist;
                        const saved = await s.deployment.save();
                        const bytes = await s.storage.load();
                        return { saved, loaded: bytes === null ? null : Array.from(bytes) };
                    }),
                    P.equals<{ saved: boolean; loaded: number[] | null }>({ saved: false, loaded: [1] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "init with a storage that holds an overlay starts the session with it as changes",
            run: () => withHarness((url) => CTGBrowserTest.init("init restores the stored overlay")
                .interact("init with a storage holding [4, 5] and no game.changes, start", async ({ page }) => {
                    await page.evaluate(setupPersistence, { key: `test-${randomUUID()}`, stored: [4, 5] } as PersistOptions);
                })
                .assertPage("adapter startCalls[0].changes is [4, 5]",
                    (page) => page.evaluate(startChanges),
                    P.equals<number[] | null>([4, 5]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "init with game.changes given explicitly ignores the stored overlay",
            run: () => withHarness((url) => CTGBrowserTest.init("explicit changes win")
                .interact("init with a storage holding [4, 5] and game.changes [9], start", async ({ page }) => {
                    await page.evaluate(setupPersistence, { key: `test-${randomUUID()}`, stored: [4, 5], changes: [9] } as PersistOptions);
                })
                .assertPage("adapter startCalls[0].changes is [9]",
                    (page) => page.evaluate(startChanges),
                    P.equals<number[] | null>([9]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "without storage, save() rejects with UNSUPPORTED and storage reads null",
            run: () => withHarness((url) => CTGBrowserTest.init("save without storage")
                .interact("construct without storage and start", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("save() rejects with UNSUPPORTED; storage is null",
                    (page) => page.evaluate(async (): Promise<{ error: ErrorSnapshot; storageNull: boolean }> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const d = scratchOf().deployment;
                        let error: ErrorSnapshot = { isRuntimeError: false, code: null, label: null };
                        try { await d.save(); } catch (e) {
                            if (DosRuntimeError.is(e)) error = { isRuntimeError: true, code: e.code, label: e.label };
                        }
                        return { error, storageNull: d.storage === null };
                    }),
                    P.equals<{ error: ErrorSnapshot; storageNull: boolean }>({ error: UNSUPPORTED, storageNull: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "fullscreen() without a user gesture rejects with FULLSCREEN_FAILED",
            run: () => withHarness((url) => CTGBrowserTest.init("fullscreen without a gesture")
                .interact("construct and start", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                // NOTE: Playwright runs page.evaluate with a synthetic user gesture, so the call waits out Chromium's transient
                // activation window (5 s) inside the same evaluate; userActivation.isActive records that no gesture is in effect.
                .assertPage("with no transient activation in effect, fullscreen() rejects with FULLSCREEN_FAILED",
                    (page) => page.evaluate(async (): Promise<{ activeBeforeCall: boolean; error: ErrorSnapshot | "resolved" }> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        await new Promise((resolve) => setTimeout(resolve, 5500));
                        const activeBeforeCall = navigator.userActivation.isActive;
                        try { await scratchOf().deployment.fullscreen(); return { activeBeforeCall, error: "resolved" }; } catch (e) {
                            return {
                                activeBeforeCall,
                                error: DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null },
                            };
                        }
                    }),
                    P.equals<{ activeBeforeCall: boolean; error: ErrorSnapshot | "resolved" }>({ activeBeforeCall: false, error: FULLSCREEN_FAILED }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "exitFullscreen() while not in fullscreen rejects with FULLSCREEN_FAILED",
            run: () => withHarness((url) => CTGBrowserTest.init("exitFullscreen while not fullscreen")
                .interact("construct and start", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(startDeployment);
                })
                .assertPage("exitFullscreen() rejects with FULLSCREEN_FAILED",
                    (page) => page.evaluate(async (): Promise<ErrorSnapshot | "resolved"> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        try { await scratchOf().deployment.exitFullscreen(); return "resolved"; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot | "resolved">(FULLSCREEN_FAILED))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
