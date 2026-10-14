// realizes: docs/deployment-manifest-spec.md > §2.2 Harness server (the pages it fills), §2.4 Static build (the same pages on disk)

// Dependencies:
import { indexEntryFor } from "./page-state.ts";                   // One games index line per manifest

// Type dependencies:
import type { GameManifest } from "./manifest.types.ts";           // What the pages are filled from

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> STRING
// Escapes text for an HTML body or attribute.
const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// HELPER :: STRING, gameManifest -> STRING
// The shell page for one manifest: the template with {{title}} and {{name}} filled in. The harness serves it; the build writes it.
export const shellPageFor = (template: string, manifest: GameManifest): string => template
    .replace(/\{\{title\}\}/g, escape(manifest.metadata.title ?? manifest.metadata.name.toUpperCase()))
    .replace(/\{\{name\}\}/g, escape(manifest.metadata.name));

// HELPER :: STRING, [gameManifest], (STRING -> STRING?)? -> STRING
// The games index: the template with {{games}} and {{count}} filled in, one line per manifest ordered by display name, each
// line marked when nothing on it has been verified yet. hrefFor may give a slug's page address when it is hosted elsewhere;
// otherwise the page is the slug's own folder beside the index.
export const indexPageFor = (template: string, manifests: ReadonlyArray<GameManifest>, hrefFor: (slug: string) => string | undefined = () => undefined): string => {
    const lines = manifests.map((manifest) => { const entry = indexEntryFor(manifest); return { ...entry, href: hrefFor(manifest.metadata.slug) ?? entry.href }; }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) =>
        `                <a class="game${entry.played ? "" : " unplayed"}" href="${escape(entry.href)}"><span class="name">${escape(entry.name)}</span><span class="meta">${escape(entry.meta)}</span></a>`);
    return template
        .replace(/\{\{games\}\}/g, lines.join("\n"))
        .replace(/\{\{count\}\}/g, String(lines.length));
};
