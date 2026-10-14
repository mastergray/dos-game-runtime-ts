// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for rejected config, adapter failures and session misuse

// Type dependencies:
import {
    isEmulatorStartConfig,                                         // Guards the start() config
    isFiniteNumber,                                                // Guards mouse deltas and axis values
    isJoystickAxis,                                                // Guards the joystick axis argument
    isJoystickButton,                                              // Guards the joystick button argument
    isKeyCode,                                                     // Guards the key code argument
    isMouseButton,                                                 // Guards the mouse button argument
    type EmulatorAdapter,                                          // Contract this class implements
    type EmulatorSession,                                          // Contract the private session implements
    type EmulatorStartConfig,                                      // Bundle plus optional overlay
    type FrameEvent,                                               // Frames handed to onFrame listeners
    type JoystickAxis,                                             // Axis argument type
    type JoystickButton,                                           // Button argument type
    type KeyCode,                                                  // Key argument type
    type Listener,                                                 // Subscriber shape
    type MouseButton,                                              // Mouse button argument type
    type NonEmptyString,                                           // Type of the adapter identity and pathPrefix
    type Unsubscribe,                                              // Returned by the on* subscriptions
} from "../shared.types.js";
import {
    isJsDosEmulatorAdapterConfig,                                  // Runtime guard for the constructor config
    isJsDosEmulators,                                              // Narrows the dynamically imported package object
    type JsDosBackend,                                             // Backend literal
    type JsDosCommandInterface,                                    // The js-dos object the session wraps
    type JsDosEmulators,                                           // The js-dos package object
    type JsDosEmulatorAdapterConfig,                               // Construction config
    type JsDosMode,                                                // Mode literal
} from "./types.js";

/**
 *
 * Class
 *
 */

// EmulatorAdapter over the js-dos `emulators` package: the only class that touches that library
export default class JsDosEmulatorAdapter implements EmulatorAdapter {

    /* Static Fields */
    static readonly DEFAULT_BACKEND: JsDosBackend = "dosbox";      // Backend when the config omits one
    static readonly DEFAULT_MODE: JsDosMode = "worker";            // Mode when the config omits one
    static readonly KEY_MAP: Readonly<Record<KeyCode, number>> = { // DOM code -> GLFW-style code js-dos's sendKeyEvent takes
        KeyA: 65, KeyB: 66, KeyC: 67, KeyD: 68, KeyE: 69, KeyF: 70, KeyG: 71, KeyH: 72, KeyI: 73,
        KeyJ: 74, KeyK: 75, KeyL: 76, KeyM: 77, KeyN: 78, KeyO: 79, KeyP: 80, KeyQ: 81, KeyR: 82,
        KeyS: 83, KeyT: 84, KeyU: 85, KeyV: 86, KeyW: 87, KeyX: 88, KeyY: 89, KeyZ: 90,
        Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52,
        Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
        F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295,
        F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,
        Numpad0: 320, Numpad1: 321, Numpad2: 322, Numpad3: 323, Numpad4: 324,
        Numpad5: 325, Numpad6: 326, Numpad7: 327, Numpad8: 328, Numpad9: 329,
        NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332,
        NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335,
        Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
        ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
        PageUp: 266, PageDown: 267, Home: 268, End: 269,
        CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,
        Space: 32, Backquote: 96, Minus: 45, Equal: 61, Backslash: 92,
        BracketLeft: 91, BracketRight: 93, Semicolon: 59, Quote: 39,
        Period: 46, Comma: 44, Slash: 47,
        ShiftLeft: 340, ControlLeft: 341, AltLeft: 342,
        ShiftRight: 344, ControlRight: 345, AltRight: 346,
        IntlBackslash: 348,
    } as const satisfies Readonly<Record<string, number>>;
    static readonly MOUSE_BUTTON_MAP: Readonly<Record<MouseButton, number>> = {   // MouseButton -> DOSBox SDL button number
        left: 0,
        right: 1,
        middle: 2,
    } as const;

    /* Instance Fields */
    readonly type: NonEmptyString = "js-dos";                      // Adapter identity
    private readonly _emulators: JsDosEmulators;                   // The js-dos package object
    private readonly _pathPrefix: NonEmptyString;                  // Where js-dos fetches its runtime assets
    private readonly _backend: JsDosBackend;                       // Backend booted by start()
    private readonly _mode: JsDosMode;                             // Thread mode booted by start()

    // CONSTRUCTOR :: JsDosEmulatorAdapterConfig -> this
    // Creates an adapter over an injected emulators object
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isJsDosEmulatorAdapterConfig()
    constructor(config: JsDosEmulatorAdapterConfig) {
        if (!isJsDosEmulatorAdapterConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "JsDosEmulatorAdapter requires an emulators object, a non-empty pathPrefix, and optional backend/mode literals.", data: config });
        }
        this._emulators = config.emulators;
        this._pathPrefix = config.pathPrefix;
        this._backend = config.backend ?? JsDosEmulatorAdapter.DEFAULT_BACKEND;
        this._mode = config.mode ?? JsDosEmulatorAdapter.DEFAULT_MODE;
        this._emulators.pathPrefix = this._pathPrefix;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> jsDosBackend
    // Returns the backend start() boots
    get backend(): JsDosBackend {
        return this._backend;
    }

    // GETTER :: VOID -> jsDosMode
    // Returns the thread mode start() boots
    get mode(): JsDosMode {
        return this._mode;
    }

    // GETTER :: VOID -> nonEmptyString
    // Returns where js-dos fetches its runtime assets
    get pathPrefix(): NonEmptyString {
        return this._pathPrefix;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: EmulatorStartConfig -> PROMISE(emulatorSession)
    // Boots js-dos from copies of the bundle (and overlay) and wraps the command interface in a session
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isEmulatorStartConfig()
    // NOTE: Rejects with DosRuntimeError ADAPTER_FAILED, data the caught value, when js-dos throws or rejects
    // NOTE: Copies every byte array first: worker mode transfers and detaches the buffers it is given
    async start(config: EmulatorStartConfig): Promise<EmulatorSession> {
        if (!isEmulatorStartConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "start() requires a Uint8Array bundle and, optionally, a Uint8Array changes overlay.", data: config });
        }
        const init: Uint8Array[] = config.changes === undefined
            ? [config.bundle.slice()]
            : [config.bundle.slice(), config.changes.slice()];
        let ci: JsDosCommandInterface;
        try {
            ci = await this.entryPoint()(init, { audioWorklet: false });
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: `js-dos ${this._backend}/${this._mode} failed to start.`, data: error });
        }
        return new JsDosSession(ci);
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> (jsDosInitFs, jsDosBackendOptions -> PROMISE(jsDosCommandInterface))
    // Selects the js-dos start function for the configured backend and mode, bound to the emulators object
    private entryPoint(): JsDosEmulators["dosboxWorker"] {
        const emulators = this._emulators;
        if (this._backend === "dosbox") {
            return this._mode === "worker" ? emulators.dosboxWorker.bind(emulators) : emulators.dosboxDirect.bind(emulators);
        }
        return this._mode === "worker" ? emulators.dosboxXWorker.bind(emulators) : emulators.dosboxXDirect.bind(emulators);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: {pathPrefix:nonEmptyString, backend:jsDosBackend?, mode:jsDosMode?, emulators:jsDosEmulators?} -> PROMISE(jsDosEmulatorAdapter)
    // Imports the emulators package when none is given, fills defaults, and constructs
    // NOTE: Rejects with DosRuntimeError ADAPTER_FAILED when the package cannot be imported or does not expose an Emulators object
    // NOTE: The package exports the object as a named `emulators` export and also assigns window.emulators; both are tried
    static async init(config: Omit<JsDosEmulatorAdapterConfig, "emulators"> & { emulators?: JsDosEmulators }): Promise<JsDosEmulatorAdapter> {
        const emulators = config.emulators ?? await JsDosEmulatorAdapter.importEmulators();
        return new JsDosEmulatorAdapter({
            emulators,
            pathPrefix: config.pathPrefix,
            backend: config.backend ?? JsDosEmulatorAdapter.DEFAULT_BACKEND,
            mode: config.mode ?? JsDosEmulatorAdapter.DEFAULT_MODE,
        });
    }

    // STATIC :: VOID -> PROMISE(jsDosEmulators)
    // Loads the emulators package and returns its Emulators object
    // NOTE: Rejects with DosRuntimeError ADAPTER_FAILED when the import fails or nothing satisfies isJsDosEmulators()
    private static async importEmulators(): Promise<JsDosEmulators> {
        let loaded: unknown;
        try {
            loaded = await import("emulators");
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: "The emulators package could not be imported.", data: error });
        }
        const record = typeof loaded === "object" && loaded !== null ? (loaded as Record<string, unknown>) : {};
        const candidates: unknown[] = [record["emulators"], record["default"], (globalThis as { emulators?: unknown }).emulators];
        const found = candidates.find(isJsDosEmulators);
        if (found === undefined) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: "The emulators package did not expose an Emulators object.", data: loaded });
        }
        return found;
    }
}

/**
 *
 * Session
 *
 */

// EmulatorSession over one js-dos CommandInterface: validates arguments, maps keys and buttons, converts frames, fans out events, and refuses everything after exit
class JsDosSession implements EmulatorSession {

    /* Instance Fields */
    readonly soundFrequency: number;                                           // Sample rate reported by js-dos at start
    private readonly _ci: JsDosCommandInterface;                               // The wrapped command interface
    private readonly _frameListeners = new Set<Listener<FrameEvent>>();        // onFrame subscribers
    private readonly _soundListeners = new Set<Listener<Float32Array>>();      // onSound subscribers
    private readonly _exitListeners = new Set<Listener<void>>();               // onExit subscribers
    private _width = 0;                                                        // Latest width from onFrameSize
    private _height = 0;                                                       // Latest height from onFrameSize
    private _rgba: Uint8ClampedArray = new Uint8ClampedArray(0);               // Reused conversion buffer, width × height × 4
    private _exited = false;                                                   // Set once exit() resolves or onExit fires

    // CONSTRUCTOR :: jsDosCommandInterface -> this
    // Wraps a started command interface and installs the single library listeners that fan out
    constructor(ci: JsDosCommandInterface) {
        this._ci = ci;
        this.soundFrequency = ci.soundFrequency();
        const events = ci.events();
        events.onFrameSize((width, height) => { this._width = width; this._height = height; });
        events.onFrame((rgb, rgba) => { this.deliverFrame(rgb, rgba); });
        events.onSoundPush((samples) => { for (const listener of this._soundListeners) listener(samples); });
        events.onExit(() => { this.markExited(); });
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: keyCode, BOOLEAN -> VOID
    // Presses or releases a key through KEY_MAP
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when code is not a KeyCode or pressed is not a boolean
    // NOTE: Throws DosRuntimeError UNSUPPORTED_KEY, data the code, when KEY_MAP has no entry for it
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendKey(code: KeyCode, pressed: boolean): void {
        this.assertLive();
        if (!isKeyCode(code)) throw JsDosSession.invalid("sendKey requires a KeyCode string.", code);
        if (typeof pressed !== "boolean") throw JsDosSession.invalid("sendKey requires a boolean pressed flag.", pressed);
        const mapped = JsDosEmulatorAdapter.KEY_MAP[code];
        if (mapped === undefined) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED_KEY, message: `The js-dos adapter has no key mapping for "${code}".`, data: code });
        }
        this._ci.sendKeyEvent(mapped, pressed);
    }

    // INSTANCE :: finiteNumber, finiteNumber -> VOID
    // Sends relative mouse motion
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when either delta is not a finite number
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendMouseMotion(dx: number, dy: number): void {
        this.assertLive();
        if (!isFiniteNumber(dx)) throw JsDosSession.invalid("sendMouseMotion requires a finite dx.", dx);
        if (!isFiniteNumber(dy)) throw JsDosSession.invalid("sendMouseMotion requires a finite dy.", dy);
        this._ci.sendMouseRelativeMotion(dx, dy);
    }

    // INSTANCE :: finiteNumber, finiteNumber -> VOID
    // Sends an absolute cursor position normalized 0..1, through js-dos's absolute sendMouseMotion
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when either coordinate is not a finite number in 0..1
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendMousePosition(x: number, y: number): void {
        this.assertLive();
        if (!isFiniteNumber(x) || x < 0 || x > 1) throw JsDosSession.invalid("sendMousePosition requires x in 0..1.", x);
        if (!isFiniteNumber(y) || y < 0 || y > 1) throw JsDosSession.invalid("sendMousePosition requires y in 0..1.", y);
        this._ci.sendMouseMotion(x, y);
    }

    // INSTANCE :: mouseButton, BOOLEAN -> VOID
    // Presses or releases a mouse button through MOUSE_BUTTON_MAP
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when button is not a MouseButton or pressed is not a boolean
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendMouseButton(button: MouseButton, pressed: boolean): void {
        this.assertLive();
        if (!isMouseButton(button)) throw JsDosSession.invalid("sendMouseButton requires a MouseButton literal.", button);
        if (typeof pressed !== "boolean") throw JsDosSession.invalid("sendMouseButton requires a boolean pressed flag.", pressed);
        this._ci.sendMouseButton(JsDosEmulatorAdapter.MOUSE_BUTTON_MAP[button], pressed);
    }

    // INSTANCE :: joystickButton, BOOLEAN -> VOID
    // Always refuses: emulators@8.4.2 has no joystick input
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when the arguments are not a JoystickButton and a boolean
    // NOTE: Throws DosRuntimeError UNSUPPORTED otherwise
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendJoystickButton(button: JoystickButton, pressed: boolean): void {
        this.assertLive();
        if (!isJoystickButton(button)) throw JsDosSession.invalid("sendJoystickButton requires a JoystickButton literal.", button);
        if (typeof pressed !== "boolean") throw JsDosSession.invalid("sendJoystickButton requires a boolean pressed flag.", pressed);
        throw JsDosSession.unsupported("joystick buttons");
    }

    // INSTANCE :: joystickAxis, finiteNumber -> VOID
    // Always refuses: emulators@8.4.2 has no joystick input
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when the arguments are not a JoystickAxis and a finite number
    // NOTE: Throws DosRuntimeError UNSUPPORTED otherwise
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    sendJoystickAxis(axis: JoystickAxis, value: number): void {
        this.assertLive();
        if (!isJoystickAxis(axis)) throw JsDosSession.invalid("sendJoystickAxis requires a JoystickAxis literal.", axis);
        if (!isFiniteNumber(value)) throw JsDosSession.invalid("sendJoystickAxis requires a finite value.", value);
        throw JsDosSession.unsupported("joystick axes");
    }

    // INSTANCE :: VOID -> VOID
    // Stops emulation; no frames arrive until resume()
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    pause(): void {
        this.assertLive();
        this._ci.pause();
    }

    // INSTANCE :: VOID -> VOID
    // Continues emulation
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    resume(): void {
        this.assertLive();
        this._ci.resume();
    }

    // INSTANCE :: VOID -> PROMISE(Uint8Array?)
    // Resolves with the overlay of files changed since start, or null when nothing changed
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    // NOTE: Rejects with DosRuntimeError ADAPTER_FAILED, data the caught value, when js-dos rejects
    async persist(): Promise<Uint8Array | null> {
        this.assertLive();
        try {
            return await this._ci.persist();
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: "js-dos persist() failed.", data: error });
        }
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Stops the emulator for good; every later call throws DESTROYED
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    // NOTE: Rejects with DosRuntimeError ADAPTER_FAILED, data the caught value, when js-dos rejects
    async exit(): Promise<void> {
        this.assertLive();
        try {
            await this._ci.exit();
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ADAPTER_FAILED, message: "js-dos exit() failed.", data: error });
        }
        this.markExited();
    }

    // INSTANCE :: (frameEvent -> VOID) -> unsubscribe
    // Subscribes to converted RGBA frames
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    onFrame(listener: Listener<FrameEvent>): Unsubscribe {
        this.assertLive();
        this._frameListeners.add(listener);
        return () => { this._frameListeners.delete(listener); };
    }

    // INSTANCE :: (Float32Array -> VOID) -> unsubscribe
    // Subscribes to mono sample pushes at soundFrequency
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    onSound(listener: Listener<Float32Array>): Unsubscribe {
        this.assertLive();
        this._soundListeners.add(listener);
        return () => { this._soundListeners.delete(listener); };
    }

    // INSTANCE :: (VOID -> VOID) -> unsubscribe
    // Subscribes to the emulator stopping
    // NOTE: Throws DosRuntimeError DESTROYED after exit
    onExit(listener: Listener<void>): Unsubscribe {
        this.assertLive();
        this._exitListeners.add(listener);
        return () => { this._exitListeners.delete(listener); };
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> VOID
    // Throws DESTROYED once the session has exited
    private assertLive(): void {
        if (this._exited) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "The js-dos session has exited.", data: null });
        }
    }

    // PRIVATE :: VOID -> VOID
    // Marks the session exited once, fires onExit listeners, and drops every listener
    private markExited(): void {
        if (this._exited) return;
        this._exited = true;
        const listeners = [...this._exitListeners];
        this._frameListeners.clear();
        this._soundListeners.clear();
        this._exitListeners.clear();
        for (const listener of listeners) listener(undefined);
    }

    // PRIVATE :: Uint8Array?, Uint8Array? -> VOID
    // Converts a js-dos frame to RGBA at the latest size and delivers it; skips a frame whose length disagrees with the size
    // NOTE: onFrameSize is not always fired (one game's 640×400 text mode never announces itself), so when the announced size
    // is unset or disagrees with the frame, the size is re-read from the command interface's width()/height()
    private deliverFrame(rgb: Uint8Array | null, rgba: Uint8Array | null): void {
        if (this._frameListeners.size === 0) return;
        const length = rgba !== null ? rgba.length / 4 : rgb !== null ? rgb.length / 3 : 0;
        if (this._width * this._height !== length) {
            const width = this._ci.width();
            const height = this._ci.height();
            if (width * height === length) { this._width = width; this._height = height; }
        }
        const pixels = this._width * this._height;
        if (pixels === 0) return;
        if (rgba !== null) {
            if (rgba.length !== pixels * 4) return;
            this.ensureBuffer(pixels);
            this._rgba.set(rgba);
        } else if (rgb !== null) {
            if (rgb.length !== pixels * 3) return;
            this.ensureBuffer(pixels);
            const out = this._rgba;
            for (let i = 0, j = 0; i < pixels; i++, j += 3) {
                const k = i * 4;
                out[k] = rgb[j] ?? 0;
                out[k + 1] = rgb[j + 1] ?? 0;
                out[k + 2] = rgb[j + 2] ?? 0;
                out[k + 3] = 255;
            }
        } else {
            return;
        }
        const frame: FrameEvent = { width: this._width, height: this._height, rgba: this._rgba };
        for (const listener of this._frameListeners) listener(frame);
    }

    // PRIVATE :: NUMBER -> VOID
    // Reallocates the conversion buffer when the pixel count changed
    private ensureBuffer(pixels: number): void {
        if (this._rgba.length !== pixels * 4) this._rgba = new Uint8ClampedArray(pixels * 4);
    }

    /**
     *
     * Static Methods
     *
     */

    // STATIC :: STRING, UNKNOWN -> dosRuntimeError
    // Builds an INVALID_CONFIG error carrying the rejected value
    private static invalid(message: string, data: unknown): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message, data });
    }

    // STATIC :: STRING -> dosRuntimeError
    // Builds an UNSUPPORTED error naming the missing feature
    private static unsupported(feature: string): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: `emulators@8.4.2 does not support ${feature}.`, data: null });
    }
}
