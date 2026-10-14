// Dependencies:
import * as runtime from "../../../src/index.ts";                  // The package under test, exposed whole to the page
import FakeEmulatorAdapter from "../../support/FakeEmulatorAdapter.ts";    // Adapter double constructible in-page
import FakeEmulatorSession from "../../support/FakeEmulatorSession.ts";    // Session double constructible in-page
import FakeTimer from "../../support/FakeTimer.ts";                        // Timer double for hold gestures
import FailingIndexedDB from "../../support/FailingIndexedDB.ts";          // In-memory IndexedDB double scriptable to fail

// Type dependencies:
import type { ControlsConfig, DosDeployment, DosPlayer, DosPlayerStatus, InputTarget } from "../../../src/index.ts";   // Deployment and player kept by boot(); config shapes

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {type:STRING, [STRING]:UNKNOWN}
// One recorded event from a mounted object: its event name plus the emitted detail's fields.
export interface RecordedEvent {
    readonly type: string;                                         // Event name passed to on()
    readonly [key: string]: unknown;                               // Detail fields, spread in; primitives under "value"
}

// INTERFACE :: {pointerId:NUMBER?, pointerType:STRING?, clientX:NUMBER?, clientY:NUMBER?, button:NUMBER?, buttons:NUMBER?, timeStamp:NUMBER?}
// Fields a test may set on a synthetic PointerEvent; the rest default to the element's center and a primary touch.
export interface PointerFields {
    readonly pointerId?: number;                                   // Defaults to 1
    readonly pointerType?: "mouse" | "touch" | "pen";              // Defaults to "touch"
    readonly clientX?: number;                                     // Defaults to the element's horizontal center
    readonly clientY?: number;                                     // Defaults to the element's vertical center
    readonly button?: number;                                      // Defaults to 0 on pointerdown/up, -1 otherwise
    readonly buttons?: number;                                     // Defaults to 1 while down, 0 otherwise
    readonly timeStamp?: number;                                   // Not settable on a real event; recorded on the harness for classes that read it
}

// INTERFACE :: the window.harness object
// Everything a browser test drives through page.evaluate.
export interface Harness {
    readonly runtime: typeof runtime;                              // Public surface of the package
    readonly doubles: {                                            // Doubles constructible in-page
        readonly FakeEmulatorAdapter: typeof FakeEmulatorAdapter;
        readonly FakeEmulatorSession: typeof FakeEmulatorSession;
        readonly FakeTimer: typeof FakeTimer;
        readonly FailingIndexedDB: typeof FailingIndexedDB;
    };
    mounted: unknown;                                              // The object mount() created, or null
    player: DosPlayer | null;                                      // The player boot() created, or null
    deployment: DosDeployment | null;                              // The deployment boot() created, or null
    lastSession: FakeEmulatorSession | null;                       // The fake session handed to the last mount()/construct
    mount(className: string, selector: string, config?: Record<string, unknown>, events?: ReadonlyArray<string>): void;
    pointer(selector: string, type: string, fields?: PointerFields): void;
    key(selector: string, type: "keydown" | "keyup", code: string, repeat?: boolean): void;
    events(): RecordedEvent[];
    session(): FakeEmulatorSession | null;
    boot(config?: { bundle?: string; changes?: Uint8Array }): Promise<DosPlayerStatus>;
    reset(): Promise<void>;
}

declare global {
    interface Window { harness: Harness; }                         // Exposed for page.evaluate in browser tests
}

/**
 *
 * Constants
 *
 */

const recorded: RecordedEvent[] = [];                              // Events captured from the mounted object
const EMULATORS_PATH_PREFIX = "/emulators/";                       // Where harness-server.ts serves js-dos assets

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> HTMLElement
// Finds an element by selector or throws
const elementFor = (selector: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`harness: no element matches ${selector}`);
    return element;
};

// HELPER :: STRING, UNKNOWN -> recordedEvent
// Flattens an emitted detail into a plain recorded event
const record = (type: string, detail: unknown): RecordedEvent =>
    typeof detail === "object" && detail !== null
        ? { type, ...(detail as Record<string, unknown>) }
        : { type, value: detail };

// HELPER :: UNKNOWN, [STRING] -> VOID
// Subscribes the recorder to each named event of an object exposing on(event, listener)
const subscribeAll = (target: unknown, events: ReadonlyArray<string>): void => {
    const on = (target as { on?: unknown }).on;
    if (typeof on !== "function") return;
    for (const event of events) {
        (on as (event: string, listener: (detail: unknown) => void) => unknown).call(target, event, (detail) => {
            recorded.push(record(event, detail));
        });
    }
};

/**
 *
 * Harness
 *
 */

const harness: Harness = {
    runtime,
    doubles: { FakeEmulatorAdapter, FakeEmulatorSession, FakeTimer, FailingIndexedDB },
    mounted: null,
    player: null,
    deployment: null,
    lastSession: null,

    // Constructs runtime[className] on the element with the given config, subscribing the recorder to the named events.
    // NOTE: A config value of the string "@session" is replaced with a fresh FakeEmulatorSession, and "@input" with a DosInput over one.
    mount(className, selector, config = {}, events = []) {
        const constructor = (runtime as unknown as Record<string, unknown>)[className];
        if (typeof constructor !== "function") throw new Error(`harness: runtime has no class ${className}`);
        const element = elementFor(selector);
        const resolved: Record<string, unknown> = { surface: element, target: element, ...config };
        for (const [key, value] of Object.entries(resolved)) {
            if (value === "@session") { this.lastSession = new FakeEmulatorSession(); resolved[key] = this.lastSession; }
            if (value === "@input") { this.lastSession = new FakeEmulatorSession(); resolved[key] = new runtime.DosInput({ session: this.lastSession }); }
        }
        const instance = new (constructor as new (config: Record<string, unknown>) => unknown)(resolved);
        subscribeAll(instance, events);
        const attach = (instance as { attach?: unknown }).attach;
        if (typeof attach === "function" && (attach as () => unknown).length === 0) (attach as () => void).call(instance);
        this.mounted = instance;
    },

    // Dispatches a real PointerEvent on the element, defaulting to a primary touch at the element's center.
    pointer(selector, type, fields = {}) {
        const element = elementFor(selector);
        const rect = element.getBoundingClientRect();
        const isDown = type === "pointerdown";
        const isUp = type === "pointerup" || type === "pointercancel" || type === "lostpointercapture";
        const event = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            isPrimary: true,
            pointerId: fields.pointerId ?? 1,
            pointerType: fields.pointerType ?? "touch",
            clientX: fields.clientX ?? rect.left + rect.width / 2,
            clientY: fields.clientY ?? rect.top + rect.height / 2,
            button: fields.button ?? (isDown || isUp ? 0 : -1),
            buttons: fields.buttons ?? (isUp ? 0 : 1),
        });
        if (fields.timeStamp !== undefined) Object.defineProperty(event, "timeStamp", { value: fields.timeStamp });
        element.dispatchEvent(event);
    },

    // Dispatches a real KeyboardEvent with the given code on the element.
    key(selector, type, code, repeat = false) {
        elementFor(selector).dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, code, key: code, repeat }));
    },

    // Returns a copy of the recorded events.
    events() {
        return recorded.slice();
    },

    // Returns the fake session the last mount() created.
    session() {
        return this.lastSession;
    },

    // Boots the harness as a deployment: the js-dos adapter, the harness bundle, and this page's controls, composed by DosDeployment.
    // NOTE: This is the harness acting as a game page. The package contains no mapping; every key code and surface below is this page's decision.
    async boot(config = {}) {
        // Worker mode needs a cross-origin-isolated page; a plain http LAN page is not one, so fall back to direct mode there.
        const adapter = await runtime.JsDosEmulatorAdapter.init({ pathPrefix: EMULATORS_PATH_PREFIX, mode: globalThis.crossOriginIsolated ? "worker" : "direct" });
        const canvas = elementFor("#canvas") as HTMLCanvasElement;
        const container = elementFor("#container");
        const game: { bundle: string; changes?: Uint8Array } = { bundle: config.bundle ?? "/test.jsdos" };
        if (config.changes !== undefined) game.changes = config.changes;
        // Saves persist per bundle: the storage key is the bundle path, and init() restores the stored overlay before boot.
        const storage = runtime.DosStorage.init({ key: `harness:${game.bundle}` });
        this.deployment = await runtime.DosDeployment.init({ canvas, container, game, adapter, storage, controls: harnessControls() });
        this.player = this.deployment.player;
        await this.deployment.start();
        return this.player.status;
    },

    // Destroys whatever is mounted or booted and clears the recorder.
    async reset() {
        const destroy = (this.mounted as { destroy?: unknown } | null)?.destroy;
        if (typeof destroy === "function") (destroy as () => void).call(this.mounted);
        this.mounted = null;
        if (this.deployment !== null) { await this.deployment.destroy(); this.deployment = null; this.player = null; }
        if (this.player !== null) { await this.player.destroy(); this.player = null; }
        this.lastSession = null;
        recorded.length = 0;
        elementFor("#extra").replaceChildren();
    },
};

window.harness = harness;

// tsx compiles test files with esbuild keepNames, which wraps arrow functions in a `__name(fn, "name")` helper call.
// Playwright serializes those functions by source into the page, where the helper does not exist, so the page defines it.
(globalThis as unknown as { __name: <T>(target: T, name: string) => T }).__name = (target) => target;

// Manual-play controls for `npm run harness`: the Boot click also supplies the user gesture that unlocks audio.
const statusLine = document.getElementById("status");
const showStatus = (text: string): void => { if (statusLine !== null) statusLine.textContent = text; };
// Diagnostic tap for manual play: wraps AudioContext so the status line can show how many buffers were scheduled and their peak amplitude.
const audioTap = { sources: 0, peak: 0, contextState: "none" as string, sampleRate: 0 };
{
    const RealAudioContext = window.AudioContext;
    const Tapped = function (this: AudioContext, options?: AudioContextOptions): AudioContext {
        const context = new RealAudioContext(options);
        audioTap.sampleRate = context.sampleRate;
        const realCreateBufferSource = context.createBufferSource.bind(context);
        context.createBufferSource = () => {
            const source = realCreateBufferSource();
            const realStart = source.start.bind(source);
            source.start = (when?: number, offset?: number, duration?: number) => {
                audioTap.sources++;
                const data = source.buffer?.getChannelData(0);
                if (data !== undefined) for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i] ?? 0); if (a > audioTap.peak) audioTap.peak = a; }
                audioTap.contextState = context.state;
                return realStart(when, offset, duration);
            };
            return source;
        };
        return context;
    } as unknown as typeof AudioContext;
    Tapped.prototype = RealAudioContext.prototype;
    window.AudioContext = Tapped;
}

const showPlayerStatus = (): void => {
    const player = harness.player;
    if (player === null) { showStatus("idle"); return; }
    const audio = player.status === "running" || player.status === "paused" ? player.audio : null;
    showStatus(`${player.status}${lastAutosave === "" ? "" : ` · ${lastAutosave}`}${audio === null ? "" : ` · audio ${audio.isUnlocked ? "unlocked" : "LOCKED (click the game)"} · queued ${Math.round(audio.queuedMs)} ms · dropped ${audio.droppedSamples} · buffers ${audioTap.sources} · peak ${audioTap.peak.toFixed(3)} · ctx ${audioTap.contextState}@${audioTap.sampleRate}`}`);
};
// HELPER :: VOID -> controlsConfig
// This page's controller composition, in the shape a real deployment would write: keyboard on, mouse on with touch-as-cursor,
// a D-pad mapped to the arrows, A to Enter, B to Escape, and a trackpad mapped to the mouse with tap = left and two-finger tap = right.
const harnessControls = (): ControlsConfig => {
    const key = (code: string): InputTarget => ({ kind: "key", code });
    return {
        keyboard: { enabled: true },
        mouse: { enabled: true, touch: "absolute", pointerLock: true },
        dpads: [{ surface: elementFor("#dpad"), diagonals: true, map: { up: key("ArrowUp"), down: key("ArrowDown"), left: key("ArrowLeft"), right: key("ArrowRight") } }],
        sticks: [{ surface: elementFor("#stick"), map: { mode: "keys", keys: { up: key("ArrowUp"), down: key("ArrowDown"), left: key("ArrowLeft"), right: key("ArrowRight") } } }],
        buttons: [{ surface: elementFor("#btn-a"), target: key("Enter") }, { surface: elementFor("#btn-b"), target: key("Escape") }],
        trackpads: [{ surface: elementFor("#trackpad"), sensitivity: 2, map: { move: "mouse", tap: { kind: "mouseButton", button: "left" }, twoFingerTap: { kind: "mouseButton", button: "right" } } }],
    };
};

// Boot always tears down a running deployment first: a DOS program returning to the prompt does not end the emulator,
// so a second boot without this would run two emulators drawing into one canvas.
let currentBundle = "/test.jsdos";
const bootAndShow = (bundle: string): void => {
    currentBundle = bundle;
    showStatus("booting…");
    // Drop focus from the clicked button, or the next Enter would activate it and boot again.
    (document.activeElement as HTMLElement | null)?.blur();
    harness.reset().then(() => harness.boot({ bundle })).then(
        async () => {
            harness.player?.on("status", showPlayerStatus);
            await harness.player?.audio.unlock().catch((error: unknown) => console.error("audio unlock", error));
            elementFor("#container").focus();
            showPlayerStatus();
            setInterval(showPlayerStatus, 1000);
        },
        (error: unknown) => { showStatus(`failed: ${String(error)}`); console.error(error); },
    );
};
document.getElementById("boot")?.addEventListener("click", () => bootAndShow("/test.jsdos"));
document.getElementById("boot-beep")?.addEventListener("click", () => bootAndShow("/beep.jsdos"));
document.getElementById("enter")?.addEventListener("click", () => { harness.player?.input.keyPress("Enter"); });
document.getElementById("stop")?.addEventListener("click", () => {
    harness.reset().then(() => showStatus("idle"), (error: unknown) => { showStatus(`stop failed: ${String(error)}`); console.error(error); });
});

// Saves: persist the game's changed files into IndexedDB under the bundle's key; the next boot of that bundle restores them.
// A deployment would do this automatically, so the harness does too: every few seconds, when the tab is hidden, and on unload.
// NOTE: This stores whatever the game has written; a game that only writes on its own save command must be told to save first.
let lastAutosave = "";
const autosave = async (reason: string): Promise<void> => {
    const deployment = harness.deployment;
    if (deployment === null || !deployment.isStarted) return;
    try {
        if (await deployment.save()) lastAutosave = `autosaved (${reason}) at ${new Date().toLocaleTimeString()}`;
    } catch (error: unknown) {
        console.error("autosave", error);
    }
};
setInterval(() => { autosave("interval").catch(() => undefined); }, 5000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autosave("hidden").catch(() => undefined); });
window.addEventListener("pagehide", () => { autosave("pagehide").catch(() => undefined); });
document.getElementById("save")?.addEventListener("click", () => {
    const deployment = harness.deployment;
    if (deployment === null) return;
    deployment.save().then(
        (saved) => showStatus(saved ? "saved: overlay stored, survives reload" : "nothing to save: no file changed since boot"),
        (error: unknown) => { showStatus(`save failed: ${String(error)}`); console.error(error); },
    );
});
// Clearing must also restart the game, or the running game's files would be autosaved straight back.
// Storage is independent of a running game, so clearing works while idle too (for the last chosen bundle, test.jsdos by default).
document.getElementById("clear-save")?.addEventListener("click", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const wasRunning = harness.deployment !== null;
    const storage = harness.deployment?.storage ?? runtime.DosStorage.init({ key: `harness:${currentBundle}` });
    harness.reset()
        .then(() => storage.clear())
        .then(() => {
            lastAutosave = "";
            if (wasRunning) { showStatus("saves cleared; restarting clean…"); bootAndShow(currentBundle); }
            else showStatus(`saves cleared for ${currentBundle}`);
        })
        .catch((error: unknown) => { showStatus(`clear failed: ${String(error)}`); console.error(error); });
});

// The mouse gate: a deployment turns the mouse off during intros so clicks do not queue in DOS, and on when the game reads it.
const mouseToggle = document.getElementById("mouse-toggle");
mouseToggle?.addEventListener("click", () => {
    const deployment = harness.deployment;
    if (deployment === null) return;
    deployment.mouseEnabled = !deployment.mouseEnabled;
    mouseToggle.textContent = deployment.mouseEnabled ? "Mouse: on" : "Mouse: off";
});

// Phone keyboard: each character typed into #type becomes one key press, so games that need a letter or digit are reachable without a physical keyboard.
const codeForChar = (char: string): string | null => {
    if (/^[a-z]$/i.test(char)) return `Key${char.toUpperCase()}`;
    if (/^[0-9]$/.test(char)) return `Digit${char}`;
    if (char === " ") return "Space";
    if (char === "\n") return "Enter";
    return null;
};
const typeBox = document.getElementById("type") as HTMLInputElement | null;
typeBox?.addEventListener("input", () => {
    const char = typeBox.value.slice(-1);
    typeBox.value = "";
    const code = codeForChar(char);
    if (code !== null && harness.player?.status === "running") harness.player.input.keyPress(code);
});
typeBox?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        if (harness.player?.status === "running") harness.player.input.keyPress(event.key === "Enter" ? "Enter" : event.key === "Escape" ? "Escape" : "Backspace");
    }
    event.stopPropagation();
});
typeBox?.addEventListener("keyup", (event) => event.stopPropagation());
// The primitives prevent the default on pointerdown, which also stops focus moving, so a touch on the controls or the game
// would leave the type box focused and the phone keyboard up; drop its focus explicitly instead.
for (const id of ["touch", "container"]) {
    document.getElementById(id)?.addEventListener("pointerdown", () => { if (document.activeElement === typeBox) typeBox?.blur(); }, { capture: true });
}
document.getElementById("touch-toggle")?.addEventListener("click", () => {
    document.getElementById("touch")?.classList.toggle("on");
});
document.getElementById("stick-toggle")?.addEventListener("click", () => {
    document.getElementById("touch")?.classList.toggle("stick");
});

// Play mode: the container fills the viewport with the controls overlaid, as a phone deployment would lay itself out.
const setPlay = (on: boolean): void => {
    document.body.classList.toggle("play", on);
    if (on) { document.getElementById("touch")?.classList.add("on"); elementFor("#container").focus(); }
};
document.getElementById("play-toggle")?.addEventListener("click", () => setPlay(!document.body.classList.contains("play")));
document.getElementById("play-exit")?.addEventListener("click", () => {
    if (document.fullscreenElement !== null) document.exitFullscreen().catch(() => undefined);
    setPlay(false);
});

// Fullscreen through the deployment: its target is the container, which holds the canvas and the controls.
document.getElementById("fullscreen")?.addEventListener("click", () => {
    const deployment = harness.deployment;
    if (deployment === null) { showStatus("boot a game first"); return; }
    setPlay(true);
    deployment.fullscreen().catch((error: unknown) => { showStatus(`fullscreen failed: ${String(error)}`); console.error(error); });
});
document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement === null && document.body.classList.contains("play")) { /* stay in play mode; Exit play leaves it */ } });
