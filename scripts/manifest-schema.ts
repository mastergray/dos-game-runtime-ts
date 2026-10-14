// realizes: docs/deployment-manifest-spec.md > §4 Validation (the schema file)

// Dependencies:
import { writeFileSync } from "node:fs";                           // Writes the schema file
import { fileURLToPath } from "node:url";                          // Locates the schema file
import { MANIFEST_SCHEMA } from "../manifests/shell/manifest.ts";  // The schema, kept beside the predicates

/**
 *
 * Constants
 *
 */

const SCHEMA_FILE = fileURLToPath(new URL("../manifests/shell/manifest.schema.json", import.meta.url));   // Where editors find it

/**
 *
 * Functions
 *
 */

// HELPER :: VOID -> STRING
// The schema file's text: the schema object, pretty-printed, with a trailing newline.
export const schemaText = (): string => `${JSON.stringify(MANIFEST_SCHEMA, null, 4)}\n`;

// HELPER :: VOID -> VOID
// Entry point: writes the schema file.
const main = (): void => {
    writeFileSync(SCHEMA_FILE, schemaText());
    console.log(`wrote ${SCHEMA_FILE}`);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
