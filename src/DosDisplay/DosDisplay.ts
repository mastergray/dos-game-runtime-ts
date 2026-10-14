// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for rejected config, double attach and fullscreen failures

// Type dependencies:
import {
    isFiniteNumber,                                                // Guards the aspectRatio setter and resize arguments
    type EmulatorSession,                                          // Session whose frames attach() draws
    type FiniteNumber,                                             // Sizes and scales
    type FrameEvent,                                               // Frame delivered by the session
    type Listener,                                                 // Subscriber shape for onLayout
    type Unsubscribe,                                              // Returned by attach()
    type Vector2,                                                  // Container and frame sizes for layoutFor()
} from "../shared.types.js";
import {
    isDosDisplayConfig,                                            // Runtime guard for the constructor config
    isScalingMode,                                                 // Guards the scaling setter
    type DisplayLayout,                                            // Result of layoutFor() and resize()
    type DosDisplayConfig,                                         // Construction config
    type FullscreenTargetLike,                                     // Element fullscreen() requests on
    type ResizeObserverLike,                                       // Observer that drives resize()
    type ScalingMode,                                              // Scaling mode literal
} from "./types.js";

/**
 *
 * Class
 *
 */

// Owns the canvas the emulator draws into and how it fits its container; presentation around the canvas is the deployment's
export default class DosDisplay {

    /* Static Fields */
    static readonly DEFAULT_ASPECT_RATIO: FiniteNumber = 4 / 3;    // Aspect ratio when the config gives none
    static readonly DEFAULT_SCALING: ScalingMode = "fit";          // Scaling mode when the config gives none
    static readonly DEFAULT_FRAME: Vector2 = { x: 320, y: 200 };   // Frame size assumed before the first frame arrives

    /* Instance Fields */
    private readonly _canvas: HTMLCanvasElement;                   // Canvas frames are drawn into
    private readonly _container: HTMLElement;                      // Element the canvas fits
    private readonly _resizeObserver: ResizeObserverLike | null;   // Observer driving resize(), or null
    private readonly _fullscreenTarget: FullscreenTargetLike;      // Element fullscreen() requests on
    private _aspectRatio: FiniteNumber;                            // Width / height preserved by the layout
    private _scaling: ScalingMode;                                 // Current scaling mode
    private _containerSize: Vector2;                               // Last known container content size
    private _frameSize: Vector2;                                   // Size of the last frame drawn; 0×0 before any
    private _layout: DisplayLayout;                                // Last computed layout
    private _unsubscribe: Unsubscribe | null = null;               // Frame subscription while attached
    private readonly _layoutListeners = new Set<Listener<DisplayLayout>>();   // onLayout subscribers
    private _unwatchFullscreen: Unsubscribe | null = null;         // Removes the fullscreenchange listener installed by watchFullscreen()
    private _destroyed = false;                                    // Whether destroy() has run

    // CONSTRUCTOR :: DosDisplayConfig -> this
    // Creates a display over the given canvas and container and lays it out once
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosDisplayConfig()
    constructor(config: DosDisplayConfig) {
        if (!isDosDisplayConfig(config)) throw DosDisplay.invalidConfig("DosDisplay config must hold a canvas and a container element.", config);
        this._canvas = config.canvas;
        this._container = config.container;
        this._resizeObserver = config.resizeObserver ?? null;
        this._fullscreenTarget = config.fullscreenTarget ?? (config.container as unknown as FullscreenTargetLike);
        this._aspectRatio = config.aspectRatio ?? DosDisplay.DEFAULT_ASPECT_RATIO;
        this._scaling = config.scaling ?? DosDisplay.DEFAULT_SCALING;
        this._frameSize = { x: 0, y: 0 };
        this._containerSize = DosDisplay.contentSizeOf(config.container);
        this._layout = this.applyLayout();
        if (this._resizeObserver !== null) this._resizeObserver.observe(this._container);
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> finiteNumber
    // Aspect ratio the layout preserves
    get aspectRatio(): FiniteNumber {
        return this._aspectRatio;
    }

    // SETTER :: finiteNumber -> VOID
    // Sets the aspect ratio and re-lays out with the last known container size
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a positive finite number
    set aspectRatio(value: FiniteNumber) {
        if (!isFiniteNumber(value) || value <= 0) throw DosDisplay.invalidConfig("aspectRatio must be a positive finite number.", value);
        this._aspectRatio = value;
        this.updateLayout();
    }

    // GETTER :: VOID -> scalingMode
    // Current scaling mode
    get scaling(): ScalingMode {
        return this._scaling;
    }

    // SETTER :: scalingMode -> VOID
    // Sets the scaling mode and re-lays out with the last known container size
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a ScalingMode
    set scaling(value: ScalingMode) {
        if (!isScalingMode(value)) throw DosDisplay.invalidConfig("scaling must be \"fit\" or \"integer\".", value);
        this._scaling = value;
        this.updateLayout();
    }

    // GETTER :: VOID -> DisplayLayout
    // The last computed layout
    get layout(): DisplayLayout {
        return this._layout;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the fullscreen target is the document's fullscreen element
    get isFullscreen(): boolean {
        return this._fullscreenTarget.ownerDocument.fullscreenElement === (this._fullscreenTarget as unknown as Element);
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: emulatorSession -> unsubscribe
    // Draws every frame the session emits into the canvas, resizing the backing store and re-laying out when the frame size changes
    // NOTE: Throws DosRuntimeError INTERNAL_ERROR when already attached; the returned function detaches, after which attach() is allowed again
    attach(session: EmulatorSession): Unsubscribe {
        if (this._unsubscribe !== null) throw new DosRuntimeError({ code: DosRuntimeError.CODE.INTERNAL_ERROR, message: "DosDisplay is already attached to a session." });
        const unsubscribe = session.onFrame((frame) => this.draw(frame));
        this._unsubscribe = () => {
            unsubscribe();
            this._unsubscribe = null;
        };
        return this._unsubscribe;
    }

    // INSTANCE :: finiteNumber, finiteNumber -> DisplayLayout
    // Recomputes the layout for a container of the given content size, applies it to the canvas's CSS size, and returns it
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when either size is not a finite number
    resize(containerWidth: FiniteNumber, containerHeight: FiniteNumber): DisplayLayout {
        if (!isFiniteNumber(containerWidth)) throw DosDisplay.invalidConfig("resize requires a finite container width.", containerWidth);
        if (!isFiniteNumber(containerHeight)) throw DosDisplay.invalidConfig("resize requires a finite container height.", containerHeight);
        this._containerSize = { x: containerWidth, y: containerHeight };
        this.updateLayout();
        return this._layout;
    }

    // INSTANCE :: (DisplayLayout -> VOID) -> unsubscribe
    // Subscribes to layout changes; the listener receives each new layout that differs from the previous one
    onLayout(listener: Listener<DisplayLayout>): Unsubscribe {
        this._layoutListeners.add(listener);
        return () => { this._layoutListeners.delete(listener); };
    }

    // INSTANCE :: {addEventListener, removeEventListener} -> VOID
    // Re-lays out on the document's fullscreenchange, so entering and leaving fullscreen never waits on the resize observer
    // NOTE: Called by init() with the container's document; a second call replaces the earlier watch
    watchFullscreen(target: { addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void }): void {
        if (this._unwatchFullscreen !== null) this._unwatchFullscreen();
        const listener = (): void => { if (!this._destroyed) { const size = DosDisplay.contentSizeOf(this._container); this.resize(size.x, size.y); } };
        target.addEventListener("fullscreenchange", listener);
        this._unwatchFullscreen = () => target.removeEventListener("fullscreenchange", listener);
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Requests fullscreen on the fullscreen target
    // NOTE: Throws DosRuntimeError UNSUPPORTED when the target has no requestFullscreen, FULLSCREEN_FAILED when the request rejects
    async fullscreen(): Promise<void> {
        const target = this._fullscreenTarget as Partial<FullscreenTargetLike>;
        if (typeof target.requestFullscreen !== "function") throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "Fullscreen is not supported by the fullscreen target." });
        try {
            await target.requestFullscreen.call(this._fullscreenTarget);
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.FULLSCREEN_FAILED, message: "The fullscreen request was rejected.", data: error });
        }
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Leaves fullscreen through the target's document
    // NOTE: Throws DosRuntimeError UNSUPPORTED when the document has no exitFullscreen, FULLSCREEN_FAILED when it rejects
    async exitFullscreen(): Promise<void> {
        const document = this._fullscreenTarget.ownerDocument as Partial<FullscreenTargetLike["ownerDocument"]>;
        if (typeof document.exitFullscreen !== "function") throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "Exiting fullscreen is not supported by the fullscreen target's document." });
        try {
            await document.exitFullscreen.call(this._fullscreenTarget.ownerDocument);
        } catch (error) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.FULLSCREEN_FAILED, message: "Exiting fullscreen was rejected.", data: error });
        }
    }

    // INSTANCE :: VOID -> VOID
    // Detaches from the session, disconnects the observer and clears the canvas; a second call is a no-op
    destroy(): void {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._unsubscribe !== null) this._unsubscribe();
        if (this._unwatchFullscreen !== null) { this._unwatchFullscreen(); this._unwatchFullscreen = null; }
        this._layoutListeners.clear();
        if (this._resizeObserver !== null) this._resizeObserver.disconnect();
        const context = this._canvas.getContext("2d");
        if (context !== null) context.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: frameEvent -> VOID
    // Resizes the backing store when the frame size changed, re-lays out, and draws the frame
    private draw(frame: FrameEvent): void {
        if (frame.width !== this._frameSize.x || frame.height !== this._frameSize.y) {
            this._frameSize = { x: frame.width, y: frame.height };
            this._canvas.width = frame.width;
            this._canvas.height = frame.height;
            this.updateLayout();
        }
        const context = this._canvas.getContext("2d");
        if (context === null) return;
        context.putImageData(new ImageData(frame.rgba as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
    }

    // PRIVATE :: VOID -> VOID
    // Recomputes and applies the layout, emitting it to onLayout subscribers when it changed
    private updateLayout(): void {
        const previous = this._layout;
        this._layout = this.applyLayout();
        const next = this._layout;
        if (previous.width === next.width && previous.height === next.height && previous.scale === next.scale) return;
        for (const listener of this._layoutListeners) listener(next);
    }

    // PRIVATE :: VOID -> DisplayLayout
    // Computes the layout for the current container, frame, aspect ratio and mode and applies it to the canvas's CSS size
    private applyLayout(): DisplayLayout {
        const layout = DosDisplay.layoutFor(this._containerSize, this._frameSize, this._aspectRatio, this._scaling);
        this._canvas.style.width = `${layout.width}px`;
        this._canvas.style.height = `${layout.height}px`;
        return layout;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: DosDisplayConfig -> dosDisplay
    // Constructs with a ResizeObserver wired to resize() when the browser has one and the config gives none, and the container as the fullscreen target when none is given
    static init(config: DosDisplayConfig): DosDisplay {
        const filled: { -readonly [K in keyof DosDisplayConfig]: DosDisplayConfig[K] } = { ...config };
        let display: DosDisplay | null = null;
        if (filled.resizeObserver === undefined && typeof ResizeObserver !== "undefined") {
            filled.resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[entries.length - 1];
                if (display === null || entry === undefined) return;
                display.resize(entry.contentRect.width, entry.contentRect.height);
            });
        }
        if (filled.fullscreenTarget === undefined) filled.fullscreenTarget = config.container as unknown as FullscreenTargetLike;
        display = new DosDisplay(filled);
        const ownerDocument = (config.container as { ownerDocument?: Document }).ownerDocument;
        if (ownerDocument !== undefined && ownerDocument !== null) display.watchFullscreen(ownerDocument);
        return display;
    }

    // STATIC :: vector2, vector2, finiteNumber, scalingMode -> DisplayLayout
    // Pure layout arithmetic: the CSS size a frame of the given aspect ratio takes inside the container under the mode
    // NOTE: A 0×0 frame is laid out as 320×200; "integer" falls back to "fit" when even 1× does not fit
    static layoutFor(container: Vector2, frame: Vector2, aspectRatio: FiniteNumber, scaling: ScalingMode): DisplayLayout {
        const frameWidth = frame.x > 0 && frame.y > 0 ? frame.x : DosDisplay.DEFAULT_FRAME.x;
        const fit = (): DisplayLayout => {
            const width = Math.max(0, Math.min(container.x, container.y * aspectRatio));
            const height = width / aspectRatio;
            return { width, height, scale: width / frameWidth };
        };
        if (scaling === "fit") return fit();
        const multiple = Math.floor(Math.min(container.x / frameWidth, (container.y * aspectRatio) / frameWidth));
        if (!Number.isFinite(multiple) || multiple < 1) return fit();
        const width = frameWidth * multiple;
        return { width, height: width / aspectRatio, scale: multiple };
    }

    // STATIC :: HTMLElement -> vector2
    // Reads an element's current content size, or 0×0 when it cannot be measured
    private static contentSizeOf(element: HTMLElement): Vector2 {
        if (typeof element.getBoundingClientRect !== "function") return { x: 0, y: 0 };
        const rect = element.getBoundingClientRect();
        return { x: rect.width, y: rect.height };
    }

    // STATIC :: STRING, UNKNOWN -> dosRuntimeError
    // Builds the INVALID_CONFIG error carrying the rejected value
    private static invalidConfig(message: string, data: unknown): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message, data });
    }
}
