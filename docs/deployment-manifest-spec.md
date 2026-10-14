# Deployment Manifest — Spec

**Status:** draft, written before implementation. Companion to
[headless-browser-dos-runtime-spec.md](./headless-browser-dos-runtime-spec.md),
whose §21 keeps any manifest format out of the runtime package. This
document keeps that boundary: the manifest lives with the deployments,
`src/` does not know it exists.

It is the alternative to the hand-copied game pages described in
[TODO-10-0126.md](./TODO-10-0126.md) §1. Eighteen pages were made by
copying the first hand page, editing a dozen lines, writing a dosbox conf
under `docs/probes/`, adding a line to the harness server's bundle map
and an entry on the games index. Every one of those edits is a field
below.

The hand pages are not replaced. They stay under `deployments/` as the
baseline each manifest page is compared against, and only games that
will actually be hosted get a manifest, one at a time, under
`manifests/`. The two trees are served side by side.

---

## 1. Shape

One manifest per game, four parts, in the order the player meets them:

| Part | Answers | Consumed by |
|---|---|---|
| `metadata` | What is this game, how is it presented | Games index, page shell |
| `load` | How the bundle is built and what DOSBox runs | Packer |
| `saves` | Where progress lives and how the game writes it | Page shell |
| `controls` | What the player's keyboard, mouse and touch do | Page shell |

Nothing per game exists outside the manifest. The bundle, the server
route, the games index entry and the page are all derived from it.

### 1.1 Where it lives

```
deployments/                  the hand pages, untouched: the baseline
manifests/
  shell/                      the shared initializer, imported by every page
    shell.ts                  mount(manifest, root): what each main.ts does today
    index.html                the page markup every manifest page copies at build
    manifest.types.ts         GameManifest and its predicates
    manifest.schema.json      generated from the types, for editors
    games.html                games index template
    fonts/                    IBM VGA font
  <slug>/
    manifest.json             hand-written: this game
    main.ts                   hand-written, two lines: import the shell, mount the manifest
    index.html                copied from shell/ at build; the harness serves shell/ directly
    fonts/                    copied from shell/ at build
    game.jsdos                packed by the packer; git-ignored
    emulators/                js-dos, copied at build; git-ignored
scripts/
  pack-bundle.ts              gains: npm run pack-bundle -- <slug>
  build-manifests.ts          makes each manifests/<slug>/ self-contained, plus the index
```

Each deployment is hosted on its own. Everything a game page needs sits
inside its folder, addressed by relative URLs: `./game.jsdos`,
`./manifest.json`, `./fonts/`, `./emulators/`. Nothing above `<slug>/`
is referenced at runtime, so a folder can be copied to any static host
as it is. The shell is a library the page imports at build time, not a
page of its own.

Manifests are JSON: inert data, with no code in them, that a tool, a
form or a catalogue could write as easily as a person. The types below
describe the parsed shape; the predicates in §4 are what checks a file,
at the two places one is read, and a JSON Schema generated from the
same types (`manifests/shell/manifest.schema.json`) gives editors
completion and a `$schema` line at the top of each file. Nothing in a
manifest is executed.

### 1.2 Declarations (`manifests/shell/manifest.types.ts`)

```ts
// INTERFACE :: {metadata:gameMetadata, load:gameLoad, saves:gameSaves, controls:gameControls}
// Everything one game page needs, in the order the player meets it.
export interface GameManifest {
    readonly metadata: GameMetadata;                               // Identity and presentation
    readonly load: GameLoad;                                       // Bundle contents and DOSBox settings
    readonly saves: GameSaves;                                     // Persistence key and the game's own save method
    readonly controls: GameControls;                               // Keyboard, mouse and touch policy
}

// INTERFACE :: {slug:STRING, name:STRING, title:STRING?, year:NUMBER?, genre:STRING, aspectRatio:NUMBER?, hints:[STRING]?, status:gameStatus}
// What the index and the title screen show.
export interface GameMetadata {
    readonly slug: string;                                         // URL segment and folder name: /<slug>/, lower-case [a-z0-9-]
    readonly name: string;                                         // Display name: "My Game"
    readonly title?: string;                                       // Splash heading when it differs from name upper-cased
    readonly year?: number;                                        // Release year for the index line; omitted when unsure
    readonly genre: string;                                        // Index line after the year: "strategy RPG"
    readonly aspectRatio?: number;                                 // Picture aspect for DosDisplay; 4/3 when omitted
    readonly hints?: ReadonlyArray<string>;                        // Title-screen lines for every-boot prompts: "Press 3 for Sound Blaster"
    readonly status: GameStatus;                                   // What has been verified
}

// INTERFACE :: {verified:[gameCheck], notes:STRING?}
// The record of what was tested, so the index and a reviewer can tell a booted page from a played one.
export interface GameStatus {
    readonly verified: ReadonlyArray<GameCheck>;                   // Checks that passed; empty for an untested manifest
    readonly notes?: string;                                       // Anything a player of this page should know that is not a hint
}

// TYPE :: "boot" | "input" | "sound" | "save"
// One verification: the game boots to its title, its controls reach it, sound is heard, a save survives a reload.
export type GameCheck = "boot" | "input" | "sound" | "save";

// INTERFACE :: {source:STRING, stage:STRING?, overlay:{STRING:STRING}?, dosbox:dosboxSettings?, autoexec:[STRING]}
// How the bundle is built: which files, shaped how, with what conf.
export interface GameLoad {
    readonly source: string;                                       // Game folder, absolute or relative to the repo root: "games/shooter"
    readonly stage?: string;                                       // Pack the folder under this directory inside C: ("SIMCITY"); root when omitted
    readonly overlay?: Readonly<Record<string, string>>;           // Archive path -> repo file placed over the folder before packing
    readonly dosbox?: DosboxSettings;                              // Settings that differ from the template
    readonly autoexec: ReadonlyArray<string>;                      // Lines after "mount c ." and "c:"; a "cd <stage>" is added when staged
}

// INTERFACE :: {machine:STRING?, cycles:STRING?, memsize:NUMBER?, aspect:BOOLEAN?}
// The DOSBox keys any game so far has needed to change; everything else is the template.
export interface DosboxSettings {
    readonly machine?: "svga_s3" | "vgaonly" | "ega" | "cga" | "tandy" | "hercules";   // Template: svga_s3
    readonly cycles?: string;                                      // DOSBox cycles value: "auto", "fixed 600", "max"; template: auto
    readonly memsize?: number;                                     // MB; template: 16
    readonly aspect?: boolean;                                     // DOSBox aspect correction; template: false (the page letterboxes instead)
}

// INTERFACE :: {key:STRING, method:STRING, files:[STRING]?}
// Where progress lives on this origin and how the game itself saves.
export interface GameSaves {
    readonly key: string;                                          // DosStorage key; one overlay per game per origin
    readonly method: string;                                       // One line for the restart confirm: "your last in-game save (Q on the map) is kept"
    readonly files?: ReadonlyArray<string>;                        // Names or globs the game writes ("SAVE*.DAT"); informational until the filesystem API
}

// INTERFACE :: {keyboard:keyboardPolicy?, mouse:mousePolicy?, touch:touchLayout?}
// Control policy without DOM references; the shell builds the surfaces.
export interface GameControls {
    readonly keyboard?: KeyboardPolicy;                            // Absent: keyboard on with no filter
    readonly mouse?: MousePolicy;                                  // Absent: mouse on, absolute touch, no pointer lock
    readonly touch?: TouchLayout;                                  // Absent: d-pad to arrows, A Enter, B Escape
}

// INTERFACE :: {enabled:BOOLEAN?, reject:[keyCode]?}
export interface KeyboardPolicy {
    readonly enabled?: boolean;                                    // Starts enabled; true when omitted
    readonly reject?: ReadonlyArray<KeyCode>;                      // Codes left to the page (the shell's own shortcuts); none when omitted
}

// INTERFACE :: {enabled:BOOLEAN?, touch:mouseTouchMode?, pointerLock:BOOLEAN?, sensitivity:NUMBER?}
export interface MousePolicy {
    readonly enabled?: boolean;                                    // Starts enabled; true when omitted. False for games whose intro buffers clicks
    readonly touch?: MouseTouchMode;                               // "absolute" when omitted
    readonly pointerLock?: boolean;                                // false when omitted
    readonly sensitivity?: number;                                 // Locked-delta multiplier; 1 when omitted
}

// TYPE :: "left" | "right" | "upper-left" | "upper-right" | "lower-left" | "lower-right"
// Where a component sits in landscape: a whole side column, or one of its halves.
export type LandscapeRegion = "left" | "right" | "upper-left" | "upper-right" | "lower-left" | "lower-right";

// Every component takes `region` (landscape placement) and `inline` (sit in a row beside the previous component of the slot).

// INTERFACE :: {component:"dpad", region:landscapeRegion?, inline:BOOLEAN?, map:dPadMap?, diagonals:BOOLEAN?}
export interface DpadComponent { readonly component: "dpad"; readonly region?: LandscapeRegion; readonly inline?: boolean; readonly map?: DPadMap; readonly diagonals?: boolean; }

// INTERFACE :: {component:"key", region:landscapeRegion?, inline:BOOLEAN?, label:STRING, code:keyCode}
export interface KeyComponent { readonly component: "key"; readonly region?: LandscapeRegion; readonly inline?: boolean; readonly label: string; readonly code: KeyCode; }

// INTERFACE :: {component:"keys", region:landscapeRegion?, inline:BOOLEAN?, keys:[{label:STRING, code:keyCode}]}
// One row of named keys: Esc beside Enter, Space beside Backspace.
export interface KeysComponent { readonly component: "keys"; readonly region?: LandscapeRegion; readonly inline?: boolean; readonly keys: ReadonlyArray<{ readonly label: string; readonly code: KeyCode }>; }

// INTERFACE :: {component:"keyboard", region:landscapeRegion?, inline:BOOLEAN?, pane:"letters"|"numbers"|"arrows"?}
// A phone-style keyboard: a row of tabs (ABC, 123, Nav), a slim fixed row of Esc and F1 to F12, then one of three four-row
// panes in the same footprint: letters (qwerty, Shift, punctuation, Backspace), numbers (digits, the rest of the punctuation,
// Tab) and a compass (the arrows with the numpad corners as diagonals, the editing keys around). Every pane ends in Ctrl, Alt,
// Space and Enter; the arrows repeat while held; letters are lower case and digits, punctuation and letters show their shifted
// glyphs while Shift is latched. On its own it
// is the whole portrait layout for a keyboard game; the d-pad component stays for games that hold a direction.
export interface KeyboardComponent { readonly component: "keyboard"; readonly region?: LandscapeRegion; readonly inline?: boolean; readonly pane?: "letters" | "numbers" | "arrows"; readonly style?: "tabs" | "phone" | "compass"; }
// style is where the keyboard starts; the player picks one under View ("Keyboard" opens a list: "Tabs: ABC/123/Nav", "Phone: Mobile Phone", "Compass: Full Keyboard With D-Pad") and the choice is
// remembered across games. "tabs" (the default) is a tab row over a slim Esc and F-key row and three panes (ABC, 123, Nav).
// "phone" is the same row with the letters and numbers panes only, switched by a 123 / ABC key on the bottom row. "compass" is the
// compass arrangement: a compass d-pad (arrows, numpad diagonals, Esc at the centre) at the left of a block above the panes,
// with F1 to F12 and the editing keys beside it, and the ABC and 123 panes below switched by a 123 / ABC key; no Nav pane.

// INTERFACE :: {component:"modifiers"|"digits"|"fkeys"|"letters", region:landscapeRegion?, inline:BOOLEAN?, columns:NUMBER?}
// A fixed group: Shift, Ctrl and Alt as latches; 0 to 9; F1 to F12; the three qwerty letter rows. With `columns`, letters go
// alphabetical and digits in order that many across, so a side column takes less from the picture.
export interface GroupComponent { readonly component: "modifiers" | "digits" | "fkeys" | "letters"; readonly region?: LandscapeRegion; readonly inline?: boolean; readonly columns?: number; }

export type LayoutComponent = DpadComponent | KeyComponent | KeysComponent | KeyboardComponent | GroupComponent;

// INTERFACE :: {landscape:[layoutComponent]?, portrait:[layoutComponent]?}
// The on-screen controls per orientation. Landscape components fill the side columns beside the picture; portrait
// components stack below it in order. An absent orientation takes the other's list, else the default: a d-pad with
// Enter and Escape.
export interface TouchLayout {
    readonly landscape?: ReadonlyArray<LayoutComponent>;
    readonly portrait?: ReadonlyArray<LayoutComponent>;
}
```

`InputTarget`, `DPadMap`, `KeyCode` and `MouseTouchMode` are the
runtime's own types, imported from `src/index.ts`; in a file they
appear as their JSON form, so a key target is written out as
`{ "kind": "key", "code": "Space" }`.

### 1.3 Meaning

- **`metadata.slug`** is the one name: the folder under
  `manifests/`, the route `/manifests/<slug>/`, and the bundle file
  `tests/browser/harness/manifests/<slug>.jsdos`, which one
  `.gitignore` pattern covers. It matches the hand page's slug so the
  two can be compared by name.
- **`metadata.hints`** are the prompts we decided not to auto-answer.
  The shell shows them under the PLAY button and keeps them visible for
  the first seconds after boot, then fades them. They are not sent to
  the game.
- **Screen mode is a choice of seven**, listed in the dialog when
  Screen mode is picked from either menu: Normal; fullscreen plain or
  stretched (the picture fills the screen regardless of aspect), each
  with or without the menu bar; and stretched in the window, with or
  without the bar. With the bar it is forced on so Normal is one click
  under View and Escape is left to the game (browsers also leave
  fullscreen on Escape, which some games read); without it the chrome
  parks above the top edge. A mouse brings it back by leaving the
  window through the top, or in fullscreen by resting on the top pixel
  for a moment, so a game's own moves to the top of the picture do not
  fire it; a finger taps the top edge.
  The choice is remembered: a window mode comes back on the next
  visit, a fullscreen one waits for a click. The player's menu setting
  returns on Normal.
- **The menu chrome is the player's choice, not the manifest's.** The
  shell has two: one MENU keycap that opens the paused dialog, or a
  QBasic-style strip across the top (Game, View, Sound pull-downs
  holding the same items, the game's name at the right) where the
  dialog is only the confirm step before a restart or a clear. A
  "Menu bar" toggle under View (and in the dialog) switches between
  them; touch-first devices start on the bar, others on the keycap.
  That choice, "Touch controls" and "Theme" (the page colour behind
  the picture: Black by default, then Dark grey, Grey, Blue, Teal and
  Beige and Off white on a cycle; the two light ones darken the keycaps,
  tabs and menu bar a step to keep them off the page), so a
  game's own black edge can be told from the page) are remembered in
  the browser (`localStorage`, one key each, shared by every game on
  the origin); a browser that refuses storage just uses the defaults.
- **`metadata.status.verified`** is the honest record. A manifest can
  be committed with an empty list; the index shows a marker for pages
  that have not been played.
- **`load.overlay`** covers every pack-time file need seen so far: the
  Sound Blaster config of one game, a clean progress file for another
  (`"PROGRESS.DAT": "games/.../PROGRESS.NEW"`). The overlay source
  may be a committed file under `docs/probes/` or a file inside the
  game folder.
- **`load.stage`** puts the folder under `C:\<stage>` for games that
  must run from a named first-level directory (one game so far). The generated
  autoexec changes into it before the game's lines.
- **`load.autoexec`** is the game's own lines only: drivers, the
  executable with its switches, or several commands. The packer writes
  the template conf around them; `docs/probes/*-dosbox.conf` files are
  no longer hand-written, and the template is a constant in the packer.
- **`saves.key`** stays stable across edits to everything else, since
  changing it orphans every player's overlay.
- **`controls`** holds policy, not elements. The shell owns the DOM: it
  builds each placed component, lays them out, and turns the d-pad
  into a `ControlsConfig` for `DosDeployment`; keys are sent by the
  shell through the player's input. A manifest cannot reference an
  element, which is what keeps it serializable and lets the packer read
  it in Node.
- **`controls.touch`** places components, and components never cover
  the picture. The play area is a grid: a bar with the MENU keycap,
  then in landscape a left column, the picture, and a right column;
  in portrait the picture and a stack below it. The picture fits what
  the columns leave. The keyboard as the whole right column is the
  usual landscape layout for a keyboard game: the picture takes the
  full height beside it and the MENU bar moves above the keyboard when
  the left column is empty. In portrait the picture is full width with
  the keyboard under it. A component's
  `region` names a whole side (`left`, `right`) or a half of one; two
  components in a half stack. Shift, Ctrl and Alt latch for the next
  key, which is how one game's upper-case prompts and another's Alt menus
  are reached.
- **Defaults** are what the eighteen pages share today, so a plain game
  needs only `metadata`, `load.source`, `load.autoexec` and `saves`.

---

## 2. Derivations

Four consumers, one input each.

### 2.1 Packer (`scripts/pack-bundle.ts`)

`npm run pack-bundle -- <slug>` reads `manifests/<slug>/manifest.json`,
validates it, and:

1. Reads `load.source` recursively, with directory entries as today.
2. Applies `load.overlay`: each archive path's bytes come from the repo
   file, replacing or adding to what the folder had.
3. Prefixes every archive path with `load.stage` when given.
4. Writes `.jsdos/dosbox.conf` from the template plus `load.dosbox`
   and `load.autoexec`:

   ```
   [sdl]
   autolock=true

   [dosbox]
   machine=<machine>
   memsize=<memsize>

   [cpu]
   core=auto
   cputype=auto
   cycles=<cycles>

   [render]
   aspect=<aspect>

   [autoexec]
   mount c .
   c:
   cd <stage>            ; only when staged
   <autoexec lines>
   ```

5. Writes `tests/browser/harness/<slug>.jsdos`.

The positional form `<game dir> [conf] [out]` stays for probing a game
before it has a manifest. `npm run pack-bundle -- --all` packs every
manifest.

### 2.2 Harness server (`tests/support/harness-server.ts`)

`DEPLOYMENT_BUNDLES` and the `/<slug>/` routes stay as they are for
the hand pages. Beside them, at start the server lists
`manifests/*/manifest.json`, parses and validates each, and for every
slug serves under `/manifests/<slug>/`:

- `/manifests/` serves the games index (§2.4) for every manifest found.
- `/manifests/<slug>/` serves `manifests/shell/index.html` with
  `{{title}}` substituted from the manifest, standing in for the copy
  the build would place in the folder.
- `/manifests/<slug>/main.js` is esbuild's bundle of
  `manifests/<slug>/main.ts`, built like the hand pages' scripts.
- `/manifests/<slug>/manifest.json` serves the file as parsed and
  validated at start, so a malformed manifest fails the server, not the
  player.
- `/manifests/<slug>/game.jsdos` serves
  `tests/browser/harness/manifests/<slug>.jsdos`, 404 with a clear
  message when it has not been packed. A separate bundle from the hand
  page's, since the two confs are produced differently and the point is
  to compare them.
- `/manifests/<slug>/fonts/` and `/manifests/<slug>/emulators/` serve
  `shell/fonts/` and the js-dos package, standing in for the build's
  copies.
- `/manifests/` is generated from every manifest's `metadata`, with the
  verified marker. The hand-written `/games` page stays.

The root page stays the test harness. The server serves what the build
would have copied, so a page behaves the same under the harness and on
its own host. A hand page and its manifest page can be opened side by
side, which is the comparison each migration step ends with.

### 2.3 Page shell (`manifests/shell/shell.ts`)

Each game's `main.ts` is two lines:

```ts
import { mount } from "../shell/shell.ts";                        // The shared initializer
void mount(new URL("./manifest.json", import.meta.url));          // This game's manifest, beside the page
```

`mount(url)` fetches the manifest, validates it with `isGameManifest`,
resolves every asset relative to the page (`./game.jsdos`,
`./emulators/`), and does what today's `main.ts` does with the
constants replaced by manifest reads:

- Bundle URL is `./game.jsdos`; storage key is `saves.key`.
- The splash heading is `metadata.title ?? metadata.name.toUpperCase()`;
  `metadata.hints` render under PLAY.
- `metadata.aspectRatio` goes to `game.display.aspectRatio`.
- The restart confirm reads "Restart the game? Your <saves.method>."
  and the clear confirm names `metadata.name`.
- `controls` becomes a `ControlsConfig`: the shell builds the surfaces
  it needs (d-pad, N buttons, later the keypad) inside `#touch`, so the
  template no longer hardcodes `#dpad`, `#btn-a`, `#btn-b`.
- Everything else (menu, autosave, fullscreen, play time, sound toggle)
  is unchanged and now exists once.

A React version of the pages is planned, with the page as components
and static builds coming from its toolchain. The manifest and the
runtime need nothing for that: both are framework-free. The shell is
what React replaces, so write it in two layers: the page state (menu
open or confirming, muted, play time, the save problem, autosave
timing, the touch surfaces a manifest calls for) as plain functions
and a small state object with no DOM access, and the DOM wiring that
reads elements and calls them. The React components then import the
first layer and redo only the second.

### 2.4 Static build (`scripts/build-manifests.ts`)

`npm run build-manifests -- <slug> [--out <dir>]` writes one game as a
self-contained folder (`dist/<slug>/` by default): `shell/index.html`
with the title substituted, `main.ts` bundled to `main.js`, the
validated `manifest.json`, `game.jsdos` packed from the manifest,
`fonts/`, and the two js-dos files the dosbox backend fetches under
`emulators/`. Every reference inside the folder is relative, so it
works at any address, not only `manifests/<slug>/`: upload it anywhere
that serves static files with the cross-origin isolation headers, or
without them for direct mode. `--all [--out <dir>]` builds every
manifest into `<dir>/<slug>/` (default `dist/`) and the index at
`<dir>/index.html`. The output is git-ignored; `manifest.json` and
`main.ts` are the source. The page fillers the build and the harness
share live in `shell/pages.ts`.

The games index is `shell/games.html` filled from every manifest's
`metadata` through `indexEntryFor` in `page-state.ts`: one line per
manifest with the name, the year and genre, and a `?` marker on a page
whose `status.verified` is still empty. The harness serves it at
`/manifests/` (the slug routes sit under it, so no game may be called
`fonts`); `--all` writes it beside the game folders. Since each game
may be hosted at a different address, the build takes a base URL per
slug (`--base <slug>=<url>`, the folder the game sits in), defaulting
to `./<slug>/` for the case where they all sit together.

---

## 3. Worked examples

### 3.1 A 1985 CGA shooter, the most fields in one file

```json
{
    "$schema": "../shell/manifest.schema.json",
    "metadata": {
        "slug": "shooter",
        "name": "Shooter",
        "year": 1985,
        "genre": "CGA helicopter shooter",
        "hints": ["Any key clears the notice screen"],
        "status": { "verified": ["boot", "input", "sound"], "notes": "Play speed confirmed by hand at fixed 600 cycles." }
    },
    "load": {
        "source": "games/shooter",
        "dosbox": { "machine": "cga", "cycles": "fixed 600" },
        "autoexec": ["SHOOTER.EXE"]
    },
    "saves": {
        "key": "shooter",
        "method": "high scores are kept",
        "files": ["HIGHSCOR.DAT", "PARAMS.DAT"]
    },
    "controls": {
        "touch": {
            "landscape": [
                { "component": "dpad", "region": "left" },
                { "component": "key", "label": "FIRE", "code": "Space", "region": "lower-right" },
                { "component": "key", "label": "BOMB", "code": "KeyX", "region": "lower-right" }
            ]
        }
    }
}
```

### 3.2 The other shapes seen so far

A silent shipped config replaced by the one its setup program writes, as an overlay:

```json
"load": {
    "source": "games/business-sim",
    "overlay": { "SOUND.CFG": "games/business-sim-sb/SOUND.CFG" },
    "autoexec": ["SIM.EXE"]
}
```

A game that must live in a first-level directory, as a stage:

```json
"load": { "source": "games/city-sim", "stage": "CITY", "autoexec": ["CITY.EXE"] }
```

A sound driver loaded first, as two autoexec lines:

```json
"load": { "source": "games/rpg", "autoexec": ["SBFMDRV.COM", "RPG.EXE"] }
```

Every-boot prompts, as hints, with the mouse held off until the intro
has passed:

```json
"metadata": { "hints": ["1 for VGA, 4 for AdLib or Sound Blaster, 1 for mouse and keyboard"] },
"controls": { "mouse": { "enabled": false } }
```

A keyboard game's controls, placed per orientation:

```json
"controls": {
    "touch": {
        "landscape": [
            { "component": "keyboard", "region": "right" }
        ],
        "portrait": [
            { "component": "keyboard" }
        ]
    }
}
```

A plain game, the minimum:

```json
{
    "$schema": "../shell/manifest.schema.json",
    "metadata": { "slug": "rpg", "name": "An RPG", "year": 1990, "genre": "RPG", "status": { "verified": ["boot", "input"] } },
    "load": { "source": "games/rpg", "autoexec": ["RPG.EXE"] },
    "saves": { "key": "rpg", "method": "in-game saves are kept" },
    "controls": {}
}
```

---

## 4. Validation and tests

`isGameManifest` and one predicate per interface live in
`manifests/shell/manifest.types.ts`, written as the runtime's predicates are
(`code-style.md`: a predicate per type, structural, no throwing). They
run in two places:

- The packer and the harness server, after `JSON.parse` and before
  anything else. A failure names the slug and the field.
- The shell, after fetching the manifest and before touching the DOM.
  A failure shows on the title screen the way a boot failure does.

The schema file is generated from the types by a script
(`npm run manifest-schema`) and committed; a spec test checks the
committed file matches the generated one so the two cannot drift. It
serves editors, not the code: the predicates remain the check.

Tests, in the existing suites:

- **spec (Node):** `09-manifest.test.ts` covers the predicates against
  valid and malformed manifests, the conf generator's output for the
  template, a staged game, a changed machine and cycles, and the index
  entry generator. `10-pack-bundle.test.ts` packs a fixture folder with
  an overlay and a stage into memory and checks the entry names and the
  conf.
- **browser:** one case that mounts the shell with a fixture manifest
  over the fake adapter and checks the title, hints, the built touch
  surfaces and the resulting `ControlsConfig`. The existing
  `DosDeployment` cases are untouched.

The eighteen manifests themselves are checked by `npm run pack-bundle
-- --all`, which validates every file and is the regression test for
the migration: every bundle packs, every page boots in the headless
probe used so far.

---

## 5. Migration

Games move one at a time, only the ones that will be hosted, and the
hand page of each stays as the baseline. Nothing under `deployments/`
is deleted by this work.

1. Add `manifests/shell/manifest.types.ts` with its predicates and the
   schema generator, the packer's manifest mode writing to
   `tests/browser/harness/manifests/<slug>.jsdos`, and the server's
   `/manifests/<slug>/` discovery. The hand pages are untouched.
2. Write `manifests/shell/` from the first hand page, parameterised as
   §2.3, in the two layers noted there.
3. The first game (a keyboard RPG): its `manifest.json` and two-line
   `main.ts`; pack, serve at `/manifests/<slug>/`, and compare against
   its hand page on desktop and phone: boot through the launcher, the
   passcode, play, save, reload and restore. The first manifest page,
   so this is where the shell is finished.
4. The second game (mouse-driven strategy): `mouse.enabled: false` and
   `hints` for its three prompts; compare the intro, the setup answers,
   mouse orders, saving from its menu and reload.
5. The third game (a text-mode board game driven by function keys), so the first `keypad` declaration
   (F1 to F10 and the digits), parsed and shown as a row under the
   hints until the keypad overlay exists; compare the colour question
   and a few turns.
6. Stop and look. Each of the three gets a verdict against its hand
   page before the next game is picked, and the fields the three did
   not touch (`overlay`, `stage`, `dosbox` settings) wait for a game
   that needs them.
7. `scripts/build-manifests.ts`, and a build of the first game uploaded
   somewhere static as the proof that a folder stands alone.

Each step is a commit; both trees keep working between them. Removing
a hand page, the `docs/probes/*-dosbox.conf` files, or
`DEPLOYMENT_BUNDLES` is a separate decision taken after the three
pages have been compared, not part of this plan.

---

## 6. Constraints the manifest does not solve

- **No installers.** A game must already be installed: its folder holds
  what its installer produced. Every game so far shipped that way.
  A game that needs its installer run inside the emulator is out of
  scope until one appears.
- **One bundle per game.** No per-player variants, no mod packs.
- **Saves are one overlay.** Individual save files cannot be listed or
  deleted until the runtime's filesystem API (TODO §3). `saves.files`
  is documentation until then.
- **Hints are text.** The shell never sends keys to answer a prompt;
  that was decided against while testing the strategy game.
