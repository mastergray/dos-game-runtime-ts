// Type dependencies:
import {
    isFiniteNumber,                                                // Guard for the numeric options
    isInputSurface,                                                // Guard for the surface
    isTimerLike,                                                   // Guard for the timer
    type FiniteNumber,                                             // Numeric option type
    type InputSurface,                                             // Element the trackpad attaches to
    type TimerLike,                                                // Injectable setTimeout pair
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {surface:inputSurface, sensitivity:finiteNumber?, tapMaxMs:finiteNumber?, tapMaxDistance:finiteNumber?, holdDelayMs:finiteNumber?, timer:timerLike?}
// Construction config: the touch surface and the thresholds that separate moves, taps and holds.
export interface TrackpadConfig {
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly sensitivity?: FiniteNumber;                           // Multiplier applied to move deltas; positive; 1 when omitted
    readonly tapMaxMs?: FiniteNumber;                              // Longest gesture that still counts as a tap; 250 when omitted
    readonly tapMaxDistance?: FiniteNumber;                        // Farthest a pointer may travel and still tap or hold, in CSS px; 10 when omitted
    readonly holdDelayMs?: FiniteNumber;                           // Delay before a still gesture becomes a hold; 400 when omitted
    readonly timer?: TimerLike;                                    // Timer for the hold delay; the globals when omitted (via init)
}

// INTERFACE :: {move:{dx:finiteNumber, dy:finiteNumber, pointers:NUMBER}, tap:{pointers:NUMBER}, holdStart:{pointers:NUMBER}, holdEnd:{pointers:NUMBER}}
// Event name to payload map for on().
export interface TrackpadEvents {
    readonly move: { readonly dx: FiniteNumber; readonly dy: FiniteNumber; readonly pointers: number };   // Primary pointer moved; integer deltas scaled by sensitivity
    readonly tap: { readonly pointers: number };                  // Gesture ended quickly without travel; pointers is the peak simultaneous count
    readonly holdStart: { readonly pointers: number };            // Gesture stayed still for holdDelayMs
    readonly holdEnd: { readonly pointers: number };              // A held gesture ended
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an InputSurface, optional positive sensitivity, optional non-negative tapMaxMs, tapMaxDistance and holdDelayMs, and an optional TimerLike
export function isTrackpadConfig(value: unknown): value is TrackpadConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as TrackpadConfig;
    const nonNegative = (option: unknown): boolean => option === undefined || (isFiniteNumber(option) && option >= 0);
    return isInputSurface(config.surface)
        && (config.sensitivity === undefined || (isFiniteNumber(config.sensitivity) && config.sensitivity > 0))
        && nonNegative(config.tapMaxMs)
        && nonNegative(config.tapMaxDistance)
        && nonNegative(config.holdDelayMs)
        && (config.timer === undefined || isTimerLike(config.timer));
}
