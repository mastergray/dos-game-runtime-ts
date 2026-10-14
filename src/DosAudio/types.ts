// Type dependencies:
import { isEmulatorSession, type EmulatorSession } from "../shared.types.js";   // Session whose samples are played, and its guard

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {addEventListener:(STRING, (event -> VOID), OBJECT? -> VOID), removeEventListener:(STRING, (event -> VOID), OBJECT? -> VOID)}
// Where the gesture unlock listens: a DOM element or document in production.
export interface GestureSourceLike {
    addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;   // Subscribes
    removeEventListener(type: string, listener: (event: Event) => void, options?: EventListenerOptions): void;   // Unsubscribes
}

// INTERFACE :: the subset of AudioContext the class uses
// Injectable so a test can wrap or script the context; a real AudioContext satisfies it.
export interface AudioContextLike {
    readonly state: "suspended" | "running" | "closed" | "interrupted";   // Autoplay state; "running" once unlocked
    readonly sampleRate: number;                                   // Context rate in Hz; may differ from the session's
    readonly currentTime: number;                                  // Audio clock in seconds
    readonly destination: AudioNode;                               // Speakers
    resume(): Promise<void>;                                       // Unlocks after a user gesture
    close(): Promise<void>;                                        // Releases the context
    createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;   // Sample container
    createBufferSource(): AudioBufferSourceNode;                   // Plays one buffer once
    createGain(): GainNode;                                        // Volume node used for mute
}

// INTERFACE :: {session:emulatorSession, gestureSource:gestureSourceLike, audioContext:audioContextLike}
// Construction config accepted by the constructor; init() fills audioContext when omitted.
export interface DosAudioConfig {
    readonly session: EmulatorSession;                             // Source of samples via onSound
    readonly gestureSource: GestureSourceLike;                     // Element whose first gesture unlocks audio
    readonly audioContext: AudioContextLike;                       // Context that plays the samples
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has addEventListener and removeEventListener functions
export function isGestureSourceLike(value: unknown): value is GestureSourceLike {
    return typeof value === "object" && value !== null
        && typeof (value as GestureSourceLike).addEventListener === "function"
        && typeof (value as GestureSourceLike).removeEventListener === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a known state, numeric sampleRate and currentTime, an object destination, and the five methods
export function isAudioContextLike(value: unknown): value is AudioContextLike {
    if (typeof value !== "object" || value === null) return false;
    const context = value as AudioContextLike;
    return (context.state === "suspended" || context.state === "running" || context.state === "closed" || context.state === "interrupted")
        && typeof context.sampleRate === "number"
        && typeof context.currentTime === "number"
        && typeof context.destination === "object" && context.destination !== null
        && typeof context.resume === "function"
        && typeof context.close === "function"
        && typeof context.createBuffer === "function"
        && typeof context.createBufferSource === "function"
        && typeof context.createGain === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an EmulatorSession, a GestureSourceLike and an AudioContextLike
export function isDosAudioConfig(value: unknown): value is DosAudioConfig {
    return typeof value === "object" && value !== null
        && isEmulatorSession((value as DosAudioConfig).session)
        && isGestureSourceLike((value as DosAudioConfig).gestureSource)
        && isAudioContextLike((value as DosAudioConfig).audioContext);
}
