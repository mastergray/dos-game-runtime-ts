// Type dependencies:
import {
    isEmulatorSession,                                             // Guards the session the input forwards to
    type EmulatorSession,                                          // Session the input forwards to
    type FiniteNumber,                                             // Axis values in the snapshot
    type JoystickAxis,                                             // Keys of the snapshot's joystickAxes
    type JoystickButton,                                           // Held joystick buttons in the snapshot
    type KeyCode,                                                  // Held keys in the snapshot
    type MouseButton,                                              // Held mouse buttons in the snapshot
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {session:emulatorSession}
// Construction config: the session every input call is forwarded to.
export interface DosInputConfig {
    readonly session: EmulatorSession;                             // Running emulator session
}

// INTERFACE :: {keysDown:[keyCode], mouseButtonsDown:[mouseButton], joystickButtonsDown:[joystickButton], joystickAxes:ARRAY<joystickAxis, finiteNumber>}
// What is currently held, as a fresh plain object on every read.
export interface DosInputSnapshot {
    readonly keysDown: ReadonlyArray<KeyCode>;                     // Held keys, sorted
    readonly mouseButtonsDown: ReadonlyArray<MouseButton>;         // Held mouse buttons, in press order
    readonly joystickButtonsDown: ReadonlyArray<JoystickButton>;   // Held joystick buttons, in press order
    readonly joystickAxes: Readonly<Record<JoystickAxis, FiniteNumber>>;   // Last value sent per axis; 0 when never sent
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is an object whose session passes isEmulatorSession
export function isDosInputConfig(value: unknown): value is DosInputConfig {
    return typeof value === "object" && value !== null
        && isEmulatorSession((value as DosInputConfig).session);
}
