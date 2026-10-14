// Dependencies:
import { existsSync } from "node:fs";                              // Checks for the Chromium binary and the harness bundle
import { startHarnessServer } from "./harness-server.ts";          // Harness server started per browser case

// Type dependencies:
import type { Page } from "playwright";                            // Page a browser case taps through
import type { DosRuntimeError } from "../../src/index.ts";         // Narrowed by errorSnapshot()

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {isRuntimeError:BOOLEAN, code:NUMBER?, label:STRING?}
// Plain-data view of a thrown value for equals comparison.
export interface ErrorSnapshot {
    isRuntimeError: boolean;                                       // Whether DosRuntimeError.is(value) held
    code: number | null;                                           // error.code when it is a runtime error, else null
    label: string | null;                                          // error.label when it is a runtime error, else null
}

/**
 *
 * Constants
 *
 */

const HARNESS_BUNDLE = new URL("../browser/harness/test.jsdos", import.meta.url);   // Git-ignored test game bundle

/**
 *
 * Functions
 *
 */

// HELPER :: (VOID -> UNKNOWN) -> UNKNOWN
// Calls fn and returns what it threw, or undefined when it did not throw.
export const thrownBy = (fn: () => unknown): unknown => {
    try {
        fn();
        return undefined;
    } catch (error) {
        return error;
    }
};

// HELPER :: PROMISE(UNKNOWN) -> PROMISE(UNKNOWN)
// Awaits promise and resolves with what it rejected with, or undefined when it resolved.
export const rejectedBy = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise;
        return undefined;
    } catch (error) {
        return error;
    }
};

// HELPER :: UNKNOWN, CONSTRUCTOR(dosRuntimeError) & {is:(UNKNOWN -> BOOLEAN)} -> errorSnapshot
// Reduces a thrown value to its runtime-error identity, code and label for equals comparison.
// NOTE: The class is passed in rather than imported so this file has no runtime import of src/ and loads before implementation.
export const errorSnapshot = (value: unknown, errorClass: { is(value: unknown): value is DosRuntimeError }): ErrorSnapshot =>
    errorClass.is(value)
        ? { isRuntimeError: true, code: value.code, label: value.label }
        : { isRuntimeError: false, code: null, label: null };

// HELPER :: VOID -> PROMISE(STRING?)
// Resolves with undefined when the browser suite can run here, else the reason to skip the file.
// NOTE: Requires playwright to resolve, its Chromium executable to exist, and the harness bundle to be built.
export const browserSkipReason = async (): Promise<string | undefined> => {
    let executablePath: string;
    try {
        const { chromium } = await import("playwright");
        executablePath = chromium.executablePath();
    } catch {
        return "playwright is not installed";
    }
    if (!existsSync(executablePath)) return `chromium is not installed at ${executablePath}; run npx playwright install chromium`;
    if (!existsSync(HARNESS_BUNDLE)) return "tests/browser/harness/test.jsdos is missing; run npm run pack-bundle -- <game dir>";
    return undefined;
};

// HELPER :: (STRING -> PROMISE(T)) -> PROMISE(T)
// Starts a harness server on a free port, runs fn with its URL, and stops the server afterwards.
export const withHarness = async <T>(fn: (url: string) => Promise<T>): Promise<T> => {
    const server = await startHarnessServer(0);
    try {
        return await fn(server.url);
    } finally {
        await server.stop();
    }
};

// HELPER :: page, {x:NUMBER, y:NUMBER} -> PROMISE(VOID)
// Delivers a real one-finger touch tap at a viewport point through the DevTools protocol.
// NOTE: ctg-js-browser-test creates its context without hasTouch, so page.touchscreen.tap refuses; this sends the same
// touchStart/touchEnd pair Playwright would, and Chromium then fires real pointer events with pointerType "touch".
export const realTap = async (page: Page, point: { x: number; y: number }): Promise<void> => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
};
