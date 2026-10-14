// realizes: docs/headless-browser-dos-runtime-spec.md > §8 DosPlayer (§8.3)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { DosInputSnapshot, DosPlayer, DosPlayerStatus, DosRuntimeError, FetchLike } from "../../src/index.ts";   // Snapshots and instance types kept in-page
import type FakeEmulatorAdapter from "../support/FakeEmulatorAdapter.ts";     // Adapter double kept in-page
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {player:dosPlayer?, adapter:fakeEmulatorAdapter?, session:fakeEmulatorSession?, statuses:[dosPlayerStatus], errors:[errorSnapshot], exits:NUMBER}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    player?: DosPlayer;                                            // The player under test
    adapter?: FakeEmulatorAdapter;                                 // Its adapter double
    session?: FakeEmulatorSession;                                 // The session the adapter resolves with
    statuses: DosPlayerStatus[];                                   // Every status event, in order
    errors: ErrorSnapshot[];                                       // Every error event, snapshotted
    exits: number;                                                 // Count of exit events
}

// TYPE :: "ok" | "404" | "reject"
// How the scripted fetch behaves.
type FetchMode = "ok" | "404" | "reject";

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Default per-step timeout for lifecycle cases
const BOOT_TIMEOUT = 60000;                                        // Cases that boot js-dos get a minute per step

/**
 *
 * Functions
 *
 */

// HELPER :: {fetchMode:fetchMode, adapterMode:"resolve"|"rejectError"|"rejectRuntime"} -> VOID
// In-page setup: constructs a DosPlayer on the harness canvas with scripted fetch and adapter doubles, recording status, error and exit events.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: { fetchMode: FetchMode; adapterMode: "resolve" | "rejectError" | "rejectRuntime" }): void => {
    const { DosPlayer, DosRuntimeError } = window.harness.runtime;
    const { FakeEmulatorAdapter, FakeEmulatorSession } = window.harness.doubles;
    const scratch: Scratch = { statuses: [], errors: [], exits: 0 };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    scratch.session = new FakeEmulatorSession();
    scratch.adapter = new FakeEmulatorAdapter();
    if (options.adapterMode === "resolve") scratch.adapter.script("resolve", scratch.session);
    if (options.adapterMode === "rejectError") scratch.adapter.script("reject", new Error("library exploded"));
    if (options.adapterMode === "rejectRuntime") scratch.adapter.script("reject", new DosRuntimeError({ code: DosRuntimeError.CODE.BUNDLE_LOAD_FAILED, message: "adapter said so" }));
    const fetchLike: FetchLike = (_url: string) => {
        if (options.fetchMode === "reject") return Promise.reject(new Error("network down"));
        const ok = options.fetchMode === "ok";
        return Promise.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
    };
    scratch.player = new DosPlayer({
        canvas: document.querySelector("#canvas") as HTMLCanvasElement,
        container: document.querySelector("#container") as HTMLElement,
        game: { bundle: "/fake.jsdos" },
        adapter: scratch.adapter,
        fetch: fetchLike,
    });
    const snap = (e: DosRuntimeError): ErrorSnapshot => ({ isRuntimeError: true, code: e.code, label: e.label });
    scratch.player.on("status", (status: DosPlayerStatus) => { scratch.statuses.push(status); });
    scratch.player.on("error", (error: DosRuntimeError) => { scratch.errors.push(snap(error)); });
    scratch.player.on("exit", () => { scratch.exits++; });
};

const testFile: TestFile = {
    label: "DosPlayer",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "start() moves status through idle, starting, running, emitted through on(status)",
            run: () => withHarness((url) => CTGBrowserTest.init("status sequence")
                .interact("construct and start", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => { await ((globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer).start(); });
                })
                .assertPage("initial status idle, then starting and running emitted",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        return { statuses: s.statuses, now: (s.player as DosPlayer).status, startCalls: (s.adapter as FakeEmulatorAdapter).startCalls.length };
                    }),
                    P.equals<{ statuses: DosPlayerStatus[]; now: DosPlayerStatus; startCalls: number }>({ statuses: ["starting", "running"], now: "running", startCalls: 1 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "reading input before start() resolves throws NOT_STARTED",
            run: () => withHarness((url) => CTGBrowserTest.init("input before start")
                .interact("construct", async ({ page }) => { await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const); })
                .assertPage("status idle and input throws NOT_STARTED",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const player = s.player as DosPlayer;
                        let thrown: unknown;
                        try { void player.input; } catch (e) { thrown = e; }
                        const { DosRuntimeError } = window.harness.runtime;
                        const snap: ErrorSnapshot = DosRuntimeError.is(thrown) ? { isRuntimeError: true, code: thrown.code, label: thrown.label } : { isRuntimeError: false, code: null, label: null };
                        return { status: player.status, snap };
                    }),
                    P.equals<{ status: DosPlayerStatus; snap: ErrorSnapshot }>({ status: "idle", snap: { isRuntimeError: true, code: 6, label: "NOT_STARTED" } }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "start() while running throws ALREADY_STARTED",
            run: () => withHarness((url) => CTGBrowserTest.init("start twice")
                .interact("construct and start", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => { await ((globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer).start(); });
                })
                .assertPage("second start rejects with ALREADY_STARTED",
                    (page) => page.evaluate(async (): Promise<ErrorSnapshot> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const player = (globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer;
                        try { await player.start(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>({ isRuntimeError: true, code: 7, label: "ALREADY_STARTED" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a 404 for the bundle rejects start() with BUNDLE_LOAD_FAILED carrying data 404, emits error, and returns status to idle",
            run: () => withHarness((url) => CTGBrowserTest.init("bundle 404")
                .interact("construct with a 404 fetch", async ({ page }) => { await page.evaluate(setup, { fetchMode: "404", adapterMode: "resolve" } as const); })
                .assertPage("rejection, data, event and status",
                    (page) => page.evaluate(async () => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const player = s.player as DosPlayer;
                        let thrown: unknown;
                        try { await player.start(); } catch (e) { thrown = e; }
                        return {
                            code: DosRuntimeError.is(thrown) ? thrown.code : null,
                            label: DosRuntimeError.is(thrown) ? thrown.label : null,
                            data: DosRuntimeError.is(thrown) ? thrown.data : null,
                            status: player.status,
                            statuses: s.statuses,
                            errors: s.errors,
                        };
                    }),
                    P.equals<{ code: number | null; label: string | null; data: unknown; status: DosPlayerStatus; statuses: DosPlayerStatus[]; errors: ErrorSnapshot[] }>({
                        code: 5, label: "BUNDLE_LOAD_FAILED", data: 404, status: "idle", statuses: ["starting", "idle"],
                        errors: [{ isRuntimeError: true, code: 5, label: "BUNDLE_LOAD_FAILED" }],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "an adapter rejecting a plain Error rejects start() with ADAPTER_FAILED carrying that error as data",
            run: () => withHarness((url) => CTGBrowserTest.init("adapter plain error")
                .interact("construct with a rejecting adapter", async ({ page }) => { await page.evaluate(setup, { fetchMode: "ok", adapterMode: "rejectError" } as const); })
                .assertPage("ADAPTER_FAILED with the caught message in data",
                    (page) => page.evaluate(async () => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        let thrown: unknown;
                        try { await (s.player as DosPlayer).start(); } catch (e) { thrown = e; }
                        const data: unknown = DosRuntimeError.is(thrown) ? thrown.data : null;
                        return {
                            code: DosRuntimeError.is(thrown) ? thrown.code : null,
                            label: DosRuntimeError.is(thrown) ? thrown.label : null,
                            dataMessage: data instanceof Error ? data.message : null,
                            status: (s.player as DosPlayer).status,
                        };
                    }),
                    P.equals<{ code: number | null; label: string | null; dataMessage: string | null; status: DosPlayerStatus }>({ code: 4, label: "ADAPTER_FAILED", dataMessage: "library exploded", status: "idle" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "an adapter rejecting a DosRuntimeError rethrows it with the same code",
            run: () => withHarness((url) => CTGBrowserTest.init("adapter runtime error")
                .interact("construct with an adapter rejecting a runtime error", async ({ page }) => { await page.evaluate(setup, { fetchMode: "ok", adapterMode: "rejectRuntime" } as const); })
                .assertPage("same code and label",
                    (page) => page.evaluate(async (): Promise<ErrorSnapshot> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const player = (globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer;
                        try { await player.start(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>({ isRuntimeError: true, code: 5, label: "BUNDLE_LOAD_FAILED" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "pause() releases held keys before pausing the session, and resume() resumes it",
            run: () => withHarness((url) => CTGBrowserTest.init("pause releases")
                .interact("construct, start, hold two keys, pause, resume", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => {
                        const player = (globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer;
                        await player.start();
                        player.input.keyDown("ArrowUp");
                        player.input.keyDown("ControlLeft");
                        player.pause();
                    });
                })
                .assertPage("snapshot empty, session saw the key-ups then pause, status paused",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const player = s.player as DosPlayer;
                        const calls = (s.session as FakeEmulatorSession).calls.map((c) => [c.method, ...c.args]);
                        return { snapshot: player.input.snapshot, calls, status: player.status };
                    }),
                    P.equals<{ snapshot: DosInputSnapshot; calls: unknown[][]; status: DosPlayerStatus }>({
                        snapshot: { keysDown: [], mouseButtonsDown: [], joystickButtonsDown: [], joystickAxes: { x: 0, y: 0 } },
                        calls: [["sendKey", "ArrowUp", true], ["sendKey", "ControlLeft", true], ["sendKey", "ArrowUp", false], ["sendKey", "ControlLeft", false], ["pause"]],
                        status: "paused",
                    }))
                .assertPage("resume forwards and status returns to running",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const player = s.player as DosPlayer;
                        player.resume();
                        const last = (s.session as FakeEmulatorSession).calls.at(-1);
                        return { last: last?.method ?? null, status: player.status, statuses: s.statuses };
                    }),
                    P.equals<{ last: string | null; status: DosPlayerStatus; statuses: DosPlayerStatus[] }>({ last: "resume", status: "running", statuses: ["starting", "running", "paused", "running"] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "when the session exits, the player emits exit, releases input and returns to idle",
            run: () => withHarness((url) => CTGBrowserTest.init("session exit")
                .interact("construct, start, hold a key, emit exit", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        await (s.player as DosPlayer).start();
                        (s.player as DosPlayer).input.keyDown("Space");
                        (s.session as FakeEmulatorSession).emitExit();
                    });
                })
                .assertPage("exit event, key released, status idle",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const released = (s.session as FakeEmulatorSession).calls.some((c) => c.method === "sendKey" && c.args[0] === "Space" && c.args[1] === false);
                        return { exits: s.exits, released, status: (s.player as DosPlayer).status };
                    }),
                    P.equals<{ exits: number; released: boolean; status: DosPlayerStatus }>({ exits: 1, released: true, status: "idle" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "destroy() calls session.exit once, emits status destroyed, and a second destroy() does nothing",
            run: () => withHarness((url) => CTGBrowserTest.init("destroy")
                .interact("construct, start, destroy twice", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => {
                        const player = (globalThis as unknown as { __scratch: Scratch }).__scratch.player as DosPlayer;
                        await player.start();
                        await player.destroy();
                        await player.destroy();
                    });
                })
                .assertPage("one exit call, status destroyed",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const exitCalls = (s.session as FakeEmulatorSession).calls.filter((c) => c.method === "exit").length;
                        return { exitCalls, status: (s.player as DosPlayer).status, last: s.statuses.at(-1) ?? null };
                    }),
                    P.equals<{ exitCalls: number; status: DosPlayerStatus; last: DosPlayerStatus | null }>({ exitCalls: 1, status: "destroyed", last: "destroyed" }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a throwing status listener produces an error event with INTERNAL_ERROR and does not prevent the next listener",
            run: () => withHarness((url) => CTGBrowserTest.init("listener throws")
                .interact("construct, add a throwing listener then a recording one, start", async ({ page }) => {
                    await page.evaluate(setup, { fetchMode: "ok", adapterMode: "resolve" } as const);
                    await page.evaluate(async () => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        const player = s.player as DosPlayer;
                        const seen: DosPlayerStatus[] = [];
                        (globalThis as unknown as { __seen: DosPlayerStatus[] }).__seen = seen;
                        player.on("status", () => { throw new Error("listener broke"); });
                        player.on("status", (status: DosPlayerStatus) => { seen.push(status); });
                        await player.start();
                    });
                })
                .assertPage("later listener ran for both statuses; INTERNAL_ERROR emitted per throw",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        return { seen: (globalThis as unknown as { __seen: DosPlayerStatus[] }).__seen, errors: s.errors };
                    }),
                    P.equals<{ seen: DosPlayerStatus[]; errors: ErrorSnapshot[] }>({
                        seen: ["starting", "running"],
                        errors: [{ isRuntimeError: true, code: 3, label: "INTERNAL_ERROR" }, { isRuntimeError: true, code: 3, label: "INTERNAL_ERROR" }],
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "boot through DosPlayer.init with the js-dos adapter: status running, canvas backing size non-zero, keyPress Enter does not throw, destroy resolves to status destroyed",
            run: () => withHarness((url) => CTGBrowserTest.init("real boot")
                .interact("boot", async ({ page }) => {
                    await page.evaluate(async () => { (globalThis as unknown as { __boot: DosPlayerStatus }).__boot = await window.harness.boot(); });
                    await page.waitForFunction(() => (document.querySelector("#canvas") as HTMLCanvasElement).width > 0, null, { timeout: 30000 });
                })
                .assertPage("running with frames drawn and input accepted",
                    (page) => page.evaluate(async () => {
                        const player = window.harness.player as DosPlayer;
                        const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
                        let keyThrew = false;
                        try { player.input.keyPress("Enter"); } catch { keyThrew = true; }
                        const persisted = await player.persist();
                        const result = { boot: (globalThis as unknown as { __boot: DosPlayerStatus }).__boot, status: player.status, width: canvas.width, height: canvas.height, keyThrew, persisted: persisted === null ? "null" : "bytes" };
                        await player.destroy();
                        return { ...result, after: player.status };
                    }),
                    P.satisfies<{ boot: DosPlayerStatus; status: DosPlayerStatus; width: number; height: number; keyThrew: boolean; persisted: string; after: DosPlayerStatus }>((v) =>
                        v.boot === "running" && v.status === "running" && v.width > 0 && v.height > 0 && !v.keyThrew && v.persisted === "null" && v.after === "destroyed"))
                .start(url, { timeout: BOOT_TIMEOUT }))
        },
        {
            label: "the harness page imports nothing from emulators itself; the js-dos assets are fetched by the adapter during boot",
            run: () => withHarness((url) => CTGBrowserTest.init("adapter fetches emulators")
                .assertPage("no /emulators/ resource before boot",
                    (page) => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/emulators/")).length),
                    P.equals<number>(0))
                .interact("boot", async ({ page }) => {
                    await page.evaluate(async () => { await window.harness.boot(); });
                })
                .assertPage("at least one /emulators/ resource after boot",
                    (page) => page.evaluate(async () => {
                        const count = performance.getEntriesByType("resource").filter((e) => e.name.includes("/emulators/")).length;
                        await (window.harness.player as DosPlayer).destroy();
                        return count;
                    }),
                    P.greaterThan<number>(0))
                .start(url, { timeout: BOOT_TIMEOUT }))
        },
    ]
};

export default testFile;
