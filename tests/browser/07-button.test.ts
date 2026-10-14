// realizes: docs/headless-browser-dos-runtime-spec.md > §11 Pointer Primitives — common contract, §12 Button

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, realTap, withHarness } from "../support/fixtures.ts";   // Environment check; real touch tap; harness server per case

// Type dependencies:
import type { Page } from "playwright";                                        // Page handed to interact steps
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { Button, ButtonConfig } from "../../src/index.ts";               // Instance and config types used in-page
import type FakeTimer from "../support/FakeTimer.ts";                         // Timer double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {timer:fakeTimer}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    timer: FakeTimer;                                              // Timer injected into the Button, advanced by cases
}

// INTERFACE :: {type:STRING, pointerId:NUMBER?}
// One recorded Button event, as plain JSON.
interface ButtonEventSnapshot {
    type: string;                                                  // "press" | "release" | "hold"
    pointerId: number | null;                                      // Detail pointerId, null when absent
}

// INTERFACE :: {x:NUMBER, y:NUMBER}
// A viewport point in CSS pixels.
interface Point {
    x: number;                                                     // clientX
    y: number;                                                     // clientY
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout
const EVENTS = ["press", "release", "hold"];                       // Every ButtonEvents name, recorded by the harness
const INVALID_CONFIG: ErrorSnapshot = { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" };

/**
 *
 * Functions
 *
 */

// HELPER :: [STRING] -> VOID
// In-page setup: mounts a Button on #surface with a FakeTimer, recording the named events, and defines the page globals below.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (events: string[]): void => {
    const { FakeTimer } = window.harness.doubles;
    const scratch: Scratch = { timer: new FakeTimer() };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The scratchOf/buttonOf/eventsOf helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { buttonOf: () => Button }).buttonOf = () => {
        const mounted = window.harness.mounted;
        if (!(mounted instanceof window.harness.runtime.Button)) throw new Error("no Button is mounted");
        return mounted;
    };
    (globalThis as unknown as { eventsOf: () => ButtonEventSnapshot[] }).eventsOf = () =>
        window.harness.events().map((e) => ({ type: e.type, pointerId: typeof e.pointerId === "number" ? e.pointerId : null }));
    window.harness.mount("Button", "#surface", { timer: scratch.timer }, events);
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> button
// The mounted Button, narrowed by instanceof.
const buttonOf = (): Button => {
    const mounted = window.harness.mounted;
    if (!(mounted instanceof window.harness.runtime.Button)) throw new Error("no Button is mounted");
    return mounted;
};

// HELPER :: VOID -> [buttonEventSnapshot]
// Plain-JSON copy of the recorded Button events.
const eventsOf = (): ButtonEventSnapshot[] =>
    window.harness.events().map((e) => ({ type: e.type, pointerId: typeof e.pointerId === "number" ? e.pointerId : null }));

// HELPER :: VOID -> point
// Center of #surface in viewport pixels, rounded to whole pixels.
const centerOf = (): Point => {
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
};

const testFile: TestFile = {
    label: "Button",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "a real touch tap on #surface emits press then release for the same pointer",
            run: () => withHarness((url) => CTGBrowserTest.init("real tap")
                .interact("mount a Button on #surface and tap its center with a real touch", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await realTap(page, await page.evaluate(centerOf));
                })
                .assertPage("press then release, both carrying the tapping pointer's id; not pressed afterwards",
                    (page) => page.evaluate((): { types: string[]; samePointer: boolean; isPressed: boolean } => {
                        const events = eventsOf();
                        return {
                            types: events.map((e) => e.type),
                            samePointer: events.length === 2 && events[0]?.pointerId !== null && events[0]?.pointerId === events[1]?.pointerId,
                            isPressed: buttonOf().isPressed,
                        };
                    }),
                    P.equals<{ types: string[]; samePointer: boolean; isPressed: boolean }>({ types: ["press", "release"], samePointer: true, isPressed: false }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a second finger neither re-emits press nor releases while the first is down; the last pointer gone releases; isPressed mirrors this",
            run: () => withHarness((url) => CTGBrowserTest.init("two-finger overlap")
                .interact("mount a Button on #surface", async ({ page }) => { await page.evaluate(setup, EVENTS); })
                .assertPage("pointer 1 down: press, isPressed true",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        return { events: eventsOf(), isPressed: buttonOf().isPressed };
                    }),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean }>({ events: [{ type: "press", pointerId: 1 }], isPressed: true }))
                .assertPage("pointer 2 down, then pointer 1 up: nothing new, still pressed",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, pointerType: "touch" });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch" });
                        return { events: eventsOf(), isPressed: buttonOf().isPressed };
                    }),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean }>({ events: [{ type: "press", pointerId: 1 }], isPressed: true }))
                .assertPage("pointer 2 up: release, isPressed false",
                    (page) => page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerup", { pointerId: 2, pointerType: "touch" });
                        return { events: eventsOf(), isPressed: buttonOf().isPressed };
                    }),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean }>({ events: [{ type: "press", pointerId: 1 }, { type: "release", pointerId: 2 }], isPressed: false }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "pointercancel releases",
            run: () => withHarness((url) => CTGBrowserTest.init("pointercancel releases")
                .interact("mount, pointer 1 down, pointer 1 cancel", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        window.harness.pointer("#surface", "pointercancel", { pointerId: 1, pointerType: "touch" });
                    });
                })
                .assertPage("press then release; not pressed",
                    (page) => page.evaluate(() => ({ events: eventsOf(), isPressed: buttonOf().isPressed })),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean }>({ events: [{ type: "press", pointerId: 1 }, { type: "release", pointerId: 1 }], isPressed: false }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "lostpointercapture releases",
            run: () => withHarness((url) => CTGBrowserTest.init("lostpointercapture releases")
                .interact("mount, pointer 1 down, pointer 1 lostpointercapture", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        window.harness.pointer("#surface", "lostpointercapture", { pointerId: 1, pointerType: "touch" });
                    });
                })
                .assertPage("press then release; not pressed",
                    (page) => page.evaluate(() => ({ events: eventsOf(), isPressed: buttonOf().isPressed })),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean }>({ events: [{ type: "press", pointerId: 1 }, { type: "release", pointerId: 1 }], isPressed: false }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "hold fires once, holdDelayMs (400) after press, while still pressed",
            run: () => withHarness((url) => CTGBrowserTest.init("hold fires")
                .interact("mount and press with pointer 1", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await page.evaluate(() => { window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" }); });
                })
                .assertPage("advance 399 ms: no hold yet",
                    (page) => page.evaluate(() => { scratchOf().timer.advance(399); return eventsOf(); }),
                    P.equals<ButtonEventSnapshot[]>([{ type: "press", pointerId: 1 }]))
                .assertPage("advance 1 ms more, then 400 ms more: exactly one hold",
                    (page) => page.evaluate(() => { scratchOf().timer.advance(1); scratchOf().timer.advance(400); return eventsOf(); }),
                    P.equals<ButtonEventSnapshot[]>([{ type: "press", pointerId: 1 }, { type: "hold", pointerId: 1 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "hold does not fire when released before holdDelayMs",
            run: () => withHarness((url) => CTGBrowserTest.init("no hold after early release")
                .interact("mount, press, advance 200 ms, release, advance 400 ms", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        scratchOf().timer.advance(200);
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch" });
                        scratchOf().timer.advance(400);
                    });
                })
                .assertPage("press then release, no hold",
                    (page) => page.evaluate(eventsOf),
                    P.equals<ButtonEventSnapshot[]>([{ type: "press", pointerId: 1 }, { type: "release", pointerId: 1 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "detach while pressed emits release",
            run: () => withHarness((url) => CTGBrowserTest.init("detach releases")
                .interact("mount, press with pointer 1, detach", async ({ page }) => {
                    await page.evaluate(setup, EVENTS);
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        buttonOf().detach();
                    });
                })
                .assertPage("press then release; detached and not pressed",
                    (page) => page.evaluate(() => ({ events: eventsOf(), isPressed: buttonOf().isPressed, isAttached: buttonOf().isAttached })),
                    P.equals<{ events: ButtonEventSnapshot[]; isPressed: boolean; isAttached: boolean }>({
                        events: [{ type: "press", pointerId: 1 }, { type: "release", pointerId: 1 }],
                        isPressed: false,
                        isAttached: false,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "the handled pointerdown has defaultPrevented true",
            run: () => withHarness((url) => CTGBrowserTest.init("pointerdown prevented")
                .interact("mount a Button on #surface", async ({ page }) => { await page.evaluate(setup, EVENTS); })
                .assertPage("a cancelable pointerdown dispatched on #surface comes back defaultPrevented and presses",
                    (page) => page.evaluate(() => {
                        const surface = document.querySelector("#surface") as HTMLElement;
                        const rect = surface.getBoundingClientRect();
                        const event = new PointerEvent("pointerdown", {
                            bubbles: true, cancelable: true, composed: true, isPrimary: true,
                            pointerId: 1, pointerType: "touch", button: 0, buttons: 1,
                            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
                        });
                        surface.dispatchEvent(event);
                        return { defaultPrevented: event.defaultPrevented, events: eventsOf() };
                    }),
                    P.equals<{ defaultPrevented: boolean; events: ButtonEventSnapshot[] }>({ defaultPrevented: true, events: [{ type: "press", pointerId: 1 }] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "constructor throws INVALID_CONFIG for a surface without addEventListener and for holdDelayMs -1",
            run: () => withHarness((url) => CTGBrowserTest.init("constructor rejects")
                .assertPage("both rejections are INVALID_CONFIG",
                    (page) => page.evaluate((): ErrorSnapshot[] => {
                        const { Button, DosRuntimeError } = window.harness.runtime;
                        const snap = (thrown: unknown): ErrorSnapshot => DosRuntimeError.is(thrown) ? { isRuntimeError: true, code: thrown.code, label: thrown.label } : { isRuntimeError: false, code: null, label: null };
                        const attempt = (config: unknown): ErrorSnapshot => { try { new Button(config as ButtonConfig); return { isRuntimeError: false, code: null, label: null }; } catch (e) { return snap(e); } };
                        const surface = document.querySelector("#surface") as HTMLElement;
                        const noListener = { removeEventListener: () => undefined, getBoundingClientRect: () => surface.getBoundingClientRect() };
                        return [attempt({ surface: noListener }), attempt({ surface, holdDelayMs: -1 })];
                    }),
                    P.equals<ErrorSnapshot[]>([INVALID_CONFIG, INVALID_CONFIG]))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
