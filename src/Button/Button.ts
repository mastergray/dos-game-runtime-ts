// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection and DESTROYED

// Type dependencies:
import type { FiniteNumber, InputSurface, Listener, TimerLike, Unsubscribe } from "../shared.types.js";   // Surface, timer and subscription types
import {
    isButtonConfig,                                                // Guards the construction config
    type ButtonConfig,                                             // Construction config shape
    type ButtonEvents,                                             // Event name to payload map
} from "./types.js";

/**
 *
 * Class
 *
 */

// Pointer primitive: a pressable area that emits press on the first pointer down, release when the last pointer leaves, and hold after a delay
export default class Button {

    /* Static Fields */
    static readonly DEFAULT_HOLD_DELAY_MS: FiniteNumber = 400;    // Hold fires this long after press unless configured otherwise
    static readonly EVENT_TYPES = ["pointerdown", "pointerup", "pointercancel", "lostpointercapture"] as const;   // Listened-for pointer events

    /* Instance Fields */
    private readonly _surface: InputSurface;                       // Element the listeners attach to
    private readonly _holdDelayMs: FiniteNumber;                   // Delay before hold fires
    private readonly _timer: TimerLike;                            // Measures the hold delay
    private readonly _listener: (event: Event) => void;            // One bound listener dispatched by event type
    private readonly _listeners: Map<keyof ButtonEvents, Set<Listener<never>>>;   // Subscribers by event name
    private readonly _pointers: Set<number>;                       // Pointer ids currently holding the button
    private _firstPointerId: number | null;                        // Pointer that produced the current press, for the hold payload
    private _holdHandle: number | null;                            // Pending hold timer, or null
    private _attached: boolean;                                    // Whether listeners are installed
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: ButtonConfig -> this
    // Creates a detached button; call attach() to start listening
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isButtonConfig()
    // NOTE: Without a timer in config the constructor uses the global setTimeout/clearTimeout; init() is where a deployment normally defaults it
    constructor(config: ButtonConfig) {
        if (!isButtonConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "Button config must have an InputSurface and, when given, a non-negative holdDelayMs and a TimerLike timer.", data: config });
        }
        this._surface = config.surface;
        this._holdDelayMs = config.holdDelayMs ?? Button.DEFAULT_HOLD_DELAY_MS;
        this._timer = config.timer ?? Button.globalTimer();
        this._listener = (event) => this.handle(event);
        this._listeners = new Map();
        this._pointers = new Set();
        this._firstPointerId = null;
        this._holdHandle = null;
        this._attached = false;
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> BOOLEAN
    // Whether at least one pointer is holding the button
    get isPressed(): boolean {
        return this._pointers.size > 0;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the listeners are installed on the surface
    get isAttached(): boolean {
        return this._attached;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: STRING, (buttonEvents[K] -> VOID) -> unsubscribe
    // Subscribes to press, release or hold; returns the remover
    on<K extends keyof ButtonEvents>(event: K, listener: Listener<ButtonEvents[K]>): Unsubscribe {
        let set = this._listeners.get(event);
        if (set === undefined) { set = new Set(); this._listeners.set(event, set); }
        set.add(listener as Listener<never>);
        return () => { set?.delete(listener as Listener<never>); };
    }

    // INSTANCE :: VOID -> VOID
    // Installs the pointer listeners; a no-op when already attached
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "Button has been destroyed." });
        if (this._attached) return;
        for (const type of Button.EVENT_TYPES) this._surface.addEventListener(type, this._listener);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and releases the button if pressed; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        for (const type of Button.EVENT_TYPES) this._surface.removeEventListener(type, this._listener);
        this._attached = false;
        if (this.isPressed) {
            const pointerId = this._firstPointerId ?? 0;
            this._pointers.clear();
            this.endPress(pointerId);
        }
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the button destroyed; idempotent
    destroy(): void {
        if (this._destroyed) return;
        this.detach();
        this._listeners.clear();
        this._destroyed = true;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: event -> VOID
    // Routes one pointer event: down adds the pointer and may press; up, cancel and capture loss remove it and may release
    private handle(event: Event): void {
        const pointer = event as PointerEvent;
        if (typeof pointer.pointerId !== "number") return;
        if (pointer.type === "pointerdown") {
            this.capture(pointer.pointerId);
            const wasPressed = this.isPressed;
            this._pointers.add(pointer.pointerId);
            pointer.preventDefault();
            if (!wasPressed) this.beginPress(pointer.pointerId);
            return;
        }
        if (!this._pointers.has(pointer.pointerId)) return;
        this._pointers.delete(pointer.pointerId);
        pointer.preventDefault();
        if (!this.isPressed) this.endPress(pointer.pointerId);
    }

    // PRIVATE :: NUMBER -> VOID
    // Emits press and arms the hold timer
    private beginPress(pointerId: number): void {
        this._firstPointerId = pointerId;
        this.emit("press", { pointerId });
        this._holdHandle = this._timer.setTimeout(() => {
            this._holdHandle = null;
            if (this.isPressed) this.emit("hold", { pointerId });
        }, this._holdDelayMs);
    }

    // PRIVATE :: NUMBER -> VOID
    // Cancels a pending hold and emits release
    private endPress(pointerId: number): void {
        if (this._holdHandle !== null) { this._timer.clearTimeout(this._holdHandle); this._holdHandle = null; }
        this._firstPointerId = null;
        this.emit("release", { pointerId });
    }

    // PRIVATE :: NUMBER -> VOID
    // Requests pointer capture when the surface supports it, ignoring a refusal
    // NOTE: Browsers refuse capture for a pointer they did not originate; correctness never depends on it succeeding
    private capture(pointerId: number): void {
        try { this._surface.setPointerCapture?.(pointerId); } catch { /* capture refused: pointerup/cancel still arrive */ }
    }

    // PRIVATE :: STRING, buttonEvents[K] -> VOID
    // Calls every subscriber of an event
    private emit<K extends keyof ButtonEvents>(event: K, payload: ButtonEvents[K]): void {
        const set = this._listeners.get(event);
        if (set === undefined) return;
        for (const listener of set) (listener as Listener<ButtonEvents[K]>)(payload);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: ButtonConfig -> button
    // Mirrors the constructor, defaulting the timer to the global setTimeout/clearTimeout
    static init(config: ButtonConfig): Button {
        return new Button(config.timer === undefined ? { ...config, timer: Button.globalTimer() } : config);
    }

    // STATIC :: VOID -> timerLike
    // The global setTimeout/clearTimeout as a TimerLike
    static globalTimer(): TimerLike {
        return {
            setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms) as unknown as number,
            clearTimeout: (handle) => globalThis.clearTimeout(handle),
        };
    }
}
