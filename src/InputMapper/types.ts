// Dependencies:
import DosInput from "../DosInput/DosInput.js";                    // instanceof check for the input field

// Type dependencies:
import {
    isFiniteNumber,                                                // Guards the stick threshold
    isJoystickButton,                                              // Guards joystickButton targets
    isKeyCode,                                                     // Guards key targets and keyWheel codes
    isMouseButton,                                                 // Guards mouseButton targets
    type FiniteNumber,                                             // Stick threshold type
    type JoystickButton,                                           // Button carried by a joystickButton target
    type KeyCode,                                                  // Code carried by a key target and a keyWheel
    type MouseButton,                                              // Button carried by a mouseButton target
} from "../shared.types.js";

/**
 *
 * Type Declarations
 *
 */

// TYPE :: {kind:"key", code:keyCode}
// A keyboard key a mapped gesture holds down.
export type KeyTarget = {
    readonly kind: "key";                                          // Discriminant for the InputTarget union
    readonly code: KeyCode;                                        // DOM KeyboardEvent.code sent through keyDown/keyUp
};

// TYPE :: {kind:"mouseButton", button:mouseButton}
// A mouse button a mapped gesture holds down.
export type MouseButtonTarget = {
    readonly kind: "mouseButton";                                  // Discriminant for the InputTarget union
    readonly button: MouseButton;                                  // Button sent through mouseDown/mouseUp
};

// TYPE :: {kind:"joystickButton", button:joystickButton}
// A joystick button a mapped gesture holds down.
export type JoystickButtonTarget = {
    readonly kind: "joystickButton";                               // Discriminant for the InputTarget union
    readonly button: JoystickButton;                               // Button sent through joystickButtonDown/joystickButtonUp
};

// TYPE :: keyTarget | mouseButtonTarget | joystickButtonTarget
// Anything a pressable gesture can be mapped to; InputMapper.press/release translate it into a DosInput call.
export type InputTarget = KeyTarget | MouseButtonTarget | JoystickButtonTarget;

// INTERFACE :: {up:inputTarget?, down:inputTarget?, left:inputTarget?, right:inputTarget?}
// Direction to target map for a DPad, or for an AnalogStick in keys mode; an absent direction is ignored.
export interface DPadMap {
    readonly up?: InputTarget;                                     // Held while "up" is in the pad's direction set
    readonly down?: InputTarget;                                   // Held while "down" is in the pad's direction set
    readonly left?: InputTarget;                                   // Held while "left" is in the pad's direction set
    readonly right?: InputTarget;                                  // Held while "right" is in the pad's direction set
}

// INTERFACE :: {mode:"joystick"|"keys", keys:dPadMap?, threshold:finiteNumber?}
// How a stick drives the emulator: as joystick axes, or quantized into four directional targets.
export interface AnalogStickMap {
    readonly mode: "joystick" | "keys";                            // "joystick" forwards axes; "keys" presses the keys map like a DPad
    readonly keys?: DPadMap;                                       // Direction targets used in keys mode; unused in joystick mode
    readonly threshold?: FiniteNumber;                             // Per-axis magnitude, in 0 exclusive..1 inclusive, at which a direction holds in keys mode; 0.5 when omitted
}

// INTERFACE :: {move:"mouse"|"none"?, tap:inputTarget?, twoFingerTap:inputTarget?, hold:inputTarget?, twoFingerMove:"none"|{kind:"keyWheel", up:keyCode, down:keyCode}?}
// Trackpad gestures to emulator input; every entry is optional and an unmapped gesture is ignored.
export interface TrackpadMap {
    readonly move?: "mouse" | "none";                              // One-finger move: relative mouse motion, or nothing; "mouse" when omitted
    readonly tap?: InputTarget;                                    // Pressed then released on a one-finger tap
    readonly twoFingerTap?: InputTarget;                           // Pressed then released on a two-finger tap
    readonly hold?: InputTarget;                                   // Held from holdStart to holdEnd
    readonly twoFingerMove?: "none" | {                            // Two-finger drag: nothing, or key presses per 20 px of vertical travel
        readonly kind: "keyWheel";                                 // Discriminant for the key-wheel mapping
        readonly up: KeyCode;                                      // Key pressed per 20 px dragged upward
        readonly down: KeyCode;                                    // Key pressed per 20 px dragged downward
    };
}

// INTERFACE :: {input:dosInput}
// Construction config: the input API every binding forwards to.
export interface InputMapperConfig {
    readonly input: DosInput;                                      // Input API every mapped target is pressed and released on
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a key, mouseButton or joystickButton target carrying a valid code or button for its kind
export function isInputTarget(value: unknown): value is InputTarget {
    if (typeof value !== "object" || value === null) return false;
    const target = value as { kind?: unknown; code?: unknown; button?: unknown };
    switch (target.kind) {
        case "key": return isKeyCode(target.code);
        case "mouseButton": return isMouseButton(target.button);
        case "joystickButton": return isJoystickButton(target.button);
        default: return false;
    }
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a DPadMap: an object whose up, down, left and right are each absent or an InputTarget
export function isDPadMap(value: unknown): value is DPadMap {
    if (typeof value !== "object" || value === null) return false;
    const map = value as Record<string, unknown>;
    return ["up", "down", "left", "right"].every((direction) => map[direction] === undefined || isInputTarget(map[direction]));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is an AnalogStickMap: a joystick or keys mode, an optional DPadMap keys, an optional threshold in 0 exclusive..1 inclusive
export function isAnalogStickMap(value: unknown): value is AnalogStickMap {
    if (typeof value !== "object" || value === null) return false;
    const map = value as { mode?: unknown; keys?: unknown; threshold?: unknown };
    return (map.mode === "joystick" || map.mode === "keys")
        && (map.keys === undefined || isDPadMap(map.keys))
        && (map.threshold === undefined || (isFiniteNumber(map.threshold) && map.threshold > 0 && map.threshold <= 1));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a TrackpadMap: every entry absent or of its declared shape
export function isTrackpadMap(value: unknown): value is TrackpadMap {
    if (typeof value !== "object" || value === null) return false;
    const map = value as { move?: unknown; tap?: unknown; twoFingerTap?: unknown; hold?: unknown; twoFingerMove?: unknown };
    return (map.move === undefined || map.move === "mouse" || map.move === "none")
        && (map.tap === undefined || isInputTarget(map.tap))
        && (map.twoFingerTap === undefined || isInputTarget(map.twoFingerTap))
        && (map.hold === undefined || isInputTarget(map.hold))
        && (map.twoFingerMove === undefined || map.twoFingerMove === "none" || isKeyWheel(map.twoFingerMove));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a DosInput input
export function isInputMapperConfig(value: unknown): value is InputMapperConfig {
    if (typeof value !== "object" || value === null) return false;
    return (value as InputMapperConfig).input instanceof DosInput;
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is the keyWheel form of TrackpadMap.twoFingerMove: kind "keyWheel" with up and down key codes
// NOTE: Module-private; isTrackpadMap delegates to it
function isKeyWheel(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const wheel = value as { kind?: unknown; up?: unknown; down?: unknown };
    return wheel.kind === "keyWheel" && isKeyCode(wheel.up) && isKeyCode(wheel.down);
}
