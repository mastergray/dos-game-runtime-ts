// realizes: docs/headless-browser-dos-runtime-spec.md > §6 DosDisplay (§6.3 browser cases; §6.2 onLayout and fullscreen changes)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { DisplayLayout, DosDisplay, DosDisplayConfig } from "../../src/index.ts";   // Layout snapshots; instance kept in-page; config type for rejected inputs
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {display:dosDisplay?, session:fakeEmulatorSession?}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    display?: DosDisplay;                                          // The display under test
    session?: FakeEmulatorSession;                                 // The fake session attached to it
}

// INTERFACE :: {layout:displayLayout, styleWidth:STRING, styleHeight:STRING}
// Layout as reported and as applied to the canvas.
interface AppliedLayout {
    layout: DisplayLayout;                                         // display.layout
    styleWidth: string;                                            // canvas.style.width
    styleHeight: string;                                           // canvas.style.height
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Default per-step timeout for display cases

/**
 *
 * Functions
 *
 */

// HELPER :: VOID -> VOID
// In-page: sets #container to 1000x500 (so its first layout is neither 640x480 nor 320x240), constructs a DosDisplay on it
// without a resize observer, attaches a FakeEmulatorSession, and installs the page globals the onLayout cases use.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setupLayoutDisplay = (): void => {
    const { DosDisplay } = window.harness.runtime;
    const container = document.querySelector("#container") as HTMLElement;
    container.style.width = "1000px";
    container.style.height = "500px";
    const session = new window.harness.doubles.FakeEmulatorSession();
    const display = new DosDisplay({ canvas: document.querySelector("#canvas") as HTMLCanvasElement, container });
    display.attach(session);
    const scratch: Scratch = { display, session };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { displayOf: () => DosDisplay }).displayOf = () => display;
    (globalThis as unknown as { rounded: (layout: DisplayLayout) => DisplayLayout }).rounded = (layout) => ({
        width: Math.round(layout.width * 10000) / 10000,
        height: Math.round(layout.height * 10000) / 10000,
        scale: Math.round(layout.scale * 10000) / 10000,
    });
};

// HELPER :: VOID -> dosDisplay
// Reads the display under test back in the page.
const displayOf = (): DosDisplay => (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;

// HELPER :: displayLayout -> displayLayout
// Plain-JSON copy of a layout with each field rounded to 4 decimals.
const rounded = (layout: DisplayLayout): DisplayLayout => ({
    width: Math.round(layout.width * 10000) / 10000,
    height: Math.round(layout.height * 10000) / 10000,
    scale: Math.round(layout.scale * 10000) / 10000,
});

const testFile: TestFile = {
    label: "DosDisplay",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "constructor throws INVALID_CONFIG when canvas or container is missing, aspectRatio is 0 or -4/3, or scaling is unknown",
            run: () => withHarness((url) => CTGBrowserTest.init("display construction rejection")
                .assertPage("each rejected config throws INVALID_CONFIG",
                    (page) => page.evaluate(() => {
                        const { DosDisplay, DosRuntimeError } = window.harness.runtime;
                        const canvas = document.querySelector("#canvas");
                        const container = document.querySelector("#container");
                        const snap = (e: unknown): ErrorSnapshot => DosRuntimeError.is(e)
                            ? { isRuntimeError: true, code: e.code, label: e.label }
                            : { isRuntimeError: false, code: null, label: null };
                        const thrownBy = (fn: () => unknown): unknown => { try { fn(); return undefined; } catch (e) { return e; } };
                        const configs: unknown[] = [
                            { container },
                            { canvas },
                            { canvas, container, aspectRatio: 0 },
                            { canvas, container, aspectRatio: -4 / 3 },
                            { canvas, container, scaling: "bogus" },
                        ];
                        return configs.map((config) => snap(thrownBy(() => new DosDisplay(config as DosDisplayConfig))));
                    }),
                    P.equals<ErrorSnapshot[]>(Array.from({ length: 5 }, () => ({ isRuntimeError: true, code: 1, label: "INVALID_CONFIG" }))))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "assigning aspectRatio or scaling re-lays out, observed through layout and the canvas style width and height",
            run: () => withHarness((url) => CTGBrowserTest.init("setter re-layout")
                .interact("construct on the 640x480 container and record the initial layout", async ({ page }) => {
                    await page.evaluate(() => {
                        const { DosDisplay } = window.harness.runtime;
                        const scratch: Scratch = {};
                        (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
                        scratch.display = DosDisplay.init({
                            canvas: document.querySelector("#canvas") as HTMLCanvasElement,
                            container: document.querySelector("#container") as HTMLElement,
                        });
                        scratch.display.resize(640, 480);
                    });
                })
                .assertPage("4:3 fit in 640x480 fills the container",
                    (page) => page.evaluate((): AppliedLayout => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        return { layout: display.layout, styleWidth: canvas.style.width, styleHeight: canvas.style.height };
                    }),
                    P.equals<AppliedLayout>({ layout: { width: 640, height: 480, scale: 2 }, styleWidth: "640px", styleHeight: "480px" }))
                .interact("set aspectRatio to 16/9", async ({ page }) => {
                    await page.evaluate(() => { ((globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay).aspectRatio = 16 / 9; });
                })
                .assertPage("16:9 fit in 640x480 is 640x360",
                    (page) => page.evaluate((): AppliedLayout => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        return { layout: display.layout, styleWidth: canvas.style.width, styleHeight: canvas.style.height };
                    }),
                    P.equals<AppliedLayout>({ layout: { width: 640, height: 360, scale: 2 }, styleWidth: "640px", styleHeight: "360px" }))
                .interact("set aspectRatio back to 4/3 and scaling to integer", async ({ page }) => {
                    await page.evaluate(() => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        display.aspectRatio = 4 / 3;
                        display.scaling = "integer";
                    });
                })
                .assertPage("integer scaling in 640x480 is exactly 2x",
                    (page) => page.evaluate((): AppliedLayout => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        return { layout: display.layout, styleWidth: canvas.style.width, styleHeight: canvas.style.height };
                    }),
                    P.equals<AppliedLayout>({ layout: { width: 640, height: 480, scale: 2 }, styleWidth: "640px", styleHeight: "480px" }))
                .assertPage("setter rejects aspectRatio 0 with INVALID_CONFIG",
                    (page) => page.evaluate((): ErrorSnapshot => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        try { display.aspectRatio = 0; return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>({ isRuntimeError: true, code: 1, label: "INVALID_CONFIG" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "attach twice throws INTERNAL_ERROR",
            run: () => withHarness((url) => CTGBrowserTest.init("attach twice")
                .assertPage("second attach throws INTERNAL_ERROR",
                    (page) => page.evaluate((): ErrorSnapshot => {
                        const { DosDisplay, DosRuntimeError } = window.harness.runtime;
                        const session = new window.harness.doubles.FakeEmulatorSession();
                        const display = DosDisplay.init({
                            canvas: document.querySelector("#canvas") as HTMLCanvasElement,
                            container: document.querySelector("#container") as HTMLElement,
                        });
                        display.attach(session);
                        try { display.attach(session); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>({ isRuntimeError: true, code: 3, label: "INTERNAL_ERROR" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a 320x200 frame from the session sets the canvas backing size to 320x200 and draws the sent pixel at (0,0)",
            run: () => withHarness((url) => CTGBrowserTest.init("frame drawn")
                .assertPage("backing size and first pixel",
                    (page) => page.evaluate(() => {
                        const { DosDisplay } = window.harness.runtime;
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        const session = new window.harness.doubles.FakeEmulatorSession();
                        const display = DosDisplay.init({ canvas, container: document.querySelector("#container") as HTMLElement });
                        display.attach(session);
                        const rgba = new Uint8ClampedArray(320 * 200 * 4);
                        rgba[0] = 10; rgba[1] = 20; rgba[2] = 30; rgba[3] = 255;
                        session.emitFrame({ width: 320, height: 200, rgba });
                        const pixel = (canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 1, 1).data;
                        return { width: canvas.width, height: canvas.height, pixel: Array.from(pixel) };
                    }),
                    P.equals<{ width: number; height: number; pixel: number[] }>({ width: 320, height: 200, pixel: [10, 20, 30, 255] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "resizing the container through the viewport, observed by the real ResizeObserver, changes layout",
            run: () => withHarness((url) => CTGBrowserTest.init("resize observer")
                .interact("make the container 50% of the viewport width and construct the display on it", async ({ page }) => {
                    await page.setViewportSize({ width: 1280, height: 720 });
                    await page.evaluate(() => {
                        const { DosDisplay } = window.harness.runtime;
                        const container = document.querySelector("#container") as HTMLElement;
                        container.style.width = "50vw";
                        container.style.height = "480px";
                        const scratch: Scratch = {};
                        (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
                        scratch.display = DosDisplay.init({ canvas: document.querySelector("#canvas") as HTMLCanvasElement, container });
                    });
                })
                .interact("wait for the observer to deliver the initial 640-wide box", async ({ page }) => {
                    await page.waitForFunction(() => ((globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay).layout.width === 640, null, { timeout: 5000 });
                })
                .interact("shrink the viewport so the container becomes 400 wide", async ({ page }) => {
                    await page.setViewportSize({ width: 800, height: 720 });
                    await page.waitForFunction(() => ((globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay).layout.width === 400, null, { timeout: 5000 });
                })
                .assertPage("layout follows the container to 400x300",
                    (page) => page.evaluate((): DisplayLayout => ((globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay).layout),
                    P.equals<DisplayLayout>({ width: 400, height: 300, scale: 1.25 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "fullscreen() rejects with UNSUPPORTED when the target has no requestFullscreen, and with FULLSCREEN_FAILED when it rejects",
            run: () => withHarness((url) => CTGBrowserTest.init("fullscreen failures")
                .assertPage("both failure codes",
                    (page) => page.evaluate(async () => {
                        const { DosDisplay, DosRuntimeError } = window.harness.runtime;
                        const snap = (e: unknown): ErrorSnapshot => DosRuntimeError.is(e)
                            ? { isRuntimeError: true, code: e.code, label: e.label }
                            : { isRuntimeError: false, code: null, label: null };
                        const rejectedBy = async (p: Promise<unknown>): Promise<unknown> => { try { await p; return undefined; } catch (e) { return e; } };
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        const container = document.querySelector("#container") as HTMLElement;
                        const withoutMethod = { ownerDocument: { exitFullscreen: () => Promise.resolve(), fullscreenElement: null } };
                        const rejecting = { requestFullscreen: () => Promise.reject(new Error("denied")), ownerDocument: { exitFullscreen: () => Promise.resolve(), fullscreenElement: null } };
                        const unsupported = new DosDisplay({ canvas, container, fullscreenTarget: withoutMethod } as unknown as DosDisplayConfig);
                        const failed = new DosDisplay({ canvas, container, fullscreenTarget: rejecting } as unknown as DosDisplayConfig);
                        return {
                            unsupported: snap(await rejectedBy(unsupported.fullscreen())),
                            failed: snap(await rejectedBy(failed.fullscreen())),
                        };
                    }),
                    P.equals<{ unsupported: ErrorSnapshot; failed: ErrorSnapshot }>({
                        unsupported: { isRuntimeError: true, code: 13, label: "UNSUPPORTED" },
                        failed: { isRuntimeError: true, code: 10, label: "FULLSCREEN_FAILED" },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "onLayout emits the new layout on a resize to a different size and not on a resize to the same size",
            run: () => withHarness((url) => CTGBrowserTest.init("onLayout on resize")
                .interact("construct on a 1000x500 container with a session attached", async ({ page }) => {
                    await page.evaluate(setupLayoutDisplay);
                })
                .assertPage("resize 640x480, 640x480, 320x240 emits two layouts, each equal to layout after its resize",
                    (page) => page.evaluate(() => {
                        const display = displayOf();
                        const emitted: DisplayLayout[] = [];
                        display.onLayout((layout) => { emitted.push(rounded(layout)); });
                        display.resize(640, 480);
                        const first = rounded(display.layout);
                        display.resize(640, 480);
                        display.resize(320, 240);
                        const second = rounded(display.layout);
                        return { emitted, reported: [first, second] };
                    }),
                    P.equals<{ emitted: DisplayLayout[]; reported: DisplayLayout[] }>({
                        emitted: [{ width: 640, height: 480, scale: 2 }, { width: 320, height: 240, scale: 1 }],
                        reported: [{ width: 640, height: 480, scale: 2 }, { width: 320, height: 240, scale: 1 }],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "the Unsubscribe returned by onLayout stops emissions",
            run: () => withHarness((url) => CTGBrowserTest.init("onLayout unsubscribe")
                .interact("construct on a 1000x500 container with a session attached", async ({ page }) => {
                    await page.evaluate(setupLayoutDisplay);
                })
                .assertPage("one emission before unsubscribing, none after a resize to a new size",
                    (page) => page.evaluate(() => {
                        const display = displayOf();
                        let count = 0;
                        const unsubscribe = display.onLayout(() => { count++; });
                        display.resize(320, 240);
                        const before = count;
                        unsubscribe();
                        display.resize(400, 300);
                        return { before, after: count, layout: rounded(display.layout) };
                    }),
                    P.equals<{ before: number; after: number; layout: DisplayLayout }>({ before: 1, after: 1, layout: { width: 400, height: 300, scale: 1.25 } }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a setter re-layout that changes the layout emits once through onLayout",
            run: () => withHarness((url) => CTGBrowserTest.init("onLayout on setter re-layout")
                .interact("construct on a 1000x500 container with a session attached and resize to 700x500", async ({ page }) => {
                    await page.evaluate(setupLayoutDisplay);
                    await page.evaluate(() => { displayOf().resize(700, 500); });
                })
                .assertPage("fit is 666.6667x500; assigning scaling = integer emits 640x480 (2x, height from 4:3) once",
                    (page) => page.evaluate(() => {
                        const display = displayOf();
                        const fit = rounded(display.layout);
                        const emitted: DisplayLayout[] = [];
                        display.onLayout((layout) => { emitted.push(rounded(layout)); });
                        display.scaling = "integer";
                        return { fit, emitted, layout: rounded(display.layout) };
                    }),
                    P.equals<{ fit: DisplayLayout; emitted: DisplayLayout[]; layout: DisplayLayout }>({
                        fit: { width: 666.6667, height: 500, scale: 2.0833 },
                        emitted: [{ width: 640, height: 480, scale: 2 }],
                        layout: { width: 640, height: 480, scale: 2 },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a fullscreenchange on the document re-lays out to the container's current size, and not after destroy",
            run: () => withHarness((url) => CTGBrowserTest.init("fullscreenchange re-layout")
                .interact("init on the 640x480 container with a session attached", async ({ page }) => {
                    await page.evaluate(() => {
                        const { DosDisplay } = window.harness.runtime;
                        const session = new window.harness.doubles.FakeEmulatorSession();
                        const display = DosDisplay.init({
                            canvas: document.querySelector("#canvas") as HTMLCanvasElement,
                            container: document.querySelector("#container") as HTMLElement,
                        });
                        display.attach(session);
                        const scratch: Scratch = { display, session };
                        (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
                    });
                })
                .assertPage("container styled 400x300 then fullscreenchange dispatched: layout is 400x300",
                    (page) => page.evaluate((): DisplayLayout => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        const container = document.querySelector("#container") as HTMLElement;
                        container.style.width = "400px";
                        container.style.height = "300px";
                        document.dispatchEvent(new Event("fullscreenchange"));
                        const l = display.layout;
                        return { width: l.width, height: l.height, scale: l.scale };
                    }),
                    P.equals<DisplayLayout>({ width: 400, height: 300, scale: 1.25 }))
                .interact("destroy, style the container 600x450, dispatch fullscreenchange, let two frames pass", async ({ page }) => {
                    await page.evaluate(async () => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        display.destroy();
                        const l = display.layout;
                        (globalThis as unknown as { __destroyed: DisplayLayout }).__destroyed = { width: l.width, height: l.height, scale: l.scale };
                        const container = document.querySelector("#container") as HTMLElement;
                        container.style.width = "600px";
                        container.style.height = "450px";
                        document.dispatchEvent(new Event("fullscreenchange"));
                        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    });
                })
                .assertPage("layout is unchanged from the destroyed state",
                    (page) => page.evaluate(() => {
                        const display = (globalThis as unknown as { __scratch: Scratch }).__scratch.display as DosDisplay;
                        const l = display.layout;
                        return { destroyed: (globalThis as unknown as { __destroyed: DisplayLayout }).__destroyed, now: { width: l.width, height: l.height, scale: l.scale } };
                    }),
                    P.equals<{ destroyed: DisplayLayout; now: DisplayLayout }>({
                        destroyed: { width: 400, height: 300, scale: 1.25 },
                        now: { width: 400, height: 300, scale: 1.25 },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
    ]
};

export default testFile;
