#!/usr/bin/env node
// Runs scripts/build-manifests.ts through tsx, so a project that installed this package can build its manifests without a
// TypeScript setup of its own: `npx dos-build-manifests --all`.
import { register } from "tsx/esm/api";
register();
await import("../scripts/build-manifests.ts");
