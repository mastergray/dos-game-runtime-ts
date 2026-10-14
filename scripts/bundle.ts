// realizes: docs/deployment-manifest-spec.md > §2.1 Packer

// Dependencies:
import { readdirSync, readFileSync, statSync } from "node:fs";    // Reads the game directory and overlay files
import { join, relative, resolve, sep } from "node:path";          // Path handling for the directory walk
import { crc32 } from "node:zlib";                                 // CRC-32 required by every zip entry
import { dosboxConfFor } from "../manifests/shell/manifest.ts";    // The conf a manifest's load describes

// Type dependencies:
import type { GameManifest } from "../manifests/shell/manifest.types.ts";   // The manifest a bundle is built from

/**
 *
 * Type Declarations
 *
 */

// INTERFACE :: {name:STRING, data:Uint8Array}
// One file to place in the zip, with its path inside the archive.
export interface ZipEntry {
    name: string;                                                  // Forward-slash path inside the archive; a trailing "/" is a directory
    data: Uint8Array;                                              // File contents, stored uncompressed
}

/**
 *
 * Constants
 *
 */

const JSDOS_JSON = new TextEncoder().encode("{\"version\":\"8\"}\n");   // Bundle marker js-dos expects
const DOS_TIME = 0;                                                // Fixed timestamp fields: reproducible archives
const DOS_DATE = 0x21;                                             // 1980-01-01, the zip epoch

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> [zipEntry]
// Reads every file under dir, recursively, as an entry named by its path relative to dir, with a directory entry
// (a name ending in "/", no data) for every directory before its contents, so nested directories restore in order.
// NOTE: js-dos creates a missing parent one level deep but not a chain, so the directory entries are required.
export const entriesUnder = (dir: string): ZipEntry[] => {
    const entries: ZipEntry[] = [];
    const walk = (current: string): void => {
        for (const name of readdirSync(current).sort()) {
            const full = join(current, name);
            if (statSync(full).isDirectory()) {
                entries.push({ name: relative(dir, full).split(sep).join("/") + "/", data: new Uint8Array(0) });
                walk(full);
            } else {
                entries.push({ name: relative(dir, full).split(sep).join("/"), data: new Uint8Array(readFileSync(full)) });
            }
        }
    };
    walk(dir);
    return entries;
};

// HELPER :: [zipEntry], Uint8Array -> [zipEntry]
// The game entries plus the .jsdos directory js-dos reads its conf and marker from.
export const withJsdosEntries = (entries: ReadonlyArray<ZipEntry>, conf: Uint8Array): ZipEntry[] => [
    ...entries,
    { name: ".jsdos/", data: new Uint8Array(0) },
    { name: ".jsdos/dosbox.conf", data: conf },
    { name: ".jsdos/jsdos.json", data: JSDOS_JSON },
];

// HELPER :: gameManifest, STRING -> [zipEntry]
// The entries a manifest's load describes: the source folder, the overlay files over it, everything under the stage directory when
// staged, and the generated conf. Overlay sources resolve against the repo root, as the source folder does; absolute paths pass through.
export const entriesFor = (manifest: GameManifest, repoRoot: string): ZipEntry[] => {
    const { load } = manifest;
    const byName = new Map<string, ZipEntry>();
    for (const entry of entriesUnder(resolve(repoRoot, load.source))) byName.set(entry.name, entry);
    for (const [name, file] of Object.entries(load.overlay ?? {})) {
        byName.set(name, { name, data: new Uint8Array(readFileSync(resolve(repoRoot, file))) });
    }
    const prefix = load.stage === undefined ? "" : `${load.stage}/`;
    const staged: ZipEntry[] = load.stage === undefined ? [] : [{ name: prefix, data: new Uint8Array(0) }];
    for (const entry of byName.values()) staged.push({ name: prefix + entry.name, data: entry.data });
    return withJsdosEntries(staged, new TextEncoder().encode(dosboxConfFor(load)));
};

// HELPER :: NUMBER, NUMBER -> Uint8Array
// Little-endian encoding of value in the given byte width.
const le = (value: number, bytes: 2 | 4): Uint8Array => {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) out[i] = (value >>> (8 * i)) & 0xff;
    return out;
};

// HELPER :: [Uint8Array] -> Uint8Array
// Concatenates byte arrays.
const concat = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
};

// HELPER :: [zipEntry] -> Uint8Array
// Builds a stored (uncompressed) zip archive: local headers, then the central directory, then the end record.
// NOTE: js-dos reads bundles with libzip, which accepts stored entries; no deflate is needed.
export const zip = (entries: ReadonlyArray<ZipEntry>): Uint8Array => {
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const entry of entries) {
        const name = new TextEncoder().encode(entry.name);
        const crc = crc32(entry.data);
        const common = concat([le(20, 2), le(0x0800, 2), le(0, 2), le(DOS_TIME, 2), le(DOS_DATE, 2), le(crc, 4), le(entry.data.length, 4), le(entry.data.length, 4), le(name.length, 2)]);
        const local = concat([le(0x04034b50, 4), common, le(0, 2), name, entry.data]);
        centrals.push(concat([le(0x02014b50, 4), le(20, 2), common, le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name]));
        locals.push(local);
        offset += local.length;
    }
    const central = concat(centrals);
    const end = concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(central.length, 4), le(offset, 4), le(0, 2)]);
    return concat([...locals, central, end]);
};

// HELPER :: Uint8Array -> [STRING]
// The entry names of a stored zip, read back from its local headers; for tests and listings.
export const namesIn = (archive: Uint8Array): string[] => {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const names: string[] = [];
    let offset = 0;
    while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        names.push(new TextDecoder().decode(archive.subarray(offset + 30, offset + 30 + nameLength)));
        offset += 30 + nameLength + extraLength + size;
    }
    return names;
};

// HELPER :: Uint8Array, STRING -> STRING?
// The text of one stored entry, or null when the archive has no entry of that name.
export const textOf = (archive: Uint8Array, name: string): string | null => {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    let offset = 0;
    while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const start = offset + 30 + nameLength + extraLength;
        if (new TextDecoder().decode(archive.subarray(offset + 30, offset + 30 + nameLength)) === name) {
            return new TextDecoder().decode(archive.subarray(start, start + size));
        }
        offset = start + size;
    }
    return null;
};
