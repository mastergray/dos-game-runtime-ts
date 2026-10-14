// realizes: docs/headless-browser-dos-runtime-spec.md > §6 DosDisplay (§6.2 layoutFor, §6.3 tests, spec suite part)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import { DosDisplay } from "../../src/index.ts";                 // Class under test, via the public surface

// Type dependencies:
import type {
    DisplayLayout,                                               // Return shape of layoutFor
    ScalingMode,                                                 // Mode argument of layoutFor
    Vector2,                                                     // Container and frame arguments of layoutFor
} from "../../src/index.ts";
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner

/**
 *
 * Constants
 *
 */

const ASPECT = 2;                                                // Aspect ratio chosen so every expected value is exact in binary
const FRAME: Vector2 = { x: 320, y: 160 };                       // A native frame at that ratio
const NO_FRAME: Vector2 = { x: 0, y: 0 };                        // No frame received yet

// HELPER :: STRING, vector2, vector2, NUMBER, scalingMode, displayLayout -> testCase
// Case: layoutFor with the given inputs returns expected.
const layoutCase = (label: string, container: Vector2, frame: Vector2, aspectRatio: number, scaling: ScalingMode, expected: DisplayLayout): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("layout matches", () => DosDisplay.layoutFor(container, frame, aspectRatio, scaling), P.equals<DisplayLayout>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "DosDisplay layout",
    cases: [
        layoutCase("fit in a container wider than the aspect ratio is limited by height",
            { x: 1000, y: 300 }, FRAME, ASPECT, "fit", { width: 600, height: 300, scale: 1.875 }),
        layoutCase("fit in a container taller than the aspect ratio is limited by width",
            { x: 600, y: 400 }, FRAME, ASPECT, "fit", { width: 600, height: 300, scale: 1.875 }),
        layoutCase("fit in a container of exactly the aspect ratio fills it",
            { x: 600, y: 300 }, FRAME, ASPECT, "fit", { width: 600, height: 300, scale: 1.875 }),
        layoutCase("integer at exactly 2x uses scale 2",
            { x: 640, y: 320 }, FRAME, ASPECT, "integer", { width: 640, height: 320, scale: 2 }),
        layoutCase("integer just under 2x falls to 1x",
            { x: 639, y: 320 }, FRAME, ASPECT, "integer", { width: 320, height: 160, scale: 1 }),
        layoutCase("integer when even 1x does not fit falls back to fit",
            { x: 300, y: 300 }, FRAME, ASPECT, "integer", { width: 300, height: 150, scale: 0.9375 }),
        layoutCase("a 0x0 frame lays out as if 320x200",
            { x: 640, y: 320 }, NO_FRAME, ASPECT, "fit", { width: 640, height: 320, scale: 2 }),
    ],
};

export default testFile;
