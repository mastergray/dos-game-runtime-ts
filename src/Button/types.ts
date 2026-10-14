// Type dependencies:
import {
    isFiniteNumber,                                                // Guard for holdDelayMs
    isInputSurface,                                                // Guard for the surface
    isTimerLike,                                                   // Guard for the timer
    type FiniteNumber,                                             // Delay type
    type InputSurface,                                             // Element the button attaches to
    type TimerLike,                                                // Injectable setTimeout pair
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {surface:inputSurface, holdDelayMs:finiteNumber?, timer:timerLike?}
// Construction config: the element to press, how long a press must last to count as a hold, and the timer that measures it.
export interface ButtonConfig {
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly holdDelayMs?: FiniteNumber;                           // Hold delay in ms; non-negative; 400 when omitted
    readonly timer?: TimerLike;                                    // Timer for the hold delay; the globals when omitted (via init)
}

// INTERFACE :: {press:{pointerId:NUMBER}, release:{pointerId:NUMBER}, hold:{pointerId:NUMBER}}
// Event name to payload map for on().
export interface ButtonEvents {
    readonly press: { readonly pointerId: number };               // First pointer went down while not pressed
    readonly release: { readonly pointerId: number };             // Last holding pointer went away
    readonly hold: { readonly pointerId: number };                // Still pressed holdDelayMs after press
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an InputSurface, an optional non-negative finite holdDelayMs and an optional TimerLike
export function isButtonConfig(value: unknown): value is ButtonConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as ButtonConfig;
    return isInputSurface(config.surface)
        && (config.holdDelayMs === undefined || (isFiniteNumber(config.holdDelayMs) && config.holdDelayMs >= 0))
        && (config.timer === undefined || isTimerLike(config.timer));
}
