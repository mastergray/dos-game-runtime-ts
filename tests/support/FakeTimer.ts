// Type dependencies:
import type { TimerLike } from "../../src/index.ts";              // Contract this double implements

/**
 *
 * Class
 *
 */

// Double of the TimerLike contract: callbacks fire only when advance() moves a virtual clock past their due time
export default class FakeTimer implements TimerLike {

    /* Instance Fields */
    private _now = 0;                                                            // Virtual clock in ms
    private _nextHandle = 1;                                                     // Next handle to hand out
    private readonly _pending = new Map<number, { due: number; callback: () => void }>();   // Scheduled callbacks by handle

    // CONSTRUCTOR :: VOID -> this
    // Creates a timer at time 0 with nothing scheduled
    constructor() {}

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> NUMBER
    // Current virtual time in ms
    get now(): number {
        return this._now;
    }

    // GETTER :: VOID -> NUMBER
    // Number of callbacks still scheduled
    get pending(): number {
        return this._pending.size;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: (VOID -> VOID), NUMBER -> NUMBER
    // Schedules callback at now + ms and returns its handle
    setTimeout(callback: () => void, ms: number): number {
        const handle = this._nextHandle++;
        this._pending.set(handle, { due: this._now + ms, callback });
        return handle;
    }

    // INSTANCE :: NUMBER -> VOID
    // Cancels a scheduled callback; unknown handles are ignored
    clearTimeout(handle: number): void {
        this._pending.delete(handle);
    }

    // INSTANCE :: NUMBER -> VOID
    // Moves the clock forward by ms, firing due callbacks in due order
    advance(ms: number): void {
        this._now += ms;
        for (;;) {
            const next = [...this._pending.entries()].filter(([, entry]) => entry.due <= this._now).sort((a, b) => a[1].due - b[1].due)[0];
            if (next === undefined) return;
            this._pending.delete(next[0]);
            next[1].callback();
        }
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> fakeTimer
    // Mirrors the constructor
    static init(): FakeTimer {
        return new FakeTimer();
    }
}
