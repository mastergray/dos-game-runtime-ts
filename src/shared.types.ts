/**
 *
 * Type Declarations
 *
 */

// TYPE :: STRING
// A string containing at least one non-whitespace character; isNonEmptyString is its meaning.
export type NonEmptyString = string;

// TYPE :: NUMBER
// A number that is neither NaN nor infinite; isFiniteNumber is its meaning.
export type FiniteNumber = number;

// TYPE :: STRING
// A DOM KeyboardEvent.code value such as "ArrowUp" or "ControlLeft"; the vocabulary the whole package speaks.
// NOTE: isKeyCode checks the shape only; whether an emulator can take the key is the adapter's UNSUPPORTED_KEY.
export type KeyCode = string;

// TYPE :: "left" | "middle" | "right"
// Closed set of mouse buttons.
export type MouseButton = "left" | "middle" | "right";

// TYPE :: 0 | 1 | 2 | 3
// Closed set of DOS joystick buttons.
export type JoystickButton = 0 | 1 | 2 | 3;

// TYPE :: "x" | "y"
// Closed set of DOS joystick axes.
export type JoystickAxis = "x" | "y";

// TYPE :: VOID -> VOID
// Removes a subscription made by an on* method.
export type Unsubscribe = () => void;

// TYPE :: T -> VOID
// A subscriber receiving one event of type T.
// NOTE: <T> is the event payload type.
export type Listener<T> = (event: T) => void;

// INTERFACE :: {x:finiteNumber, y:finiteNumber}
// A 2-D vector or point.
export interface Vector2 {
    readonly x: FiniteNumber;                                      // Horizontal component
    readonly y: FiniteNumber;                                      // Vertical component
}

// INTERFACE :: {left:finiteNumber, top:finiteNumber, width:finiteNumber, height:finiteNumber}
// A rectangle in CSS pixels, as getBoundingClientRect() reports one.
export interface Rect {
    readonly left: FiniteNumber;                                   // Left edge
    readonly top: FiniteNumber;                                    // Top edge
    readonly width: FiniteNumber;                                  // Width
    readonly height: FiniteNumber;                                 // Height
}

// INTERFACE :: the subset of PointerEvent the primitives read
// What a pointer primitive depends on; a real PointerEvent satisfies it structurally.
export interface PointerEventLike {
    readonly type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture";   // Event kind
    readonly pointerId: number;                                    // Identifies one finger, mouse or stylus contact
    readonly pointerType: "mouse" | "touch" | "pen";               // Physical source
    readonly clientX: FiniteNumber;                                // Viewport x
    readonly clientY: FiniteNumber;                                // Viewport y
    readonly button: number;                                       // Button that changed, or -1
    readonly buttons: number;                                      // Bitmask of buttons held
    readonly timeStamp: FiniteNumber;                              // Event time in ms
    preventDefault(): void;                                        // Suppresses the browser's default gesture
}

// INTERFACE :: what a primitive attaches pointer listeners to
// A DOM element in production; pointer capture is optional because old browsers lack it.
export interface InputSurface {
    addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;   // Subscribes
    removeEventListener(type: string, listener: (event: Event) => void, options?: EventListenerOptions): void;   // Unsubscribes
    getBoundingClientRect(): Rect;                                 // Current layout rectangle
    setPointerCapture?(pointerId: number): void;                   // Routes further events of that pointer here
    releasePointerCapture?(pointerId: number): void;               // Undoes setPointerCapture
}

// INTERFACE :: {request:((finiteNumber -> VOID) -> NUMBER), cancel:(NUMBER -> VOID)}
// requestAnimationFrame and cancelAnimationFrame, injectable so a test can drive frames by hand.
export interface FrameScheduler {
    request(callback: (time: FiniteNumber) => void): number;       // Schedules one callback before the next frame
    cancel(handle: number): void;                                  // Cancels a scheduled callback
}

// INTERFACE :: {setTimeout:((VOID -> VOID), finiteNumber -> NUMBER), clearTimeout:(NUMBER -> VOID)}
// setTimeout and clearTimeout, injectable so a test can advance time by hand.
export interface TimerLike {
    setTimeout(callback: () => void, ms: FiniteNumber): number;    // Schedules callback after ms; returns a handle
    clearTimeout(handle: number): void;                            // Cancels a scheduled callback
}

// INTERFACE :: {width:NUMBER, height:NUMBER, rgba:Uint8ClampedArray}
// One video frame from the emulator, ready for putImageData.
export interface FrameEvent {
    readonly width: number;                                        // Frame width in pixels
    readonly height: number;                                       // Frame height in pixels
    readonly rgba: Uint8ClampedArray;                              // width × height × 4 bytes, alpha 255
}

// INTERFACE :: a running emulator
// The replacement boundary: everything above talks to this, never to the emulator library.
// NOTE: pause/resume are synchronous, persist yields null when nothing changed, and sound is raw samples the session does not play.
export interface EmulatorSession {
    readonly soundFrequency: number;                               // Sample rate of onSound samples in Hz
    sendKey(code: KeyCode, pressed: boolean): void;                // Presses or releases a key
    sendMouseMotion(dx: FiniteNumber, dy: FiniteNumber): void;     // Relative mouse movement
    sendMousePosition(x: FiniteNumber, y: FiniteNumber): void;     // Absolute cursor position, normalized 0..1 over the screen
    sendMouseButton(button: MouseButton, pressed: boolean): void;  // Presses or releases a mouse button
    sendJoystickButton(button: JoystickButton, pressed: boolean): void;   // Presses or releases a joystick button
    sendJoystickAxis(axis: JoystickAxis, value: FiniteNumber): void;      // Sets a joystick axis in -1..1
    pause(): void;                                                 // Stops emulation
    resume(): void;                                                // Continues emulation
    persist(): Promise<Uint8Array | null>;                         // Overlay of changed files, or null when unchanged
    exit(): Promise<void>;                                         // Stops the emulator for good
    onFrame(listener: Listener<FrameEvent>): Unsubscribe;          // Video frames
    onSound(listener: Listener<Float32Array>): Unsubscribe;        // Mono samples at soundFrequency
    onExit(listener: Listener<void>): Unsubscribe;                 // The emulator stopped
}

// INTERFACE :: {type:nonEmptyString, start:(emulatorStartConfig -> PROMISE(emulatorSession))}
// Starts emulator sessions; one implementation per emulator backend.
export interface EmulatorAdapter {
    readonly type: NonEmptyString;                                 // Backend identity, e.g. "js-dos"
    start(config: EmulatorStartConfig): Promise<EmulatorSession>;  // Boots a session from a bundle
}

// INTERFACE :: {bundle:Uint8Array, changes:Uint8Array?}
// What a session starts from: the game bundle and, optionally, a saves overlay from a previous persist().
export interface EmulatorStartConfig {
    readonly bundle: Uint8Array;                                   // The game bundle bytes
    readonly changes?: Uint8Array;                                 // Overlay from persist(), restored over the bundle
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a string with at least one non-whitespace character
export function isNonEmptyString(value: unknown): value is NonEmptyString {
    return typeof value === "string" && /\S/.test(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a finite number
export function isFiniteNumber(value: unknown): value is FiniteNumber {
    return typeof value === "number" && Number.isFinite(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is a non-empty string of ASCII letters and digits only, the shape of a DOM code
export function isKeyCode(value: unknown): value is KeyCode {
    return typeof value === "string" && /^[A-Za-z0-9]+$/.test(value);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the MouseButton literals
export function isMouseButton(value: unknown): value is MouseButton {
    return value === "left" || value === "middle" || value === "right";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the JoystickButton literals
export function isJoystickButton(value: unknown): value is JoystickButton {
    return value === 0 || value === 1 || value === 2 || value === 3;
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is one of the JoystickAxis literals
export function isJoystickAxis(value: unknown): value is JoystickAxis {
    return value === "x" || value === "y";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is an object whose x and y are finite numbers
export function isVector2(value: unknown): value is Vector2 {
    return typeof value === "object" && value !== null
        && isFiniteNumber((value as Vector2).x)
        && isFiniteNumber((value as Vector2).y);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value is an object whose left, top, width and height are finite numbers
export function isRect(value: unknown): value is Rect {
    return typeof value === "object" && value !== null
        && isFiniteNumber((value as Rect).left)
        && isFiniteNumber((value as Rect).top)
        && isFiniteNumber((value as Rect).width)
        && isFiniteNumber((value as Rect).height);
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value carries the pointer fields the primitives read, with a known type and pointerType
export function isPointerEventLike(value: unknown): value is PointerEventLike {
    if (typeof value !== "object" || value === null) return false;
    const event = value as PointerEventLike;
    return ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"].includes(event.type)
        && typeof event.pointerId === "number"
        && ["mouse", "touch", "pen"].includes(event.pointerType)
        && isFiniteNumber(event.clientX)
        && isFiniteNumber(event.clientY)
        && typeof event.button === "number"
        && typeof event.buttons === "number"
        && isFiniteNumber(event.timeStamp)
        && typeof event.preventDefault === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has the listener and rect methods of an InputSurface; capture methods are optional
export function isInputSurface(value: unknown): value is InputSurface {
    if (typeof value !== "object" || value === null) return false;
    const surface = value as InputSurface;
    return typeof surface.addEventListener === "function"
        && typeof surface.removeEventListener === "function"
        && typeof surface.getBoundingClientRect === "function"
        && (surface.setPointerCapture === undefined || typeof surface.setPointerCapture === "function")
        && (surface.releasePointerCapture === undefined || typeof surface.releasePointerCapture === "function");
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has request and cancel functions
export function isFrameScheduler(value: unknown): value is FrameScheduler {
    return typeof value === "object" && value !== null
        && typeof (value as FrameScheduler).request === "function"
        && typeof (value as FrameScheduler).cancel === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has setTimeout and clearTimeout functions
export function isTimerLike(value: unknown): value is TimerLike {
    return typeof value === "object" && value !== null
        && typeof (value as TimerLike).setTimeout === "function"
        && typeof (value as TimerLike).clearTimeout === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a numeric soundFrequency and every EmulatorSession method as a function
export function isEmulatorSession(value: unknown): value is EmulatorSession {
    if (typeof value !== "object" || value === null) return false;
    const session = value as EmulatorSession;
    return typeof session.soundFrequency === "number"
        && typeof session.sendKey === "function"
        && typeof session.sendMouseMotion === "function"
        && typeof session.sendMousePosition === "function"
        && typeof session.sendMouseButton === "function"
        && typeof session.sendJoystickButton === "function"
        && typeof session.sendJoystickAxis === "function"
        && typeof session.pause === "function"
        && typeof session.resume === "function"
        && typeof session.persist === "function"
        && typeof session.exit === "function"
        && typeof session.onFrame === "function"
        && typeof session.onSound === "function"
        && typeof session.onExit === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a non-empty string type and a start function
export function isEmulatorAdapter(value: unknown): value is EmulatorAdapter {
    return typeof value === "object" && value !== null
        && isNonEmptyString((value as EmulatorAdapter).type)
        && typeof (value as EmulatorAdapter).start === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a Uint8Array bundle and, if present, a Uint8Array changes
export function isEmulatorStartConfig(value: unknown): value is EmulatorStartConfig {
    if (typeof value !== "object" || value === null) return false;
    const config = value as EmulatorStartConfig;
    return config.bundle instanceof Uint8Array
        && (config.changes === undefined || config.changes instanceof Uint8Array);
}
