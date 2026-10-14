// Type dependencies:
import type { NonEmptyString } from "../shared.types.js";        // Type of a message that says something
import {
    isDosRuntimeErrorConfig,                                       // Guards the construction config
    type DosRuntimeErrorConfig,                                    // Construction config shape
} from "./types.js";

/**
 *
 * Class
 *
 */

// Base typed error for the runtime; every error the package raises is one of these
export default class DosRuntimeError extends Error {

    /* Static Fields */
    static readonly CODE = {                                       // Label-to-code registry; call sites use these, never raw values
        INVALID_CODE: -1,
        INVALID_CONFIG: 1,
        INVALID_MESSAGE: 2,
        INTERNAL_ERROR: 3,
        ADAPTER_FAILED: 4,
        BUNDLE_LOAD_FAILED: 5,
        NOT_STARTED: 6,
        ALREADY_STARTED: 7,
        DESTROYED: 8,
        UNSUPPORTED_KEY: 9,
        FULLSCREEN_FAILED: 10,
        AUDIO_FAILED: 11,
        STORAGE_FAILED: 12,
        UNSUPPORTED: 13,
    } as const;

    /* Instance Fields */
    readonly code: number;                                         // Stable code drawn from CODE
    readonly data: unknown;                                        // Payload of any kind; null when omitted
    declare readonly message: NonEmptyString;                      // Inherited from Error, narrowed: always says something

    // CONSTRUCTOR :: DosRuntimeErrorConfig -> this
    // Creates an error from a config with a registry code, a non-empty message and optional data
    // NOTE: Throws DosRuntimeError with code -1 (INVALID_CODE) when config is not an object with a numeric code, or the code is not constructible
    // NOTE: Throws DosRuntimeError with code INVALID_MESSAGE when the message is not a non-empty string
    // NOTE: A thrown error is always a plain DosRuntimeError, never an instance of the subclass being constructed
    constructor(config: DosRuntimeErrorConfig) {
        super(isDosRuntimeErrorConfig(config) ? config.message : "");
        // The -1 instance cannot come from this constructor, which would reject it again; it is assembled
        // directly on DosRuntimeError.prototype, so it is a plain DosRuntimeError whatever class was being constructed.
        const invalidCode = (data: unknown): DosRuntimeError => Object.assign(Object.create(DosRuntimeError.prototype) as DosRuntimeError, {
            name: "DosRuntimeError",
            message: "Error code is not a constructible registry code.",
            code: DosRuntimeError.CODE.INVALID_CODE,
            data,
        });
        const given = config as unknown;
        const code = typeof given === "object" && given !== null ? (given as { code?: unknown }).code : undefined;
        if (typeof code !== "number") throw invalidCode(null);
        if (!isDosRuntimeErrorConfig(config)) {
            const message = (given as { message?: unknown }).message;
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_MESSAGE, message: "Error message must be a non-empty string.", data: message });
        }
        if (code === DosRuntimeError.CODE.INVALID_CODE || !(Object.values(DosRuntimeError.CODE) as number[]).includes(code)) throw invalidCode(code);
        this.name = "DosRuntimeError";
        this.code = code;
        this.data = config.data ?? null;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> STRING
    // Readable label for code, derived from CODE
    get label(): string {
        return DosRuntimeError.labelOf(this.code);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: DosRuntimeErrorConfig -> dosRuntimeError
    // Mirrors the constructor
    // NOTE: Constructs with the receiving class, so a subclass that inherits init returns its own instances
    static init<T extends DosRuntimeError, C>(this: new (config: C) => T, config: C): T {
        return new this(config);
    }

    // STATIC :: UNKNOWN -> BOOLEAN
    // Narrows an unknown thrown value to DosRuntimeError
    static is(value: unknown): value is DosRuntimeError {
        return value instanceof DosRuntimeError;
    }

    // STATIC :: NUMBER -> STRING
    // Returns the CODE label for a code; "INVALID_CODE" for -1 and for any unregistered number
    static labelOf(code: number): string {
        const entry = Object.entries(DosRuntimeError.CODE).find(([, value]) => value === code);
        return entry === undefined || code === DosRuntimeError.CODE.INVALID_CODE ? "INVALID_CODE" : entry[0];
    }

}
