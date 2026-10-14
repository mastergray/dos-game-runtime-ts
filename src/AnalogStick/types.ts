// Type dependencies:
import {
    isFiniteNumber,                                                // Guard for deadZone and radius
    isInputSurface,                                                // Guard for the surface
    type FiniteNumber,                                             // Dead zone and radius type
    type InputSurface,                                             // Element the stick attaches to
    type Vector2,                                                  // Emitted value type
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {surface:inputSurface, deadZone:finiteNumber?, radius:finiteNumber?}
// Construction config: the element, the radial dead zone as a fraction, and an optional fixed radius that makes the stick float at the touch point.
export interface AnalogStickConfig {
    readonly surface: InputSurface;                                // Element the pointer listeners attach to
    readonly deadZone?: FiniteNumber;                              // Fraction of the radius with value zero; 0..1; 0.1 when omitted
    readonly radius?: FiniteNumber;                                // Fixed radius in CSS px; when given the origin is the pointerdown point (floating stick)
}

// INTERFACE :: {change:{value:vector2}, release:VOID}
// Event name to payload map for on().
export interface AnalogStickEvents {
    readonly change: { readonly value: Vector2 };                 // The value changed; each axis in -1..1, y positive downward
    readonly release: void;                                        // The driving pointer went away, after the change to zero
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an InputSurface, an optional deadZone in 0..1 and an optional positive radius
export function isAnalogStickConfig(value: unknown): value is AnalogStickConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as AnalogStickConfig;
    return isInputSurface(config.surface)
        && (config.deadZone === undefined || (isFiniteNumber(config.deadZone) && config.deadZone >= 0 && config.deadZone < 1))
        && (config.radius === undefined || (isFiniteNumber(config.radius) && config.radius > 0));
}
