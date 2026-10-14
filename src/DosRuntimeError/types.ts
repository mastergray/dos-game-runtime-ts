// Type dependencies:
import { isNonEmptyString, type NonEmptyString } from "../shared.types.js";   // Non-empty string type and its guard

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {code:NUMBER, message:nonEmptyString, data:UNKNOWN?}
// Construction config accepted by the constructor and init().
export interface DosRuntimeErrorConfig {
    readonly code: number;                                         // Registry code; validated by the constructor
    readonly message: NonEmptyString;                              // Human-readable message; must say something
    readonly data?: unknown;                                       // Detail of any kind; null when omitted
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is an object with a numeric code and a non-empty message; data carries no condition
export function isDosRuntimeErrorConfig(value: unknown): value is DosRuntimeErrorConfig {
    return typeof value === "object" && value !== null
        && typeof (value as DosRuntimeErrorConfig).code === "number"
        && isNonEmptyString((value as DosRuntimeErrorConfig).message);
}
