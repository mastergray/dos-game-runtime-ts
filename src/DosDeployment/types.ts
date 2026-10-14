// Dependencies:
import DosStorage from "../DosStorage/DosStorage.js";                 // instanceof check for the storage field

// Type dependencies:
import {
    isEmulatorAdapter,                                             // Guards the optional adapter
    isFiniteNumber,                                                // Guards every numeric control option
    isInputSurface,                                                // Guards every control's surface
    type EmulatorAdapter,                                          // Emulator backend handed to the player
    type FiniteNumber,                                             // Numeric control option type
    type InputSurface,                                             // Element a control's primitive attaches to
    type KeyCode,                                                  // Argument type of the keyboard filter
} from "../shared.types.js";
import {
    isDosGameConfig,                                               // Guards the game description
    type DosGameConfig,                                            // Bundle, overlay and display options for the player
    type FetchLike,                                                // Bundle loader handed to the player
} from "../DosPlayer/types.js";
import {
    isAnalogStickMap,                                              // Guards a stick control's map
    isDPadMap,                                                     // Guards a d-pad control's map
    isInputTarget,                                                 // Guards a button control's target and hold
    isTrackpadMap,                                                 // Guards a trackpad control's map
    type AnalogStickMap,                                           // What a stick control drives
    type DPadMap,                                                  // What a d-pad control drives
    type InputTarget,                                              // What a button control presses
    type TrackpadMap,                                              // What a trackpad control drives
} from "../InputMapper/types.js";
import {
    isMouseScale,                                                  // Guards the mouse control's absolute scale
    isMouseTouchMode,                                              // Guards the mouse control's touch mode
    type MouseScale,                                               // Per-axis multipliers for absolute positions
    type MouseTouchMode,                                           // How the mouse source treats touch pointers
} from "../MouseSource/types.js";
import {
    isGestureSourceLike,                                           // Guards the optional keyboard target
    type GestureSourceLike,                                        // Element or document the keyboard source listens on
} from "../DosAudio/types.js";

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {enabled:BOOLEAN?, filter:(keyCode -> BOOLEAN)?, preventDefault:BOOLEAN?}
// Keyboard source options for a deployment; its presence in the controls is what turns the keyboard on.
export interface KeyboardControl {
    readonly enabled?: boolean;                                    // Initial enable gate of the source; true when omitted
    readonly filter?: (code: KeyCode) => boolean;                  // Codes it rejects are left to the page
    readonly preventDefault?: boolean;                             // Whether handled key events are prevented; true when omitted
}

// INTERFACE :: {enabled:BOOLEAN?, sensitivity:finiteNumber?, scale:mouseScale?, touch:mouseTouchMode?, pointerLock:BOOLEAN?}
// Mouse source options for a deployment; the source listens on the canvas.
export interface MouseControl {
    readonly enabled?: boolean;                                    // Initial enable gate of the source; true when omitted
    readonly sensitivity?: FiniteNumber;                           // Positive multiplier for locked deltas; 1 when omitted
    readonly scale?: MouseScale;                                   // Positive multipliers for absolute positions; 1 and 1 when omitted
    readonly touch?: MouseTouchMode;                               // Touch handling; "none" when omitted
    readonly pointerLock?: boolean;                                // When true, the canvas is the source's pointer lock target
}

// INTERFACE :: {surface:inputSurface, target:inputTarget, hold:inputTarget?, holdDelayMs:finiteNumber?}
// An on-screen button: the surface it listens on and what pressing and holding it means.
export interface ButtonControl {
    readonly surface: InputSurface;                                // Element the Button attaches to
    readonly target: InputTarget;                                  // Held while the button is pressed
    readonly hold?: InputTarget;                                   // Held from the button's hold event until its release
    readonly holdDelayMs?: FiniteNumber;                           // Non-negative delay before hold fires; the Button default when omitted
}

// INTERFACE :: {surface:inputSurface, map:dPadMap, deadZone:finiteNumber?, diagonals:BOOLEAN?}
// An on-screen d-pad: the surface it listens on and the target of each direction.
export interface DPadControl {
    readonly surface: InputSurface;                                // Element the DPad attaches to
    readonly map: DPadMap;                                         // Direction to target map
    readonly deadZone?: FiniteNumber;                              // Dead zone in 0..1; the DPad default when omitted
    readonly diagonals?: boolean;                                  // Whether two directions may hold at once; false when omitted
}

// INTERFACE :: {surface:inputSurface, map:analogStickMap, deadZone:finiteNumber?, radius:finiteNumber?}
// An on-screen analog stick: the surface it listens on and how its value reaches the emulator.
export interface StickControl {
    readonly surface: InputSurface;                                // Element the AnalogStick attaches to
    readonly map: AnalogStickMap;                                  // Joystick axes or quantized keys
    readonly deadZone?: FiniteNumber;                              // Dead zone in 0 inclusive..1 exclusive; the stick default when omitted
    readonly radius?: FiniteNumber;                                // Positive radius in CSS px; makes the stick floating when given
}

// INTERFACE :: {surface:inputSurface, map:trackpadMap, sensitivity:finiteNumber?, tapMaxMs:finiteNumber?, tapMaxDistance:finiteNumber?, holdDelayMs:finiteNumber?}
// An on-screen trackpad: the surface it listens on and what its gestures mean.
export interface TrackpadControl {
    readonly surface: InputSurface;                                // Element the Trackpad attaches to
    readonly map: TrackpadMap;                                     // Gesture to input map
    readonly sensitivity?: FiniteNumber;                           // Positive move multiplier; the Trackpad default when omitted
    readonly tapMaxMs?: FiniteNumber;                              // Non-negative longest tap; the Trackpad default when omitted
    readonly tapMaxDistance?: FiniteNumber;                        // Non-negative largest tap travel in CSS px; the Trackpad default when omitted
    readonly holdDelayMs?: FiniteNumber;                           // Non-negative delay before holdStart; the Trackpad default when omitted
}

// INTERFACE :: {keyboard:keyboardControl?, mouse:mouseControl?, buttons:[buttonControl]?, dpads:[dPadControl]?, sticks:[stickControl]?, trackpads:[trackpadControl]?}
// Every control of a deployment; an absent entry constructs nothing.
export interface ControlsConfig {
    readonly keyboard?: KeyboardControl;                           // Physical keyboard; absent means no KeyboardSource
    readonly mouse?: MouseControl;                                 // Physical mouse on the canvas; absent means no MouseSource
    readonly buttons?: ReadonlyArray<ButtonControl>;               // On-screen buttons
    readonly dpads?: ReadonlyArray<DPadControl>;                   // On-screen d-pads
    readonly sticks?: ReadonlyArray<StickControl>;                 // On-screen analog sticks
    readonly trackpads?: ReadonlyArray<TrackpadControl>;           // On-screen trackpads
}

// INTERFACE :: {canvas:HTMLCanvasElement, container:HTMLElement, game:dosGameConfig, controls:controlsConfig?, keyboardTarget:gestureSourceLike?, adapter:emulatorAdapter?, fetch:fetchLike?}
// One game page: the display, the bundle and every control.
// NOTE: adapter is optional here because init() fills it; the constructor rejects a config without one.
export interface DosDeploymentConfig {
    readonly canvas: HTMLCanvasElement;                            // Canvas the emulator draws into and the mouse listens on
    readonly container: HTMLElement;                               // Element the canvas fits inside and the audio unlock listens on
    readonly game: DosGameConfig;                                  // Bundle, overlay and display options
    readonly controls?: ControlsConfig;                            // Controls built at start; none when omitted
    readonly keyboardTarget?: GestureSourceLike;                   // Where the keyboard source listens; container.ownerDocument when omitted
    readonly adapter?: EmulatorAdapter;                            // Emulator backend; required by the constructor, filled by init()
    readonly fetch?: FetchLike;                                    // Loader for a bundle URL; globalThis.fetch when omitted
    readonly storage?: DosStorage;                                 // Saves storage; init() restores its overlay and save() writes to it
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a KeyboardControl: optional boolean enabled, function filter and boolean preventDefault
export function isKeyboardControl(value: unknown): value is KeyboardControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as KeyboardControl;
    return (control.enabled === undefined || typeof control.enabled === "boolean")
        && (control.filter === undefined || typeof control.filter === "function")
        && (control.preventDefault === undefined || typeof control.preventDefault === "boolean");
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a MouseControl: optional boolean enabled, positive finite sensitivity, MouseTouchMode touch and boolean pointerLock
export function isMouseControl(value: unknown): value is MouseControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as MouseControl;
    return (control.enabled === undefined || typeof control.enabled === "boolean")
        && (control.sensitivity === undefined || (isFiniteNumber(control.sensitivity) && control.sensitivity > 0))
        && (control.scale === undefined || isMouseScale(control.scale))
        && (control.touch === undefined || isMouseTouchMode(control.touch))
        && (control.pointerLock === undefined || typeof control.pointerLock === "boolean");
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a ButtonControl: an InputSurface, an InputTarget target, an optional InputTarget hold and an optional non-negative finite holdDelayMs
export function isButtonControl(value: unknown): value is ButtonControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as ButtonControl;
    return isInputSurface(control.surface)
        && isInputTarget(control.target)
        && (control.hold === undefined || isInputTarget(control.hold))
        && (control.holdDelayMs === undefined || (isFiniteNumber(control.holdDelayMs) && control.holdDelayMs >= 0));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a DPadControl: an InputSurface, a DPadMap, an optional deadZone in 0..1 and an optional boolean diagonals
export function isDPadControl(value: unknown): value is DPadControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as DPadControl;
    return isInputSurface(control.surface)
        && isDPadMap(control.map)
        && (control.deadZone === undefined || (isFiniteNumber(control.deadZone) && control.deadZone >= 0 && control.deadZone <= 1))
        && (control.diagonals === undefined || typeof control.diagonals === "boolean");
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a StickControl: an InputSurface, an AnalogStickMap, an optional deadZone in 0 inclusive..1 exclusive and an optional positive radius
export function isStickControl(value: unknown): value is StickControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as StickControl;
    return isInputSurface(control.surface)
        && isAnalogStickMap(control.map)
        && (control.deadZone === undefined || (isFiniteNumber(control.deadZone) && control.deadZone >= 0 && control.deadZone < 1))
        && (control.radius === undefined || (isFiniteNumber(control.radius) && control.radius > 0));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a TrackpadControl: an InputSurface, a TrackpadMap, an optional positive sensitivity and optional non-negative tapMaxMs, tapMaxDistance and holdDelayMs
export function isTrackpadControl(value: unknown): value is TrackpadControl {
    if (typeof value !== "object" || value === null) return false;
    const control = value as TrackpadControl;
    const nonNegative = (option: unknown): boolean => option === undefined || (isFiniteNumber(option) && option >= 0);
    return isInputSurface(control.surface)
        && isTrackpadMap(control.map)
        && (control.sensitivity === undefined || (isFiniteNumber(control.sensitivity) && control.sensitivity > 0))
        && nonNegative(control.tapMaxMs)
        && nonNegative(control.tapMaxDistance)
        && nonNegative(control.holdDelayMs);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a ControlsConfig: keyboard and mouse absent or valid, each control list absent or an array whose every element passes its predicate
export function isControlsConfig(value: unknown): value is ControlsConfig {
    if (typeof value !== "object" || value === null) return false;
    const controls = value as ControlsConfig;
    const listOf = (list: unknown, predicate: (item: unknown) => boolean): boolean => list === undefined || (Array.isArray(list) && list.every(predicate));
    return (controls.keyboard === undefined || isKeyboardControl(controls.keyboard))
        && (controls.mouse === undefined || isMouseControl(controls.mouse))
        && listOf(controls.buttons, isButtonControl)
        && listOf(controls.dpads, isDPadControl)
        && listOf(controls.sticks, isStickControl)
        && listOf(controls.trackpads, isTrackpadControl);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when canvas and container are the DOM elements (checked only where those globals exist), game is valid, and controls, keyboardTarget, adapter and fetch are absent or valid
export function isDosDeploymentConfig(value: unknown): value is DosDeploymentConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as DosDeploymentConfig;
    const canvasOk = typeof HTMLCanvasElement !== "undefined" ? config.canvas instanceof HTMLCanvasElement : typeof config.canvas === "object" && config.canvas !== null;
    const containerOk = typeof HTMLElement !== "undefined" ? config.container instanceof HTMLElement : typeof config.container === "object" && config.container !== null;
    return canvasOk && containerOk
        && isDosGameConfig(config.game)
        && (config.controls === undefined || isControlsConfig(config.controls))
        && (config.keyboardTarget === undefined || isGestureSourceLike(config.keyboardTarget))
        && (config.adapter === undefined || isEmulatorAdapter(config.adapter))
        && (config.fetch === undefined || typeof config.fetch === "function")
        && (config.storage === undefined || config.storage instanceof DosStorage);
}
