// realizes: docs/headless-browser-dos-runtime-spec.md > §11 Pointer Primitives — common contract, §15 Trackpad

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, realTap, withHarness } from "../support/fixtures.ts";   // Environment check; real touch tap; harness server per case

// Type dependencies:
import type { Page } from "playwright";                                        // Page handed to interact steps
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type FakeTimer from "../support/FakeTimer.ts";                         // Timer double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {timer:fakeTimer}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    timer: FakeTimer;                                              // Timer injected into the Trackpad, advanced by cases
}

// INTERFACE :: {type:STRING, dx:NUMBER?, dy:NUMBER?, pointers:NUMBER?}
// One recorded Trackpad event, as plain JSON; move carries dx/dy, the others carry only pointers.
interface TrackpadEventSnapshot {
    type: string;                                                  // "move" | "tap" | "holdStart" | "holdEnd"
    dx?: number;                                                   // move only
    dy?: number;                                                   // move only
    pointers: number | null;                                       // Detail pointers, null when absent
}

// INTERFACE :: {x:NUMBER, y:NUMBER}
// A viewport point in CSS pixels.
interface Point {
    x: number;                                                     // clientX
    y: number;                                                     // clientY
}

// INTERFACE :: {sensitivity:NUMBER?}
// Options for the in-page setup.
interface SetupOptions {
    sensitivity?: number;                                          // Passed through to the config when given
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: mounts a Trackpad on #surface with a FakeTimer, recording every event, and defines the page globals below.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { FakeTimer } = window.harness.doubles;
    const scratch: Scratch = { timer: new FakeTimer() };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The scratchOf/eventsOf/centerOf helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { eventsOf: () => TrackpadEventSnapshot[] }).eventsOf = () =>
        window.harness.events().map((e) => {
            const pointers = typeof e.pointers === "number" ? e.pointers : null;
            return e.type === "move"
                ? { type: e.type, dx: typeof e.dx === "number" ? e.dx + 0 : NaN, dy: typeof e.dy === "number" ? e.dy + 0 : NaN, pointers }
                : { type: e.type, pointers };
        });
    (globalThis as unknown as { centerOf: () => Point }).centerOf = () => {
        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    const config: { timer: FakeTimer; sensitivity?: number } = { timer: scratch.timer };
    if (options.sensitivity !== undefined) config.sensitivity = options.sensitivity;
    window.harness.mount("Trackpad", "#surface", config, ["move", "tap", "holdStart", "holdEnd"]);
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> [trackpadEventSnapshot]
// Plain-JSON copy of the recorded Trackpad events.
const eventsOf = (): TrackpadEventSnapshot[] =>
    window.harness.events().map((e) => {
        const pointers = typeof e.pointers === "number" ? e.pointers : null;
        return e.type === "move"
            ? { type: e.type, dx: typeof e.dx === "number" ? e.dx + 0 : NaN, dy: typeof e.dy === "number" ? e.dy + 0 : NaN, pointers }
            : { type: e.type, pointers };
    });

// HELPER :: VOID -> point
// Center of #surface in viewport pixels, rounded to whole pixels.
const centerOf = (): Point => {
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
};

const testFile: TestFile = {
    label: "Trackpad",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "one-finger moves of the primary pointer emit move with deltas from its previous position and pointers 1",
            run: () => withHarness((url) => CTGBrowserTest.init("one-finger move deltas")
                .interact("mount; pointer 1 down at the center, moves +10,+5 then +3,-2", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: c.x + 10, clientY: c.y + 5, timeStamp: 1010 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: c.x + 13, clientY: c.y + 3, timeStamp: 1020 });
                    });
                })
                .assertPage("move {10, 5, 1} then move {3, -2, 1}",
                    (page) => page.evaluate(eventsOf),
                    P.equals<TrackpadEventSnapshot[]>([
                        { type: "move", dx: 10, dy: 5, pointers: 1 },
                        { type: "move", dx: 3, dy: -2, pointers: 1 },
                    ]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "sensitivity 2 doubles the move deltas",
            run: () => withHarness((url) => CTGBrowserTest.init("sensitivity")
                .interact("mount with sensitivity 2; pointer 1 down at the center, moves +10,+5", async ({ page }) => {
                    await page.evaluate(setup, { sensitivity: 2 } as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: c.x + 10, clientY: c.y + 5, timeStamp: 1010 });
                    });
                })
                .assertPage("move {20, 10, 1}",
                    (page) => page.evaluate(eventsOf),
                    P.equals<TrackpadEventSnapshot[]>([{ type: "move", dx: 20, dy: 10, pointers: 1 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a real one-finger touch tap emits tap with pointers 1",
            run: () => withHarness((url) => CTGBrowserTest.init("real one-finger tap")
                .interact("mount and tap the center with a real touch", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await realTap(page, await page.evaluate(centerOf));
                })
                .assertPage("one tap {pointers: 1}",
                    (page) => page.evaluate(eventsOf),
                    P.equals<TrackpadEventSnapshot[]>([{ type: "tap", pointers: 1 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "two pointers down then up within tapMaxMs and without moving emit tap with pointers 2",
            run: () => withHarness((url) => CTGBrowserTest.init("two-finger tap")
                .interact("mount; pointer 1 down at 1000, pointer 2 down at 1010, pointer 1 up at 1080, pointer 2 up at 1100", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        const second = { clientX: c.x + 20, clientY: c.y };
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, pointerType: "touch", ...second, timeStamp: 1010 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1080 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 2, pointerType: "touch", ...second, timeStamp: 1100 });
                    });
                })
                .assertPage("one tap {pointers: 2}",
                    (page) => page.evaluate(eventsOf),
                    P.equals<TrackpadEventSnapshot[]>([{ type: "tap", pointers: 2 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a move beyond tapMaxDistance (10 px) suppresses tap",
            run: () => withHarness((url) => CTGBrowserTest.init("move suppresses tap")
                .interact("mount; pointer 1 down at 1000, moves +15 px at 1050, up there at 1100", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: c.x + 15, clientY: c.y, timeStamp: 1050 });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: c.x + 15, clientY: c.y, timeStamp: 1100 });
                    });
                })
                .assertPage("the move only, no tap",
                    (page) => page.evaluate(eventsOf),
                    P.equals<TrackpadEventSnapshot[]>([{ type: "move", dx: 15, dy: 0, pointers: 1 }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "holdStart fires holdDelayMs (400) after the first pointerdown with no movement, holdEnd when the last pointer lifts, and no tap",
            run: () => withHarness((url) => CTGBrowserTest.init("hold")
                .interact("mount; pointer 1 down at the center", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                    });
                })
                .assertPage("advance 399 ms: nothing yet",
                    (page) => page.evaluate(() => { scratchOf().timer.advance(399); return eventsOf(); }),
                    P.equals<TrackpadEventSnapshot[]>([]))
                .assertPage("advance 1 ms more: holdStart {pointers: 1}",
                    (page) => page.evaluate(() => { scratchOf().timer.advance(1); return eventsOf(); }),
                    P.equals<TrackpadEventSnapshot[]>([{ type: "holdStart", pointers: 1 }]))
                .assertPage("lift: holdEnd follows, no tap",
                    (page) => page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1450 });
                        return eventsOf().map((e) => e.type);
                    }),
                    P.equals<string[]>(["holdStart", "holdEnd"]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "pointercancel mid-hold emits holdEnd and no tap",
            run: () => withHarness((url) => CTGBrowserTest.init("cancel mid-hold")
                .interact("mount; pointer 1 down at the center; advance 400 ms; pointercancel", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const c = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1000 });
                        scratchOf().timer.advance(400);
                        window.harness.pointer("#surface", "pointercancel", { pointerId: 1, pointerType: "touch", clientX: c.x, clientY: c.y, timeStamp: 1450 });
                    });
                })
                .assertPage("holdStart then holdEnd, no tap",
                    (page) => page.evaluate(() => eventsOf().map((e) => e.type)),
                    P.equals<string[]>(["holdStart", "holdEnd"]))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
