// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for rejected arguments and lifecycle misuse

// Type dependencies:
import {
    isFiniteNumber,                                                // Guards mouse deltas and axis values
    isJoystickAxis,                                                // Guards axis arguments
    isJoystickButton,                                              // Guards joystick button arguments
    isKeyCode,                                                     // Guards key arguments
    isMouseButton,                                                 // Guards mouse button arguments
    type EmulatorSession,                                          // Session every call is forwarded to
    type FiniteNumber,                                             // Delta and axis value type
    type JoystickAxis,                                             // Axis literal
    type JoystickButton,                                           // Joystick button literal
    type KeyCode,                                                  // Key code type
    type MouseButton,                                              // Mouse button literal
} from "../shared.types.js";
import {
    isDosInputConfig,                                              // Runtime guard for the constructor config
    type DosInputConfig,                                           // Construction config
    type DosInputSnapshot,                                         // Shape returned by the snapshot getter
} from "./types.js";

/**
 *
 * Class
 *
 */

// The runtime's input API: forwards keyboard, mouse and joystick input to a session and tracks what is held so it can release everything
export default class DosInput {

    /* Instance Fields */
    private readonly _session: EmulatorSession;                    // Session every call is forwarded to
    private readonly _keysDown = new Set<KeyCode>();               // Keys currently held
    private readonly _mouseButtonsDown = new Set<MouseButton>();   // Mouse buttons currently held
    private readonly _joystickButtonsDown = new Set<JoystickButton>();   // Joystick buttons currently held
    private readonly _joystickAxes: Record<JoystickAxis, FiniteNumber> = { x: 0, y: 0 };   // Last value sent per axis
    private _destroyed = false;                                    // Whether destroy() has run

    // CONSTRUCTOR :: DosInputConfig -> this
    // Creates an input API over the given session
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosInputConfig()
    constructor(config: DosInputConfig) {
        if (!isDosInputConfig(config)) throw DosInput.invalidConfig("DosInput config must hold an EmulatorSession.", config);
        this._session = config.session;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> DosInputSnapshot
    // Returns a fresh plain object of everything currently held
    get snapshot(): DosInputSnapshot {
        return {
            keysDown: [...this._keysDown].sort(),
            mouseButtonsDown: [...this._mouseButtonsDown],
            joystickButtonsDown: [...this._joystickButtonsDown],
            joystickAxes: { x: this._joystickAxes.x, y: this._joystickAxes.y },
        };
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether destroy() has run
    get isDestroyed(): boolean {
        return this._destroyed;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: keyCode -> VOID
    // Presses a key; a no-op when it is already held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad code, DESTROYED after destroy()
    keyDown(code: KeyCode): void {
        this.assertLive();
        if (!isKeyCode(code)) throw DosInput.invalidConfig("keyDown requires a KeyCode.", code);
        if (this._keysDown.has(code)) return;
        this._session.sendKey(code, true);
        this._keysDown.add(code);
    }

    // INSTANCE :: keyCode -> VOID
    // Releases a key; a no-op when it is not held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad code, DESTROYED after destroy()
    keyUp(code: KeyCode): void {
        this.assertLive();
        if (!isKeyCode(code)) throw DosInput.invalidConfig("keyUp requires a KeyCode.", code);
        if (!this._keysDown.has(code)) return;
        this._session.sendKey(code, false);
        this._keysDown.delete(code);
    }

    // INSTANCE :: keyCode -> VOID
    // Presses then releases a key synchronously
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad code, DESTROYED after destroy()
    keyPress(code: KeyCode): void {
        this.keyDown(code);
        this.keyUp(code);
    }

    // INSTANCE :: finiteNumber, finiteNumber -> VOID
    // Forwards a relative mouse movement unchanged; a zero movement on both axes is not forwarded
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a non-finite delta, DESTROYED after destroy()
    mouseMove(dx: FiniteNumber, dy: FiniteNumber): void {
        this.assertLive();
        if (!isFiniteNumber(dx)) throw DosInput.invalidConfig("mouseMove requires a finite dx.", dx);
        if (!isFiniteNumber(dy)) throw DosInput.invalidConfig("mouseMove requires a finite dy.", dy);
        if (dx === 0 && dy === 0) return;
        this._session.sendMouseMotion(dx, dy);
    }

    // INSTANCE :: finiteNumber, finiteNumber -> VOID
    // Forwards an absolute cursor position, normalized 0..1, unchanged and without deduplication
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a coordinate outside 0..1, DESTROYED after destroy()
    mouseMoveTo(x: FiniteNumber, y: FiniteNumber): void {
        this.assertLive();
        if (!isFiniteNumber(x) || x < 0 || x > 1) throw DosInput.invalidConfig("mouseMoveTo requires x within 0..1.", x);
        if (!isFiniteNumber(y) || y < 0 || y > 1) throw DosInput.invalidConfig("mouseMoveTo requires y within 0..1.", y);
        this._session.sendMousePosition(x, y);
    }

    // INSTANCE :: mouseButton -> VOID
    // Presses a mouse button; a no-op when it is already held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad button, DESTROYED after destroy()
    mouseDown(button: MouseButton): void {
        this.assertLive();
        if (!isMouseButton(button)) throw DosInput.invalidConfig("mouseDown requires a MouseButton.", button);
        if (this._mouseButtonsDown.has(button)) return;
        this._session.sendMouseButton(button, true);
        this._mouseButtonsDown.add(button);
    }

    // INSTANCE :: mouseButton -> VOID
    // Releases a mouse button; a no-op when it is not held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad button, DESTROYED after destroy()
    mouseUp(button: MouseButton): void {
        this.assertLive();
        if (!isMouseButton(button)) throw DosInput.invalidConfig("mouseUp requires a MouseButton.", button);
        if (!this._mouseButtonsDown.has(button)) return;
        this._session.sendMouseButton(button, false);
        this._mouseButtonsDown.delete(button);
    }

    // INSTANCE :: joystickButton -> VOID
    // Presses a joystick button; a no-op when it is already held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad button, DESTROYED after destroy()
    joystickButtonDown(button: JoystickButton): void {
        this.assertLive();
        if (!isJoystickButton(button)) throw DosInput.invalidConfig("joystickButtonDown requires a JoystickButton.", button);
        if (this._joystickButtonsDown.has(button)) return;
        this._session.sendJoystickButton(button, true);
        this._joystickButtonsDown.add(button);
    }

    // INSTANCE :: joystickButton -> VOID
    // Releases a joystick button; a no-op when it is not held
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad button, DESTROYED after destroy()
    joystickButtonUp(button: JoystickButton): void {
        this.assertLive();
        if (!isJoystickButton(button)) throw DosInput.invalidConfig("joystickButtonUp requires a JoystickButton.", button);
        if (!this._joystickButtonsDown.has(button)) return;
        this._session.sendJoystickButton(button, false);
        this._joystickButtonsDown.delete(button);
    }

    // INSTANCE :: joystickAxis, finiteNumber -> VOID
    // Sets an axis to a value in -1..1; the same value twice is forwarded once
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a bad axis or a value outside -1..1, DESTROYED after destroy()
    joystickAxis(axis: JoystickAxis, value: FiniteNumber): void {
        this.assertLive();
        if (!isJoystickAxis(axis)) throw DosInput.invalidConfig("joystickAxis requires a JoystickAxis.", axis);
        if (!isFiniteNumber(value) || value < -1 || value > 1) throw DosInput.invalidConfig("joystickAxis requires a value in -1..1.", value);
        if (this._joystickAxes[axis] === value) return;
        this._session.sendJoystickAxis(axis, value);
        this._joystickAxes[axis] = value;
    }

    // INSTANCE :: VOID -> VOID
    // Releases every held key, mouse button and joystick button, then zeroes every non-zero axis, in that order
    // NOTE: Throws DosRuntimeError DESTROYED after destroy()
    releaseAll(): void {
        this.assertLive();
        this.releaseEverything();
    }

    // INSTANCE :: VOID -> VOID
    // Releases everything and marks the input destroyed; a second call is a no-op
    destroy(): void {
        if (this._destroyed) return;
        this.releaseEverything();
        this._destroyed = true;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> VOID
    // Throws DESTROYED when destroy() has run
    private assertLive(): void {
        if (this._destroyed) throw new DosRuntimeError({ code: DosRuntimeError.CODE.DESTROYED, message: "DosInput has been destroyed." });
    }

    // PRIVATE :: VOID -> VOID
    // The release sequence shared by releaseAll() and destroy()
    private releaseEverything(): void {
        for (const code of [...this._keysDown].sort()) {
            this._session.sendKey(code, false);
            this._keysDown.delete(code);
        }
        for (const button of this._mouseButtonsDown) {
            this._session.sendMouseButton(button, false);
            this._mouseButtonsDown.delete(button);
        }
        for (const button of this._joystickButtonsDown) {
            this._session.sendJoystickButton(button, false);
            this._joystickButtonsDown.delete(button);
        }
        for (const axis of ["x", "y"] as const) {
            if (this._joystickAxes[axis] === 0) continue;
            this._session.sendJoystickAxis(axis, 0);
            this._joystickAxes[axis] = 0;
        }
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: DosInputConfig -> dosInput
    // Mirrors the constructor
    static init(config: DosInputConfig): DosInput {
        return new DosInput(config);
    }

    // STATIC :: STRING, UNKNOWN -> dosRuntimeError
    // Builds the INVALID_CONFIG error carrying the rejected value
    private static invalidConfig(message: string, data: unknown): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message, data });
    }
}
