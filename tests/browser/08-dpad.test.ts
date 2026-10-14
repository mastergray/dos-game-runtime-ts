// realizes: docs/headless-browser-dos-runtime-spec.md > §11 Pointer Primitives — common contract, §13 DPad

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { DPad, DPadDirection } from "../../src/index.ts";                // Instance and direction types used in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {type:STRING, direction:STRING?}
// One recorded press or release, as plain JSON.
interface EdgeSnapshot {
    type: string;                                                  // "press" | "release"
    direction: string | null;                                      // Detail direction, null when absent
}

// INTERFACE :: {edges:[edgeSnapshot], changes:[[STRING]]}
// Recorded DPad events split by kind, because the spec orders releases before presses but not change relative to them.
interface DPadSnapshot {
    edges: EdgeSnapshot[];                                         // press/release events in emission order
    changes: string[][];                                           // Each change event's directions, in emission order
}

// INTERFACE :: {x:NUMBER, y:NUMBER}
// A viewport point in CSS pixels.
interface Point {
    x: number;                                                     // clientX
    y: number;                                                     // clientY
}

// INTERFACE :: {diagonals:BOOLEAN?}
// Options for the in-page setup.
interface SetupOptions {
    diagonals?: boolean;                                           // Passed through to the config when given
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
// In-page setup: mounts a DPad on #surface recording every event, and defines the page globals below.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    // The dpadOf/snapshotOf/edgeOf helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { dpadOf: () => DPad }).dpadOf = () => {
        const mounted = window.harness.mounted;
        if (!(mounted instanceof window.harness.runtime.DPad)) throw new Error("no DPad is mounted");
        return mounted;
    };
    (globalThis as unknown as { snapshotOf: () => DPadSnapshot }).snapshotOf = () => {
        const events = window.harness.events();
        return {
            edges: events.filter((e) => e.type === "press" || e.type === "release").map((e) => ({ type: e.type, direction: typeof e.direction === "string" ? e.direction : null })),
            changes: events.filter((e) => e.type === "change").map((e) => Array.isArray(e.directions) ? e.directions.map(String) : []),
        };
    };
    (globalThis as unknown as { edgeOf: (edge: "top" | "right" | "bottom") => Point }).edgeOf = (edge) => {
        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
        if (edge === "top") return { x: rect.left + rect.width / 2, y: rect.top };
        if (edge === "right") return { x: rect.left + rect.width, y: rect.top + rect.height / 2 };
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height };
    };
    const config: { diagonals?: boolean } = {};
    if (options.diagonals !== undefined) config.diagonals = options.diagonals;
    window.harness.mount("DPad", "#surface", config, ["change", "press", "release"]);
};

// HELPER :: VOID -> dPad
// The mounted DPad, narrowed by instanceof.
const dpadOf = (): DPad => {
    const mounted = window.harness.mounted;
    if (!(mounted instanceof window.harness.runtime.DPad)) throw new Error("no DPad is mounted");
    return mounted;
};

// HELPER :: VOID -> dPadSnapshot
// Plain-JSON copy of the recorded events, split into press/release edges and change sets.
const snapshotOf = (): DPadSnapshot => {
    const events = window.harness.events();
    return {
        edges: events.filter((e) => e.type === "press" || e.type === "release").map((e) => ({ type: e.type, direction: typeof e.direction === "string" ? e.direction : null })),
        changes: events.filter((e) => e.type === "change").map((e) => Array.isArray(e.directions) ? e.directions.map(String) : []),
    };
};

// HELPER :: "top"|"right"|"bottom" -> point
// Midpoint of one edge of #surface in viewport pixels.
const edgeOf = (edge: "top" | "right" | "bottom"): Point => {
    const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
    if (edge === "top") return { x: rect.left + rect.width / 2, y: rect.top };
    if (edge === "right") return { x: rect.left + rect.width, y: rect.top + rect.height / 2 };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height };
};

const testFile: TestFile = {
    label: "DPad",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "a synthetic drag from the top of #surface to its right edge emits press up, then release up before press right, with change sets [up] then [right]",
            run: () => withHarness((url) => CTGBrowserTest.init("drag top to right")
                .interact("mount a DPad, pointerdown at the top edge center, pointermove to the right edge center", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const top = edgeOf("top");
                        const right = edgeOf("right");
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: top.x, clientY: top.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 1, pointerType: "touch", clientX: right.x, clientY: right.y });
                    });
                })
                .assertPage("press up, release up, press right; changes [up], [right]; directions is [right]",
                    (page) => page.evaluate(() => ({ ...snapshotOf(), directions: [...dpadOf().directions] })),
                    P.equals<DPadSnapshot & { directions: DPadDirection[] }>({
                        edges: [{ type: "press", direction: "up" }, { type: "release", direction: "up" }, { type: "press", direction: "right" }],
                        changes: [["up"], ["right"]],
                        directions: ["right"],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a second pointer id is ignored while the first is down",
            run: () => withHarness((url) => CTGBrowserTest.init("second pointer ignored")
                .interact("mount; pointer 1 down at the top; pointer 2 down at the right edge, moves to the bottom edge, lifts", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const top = edgeOf("top");
                        const right = edgeOf("right");
                        const bottom = edgeOf("bottom");
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", clientX: top.x, clientY: top.y });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, pointerType: "touch", clientX: right.x, clientY: right.y });
                        window.harness.pointer("#surface", "pointermove", { pointerId: 2, pointerType: "touch", clientX: bottom.x, clientY: bottom.y });
                        window.harness.pointer("#surface", "pointerup", { pointerId: 2, pointerType: "touch", clientX: bottom.x, clientY: bottom.y });
                    });
                })
                .assertPage("only press up and change [up]; directions still [up]",
                    (page) => page.evaluate(() => ({ ...snapshotOf(), directions: [...dpadOf().directions] })),
                    P.equals<DPadSnapshot & { directions: DPadDirection[] }>({
                        edges: [{ type: "press", direction: "up" }],
                        changes: [["up"]],
                        directions: ["up"],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "pointercancel empties the set with a release per held direction",
            run: () => withHarness((url) => CTGBrowserTest.init("pointercancel empties")
                .interact("mount with diagonals, pointerdown at the top-right corner, pointercancel", async ({ page }) => {
                    await page.evaluate(setup, { diagonals: true } as SetupOptions);
                    await page.evaluate(() => {
                        const rect = (document.querySelector("#surface") as HTMLElement).getBoundingClientRect();
                        const corner = { clientX: rect.left + rect.width, clientY: rect.top };
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch", ...corner });
                        window.harness.pointer("#surface", "pointercancel", { pointerId: 1, pointerType: "touch", ...corner });
                    });
                })
                .assertPage("presses {up, right}, then releases {up, right}; changes [up, right] then []; directions empty",
                    (page) => page.evaluate(() => {
                        const snapshot = snapshotOf();
                        const directionsOf = (type: string): string[] => snapshot.edges.filter((e) => e.type === type).map((e) => String(e.direction)).sort();
                        return {
                            edgeTypes: snapshot.edges.map((e) => e.type),
                            pressed: directionsOf("press"),
                            released: directionsOf("release"),
                            changes: snapshot.changes,
                            directions: [...dpadOf().directions],
                        };
                    }),
                    P.equals<{ edgeTypes: string[]; pressed: string[]; released: string[]; changes: string[][]; directions: DPadDirection[] }>({
                        edgeTypes: ["press", "press", "release", "release"],
                        pressed: ["right", "up"],
                        released: ["right", "up"],
                        changes: [["up", "right"], []],
                        directions: [],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "real mouse: down at the top edge presses up, up releases it",
            run: () => withHarness((url) => CTGBrowserTest.init("real mouse up direction")
                .interact("mount, move the real mouse 1 px inside the top edge center, press", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    const top = await page.evaluate(edgeOf, "top" as const);
                    await page.mouse.move(Math.round(top.x), Math.ceil(top.y) + 1);
                    await page.mouse.down();
                })
                .assertPage("press up and change [up]",
                    (page) => page.evaluate(snapshotOf),
                    P.equals<DPadSnapshot>({ edges: [{ type: "press", direction: "up" }], changes: [["up"]] }))
                .interact("release the real mouse button", async ({ page }) => { await page.mouse.up(); })
                .assertPage("then release up and change []; directions empty",
                    (page) => page.evaluate(() => ({ ...snapshotOf(), directions: [...dpadOf().directions] })),
                    P.equals<DPadSnapshot & { directions: DPadDirection[] }>({
                        edges: [{ type: "press", direction: "up" }, { type: "release", direction: "up" }],
                        changes: [["up"], []],
                        directions: [],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
