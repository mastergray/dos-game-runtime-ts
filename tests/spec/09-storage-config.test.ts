// realizes: docs/headless-browser-dos-runtime-spec.md > §18 DosStorage (§18.1 predicates and construction, §18.3 spec/09-storage-config tests); §3.2 INVALID_CONFIG

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    DosRuntimeError,                                             // Error class the constructor throws
    DosStorage,                                                  // Class under test, via the public surface
    isDosStorageConfig,                                          // Predicate under test
    isIDBFactoryLike,                                            // Predicate under test
} from "../../src/index.ts";
import { errorSnapshot, thrownBy } from "../support/fixtures.ts";   // Captures and reduces a thrown value

// Type dependencies:
import type { DosStorageConfig, IDBFactoryLike } from "../../src/index.ts";   // Accepted config and factory shapes
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of the error comparison
import type { TestCase, TestFile } from "../run.ts";                           // Manifest contract consumed by the runner

/**
 *
 * Constants
 *
 */

// A plain object with an open function stands in for indexedDB; it is never called here, so its return is cast.
const FACTORY = { open() {} } as unknown as IDBFactoryLike;

const CONFIG: DosStorageConfig = { key: "kings-bounty", indexedDB: FACTORY };   // Every condition met

const INVALID_CONFIG: ErrorSnapshot = { isRuntimeError: true, code: 1, label: "INVALID_CONFIG" };   // Expected rejection of a bad config

/**
 *
 * Functions
 *
 */

// HELPER :: STRING, (UNKNOWN -> BOOLEAN), UNKNOWN, BOOLEAN -> testCase
// Case: predicate applied to value returns expected.
const verdict = (label: string, predicate: (value: unknown) => boolean, value: unknown, expected: boolean): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert(expected ? "accepted" : "rejected", () => predicate(value), P.equals<boolean>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "DosStorage config",
    cases: [

        // isIDBFactoryLike
        verdict("isIDBFactoryLike accepts an object with an open function", isIDBFactoryLike, FACTORY, true),
        verdict("isIDBFactoryLike rejects a value that is not an object", isIDBFactoryLike, null, false),
        verdict("isIDBFactoryLike rejects an object whose open is not a function", isIDBFactoryLike, { open: "indexedDB" }, false),

        // isDosStorageConfig
        verdict("isDosStorageConfig accepts a non-empty key and an IDBFactoryLike indexedDB", isDosStorageConfig, CONFIG, true),
        verdict("isDosStorageConfig rejects a value that is not an object", isDosStorageConfig, null, false),
        verdict("isDosStorageConfig rejects a key that is not a NonEmptyString", isDosStorageConfig, { ...CONFIG, key: "" }, false),
        verdict("isDosStorageConfig rejects an indexedDB that is not IDBFactoryLike", isDosStorageConfig, { ...CONFIG, indexedDB: {} }, false),

        // Construction
        {
            label: "DosStorage.init with an explicit indexedDB returns an instance whose key reads back",
            run: () => CTGTest.init("init with explicit indexedDB")
                .stage("init with key and the plain factory", () => DosStorage.init({ key: "kings-bounty", indexedDB: FACTORY }))
                .assert("a DosStorage whose key is the configured one", (state) => ({
                    isStorage: state.subject instanceof DosStorage,
                    key: state.subject.key,
                }), P.equals<{ isStorage: boolean; key: string }>({ isStorage: true, key: "kings-bounty" }))
                .start(undefined),
        },
        {
            label: "the constructor rejects a config that fails isDosStorageConfig with INVALID_CONFIG",
            run: () => CTGTest.init("constructor with empty key")
                .stage("construct with key \"\"", () => thrownBy(() => new DosStorage({ key: "", indexedDB: FACTORY })))
                .assert("throws INVALID_CONFIG", (state) => errorSnapshot(state.subject, DosRuntimeError), P.equals<ErrorSnapshot>(INVALID_CONFIG))
                .start(undefined),
        },
    ],
};

export default testFile;
