// realizes: docs/headless-browser-dos-runtime-spec.md > §9 KeyboardSource (§9.3)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { DosInput, KeyboardSource, KeyboardSourceConfig, KeyCode } from "../../src/index.ts";   // Instance types kept in-page
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {source:keyboardSource?, input:dosInput?, session:fakeEmulatorSession?, pageErrors:[STRING]}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    source?: KeyboardSource;                                       // The source under test
    input?: DosInput;                                              // The input it forwards to
    session?: FakeEmulatorSession;                                 // The session double behind the input
    pageErrors: string[];                                          // Messages of uncaught errors reported to window
}

// INTERFACE :: {method:STRING, args:[UNKNOWN]}
// One recorded session call, as plain JSON.
interface CallSnapshot {
    method: string;                                                // Session method name
    args: unknown[];                                               // Arguments as given
}

// INTERFACE :: {filterBlocks:[STRING]?, preventDefault:BOOLEAN?, attach:BOOLEAN?}
// Options for the in-page setup.
interface SetupOptions {
    filterBlocks?: string[];                                       // Codes the filter rejects, when a filter is wanted
    preventDefault?: boolean;                                      // Passed through to the config when given
    attach?: boolean;                                              // Whether setup calls attach(); defaults to true
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
// In-page setup: constructs a KeyboardSource on document over a DosInput and a FakeEmulatorSession, recording uncaught page errors.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { DosInput, KeyboardSource } = window.harness.runtime;
    const { FakeEmulatorSession } = window.harness.doubles;
    const scratch: Scratch = { pageErrors: [] };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    // The scratchOf/callsOf helpers below are defined in Node for typing; page.evaluate callbacks resolve them as these page globals.
    (globalThis as unknown as { scratchOf: () => Scratch }).scratchOf = () => scratch;
    (globalThis as unknown as { callsOf: () => CallSnapshot[] }).callsOf = () =>
        (scratch.session as FakeEmulatorSession).calls.map((c) => ({ method: c.method, args: [...c.args] }));
    window.addEventListener("error", (event) => { scratch.pageErrors.push(String(event.message)); });
    scratch.session = new FakeEmulatorSession();
    scratch.input = new DosInput({ session: scratch.session });
    const config: { input: DosInput; target: Document; filter?: (code: KeyCode) => boolean; preventDefault?: boolean } = { input: scratch.input, target: document };
    if (options.filterBlocks !== undefined) { const blocked = options.filterBlocks; config.filter = (code) => !blocked.includes(code); }
    if (options.preventDefault !== undefined) config.preventDefault = options.preventDefault;
    scratch.source = new KeyboardSource(config);
    if (options.attach !== false) scratch.source.attach();
};

// HELPER :: VOID -> scratch
// Reads the scratch object back in the page.
const scratchOf = (): Scratch => (globalThis as unknown as { __scratch: Scratch }).__scratch;

// HELPER :: VOID -> [callSnapshot]
// Plain-JSON copy of the session's recorded calls.
const callsOf = (): CallSnapshot[] => (scratchOf().session as FakeEmulatorSession).calls.map((c) => ({ method: c.method, args: [...c.args] }));

const testFile: TestFile = {
    label: "KeyboardSource",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "page.keyboard.down(ArrowUp) then up forward to the session as sendKey ArrowUp true then false",
            run: () => withHarness((url) => CTGBrowserTest.init("real keyboard")
                .interact("construct on document, focus the page, press and release ArrowUp", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.click("#container");
                    await page.keyboard.down("ArrowUp");
                    await page.keyboard.up("ArrowUp");
                })
                .assertPage("session saw ArrowUp down then up",
                    (page) => page.evaluate(callsOf),
                    P.equals<CallSnapshot[]>([{ method: "sendKey", args: ["ArrowUp", true] }, { method: "sendKey", args: ["ArrowUp", false] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a KeyboardEvent dispatched with repeat true is ignored",
            run: () => withHarness((url) => CTGBrowserTest.init("repeat ignored")
                .interact("construct and dispatch a repeating keydown", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", repeat: true, bubbles: true, cancelable: true })); });
                })
                .assertPage("no session call", (page) => page.evaluate(callsOf), P.equals<CallSnapshot[]>([]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "filter returning false for a code blocks it and the event is not prevented",
            run: () => withHarness((url) => CTGBrowserTest.init("filter blocks")
                .interact("construct with a filter blocking KeyA", async ({ page }) => { await page.evaluate(setup, { filterBlocks: ["KeyA"] } as SetupOptions); })
                .assertPage("KeyA not forwarded and not prevented; KeyB forwarded",
                    (page) => page.evaluate(() => {
                        const a = new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true, cancelable: true });
                        document.dispatchEvent(a);
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB", key: "b", bubbles: true, cancelable: true }));
                        return { aPrevented: a.defaultPrevented, calls: callsOf() };
                    }),
                    P.equals<{ aPrevented: boolean; calls: CallSnapshot[] }>({ aPrevented: false, calls: [{ method: "sendKey", args: ["KeyB", true] }] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "window blur releases two held keys",
            run: () => withHarness((url) => CTGBrowserTest.init("blur releases")
                .interact("construct, hold two keys, blur", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft", key: "ArrowLeft", bubbles: true, cancelable: true }));
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
                        window.dispatchEvent(new Event("blur"));
                    });
                })
                .assertPage("both keys released and snapshot empty",
                    (page) => page.evaluate(() => ({ calls: callsOf(), keysDown: (scratchOf().input as DosInput).snapshot.keysDown })),
                    P.equals<{ calls: CallSnapshot[]; keysDown: readonly string[] }>({
                        calls: [
                            { method: "sendKey", args: ["ArrowLeft", true] },
                            { method: "sendKey", args: ["Space", true] },
                            { method: "sendKey", args: ["ArrowLeft", false] },
                            { method: "sendKey", args: ["Space", false] },
                        ],
                        keysDown: [],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "visibilitychange while hidden releases held keys",
            run: () => withHarness((url) => CTGBrowserTest.init("hidden releases")
                .interact("construct, hold a key, go hidden", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true, cancelable: true }));
                        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
                        document.dispatchEvent(new Event("visibilitychange"));
                    });
                })
                .assertPage("key released and snapshot empty",
                    (page) => page.evaluate(() => ({ calls: callsOf(), keysDown: (scratchOf().input as DosInput).snapshot.keysDown })),
                    P.equals<{ calls: CallSnapshot[]; keysDown: readonly string[] }>({
                        calls: [{ method: "sendKey", args: ["KeyW", true] }, { method: "sendKey", args: ["KeyW", false] }],
                        keysDown: [],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "UNSUPPORTED_KEY thrown by input.keyDown is swallowed and the source stays attached",
            run: () => withHarness((url) => CTGBrowserTest.init("unsupported key swallowed")
                .interact("construct with a session that throws UNSUPPORTED_KEY, dispatch keydown", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const { DosRuntimeError } = window.harness.runtime;
                        (scratchOf().session as FakeEmulatorSession).script("sendKey", "throw", new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED_KEY, message: "no such key", data: "Bogus" }));
                        try { document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", key: "z", bubbles: true, cancelable: true })); } catch (e) { scratchOf().pageErrors.push(`sync:${String(e)}`); }
                    });
                })
                .assertPage("nothing propagated and still attached",
                    (page) => page.evaluate(() => ({ pageErrors: scratchOf().pageErrors, isAttached: (scratchOf().source as KeyboardSource).isAttached })),
                    P.equals<{ pageErrors: string[]; isAttached: boolean }>({ pageErrors: [], isAttached: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "any other error from the input propagates",
            run: () => withHarness((url) => CTGBrowserTest.init("other error propagates")
                .interact("construct with a session that throws a plain Error, dispatch keydown", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        (scratchOf().session as FakeEmulatorSession).script("sendKey", "throw", new Error("session exploded"));
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", key: "z", bubbles: true, cancelable: true }));
                    });
                })
                .assertPage("the error reached window",
                    (page) => page.evaluate(() => scratchOf().pageErrors.some((m) => m.includes("session exploded"))),
                    P.isTrue())
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "preventDefault defaults to true; with preventDefault false the event is not prevented",
            run: () => withHarness((url) => CTGBrowserTest.init("preventDefault")
                .interact("construct with the default", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("ArrowDown keydown is prevented",
                    (page) => page.evaluate(() => {
                        const event = new KeyboardEvent("keydown", { code: "ArrowDown", key: "ArrowDown", bubbles: true, cancelable: true });
                        document.dispatchEvent(event);
                        return event.defaultPrevented;
                    }),
                    P.isTrue())
                .interact("destroy and construct with preventDefault false", async ({ page }) => {
                    await page.evaluate(() => { (scratchOf().source as KeyboardSource).destroy(); });
                    await page.evaluate(setup, { preventDefault: false } as SetupOptions);
                })
                .assertPage("ArrowDown keydown is not prevented but still forwarded",
                    (page) => page.evaluate(() => {
                        const event = new KeyboardEvent("keydown", { code: "ArrowDown", key: "ArrowDown", bubbles: true, cancelable: true });
                        document.dispatchEvent(event);
                        return { prevented: event.defaultPrevented, calls: callsOf() };
                    }),
                    P.equals<{ prevented: boolean; calls: CallSnapshot[] }>({ prevented: false, calls: [{ method: "sendKey", args: ["ArrowDown", true] }] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "attach twice is a no-op; detach removes listeners and releases held keys; destroy detaches; both idempotent",
            run: () => withHarness((url) => CTGBrowserTest.init("attach detach destroy")
                .interact("construct and attach a second time", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => { (scratchOf().source as KeyboardSource).attach(); });
                })
                .assertPage("attached once: one forwarded call per keydown",
                    (page) => page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true, cancelable: true }));
                        return { isAttached: (scratchOf().source as KeyboardSource).isAttached, calls: callsOf() };
                    }),
                    P.equals<{ isAttached: boolean; calls: CallSnapshot[] }>({ isAttached: true, calls: [{ method: "sendKey", args: ["KeyA", true] }] }))
                .assertPage("detach releases the held key and a later keydown is not forwarded; detach again is a no-op",
                    (page) => page.evaluate(() => {
                        const source = scratchOf().source as KeyboardSource;
                        source.detach();
                        source.detach();
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB", key: "b", bubbles: true, cancelable: true }));
                        return { isAttached: source.isAttached, calls: callsOf(), keysDown: (scratchOf().input as DosInput).snapshot.keysDown };
                    }),
                    P.equals<{ isAttached: boolean; calls: CallSnapshot[]; keysDown: readonly string[] }>({
                        isAttached: false,
                        calls: [{ method: "sendKey", args: ["KeyA", true] }, { method: "sendKey", args: ["KeyA", false] }],
                        keysDown: [],
                    }))
                .assertPage("attach again, then destroy twice detaches",
                    (page) => page.evaluate(() => {
                        const source = scratchOf().source as KeyboardSource;
                        source.attach();
                        const attachedAgain = source.isAttached;
                        source.destroy();
                        source.destroy();
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true, cancelable: true }));
                        return { attachedAgain, isAttached: source.isAttached, callCount: callsOf().length };
                    }),
                    P.equals<{ attachedAgain: boolean; isAttached: boolean; callCount: number }>({ attachedAgain: true, isAttached: false, callCount: 2 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled reads true after construction",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled default")
                .interact("construct on document", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("enabled is true",
                    (page) => page.evaluate(() => (scratchOf().source as KeyboardSource).enabled),
                    P.equals<boolean>(true))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled = false releases two held keys and a later keydown is neither forwarded nor prevented",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled false releases and gates")
                .interact("construct, hold two keys, close the gate", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft", key: "ArrowLeft", bubbles: true, cancelable: true }));
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
                        (scratchOf().source as KeyboardSource).enabled = false;
                    });
                })
                .assertPage("both keys released, snapshot empty, and a later keydown neither forwarded nor prevented",
                    (page) => page.evaluate(() => {
                        const event = new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true, cancelable: true });
                        document.dispatchEvent(event);
                        return { calls: callsOf(), keysDown: (scratchOf().input as DosInput).snapshot.keysDown, defaultPrevented: event.defaultPrevented };
                    }),
                    P.equals<{ calls: CallSnapshot[]; keysDown: readonly string[]; defaultPrevented: boolean }>({
                        calls: [
                            { method: "sendKey", args: ["ArrowLeft", true] },
                            { method: "sendKey", args: ["Space", true] },
                            { method: "sendKey", args: ["ArrowLeft", false] },
                            { method: "sendKey", args: ["Space", false] },
                        ],
                        keysDown: [],
                        defaultPrevented: false,
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled = true after enabled = false forwards again",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled true forwards again")
                .interact("construct, close the gate, reopen it", async ({ page }) => {
                    await page.evaluate(setup, {} as SetupOptions);
                    await page.evaluate(() => {
                        const source = scratchOf().source as KeyboardSource;
                        source.enabled = false;
                        source.enabled = true;
                    });
                })
                .assertPage("a keydown is forwarded",
                    (page) => page.evaluate(() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true, cancelable: true }));
                        return callsOf();
                    }),
                    P.equals<CallSnapshot[]>([{ method: "sendKey", args: ["KeyA", true] }]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "enabled = \"no\" throws INVALID_CONFIG and enabled is unchanged",
            run: () => withHarness((url) => CTGBrowserTest.init("enabled setter rejects")
                .interact("construct on document", async ({ page }) => { await page.evaluate(setup, {} as SetupOptions); })
                .assertPage("the rejection is INVALID_CONFIG and enabled stays true",
                    (page) => page.evaluate((): { rejection: ErrorSnapshot; enabled: boolean } => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const source = scratchOf().source as KeyboardSource;
                        let rejection: ErrorSnapshot = { isRuntimeError: false, code: null, label: null };
                        try { source.enabled = "no" as unknown as boolean; } catch (e) {
                            rejection = DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                        return { rejection, enabled: source.enabled };
                    }),
                    P.equals<{ rejection: ErrorSnapshot; enabled: boolean }>({ rejection: { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" }, enabled: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "constructor throws INVALID_CONFIG when input is not a DosInput or target lacks addEventListener",
            run: () => withHarness((url) => CTGBrowserTest.init("constructor rejects")
                .assertPage("both rejections are INVALID_CONFIG",
                    (page) => page.evaluate((): ErrorSnapshot[] => {
                        const { DosInput, DosRuntimeError, KeyboardSource } = window.harness.runtime;
                        const { FakeEmulatorSession } = window.harness.doubles;
                        const snap = (thrown: unknown): ErrorSnapshot => DosRuntimeError.is(thrown) ? { isRuntimeError: true, code: thrown.code, label: thrown.label } : { isRuntimeError: false, code: null, label: null };
                        const attempt = (config: unknown): ErrorSnapshot => { try { new KeyboardSource(config as KeyboardSourceConfig); return { isRuntimeError: false, code: null, label: null }; } catch (e) { return snap(e); } };
                        const input = new DosInput({ session: new FakeEmulatorSession() });
                        return [attempt({ input: {}, target: document }), attempt({ input, target: null }), attempt(null)];
                    }),
                    P.equals<ErrorSnapshot[]>([
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                        { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" },
                    ]))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
