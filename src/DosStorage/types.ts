// Type dependencies:
import { isNonEmptyString, type NonEmptyString } from "../shared.types.js";   // Key type and its guard

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {open:(STRING, NUMBER? -> IDBOpenDBRequest)}
// The one member of IDBFactory the storage uses; the real indexedDB satisfies it, and a test double can stand in.
export interface IDBFactoryLike {
    open(name: string, version?: number): IDBOpenDBRequest;       // Opens (creating or upgrading) a database
}

// INTERFACE :: {key:nonEmptyString, indexedDB:idbFactoryLike}
// Construction config: the per-game key the overlay is stored under, and the IndexedDB factory to store it with.
export interface DosStorageConfig {
    readonly key: NonEmptyString;                                  // Identifies one game's saves; chosen by the deployment
    readonly indexedDB: IDBFactoryLike;                            // The real indexedDB in production; injected for tests
}

/**
 *
 * Type Predicates
 *
 */

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has an open function
export function isIDBFactoryLike(value: unknown): value is IDBFactoryLike {
    return typeof value === "object" && value !== null && typeof (value as IDBFactoryLike).open === "function";
}

// PREDICATE :: UNKNOWN -> BOOLEAN
// True when value has a non-empty string key and an IDBFactoryLike indexedDB
export function isDosStorageConfig(value: unknown): value is DosStorageConfig {
    return typeof value === "object" && value !== null
        && isNonEmptyString((value as DosStorageConfig).key)
        && isIDBFactoryLike((value as DosStorageConfig).indexedDB);
}
