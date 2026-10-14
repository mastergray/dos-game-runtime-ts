// realizes: docs/headless-browser-dos-runtime-spec.md > §18 DosStorage (§18.1, §18.2, §18.3 browser); §3.2 STORAGE_FAILED, UNSUPPORTED

// Dependencies:
import { randomUUID } from "node:crypto";                                      // Fresh storage key per case
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner
import type { ErrorSnapshot } from "../support/fixtures.ts";                   // Shape of in-page error snapshots
import type { IDBFactoryLike } from "../../src/index.ts";                      // Optional indexedDB field of the init config
import type { FailingOperation } from "../support/FailingIndexedDB.ts";        // Operation the double is scripted to fail

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {key:STRING, operation:failingOperation, call:"load"|"save"}
// One failure case: the operation FailingIndexedDB fails and the storage call that observes it.
interface FailureArgs {
    key: string;                                                   // Storage key
    operation: FailingOperation;                                   // Passed to failOn
    call: "load" | "save";                                         // Storage method that should reject
}

/**
 *
 * Constants
 *
 */

const TIMEOUT = 30000;                                             // Per-case timeout
const STORAGE_FAILED: ErrorSnapshot = { isRuntimeError: true, code: 12, label: "STORAGE_FAILED" };   // Expected IndexedDB failure
const UNSUPPORTED: ErrorSnapshot = { isRuntimeError: true, code: 13, label: "UNSUPPORTED" };         // Expected missing IndexedDB

/**
 *
 * Functions
 *
 */

// HELPER :: VOID -> STRING
// A fresh key, so no case can read another's bytes.
const freshKey = (): string => `test-${randomUUID()}`;

// HELPER :: STRING -> PROMISE([NUMBER]?)
// In-page: loads from a storage on the real indexedDB under key, as plain JSON.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const loadIn = async (key: string): Promise<number[] | null> => {
    const bytes = await window.harness.runtime.DosStorage.init({ key }).load();
    return bytes === null ? null : Array.from(bytes);
};

// HELPER :: {key:STRING, bytes:[NUMBER]} -> PROMISE(VOID)
// In-page: saves bytes to a storage on the real indexedDB under key.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const saveIn = async (args: { key: string; bytes: number[] }): Promise<void> => {
    await window.harness.runtime.DosStorage.init({ key: args.key }).save(new Uint8Array(args.bytes));
};

// HELPER :: failureArgs -> PROMISE(errorSnapshot)
// In-page: runs one storage call over a FailingIndexedDB scripted to fail operation and snapshots the rejection.
// NOTE: Serialized by Playwright and run in the page; it can reference only page globals.
const failureIn = async (args: FailureArgs): Promise<ErrorSnapshot> => {
    const { DosRuntimeError, DosStorage } = window.harness.runtime;
    const { FailingIndexedDB } = window.harness.doubles;
    const storage = DosStorage.init({ key: args.key, indexedDB: new FailingIndexedDB().failOn(args.operation) });
    try {
        if (args.call === "load") await storage.load();
        else await storage.save(new Uint8Array([1, 2, 3]));
        return { isRuntimeError: false, code: null, label: null };
    } catch (e) {
        return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
    }
};

const testFile: TestFile = {
    label: "DosStorage",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "save then load round-trips a 3-byte array",
            run: () => withHarness((url) => CTGBrowserTest.init("round trip")
                .assertPage("load returns the saved bytes",
                    (page) => page.evaluate(async (key) => {
                        const storage = window.harness.runtime.DosStorage.init({ key });
                        await storage.save(new Uint8Array([1, 2, 3]));
                        const bytes = await storage.load();
                        return bytes === null ? null : Array.from(bytes);
                    }, freshKey()),
                    P.equals<number[] | null>([1, 2, 3]))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "load returns null when nothing is stored",
            run: () => withHarness((url) => CTGBrowserTest.init("load empty")
                .assertPage("load on a fresh key is null",
                    (page) => page.evaluate(loadIn, freshKey()),
                    P.equals<number[] | null>(null))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "clear deletes the key: load after clear returns null",
            run: () => withHarness((url) => CTGBrowserTest.init("clear then load")
                .assertPage("save, clear, load is null",
                    (page) => page.evaluate(async (key) => {
                        const storage = window.harness.runtime.DosStorage.init({ key });
                        await storage.save(new Uint8Array([1, 2, 3]));
                        await storage.clear();
                        const bytes = await storage.load();
                        return bytes === null ? null : Array.from(bytes);
                    }, freshKey()),
                    P.equals<number[] | null>(null))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "bytes saved before page.reload() are loaded by a new instance with the same key after it",
            run: () => {
                const key = freshKey();
                return withHarness((url) => CTGBrowserTest.init("persists across reload")
                    .interact("save [1, 2, 3] under the key", async ({ page }) => {
                        await page.evaluate(saveIn, { key, bytes: [1, 2, 3] });
                    })
                    .interact("reload the page", async ({ page }) => {
                        await page.reload();
                    })
                    .assertPage("a storage created after the reload loads [1, 2, 3]",
                        (page) => page.evaluate(loadIn, key),
                        P.equals<number[] | null>([1, 2, 3]))
                    .start(url, { timeout: TIMEOUT }));
            }
        },
        {
            label: "two instances with different keys do not see each other's bytes",
            run: () => withHarness((url) => CTGBrowserTest.init("keys are separate")
                .assertPage("each key loads its own bytes",
                    (page) => page.evaluate(async (keys) => {
                        const { DosStorage } = window.harness.runtime;
                        const a = DosStorage.init({ key: keys.a });
                        const b = DosStorage.init({ key: keys.b });
                        await a.save(new Uint8Array([1, 2, 3]));
                        await b.save(new Uint8Array([4, 5]));
                        const fromA = await a.load();
                        const fromB = await b.load();
                        return { a: fromA === null ? null : Array.from(fromA), b: fromB === null ? null : Array.from(fromB) };
                    }, { a: freshKey(), b: freshKey() }),
                    P.equals<{ a: number[] | null; b: number[] | null }>({ a: [1, 2, 3], b: [4, 5] }))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "an IndexedDB open failure makes load reject with STORAGE_FAILED",
            run: () => withHarness((url) => CTGBrowserTest.init("open fails")
                .assertPage("load rejects with STORAGE_FAILED",
                    (page) => page.evaluate(failureIn, { key: freshKey(), operation: "open", call: "load" } as FailureArgs),
                    P.equals<ErrorSnapshot>(STORAGE_FAILED))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "an IndexedDB put failure makes save reject with STORAGE_FAILED",
            run: () => withHarness((url) => CTGBrowserTest.init("put fails")
                .assertPage("save rejects with STORAGE_FAILED",
                    (page) => page.evaluate(failureIn, { key: freshKey(), operation: "put", call: "save" } as FailureArgs),
                    P.equals<ErrorSnapshot>(STORAGE_FAILED))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "an IndexedDB get failure makes load reject with STORAGE_FAILED",
            run: () => withHarness((url) => CTGBrowserTest.init("get fails")
                .assertPage("load rejects with STORAGE_FAILED",
                    (page) => page.evaluate(failureIn, { key: freshKey(), operation: "get", call: "load" } as FailureArgs),
                    P.equals<ErrorSnapshot>(STORAGE_FAILED))
                .start(url, { timeout: TIMEOUT }))
        },
        {
            label: "init without indexedDB when globalThis.indexedDB is absent throws UNSUPPORTED",
            run: () => withHarness((url) => CTGBrowserTest.init("no indexedDB")
                .assertPage("init with indexedDB deleted from the config throws UNSUPPORTED",
                    (page) => page.evaluate((key): ErrorSnapshot => {
                        const { DosRuntimeError, DosStorage } = window.harness.runtime;
                        const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
                        const config: { key: string; indexedDB?: IDBFactoryLike } = { key, indexedDB: globalThis.indexedDB };
                        delete config.indexedDB;
                        Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
                        try {
                            DosStorage.init(config);
                            return { isRuntimeError: false, code: null, label: null };
                        } catch (e) {
                            return DosRuntimeError.is(e) ? { isRuntimeError: true, code: e.code, label: e.label } : { isRuntimeError: false, code: null, label: null };
                        } finally {
                            if (original === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
                            else Object.defineProperty(globalThis, "indexedDB", original);
                        }
                    }, freshKey()),
                    P.equals<ErrorSnapshot>(UNSUPPORTED))
                .start(url, { timeout: TIMEOUT }))
        },
    ],
};

export default testFile;
