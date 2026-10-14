// Type dependencies:
import type {
    EmulatorAdapter,                                               // Contract this double implements
    EmulatorSession,                                               // What a scripted start resolves with
    EmulatorStartConfig,                                           // Recorded argument of start()
} from "../../src/index.ts";

/**
 *
 * Type Declarations
 *
 */

// TYPE :: {mode:"resolve", session:emulatorSession} | {mode:"reject", error:UNKNOWN}
// What the next start() does.
export type FakeAdapterScript =
    | { readonly mode: "resolve"; readonly session: EmulatorSession }
    | { readonly mode: "reject"; readonly error: unknown };

/**
 *
 * Class
 *
 */

// Double of the EmulatorAdapter contract: start() resolves with a scripted session or rejects with a scripted error, and records its configs.
export default class FakeEmulatorAdapter implements EmulatorAdapter {

    /* Instance Fields */
    readonly type = "fake";                                        // Adapter identity
    readonly startCalls: EmulatorStartConfig[] = [];               // Every config start() received, in order
    private _script: FakeAdapterScript | null = null;              // Outcome of the next start(); null rejects with an Error

    // CONSTRUCTOR :: VOID -> this
    // Creates an adapter with no script
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: "resolve", emulatorSession -> this
    // Scripts start() to resolve with the session
    // INSTANCE :: "reject", UNKNOWN -> this
    // Scripts start() to reject with the error
    script(mode: "resolve", session: EmulatorSession): this;
    script(mode: "reject", error: unknown): this;
    script(mode: "resolve" | "reject", value: unknown): this {
        this._script = mode === "resolve"
            ? { mode, session: value as EmulatorSession }
            : { mode, error: value };
        return this;
    }

    // INSTANCE :: emulatorStartConfig -> PROMISE(emulatorSession)
    // Records the config and settles per the script; rejects with a plain Error when unscripted
    start(config: EmulatorStartConfig): Promise<EmulatorSession> {
        this.startCalls.push(config);
        const script = this._script;
        if (script === null) return Promise.reject(new Error("FakeEmulatorAdapter has no script"));
        return script.mode === "resolve" ? Promise.resolve(script.session) : Promise.reject(script.error);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> fakeEmulatorAdapter
    // Mirrors the constructor
    static init(): FakeEmulatorAdapter {
        return new FakeEmulatorAdapter();
    }
}
