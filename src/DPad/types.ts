// Type dependencies:
import {
    isFiniteNumber,                                                // Guard for deadZone
    isInputSurface,                                                // Guard for the surface
    type FiniteNumber,                                             // Dead zone type
    type InputSurface,                                             // Element the pad attaches to
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "up" | "down" | "left" | "right"
// Closed set of D-pad directions.
export type DPadDirection = "up" | "down" | "left" | "right";

// INTERFACE :: {surface:inputSurface, deadZone:finiteNumber?, diagonals:BOOLEAN?}
// Construction config: the element to press, the central dead zone as a fraction of the radius, and whether diagonals produce two directions.
export interface DPadConfig {
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly deadZone?: FiniteNumber;                              // Fraction of the radius with no direction; 0..1; 0.2 when omitted
    readonly diagonals?: boolean;                                  // Whether both axes may be active at once; false when omitted
}

// INTERFACE :: {change:{directions:[dPadDirection]}, press:{direction:dPadDirection}, release:{direction:dPadDirection}}
// Event name to payload map for on().
export interface DPadEvents {
    readonly change: { readonly directions: ReadonlyArray<DPadDirection> };   // The active set changed; sorted up, down, left, right
    readonly press: { readonly direction: DPadDirection };        // A direction entered the active set
    readonly release: { readonly direction: DPadDirection };      // A direction left the active set
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the DPadDirection literals
export function isDPadDirection(value: unknown): value is DPadDirection {
    return value === "up" || value === "down" || value === "left" || value === "right";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an InputSurface, an optional deadZone in 0..1 and an optional boolean diagonals
export function isDPadConfig(value: unknown): value is DPadConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as DPadConfig;
    return isInputSurface(config.surface)
        && (config.deadZone === undefined || (isFiniteNumber(config.deadZone) && config.deadZone >= 0 && config.deadZone <= 1))
        && (config.diagonals === undefined || typeof config.diagonals === "boolean");
}
