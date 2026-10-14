// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection, UNSUPPORTED and DESTROYED

// Type dependencies:
import type DosInput from "../DosInput/DosInput.js";               // Input API deltas and buttons go to
import type { FiniteNumber, InputSurface, MouseButton } from "../shared.types.js";   // Delta, surface and button types
import {
    isMouseSourceConfig,                                           // Guards the construction config
    isSensitivity,                                                 // Guards the sensitivity setter
    type MouseScale,                                               // Per-axis multipliers for absolute positions
    type MouseSourceConfig,                                        // Construction config shape
    type MouseTouchMode,                                           // Touch handling literal
    type PointerLockLike,                                          // Element shape lock() uses
} from "./types.js";

/**
 *
 * Class
 *
 */

// Turns physical mouse pointer events on a surface into DosInput mouse input: absolute positions while unlocked, relative deltas under pointer lock
export default class MouseSource {

    /* Static Fields */
    static readonly DEFAULT_SENSITIVITY: FiniteNumber = 1;         // Deltas pass through unscaled unless configured
    static readonly BUTTON_MAP: Readonly<Record<number, MouseButton>> = {   // PointerEvent.button to MouseButton
        0: "left",
        1: "middle",
        2: "right",
    };
    static readonly EVENT_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "contextmenu"] as const;   // Listened-for event types

    /* Instance Fields */
    private readonly _input: DosInput;                             // Where deltas and buttons go
    private readonly _surface: InputSurface;                       // Where listeners attach
    private readonly _pointerLock: PointerLockLike | null;         // Lock target, or null when locking is unsupported
    private readonly _listener: (event: Event) => void;            // One bound listener dispatched by event type
    private readonly _touch: MouseTouchMode;                       // How touch pointers are treated
    private _sensitivity: FiniteNumber;                            // Multiplier applied to raw deltas
    private readonly _scale: MouseScale;                           // Multipliers applied to absolute positions
    private _enabled: boolean;                                     // Gate: while false, pointer events are ignored
    private _touchId: number | null;                               // The touch pointer acting as the cursor, or null
    private _attached: boolean;                                    // Whether listeners are installed
    private _destroyed: boolean;                                   // Whether destroy() has run
    private _remainderX: number;                                   // Sub-pixel delta carried to the next move
    private _remainderY: number;                                   // Sub-pixel delta carried to the next move
    private readonly _held: Set<MouseButton>;                      // Buttons this source has pressed and not yet released

    // CONSTRUCTOR :: MouseSourceConfig -> this
    // Creates a detached source; call attach() to start forwarding
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isMouseSourceConfig()
    constructor(config: MouseSourceConfig) {
        if (!isMouseSourceConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "MouseSource config must have a DosInput input, an InputSurface surface, and a positive sensitivity when given.", data: config });
        }
        this._input = config.input;
        this._surface = config.surface;
        this._pointerLock = config.pointerLock ?? null;
        this._scale = config.scale ?? { x: 1, y: 1 };
        this._touch = config.touch ?? "none";
        this._enabled = true;
        this._touchId = null;
        this._listener = (event) => this.handle(event);
        this._sensitivity = MouseSource.DEFAULT_SENSITIVITY;
        this.sensitivity = config.sensitivity ?? MouseSource.DEFAULT_SENSITIVITY;   // mutable: assigned through the validating setter
        this._attached = false;
        this._destroyed = false;
        this._remainderX = 0;
        this._remainderY = 0;
        this._held = new Set();
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> finiteNumber
    // Multiplier applied to raw deltas
    get sensitivity(): FiniteNumber {
        return this._sensitivity;
    }

    // SETTER :: finiteNumber -> VOID
    // Sets the delta multiplier
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a positive finite number
    set sensitivity(value: FiniteNumber) {
        if (!isSensitivity(value)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "sensitivity must be a positive finite number.", data: value });
        }
        this._sensitivity = value;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether pointer events are forwarded; a gate independent of attachment
    get enabled(): boolean {
        return this._enabled;
    }

    // SETTER :: BOOLEAN -> VOID
    // Opens or closes the gate; closing it releases every held button
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a boolean
    set enabled(value: boolean) {
        if (typeof value !== "boolean") throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "enabled must be a boolean.", data: value });
        this._enabled = value;
        if (!value) { this._touchId = null; this.releaseHeld(); }
    }

    // GETTER :: VOID -> mouseTouchMode
    // How touch pointers are treated
    get touch(): MouseTouchMode {
        return this._touch;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the listeners are installed on the surface
    get isAttached(): boolean {
        return this._attached;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the pointer is currently locked to the configured pointerLock element
    get isLocked(): boolean {
        return this._pointerLock !== null && this._pointerLock.ownerDocument.pointerLockElement === (this._pointerLock as unknown as Element);
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: VOID -> VOID
    // Installs the pointer and contextmenu listeners; a no-op when already attached
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "MouseSource has been destroyed." });
        if (this._attached) return;
        for (const type of MouseSource.EVENT_TYPES) this._surface.addEventListener(type, this._listener);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and releases every button this source holds; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        for (const type of MouseSource.EVENT_TYPES) this._surface.removeEventListener(type, this._listener);
        this._attached = false;
        this._touchId = null;
        this.releaseHeld();
    }

    // INSTANCE :: VOID -> VOID
    // Requests pointer lock on the configured element
    // NOTE: Throws DosRuntimeError UNSUPPORTED when no pointerLock was configured
    lock(): void {
        if (this._pointerLock === null) throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "MouseSource has no pointerLock element to lock to." });
        const result = this._pointerLock.requestPointerLock();
        if (result instanceof Promise) result.catch(() => undefined);
    }

    // INSTANCE :: VOID -> VOID
    // Releases pointer lock
    // NOTE: Throws DosRuntimeError UNSUPPORTED when no pointerLock was configured
    unlock(): void {
        if (this._pointerLock === null) throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "MouseSource has no pointerLock element to unlock." });
        this._pointerLock.ownerDocument.exitPointerLock();
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the source destroyed; idempotent
    destroy(): void {
        if (this._destroyed) return;
        this.detach();
        this._destroyed = true;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: event -> VOID
    // Routes one surface event by type: mouse pointers always; touch and pen pointers only in "absolute" touch mode, one at a time
    private handle(event: Event): void {
        if (event.type === "contextmenu") { event.preventDefault(); return; }
        if (!this._enabled) return;
        const pointer = event as PointerEvent;
        if (pointer.pointerType === "mouse") {
            switch (pointer.type) {
                case "pointermove": this.handleMove(pointer); break;
                case "pointerdown": this.handleDown(pointer); break;
                case "pointerup":
                case "pointercancel":
                case "lostpointercapture": this.releaseHeld(); break;
                default: break;
            }
            return;
        }
        if (this._touch !== "absolute") return;
        this.handleTouch(pointer);
    }

    // PRIVATE :: pointerEvent -> VOID
    // Absolute touch cursor: the first touch down positions and presses left, its moves position, its departure releases left
    private handleTouch(pointer: PointerEvent): void {
        if (pointer.type === "pointerdown") {
            if (this._touchId !== null) return;
            this._touchId = pointer.pointerId;
            this.sendPosition(pointer);
            this._input.mouseDown("left");
            this._held.add("left");
            return;
        }
        if (pointer.pointerId !== this._touchId) return;
        if (pointer.type === "pointermove") { this.sendPosition(pointer); return; }
        this._touchId = null;
        this.releaseHeld();
    }

    // PRIVATE :: pointerEvent -> VOID
    // Under pointer lock, forwards movementX/Y as a scaled relative delta; otherwise sends the absolute position over the surface
    // NOTE: Relative deltas are scaled by sensitivity, rounded toward zero, and the sub-pixel remainder carries to the next move
    private handleMove(pointer: PointerEvent): void {
        if (!this.isLocked) {
            this.sendPosition(pointer);
            return;
        }
        const scaledX = pointer.movementX * this._sensitivity + this._remainderX;
        const scaledY = pointer.movementY * this._sensitivity + this._remainderY;
        const dx = Math.trunc(scaledX);
        const dy = Math.trunc(scaledY);
        this._remainderX = scaledX - dx;
        this._remainderY = scaledY - dy;
        if (dx !== 0 || dy !== 0) this._input.mouseMove(dx, dy);
    }

    // PRIVATE :: pointerEvent -> VOID
    // Sends the position first (when unlocked) so the click lands under the pointer, then presses the mapped button
    private handleDown(pointer: PointerEvent): void {
        if (!this.isLocked) this.sendPosition(pointer);
        const button = MouseSource.BUTTON_MAP[pointer.button];
        if (button === undefined) return;
        this._input.mouseDown(button);
        this._held.add(button);
    }

    // PRIVATE :: pointerEvent -> VOID
    // Normalizes the pointer's client position over the surface rect to 0..1 on each axis, applies the scale, clamps, and forwards it
    private sendPosition(pointer: PointerEvent): void {
        const rect = this._surface.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return;
        const clamp = (value: number): number => Math.min(1, Math.max(0, value));
        this._input.mouseMoveTo(clamp((pointer.clientX - rect.left) / rect.width * this._scale.x), clamp((pointer.clientY - rect.top) / rect.height * this._scale.y));
    }

    // PRIVATE :: VOID -> VOID
    // Releases every button this source holds, through the input
    private releaseHeld(): void {
        for (const button of this._held) {
            if (!this._input.isDestroyed) this._input.mouseUp(button);
        }
        this._held.clear();
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: MouseSourceConfig -> mouseSource
    // Mirrors the constructor
    static init(config: MouseSourceConfig): MouseSource {
        return new MouseSource(config);
    }
}
