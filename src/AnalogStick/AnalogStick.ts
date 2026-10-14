// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection and DESTROYED

// Type dependencies:
import type { FiniteNumber, InputSurface, Listener, Unsubscribe, Vector2 } from "../shared.types.js";   // Surface, geometry and subscription types
import {
    isAnalogStickConfig,                                           // Guards the construction config
    type AnalogStickConfig,                                        // Construction config shape
    type AnalogStickEvents,                                        // Event name to payload map
} from "./types.js";

/**
 *
 * Class
 *
 */

// Pointer primitive: a virtual stick that turns one pointer's offset from an origin into a 2-D value in -1..1 per axis
export default class AnalogStick {

    /* Static Fields */
    static readonly DEFAULT_DEAD_ZONE: FiniteNumber = 0.1;         // Fraction of the radius that yields zero
    static readonly ZERO: Vector2 = { x: 0, y: 0 };                // The released value
    static readonly EVENT_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const;   // Listened-for pointer events

    /* Instance Fields */
    private readonly _surface: InputSurface;                       // Element the listeners attach to
    private readonly _deadZone: FiniteNumber;                      // Dead zone as a fraction of the radius
    private readonly _fixedRadius: FiniteNumber | null;            // Configured radius for a floating stick, or null to use the surface
    private readonly _listener: (event: Event) => void;            // One bound listener dispatched by event type
    private readonly _listeners: Map<keyof AnalogStickEvents, Set<Listener<never>>>;   // Subscribers by event name
    private _pointerId: number | null;                             // The pointer driving the stick, or null
    private _origin: Vector2;                                      // Client position the offset is measured from
    private _radius: FiniteNumber;                                 // Radius in effect for the current gesture
    private _value: Vector2;                                       // Current value
    private _attached: boolean;                                    // Whether listeners are installed
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: AnalogStickConfig -> this
    // Creates a detached stick; call attach() to start listening
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isAnalogStickConfig()
    constructor(config: AnalogStickConfig) {
        if (!isAnalogStickConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "AnalogStick config must have an InputSurface and, when given, a deadZone in 0..1 and a positive radius.", data: config });
        }
        this._surface = config.surface;
        this._deadZone = config.deadZone ?? AnalogStick.DEFAULT_DEAD_ZONE;
        this._fixedRadius = config.radius ?? null;
        this._listener = (event) => this.handle(event);
        this._listeners = new Map();
        this._pointerId = null;
        this._origin = AnalogStick.ZERO;
        this._radius = 1;
        this._value = AnalogStick.ZERO;
        this._attached = false;
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> vector2
    // The current value; {0,0} when no pointer drives the stick
    get value(): Vector2 {
        return this._value;
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

    // INSTANCE :: STRING, (analogStickEvents[K] -> VOID) -> unsubscribe
    // Subscribes to change or release; returns the remover
    on<K extends keyof AnalogStickEvents>(event: K, listener: Listener<AnalogStickEvents[K]>): Unsubscribe {
        let set = this._listeners.get(event);
        if (set === undefined) { set = new Set(); this._listeners.set(event, set); }
        set.add(listener as Listener<never>);
        return () => { set?.delete(listener as Listener<never>); };
    }

    // INSTANCE :: VOID -> VOID
    // Installs the pointer listeners; a no-op when already attached
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "AnalogStick has been destroyed." });
        if (this._attached) return;
        for (const type of AnalogStick.EVENT_TYPES) this._surface.addEventListener(type, this._listener);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and releases the stick if driven; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        for (const type of AnalogStick.EVENT_TYPES) this._surface.removeEventListener(type, this._listener);
        this._attached = false;
        if (this._pointerId !== null) this.end();
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the stick destroyed; idempotent
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
    // Routes one pointer event: the first pointer down claims the stick and fixes the origin; its moves update; its departure releases
    private handle(event: Event): void {
        const pointer = event as PointerEvent;
        if (typeof pointer.pointerId !== "number") return;
        if (pointer.type === "pointerdown") {
            if (this._pointerId !== null) return;
            this._pointerId = pointer.pointerId;
            this.capture(pointer.pointerId);
            pointer.preventDefault();
            const rect = this._surface.getBoundingClientRect();
            if (this._fixedRadius !== null) {
                this._origin = { x: pointer.clientX, y: pointer.clientY };
                this._radius = this._fixedRadius;
            } else {
                this._origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                this._radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
            }
            this.update(pointer);
            return;
        }
        if (pointer.pointerId !== this._pointerId) return;
        pointer.preventDefault();
        if (pointer.type === "pointermove") { this.update(pointer); return; }
        this.end();
    }

    // PRIVATE :: pointerEvent -> VOID
    // Recomputes the value from the pointer's offset and emits change when it differs
    private update(pointer: PointerEvent): void {
        const next = AnalogStick.valueFor({ x: pointer.clientX - this._origin.x, y: pointer.clientY - this._origin.y }, this._radius, this._deadZone);
        if (next.x === this._value.x && next.y === this._value.y) return;
        this._value = next;
        this.emit("change", { value: next });
    }

    // PRIVATE :: VOID -> VOID
    // Releases the driving pointer: value to zero with a change when needed, then release
    private end(): void {
        this._pointerId = null;
        if (this._value.x !== 0 || this._value.y !== 0) {
            this._value = AnalogStick.ZERO;
            this.emit("change", { value: AnalogStick.ZERO });
        }
        this.emit("release", undefined);
    }

    // PRIVATE :: NUMBER -> VOID
    // Requests pointer capture when the surface supports it, ignoring a refusal
    private capture(pointerId: number): void {
        try { this._surface.setPointerCapture?.(pointerId); } catch { /* capture refused: pointerup/cancel still arrive */ }
    }

    // PRIVATE :: STRING, analogStickEvents[K] -> VOID
    // Calls every subscriber of an event
    private emit<K extends keyof AnalogStickEvents>(event: K, payload: AnalogStickEvents[K]): void {
        const set = this._listeners.get(event);
        if (set === undefined) return;
        for (const listener of set) (listener as Listener<AnalogStickEvents[K]>)(payload);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: AnalogStickConfig -> analogStick
    // Mirrors the constructor
    static init(config: AnalogStickConfig): AnalogStick {
        return new AnalogStick(config);
    }

    // STATIC :: vector2, finiteNumber, finiteNumber -> vector2
    // Normalizes an offset by radius, clamps to the unit circle, and rescales the radial dead zone so the magnitude leaves zero smoothly at its edge
    // NOTE: Direction is preserved in screen coordinates: positive y is downward. Magnitude is (length − deadZone) / (1 − deadZone), clamped to 0..1
    static valueFor(offset: Vector2, radius: FiniteNumber, deadZone: FiniteNumber): Vector2 {
        const length = Math.hypot(offset.x, offset.y) / radius;
        if (length === 0 || length <= deadZone) return AnalogStick.ZERO;
        const magnitude = Math.min(1, (length - deadZone) / (1 - deadZone));
        const scale = magnitude / length;
        return { x: offset.x / radius * scale, y: offset.y / radius * scale };
    }
}
