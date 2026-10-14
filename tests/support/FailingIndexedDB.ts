// Type dependencies:
import type { IDBFactoryLike } from "../../src/index.ts";        // Contract this double implements

/**
 *
 * Type Declarations
 *
 */

// TYPE :: "open" | "put" | "get" | "delete"
// The operation this double is scripted to fail.
export type FailingOperation = "open" | "put" | "get" | "delete";

/**
 *
 * Class
 *
 */

// Double of the IDBFactoryLike contract: an in-memory IndexedDB just complete enough for DosStorage, scripted to fail one operation
// NOTE: Requests settle on a microtask, as real IndexedDB requests settle asynchronously, so handlers set after the call still run
export default class FailingIndexedDB implements IDBFactoryLike {

    /* Instance Fields */
    readonly records = new Map<string, unknown>();                  // The object store's contents
    private _failing: FailingOperation | null = null;              // Operation scripted to fail, or null

    // CONSTRUCTOR :: VOID -> this
    // Creates an empty in-memory database that fails nothing
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: failingOperation? -> this
    // Scripts one operation to fail; null clears the script
    failOn(operation: FailingOperation | null): this {
        this._failing = operation;
        return this;
    }

    // INSTANCE :: STRING, NUMBER? -> IDBOpenDBRequest
    // Returns an open request that fires onupgradeneeded then onsuccess with a fake database, or onerror when scripted
    open(_name: string, _version?: number): IDBOpenDBRequest {
        const request = this.request(this._failing === "open" ? null : () => this.database());
        return request as unknown as IDBOpenDBRequest;
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> OBJECT
    // The fake database: one object store whose requests read and write this.records
    private database(): unknown {
        const store = {
            put: (value: unknown, key: string) => this.request(this._failing === "put" ? null : () => { this.records.set(key, value); return key; }),
            get: (key: string) => this.request(this._failing === "get" ? null : () => this.records.get(key)),
            delete: (key: string) => this.request(this._failing === "delete" ? null : () => { this.records.delete(key); return undefined; }),
        };
        return {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => store,
            transaction: () => ({ objectStore: () => store }),
            close: () => undefined,
        };
    }

    // PRIVATE :: (VOID -> UNKNOWN)? -> OBJECT
    // A request that, on a microtask, fires onsuccess with the producer's result, or onerror when the producer is null
    private request(produce: (() => unknown) | null): { result: unknown; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: (() => void) | null; onblocked: (() => void) | null } {
        const request = { result: undefined as unknown, error: null as unknown, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, onupgradeneeded: null as (() => void) | null, onblocked: null as (() => void) | null };
        queueMicrotask(() => {
            if (produce === null) {
                request.error = new Error("FailingIndexedDB: scripted failure");
                request.onerror?.();
                return;
            }
            request.result = produce();
            request.onupgradeneeded?.();
            request.onsuccess?.();
        });
        return request;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> failingIndexedDB
    // Mirrors the constructor
    static init(): FailingIndexedDB {
        return new FailingIndexedDB();
    }
}
