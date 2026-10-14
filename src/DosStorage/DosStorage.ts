// Dependencies:
import DosRuntimeError from "../DosRuntimeError/DosRuntimeError.js";   // Typed errors for config rejection, STORAGE_FAILED and UNSUPPORTED

// Type dependencies:
import type { NonEmptyString } from "../shared.types.js";        // Key type
import {
    isDosStorageConfig,                                            // Guards the construction config
    type DosStorageConfig,                                         // Construction config shape
    type IDBFactoryLike,                                           // Injectable indexedDB subset
} from "./types.js";

/**
 *
 * Class
 *
 */

// Persists one game's saves overlay (the bytes DosPlayer.persist() returns) in IndexedDB under a deployment-chosen key
export default class DosStorage {

    /* Static Fields */
    static readonly DB_NAME: NonEmptyString = "dos-game-runtime";  // One database for every deployment on an origin
    static readonly STORE_NAME: NonEmptyString = "bundles";        // One object store, keyed by DosStorageConfig.key
    static readonly DB_VERSION = 1;                                // Schema version; bumped only if the store shape changes

    /* Instance Fields */
    private readonly _key: NonEmptyString;                         // Key the overlay is stored under
    private readonly _indexedDB: IDBFactoryLike;                   // Factory the database is opened through

    // CONSTRUCTOR :: DosStorageConfig -> this
    // Creates a storage for one key; nothing is opened until the first operation
    // NOTE: Throws DosRuntimeError INVALID_CONFIG when config fails isDosStorageConfig()
    constructor(config: DosStorageConfig) {
        if (!isDosStorageConfig(config)) {
            throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "DosStorage config must have a non-empty key and an indexedDB with open().", data: config });
        }
        this._key = config.key;
        this._indexedDB = config.indexedDB;
    }

    /**
     *
     * Properties
     *
     */

    // GETTER :: VOID -> nonEmptyString
    // The key the overlay is stored under
    get key(): NonEmptyString {
        return this._key;
    }

    /**
     *
     * Instance Methods
     *
     */

    // INSTANCE :: Uint8Array -> PROMISE(VOID)
    // Stores the overlay, replacing any previous one under the key
    // NOTE: Throws DosRuntimeError INVALID_CONFIG for a non-Uint8Array; rejects with STORAGE_FAILED when IndexedDB fails
    async save(bytes: Uint8Array): Promise<void> {
        if (!(bytes instanceof Uint8Array)) throw new DosRuntimeError({ code: DosRuntimeError.CODE.INVALID_CONFIG, message: "save requires a Uint8Array.", data: bytes });
        await this.withStore("readwrite", (store) => store.put(bytes, this._key));
    }

    // INSTANCE :: VOID -> PROMISE(Uint8Array?)
    // Resolves with the stored overlay, or null when nothing is stored under the key
    // NOTE: Rejects with STORAGE_FAILED when IndexedDB fails
    async load(): Promise<Uint8Array | null> {
        const result = await this.withStore("readonly", (store) => store.get(this._key));
        return result instanceof Uint8Array ? result : null;
    }

    // INSTANCE :: VOID -> PROMISE(VOID)
    // Removes the stored overlay; a no-op when nothing is stored
    // NOTE: Rejects with STORAGE_FAILED when IndexedDB fails
    async clear(): Promise<void> {
        await this.withStore("readwrite", (store) => store.delete(this._key));
    }

    /**
     *
     * Private Methods
     *
     */

    // PRIVATE :: VOID -> PROMISE(IDBDatabase)
    // Opens the database, creating the object store on first use
    private open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            let request: IDBOpenDBRequest;
            try {
                request = this._indexedDB.open(DosStorage.DB_NAME, DosStorage.DB_VERSION);
            } catch (error) {
                reject(DosStorage.failed("IndexedDB open threw.", error));
                return;
            }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(DosStorage.STORE_NAME)) db.createObjectStore(DosStorage.STORE_NAME);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(DosStorage.failed("IndexedDB open failed.", request.error));
            request.onblocked = () => reject(DosStorage.failed("IndexedDB open was blocked by another connection.", null));
        });
    }

    // PRIVATE :: STRING, (IDBObjectStore -> IDBRequest) -> PROMISE(UNKNOWN)
    // Runs one request against the object store in a transaction of the given mode and resolves with its result
    private async withStore(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
        const db = await this.open();
        try {
            return await new Promise<unknown>((resolve, reject) => {
                let request: IDBRequest;
                try {
                    request = operation(db.transaction(DosStorage.STORE_NAME, mode).objectStore(DosStorage.STORE_NAME));
                } catch (error) {
                    reject(DosStorage.failed("IndexedDB request threw.", error));
                    return;
                }
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(DosStorage.failed("IndexedDB request failed.", request.error));
            });
        } finally {
            db.close();
        }
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: {key:nonEmptyString, indexedDB:idbFactoryLike?} -> dosStorage
    // Mirrors the constructor, defaulting indexedDB to the global one
    // NOTE: Throws DosRuntimeError UNSUPPORTED when no indexedDB is given and the browser has none
    static init(config: Omit<DosStorageConfig, "indexedDB"> & { indexedDB?: IDBFactoryLike }): DosStorage {
        const factory = config.indexedDB ?? (globalThis as { indexedDB?: IDBFactoryLike }).indexedDB;
        if (factory === undefined) throw new DosRuntimeError({ code: DosRuntimeError.CODE.UNSUPPORTED, message: "This environment has no IndexedDB." });
        return new DosStorage({ key: config.key, indexedDB: factory });
    }

    // STATIC :: STRING, UNKNOWN -> dosRuntimeError
    // Builds the STORAGE_FAILED error for a caught IndexedDB failure
    static failed(message: string, data: unknown): DosRuntimeError {
        return new DosRuntimeError({ code: DosRuntimeError.CODE.STORAGE_FAILED, message, data: data ?? null });
    }
}
