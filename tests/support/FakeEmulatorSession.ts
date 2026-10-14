// Type dependencies:
import type {
    EmulatorSession,                                               // Contract this double implements
    FrameEvent,                                                    // Frames emitted to onFrame listeners
    JoystickAxis,                                                  // Axis argument of sendJoystickAxis
    JoystickButton,                                                // Button argument of sendJoystickButton
    KeyCode,                                                       // Key argument of sendKey
    Listener,                                                      // Listener shape for the on* subscriptions
    MouseButton,                                                   // Button argument of sendMouseButton
    Unsubscribe,                                                   // Returned by the on* subscriptions
} from "../../src/index.ts";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {method:STRING, args:[UNKNOWN]}
// One recorded call to the session.
export interface FakeSessionCall {
    readonly method: string;                                       // Session method name
    readonly args: ReadonlyArray<unknown>;                         // Arguments as given
}

// TYPE :: "resolve" | "reject" | "throw"
// How a scripted method behaves when called.
export type FakeSessionMode = "resolve" | "reject" | "throw";

/**
 *
 * Class
 *
 */

// Double of the EmulatorSession contract: records every call, plays back scripted outcomes, and emits frames, sound and exit on demand.
export default class FakeEmulatorSession implements EmulatorSession {

    /* Instance Fields */
    readonly soundFrequency: number = 44100;                                   // Matches the probed js-dos rate
    readonly calls: FakeSessionCall[] = [];                                    // Every call, in order
    private readonly _scripts = new Map<string, { mode: FakeSessionMode; value: unknown }>();   // Scripted outcomes by method
    private readonly _frameListeners = new Set<Listener<FrameEvent>>();        // onFrame subscribers
    private readonly _soundListeners = new Set<Listener<Float32Array>>();      // onSound subscribers
    private readonly _exitListeners = new Set<Listener<void>>();               // onExit subscribers

    // CONSTRUCTOR :: VOID -> this
    // Creates a session with no scripts and no listeners
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: STRING, fakeSessionMode, UNKNOWN? -> this
    // Scripts what a method does when called: resolve (return value), reject (return a rejected promise) or throw
    script(method: string, mode: FakeSessionMode, value?: unknown): this {
        this._scripts.set(method, { mode, value });
        return this;
    }

    // INSTANCE :: frameEvent -> VOID
    // Delivers a frame to every onFrame listener
    emitFrame(frame: FrameEvent): void {
        for (const listener of this._frameListeners) listener(frame);
    }

    // INSTANCE :: Float32Array -> VOID
    // Delivers samples to every onSound listener
    emitSound(samples: Float32Array): void {
        for (const listener of this._soundListeners) listener(samples);
    }

    // INSTANCE :: VOID -> VOID
    // Fires every onExit listener
    emitExit(): void {
        for (const listener of this._exitListeners) listener(undefined);
    }

    // INSTANCE :: keyCode, BOOLEAN -> VOID
    // Records the call
    sendKey(code: KeyCode, pressed: boolean): void {
        this.apply("sendKey", [code, pressed]);
    }

    // INSTANCE :: NUMBER, NUMBER -> VOID
    // Records the call
    sendMouseMotion(dx: number, dy: number): void {
        this.apply("sendMouseMotion", [dx, dy]);
    }

    // INSTANCE :: NUMBER, NUMBER -> VOID
    // Records the call
    sendMousePosition(x: number, y: number): void {
        this.apply("sendMousePosition", [x, y]);
    }

    // INSTANCE :: mouseButton, BOOLEAN -> VOID
    // Records the call
    sendMouseButton(button: MouseButton, pressed: boolean): void {
        this.apply("sendMouseButton", [button, pressed]);
    }

    // INSTANCE :: joystickButton, BOOLEAN -> VOID
    // Records the call
    sendJoystickButton(button: JoystickButton, pressed: boolean): void {
        this.apply("sendJoystickButton", [button, pressed]);
    }

    // INSTANCE :: joystickAxis, NUMBER -> VOID
    // Records the call
    sendJoystickAxis(axis: JoystickAxis, value: number): void {
        this.apply("sendJoystickAxis", [axis, value]);
    }

    // INSTANCE :: VOID -> VOID
    // Records the call
    pause(): void {
        this.apply("pause", []);
    }

    // INSTANCE :: VOID -> VOID
    // Records the call
    resume(): void {
        this.apply("resume", []);
    }

    // INSTANCE :: VOID -> PROMISE(Uint8Array?)
    // Records the call; resolves with the scripted value, or null when unscripted
    persist(): Promise<Uint8Array | null> {
        return this.applyAsync("persist", [], null) as Promise<Uint8Array | null>;
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Records the call; resolves unless scripted otherwise
    exit(): Promise<void> {
        return this.applyAsync("exit", [], undefined) as Promise<void>;
    }

    // INSTANCE :: (frameEvent -> VOID) -> unsubscribe
    // Subscribes to emitFrame
    onFrame(listener: Listener<FrameEvent>): Unsubscribe {
        this._frameListeners.add(listener);
        return () => { this._frameListeners.delete(listener); };
    }

    // INSTANCE :: (Float32Array -> VOID) -> unsubscribe
    // Subscribes to emitSound
    onSound(listener: Listener<Float32Array>): Unsubscribe {
        this._soundListeners.add(listener);
        return () => { this._soundListeners.delete(listener); };
    }

    // INSTANCE :: (VOID -> VOID) -> unsubscribe
    // Subscribes to emitExit
    onExit(listener: Listener<void>): Unsubscribe {
        this._exitListeners.add(listener);
        return () => { this._exitListeners.delete(listener); };
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: STRING, [UNKNOWN] -> VOID
    // Records a synchronous call and throws when the method is scripted to throw
    private apply(method: string, args: ReadonlyArray<unknown>): void {
        this.calls.push({ method, args });
        const script = this._scripts.get(method);
        if (script !== undefined && script.mode === "throw") throw script.value;
    }

    // PRIVATE :: STRING, [UNKNOWN], UNKNOWN -> PROMISE(UNKNOWN)
    // Records an asynchronous call and settles per its script, defaulting to resolve with fallback
    private applyAsync(method: string, args: ReadonlyArray<unknown>, fallback: unknown): Promise<unknown> {
        this.calls.push({ method, args });
        const script = this._scripts.get(method);
        if (script === undefined) return Promise.resolve(fallback);
        if (script.mode === "throw") throw script.value;
        if (script.mode === "reject") return Promise.reject(script.value);
        return Promise.resolve(script.value ?? fallback);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> fakeEmulatorSession
    // Mirrors the constructor
    static init(): FakeEmulatorSession {
        return new FakeEmulatorSession();
    }
}
