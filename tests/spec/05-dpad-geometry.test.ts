// realizes: docs/headless-browser-dos-runtime-spec.md > §13 DPad (directionsFor, spec/05-dpad-geometry tests)

// Dependencies:
import CTGTest, { CTGTestPredicates as P } from "ctg-js-test";   // Pipeline API and predicate builders
import { DPad } from "../../src/index.ts";                       // Class under test, via the public surface

// Type dependencies:
import type {
    DPadDirection,                                               // Element type of the directionsFor result
    Vector2,                                                     // Offset argument of directionsFor
} from "../../src/index.ts";
import type { TestCase, TestFile } from "../run.ts";             // Manifest contract consumed by the runner

/**
 *
 * Constants
 *
 */

const RADIUS = 100;                                              // Half the shorter side; chosen so the dead zone edge is exact
const DEAD_ZONE = 0.2;                                           // Fraction of RADIUS; the edge is at length 20
const REACH = 50;                                                // Offset length on each axis for the compass points, well outside the dead zone

// HELPER :: STRING, vector2, BOOLEAN, [dPadDirection] -> testCase
// Case: directionsFor at offset with RADIUS, DEAD_ZONE and diagonals returns expected, in the spec's sorted order.
const directionsCase = (label: string, offset: Vector2, diagonals: boolean, expected: DPadDirection[]): TestCase => ({
    label,
    run: () => CTGTest.init(label)
        .assert("directions match", () => DPad.directionsFor(offset, RADIUS, DEAD_ZONE, diagonals), P.equals<ReadonlyArray<DPadDirection>>(expected))
        .start(undefined),
});

const testFile: TestFile = {
    label: "DPad geometry",
    cases: [

        // Compass points, diagonals off: the dominant axis wins (+y is down on screen)
        directionsCase("diagonals off: an offset along +x is right", { x: REACH, y: 0 }, false, ["right"]),
        directionsCase("diagonals off: an offset along -x is left", { x: -REACH, y: 0 }, false, ["left"]),
        directionsCase("diagonals off: an offset along +y is down", { x: 0, y: REACH }, false, ["down"]),
        directionsCase("diagonals off: an offset along -y is up", { x: 0, y: -REACH }, false, ["up"]),
        directionsCase("diagonals off: near the up-right diagonal with x dominant, the dominant axis wins (right)", { x: REACH, y: -40 }, false, ["right"]),
        directionsCase("diagonals off: near the up-left diagonal with y dominant, the dominant axis wins (up)", { x: -40, y: -REACH }, false, ["up"]),
        directionsCase("diagonals off: near the down-right diagonal with y dominant, the dominant axis wins (down)", { x: 40, y: REACH }, false, ["down"]),
        directionsCase("diagonals off: near the down-left diagonal with x dominant, the dominant axis wins (left)", { x: -REACH, y: 40 }, false, ["left"]),

        // Compass points, diagonals on: both axes contribute within 22.5 degrees of a diagonal
        directionsCase("diagonals on: an offset along +x is right", { x: REACH, y: 0 }, true, ["right"]),
        directionsCase("diagonals on: an offset along -x is left", { x: -REACH, y: 0 }, true, ["left"]),
        directionsCase("diagonals on: an offset along +y is down", { x: 0, y: REACH }, true, ["down"]),
        directionsCase("diagonals on: an offset along -y is up", { x: 0, y: -REACH }, true, ["up"]),
        directionsCase("diagonals on: the up-right diagonal is up and right", { x: REACH, y: -REACH }, true, ["up", "right"]),
        directionsCase("diagonals on: the up-left diagonal is up and left", { x: -REACH, y: -REACH }, true, ["up", "left"]),
        directionsCase("diagonals on: the down-right diagonal is down and right", { x: REACH, y: REACH }, true, ["down", "right"]),
        directionsCase("diagonals on: the down-left diagonal is down and left", { x: -REACH, y: REACH }, true, ["down", "left"]),

        // The 22.5 degree band around a diagonal, both sides (tan 22.5 deg is about 0.4142)
        directionsCase("diagonals on: just inside 22.5 degrees of the up-right diagonal (about 22.8 degrees from +x) is up and right", { x: REACH, y: -21 }, true, ["up", "right"]),
        directionsCase("diagonals on: just outside 22.5 degrees of the up-right diagonal (about 21.8 degrees from +x) is right only", { x: REACH, y: -20 }, true, ["right"]),

        // Dead zone edge at deadZone * radius = 20, both sides, diagonals off and on
        directionsCase("diagonals off: an offset just inside the dead zone (19.9 along +x) has no directions", { x: 19.9, y: 0 }, false, []),
        directionsCase("diagonals off: an offset just outside the dead zone (20.1 along +x) is right", { x: 20.1, y: 0 }, false, ["right"]),
        directionsCase("diagonals on: an offset just inside the dead zone (19.9 along +x) has no directions", { x: 19.9, y: 0 }, true, []),
        directionsCase("diagonals on: an offset just outside the dead zone (20.1 along +x) is right", { x: 20.1, y: 0 }, true, ["right"]),
    ],
};

export default testFile;
