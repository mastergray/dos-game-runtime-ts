// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection and DESTROYED

// Type dependencies:
import type { FiniteNumber, InputSurface, Listener, Unsubscribe, Vector2 } from "../shared.types.js";   // Surface, geometry and subscription types
import {
    isDPadConfig,                                                  // Guards the construction config
    type DPadConfig,                                               // Construction config shape
    type DPadDirection,                                            // Direction literal
    type DPadEvents,                                               // Event name to payload map
} from "./types.js";

/**
 *
 * Class
 *
 */

// Pointer primitive: a directional pad that turns one pointer's position relative to the surface center into a set of active directions
export default class DPad {

    /* Static Fields */
    static readonly DEFAULT_DEAD_ZONE: FiniteNumber = 0.2;         // Fraction of the radius that yields no direction
    static readonly DIAGONAL_RATIO = Math.tan(Math.PI / 8);        // tan(22.5°): minor/major axis ratio above which a diagonal counts
    static readonly ORDER: ReadonlyArray<DPadDirection> = ["up", "down", "left", "right"];   // Sort order of emitted direction sets
    static readonly EVENT_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const;   // Listened-for pointer events

    /* Instance Fields */
    private readonly _surface: InputSurface;                       // Element the listeners attach to
    private readonly _deadZone: FiniteNumber;                      // Dead zone as a fraction of the radius
    private readonly _diagonals: boolean;                          // Whether two directions may be active at once
    private readonly _listener: (event: Event) => void;            // One bound listener dispatched by event type
    private readonly _listeners: Map<keyof DPadEvents, Set<Listener<never>>>;   // Subscribers by event name
    private _pointerId: number | null;                             // The pointer driving the pad, or null
    private _directions: ReadonlyArray<DPadDirection>;             // Current active set, sorted
    private _attached: boolean;                                    // Whether listeners are installed
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: DPadConfig -> this
    // Creates a detached pad; call attach() to start listening
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDPadConfig()
    constructor(config: DPadConfig) {
        if (!isDPadConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "DPad config must have an InputSurface and, when given, a deadZone in 0..1 and a boolean diagonals.", data: config });
        }
        this._surface = config.surface;
        this._deadZone = config.deadZone ?? DPad.DEFAULT_DEAD_ZONE;
        this._diagonals = config.diagonals ?? false;
        this._listener = (event) => this.handle(event);
        this._listeners = new Map();
        this._pointerId = null;
        this._directions = [];
        this._attached = false;
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> [dPadDirection]
    // The currently active directions, sorted up, down, left, right
    get directions(): ReadonlyArray<DPadDirection> {
        return this._directions;
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

    // INSTANCE :: STRING, (dPadEvents[K] -> VOID) -> unsubscribe
    // Subscribes to change, press or release; returns the remover
    on<K extends keyof DPadEvents>(event: K, listener: Listener<DPadEvents[K]>): Unsubscribe {
        let set = this._listeners.get(event);
        if (set === undefined) { set = new Set(); this._listeners.set(event, set); }
        set.add(listener as Listener<never>);
        return () => { set?.delete(listener as Listener<never>); };
    }

    // INSTANCE :: VOID -> VOID
    // Installs the pointer listeners; a no-op when already attached
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "DPad has been destroyed." });
        if (this._attached) return;
        for (const type of DPad.EVENT_TYPES) this._surface.addEventListener(type, this._listener);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and releases every active direction; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        for (const type of DPad.EVENT_TYPES) this._surface.removeEventListener(type, this._listener);
        this._attached = false;
        this._pointerId = null;
        this.update([]);
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the pad destroyed; idempotent
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
    // Routes one pointer event: the first pointer down claims the pad; its moves re-evaluate; its departure empties the set
    private handle(event: Event): void {
        const pointer = event as PointerEvent;
        if (typeof pointer.pointerId !== "number") return;
        if (pointer.type === "pointerdown") {
            if (this._pointerId !== null) return;
            this._pointerId = pointer.pointerId;
            this.capture(pointer.pointerId);
            pointer.preventDefault();
            this.update(this.directionsAt(pointer));
            return;
        }
        if (pointer.pointerId !== this._pointerId) return;
        pointer.preventDefault();
        if (pointer.type === "pointermove") { this.update(this.directionsAt(pointer)); return; }
        this._pointerId = null;
        this.update([]);
    }

    // PRIVATE :: pointerEvent -> [dPadDirection]
    // Evaluates the pointer's position against the surface's center and radius
    private directionsAt(pointer: PointerEvent): ReadonlyArray<DPadDirection> {
        const rect = this._surface.getBoundingClientRect();
        const radius = Math.min(rect.width, rect.height) / 2;
        const offset = { x: pointer.clientX - (rect.left + rect.width / 2), y: pointer.clientY - (rect.top + rect.height / 2) };
        return DPad.directionsFor(offset, radius, this._deadZone, this._diagonals);
    }

    // PRIVATE :: [dPadDirection] -> VOID
    // Replaces the active set, emitting releases for departed directions, then presses for new ones, then change when it differs
    private update(next: ReadonlyArray<DPadDirection>): void {
        const previous = this._directions;
        const same = previous.length === next.length && previous.every((direction, index) => direction === next[index]);
        if (same) return;
        this._directions = next;
        for (const direction of previous) if (!next.includes(direction)) this.emit("release", { direction });
        for (const direction of next) if (!previous.includes(direction)) this.emit("press", { direction });
        this.emit("change", { directions: next });
    }

    // PRIVATE :: NUMBER -> VOID
    // Requests pointer capture when the surface supports it, ignoring a refusal
    private capture(pointerId: number): void {
        try { this._surface.setPointerCapture?.(pointerId); } catch { /* capture refused: pointerup/cancel still arrive */ }
    }

    // PRIVATE :: STRING, dPadEvents[K] -> VOID
    // Calls every subscriber of an event
    private emit<K extends keyof DPadEvents>(event: K, payload: DPadEvents[K]): void {
        const set = this._listeners.get(event);
        if (set === undefined) return;
        for (const listener of set) (listener as Listener<DPadEvents[K]>)(payload);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: DPadConfig -> dPad
    // Mirrors the constructor
    static init(config: DPadConfig): DPad {
        return new DPad(config);
    }

    // STATIC :: vector2, finiteNumber, finiteNumber, BOOLEAN -> [dPadDirection]
    // The directions active for a pointer offset from the center: none inside deadZone × radius; the dominant axis, plus the minor axis when diagonals is true and the offset is within 22.5° of a diagonal
    // NOTE: Screen coordinates: negative y is up. The result is sorted up, down, left, right
    static directionsFor(offset: Vector2, radius: FiniteNumber, deadZone: FiniteNumber, diagonals: boolean): ReadonlyArray<DPadDirection> {
        const length = Math.hypot(offset.x, offset.y);
        if (length === 0 || length <= deadZone * radius) return [];
        const ax = Math.abs(offset.x);
        const ay = Math.abs(offset.y);
        const horizontal: DPadDirection = offset.x < 0 ? "left" : "right";
        const vertical: DPadDirection = offset.y < 0 ? "up" : "down";
        const active = new Set<DPadDirection>();
        if (ax >= ay) active.add(horizontal); else active.add(vertical);
        if (diagonals && Math.min(ax, ay) / Math.max(ax, ay) > DPad.DIAGONAL_RATIO) { active.add(horizontal); active.add(vertical); }
        return DPad.ORDER.filter((direction) => active.has(direction));
    }
}
