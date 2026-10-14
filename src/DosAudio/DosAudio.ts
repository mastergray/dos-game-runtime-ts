// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors thrown on rejected config and failed unlock

// Type dependencies:
import type { EmulatorSession, FiniteNumber, Unsubscribe } from "../shared.types.js";   // Session, numeric type and subscription remover
import {
    isDosAudioConfig,                                              // Guards the construction config
    type AudioContextLike,                                         // Context subset the class drives
    type DosAudioConfig,                                           // Construction config shape
    type GestureSourceLike,                                        // Element the unlock listens on
} from "./types.js";

/**
 *
 * Class
 *
 */

// Plays the emulator's raw sample pushes through an AudioContext and unlocks that context on the page's first gesture
export default class DosAudio {

    /* Static Fields */
    static readonly GESTURE_EVENTS: ReadonlyArray<string> = ["pointerdown", "keydown", "touchend"];   // Events that count as a user gesture
    static readonly MAX_QUEUE_MS: FiniteNumber = 200;             // Queue cap; older samples are dropped beyond it
    static readonly MIN_CHUNK_MS: FiniteNumber = 20;              // Smallest amount scheduled as one buffer
    static readonly LEAD_SECONDS = 0.02;                          // Lead when the schedule has run dry

    /* Instance Fields */
    private readonly _session: EmulatorSession;                    // Sample source
    private readonly _gestureSource: GestureSourceLike;            // Where gesture listeners are attached
    private readonly _context: AudioContextLike;                   // Playback context
    private readonly _gain: GainNode;                              // Single volume node feeding destination
    private readonly _unsubscribeSound: Unsubscribe;               // Removes the onSound subscription
    private readonly _sources = new Set<AudioBufferSourceNode>();  // Scheduled, not yet ended buffer sources
    private _queue: Float32Array[] = [];                           // Queued chunks awaiting scheduling, oldest first
    private _queued = 0;                                           // Samples across _queue
    private _droppedSamples = 0;                                   // Samples dropped by the cap
    private _nextStartTime = 0;                                    // Audio-clock time the next buffer starts at
    private _armed: Unsubscribe | null = null;                     // Remover for armed gesture listeners, or null
    private _muted = false;                                        // Whether gain is 0
    private _destroyed = false;                                    // Whether destroy() ran

    // CONSTRUCTOR :: DosAudioConfig -> this
    // Creates the gain node and subscribes to the session's samples at once, so nothing before the unlock is lost
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosAudioConfig()
    constructor(config: DosAudioConfig) {
        if (!isDosAudioConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "DosAudio config must hold a session, a gesture source and an audio context.", data: config });
        }
        this._session = config.session;
        this._gestureSource = config.gestureSource;
        this._context = config.audioContext;
        this._gain = this._context.createGain();
        this._gain.connect(this._context.destination);
        this._unsubscribeSound = this._session.onSound((samples) => this.enqueue(samples));
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> BOOLEAN
    // Whether the context is running
    get isUnlocked(): boolean {
        return this._context.state === "running";
    }

    // GETTER :: VOID -> BOOLEAN
    // Whether the gain is at zero
    get isMuted(): boolean {
        return this._muted;
    }

    // GETTER :: VOID -> NUMBER
    // The context's sample rate in Hz
    get sampleRate(): number {
        return this._context.sampleRate;
    }

    // GETTER :: VOID -> NUMBER
    // Milliseconds of samples queued and not yet scheduled
    get queuedMs(): FiniteNumber {
        return (this._queued / this._session.soundFrequency) * 1000;
    }

    // GETTER :: VOID -> NUMBER
    // Samples dropped by the queue cap since construction
    get droppedSamples(): number {
        return this._droppedSamples;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Resumes the context unless it is already running, then flushes the queue
    // NOTE: Throws DosRuntimeError AUDIO_FAILED when resume() rejects; the caught value is data
    async unlock(): Promise<void> {
        if (this._context.state !== "running") {
            try {
                await this._context.resume();
            } catch (error) {
                throw new DosRuntimeError({ code: DosRuntimeError.CODE.AUDIO_FAILED, message: "The audio context could not be resumed.", data: error });
            }
        }
        this.flush();
    }

    // INSTANCE :: VOID -> unsubscribe
    // Listens for the first gesture on the gesture source and unlocks on it; listeners stay armed while unlock fails
    // NOTE: Arming while already armed returns the existing remover without adding listeners again
    armGestureUnlock(): Unsubscribe {
        if (this._armed !== null) return this._armed;
        const listener = (): void => {
            this.unlock().then(() => remove(), () => undefined);
        };
        const remove = (): void => {
            for (const type of DosAudio.GESTURE_EVENTS) this._gestureSource.removeEventListener(type, listener);
            this._armed = null;
        };
        for (const type of DosAudio.GESTURE_EVENTS) this._gestureSource.addEventListener(type, listener, { passive: true });
        this._armed = remove;
        return remove;
    }

    // INSTANCE :: VOID -> VOID
    // Sets the gain to zero; samples keep flowing
    mute(): void {
        this._muted = true;
        this._gain.gain.value = 0;
    }

    // INSTANCE :: VOID -> VOID
    // Restores the gain to one
    unmute(): void {
        this._muted = false;
        this._gain.gain.value = 1;
    }

    // INSTANCE :: VOID -> VOID
    // Unsubscribes from samples, removes gesture listeners, stops scheduled sources and closes the context
    // NOTE: A rejection from close() is ignored; calling destroy twice is a no-op
    destroy(): void {
        if (this._destroyed) return;
        this._destroyed = true;
        this._unsubscribeSound();
        if (this._armed !== null) this._armed();
        for (const source of this._sources) {
            try { source.stop(); } catch { /* already ended */ }
        }
        this._sources.clear();
        this._queue = [];
        this._queued = 0;
        this._context.close().catch(() => undefined);
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: Float32Array -> VOID
    // Copies a push onto the queue, enforces the cap, and schedules when the context is running
    private enqueue(samples: Float32Array): void {
        if (this._destroyed || samples.length === 0) return;
        this._queue.push(samples.slice());
        this._queued += samples.length;
        const cap = Math.floor((DosAudio.MAX_QUEUE_MS / 1000) * this._session.soundFrequency);
        while (this._queued > cap) {
            const excess = this._queued - cap;
            const oldest = this._queue[0];
            if (oldest === undefined) break;
            if (oldest.length <= excess) {
                this._queue.shift();
                this._queued -= oldest.length;
                this._droppedSamples += oldest.length;
            } else {
                this._queue[0] = oldest.subarray(excess);
                this._queued -= excess;
                this._droppedSamples += excess;
            }
        }
        this.flush();
    }

    // PRIVATE :: VOID -> VOID
    // Schedules everything queued as one buffer when at least MIN_CHUNK_MS is queued and the context is running
    private flush(): void {
        if (this._destroyed || this._context.state !== "running") return;
        const rate = this._session.soundFrequency;
        if (this._queued < (DosAudio.MIN_CHUNK_MS / 1000) * rate) return;
        const buffer = this._context.createBuffer(1, this._queued, rate);
        const channel = buffer.getChannelData(0);
        let offset = 0;
        for (const chunk of this._queue) {
            channel.set(chunk, offset);
            offset += chunk.length;
        }
        this._queue = [];
        this._queued = 0;
        const source = this._context.createBufferSource();
        source.buffer = buffer;
        source.connect(this._gain);
        const now = this._context.currentTime;
        const startAt = this._nextStartTime > now ? this._nextStartTime : now + DosAudio.LEAD_SECONDS;
        source.onended = () => { this._sources.delete(source); };
        this._sources.add(source);
        source.start(startAt);
        this._nextStartTime = startAt + buffer.duration;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: {session:emulatorSession, gestureSource:gestureSourceLike, audioContext:audioContextLike?} -> dosAudio
    // Constructs a real AudioContext at the session's sample rate when none is given, then constructs
    static init(config: Omit<DosAudioConfig, "audioContext"> & { audioContext?: AudioContextLike }): DosAudio {
        const audioContext = config.audioContext
            ?? new AudioContext({ sampleRate: config.session.soundFrequency, latencyHint: "interactive" });
        return new DosAudio({ session: config.session, gestureSource: config.gestureSource, audioContext });
    }
}
