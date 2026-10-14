// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for rejected maps and binds after destroy()

// Type dependencies:
import type AnalogStick from "../AnalogStick/AnalogStick.js";      // Stick whose change/release events bindAnalogStick subscribes to
import type Button from "../Button/Button.js";                     // Button whose press/release events bindButton subscribes to
import type DosInput from "../DosInput/DosInput.js";               // Input API every mapped target is forwarded to
import type DPad from "../DPad/DPad.js";                           // Pad whose press/release events bindDPad subscribes to
import type { DPadDirection } from "../DPad/types.js";             // Direction names keyed into a DPadMap
import type Trackpad from "../Trackpad/Trackpad.js";               // Trackpad whose move/tap/hold events bindTrackpad subscribes to
import {
    isKeyCode,                                                     // Guards the code passed to bindKey
    type FiniteNumber,                                             // Threshold and wheel accumulator type
    type KeyCode,                                                  // Code passed to bindKey
    type Unsubscribe,                                              // Returned by every bind method and by the primitives' on()
    type Vector2,                                                  // Stick value quantized in keys mode
} from "../shared.types.js";
import {
    isAnalogStickMap,                                              // Guards the map passed to bindAnalogStick
    isDPadMap,                                                     // Guards the map passed to bindDPad
    isInputMapperConfig,                                           // Guards the construction config
    isInputTarget,                                                 // Guards targets passed to bindButton, bindKey, press and release
    isTrackpadMap,                                                 // Guards the map passed to bindTrackpad
    type AnalogStickMap,                                           // Map accepted by bindAnalogStick
    type DPadMap,                                                  // Map accepted by bindDPad
    type InputMapperConfig,                                        // Construction config shape
    type InputTarget,                                              // What a gesture is mapped to
    type TrackpadMap,                                              // Map accepted by bindTrackpad
} from "./types.js";

/**
 *
 * Class
 *
 */

// Wires pointer primitives to DosInput according to a deployment-supplied map, and releases whatever a binding holds when it is removed
export default class InputMapper {

    /* Static Fields */
    static readonly DEFAULT_THRESHOLD: FiniteNumber = 0.5;         // Stick keys-mode per-axis magnitude when the map omits threshold
    static readonly WHEEL_STEP_PX: FiniteNumber = 20;              // Accumulated two-finger dy that fires one keyWheel press
    static readonly DIRECTIONS: ReadonlyArray<DPadDirection> = ["up", "down", "left", "right"];   // Direction order used by keys-mode quantization

    /* Instance Fields */
    private readonly _input: DosInput;                             // Input API every target is pressed and released on
    private readonly _bindings: Set<Unsubscribe>;                  // Teardown of every live binding; its size is the bindings count
    private readonly _keyTargets: Map<KeyCode, InputTarget>;       // bindKey records: physical code to remapped target
    private readonly _keyTeardowns: Map<KeyCode, Unsubscribe>;     // bindKey records: physical code to the teardown of its record
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: InputMapperConfig -> this
    // Creates a mapper with no bindings over the given DosInput
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isInputMapperConfig()
    constructor(config: InputMapperConfig) {
        if (!isInputMapperConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "InputMapper config must have a DosInput input.", data: config });
        }
        this._input = config.input;
        this._bindings = new Set();
        this._keyTargets = new Map();
        this._keyTeardowns = new Map();
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> NUMBER
    // Number of live bindings, bindKey records included
    get bindings(): number {
        return this._bindings.size;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: button, inputTarget -> unsubscribe
    // Presses target on the button's press and releases it on its release; hold is not mapped
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when target fails isInputTarget(), DESTROYED after destroy()
    bindButton(button: Button, target: InputTarget): Unsubscribe {
        this.assertLive();
        if (!isInputTarget(target)) throw InputMapper.invalidConfig("bindButton requires an InputTarget.", target);
        const held = new Set<InputTarget>();
        return this.register([
            button.on("press", () => this.hold(held, target)),
            button.on("release", () => this.letGo(held, target)),
        ], held);
    }

    // INSTANCE :: dPad, dPadMap -> unsubscribe
    // Presses and releases the mapped target for each direction the pad presses and releases; unmapped directions are ignored
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when map fails isDPadMap(), DESTROYED after destroy()
    bindDPad(dpad: DPad, map: DPadMap): Unsubscribe {
        this.assertLive();
        if (!isDPadMap(map)) throw InputMapper.invalidConfig("bindDPad requires a DPadMap.", map);
        const held = new Set<InputTarget>();
        return this.register([
            dpad.on("press", (event) => { const target = map[event.direction]; if (target !== undefined) this.hold(held, target); }),
            dpad.on("release", (event) => { const target = map[event.direction]; if (target !== undefined) this.letGo(held, target); }),
        ], held);
    }

    // INSTANCE :: analogStick, analogStickMap -> unsubscribe
    // Joystick mode forwards the value as both axes and zeroes them on release; keys mode quantizes each axis by threshold and holds the keys map's targets like a DPad
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when map fails isAnalogStickMap(), DESTROYED after destroy()
    bindAnalogStick(stick: AnalogStick, map: AnalogStickMap): Unsubscribe {
        this.assertLive();
        if (!isAnalogStickMap(map)) throw InputMapper.invalidConfig("bindAnalogStick requires an AnalogStickMap.", map);
        const held = new Set<InputTarget>();
        if (map.mode === "joystick") {
            let deflected = false;
            const zero = (): void => {
                if (!deflected || this._input.isDestroyed) return;
                this._input.joystickAxis("x", 0);
                this._input.joystickAxis("y", 0);
                deflected = false;
            };
            return this.register([
                stick.on("change", (event: { readonly value: Vector2 }) => {
                    this._input.joystickAxis("x", event.value.x);
                    this._input.joystickAxis("y", event.value.y);
                    deflected = event.value.x !== 0 || event.value.y !== 0;
                }),
                stick.on("release", () => { deflected = true; zero(); }),
            ], held, zero);
        }
        const keys = map.keys ?? {};
        const threshold = map.threshold ?? InputMapper.DEFAULT_THRESHOLD;
        let active: ReadonlyArray<DPadDirection> = [];
        const apply = (next: ReadonlyArray<DPadDirection>): void => {
            for (const direction of active) {
                const target = keys[direction];
                if (!next.includes(direction) && target !== undefined) this.letGo(held, target);
            }
            for (const direction of next) {
                const target = keys[direction];
                if (!active.includes(direction) && target !== undefined) this.hold(held, target);
            }
            active = next;
        };
        return this.register([
            stick.on("change", (event: { readonly value: Vector2 }) => apply(InputMapper.directionsOf(event.value, threshold))),
            stick.on("release", () => apply([])),
        ], held, () => { active = []; });
    }

    // INSTANCE :: trackpad, trackpadMap -> unsubscribe
    // Forwards one-finger moves as mouse motion, two-finger vertical drags as keyWheel presses, taps as press-then-release, and holdStart/holdEnd as press/release of hold
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when map fails isTrackpadMap(), DESTROYED after destroy()
    bindTrackpad(trackpad: Trackpad, map: TrackpadMap): Unsubscribe {
        this.assertLive();
        if (!isTrackpadMap(map)) throw InputMapper.invalidConfig("bindTrackpad requires a TrackpadMap.", map);
        const held = new Set<InputTarget>();
        const move = map.move ?? "mouse";
        const wheel = map.twoFingerMove;
        let wheelDy: FiniteNumber = 0;
        return this.register([
            trackpad.on("move", (event: { readonly dx: FiniteNumber; readonly dy: FiniteNumber; readonly pointers: number }) => {
                if (event.pointers !== 2) wheelDy = 0;
                if (event.pointers === 1 && move === "mouse") {
                    this._input.mouseMove(event.dx, event.dy);
                } else if (event.pointers === 2 && wheel !== undefined && wheel !== "none") {
                    wheelDy += event.dy;
                    if (wheelDy <= -InputMapper.WHEEL_STEP_PX) { wheelDy = 0; this._input.keyPress(wheel.up); }
                    else if (wheelDy >= InputMapper.WHEEL_STEP_PX) { wheelDy = 0; this._input.keyPress(wheel.down); }
                }
            }),
            trackpad.on("tap", (event: { readonly pointers: number }) => {
                const target = event.pointers === 1 ? map.tap : event.pointers === 2 ? map.twoFingerTap : undefined;
                if (target === undefined) return;
                this.hold(held, target);
                this.letGo(held, target);
            }),
            trackpad.on("holdStart", () => { if (map.hold !== undefined) this.hold(held, map.hold); }),
            trackpad.on("holdEnd", () => { if (map.hold !== undefined) this.letGo(held, map.hold); }),
        ], held, () => { wheelDy = 0; });
    }

    // INSTANCE :: keyCode, inputTarget -> unsubscribe
    // Records that code is remapped to target; nothing consults the record automatically
    // NOTE: Binding a code already bound replaces its record and retires the previous binding
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad code or target, DESTROYED after destroy()
    bindKey(code: KeyCode, target: InputTarget): Unsubscribe {
        this.assertLive();
        if (!isKeyCode(code)) throw InputMapper.invalidConfig("bindKey requires a KeyCode.", code);
        if (!isInputTarget(target)) throw InputMapper.invalidConfig("bindKey requires an InputTarget.", target);
        this._keyTeardowns.get(code)?.();
        this._keyTargets.set(code, target);
        const teardown = this.register([], new Set(), () => {
            if (this._keyTeardowns.get(code) !== teardown) return;
            this._keyTargets.delete(code);
            this._keyTeardowns.delete(code);
        });
        this._keyTeardowns.set(code, teardown);
        return teardown;
    }

    // INSTANCE :: VOID -> VOID
    // Removes every binding, releasing whatever each holds
    unbindAll(): void {
        for (const teardown of [...this._bindings]) teardown();
    }

    // INSTANCE :: VOID -> VOID
    // Removes every binding and rejects further binds; idempotent
    destroy(): void {
        if (this._destroyed) return;
        this.unbindAll();
        this._destroyed = true;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> VOID
    // Throws when the mapper has been destroyed
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    private assertLive(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "InputMapper has been destroyed." });
    }

    // PRIVATE :: [unsubscribe], {inputTarget}, (VOID -> VOID)? -> unsubscribe
    // Records a live binding and returns its idempotent teardown: unsubscribe from the primitive, release every held target, run cleanup, forget the binding
    private register(subscriptions: ReadonlyArray<Unsubscribe>, held: Set<InputTarget>, cleanup?: () => void): Unsubscribe {
        let done = false;
        const teardown: Unsubscribe = () => {
            if (done) return;
            done = true;
            for (const unsubscribe of subscriptions) unsubscribe();
            for (const target of [...held]) this.letGo(held, target);
            cleanup?.();
            this._bindings.delete(teardown);
        };
        this._bindings.add(teardown);
        return teardown;
    }

    // PRIVATE :: {inputTarget}, inputTarget -> VOID
    // Presses target and records it as held by the binding owning held
    private hold(held: Set<InputTarget>, target: InputTarget): void {
        InputMapper.press(this._input, target);
        held.add(target);
    }

    // PRIVATE :: {inputTarget}, inputTarget -> VOID
    // Releases target, unless the input is destroyed, and forgets it as held
    private letGo(held: Set<InputTarget>, target: InputTarget): void {
        held.delete(target);
        if (!this._input.isDestroyed) InputMapper.release(this._input, target);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: InputMapperConfig -> inputMapper
    // Mirrors the constructor
    static init(config: InputMapperConfig): InputMapper {
        return new InputMapper(config);
    }

    // STATIC :: dosInput, inputTarget -> VOID
    // Presses target: key -> keyDown, mouseButton -> mouseDown, joystickButton -> joystickButtonDown
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when target fails isInputTarget(); DosInput errors propagate
    static press(input: DosInput, target: InputTarget): void {
        if (!isInputTarget(target)) throw InputMapper.invalidConfig("press requires an InputTarget.", target);
        switch (target.kind) {
            case "key": input.keyDown(target.code); return;
            case "mouseButton": input.mouseDown(target.button); return;
            case "joystickButton": input.joystickButtonDown(target.button); return;
        }
    }

    // STATIC :: dosInput, inputTarget -> VOID
    // Releases target: key -> keyUp, mouseButton -> mouseUp, joystickButton -> joystickButtonUp
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when target fails isInputTarget(); DosInput errors propagate
    static release(input: DosInput, target: InputTarget): void {
        if (!isInputTarget(target)) throw InputMapper.invalidConfig("release requires an InputTarget.", target);
        switch (target.kind) {
            case "key": input.keyUp(target.code); return;
            case "mouseButton": input.mouseUp(target.button); return;
            case "joystickButton": input.joystickButtonUp(target.button); return;
        }
    }

    // STATIC :: vector2, finiteNumber -> [dPadDirection]
    // Quantizes a stick value into directions, in DIRECTIONS order: an axis at or beyond threshold in magnitude holds its direction
    // NOTE: Negative y is up, matching screen coordinates
    private static directionsOf(value: Vector2, threshold: FiniteNumber): ReadonlyArray<DPadDirection> {
        return InputMapper.DIRECTIONS.filter((direction) => {
            switch (direction) {
                case "up": return value.y <= -threshold;
                case "down": return value.y >= threshold;
                case "left": return value.x <= -threshold;
                case "right": return value.x >= threshold;
            }
        });
    }

    // STATIC :: STRING, UNKNOWN -> dosRuntimeError
    // Builds the INVALID_CONFIG error carrying the rejected value
    private static invalidConfig(message: string, data: unknown): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message, data });
    }
}
