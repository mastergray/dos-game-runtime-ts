// Type dependencies:
import { isNonEmptyString, type NonEmptyString } from "../shared.types.js";   // pathPrefix must say something

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "dosbox" | "dosbox-x"
// Which js-dos backend to boot.
export type JsDosBackend = "dosbox" | "dosbox-x";

// TYPE :: "direct" | "worker"
// Whether the emulator runs on the main thread or in a Web Worker.
export type JsDosMode = "direct" | "worker";

// INTERFACE :: {emulators:jsDosEmulators, pathPrefix:nonEmptyString, backend:jsDosBackend?, mode:jsDosMode?}
// Construction config accepted by the constructor; init() fills emulators and the defaults.
export interface JsDosEmulatorAdapterConfig {
    readonly emulators: JsDosEmulators;                            // The emulators package object, injected
    readonly pathPrefix: NonEmptyString;                           // URL prefix where node_modules/emulators/dist is served
    readonly backend?: JsDosBackend;                               // Defaults to "dosbox"
    readonly mode?: JsDosMode;                                     // Defaults to "worker"
}

// INTERFACE :: the members of emulators@8.4.2's Emulators object the adapter calls
// Structural subset, as dist/types/emulators.d.ts declares them; probed in spec §4.3.
export interface JsDosEmulators {
    pathPrefix: string;                                            // Where wdosbox.js/.wasm are fetched from
    readonly version: string;                                      // Package version string
    dosboxDirect(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;    // DOSBox on the main thread
    dosboxWorker(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;    // DOSBox in a worker
    dosboxXDirect(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;   // DOSBox-X on the main thread
    dosboxXWorker(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;   // DOSBox-X in a worker
}

// TYPE :: Uint8Array | [Uint8Array]
// A bundle, or a bundle followed by a changes overlay from persist().
export type JsDosInitFs = Uint8Array | ReadonlyArray<Uint8Array>;

// INTERFACE :: {audioWorklet:BOOLEAN?}
// Options passed to a js-dos start call.
// NOTE: audioWorklet is always false here so samples arrive through onSoundPush and DosAudio plays them.
export interface JsDosBackendOptions {
    readonly audioWorklet?: boolean;                               // Whether js-dos owns audio playback
}

// INTERFACE :: the members of CommandInterface the session calls
// Structural subset of js-dos's CommandInterface, as 8.4.2 declares them.
export interface JsDosCommandInterface {
    width(): number;                                               // Current frame width
    height(): number;                                              // Current frame height
    soundFrequency(): number;                                      // Sample rate of onSoundPush samples
    pause(): void;                                                 // Stops emulation
    resume(): void;                                                // Continues emulation
    exit(): Promise<void>;                                         // Stops the emulator
    sendKeyEvent(keyCode: number, pressed: boolean): void;         // Key press/release by GLFW-style code
    sendMouseMotion(x: number, y: number): void;                   // Absolute position, normalized 0..1
    sendMouseRelativeMotion(x: number, y: number): void;           // Relative mouse motion
    sendMouseButton(button: number, pressed: boolean): void;       // Mouse button press/release
    persist(onlyChanges?: boolean): Promise<Uint8Array | null>;    // Overlay of changed files, or null when unchanged
    events(): JsDosEvents;                                         // Event subscription surface
}

// INTERFACE :: the members of CommandInterfaceEvents the session uses
// Each subscribes one consumer; js-dos offers no unsubscribe.
export interface JsDosEvents {
    onFrameSize(consumer: (width: number, height: number) => void): void;                        // Frame size changed
    onFrame(consumer: (rgb: Uint8Array | null, rgba: Uint8Array | null) => void): void;           // A frame was rendered
    onSoundPush(consumer: (samples: Float32Array) => void): void;                                 // Samples were produced
    onExit(consumer: () => void): void;                                                           // The emulator stopped
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the JsDosBackend literals
export function isJsDosBackend(value: unknown): value is JsDosBackend {
    return value === "dosbox" || value === "dosbox-x";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the JsDosMode literals
export function isJsDosMode(value: unknown): value is JsDosMode {
    return value === "direct" || value === "worker";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a string pathPrefix and the four start functions
export function isJsDosEmulators(value: unknown): value is JsDosEmulators {
    if (typeof value !== "object" || value === null) return false;
    const emulators = value as JsDosEmulators;
    return typeof emulators.pathPrefix === "string"
        && typeof emulators.dosboxDirect === "function"
        && typeof emulators.dosboxWorker === "function"
        && typeof emulators.dosboxXDirect === "function"
        && typeof emulators.dosboxXWorker === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has every JsDosCommandInterface method as a function
export function isJsDosCommandInterface(value: unknown): value is JsDosCommandInterface {
    if (typeof value !== "object" || value === null) return false;
    const ci = value as JsDosCommandInterface;
    return typeof ci.width === "function"
        && typeof ci.height === "function"
        && typeof ci.soundFrequency === "function"
        && typeof ci.pause === "function"
        && typeof ci.resume === "function"
        && typeof ci.exit === "function"
        && typeof ci.sendKeyEvent === "function"
        && typeof ci.sendMouseMotion === "function"
        && typeof ci.sendMouseRelativeMotion === "function"
        && typeof ci.sendMouseButton === "function"
        && typeof ci.persist === "function"
        && typeof ci.events === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a JsDosEmulators object, a non-empty pathPrefix, and valid optional backend and mode
export function isJsDosEmulatorAdapterConfig(value: unknown): value is JsDosEmulatorAdapterConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as JsDosEmulatorAdapterConfig;
    return isJsDosEmulators(config.emulators)
        && isNonEmptyString(config.pathPrefix)
        && (config.backend === undefined || isJsDosBackend(config.backend))
        && (config.mode === undefined || isJsDosMode(config.mode));
}
