// realizes: docs/headless-browser-dos-runtime-spec.md > §4 JsDosEmulatorAdapter (§4.4 browser cases)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { EmulatorSession, JsDosEmulatorAdapterConfig } from "../../src/index.ts";   // Session type kept in-page; config type for rejected inputs

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {bundle:Uint8Array?, session:emulatorSession?}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    bundle?: Uint8Array;                                           // Bytes of /test.jsdos fetched in-page
    session?: EmulatorSession;                                     // Session the case started
}

/**
 *
 * Constants
 *
 */

const START_TIMEOUT = 60000;                                       // Cases that boot js-dos get a minute per step
const PATH_PREFIX = "/emulators/";                                 // Where harness-server.ts serves js-dos assets

const testFile: TestFile = {
    label: "JsDosEmulatorAdapter",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "constructor throws INVALID_CONFIG when emulators is missing, pathPrefix is empty, backend is unknown, or mode is unknown",
            run: () => withHarness((url) => CTGBrowserTest.init("adapter construction rejection")
                .assertPage("each rejected config throws INVALID_CONFIG",
                    (page) => page.evaluate(() => {
                        const { DosRuntimeError, JsDosEmulatorAdapter } = window.harness.runtime;
                        const snap = (e: unknown): ErrorSnapshot => DosRuntimeError.is(e)
                            ? { isRuntimeError: true, code: e.code, label: e.label }
                            : { isRuntimeError: false, code: null, label: null };
                        const thrownBy = (fn: () => unknown): unknown => { try { fn(); return undefined; } catch (e) { return e; } };
                        const noop = async (): Promise<never> => { throw new Error("unused"); };
                        const emulators = { pathPrefix: "", version: "fake", dosboxDirect: noop, dosboxWorker: noop, dosboxXDirect: noop, dosboxXWorker: noop };
                        const configs: unknown[] = [
                            { pathPrefix: "/emulators/" },
                            { emulators, pathPrefix: "" },
                            { emulators, pathPrefix: "/emulators/", backend: "bogus" },
                            { emulators, pathPrefix: "/emulators/", mode: "bogus" },
                        ];
                        return configs.map((config) => snap(thrownBy(() => new JsDosEmulatorAdapter(config as JsDosEmulatorAdapterConfig))));
                    }),
                    P.equals<ErrorSnapshot[]>(Array.from({ length: 4 }, () => ({ isRuntimeError: true, code: 1, label: "INVALID_CONFIG" }))))
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "KEY_MAP maps ArrowUp, ControlLeft and Numpad5 to numbers and has no entry for Bogus",
            run: () => withHarness((url) => CTGBrowserTest.init("KEY_MAP spot checks")
                .assertPage("present codes are numbers and Bogus is absent",
                    (page) => page.evaluate(() => {
                        const { KEY_MAP } = window.harness.runtime.JsDosEmulatorAdapter;
                        return {
                            arrowUp: typeof KEY_MAP["ArrowUp"],
                            controlLeft: typeof KEY_MAP["ControlLeft"],
                            numpad5: typeof KEY_MAP["Numpad5"],
                            bogus: typeof KEY_MAP["Bogus"],
                        };
                    }),
                    P.equals<{ arrowUp: string; controlLeft: string; numpad5: string; bogus: string }>({ arrowUp: "number", controlLeft: "number", numpad5: "number", bogus: "undefined" }))
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "init() resolves to an adapter of type js-dos with the given pathPrefix",
            run: () => withHarness((url) => CTGBrowserTest.init("init resolves")
                .assertPage("adapter identity",
                    (page) => page.evaluate(async (prefix) => {
                        const adapter = await window.harness.runtime.JsDosEmulatorAdapter.init({ pathPrefix: prefix });
                        return { type: adapter.type, pathPrefix: adapter.pathPrefix, backend: adapter.backend, mode: adapter.mode };
                    }, PATH_PREFIX),
                    P.equals<{ type: string; pathPrefix: string; backend: string; mode: string }>({ type: "js-dos", pathPrefix: PATH_PREFIX, backend: "dosbox", mode: "worker" }))
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "start() with the harness bundle resolves to a session and the first frame arrives with positive width and height",
            run: () => withHarness((url) => CTGBrowserTest.init("start and first frame")
                .interact("fetch the bundle and start", async ({ page }) => {
                    await page.evaluate(async (prefix) => {
                        const scratch = (globalThis as unknown as { __scratch?: Scratch }).__scratch ?? {};
                        (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
                        scratch.bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer());
                        const adapter = await window.harness.runtime.JsDosEmulatorAdapter.init({ pathPrefix: prefix });
                        scratch.session = await adapter.start({ bundle: scratch.bundle });
                    }, PATH_PREFIX);
                })
                .assertPage("session shape and first frame",
                    (page) => page.evaluate(() => new Promise<{ isSession: boolean; soundFrequency: number; width: number; height: number; rgbaLength: number }>((resolve, reject) => {
                        const scratch = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const session = scratch.session;
                        if (session === undefined) { reject(new Error("no session")); return; }
                        const timer = setTimeout(() => reject(new Error("no frame within 30s")), 30000);
                        const unsubscribe = session.onFrame((frame) => {
                            clearTimeout(timer);
                            unsubscribe();
                            resolve({
                                isSession: window.harness.runtime.isEmulatorSession(session),
                                soundFrequency: session.soundFrequency,
                                width: frame.width,
                                height: frame.height,
                                rgbaLength: frame.rgba.length,
                            });
                        });
                    })),
                    P.satisfies<{ isSession: boolean; soundFrequency: number; width: number; height: number; rgbaLength: number }>((v) =>
                        v.isSession && v.soundFrequency === 44100 && v.width > 0 && v.height > 0 && v.rgbaLength === v.width * v.height * 4))
                .interact("exit", async ({ page }) => {
                    await page.evaluate(async () => { await (globalThis as unknown as { __scratch: Scratch }).__scratch.session?.exit(); });
                })
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "sendKey(Enter, true) then (Enter, false) does not throw; sendKey(Bogus) throws UNSUPPORTED_KEY; sendJoystickButton throws UNSUPPORTED; persist() resolves to null before any change",
            run: () => withHarness((url) => CTGBrowserTest.init("session input and persist")
                .interact("start a session", async ({ page }) => {
                    await page.evaluate(async (prefix) => {
                        const scratch: Scratch = {};
                        (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
                        scratch.bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer());
                        const adapter = await window.harness.runtime.JsDosEmulatorAdapter.init({ pathPrefix: prefix });
                        scratch.session = await adapter.start({ bundle: scratch.bundle });
                    }, PATH_PREFIX);
                })
                .assertPage("input outcomes and persist result",
                    (page) => page.evaluate(async () => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const session = (globalThis as unknown as { __scratch: Scratch }).__scratch.session;
                        if (session === undefined) throw new Error("no session");
                        const snap = (e: unknown): ErrorSnapshot => DosRuntimeError.is(e)
                            ? { isRuntimeError: true, code: e.code, label: e.label }
                            : { isRuntimeError: false, code: null, label: null };
                        const thrownBy = (fn: () => unknown): unknown => { try { fn(); return undefined; } catch (e) { return e; } };
                        const enterDown = thrownBy(() => session.sendKey("Enter", true));
                        const enterUp = thrownBy(() => session.sendKey("Enter", false));
                        const bogus = snap(thrownBy(() => session.sendKey("Bogus", true)));
                        const joystick = snap(thrownBy(() => session.sendJoystickButton(0, true)));
                        const persisted = await session.persist();
                        await session.exit();
                        return { enterDown: enterDown === undefined, enterUp: enterUp === undefined, bogus, joystick, persisted: persisted === null ? "null" : "bytes" };
                    }),
                    P.equals<{ enterDown: boolean; enterUp: boolean; bogus: ErrorSnapshot; joystick: ErrorSnapshot; persisted: string }>({
                        enterDown: true,
                        enterUp: true,
                        bogus: { isRuntimeError: true, code: 9, label: "UNSUPPORTED_KEY" },
                        joystick: { isRuntimeError: true, code: 13, label: "UNSUPPORTED" },
                        persisted: "null",
                    }))
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "exit() resolves and afterwards sendKey throws DESTROYED",
            run: () => withHarness((url) => CTGBrowserTest.init("exit then destroyed")
                .assertPage("exit resolves; sendKey after exit throws DESTROYED",
                    (page) => page.evaluate(async (prefix) => {
                        const { DosRuntimeError, JsDosEmulatorAdapter } = window.harness.runtime;
                        const snap = (e: unknown): ErrorSnapshot => DosRuntimeError.is(e)
                            ? { isRuntimeError: true, code: e.code, label: e.label }
                            : { isRuntimeError: false, code: null, label: null };
                        const bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer());
                        const adapter = await JsDosEmulatorAdapter.init({ pathPrefix: prefix });
                        const session = await adapter.start({ bundle });
                        let exitError: unknown;
                        try { await session.exit(); } catch (e) { exitError = e; }
                        let after: unknown;
                        try { session.sendKey("Enter", true); } catch (e) { after = e; }
                        return { exitResolved: exitError === undefined, after: snap(after) };
                    }, PATH_PREFIX),
                    P.equals<{ exitResolved: boolean; after: ErrorSnapshot }>({ exitResolved: true, after: { isRuntimeError: true, code: 8, label: "DESTROYED" } }))
                .start(url, { timeout: START_TIMEOUT }))
        },
        {
            label: "starting twice from the same kept Uint8Array succeeds both times",
            run: () => withHarness((url) => CTGBrowserTest.init("detachment guard")
                .assertPage("two sessions from one array",
                    (page) => page.evaluate(async (prefix) => {
                        const { JsDosEmulatorAdapter, isEmulatorSession } = window.harness.runtime;
                        const bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer());
                        const adapter = await JsDosEmulatorAdapter.init({ pathPrefix: prefix });
                        const first = await adapter.start({ bundle });
                        await first.exit();
                        const second = await adapter.start({ bundle });
                        const result = { first: isEmulatorSession(first), second: isEmulatorSession(second), byteLength: bundle.byteLength };
                        await second.exit();
                        return result;
                    }, PATH_PREFIX),
                    P.satisfies<{ first: boolean; second: boolean; byteLength: number }>((v) => v.first && v.second && v.byteLength > 0))
                .start(url, { timeout: START_TIMEOUT }))
        },
    ]
};

export default testFile;
