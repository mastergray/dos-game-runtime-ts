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

// INTERFACE :: {input:dosInput, surface:inputSurface, sensitivity:finiteNumber?, pointerLock:pointerLockLike?}
// Construction config: where mouse events come from, where deltas go, and how to scale them.
export interface MouseSourceConfig {
    readonly input: DosInput;                                      // Input API the deltas and buttons are forwarded to
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly sensitivity?: FiniteNumber;                           // Multiplier applied to deltas; positive; 1 when omitted
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
        && (config.pointerLock === undefined || isPointerLockLike(config.pointerLock))
        && (config.touch === undefined || isMouseTouchMode(config.touch));
}
