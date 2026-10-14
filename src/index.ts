// Dependencies:
export { default as DosRuntimeError } from "./DosRuntimeError/DosRuntimeError.js";             // Base typed error and code registry
export { default as JsDosEmulatorAdapter } from "./JsDosEmulatorAdapter/JsDosEmulatorAdapter.js";   // EmulatorAdapter over the js-dos emulators package
export { default as DosInput } from "./DosInput/DosInput.js";                                   // Keyboard, mouse and joystick input API
export { default as DosDisplay } from "./DosDisplay/DosDisplay.js";                             // Canvas sizing, drawing and fullscreen
export { default as DosAudio } from "./DosAudio/DosAudio.js";                                   // Sample playback and autoplay unlock
export { default as DosPlayer } from "./DosPlayer/DosPlayer.js";                                // Composition root and lifecycle
export { default as KeyboardSource } from "./KeyboardSource/KeyboardSource.js";                 // Physical keyboard to DosInput
export { default as MouseSource } from "./MouseSource/MouseSource.js";                          // Physical mouse to DosInput as relative motion
export { default as Button } from "./Button/Button.js";                                         // Pointer primitive: press, release, hold
export { default as DPad } from "./DPad/DPad.js";                                               // Pointer primitive: four directions
export { default as AnalogStick } from "./AnalogStick/AnalogStick.js";                          // Pointer primitive: 2-D value in -1..1
export { default as Trackpad } from "./Trackpad/Trackpad.js";                                   // Pointer primitive: relative motion, taps, holds
export { default as InputMapper } from "./InputMapper/InputMapper.js";                          // Binds primitives to DosInput through a deployment's map
export { default as DosDeployment } from "./DosDeployment/DosDeployment.js";                    // Composes player, sources, primitives and mapper from one config
export { default as DosStorage } from "./DosStorage/DosStorage.js";                             // Saves overlay persistence in IndexedDB

// Shared types and predicates:
export {
    isNonEmptyString,                                              // Guard for NonEmptyString
    isFiniteNumber,                                                // Guard for FiniteNumber
    isKeyCode,                                                     // Guard for KeyCode
    isMouseButton,                                                 // Guard for MouseButton
    isJoystickButton,                                              // Guard for JoystickButton
    isJoystickAxis,                                                // Guard for JoystickAxis
    isVector2,                                                     // Guard for Vector2
    isRect,                                                        // Guard for Rect
    isPointerEventLike,                                            // Guard for PointerEventLike
    isInputSurface,                                                // Guard for InputSurface
    isFrameScheduler,                                              // Guard for FrameScheduler
    isTimerLike,                                                   // Guard for TimerLike
    isEmulatorSession,                                             // Guard for EmulatorSession
    isEmulatorAdapter,                                             // Guard for EmulatorAdapter
    isEmulatorStartConfig,                                         // Guard for EmulatorStartConfig
} from "./shared.types.js";
export type {
    NonEmptyString,                                                // String with non-whitespace content
    FiniteNumber,                                                  // Finite number
    KeyCode,                                                       // DOM KeyboardEvent.code value
    MouseButton,                                                   // Mouse button literal
    JoystickButton,                                                // Joystick button literal
    JoystickAxis,                                                  // Joystick axis literal
    Unsubscribe,                                                   // Subscription remover
    Listener,                                                      // Event subscriber
    Vector2,                                                       // 2-D vector
    Rect,                                                          // CSS-pixel rectangle
    PointerEventLike,                                              // Pointer event subset
    InputSurface,                                                  // Element a primitive attaches to
    FrameScheduler,                                                // requestAnimationFrame pair
    TimerLike,                                                     // setTimeout pair
    FrameEvent,                                                    // Video frame
    EmulatorSession,                                               // Running emulator contract
    EmulatorAdapter,                                               // Session starter contract
    EmulatorStartConfig,                                           // Bundle plus optional overlay
} from "./shared.types.js";

// Class-owned types and predicates:
export { isDosRuntimeErrorConfig, type DosRuntimeErrorConfig } from "./DosRuntimeError/types.js";   // Error construction config
export {
    isJsDosBackend,                                                // Guard for JsDosBackend
    isJsDosMode,                                                   // Guard for JsDosMode
    isJsDosEmulators,                                              // Guard for the emulators object
    isJsDosCommandInterface,                                       // Guard for a js-dos command interface
    isJsDosEmulatorAdapterConfig,                                  // Guard for the adapter config
    type JsDosBackend,                                             // "dosbox" | "dosbox-x"
    type JsDosMode,                                                // "direct" | "worker"
    type JsDosEmulators,                                           // Members of emulators the adapter calls
    type JsDosInitFs,                                              // Bundle, or bundle plus overlay
    type JsDosBackendOptions,                                      // Options passed to js-dos start
    type JsDosCommandInterface,                                    // Members of CommandInterface the session calls
    type JsDosEvents,                                              // Members of CommandInterfaceEvents the session uses
    type JsDosEmulatorAdapterConfig,                               // Adapter construction config
} from "./JsDosEmulatorAdapter/types.js";
export {
    isDosInputConfig,                                              // Guard for DosInputConfig
    type DosInputConfig,                                           // DosInput construction config
    type DosInputSnapshot,                                         // Held keys, buttons and axes
} from "./DosInput/types.js";
export {
    isScalingMode,                                                 // Guard for ScalingMode
    isDosDisplayConfig,                                            // Guard for DosDisplayConfig
    isResizeObserverLike,                                          // Guard for ResizeObserverLike
    isFullscreenTargetLike,                                        // Guard for FullscreenTargetLike
    type ScalingMode,                                              // "fit" | "integer"
    type DosDisplayConfig,                                         // DosDisplay construction config
    type ResizeObserverLike,                                       // Injectable ResizeObserver
    type FullscreenTargetLike,                                     // Injectable fullscreen element
    type DisplayLayout,                                            // Computed canvas CSS size and scale
} from "./DosDisplay/types.js";
export {
    isDosAudioConfig,                                              // Guard for DosAudioConfig
    isGestureSourceLike,                                           // Guard for GestureSourceLike
    isAudioContextLike,                                            // Guard for AudioContextLike
    type DosAudioConfig,                                           // DosAudio construction config
    type GestureSourceLike,                                        // Element the unlock listens on
    type AudioContextLike,                                         // Injectable AudioContext subset
} from "./DosAudio/types.js";
export {
    isDosPlayerStatus,                                             // Guard for DosPlayerStatus
    isDosGameConfig,                                               // Guard for DosGameConfig
    isDosPlayerConfig,                                             // Guard for DosPlayerConfig
    type DosPlayerStatus,                                          // Lifecycle state literal
    type DosGameConfig,                                            // Bundle, overlay and display options
    type DosPlayerConfig,                                          // DosPlayer construction config
    type FetchLike,                                                // Injectable fetch
    type DosPlayerEvents,                                          // Event name to payload map
} from "./DosPlayer/types.js";
export {
    isKeyboardSourceConfig,                                        // Guard for KeyboardSourceConfig
    type KeyboardSourceConfig,                                     // KeyboardSource construction config
} from "./KeyboardSource/types.js";
export {
    isMouseSourceConfig,                                           // Guard for MouseSourceConfig
    isPointerLockLike,                                             // Guard for PointerLockLike
    isSensitivity,                                                 // Guard for a positive finite sensitivity
    isMouseScale,                                                  // Guard for MouseScale
    isMouseTouchMode,                                              // Guard for MouseTouchMode
    type MouseScale,                                               // Per-axis multipliers for absolute positions
    type MouseSourceConfig,                                        // MouseSource construction config
    type MouseTouchMode,                                           // "none" | "absolute"
    type PointerLockLike,                                          // Injectable Pointer Lock element subset
} from "./MouseSource/types.js";
export {
    isDosStorageConfig,                                            // Guard for DosStorageConfig
    isIDBFactoryLike,                                              // Guard for IDBFactoryLike
    type DosStorageConfig,                                         // DosStorage construction config
    type IDBFactoryLike,                                           // Injectable indexedDB subset
} from "./DosStorage/types.js";
export {
    isKeyboardControl,                                             // Guard for KeyboardControl
    isMouseControl,                                                // Guard for MouseControl
    isButtonControl,                                               // Guard for ButtonControl
    isDPadControl,                                                 // Guard for DPadControl
    isStickControl,                                                // Guard for StickControl
    isTrackpadControl,                                             // Guard for TrackpadControl
    isControlsConfig,                                              // Guard for ControlsConfig
    isDosDeploymentConfig,                                         // Guard for DosDeploymentConfig
    type KeyboardControl,                                          // Keyboard source options for a deployment
    type MouseControl,                                             // Mouse source options for a deployment
    type ButtonControl,                                            // A button surface and its target
    type DPadControl,                                              // A d-pad surface and its map
    type StickControl,                                             // A stick surface and its map
    type TrackpadControl,                                          // A trackpad surface and its map
    type ControlsConfig,                                           // Every control of a deployment
    type DosDeploymentConfig,                                      // DosDeployment construction config
} from "./DosDeployment/types.js";
export {
    isButtonConfig,                                                // Guard for ButtonConfig
    type ButtonConfig,                                             // Button construction config
    type ButtonEvents,                                             // Button event map
} from "./Button/types.js";
export {
    isDPadDirection,                                               // Guard for DPadDirection
    isDPadConfig,                                                  // Guard for DPadConfig
    type DPadDirection,                                            // "up" | "down" | "left" | "right"
    type DPadConfig,                                               // DPad construction config
    type DPadEvents,                                               // DPad event map
} from "./DPad/types.js";
export {
    isAnalogStickConfig,                                           // Guard for AnalogStickConfig
    type AnalogStickConfig,                                        // AnalogStick construction config
    type AnalogStickEvents,                                        // AnalogStick event map
} from "./AnalogStick/types.js";
export {
    isTrackpadConfig,                                              // Guard for TrackpadConfig
    type TrackpadConfig,                                           // Trackpad construction config
    type TrackpadEvents,                                           // Trackpad event map
} from "./Trackpad/types.js";
export {
    isInputTarget,                                                 // Guard for InputTarget
    isDPadMap,                                                     // Guard for DPadMap
    isAnalogStickMap,                                              // Guard for AnalogStickMap
    isTrackpadMap,                                                 // Guard for TrackpadMap
    isInputMapperConfig,                                           // Guard for InputMapperConfig
    type InputTarget,                                              // Key, mouse button or joystick button target
    type KeyTarget,                                                // {kind:"key", code}
    type MouseButtonTarget,                                        // {kind:"mouseButton", button}
    type JoystickButtonTarget,                                     // {kind:"joystickButton", button}
    type DPadMap,                                                  // Direction to target map
    type AnalogStickMap,                                           // Stick to joystick or keys
    type TrackpadMap,                                              // Trackpad gestures to targets
    type InputMapperConfig,                                        // InputMapper construction config
} from "./InputMapper/types.js";
