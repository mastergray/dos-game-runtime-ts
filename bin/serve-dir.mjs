#!/usr/bin/env node
// Runs scripts/serve-dir.ts through tsx: `npx dos-serve-dir dist 8080` serves a built folder with the isolation headers.
import { register } from "tsx/esm/api";
register();
await import("../scripts/serve-dir.ts");
