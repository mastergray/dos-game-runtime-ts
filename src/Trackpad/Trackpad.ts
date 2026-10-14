// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection and DESTROYED

// Type dependencies:
import type { FiniteNumber, InputSurface, Listener, TimerLike, Unsubscribe } from "../shared.types.js";   // Surface, timer and subscription types
import {
    isTrackpadConfig,                                              // Guards the construction config
    type TrackpadConfig,                                           // Construction config shape
    type TrackpadEvents,                                           // Event name to payload map
} from "./types.js";

/**
 *
 * Type Declarations (module-private)
 *
 */

// INTERFACE :: {originX:NUMBER, originY:NUMBER, lastX:NUMBER, lastY:NUMBER, travelled:BOOLEAN}
// What the trackpad remembers about one pointer of the current gesture.
interface TrackedPointer {
    originX: number;                                               // Client x where the pointer went down
    originY: number;                                               // Client y where the pointer went down
    lastX: number;                                                 // Client x at the last move
    lastY: number;                                                 // Client y at the last move
    travelled: boolean;                                            // Whether it ever moved farther than tapMaxDistance from its origin
}

/**
 *
 * Class
 *
 */

// Pointer primitive: a touch surface that reports relative motion of the first finger, taps by finger count, and press-and-hold gestures
export default class Trackpad {

    /* Static Fields */
    static readonly DEFAULT_SENSITIVITY: FiniteNumber = 1;         // Deltas pass through unscaled unless configured
    static readonly DEFAULT_TAP_MAX_MS: FiniteNumber = 250;        // Longest tap
    static readonly DEFAULT_TAP_MAX_DISTANCE: FiniteNumber = 10;   // Farthest travel that still taps or holds, in CSS px
    static readonly DEFAULT_HOLD_DELAY_MS: FiniteNumber = 400;     // Stillness before a hold
    static readonly EVENT_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const;   // Listened-for pointer events

    /* Instance Fields */
    private readonly _surface: InputSurface;                       // Element the listeners attach to
    private readonly _tapMaxMs: FiniteNumber;                      // Longest tap
    private readonly _tapMaxDistance: FiniteNumber;                // Farthest tap or hold travel
    private readonly _holdDelayMs: FiniteNumber;                   // Stillness before a hold
    private readonly _timer: TimerLike;                            // Measures the hold delay
    private readonly _listener: (event: Event) => void;            // One bound listener dispatched by event type
    private readonly _listeners: Map<keyof TrackpadEvents, Set<Listener<never>>>;   // Subscribers by event name
    private readonly _pointers: Map<number, TrackedPointer>;       // Pointers of the current gesture by id
    private _sensitivity: FiniteNumber;                            // Multiplier applied to move deltas
    private _primaryId: number | null;                             // The first pointer of the gesture, whose moves produce deltas
    private _startedAt: number;                                    // timeStamp of the gesture's first pointerdown
    private _peakPointers: number;                                 // Most pointers down at once during the gesture
    private _holding: boolean;                                     // Whether holdStart has fired for this gesture
    private _holdHandle: number | null;                            // Pending hold timer, or null
    private _cancelled: boolean;                                   // Whether the gesture was cancelled, which forbids a tap
    private _travelled: boolean;                                   // Whether any pointer of the gesture moved beyond tapMaxDistance
    private _remainderX: number;                                   // Sub-pixel delta carried to the next move
    private _remainderY: number;                                   // Sub-pixel delta carried to the next move
    private _attached: boolean;                                    // Whether listeners are installed
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: TrackpadConfig -> this
    // Creates a detached trackpad; call attach() to start listening
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isTrackpadConfig()
    constructor(config: TrackpadConfig) {
        if (!isTrackpadConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "Trackpad config must have an InputSurface; sensitivity must be positive and the thresholds non-negative when given.", data: config });
        }
        this._surface = config.surface;
        this._tapMaxMs = config.tapMaxMs ?? Trackpad.DEFAULT_TAP_MAX_MS;
        this._tapMaxDistance = config.tapMaxDistance ?? Trackpad.DEFAULT_TAP_MAX_DISTANCE;
        this._holdDelayMs = config.holdDelayMs ?? Trackpad.DEFAULT_HOLD_DELAY_MS;
        this._timer = config.timer ?? Trackpad.globalTimer();
        this._listener = (event) => this.handle(event);
        this._listeners = new Map();
        this._pointers = new Map();
        this._sensitivity = Trackpad.DEFAULT_SENSITIVITY;
        this.sensitivity = config.sensitivity ?? Trackpad.DEFAULT_SENSITIVITY;   // mutable: assigned through the validating setter
        this._primaryId = null;
        this._startedAt = 0;
        this._peakPointers = 0;
        this._holding = false;
        this._holdHandle = null;
        this._cancelled = false;
        this._travelled = false;
        this._remainderX = 0;
        this._remainderY = 0;
        this._attached = false;
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> finiteNumber
    // Multiplier applied to move deltas
    get sensitivity(): FiniteNumber {
        return this._sensitivity;
    }

    // SETTER :: finiteNumber -> VOID
    // Sets the delta multiplier
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a positive finite number
    set sensitivity(value: FiniteNumber) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "sensitivity must be a positive finite number.", data: value });
        }
        this._sensitivity = value;
    }

    // GETTER :: VOID -> NUMBER
    // How many pointers are currently down on the surface
    get activePointers(): number {
        return this._pointers.size;
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

    // INSTANCE :: STRING, (trackpadEvents[K] -> VOID) -> unsubscribe
    // Subscribes to move, tap, holdStart or holdEnd; returns the remover
    on<K extends keyof TrackpadEvents>(event: K, listener: Listener<TrackpadEvents[K]>): Unsubscribe {
        let set = this._listeners.get(event);
        if (set === undefined) { set = new Set(); this._listeners.set(event, set); }
        set.add(listener as Listener<never>);
        return () => { set?.delete(listener as Listener<never>); };
    }

    // INSTANCE :: VOID -> VOID
    // Installs the pointer listeners; a no-op when already attached
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "Trackpad has been destroyed." });
        if (this._attached) return;
        for (const type of Trackpad.EVENT_TYPES) this._surface.addEventListener(type, this._listener);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and ends any gesture in progress as cancelled; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        for (const type of Trackpad.EVENT_TYPES) this._surface.removeEventListener(type, this._listener);
        this._attached = false;
        if (this._pointers.size > 0) { this._cancelled = true; this._pointers.clear(); this.endGesture(0); }
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the trackpad destroyed; idempotent
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
    // Routes one pointer event into the current gesture
    private handle(event: Event): void {
        const pointer = event as PointerEvent;
        if (typeof pointer.pointerId !== "number") return;
        switch (pointer.type) {
            case "pointerdown": this.handleDown(pointer); break;
            case "pointermove": this.handleMove(pointer); break;
            case "pointerup": this.handleGone(pointer, false); break;
            case "pointercancel":
            case "lostpointercapture": this.handleGone(pointer, true); break;
            default: break;
        }
    }

    // PRIVATE :: pointerEvent -> VOID
    // Adds a pointer; the first one starts the gesture and arms the hold timer
    private handleDown(pointer: PointerEvent): void {
        if (this._pointers.has(pointer.pointerId)) return;
        this.capture(pointer.pointerId);
        pointer.preventDefault();
        this._pointers.set(pointer.pointerId, { originX: pointer.clientX, originY: pointer.clientY, lastX: pointer.clientX, lastY: pointer.clientY, travelled: false });
        if (this._pointers.size === 1) {
            this._primaryId = pointer.pointerId;
            this._startedAt = pointer.timeStamp;
            this._peakPointers = 1;
            this._holding = false;
            this._cancelled = false;
            this._travelled = false;
            this._remainderX = 0;
            this._remainderY = 0;
            this._holdHandle = this._timer.setTimeout(() => {
                this._holdHandle = null;
                if (this._pointers.size === 0 || this._travelled) return;
                this._holding = true;
                this.emit("holdStart", { pointers: this._pointers.size });
            }, this._holdDelayMs);
        } else {
            this._peakPointers = Math.max(this._peakPointers, this._pointers.size);
        }
    }

    // PRIVATE :: pointerEvent -> VOID
    // Tracks travel for every pointer and emits a scaled integer delta for the primary one
    private handleMove(pointer: PointerEvent): void {
        const tracked = this._pointers.get(pointer.pointerId);
        if (tracked === undefined) return;
        pointer.preventDefault();
        const rawX = pointer.clientX - tracked.lastX;
        const rawY = pointer.clientY - tracked.lastY;
        tracked.lastX = pointer.clientX;
        tracked.lastY = pointer.clientY;
        if (Math.hypot(pointer.clientX - tracked.originX, pointer.clientY - tracked.originY) > this._tapMaxDistance) {
            tracked.travelled = true;
            this._travelled = true;
            if (!this._holding && this._holdHandle !== null) { this._timer.clearTimeout(this._holdHandle); this._holdHandle = null; }
        }
        if (pointer.pointerId !== this._primaryId) return;
        const scaledX = rawX * this._sensitivity + this._remainderX;
        const scaledY = rawY * this._sensitivity + this._remainderY;
        const dx = Math.trunc(scaledX);
        const dy = Math.trunc(scaledY);
        this._remainderX = scaledX - dx;
        this._remainderY = scaledY - dy;
        if (dx !== 0 || dy !== 0) this.emit("move", { dx, dy, pointers: this._pointers.size });
    }

    // PRIVATE :: pointerEvent, BOOLEAN -> VOID
    // Removes a pointer; when it was the last one the gesture ends as a tap, a hold end, or nothing
    private handleGone(pointer: PointerEvent, cancelled: boolean): void {
        if (!this._pointers.has(pointer.pointerId)) return;
        pointer.preventDefault();
        this._pointers.delete(pointer.pointerId);
        if (cancelled) this._cancelled = true;
        if (this._pointers.size > 0) return;
        this.endGesture(pointer.timeStamp);
    }

    // PRIVATE :: NUMBER -> VOID
    // Ends the gesture: cancels a pending hold, emits holdEnd when holding, else tap when quick, still and not cancelled
    private endGesture(endedAt: number): void {
        if (this._holdHandle !== null) { this._timer.clearTimeout(this._holdHandle); this._holdHandle = null; }
        const pointers = this._peakPointers;
        this._primaryId = null;
        if (this._holding) {
            this._holding = false;
            this.emit("holdEnd", { pointers });
            return;
        }
        if (this._cancelled) return;
        if (endedAt - this._startedAt <= this._tapMaxMs && !this._travelled) this.emit("tap", { pointers });
    }

    // PRIVATE :: NUMBER -> VOID
    // Requests pointer capture when the surface supports it, ignoring a refusal
    private capture(pointerId: number): void {
        try { this._surface.setPointerCapture?.(pointerId); } catch { /* capture refused: pointerup/cancel still arrive */ }
    }

    // PRIVATE :: STRING, trackpadEvents[K] -> VOID
    // Calls every subscriber of an event
    private emit<K extends keyof TrackpadEvents>(event: K, payload: TrackpadEvents[K]): void {
        const set = this._listeners.get(event);
        if (set === undefined) return;
        for (const listener of set) (listener as Listener<TrackpadEvents[K]>)(payload);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: TrackpadConfig -> trackpad
    // Mirrors the constructor, defaulting the timer to the global setTimeout/clearTimeout
    static init(config: TrackpadConfig): Trackpad {
        return new Trackpad(config.timer === undefined ? { ...config, timer: Trackpad.globalTimer() } : config);
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
