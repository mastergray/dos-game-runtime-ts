// Type dependencies:
import { isEmulatorAdapter, isFiniteNumber, isNonEmptyString, type EmulatorAdapter, type FiniteNumber, type NonEmptyString } from "../shared.types.js";   // Adapter contract, scalar guards and types
import { isScalingMode, type ScalingMode } from "../DosDisplay/types.js";     // Display scaling literal and its guard
import { isGestureSourceLike, type GestureSourceLike } from "../DosAudio/types.js";   // Gesture source contract and its guard
import type DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";     // Payload of the error event

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "idle" | "starting" | "running" | "paused" | "destroyed"
// Closed set of player lifecycle states.
export type DosPlayerStatus = "idle" | "starting" | "running" | "paused" | "destroyed";

// INTERFACE :: {bundle:nonEmptyString|Uint8Array, changes:Uint8Array?, display:{aspectRatio:finiteNumber?, scaling:scalingMode?}?}
// What the deployment says about the game: where its bundle is, a saves overlay to restore, and display options.
export interface DosGameConfig {
    readonly bundle: NonEmptyString | Uint8Array;                  // Bundle URL to fetch, or the bundle bytes
    readonly changes?: Uint8Array;                                 // Overlay from a previous persist(), restored on start
    readonly display?: {                                           // Display options forwarded to DosDisplay
        readonly aspectRatio?: FiniteNumber;                       // Positive aspect ratio; DosDisplay defaults it
        readonly scaling?: ScalingMode;                            // "fit" or "integer"; DosDisplay defaults it
    };
}

// TYPE :: STRING -> PROMISE({ok:BOOLEAN, status:NUMBER, arrayBuffer:(VOID -> PROMISE(ArrayBuffer))})
// The part of fetch the player uses to load a bundle URL; globalThis.fetch satisfies it.
export type FetchLike = (url: string) => Promise<{ readonly ok: boolean; readonly status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

// INTERFACE :: {canvas:HTMLCanvasElement, container:HTMLElement, game:dosGameConfig, adapter:emulatorAdapter, fetch:fetchLike?, gestureSource:gestureSourceLike?}
// Construction config accepted by the constructor; init() fills adapter, fetch and gestureSource when omitted.
export interface DosPlayerConfig {
    readonly canvas: HTMLCanvasElement;                            // Canvas the emulator draws into
    readonly container: HTMLElement;                               // Element the canvas fits inside
    readonly game: DosGameConfig;                                  // Bundle, overlay and display options
    readonly adapter: EmulatorAdapter;                             // Emulator backend
    readonly fetch?: FetchLike;                                    // Loader for a bundle URL; globalThis.fetch when omitted
    readonly gestureSource?: GestureSourceLike;                    // Where the audio unlock listens; container when omitted
}

// INTERFACE :: {status:dosPlayerStatus, exit:VOID, error:dosRuntimeError}
// Event name to payload map for on().
export interface DosPlayerEvents {
    readonly status: DosPlayerStatus;                              // Emitted on every status change
    readonly exit: void;                                           // The emulator stopped on its own
    readonly error: DosRuntimeError;                               // A start failure or a throwing listener
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the DosPlayerStatus literals
export function isDosPlayerStatus(value: unknown): value is DosPlayerStatus {
    return value === "idle" || value === "starting" || value === "running" || value === "paused" || value === "destroyed";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when bundle is a non-empty string or Uint8Array, changes is absent or a Uint8Array, and display fields when present are valid
export function isDosGameConfig(value: unknown): value is DosGameConfig {
    if (typeof value !== "object" || value === null) return false;
    const game = value as DosGameConfig;
    if (!(isNonEmptyString(game.bundle) || game.bundle instanceof Uint8Array)) return false;
    if (game.changes !== undefined && !(game.changes instanceof Uint8Array)) return false;
    if (game.display === undefined) return true;
    if (typeof game.display !== "object" || game.display === null) return false;
    const { aspectRatio, scaling } = game.display;
    return (aspectRatio === undefined || (isFiniteNumber(aspectRatio) && aspectRatio > 0))
        && (scaling === undefined || isScalingMode(scaling));
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when canvas and container are the DOM elements (checked only where those globals exist), game, adapter, and optional fetch and gestureSource are valid
export function isDosPlayerConfig(value: unknown): value is DosPlayerConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as DosPlayerConfig;
    const canvasOk = typeof HTMLCanvasElement !== "undefined" ? config.canvas instanceof HTMLCanvasElement : typeof config.canvas === "object" && config.canvas !== null;
    const containerOk = typeof HTMLElement !== "undefined" ? config.container instanceof HTMLElement : typeof config.container === "object" && config.container !== null;
    return canvasOk && containerOk
        && isDosGameConfig(config.game)
        && isEmulatorAdapter(config.adapter)
        && (config.fetch === undefined || typeof config.fetch === "function")
        && (config.gestureSource === undefined || isGestureSourceLike(config.gestureSource));
}
