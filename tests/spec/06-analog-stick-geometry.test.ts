// realizes: docs/headless-browser-dos-runtime-spec.md > §14 AnalogStick (valueFor, spec/06-analog-stick-geometry tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import { AnalogStick } from "../../src/index.ts";                // Class under test, via the public surface

// Type dependencies:
import type { Vector2 } from "../../src/index.ts";               // Offset argument and return shape of valueFor
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner

/**
 *
 * Constants
 *
 */

const RADIUS = 100;                                              // Stick radius; the rim is at length 100
const DEAD_ZONE = 0.1;                                           // Radial dead zone as a fraction of RADIUS; the edge is at length 10
const ORIGIN: Vector2 = { x: 0, y: 0 };                          // The value inside the dead zone

// HELPER :: NUMBER -> NUMBER
// Rounds to 6 decimals so an irrational magnitude compares exactly.
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// HELPER :: STRING, vector2, vector2 -> testCase
// Case: valueFor at offset with RADIUS and DEAD_ZONE returns exactly expected.
const valueCase = (label: string, offset: Vector2, expected: Vector2): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("value matches", () => AnalogStick.valueFor(offset, RADIUS, DEAD_ZONE), P.equals<Vector2>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "AnalogStick geometry",
    cases: [
        valueCase("the center is { x: 0, y: 0 }", { x: 0, y: 0 }, ORIGIN),
        valueCase("just inside the dead zone edge (9.9 along +x) is { x: 0, y: 0 }", { x: 9.9, y: 0 }, ORIGIN),
        {
            label: "just outside the dead zone edge (10.1 along +x) leaves zero smoothly: a small positive x, y zero",
            run: () => CTGTest.init("just outside the dead zone")
                .assert("0 < x < 0.05 and y is 0", () => AnalogStick.valueFor({ x: 10.1, y: 0 }, RADIUS, DEAD_ZONE),
                    P.satisfies<Vector2>((v) => v.x > 0 && v.x < 0.05 && v.y === 0))
                .start(undefined),
        },
        valueCase("at the rim (100 along +x) is { x: 1, y: 0 }", { x: 100, y: 0 }, { x: 1, y: 0 }),
        valueCase("beyond the rim (200 along +x) is clamped to { x: 1, y: 0 }", { x: 200, y: 0 }, { x: 1, y: 0 }),
        {
            label: "a diagonal beyond the rim is clamped to the unit circle along the offset direction",
            run: () => CTGTest.init("diagonal beyond the rim")
                .stage("valueFor at (200, 200)", () => AnalogStick.valueFor({ x: 200, y: 200 }, RADIUS, DEAD_ZONE))
                .assert("magnitude 1, both axes 1/sqrt(2), to 6 decimals", (state) => ({
                    magnitude: round6(Math.hypot(state.subject.x, state.subject.y)),
                    x: round6(state.subject.x),
                    y: round6(state.subject.y),
                }), P.equals<{ magnitude: number; x: number; y: number }>({ magnitude: 1, x: 0.707107, y: 0.707107 }))
                .start(undefined),
        },
    ],
};

export default testFile;
