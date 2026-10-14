// Dependencies:
import DosStorage from "../DosStorage/DosStorage.js";                 // Saves overlay persistence used by save() and init()
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";              // Typed errors for config, setter and restart rejections
import DosPlayer from "../DosPlayer/DosPlayer.js";                                // Session lifecycle the controls ride on
import KeyboardSource from "../KeyboardSource/KeyboardSource.js";                 // Physical keyboard built at start
import MouseSource from "../MouseSource/MouseSource.js";                          // Physical mouse on the canvas built at start
import Button from "../Button/Button.js";                                         // On-screen buttons built at start
import DPad from "../DPad/DPad.js";                                               // On-screen d-pads built at start
import AnalogStick from "../AnalogStick/AnalogStick.js";                          // On-screen sticks built at start
import Trackpad from "../Trackpad/Trackpad.js";                                   // On-screen trackpads built at start
import InputMapper from "../InputMapper/InputMapper.js";                          // Binds primitives to targets; press/release for button holds
import JsDosEmulatorAdapter from "../JsDosEmulatorAdapter/JsDosEmulatorAdapter.js";   // Default adapter chosen by init()

// Type dependencies:
import type DosInput from "../DosInput/DosInput.js";                              // Input the hold bindings press and release on
import type { GestureSourceLike } from "../DosAudio/types.js";                    // Where the keyboard source listens
import type { InputTarget } from "../InputMapper/types.js";                       // A button's hold target
import type { KeyboardSourceConfig } from "../KeyboardSource/types.js";           // Built from the keyboard control
import type { MouseSourceConfig } from "../MouseSource/types.js";                 // Built from the mouse control
import type { DosPlayerConfig } from "../DosPlayer/types.js";                     // Built from the deployment config
import type { Unsubscribe } from "../shared.types.js";                            // Remover of the exit and hold subscriptions
import {
    isDosDeploymentConfig,                                         // Guards the construction config
    type ControlsConfig,                                           // Every control, kept for each start
    type DosDeploymentConfig,                                      // Construction config shape
} from "./types.js";

/**
 *
 * Class
 *
 */

// Composes a player, its input sources, on-screen primitives and mapper from one config, and owns their lifecycle
export default class DosDeployment {

    /* Instance Fields */
    private readonly _canvas: HTMLCanvasElement;                   // Canvas the mouse source listens on
    private readonly _controls: ControlsConfig;                    // Controls built at every start
    private readonly _keyboardTarget: GestureSourceLike;           // Where the keyboard source listens
    private readonly _player: DosPlayer;                           // Session lifecycle, constructed at once
    private readonly _storage: DosStorage | null;                  // Saves storage, or null when the page manages persistence itself
    private _keyboardEnabled: boolean = true;                      // Recorded keyboard gate, taken by the source at start
    private _mouseEnabled: boolean = true;                         // Recorded mouse gate, taken by the source at start
    private _keyboard: KeyboardSource | null = null;               // Keyboard source while started, else null
    private _mouse: MouseSource | null = null;                     // Mouse source while started, else null
    private _mapper: InputMapper | null = null;                    // Mapper while started, else null
    private _primitives: Array<Button | DPad | AnalogStick | Trackpad> = [];   // Primitives while started
    private _holdBindings: Unsubscribe[] = [];                     // Removers of button hold bindings; each releases what it holds
    private _unsubscribeExit: Unsubscribe | null = null;           // Removes the player exit subscription
    private _isStarted: boolean = false;                           // Whether start() built the controls and no exit has torn them down
    private _destroyed: boolean = false;                           // Whether destroy() has run

    // CONSTRUCTOR :: DosDeploymentConfig -> this
    // Validates the config and constructs the player; sources, primitives and mapper wait for start()
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosDeploymentConfig() or has no adapter
    constructor(config: DosDeploymentConfig) {
        if (!isDosDeploymentConfig(config) || config.adapter === undefined) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "DosDeployment config must hold a canvas, a container, a game, an adapter and valid controls.", data: config });
        }
        this._canvas = config.canvas;
        this._controls = config.controls ?? {};
        this._keyboardTarget = config.keyboardTarget ?? config.container.ownerDocument;
        const playerConfig: { -readonly [K in keyof DosPlayerConfig]: DosPlayerConfig[K] } = {
            canvas: config.canvas,
            container: config.container,
            game: config.game,
            adapter: config.adapter,
            gestureSource: config.container,
        };
        if (config.fetch !== undefined) playerConfig.fetch = config.fetch;
        this._player = new DosPlayer(playerConfig);
        this._storage = config.storage ?? null;
        this.keyboardEnabled = this._controls.keyboard?.enabled ?? true;
        this.mouseEnabled = this._controls.mouse?.enabled ?? true;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> dosPlayer
    // The player, available from construction
    get player(): DosPlayer {
        return this._player;
    }

    // GETTER :: VOID -> dosStorage?
    // The configured saves storage, or null
    get storage(): DosStorage | null {
        return this._storage;
    }

    // GETTER :: VOID -> inputMapper?
    // The mapper while started, else null
    get mapper(): InputMapper | null {
        return this._mapper;
    }

    // GETTER :: VOID -> keyboardSource?
    // The keyboard source while started with a keyboard control, else null
    get keyboard(): KeyboardSource | null {
        return this._keyboard;
    }

    // GETTER :: VOID -> mouseSource?
    // The mouse source while started with a mouse control, else null
    get mouse(): MouseSource | null {
        return this._mouse;
    }

    // GETTER :: VOID -> BOOLEAN
    // The keyboard source's enable gate, or false when there is no source
    get keyboardEnabled(): boolean {
        return this._keyboard?.enabled ?? false;
    }

    // SETTER :: BOOLEAN -> VOID
    // Sets the keyboard source's enable gate when there is one, and records the value for the next start
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a boolean
    set keyboardEnabled(value: boolean) {
        if (typeof value !== "boolean") {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "keyboardEnabled must be a boolean.", data: value });
        }
        this._keyboardEnabled = value;
        if (this._keyboard !== null) this._keyboard.enabled = value;
    }

    // GETTER :: VOID -> BOOLEAN
    // The mouse source's enable gate, or false when there is no source
    get mouseEnabled(): boolean {
        return this._mouse?.enabled ?? false;
    }

    // SETTER :: BOOLEAN -> VOID
    // Sets the mouse source's enable gate when there is one, and records the value for the next start
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when value is not a boolean
    set mouseEnabled(value: boolean) {
        if (typeof value !== "boolean") {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "mouseEnabled must be a boolean.", data: value });
        }
        this._mouseEnabled = value;
        if (this._mouse !== null) this._mouse.enabled = value;
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the controls are built over a running session
    get isStarted(): boolean {
        return this._isStarted;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Starts the player, then builds the sources, mapper and primitives from the controls and binds them
    // NOTE: Throws DosRuntimeError ALREADY_STARTED while started; a player.start() rejection propagates as is and leaves nothing attached
    // NOTE: When building the controls throws, whatever was built is torn down and the error propagates
    async start(): Promise<void> {
        if (this._isStarted) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.ALREADY_STARTED, message: "DosDeployment is already started.", data: null });
        }
        await this._player.start();
        if (this._destroyed) return;
        try {
            this.buildControls(this._player.input);
        } catch (error) {
            this.teardownControls();
            throw error;
        }
        this._isStarted = true;
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Requests fullscreen on the container through the player's display
    // NOTE: Rejects as DosDisplay.fullscreen does: UNSUPPORTED or FULLSCREEN_FAILED
    fullscreen(): Promise<void> {
        return this._player.fullscreen();
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Leaves fullscreen through the player's display
    // NOTE: Rejects as DosDisplay.exitFullscreen does: UNSUPPORTED or FULLSCREEN_FAILED
    exitFullscreen(): Promise<void> {
        return this._player.display.exitFullscreen();
    }

    // INSTANCE :: VOID -> PROMISE(BOOLEAN)
    // Persists the game's changed files into the storage; false when nothing changed since start
    // NOTE: Rejects with UNSUPPORTED when no storage was configured; NOT_STARTED and STORAGE_FAILED propagate from the player and storage
    async save(): Promise<boolean> {
        if (this._storage === null) throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "DosDeployment has no storage to save into." });
        const overlay = await this._player.persist();
        if (overlay === null) return false;
        await this._storage.save(overlay);
        return true;
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Destroys the sources, primitives and mapper, then destroys the player
    // NOTE: Calling destroy twice is a no-op
    async destroy(): Promise<void> {
        if (this._destroyed) return;
        this._destroyed = true;
        this.teardownControls();
        await this._player.destroy();
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: dosInput -> VOID
    // Constructs, attaches and binds every configured source and primitive, applying the recorded enable gates, and subscribes to the player's exit
    private buildControls(input: DosInput): void {
        const { keyboard, mouse, buttons = [], dpads = [], sticks = [], trackpads = [] } = this._controls;
        this._unsubscribeExit = this._player.on("exit", () => this.teardownControls());
        if (keyboard !== undefined) {
            const keyboardConfig: { -readonly [K in keyof KeyboardSourceConfig]: KeyboardSourceConfig[K] } = { input, target: this._keyboardTarget };
            if (keyboard.filter !== undefined) keyboardConfig.filter = keyboard.filter;
            if (keyboard.preventDefault !== undefined) keyboardConfig.preventDefault = keyboard.preventDefault;
            this._keyboard = KeyboardSource.init(keyboardConfig);
            this._keyboard.enabled = this._keyboardEnabled;
            this._keyboard.attach();
        }
        if (mouse !== undefined) {
            const mouseConfig: { -readonly [K in keyof MouseSourceConfig]: MouseSourceConfig[K] } = { input, surface: this._canvas };
            if (mouse.sensitivity !== undefined) mouseConfig.sensitivity = mouse.sensitivity;
            if (mouse.touch !== undefined) mouseConfig.touch = mouse.touch;
            if (mouse.pointerLock === true) mouseConfig.pointerLock = this._canvas;
            this._mouse = MouseSource.init(mouseConfig);
            this._mouse.enabled = this._mouseEnabled;
            this._mouse.attach();
        }
        const mapper = InputMapper.init({ input });
        this._mapper = mapper;
        for (const control of buttons) {
            const button = Button.init(control.holdDelayMs === undefined ? { surface: control.surface } : { surface: control.surface, holdDelayMs: control.holdDelayMs });
            this._primitives.push(button);
            button.attach();
            mapper.bindButton(button, control.target);
            if (control.hold !== undefined) this._holdBindings.push(this.bindHold(input, button, control.hold));
        }
        for (const control of dpads) {
            const dpad = DPad.init({
                surface: control.surface,
                ...(control.deadZone !== undefined ? { deadZone: control.deadZone } : {}),
                ...(control.diagonals !== undefined ? { diagonals: control.diagonals } : {}),
            });
            this._primitives.push(dpad);
            dpad.attach();
            mapper.bindDPad(dpad, control.map);
        }
        for (const control of sticks) {
            const stick = AnalogStick.init({
                surface: control.surface,
                ...(control.deadZone !== undefined ? { deadZone: control.deadZone } : {}),
                ...(control.radius !== undefined ? { radius: control.radius } : {}),
            });
            this._primitives.push(stick);
            stick.attach();
            mapper.bindAnalogStick(stick, control.map);
        }
        for (const control of trackpads) {
            const trackpad = Trackpad.init({
                surface: control.surface,
                ...(control.sensitivity !== undefined ? { sensitivity: control.sensitivity } : {}),
                ...(control.tapMaxMs !== undefined ? { tapMaxMs: control.tapMaxMs } : {}),
                ...(control.tapMaxDistance !== undefined ? { tapMaxDistance: control.tapMaxDistance } : {}),
                ...(control.holdDelayMs !== undefined ? { holdDelayMs: control.holdDelayMs } : {}),
            });
            this._primitives.push(trackpad);
            trackpad.attach();
            mapper.bindTrackpad(trackpad, control.map);
        }
    }

    // PRIVATE :: VOID -> VOID
    // Removes hold bindings, destroys the mapper, primitives and sources, drops the exit subscription and leaves the started state
    // NOTE: Safe to call when nothing is built
    private teardownControls(): void {
        for (const unbind of this._holdBindings) unbind();
        this._holdBindings = [];
        this._mapper?.destroy();
        this._mapper = null;
        for (const primitive of this._primitives) primitive.destroy();
        this._primitives = [];
        this._keyboard?.destroy();
        this._keyboard = null;
        this._mouse?.destroy();
        this._mouse = null;
        this._unsubscribeExit?.();
        this._unsubscribeExit = null;
        this._isStarted = false;
    }

    // PRIVATE :: dosInput, button, inputTarget -> unsubscribe
    // Presses target on the button's hold event and releases it on the button's release; the remover releases it when held
    // NOTE: InputMapper.bindButton does not map hold, so the deployment binds it here
    private bindHold(input: DosInput, button: Button, target: InputTarget): Unsubscribe {
        let held = false;
        const offHold = button.on("hold", () => {
            if (held) return;
            held = true;
            InputMapper.press(input, target);
        });
        const offRelease = button.on("release", () => {
            if (!held) return;
            held = false;
            InputMapper.release(input, target);
        });
        return () => {
            offHold();
            offRelease();
            if (held) {
                held = false;
                InputMapper.release(input, target);
            }
        };
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: dosDeploymentConfig -> PROMISE(dosDeployment)
    // Defaults the adapter to js-dos serving from /emulators/ and fetch to globalThis.fetch, then constructs
    static async init(config: DosDeploymentConfig): Promise<DosDeployment> {
        const adapter = config.adapter ?? await JsDosEmulatorAdapter.init({ pathPrefix: "/emulators/" });
        const stored = config.storage !== undefined && config.game.changes === undefined ? await config.storage.load() : null;
        const game = stored === null ? config.game : { ...config.game, changes: stored };
        return new DosDeployment({
            ...config,
            game,
            adapter,
            fetch: config.fetch ?? ((url: string) => globalThis.fetch(url)),
        });
    }
}
