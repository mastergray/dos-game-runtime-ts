// Dependencies:
import DosInput from "../DosInput/DosInput.js";                    // instanceof check for the input field

// Type dependencies:
import { isGestureSourceLike, type GestureSourceLike } from "../DosAudio/types.js";   // Element shape the source listens on, and its guard
import type { KeyCode } from "../shared.types.js";                                     // Argument type of the filter

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {input:dosInput, target:gestureSourceLike, filter:(keyCode -> BOOLEAN)?, preventDefault:BOOLEAN?}
// Construction config: where physical key events come from and where they go.
export interface KeyboardSourceConfig {
    readonly input: DosInput;                                      // Input API the key events are forwarded to
    readonly target: GestureSourceLike;                            // Element or document the listeners attach to
    readonly filter?: (code: KeyCode) => boolean;                  // When given, a code it rejects is ignored and not prevented
    readonly preventDefault?: boolean;                             // Whether handled events are preventDefault()ed; true when omitted
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a DosInput, a listener-bearing target, an optional function filter and an optional boolean preventDefault
export function isKeyboardSourceConfig(value: unknown): value is KeyboardSourceConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as KeyboardSourceConfig;
    return config.input instanceof DosInput
        && isGestureSourceLike(config.target)
        && (config.filter === undefined || typeof config.filter === "function")
        && (config.preventDefault === undefined || typeof config.preventDefault === "boolean");
}
