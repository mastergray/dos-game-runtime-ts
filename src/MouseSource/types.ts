// Dependencies:
import DosInput from "../DosInput/DosInput.js";                    // instanceof check for the input field

// Type dependencies:
import { isFiniteNumber, isInputSurface, type FiniteNumber, type InputSurface } from "../shared.types.js";   // Surface and sensitivity types and guards

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "none" | "absolute"
// How touch pointers are treated: ignored, or as an absolute "touch where you want to point" cursor with tap as left click.
export type MouseTouchMode = "none" | "absolute";

// INTERFACE :: {requestPointerLock:(VOID -> VOID|PROMISE(VOID)), ownerDocument:{exitPointerLock:(VOID -> VOID), pointerLockElement:Element?}}
// The subset of an element's Pointer Lock API the source uses; a real element satisfies it.
export interface PointerLockLike {
    requestPointerLock(): void | Promise<void>;                    // Asks the browser to lock the pointer to this element
    readonly ownerDocument: {                                      // Document that reports and releases the lock
        exitPointerLock(): void;                                   // Releases the lock
        readonly pointerLockElement: Element | null;               // The locked element, or null when unlocked
    };
}

// INTERFACE :: {x:finiteNumber, y:finiteNumber}
// Per-axis multipliers for absolute positions, for a game that reads the driver's position on a different scale than the
// screen: a 320-pixel-wide game that takes the driver's doubled x range as pixels needs x 0.5.
export interface MouseScale {
    readonly x: FiniteNumber;                                      // Positive
    readonly y: FiniteNumber;                                      // Positive
}

// INTERFACE :: {x:finiteNumber, y:finiteNumber}
// Per-axis shifts, as fractions of the surface, added to absolute positions after the scale and before clamping, for a game
// that draws its cursor away from the driver's position: positive x moves the game's cursor right.
export interface MouseOffset {
    readonly x: FiniteNumber;
    readonly y: FiniteNumber;
}

// INTERFACE :: {input:dosInput, surface:inputSurface, sensitivity:finiteNumber?, scale:mouseScale?, offset:mouseOffset?, pointerLock:pointerLockLike?}
// Construction config: where mouse events come from, where deltas go, and how to scale them.
export interface MouseSourceConfig {
    readonly input: DosInput;                                      // Input API the deltas and buttons are forwarded to
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly sensitivity?: FiniteNumber;                           // Multiplier applied to deltas; positive; 1 when omitted
    readonly scale?: MouseScale;                                   // Multipliers applied to absolute positions; 1 and 1 when omitted
    readonly offset?: MouseOffset;                                 // Shifts added to absolute positions; 0 and 0 when omitted
    readonly pointerLock?: PointerLockLike;                        // Element to lock the pointer to; lock() throws UNSUPPORTED when omitted
    readonly touch?: MouseTouchMode;                               // Touch handling; "none" when omitted
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a positive finite number, the rule for sensitivity
export function isSensitivity(value: unknown): value is FiniteNumber {
    return isFiniteNumber(value) && value > 0;
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a MouseScale: positive finite x and y
export function isMouseScale(value: unknown): value is MouseScale {
    if (typeof value !== "object" || value === null) return false;
    const scale = value as MouseScale;
    return isSensitivity(scale.x) && isSensitivity(scale.y);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a MouseOffset: finite x and y
export function isMouseOffset(value: unknown): value is MouseOffset {
    if (typeof value !== "object" || value === null) return false;
    const offset = value as MouseOffset;
    return isFiniteNumber(offset.x) && isFiniteNumber(offset.y);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the MouseTouchMode literals
export function isMouseTouchMode(value: unknown): value is MouseTouchMode {
    return value === "none" || value === "absolute";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a requestPointerLock function and an ownerDocument with exitPointerLock
export function isPointerLockLike(value: unknown): value is PointerLockLike {
    if (typeof value !== "object" || value === null) return false;
    const target = value as PointerLockLike;
    return typeof target.requestPointerLock === "function"
        && typeof target.ownerDocument === "object" && target.ownerDocument !== null
        && typeof target.ownerDocument.exitPointerLock === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a DosInput, an InputSurface, an optional positive finite sensitivity and an optional PointerLockLike
export function isMouseSourceConfig(value: unknown): value is MouseSourceConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as MouseSourceConfig;
    return config.input instanceof DosInput
        && isInputSurface(config.surface)
        && (config.sensitivity === undefined || isSensitivity(config.sensitivity))
        && (config.scale === undefined || isMouseScale(config.scale))
        && (config.offset === undefined || isMouseOffset(config.offset))
        && (config.pointerLock === undefined || isPointerLockLike(config.pointerLock))
        && (config.touch === undefined || isMouseTouchMode(config.touch));
}
