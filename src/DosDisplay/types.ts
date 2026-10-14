// Type dependencies:
import { isFiniteNumber, type FiniteNumber } from "../shared.types.js";   // Positive finite checks and the number type of layouts

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "fit" | "integer"
// How the canvas is scaled inside its container: largest fitting rectangle, or integer multiples of the frame.
export type ScalingMode = "fit" | "integer";

// INTERFACE :: {canvas:HTMLCanvasElement, container:HTMLElement, aspectRatio:finiteNumber?, scaling:scalingMode?, resizeObserver:resizeObserverLike?, fullscreenTarget:fullscreenTargetLike?}
// Construction config accepted by the constructor; init() fills the injectable browser objects.
export interface DosDisplayConfig {
    readonly canvas: HTMLCanvasElement;                            // Canvas the emulator frames are drawn into
    readonly container: HTMLElement;                               // Element whose size the canvas fits
    readonly aspectRatio?: FiniteNumber;                           // Width / height to preserve; defaults to 4/3
    readonly scaling?: ScalingMode;                                // Scaling mode; defaults to "fit"
    readonly resizeObserver?: ResizeObserverLike;                  // Observer already wired to call resize(); none when omitted
    readonly fullscreenTarget?: FullscreenTargetLike;              // Element fullscreen() requests on; defaults to container
}

// INTERFACE :: {observe:(Element -> VOID), disconnect:(VOID -> VOID)}
// The subset of ResizeObserver the display drives.
export interface ResizeObserverLike {
    observe(target: Element): void;                                // Starts observing the container
    disconnect(): void;                                            // Stops observing everything
}

// INTERFACE :: {requestFullscreen:(VOID -> PROMISE(VOID)), ownerDocument:{exitFullscreen:(VOID -> PROMISE(VOID)), fullscreenElement:Element?}}
// The subset of an element and its document that fullscreen() and exitFullscreen() use.
export interface FullscreenTargetLike {
    requestFullscreen(): Promise<void>;                            // Enters fullscreen on this element
    readonly ownerDocument: {                                      // Document owning the element
        exitFullscreen(): Promise<void>;                           // Leaves fullscreen
        readonly fullscreenElement: Element | null;                // Element currently fullscreen, if any
    };
}

// INTERFACE :: {width:finiteNumber, height:finiteNumber, scale:finiteNumber}
// The CSS size the canvas takes and the factor from frame pixels to CSS pixels.
export interface DisplayLayout {
    readonly width: FiniteNumber;                                  // CSS width in px
    readonly height: FiniteNumber;                                 // CSS height in px
    readonly scale: FiniteNumber;                                  // CSS px per frame px, horizontally
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the ScalingMode literals
export function isScalingMode(value: unknown): value is ScalingMode {
    return value === "fit" || value === "integer";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has observe and disconnect functions
export function isResizeObserverLike(value: unknown): value is ResizeObserverLike {
    return typeof value === "object" && value !== null
        && typeof (value as ResizeObserverLike).observe === "function"
        && typeof (value as ResizeObserverLike).disconnect === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an ownerDocument object and, when present, requestFullscreen and exitFullscreen functions
// NOTE: The methods are checked only when present so a target lacking them is accepted and reported as UNSUPPORTED by the display, not rejected here
export function isFullscreenTargetLike(value: unknown): value is FullscreenTargetLike {
    if (typeof value !== "object" || value === null) return false;
    const target = value as FullscreenTargetLike;
    return (target.requestFullscreen === undefined || typeof target.requestFullscreen === "function")
        && typeof target.ownerDocument === "object" && target.ownerDocument !== null
        && (target.ownerDocument.exitFullscreen === undefined || typeof target.ownerDocument.exitFullscreen === "function");
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a canvas and a container element (checked by instanceof where the DOM globals exist), and every optional field passes its check
export function isDosDisplayConfig(value: unknown): value is DosDisplayConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as DosDisplayConfig;
    const canvasOk = typeof HTMLCanvasElement !== "undefined"
        ? config.canvas instanceof HTMLCanvasElement
        : typeof config.canvas === "object" && config.canvas !== null;
    const containerOk = typeof HTMLElement !== "undefined"
        ? config.container instanceof HTMLElement
        : typeof config.container === "object" && config.container !== null;
    return canvasOk && containerOk
        && (config.aspectRatio === undefined || (isFiniteNumber(config.aspectRatio) && config.aspectRatio > 0))
        && (config.scaling === undefined || isScalingMode(config.scaling))
        && (config.resizeObserver === undefined || isResizeObserverLike(config.resizeObserver))
        && (config.fullscreenTarget === undefined || isFullscreenTargetLike(config.fullscreenTarget));
}
