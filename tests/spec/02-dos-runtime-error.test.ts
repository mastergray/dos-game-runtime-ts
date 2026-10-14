// realizes: docs/headless-browser-dos-runtime-spec.md > §3 DosRuntimeError (§3.1 declarations, §3.2 codes, §3.3 tests; errors.md review checklist)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import {
    DosRuntimeError,                                             // Class under test, via the public surface
    isNonEmptyString,                                            // Shared check that a thrown message says something
} from "../../src/index.ts";
import {
    errorSnapshot,                                               // Reduces a thrown value to {isRuntimeError, code, label}
    thrownBy,                                                    // Captures a thrown value for comparison
} from "../support/fixtures.ts";

// Type dependencies:
import type { DosRuntimeErrorConfig } from "../../src/index.ts";  // Config shape; invalid inputs are cast to it
import type { ErrorSnapshot } from "../support/fixtures.ts";      // Snapshot shape for equals comparison
import type { TestCase, TestFile } from "../run.ts";              // Manifest contract consumed by the runner

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: errorSnapshot & {data:UNKNOWN}
// A thrown-value snapshot that also carries data.
interface ThrownSnapshot extends ErrorSnapshot {
    data: unknown;                                               // error.data, compared as given
}

/**
 *
 * Constants
 *
 */

const CODE_TABLE = {                                             // The registry as the spec's Class Definition lists it
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

// HELPER :: UNKNOWN -> thrownSnapshot
// Snapshot of a thrown value including its data.
const thrownSnapshot = (value: unknown): ThrownSnapshot => ({
    ...errorSnapshot(value, DosRuntimeError),
    data: DosRuntimeError.is(value) ? value.data : undefined,
});

// HELPER :: UNKNOWN -> dosRuntimeErrorConfig
// Marks a deliberately invalid config as the config type so the constructor can be handed it.
const invalidConfig = (value: unknown): DosRuntimeErrorConfig => value as DosRuntimeErrorConfig;

// HELPER :: STRING, NUMBER -> testCase
// Case: a registered code is accepted and read back.
const acceptsCode = (label: string, code: number): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("construct", () => new DosRuntimeError({ code, message: "m" }))
        .assert("code and label read back", (state) => ({ code: state.subject.code, label: state.subject.label }), P.equals<{ code: number; label: string }>({ code, label: DosRuntimeError.labelOf(code) }))
        .start(undefined),
});

// HELPER :: STRING, NUMBER -> testCase
// Case: an unregistered code throws INVALID_CODE with data the rejected number.
const rejectsCode = (label: string, code: number): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("construct", () => thrownBy(() => new DosRuntimeError({ code, message: "m" })))
        .assert("throws INVALID_CODE with data the code", (state) => thrownSnapshot(state.subject), P.equals<ThrownSnapshot>({ isRuntimeError: true, code: -1, label: "INVALID_CODE", data: code }))
        .start(undefined),
});

// HELPER :: STRING, dosRuntimeErrorConfig, UNKNOWN -> testCase
// Case: a bad message throws INVALID_MESSAGE with data the rejected message (null when absent or undefined).
const rejectsMessage = (label: string, config: DosRuntimeErrorConfig, data: unknown): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .stage("construct", () => thrownBy(() => new DosRuntimeError(config)))
        .assert("throws INVALID_MESSAGE", (state) => thrownSnapshot(state.subject), P.equals<ThrownSnapshot>({ isRuntimeError: true, code: 2, label: "INVALID_MESSAGE", data }))
        .start(undefined),
});

const testFile: TestFile = {
    label: "DosRuntimeError",
    cases: [
        {
            label: "CODE holds exactly the fourteen registry entries",
            run: () => CTGTest.init("CODE registry")
                .assert("registry matches the spec table", () => DosRuntimeError.CODE, P.equals<Record<string, number>>(CODE_TABLE))
                .start(undefined),
        },
        acceptsCode("constructor accepts the first registered code, 1", 1),
        acceptsCode("constructor accepts the last registered code, 13", 13),
        rejectsCode("constructor rejects 0 with INVALID_CODE", 0),
        rejectsCode("constructor rejects 14 with INVALID_CODE", 14),
        rejectsCode("constructor rejects the -1 sentinel with INVALID_CODE", -1),
        {
            label: "constructor rejects NaN with INVALID_CODE and data NaN",
            run: () => CTGTest.init("NaN code")
                .stage("construct", () => thrownBy(() => new DosRuntimeError({ code: NaN, message: "m" })))
                .assert("throws INVALID_CODE with NaN data", (state) => ({
                    ...errorSnapshot(state.subject, DosRuntimeError),
                    dataIsNaN: DosRuntimeError.is(state.subject) && Number.isNaN(state.subject.data),
                }), P.equals<ErrorSnapshot & { dataIsNaN: boolean }>({ isRuntimeError: true, code: -1, label: "INVALID_CODE", dataIsNaN: true }))
                .start(undefined),
        },
        {
            label: "constructor rejects a config that is not an object with INVALID_CODE and data null",
            run: () => CTGTest.init("non-object config")
                .stage("construct", () => thrownBy(() => new DosRuntimeError(invalidConfig(null))))
                .assert("throws INVALID_CODE with null data", (state) => thrownSnapshot(state.subject), P.equals<ThrownSnapshot>({ isRuntimeError: true, code: -1, label: "INVALID_CODE", data: null }))
                .start(undefined),
        },
        {
            label: "constructor rejects a config whose code is not a number with INVALID_CODE and data null",
            run: () => CTGTest.init("string code")
                .stage("construct", () => thrownBy(() => new DosRuntimeError(invalidConfig({ code: "1", message: "m" }))))
                .assert("throws INVALID_CODE with null data", (state) => thrownSnapshot(state.subject), P.equals<ThrownSnapshot>({ isRuntimeError: true, code: -1, label: "INVALID_CODE", data: null }))
                .start(undefined),
        },
        rejectsMessage("constructor rejects message \"\" with INVALID_MESSAGE", { code: 1, message: "" }, ""),
        rejectsMessage("constructor rejects message \"  \" with INVALID_MESSAGE", { code: 1, message: "  " }, "  "),
        rejectsMessage("constructor rejects an absent message with INVALID_MESSAGE and data null", invalidConfig({ code: 1 }), null),
        rejectsMessage("constructor rejects message undefined with INVALID_MESSAGE and data null", invalidConfig({ code: 1, message: undefined }), null),
        {
            label: "a thrown construction error has a message for which isNonEmptyString is true",
            run: () => CTGTest.init("thrown message")
                .stage("construct with a bad code and with a bad message", () => [
                    thrownBy(() => new DosRuntimeError({ code: 0, message: "m" })),
                    thrownBy(() => new DosRuntimeError({ code: 1, message: "" })),
                ])
                .assert("both messages say something", (state) => state.subject.map((thrown) => DosRuntimeError.is(thrown) && isNonEmptyString(thrown.message)), P.equals<boolean[]>([true, true]))
                .start(undefined),
        },
        {
            label: "the prototype of a thrown construction error is exactly DosRuntimeError.prototype, from this class and from a subclass",
            run: () => CTGTest.init("thrown prototype")
                .stage("construct rejected configs on both classes", () => {
                    class SubError extends DosRuntimeError {}
                    return [
                        thrownBy(() => new DosRuntimeError({ code: 0, message: "m" })),
                        thrownBy(() => new SubError({ code: 0, message: "m" })),
                        thrownBy(() => new SubError({ code: 1, message: "" })),
                    ];
                })
                .assert("every prototype is DosRuntimeError.prototype", (state) => state.subject.map((thrown) => Object.getPrototypeOf(thrown) === DosRuntimeError.prototype), P.equals<boolean[]>([true, true, true]))
                .start(undefined),
        },
        {
            label: "data is stored by reference and is null when omitted or undefined",
            run: () => CTGTest.init("data field")
                .stage("construct with each data form", () => {
                    const error = new Error("caught");
                    const symbol = Symbol("s");
                    return {
                        error,
                        symbol,
                        instances: {
                            omitted: new DosRuntimeError({ code: 1, message: "m" }),
                            undefinedData: new DosRuntimeError({ code: 1, message: "m", data: undefined }),
                            nullData: new DosRuntimeError({ code: 1, message: "m", data: null }),
                            zero: new DosRuntimeError({ code: 1, message: "m", data: 0 }),
                            empty: new DosRuntimeError({ code: 1, message: "m", data: "" }),
                            falseData: new DosRuntimeError({ code: 1, message: "m", data: false }),
                            symbolData: new DosRuntimeError({ code: 1, message: "m", data: symbol }),
                            errorData: new DosRuntimeError({ code: 1, message: "m", data: error }),
                        },
                    };
                })
                .assert("each reads back as given, the Error by reference", (state) => {
                    const { instances, error, symbol } = state.subject;
                    return {
                        omitted: instances.omitted.data,
                        undefinedData: instances.undefinedData.data,
                        nullData: instances.nullData.data,
                        zero: instances.zero.data,
                        empty: instances.empty.data,
                        falseData: instances.falseData.data,
                        symbolIsSame: instances.symbolData.data === symbol,
                        errorIsSame: instances.errorData.data === error,
                    };
                }, P.equals<{ omitted: unknown; undefinedData: unknown; nullData: unknown; zero: unknown; empty: unknown; falseData: unknown; symbolIsSame: boolean; errorIsSame: boolean }>({
                    omitted: null, undefinedData: null, nullData: null, zero: 0, empty: "", falseData: false, symbolIsSame: true, errorIsSame: true,
                }))
                .start(undefined),
        },
        {
            label: "code, message and data read back from a valid config",
            run: () => CTGTest.init("valid config")
                .stage("construct", () => new DosRuntimeError({ code: DosRuntimeError.CODE.NOT_STARTED, message: "not started", data: 42 }))
                .assert("fields match", (state) => ({ code: state.subject.code, message: state.subject.message, data: state.subject.data, label: state.subject.label }), P.equals<{ code: number; message: string; data: unknown; label: string }>({ code: 6, message: "not started", data: 42, label: "NOT_STARTED" }))
                .start(undefined),
        },
        {
            label: "is accepts an instance, a subclass instance and a thrown construction error, and rejects a plain Error",
            run: () => CTGTest.init("is")
                .stage("build inputs", () => {
                    class SubError extends DosRuntimeError {}
                    return [
                        new DosRuntimeError({ code: 1, message: "m" }),
                        new SubError({ code: 1, message: "m" }),
                        thrownBy(() => new DosRuntimeError({ code: 0, message: "m" })),
                        new Error("plain"),
                    ];
                })
                .assert("first three true, last false", (state) => state.subject.map((value) => DosRuntimeError.is(value)), P.equals<boolean[]>([true, true, true, false]))
                .start(undefined),
        },
        {
            label: "labelOf round-trips every registry entry",
            run: () => CTGTest.init("labelOf round trip")
                .assert("each value maps back to its label", () => Object.fromEntries(Object.entries(CODE_TABLE).filter(([label]) => label !== "INVALID_CODE").map(([label, code]) => [label, DosRuntimeError.labelOf(code)])), P.equals<Record<string, string>>(
                    Object.fromEntries(Object.keys(CODE_TABLE).filter((label) => label !== "INVALID_CODE").map((label) => [label, label]))))
                .start(undefined),
        },
        {
            label: "labelOf returns \"INVALID_CODE\" for -1, 0, 14 and NaN",
            run: () => CTGTest.init("labelOf unregistered")
                .assert("every unregistered number labels INVALID_CODE", () => [-1, 0, 14, NaN].map((code) => DosRuntimeError.labelOf(code)), P.equals<string[]>(["INVALID_CODE", "INVALID_CODE", "INVALID_CODE", "INVALID_CODE"]))
                .start(undefined),
        },
        {
            label: "label getter derives the label from code",
            run: () => CTGTest.init("label getter")
                .stage("construct", () => new DosRuntimeError({ code: 1, message: "m" }))
                .assert("label is INVALID_CONFIG", (state) => state.subject.label, P.equals<string>("INVALID_CONFIG"))
                .start(undefined),
        },
        {
            label: "init returns an instance constructed as by the constructor",
            run: () => CTGTest.init("init")
                .stage("init", () => DosRuntimeError.init({ code: 3, message: "boom", data: "d" }))
                .assert("instance with the given fields", (state) => ({ isRuntimeError: DosRuntimeError.is(state.subject), code: state.subject.code, message: state.subject.message, data: state.subject.data }), P.equals<{ isRuntimeError: boolean; code: number; message: string; data: unknown }>({ isRuntimeError: true, code: 3, message: "boom", data: "d" }))
                .start(undefined),
        },
        {
            label: "init throws the same error the constructor would for a rejected config",
            run: () => CTGTest.init("init rejects")
                .stage("init with a bad code", () => thrownBy(() => DosRuntimeError.init({ code: 0, message: "m" })))
                .assert("throws INVALID_CODE", (state) => thrownSnapshot(state.subject), P.equals<ThrownSnapshot>({ isRuntimeError: true, code: -1, label: "INVALID_CODE", data: 0 }))
                .start(undefined),
        },
        {
            label: "init on a subclass returns an instance of that subclass",
            run: () => CTGTest.init("init receiving class")
                .stage("init on a test-local subclass", () => {
                    class SubError extends DosRuntimeError {}
                    return { SubError, instance: SubError.init({ code: 1, message: "m" }) };
                })
                .assert("instance of the subclass", (state) => state.subject.instance instanceof state.subject.SubError, P.equals<boolean>(true))
                .start(undefined),
        },
    ],
};

export default testFile;
