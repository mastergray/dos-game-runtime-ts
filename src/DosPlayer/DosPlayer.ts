// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";              // Typed errors for every rejection and failure
import DosDisplay from "../DosDisplay/DosDisplay.js";                             // Canvas layout and frame drawing
import DosInput from "../DosInput/DosInput.js";                                   // Input API exposed to the deployment
import DosAudio from "../DosAudio/DosAudio.js";                                   // Sample playback and gesture unlock
import JsDosEmulatorAdapter from "../JsDosEmulatorAdapter/JsDosEmulatorAdapter.js";   // Default adapter chosen by init()

// Type dependencies:
import type { EmulatorAdapter, EmulatorSession, Listener, Unsubscribe } from "../shared.types.js";   // Boundary contracts and subscription types
import type { DosDisplayConfig } from "../DosDisplay/types.js";                  // Built from the game's display options
import type { GestureSourceLike } from "../DosAudio/types.js";                    // Where the audio unlock listens
import {
    isDosPlayerConfig,                                             // Guards the construction config
    type DosGameConfig,                                            // Game description kept for restarts
    type DosPlayerConfig,                                          // Construction config shape
    type DosPlayerEvents,                                          // Event name to payload map
    type DosPlayerStatus,                                          // Lifecycle state literal
    type FetchLike,                                                // Bundle loader
} from "./types.js";

/**
 *
 * Class
 *
 */

// Application-facing composition root: owns the lifecycle and delegates display, audio and input to their classes
export default class DosPlayer {

    /* Instance Fields */
    private readonly _canvas: HTMLCanvasElement;                   // Canvas the emulator draws into
    private readonly _container: HTMLElement;                      // Element the canvas fits inside
    private readonly _game: DosGameConfig;                         // Bundle, overlay and display options
    private readonly _adapter: EmulatorAdapter;                    // Emulator backend
    private readonly _fetch: FetchLike;                            // Loader for a bundle URL
    private readonly _gestureSource: GestureSourceLike;            // Where the audio unlock listens
    private readonly _display: DosDisplay;                         // Constructed at once; attached per session
    private readonly _listeners = new Map<keyof DosPlayerEvents, Set<Listener<never>>>();   // Subscribers by event
    private _status: DosPlayerStatus = "idle";                     // Current lifecycle state
    private _bundleBytes: Uint8Array | null = null;                // Resolved bundle, kept so a restart does not fetch again
    private _session: EmulatorSession | null = null;               // Running session, or null
    private _input: DosInput | null = null;                        // Input over the running session, or null
    private _audio: DosAudio | null = null;                        // Audio over the running session, or null
    private _detachDisplay: Unsubscribe | null = null;             // Removes the display's frame subscription
    private _unsubscribeExit: Unsubscribe | null = null;           // Removes the session's exit subscription

    // CONSTRUCTOR :: DosPlayerConfig -> this
    // Validates the config and constructs the display; input and audio wait for a session
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosPlayerConfig()
    constructor(config: DosPlayerConfig) {
        if (!isDosPlayerConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "DosPlayer config must hold a canvas, a container, a game and an adapter.", data: config });
        }
        this._canvas = config.canvas;
        this._container = config.container;
        this._game = config.game;
        this._adapter = config.adapter;
        this._fetch = config.fetch ?? ((url: string) => globalThis.fetch(url));
        this._gestureSource = config.gestureSource ?? config.container;
        const displayConfig: { -readonly [K in keyof DosDisplayConfig]: DosDisplayConfig[K] } = { canvas: this._canvas, container: this._container };
        if (this._game.display?.aspectRatio !== undefined) displayConfig.aspectRatio = this._game.display.aspectRatio;
        if (this._game.display?.scaling !== undefined) displayConfig.scaling = this._game.display.scaling;
        this._display = DosDisplay.init(displayConfig);
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> dosPlayerStatus
    // Current lifecycle state
    get status(): DosPlayerStatus {
        return this._status;
    }

    // GETTER :: VOID -> dosInput
    // Input API over the running session
    // NOTE: Throws DosRuntimeError NOT_STARTED before start() resolves and DESTROYED after destroy()
    get input(): DosInput {
        this.requireLive();
        if (this._input === null) throw this.notStarted("input");
        return this._input;
    }

    // GETTER :: VOID -> dosDisplay
    // The display, available from construction
    get display(): DosDisplay {
        return this._display;
    }

    // GETTER :: VOID -> dosAudio
    // Audio over the running session
    // NOTE: Throws DosRuntimeError NOT_STARTED before start() resolves and DESTROYED after destroy()
    get audio(): DosAudio {
        this.requireLive();
        if (this._audio === null) throw this.notStarted("audio");
        return this._audio;
    }

    // GETTER :: VOID -> dosGameConfig
    // The game config as given
    get game(): DosGameConfig {
        return this._game;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Loads the bundle, starts a session, wires input, audio and display, and moves to running
    // NOTE: Throws DosRuntimeError DESTROYED after destroy(), ALREADY_STARTED unless idle, BUNDLE_LOAD_FAILED when the URL cannot be fetched, ADAPTER_FAILED when the adapter rejects with a non-runtime error
    // NOTE: On failure the status returns to idle and the error event is emitted before the rejection
    async start(): Promise<void> {
        this.requireLive();
        if (this._status !== "idle") {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ALREADY_STARTED, message: `DosPlayer cannot start while ${this._status}.`, data: this._status });
        }
        this.setStatus("starting");
        try {
            const bundle = await this.resolveBundle();
            const startConfig: { bundle: Uint8Array; changes?: Uint8Array } = { bundle };
            if (this._game.changes !== undefined) startConfig.changes = this._game.changes;
            let session: EmulatorSession;
            try {
                session = await this._adapter.start(startConfig);
            } catch (error) {
                if (DosRuntimeError.is(error)) throw error;
                throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: "The emulator adapter failed to start a session.", data: error });
            }
            this._session = session;
            this._input = new DosInput({ session });
            this._audio = DosAudio.init({ session, gestureSource: this._gestureSource });
            this._detachDisplay = this._display.attach(session);
            this._audio.armGestureUnlock();
            this._unsubscribeExit = session.onExit(() => this.onSessionExit());
        } catch (error) {
            this.teardownSession();
            this.setStatus("idle");
            const runtimeError = DosRuntimeError.is(error)
                ? error
                : new DosRuntimeError({ code: DosRuntimeError.CODE.INTERNAL_ERROR, message: "DosPlayer start failed unexpectedly.", data: error });
            this.emit("error", runtimeError);
            throw runtimeError;
        }
        this.setStatus("running");
    }

    // INSTANCE :: VOID -> VOID
    // Releases every held input and pauses the session
    // NOTE: Throws DosRuntimeError NOT_STARTED before start() and DESTROYED after destroy(); a no-op while paused
    pause(): void {
        const session = this.requireSession("pause");
        if (this._status === "paused") return;
        this._input?.releaseAll();
        session.pause();
        this.setStatus("paused");
    }

    // INSTANCE :: VOID -> VOID
    // Resumes the session
    // NOTE: Throws DosRuntimeError NOT_STARTED before start() and DESTROYED after destroy(); a no-op while running
    resume(): void {
        const session = this.requireSession("resume");
        if (this._status === "running") return;
        session.resume();
        this.setStatus("running");
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Delegates to the display's fullscreen
    // NOTE: Throws DosRuntimeError DESTROYED after destroy(); otherwise whatever DosDisplay.fullscreen throws
    fullscreen(): Promise<void> {
        this.requireLive();
        return this._display.fullscreen();
    }

    // INSTANCE :: VOID -> PROMISE(Uint8Array?)
    // Resolves with the overlay of changed files, or null when nothing changed since start
    // NOTE: Throws DosRuntimeError NOT_STARTED before start() and DESTROYED after destroy()
    persist(): Promise<Uint8Array | null> {
        return this.requireSession("persist").persist();
    }

    // INSTANCE :: STRING, (T -> VOID) -> unsubscribe
    // Subscribes to a lifecycle event; returns the remover
    // NOTE: A listener that throws does not stop the others; the throw is re-emitted as an error event with INTERNAL_ERROR, or dropped when the listener was itself an error listener
    on<K extends keyof DosPlayerEvents>(event: K, listener: Listener<DosPlayerEvents[K]>): Unsubscribe {
        let set = this._listeners.get(event);
        if (set === undefined) {
            set = new Set();
            this._listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => { set.delete(listener as Listener<never>); };
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Stops everything: input released, display detached, audio closed, session exited, listeners cleared
    // NOTE: A DESTROYED rejection from an already exited session is ignored; calling destroy twice is a no-op
    async destroy(): Promise<void> {
        if (this._status === "destroyed") return;
        const session = this._session;
        this.teardownSession();
        if (session !== null) {
            try {
                await session.exit();
            } catch (error) {
                if (!(DosRuntimeError.is(error) && error.code === DosRuntimeError.CODE.DESTROYED)) throw error;
            }
        }
        this._display.destroy();
        this.setStatus("destroyed");
        this._listeners.clear();
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> PROMISE(Uint8Array)
    // Returns the kept bundle bytes, or fetches and keeps them when the game names a URL
    // NOTE: Throws DosRuntimeError BUNDLE_LOAD_FAILED with the status or caught value as data
    private async resolveBundle(): Promise<Uint8Array> {
        if (this._bundleBytes !== null) return this._bundleBytes;
        if (this._game.bundle instanceof Uint8Array) {
            this._bundleBytes = this._game.bundle;
            return this._bundleBytes;
        }
        let bytes: Uint8Array;
        try {
            const response = await this._fetch(this._game.bundle);
            if (!response.ok) {
                throw new DosRuntimeError({ code: DosRuntimeError.CODE.BUNDLE_LOAD_FAILED, message: `Bundle request for ${this._game.bundle} returned status ${response.status}.`, data: response.status });
            }
            bytes = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (DosRuntimeError.is(error)) throw error;
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.BUNDLE_LOAD_FAILED, message: `Bundle request for ${this._game.bundle} failed.`, data: error });
        }
        this._bundleBytes = bytes;
        return bytes;
    }

    // PRIVATE :: VOID -> VOID
    // Handles the session stopping on its own: emits exit, releases input, detaches the display, returns to idle
    private onSessionExit(): void {
        if (this._status === "destroyed") return;
        this.emit("exit", undefined);
        this.teardownSession();
        this.setStatus("idle");
    }

    // PRIVATE :: VOID -> VOID
    // Releases input, detaches the display, destroys audio and input, and forgets the session
    private teardownSession(): void {
        this._unsubscribeExit?.();
        this._unsubscribeExit = null;
        this._input?.destroy();
        this._input = null;
        this._detachDisplay?.();
        this._detachDisplay = null;
        this._audio?.destroy();
        this._audio = null;
        this._session = null;
    }

    // PRIVATE :: dosPlayerStatus -> VOID
    // Sets the status and emits it
    private setStatus(status: DosPlayerStatus): void {
        this._status = status;
        this.emit("status", status);
    }

    // PRIVATE :: STRING, UNKNOWN -> VOID
    // Delivers an event to every listener; a throwing listener is re-emitted as an error, or dropped for error listeners
    private emit<K extends keyof DosPlayerEvents>(event: K, payload: DosPlayerEvents[K]): void {
        const set = this._listeners.get(event);
        if (set === undefined) return;
        for (const listener of Array.from(set)) {
            try {
                (listener as Listener<DosPlayerEvents[K]>)(payload);
            } catch (error) {
                if (event === "error") continue;
                this.emit("error", new DosRuntimeError({ code: DosRuntimeError.CODE.INTERNAL_ERROR, message: `A ${event} listener threw.`, data: error }));
            }
        }
    }

    // PRIVATE :: VOID -> VOID
    // Throws DESTROYED once destroy() has run
    private requireLive(): void {
        if (this._status === "destroyed") {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "DosPlayer has been destroyed.", data: null });
        }
    }

    // PRIVATE :: STRING -> emulatorSession
    // Returns the running session or throws NOT_STARTED / DESTROYED
    private requireSession(operation: string): EmulatorSession {
        this.requireLive();
        if (this._session === null) throw this.notStarted(operation);
        return this._session;
    }

    // PRIVATE :: STRING -> dosRuntimeError
    // Builds the NOT_STARTED error for an operation
    private notStarted(operation: string): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.NOT_STARTED, message: `DosPlayer.${operation} needs a started session.`, data: operation });
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: {canvas, container, game, adapter?, fetch?, gestureSource?} -> PROMISE(dosPlayer)
    // Defaults the adapter to js-dos serving from /emulators/, fetch to globalThis.fetch and gestureSource to the container, then constructs
    static async init(config: Omit<DosPlayerConfig, "adapter"> & { adapter?: EmulatorAdapter }): Promise<DosPlayer> {
        const adapter = config.adapter ?? await JsDosEmulatorAdapter.init({ pathPrefix: "/emulators/" });
        const resolved: { -readonly [K in keyof DosPlayerConfig]: DosPlayerConfig[K] } = {
            canvas: config.canvas,
            container: config.container,
            game: config.game,
            adapter,
            fetch: config.fetch ?? ((url: string) => globalThis.fetch(url)),
            gestureSource: config.gestureSource ?? config.container,
        };
        return new DosPlayer(resolved);
    }
}
