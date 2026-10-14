// realizes: docs/headless-browser-dos-runtime-spec.md > §11 Pointer Primitives — common contract, §14 AnalogStick

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { AnalogStick, Vector2 } from "../../src/index.ts";               // Instance and vector types used in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {type:STRING, value:{x:NUMBER, y:NUMBER}?}
// One recorded AnalogStick event, as plain JSON: change carries its value rounded to 4 decimals, release carries none.
interface StickEventSnapshot {
    type: string;                                                  // "change" | "release"
    value: { x: number; y: number } | null;                        // Rounded change value; null for release
}

// INTERFACE :: {x:NUMBER, y:NUMBER}
// A viewport point in CSS pixels.
interface Point {
    x: number;                                                     // clientX
    y: number;                                                     // clientY
}

// INTERFACE :: {radius:NUMBER?}
// Options for the in-page setup.
interface SetupOptions {
    radius?: number;                                               // Passed through to the config when given
}

// INTERFACE :: {count:NUMBER, matchesValueFor:BOOLEAN}
// Comparison of the recorded change events against AnalogStick.valueFor computed in-page.
interface ValueForCheck {
    count: number;                                                 // Number of change events recorded
    matchesValueFor: boolean;                                      // Whether each equals valueFor, rounded to 4 decimals
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-step timeout
const DRAG_X = 50;                                                 // Horizontal drag distance from the center, CSS px

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: mounts an AnalogStick on #surface recording every event, and defines the page globals below.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    // The helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    const round = (v: { x: number; y: number }): { x: number; y: number } => ({ x: Math.round(v.x * 10000) / 10000 + 0, y: Math.round(v.y * 10000) / 10000 + 0 });
    (globalThis as unknown as { roundedOf: (v: Vector2) => { x: number; y: number } }).roundedOf = round;
    (globalThis as unknown as { stickOf: () => AnalogStick }).stickOf = () => {
        const mounted = window.harness.mounted;
        if (!(mounted instanceof window.harness.runtime.AnalogStick)) throw new Error("no AnalogStick is mounted");
        return mounted;
    };
    (globalThis as unknown as { eventsOf: () => StickEventSnapshot[] }).eventsOf = () =>
        window.harness.events().map((e) => {
            const value = e.value as { x?: unknown; y?: unknown } | undefined;
            return e.type === "change" && typeof value?.x === "number" && typeof value.y === "number"
                ? { type: e.type, value: round({ x: value.x, y: value.y }) }
                : { type: e.type, value: null };
        });
    (globalThis as unknown as { centerOf: () => Point }).centerOf = () => {
        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    (globalThis as unknown as { expectedFor: (point: Point) => { x: number; y: number } }).expectedFor = (point) => {
        const { AnalogStick } = window.harness.runtime;
        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
        const offset = { x: point.x - (rect.left + rect.width / 2), y: point.y - (rect.top + rect.height / 2) };
        return round(AnalogStick.valueFor(offset, Math.min(rect.width, rect.height) / 2, AnalogStick.DEFAULT_DEAD_ZONE));
    };
    const config: { radius?: number } = {};
    if (options.radius !== undefined) config.radius = options.radius;
    window.harness.mount("AnalogStick", "#surface", config, ["change", "release"]);
};

// HELPER :: vector2 -> {x:NUMBER, y:NUMBER}
// Rounds a vector to 4 decimals, normalizing -0 to 0.
const roundedOf = (v: Vector2): { x: number; y: number } => ({ x: Math.round(v.x * 10000) / 10000 + 0, y: Math.round(v.y * 10000) / 10000 + 0 });

// HELPER :: VOID -> analogStick
// The mounted AnalogStick, narrowed by instanceof.
const stickOf = (): AnalogStick => {
    const mounted = window.harness.mounted;
    if (!(mounted instanceof window.harness.runtime.AnalogStick)) throw new Error("no AnalogStick is mounted");
    return mounted;
};

// HELPER :: VOID -> [stickEventSnapshot]
// Plain-JSON copy of the recorded events with change values rounded.
const eventsOf = (): StickEventSnapshot[] =>
    window.harness.events().map((e) => {
        const value = e.value as { x?: unknown; y?: unknown } | undefined;
        return e.type === "change" && typeof value?.x === "number" && typeof value.y === "number"
            ? { type: e.type, value: roundedOf({ x: value.x, y: value.y }) }
            : { type: e.type, value: null };
    });

// HELPER :: VOID -> point
// Center of #surface in viewport pixels, rounded to whole pixels.
const centerOf = (): Point => {
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
};

// HELPER :: point -> {x:NUMBER, y:NUMBER}
// AnalogStick.valueFor for a viewport point, relative to the surface center over half its shorter side with the default dead zone, rounded.
const expectedFor = (point: Point): { x: number; y: number } => {
    const { AnalogStick } = window.harness.runtime;
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    const offset = { x: point.x - (rect.left + rect.width / 2), y: point.y - (rect.top + rect.height / 2) };
    return roundedOf(AnalogStick.valueFor(offset, Math.min(rect.width, rect.height) / 2, AnalogStick.DEFAULT_DEAD_ZONE));
};

const testFile: TestFile = {
    label: "AnalogStick",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "a synthetic drag from the center to +50 px emits change values matching valueFor for the surface's real rect",
            run: () => withHarness((url) => CTGBrowserTest.init("synthetic drag matches valueFor")
                .interact("mount, pointerdown at the center, pointermove 50 px right", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate((dx: number) => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: center.x, clientY: center.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: center.x + dx, clientY: center.y });
                    }, DRAG_X);
                })
                .assertPage("one change, equal to valueFor at +50 px, and the value getter agrees",
                    (page) => page.evaluate((dx: number): ValueForCheck & { getterMatches: boolean } => {
                        const center = centerOf();
                        const expected = expectedFor({ x: center.x + dx, y: center.y });
                        const changes = eventsOf().filter((e) => e.type === "change");
                        const same = (v: { x: number; y: number } | null): boolean => v !== null && v.x === expected.x && v.y === expected.y;
                        return { count: changes.length, matchesValueFor: changes.every((e) => same(e.value)), getterMatches: same(roundedOf(stickOf().value)) };
                    }, DRAG_X),
                    P.equals<ValueForCheck & { getterMatches: boolean }>({ count: 1, matchesValueFor: true, getterMatches: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "with radius 40 configured the origin floats to the pointerdown point: +40 px right gives x 1",
            run: () => withHarness((url) => CTGBrowserTest.init("floating origin")
                .interact("mount with radius 40, pointerdown 50 px left of and 30 px below the center, move 40 px right", async ({ page }) => {
                    await page.evaluate(setup, { radius: 40 } as SetupOptions);
                    await page.evaluate(() => {
                        const center = centerOf();
                        const origin = { x: center.x - 50, y: center.y + 30 };
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: origin.x, clientY: origin.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: origin.x + 40, clientY: origin.y });
                    });
                })
                .assertPage("one change with value {1, 0}",
                    (page) => page.evaluate(eventsOf),
                    P.equals<StickEventSnapshot[]>([{ type: "change", value: { x: 1, y: 0 } }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "pointer gone: value becomes {0,0}, change with it, then release",
            run: () => withHarness((url) => CTGBrowserTest.init("release sequence")
                .interact("mount, pointerdown at the center, move 50 px right, pointerup", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate((dx: number) => {
                        const center = centerOf();
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: center.x, clientY: center.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: center.x + dx, clientY: center.y });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 1, pointerType: "touch", clientX: center.x + dx, clientY: center.y });
                    }, DRAG_X);
                })
                .assertPage("change, then change {0,0}, then release; value getter {0,0}",
                    (page) => page.evaluate(() => {
                        const events = eventsOf();
                        return { types: events.map((e) => e.type), tail: events.slice(1), value: roundedOf(stickOf().value) };
                    }),
                    P.equals<{ types: string[]; tail: StickEventSnapshot[]; value: { x: number; y: number } }>({
                        types: ["change", "change", "release"],
                        tail: [{ type: "change", value: { x: 0, y: 0 } }, { type: "release", value: null }],
                        value: { x: 0, y: 0 },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "real mouse drag from the center to +50 px emits a change matching valueFor, and lifting emits change {0,0} then release",
            run: () => withHarness((url) => CTGBrowserTest.init("real mouse drag")
                .interact("mount, then with the real mouse: move to the center, press, move 50 px right, release", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const center = await page.evaluate(centerOf);
                    await page.mouse.move(center.x, center.y);
                    await page.mouse.down();
                    await page.mouse.move(center.x + DRAG_X, center.y, { steps: 1 });
                    await page.mouse.up();
                })
                .assertPage("first change matches valueFor at +50 px; the sequence ends change {0,0}, release",
                    (page) => page.evaluate((dx: number) => {
                        const center = centerOf();
                        const expected = expectedFor({ x: center.x + dx, y: center.y });
                        const events = eventsOf();
                        const first = events[0];
                        return {
                            firstMatchesValueFor: first !== undefined && first.type === "change" && first.value !== null && first.value.x === expected.x && first.value.y === expected.y,
                            count: events.length,
                            tail: events.slice(-2),
                        };
                    }, DRAG_X),
                    P.equals<{ firstMatchesValueFor: boolean; count: number; tail: StickEventSnapshot[] }>({
                        firstMatchesValueFor: true,
                        count: 3,
                        tail: [{ type: "change", value: { x: 0, y: 0 } }, { type: "release", value: null }],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
