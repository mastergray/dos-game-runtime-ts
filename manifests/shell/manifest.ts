// realizes: docs/deployment-manifest-spec.md > §2.1 Packer (the conf), §4 Validation (the read points, the schema)

// Dependencies:
import { manifestProblem } from "./manifest.types.ts";             // Names what is wrong with a parsed manifest

// Type dependencies:
import type { GameLoad, GameManifest } from "./manifest.types.ts";   // The parsed shape and the part the conf is written from

/**
 *
 * Constants
 *
 */

const TEMPLATE = {                                                 // The DOSBox settings every game starts from
    machine: "svga_s3",
    memsize: 16,
    cycles: "auto",
    aspect: false,
} as const;

// The JSON Schema for a manifest file, kept beside the predicates so the two are edited together; the predicates are the check,
// the schema is for editors. `npm run manifest-schema` writes it to manifest.schema.json and a spec test holds the two equal.
export const MANIFEST_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "GameManifest",
    description: "One game page: metadata, load, saves and controls. See docs/deployment-manifest-spec.md.",
    type: "object",
    required: ["metadata", "load", "saves", "controls"],
    additionalProperties: false,
    properties: {
        $schema: { type: "string" },
        metadata: {
            type: "object",
            required: ["slug", "name", "genre", "status"],
            additionalProperties: false,
            properties: {
                slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$", description: "URL segment and folder name" },
                name: { type: "string", minLength: 1, description: "Display name" },
                title: { type: "string", minLength: 1, description: "Splash heading when it differs from name upper-cased" },
                year: { type: "integer", description: "Release year for the index line" },
                genre: { type: "string", minLength: 1, description: "Index line after the year" },
                aspectRatio: { type: "number", exclusiveMinimum: 0, description: "Picture aspect for the display; 4/3 when omitted" },
                hints: { type: "array", items: { type: "string", minLength: 1 }, description: "Title-screen lines for every-boot prompts" },
                status: {
                    type: "object",
                    required: ["verified"],
                    additionalProperties: false,
                    properties: {
                        verified: { type: "array", items: { enum: ["boot", "input", "sound", "save"] }, description: "Checks that passed" },
                        notes: { type: "string", minLength: 1 },
                    },
                },
            },
        },
        load: {
            type: "object",
            required: ["source", "autoexec"],
            additionalProperties: false,
            properties: {
                source: { type: "string", minLength: 1, description: "Game folder: absolute, or relative to the repo root" },
                stage: { type: "string", minLength: 1, description: "Pack the folder under this directory inside C:" },
                overlay: { type: "object", additionalProperties: { type: "string", minLength: 1 }, description: "Archive path -> file (absolute or repo-relative) placed over the folder" },
                dosbox: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        machine: { enum: ["svga_s3", "vgaonly", "ega", "cga", "tandy", "hercules"] },
                        cycles: { type: "string", minLength: 1, description: "auto, max, or fixed N" },
                        memsize: { type: "integer", minimum: 1, description: "MB" },
                        aspect: { type: "boolean" },
                    },
                },
                autoexec: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "Lines after mount c . and c:" },
            },
        },
        saves: {
            type: "object",
            required: ["key", "method"],
            additionalProperties: false,
            properties: {
                key: { type: "string", minLength: 1, description: "Storage key; one overlay per game per origin" },
                method: { type: "string", minLength: 1, description: "One line for the restart confirm" },
                files: { type: "array", items: { type: "string", minLength: 1 }, description: "Names or globs the game writes" },
            },
        },
        controls: {
            type: "object",
            additionalProperties: false,
            properties: {
                keyboard: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        enabled: { type: "boolean" },
                        reject: { type: "array", items: { $ref: "#/$defs/keyCode" } },
                    },
                },
                mouse: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        enabled: { type: "boolean" },
                        touch: { enum: ["none", "absolute"] },
                        pointerLock: { type: "boolean" },
                        sensitivity: { type: "number", exclusiveMinimum: 0 },
                        scale: { type: "object", required: ["x", "y"], additionalProperties: false, properties: { x: { type: "number", exclusiveMinimum: 0 }, y: { type: "number", exclusiveMinimum: 0 } }, description: "Multipliers for absolute positions; x 0.5 for a game that reads the driver's doubled x range as pixels" },
                    },
                },
                touch: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        landscape: { type: "array", items: { $ref: "#/$defs/layoutComponent" }, description: "Components beside the picture" },
                        portrait: { type: "array", items: { $ref: "#/$defs/layoutComponent" }, description: "Components below the picture, in order" },
                    },
                },
            },
        },
    },
    $defs: {
        keyCode: { type: "string", pattern: "^[A-Za-z0-9]+$", description: "DOM KeyboardEvent.code" },
        inputTarget: {
            oneOf: [
                { type: "object", required: ["kind", "code"], additionalProperties: false, properties: { kind: { const: "key" }, code: { $ref: "#/$defs/keyCode" } } },
                { type: "object", required: ["kind", "button"], additionalProperties: false, properties: { kind: { const: "mouseButton" }, button: { enum: ["left", "middle", "right"] } } },
                { type: "object", required: ["kind", "button"], additionalProperties: false, properties: { kind: { const: "joystickButton" }, button: { type: "integer", minimum: 0 } } },
            ],
        },
        dpadMap: {
            type: "object",
            additionalProperties: false,
            properties: { up: { $ref: "#/$defs/inputTarget" }, down: { $ref: "#/$defs/inputTarget" }, left: { $ref: "#/$defs/inputTarget" }, right: { $ref: "#/$defs/inputTarget" } },
        },
        region: { enum: ["left", "right", "upper-left", "upper-right", "lower-left", "lower-right"], description: "Landscape placement" },
        layoutComponent: {
            oneOf: [
                { type: "object", required: ["component"], additionalProperties: false, properties: { component: { const: "dpad" }, region: { $ref: "#/$defs/region" }, inline: { type: "boolean" }, map: { $ref: "#/$defs/dpadMap" }, diagonals: { type: "boolean" } } },
                { type: "object", required: ["component", "label", "code"], additionalProperties: false, properties: { component: { const: "key" }, region: { $ref: "#/$defs/region" }, inline: { type: "boolean" }, label: { type: "string", minLength: 1 }, code: { $ref: "#/$defs/keyCode" } } },
                { type: "object", required: ["component", "keys"], additionalProperties: false, properties: { component: { const: "keys" }, region: { $ref: "#/$defs/region" }, inline: { type: "boolean" }, keys: { type: "array", minItems: 1, items: { type: "object", required: ["label", "code"], additionalProperties: false, properties: { label: { type: "string", minLength: 1 }, code: { $ref: "#/$defs/keyCode" } } } } } },
                { type: "object", required: ["component"], additionalProperties: false, properties: { component: { const: "keyboard" }, region: { $ref: "#/$defs/region" }, inline: { type: "boolean" }, pane: { enum: ["letters", "numbers", "arrows"], description: "The pane shown first" }, style: { enum: ["tabs", "phone", "compass"], description: "The arrangement to start on: tabs over the panes, phone-style switch keys, or a compass beside the function keys" } } },
                { type: "object", required: ["component"], additionalProperties: false, properties: { component: { enum: ["modifiers", "digits", "fkeys", "letters"] }, region: { $ref: "#/$defs/region" }, inline: { type: "boolean" }, columns: { type: "integer", minimum: 1, maximum: 10, description: "Letters and digits only: keys per row; alphabetical letters" } } },
            ],
        },
    },
} as const;

/**
 *
 * Functions
 *
 */

// HELPER :: STRING, STRING? -> gameManifest
// Parses manifest JSON and validates it; throws an Error naming the source and the failing part, so a bad file fails where it is read.
// NOTE: The $schema key is for editors and is dropped so the predicates see only the four parts.
export const parseManifest = (text: string, source = "manifest"): GameManifest => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`${source}: not JSON (${String(error)})`);
    }
    if (typeof parsed === "object" && parsed !== null && "$schema" in parsed) {
        const { $schema: _schema, ...rest } = parsed as Record<string, unknown>;
        parsed = rest;
    }
    const problem = manifestProblem(parsed);
    if (problem !== null) throw new Error(`${source}: ${problem}`);
    return parsed as GameManifest;
};

// HELPER :: gameLoad -> STRING
// Writes the dosbox.conf for a load: the template with the load's settings over it, then the autoexec with a cd into the stage when staged.
export const dosboxConfFor = (load: GameLoad): string => {
    const settings = { ...TEMPLATE, ...(load.dosbox ?? {}) };
    const autoexec = ["mount c .", "c:", ...(load.stage === undefined ? [] : [`cd ${load.stage}`]), ...load.autoexec];
    return [
        "[sdl]",
        "autolock=true",
        "",
        "[dosbox]",
        `machine=${settings.machine}`,
        `memsize=${settings.memsize}`,
        "",
        "[cpu]",
        "core=auto",
        "cputype=auto",
        `cycles=${settings.cycles}`,
        "",
        "[render]",
        `aspect=${settings.aspect ? "true" : "false"}`,
        "",
        "[autoexec]",
        ...autoexec,
        "",
    ].join("\n");
};
