// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection and swallowed key errors

// Type dependencies:
import type DosInput from "../DosInput/DosInput.js";               // Input API the events are forwarded to
import type { GestureSourceLike } from "../DosAudio/types.js";     // Element shape the listeners attach to
import type { KeyCode } from "../shared.types.js";                 // Code type passed to the filter
import {
    isKeyboardSourceConfig,                                        // Guards the construction config
    type KeyboardSourceConfig,                                     // Construction config shape
} from "./types.js";

/**
 *
 * Class
 *
 */

// Forwards physical keyboard events from a page element to DosInput, and releases every held key when the page loses focus
export default class KeyboardSource {

    /* Static Fields */
    static readonly DEFAULT_PREVENT_DEFAULT = true;                // Handled key events are prevented unless configured otherwise

    /* Instance Fields */
    private readonly _input: DosInput;                             // Where key presses go
    private readonly _target: GestureSourceLike;                   // Where key listeners attach
    private readonly _view: GestureSourceLike;                     // Where blur is observed: the window when there is one, else the target
    private readonly _document: GestureSourceLike;                 // Where visibilitychange is observed: the document when there is one, else the target
    private readonly _filter: ((code: KeyCode) => boolean) | null; // Rejects codes this source should ignore; null accepts all
    private readonly _preventDefault: boolean;                     // Whether handled events are preventDefault()ed
    private readonly _onKeyDown: (event: Event) => void;           // Bound keydown listener
    private readonly _onKeyUp: (event: Event) => void;             // Bound keyup listener
    private readonly _onBlur: (event: Event) => void;              // Bound blur listener
    private readonly _onVisibilityChange: (event: Event) => void;  // Bound visibilitychange listener
    private _attached: boolean;                                    // Whether the listeners are currently installed
    private _enabled: boolean;                                     // Gate: while false, key events are ignored
    private _destroyed: boolean;                                   // Whether destroy() has run

    // CONSTRUCTOR :: KeyboardSourceConfig -> this
    // Creates a detached source; call attach() to start forwarding
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isKeyboardSourceConfig()
    constructor(config: KeyboardSourceConfig) {
        if (!isKeyboardSourceConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "KeyboardSource config must have a DosInput input and a listener-bearing target.", data: config });
        }
        this._input = config.input;
        this._target = config.target;
        this._view = typeof window !== "undefined" ? window : config.target;
        this._document = typeof document !== "undefined" ? document : config.target;
        this._filter = config.filter ?? null;
        this._preventDefault = config.preventDefault ?? KeyboardSource.DEFAULT_PREVENT_DEFAULT;
        this._onKeyDown = (event) => this.handleKey(event, true);
        this._onKeyUp = (event) => this.handleKey(event, false);
        this._onBlur = () => this._input.releaseAll();
        this._onVisibilityChange = () => { if (globalThis.document?.visibilityState === "hidden") this._input.releaseAll(); };
        this._attached = false;
        this._enabled = true;
        this._destroyed = false;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> BOOLEAN
    // Whether the listeners are installed on the target
    get isAttached(): boolean {
        return this._attached;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether key events are forwarded; a gate independent of attachment
    get enabled(): boolean {
        return this._enabled;
    }

    // SETTER :: BOOLEAN -> VOID
    // Opens or closes the gate; closing it releases every held key
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a boolean
    set enabled(value: boolean) {
        if (typeof value !== "boolean") throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "enabled must be a boolean.", data: value });
        this._enabled = value;
        if (!value && !this._input.isDestroyed) this._input.releaseAll();
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: VOID -> VOID
    // Installs keydown and keyup on the target, blur on the window and visibilitychange on the document; a no-op when already attached
    // NOTE: A window blur is how the browser reports focus leaving the page; it does not reach a document listener
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    attach(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "KeyboardSource has been destroyed." });
        if (this._attached) return;
        this._target.addEventListener("keydown", this._onKeyDown);
        this._target.addEventListener("keyup", this._onKeyUp);
        this._view.addEventListener("blur", this._onBlur);
        this._document.addEventListener("visibilitychange", this._onVisibilityChange);
        this._attached = true;
    }

    // INSTANCE :: VOID -> VOID
    // Removes the listeners and releases every held key; a no-op when not attached
    detach(): void {
        if (!this._attached) return;
        this._target.removeEventListener("keydown", this._onKeyDown);
        this._target.removeEventListener("keyup", this._onKeyUp);
        this._view.removeEventListener("blur", this._onBlur);
        this._document.removeEventListener("visibilitychange", this._onVisibilityChange);
        this._attached = false;
        if (!this._input.isDestroyed) this._input.releaseAll();
    }

    // INSTANCE :: VOID -> VOID
    // Detaches and marks the source destroyed; idempotent
    destroy(): void {
        if (this._destroyed) return;
        this.detach();
        this._destroyed = true;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: event, BOOLEAN -> VOID
    // Forwards one key event: skips auto-repeat and filtered codes, prevents the default when configured, drops UNSUPPORTED_KEY
    // NOTE: Any error other than UNSUPPORTED_KEY from DosInput propagates to the event dispatcher
    private handleKey(event: Event, pressed: boolean): void {
        if (!this._enabled) return;
        const key = event as KeyboardEvent;
        if (typeof key.code !== "string" || key.code === "") return;
        if (pressed && key.repeat) return;
        if (this._filter !== null && !this._filter(key.code)) return;
        try {
            if (pressed) this._input.keyDown(key.code); else this._input.keyUp(key.code);
        } catch (error) {
            if (!(DosRuntimeError.is(error) && error.code === DosRuntimeError.CODE.UNSUPPORTED_KEY)) throw error;
        }
        if (this._preventDefault) event.preventDefault();
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: KeyboardSourceConfig -> keyboardSource
    // Mirrors the constructor
    static init(config: KeyboardSourceConfig): KeyboardSource {
        return new KeyboardSource(config);
    }
}
