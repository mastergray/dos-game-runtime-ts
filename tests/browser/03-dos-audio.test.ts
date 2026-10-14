// realizes: docs/headless-browser-dos-runtime-spec.md > §7 DosAudio (§7.3)

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { AudioContextLike, DosAudio } from "../../src/index.ts";         // Wrapper contract built in-page; instance kept in-page
import type FakeEmulatorSession from "../support/FakeEmulatorSession.ts";     // Session double kept in-page

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {audio:dosAudio?, session:fakeEmulatorSession?, context:audioContextLike?, resumeCalls:NUMBER, unsubscribe:(VOID -> VOID)?}
// Scratch state kept on globalThis between page.evaluate steps of one case.
interface Scratch {
    audio?: DosAudio;                                              // The audio under test
    session?: FakeEmulatorSession;                                 // The fake session feeding it
    context?: AudioContextLike;                                    // The context handed to it (real, or the gating wrapper)
    resumeCalls: number;                                           // Times the wrapper's resume was called
    unsubscribe?: () => void;                                      // Returned by armGestureUnlock
}

// INTERFACE :: {gate:BOOLEAN, rejectResume:BOOLEAN}
// How setup builds the context: a real AudioContext, or the gating wrapper, optionally with a rejecting resume.
interface SetupOptions {
    gate: boolean;                                                 // true: wrapper reporting "suspended" until its own resume is called
    rejectResume: boolean;                                         // true: the wrapper's resume rejects instead of unlocking
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Default per-step timeout for audio cases
const REAL: SetupOptions = { gate: false, rejectResume: false };   // Playback cases: a real, running context
const GATED: SetupOptions = { gate: true, rejectResume: false };   // Unlock cases: locked until a gesture
const REJECTING: SetupOptions = { gate: true, rejectResume: true };   // Failure case: resume refuses

/**
 *
 * Functions
 *
 */

// HELPER :: setupOptions -> VOID
// In-page setup: constructs a DosAudio on #container over a real AudioContext, or over a gating wrapper that forwards to one
// but reports "suspended" until its own resume() has been called, counting resume calls and optionally rejecting them.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const setup = (options: SetupOptions): void => {
    const { DosAudio } = window.harness.runtime;
    const real = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
    const scratch: Scratch = { resumeCalls: 0 };
    (globalThis as unknown as { __scratch: Scratch }).__scratch = scratch;
    let unlocked = false;
    const wrapper: AudioContextLike = {
        get state() { return unlocked ? real.state : "suspended"; },
        get sampleRate() { return real.sampleRate; },
        get currentTime() { return real.currentTime; },
        get destination() { return real.destination; },
        resume: () => {
            scratch.resumeCalls++;
            if (options.rejectResume) return Promise.reject(new Error("resume refused"));
            unlocked = true;
            return real.resume();
        },
        close: () => real.close(),
        createBuffer: (channels, length, sampleRate) => real.createBuffer(channels, length, sampleRate),
        createBufferSource: () => real.createBufferSource(),
        createGain: () => real.createGain(),
    };
    scratch.context = options.gate ? wrapper : real;
    scratch.session = new window.harness.doubles.FakeEmulatorSession();
    scratch.audio = new DosAudio({ session: scratch.session, gestureSource: document.querySelector("#container") as HTMLElement, audioContext: scratch.context });
};

const testFile: TestFile = {
    label: "DosAudio",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "on a real context, emitting 44100 samples at once leaves queuedMs at most 200 and droppedSamples at least 35280",
            run: () => withHarness((url) => CTGBrowserTest.init("latency cap")
                .interact("construct on a real context and emit one second of samples", async ({ page }) => {
                    await page.evaluate(setup, REAL);
                    await page.evaluate(() => {
                        const scratch = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        (scratch.session as FakeEmulatorSession).emitSound(new Float32Array(44100));
                    });
                })
                .assertPage("capped queue and dropped count",
                    (page) => page.evaluate(() => {
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        return { queuedMs: audio.queuedMs, droppedSamples: audio.droppedSamples };
                    }),
                    P.satisfies<{ queuedMs: number; droppedSamples: number }>((v) => v.queuedMs <= 200 && v.droppedSamples >= 35280))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "on a running real context, 4410 emitted samples drain so that within one second queuedMs is below MIN_CHUNK_MS",
            run: () => withHarness((url) => CTGBrowserTest.init("drain on running context")
                .interact("construct on a real context, emit 4410 samples, wait a second", async ({ page }) => {
                    await page.evaluate(setup, REAL);
                    await page.evaluate(() => {
                        const scratch = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        (scratch.session as FakeEmulatorSession).emitSound(new Float32Array(4410));
                    });
                    await page.waitForTimeout(1000);
                })
                .assertPage("unlocked and drained",
                    (page) => page.evaluate(() => {
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        return { isUnlocked: audio.isUnlocked, drained: audio.queuedMs < window.harness.runtime.DosAudio.MIN_CHUNK_MS, sampleRate: audio.sampleRate };
                    }),
                    P.equals<{ isUnlocked: boolean; drained: boolean; sampleRate: number }>({ isUnlocked: true, drained: true, sampleRate: 44100 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "destroy closes a real context",
            run: () => withHarness((url) => CTGBrowserTest.init("destroy closes")
                .interact("construct on a real context", async ({ page }) => { await page.evaluate(setup, REAL); })
                .assertPage("state is closed after destroy",
                    (page) => page.evaluate(async () => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        (s.audio as DosAudio).destroy();
                        await new Promise((r) => setTimeout(r, 200));
                        return (s.context as AudioContextLike).state;
                    }),
                    P.equals<string>("closed"))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "on a gated context, before any gesture isUnlocked is false and 4410 emitted samples read back as queuedMs 100",
            run: () => withHarness((url) => CTGBrowserTest.init("queue before unlock")
                .interact("construct gated and emit 4410 samples", async ({ page }) => {
                    await page.evaluate(setup, GATED);
                    await page.evaluate(() => {
                        const scratch = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        (scratch.session as FakeEmulatorSession).emitSound(new Float32Array(4410));
                    });
                })
                .assertPage("locked with 100 ms queued",
                    (page) => page.evaluate(() => {
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        return { isUnlocked: audio.isUnlocked, queuedMs: audio.queuedMs };
                    }),
                    P.equals<{ isUnlocked: boolean; queuedMs: number }>({ isUnlocked: false, queuedMs: 100 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a click on the gesture source after armGestureUnlock makes isUnlocked true and drains the queue below MIN_CHUNK_MS within a second",
            run: () => withHarness((url) => CTGBrowserTest.init("gesture unlock")
                .interact("construct gated, queue samples, arm, click", async ({ page }) => {
                    await page.evaluate(setup, GATED);
                    await page.evaluate(() => {
                        const scratch = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        (scratch.session as FakeEmulatorSession).emitSound(new Float32Array(4410));
                        scratch.unsubscribe = (scratch.audio as DosAudio).armGestureUnlock();
                    });
                    await page.mouse.click(320, 240);
                    await page.waitForFunction(() => ((globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio).isUnlocked, null, { timeout: 5000 });
                    await page.waitForTimeout(1000);
                })
                .assertPage("unlocked and drained",
                    (page) => page.evaluate(() => {
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        return { isUnlocked: audio.isUnlocked, drained: audio.queuedMs < window.harness.runtime.DosAudio.MIN_CHUNK_MS };
                    }),
                    P.equals<{ isUnlocked: boolean; drained: boolean }>({ isUnlocked: true, drained: true }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a second click does not call resume again",
            run: () => withHarness((url) => CTGBrowserTest.init("resume once")
                .interact("construct gated, arm, click twice", async ({ page }) => {
                    await page.evaluate(setup, GATED);
                    await page.evaluate(() => { const s = (globalThis as unknown as { __scratch: Scratch }).__scratch; s.unsubscribe = (s.audio as DosAudio).armGestureUnlock(); });
                    await page.mouse.click(320, 240);
                    await page.waitForFunction(() => ((globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio).isUnlocked, null, { timeout: 5000 });
                    await page.mouse.click(320, 240);
                    await page.waitForTimeout(200);
                })
                .assertPage("resume was called once",
                    (page) => page.evaluate(() => (globalThis as unknown as { __scratch: Scratch }).__scratch.resumeCalls),
                    P.equals<number>(1))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "the Unsubscribe from armGestureUnlock stops a later click from unlocking",
            run: () => withHarness((url) => CTGBrowserTest.init("disarm")
                .interact("construct gated, arm, disarm, click", async ({ page }) => {
                    await page.evaluate(setup, GATED);
                    await page.evaluate(() => { const s = (globalThis as unknown as { __scratch: Scratch }).__scratch; (s.audio as DosAudio).armGestureUnlock()(); });
                    await page.mouse.click(320, 240);
                    await page.waitForTimeout(300);
                })
                .assertPage("still locked and resume never called",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        return { isUnlocked: (s.audio as DosAudio).isUnlocked, resumeCalls: s.resumeCalls };
                    }),
                    P.equals<{ isUnlocked: boolean; resumeCalls: number }>({ isUnlocked: false, resumeCalls: 0 }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "mute then unmute while locked leaves queuedMs unchanged",
            run: () => withHarness((url) => CTGBrowserTest.init("mute unmute")
                .interact("construct gated and queue samples", async ({ page }) => {
                    await page.evaluate(setup, GATED);
                    await page.evaluate(() => { (((globalThis as unknown as { __scratch: Scratch }).__scratch).session as FakeEmulatorSession).emitSound(new Float32Array(4410)); });
                })
                .assertPage("queued before, during and after mute",
                    (page) => page.evaluate(() => {
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        const before = audio.queuedMs;
                        audio.mute();
                        const muted = { queuedMs: audio.queuedMs, isMuted: audio.isMuted };
                        audio.unmute();
                        return { before, muted, after: { queuedMs: audio.queuedMs, isMuted: audio.isMuted } };
                    }),
                    P.equals<{ before: number; muted: { queuedMs: number; isMuted: boolean }; after: { queuedMs: number; isMuted: boolean } }>({
                        before: 100, muted: { queuedMs: 100, isMuted: true }, after: { queuedMs: 100, isMuted: false },
                    }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "a wrapper whose resume rejects gives AUDIO_FAILED from unlock and leaves the gesture listener armed",
            run: () => withHarness((url) => CTGBrowserTest.init("resume rejects")
                .interact("construct with a rejecting wrapper and arm", async ({ page }) => {
                    await page.evaluate(setup, REJECTING);
                    await page.evaluate(() => { const s = (globalThis as unknown as { __scratch: Scratch }).__scratch; s.unsubscribe = (s.audio as DosAudio).armGestureUnlock(); });
                })
                .assertPage("unlock() rejects with AUDIO_FAILED",
                    (page) => page.evaluate(async (): Promise<ErrorSnapshot> => {
                        const { DosRuntimeError } = window.harness.runtime;
                        const audio = (globalThis as unknown as { __scratch: Scratch }).__scratch.audio as DosAudio;
                        try { await audio.unlock(); return { isRuntimeError: false, code: null, label: null }; } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        }
                    }),
                    P.equals<ErrorSnapshot>({ isRuntimeError: true, code: 11, label: "AUDIO_FAILED" }))
                .interact("click twice; each attempt calls the rejecting resume", async ({ page }) => {
                    await page.mouse.click(320, 240);
                    await page.waitForTimeout(200);
                    await page.mouse.click(320, 240);
                    await page.waitForTimeout(200);
                })
                .assertPage("listener stayed armed: three resume calls in total, still locked",
                    (page) => page.evaluate(() => {
                        const s = (globalThis as unknown as { __scratch: Scratch }).__scratch;
                        return { resumeCalls: s.resumeCalls, isUnlocked: (s.audio as DosAudio).isUnlocked };
                    }),
                    P.equals<{ resumeCalls: number; isUnlocked: boolean }>({ resumeCalls: 3, isUnlocked: false }))
                .start(url, { timeout: TIMEOUT }))
        },
    ]
};

export default testFile;
