# dos-game-runtime-ts

Run DOS games in the browser with a headless js-dos runtime using a manifest that turns game assets into a standalone web app.

The runtime owns how DOS executes, how video and audio reach the
browser, how keyboard, mouse and joystick input reach DOS, and the
pointer mechanics touch controls are built from. A game's page owns the
rest: the layout, which controls exist, and what they mean. A manifest
describes a game once, and the shared shell and build turn it into a
page that works on desktop, phone and tablet.

Design: [docs/headless-browser-dos-runtime-roadmap.md](docs/headless-browser-dos-runtime-roadmap.md).
Implementation spec: [docs/headless-browser-dos-runtime-spec.md](docs/headless-browser-dos-runtime-spec.md).

## Status

Milestones 1 through 7 of the roadmap are implemented and tested: a DOS
program boots through `DosPlayer` with js-dos behind an adapter, renders
into a canvas, plays sound, and takes input from the physical keyboard
(`KeyboardSource`), the physical mouse (`MouseSource`, with touch as an
absolute cursor on phones), and touch controls composed from `Button`,
`DPad`, `AnalogStick` and `Trackpad` and bound to DOS input through
`InputMapper`. `DosDeployment` composes all of that from one config,
and the harness page is itself such a deployment, laid out for phones
with fullscreen and safe-area handling. Saves persist across browser
sessions through `DosStorage`. Gamepads (Milestone 10) are specified
but not yet built.

## Use

```js
import { DosPlayer } from "dos-game-runtime-ts";

const player = await DosPlayer.init({
    canvas: document.querySelector("#canvas"),
    container: document.querySelector("#container"),
    game: { bundle: "/game/game.jsdos" },
});

await player.start();

// Physical keyboard: forwards key events, releases everything on focus loss.
import { KeyboardSource } from "dos-game-runtime-ts";
const keyboard = KeyboardSource.init({ input: player.input, target: document });
keyboard.attach();

// Physical mouse: relative motion and buttons from pointer events on the canvas.
import { MouseSource } from "dos-game-runtime-ts";
const mouse = MouseSource.init({ input: player.input, surface: canvas, pointerLock: canvas, sensitivity: 1.5 });
mouse.attach();

// Touch controls: the runtime supplies mechanics, your page supplies meaning.
import { Button, DPad, Trackpad, InputMapper } from "dos-game-runtime-ts";
const mapper = InputMapper.init({ input: player.input });
const dpad = DPad.init({ surface: document.querySelector("#dpad") });
dpad.attach();
mapper.bindDPad(dpad, { up: { kind: "key", code: "ArrowUp" }, down: { kind: "key", code: "ArrowDown" },
                        left: { kind: "key", code: "ArrowLeft" }, right: { kind: "key", code: "ArrowRight" } });
const fire = Button.init({ surface: document.querySelector("#fire") });
fire.attach();
mapper.bindButton(fire, { kind: "key", code: "ControlLeft" });
const pad = Trackpad.init({ surface: document.querySelector("#pad") });
pad.attach();
mapper.bindTrackpad(pad, { move: "mouse", tap: { kind: "mouseButton", button: "left" }, twoFingerTap: { kind: "mouseButton", button: "right" } });

// Or drive the input API directly from your own controls:
player.input.keyDown("ArrowUp");
player.input.keyUp("ArrowUp");
player.input.mouseMove(12, -4);
player.input.mouseDown("left");
player.input.mouseUp("left");

player.pause();
player.resume();
await player.fullscreen();
await player.destroy();
```

The deployment must serve the js-dos runtime assets
(`node_modules/emulators/dist/`) and tell the adapter where:

```js
import { DosPlayer, JsDosEmulatorAdapter } from "dos-game-runtime-ts";

const adapter = await JsDosEmulatorAdapter.init({ pathPrefix: "/emulators/" });
const player = await DosPlayer.init({ canvas, container, game, adapter });
```

js-dos worker mode needs the page served with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`.

A game bundle is a zip of the DOS files plus `.jsdos/dosbox.conf`,
whose `[autoexec]` section runs the program, and `.jsdos/jsdos.json`
holding `{"version":"8"}`. `npm run pack-bundle -- <game dir>
[dosbox.conf] [out.jsdos]` builds one.

Saves: `await player.persist()` resolves to an overlay of changed files,
or `null` when nothing changed. Pass it back as `game.changes` on a
later `start()` to restore them. `DosStorage` keeps that overlay in
IndexedDB under a key you choose, and a `DosDeployment` given a
`storage` restores it before boot and stores it on `save()`:

```js
const deployment = await DosDeployment.init({ canvas, container, game, controls,
    storage: DosStorage.init({ key: "my-game" }) });
await deployment.start();
// … on a save button, visibilitychange, or a timer:
await deployment.save();   // true when an overlay was stored, false when nothing changed
```

The bundle itself is never stored, only the files the game changed, so
saves are small and the bundle stays a static asset.

## Deploy a game

A deployment is a page you own. The runtime supplies mechanics; the page
supplies the game files, the layout, and what every control means.
`DosDeployment` composes the whole thing from one config:

```js
import { DosDeployment } from "dos-game-runtime-ts";

const deployment = await DosDeployment.init({
    canvas: document.querySelector("#canvas"),
    container: document.querySelector("#screen"),
    game: { bundle: "/game/game.jsdos", display: { aspectRatio: 4 / 3 } },
    controls: {
        keyboard: { enabled: true },
        mouse: { enabled: false, touch: "absolute", pointerLock: true },   // off until the game wants it
        dpads: [{ surface: document.querySelector("#dpad"), diagonals: true,
                  map: { up: key("ArrowUp"), down: key("ArrowDown"), left: key("ArrowLeft"), right: key("ArrowRight") } }],
        buttons: [{ surface: document.querySelector("#a"), target: key("ControlLeft") },
                  { surface: document.querySelector("#b"), target: key("Space"), hold: key("ShiftLeft") }],
        trackpads: [{ surface: document.querySelector("#pad"),
                      map: { move: "mouse", tap: mouseButton("left"), twoFingerTap: mouseButton("right") } }],
    },
});
await deployment.start();

// Later, when the game reaches a screen that reads the mouse:
deployment.mouseEnabled = true;

function key(code) { return { kind: "key", code }; }
function mouseButton(button) { return { kind: "mouseButton", button }; }
```

What the config decides, and the runtime never does:

- **Which program runs**: the bundle's `.jsdos/dosbox.conf` autoexec.
- **Where controls are and how they look**: the page's HTML and CSS.
  Give touch surfaces `touch-action: none` and `user-select: none`.
- **What controls mean**: every `target` and `map`.
- **When input is live**: `keyboardEnabled` and `mouseEnabled`. DOS
  mouse drivers queue clicks until the program reads them, so a page
  keeps the mouse off during intros and turns it on at the first
  interactive screen.
- **Touch on the game picture**: `mouse.touch: "absolute"` makes a
  touch position the DOS cursor under the finger and tap as a left
  click, for mouse-driven games on phones.

### Phones and fullscreen

The runtime fits the picture into whatever container the page gives it
and re-lays out on resize, orientation change and fullscreen change
(`DosDisplay`, with `onLayout` for pages that position overlays). The
rest is the page's CSS, and the harness page is a worked example:

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  so the page may extend under notches, and `env(safe-area-inset-*)`
  on control positions so controls stay clear of them.
- `touch-action: none` and `user-select: none` on the play area and
  every control surface, `overscroll-behavior: none` on the body, so a
  drag plays the game instead of scrolling or pulling to refresh.
- One container that holds both the canvas and the overlaid controls,
  with `position: fixed; inset: 0` while playing. `deployment.fullscreen()`
  targets that container, so the controls stay visible in fullscreen.
- Controls in the lower corners, sized for thumbs, with a landscape
  media query for short screens.
- A touch on the picture positions the DOS cursor (`mouse.touch:
  "absolute"`), so mouse-driven games need no trackpad on a phone.

Serve the js-dos assets (`node_modules/emulators/dist/`) at
`/emulators/`, or pass your own `adapter` from
`JsDosEmulatorAdapter.init({ pathPrefix })`. For worker mode, serve the
page with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`; a page that is not
cross-origin isolated (plain http on a LAN) should use `mode: "direct"`.

## Deploy a game from a manifest

`manifests/` is the second way to make a game page, and the one that
builds to a standalone folder. You write two small files and point at
the game's files; the shared shell supplies the page, the menu, saves,
themes, screen modes and the touch keyboards. The format is specified
in `docs/deployment-manifest-spec.md`.

1. **Have the game's DOS files in a folder of their own**, anywhere on
   disk. The manifest names it by an absolute path, or by a path
   relative to the repo root such as `games/MyGame/` (ignore it, so
   game files are never committed).

2. **Write `manifests/<slug>/manifest.json`.** The slug is the folder
   name and the URL segment. A minimal manifest:

   ```json
   {
       "$schema": "../shell/manifest.schema.json",
       "metadata": { "slug": "mygame", "name": "My Game", "year": 1991, "genre": "RPG",
                     "status": { "verified": [] } },
       "load": { "source": "games/MyGame", "autoexec": ["GAME.EXE"] },
       "saves": { "key": "mygame", "method": "saves the game has written are kept" },
       "controls": { "touch": { "landscape": [{ "component": "keyboard", "region": "right" }],
                                "portrait": [{ "component": "keyboard" }] } }
   }
   ```

   `load.source` is the game folder, absolute or relative to the repo
   root, and `load.autoexec` the lines run after `mount c .` and `c:`. Optional
   parts: `load.stage` packs the folder under a directory inside C:,
   `load.overlay` places a repo file over the folder at pack time (a
   sound config, a clean progress file), `load.dosbox` changes machine,
   cycles, memory or aspect, `metadata.hints` lists prompts the player
   answers at every boot, `controls.keyboard` and `controls.mouse` set
   the input policy, and `controls.touch` places components (`dpad`,
   `key`, `keys`, `keyboard`, `letters`, `digits`, `fkeys`,
   `modifiers`) per orientation. The schema gives editors completion
   for all of it.

3. **Write `manifests/<slug>/main.ts`**, two lines, the same for every
   game:

   ```ts
   import { mount } from "../shell/shell.ts";
   void mount(new URL("./manifest.json", import.meta.url));
   ```

4. **Preview it.** `npm run pack-bundle -- <slug>` packs the game from
   the manifest, then `npm run harness -- 8787 0.0.0.0` serves it at
   `http://<host>:8787/manifests/<slug>/` (restart the harness after
   editing a manifest). `/manifests/` lists every manifest game.
   Record what you checked in `metadata.status.verified` (`boot`,
   `input`, `sound`, `save`).

5. **Build the standalone folder.** `npm run build-manifests -- <slug>`
   writes `dist/<slug>/`: the page, the bundled script, the validated
   manifest, `game.jsdos`, the font and the two js-dos files. `--out
   <dir>` puts it elsewhere. Everything inside is referenced
   relatively, so the folder works at any address.

6. **Host it.** Upload the folder to any static host. Serve it with
   `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` for the worker mode;
   without those headers the page runs in direct mode, which is slower
   but works, including over plain http on a LAN.

`npm run build-manifests -- --all --out <dir>` builds every manifest
into `<dir>/<slug>/` with an index at `<dir>/index.html`; `--base
<slug>=<url>` points the index at a game hosted elsewhere.
`npm run manifest-schema` rewrites the editor schema after a change to
the manifest types.

### From a project of your own

A deployments project keeps its games and manifests and installs this
package for the shell and the build; nothing is copied from here.

```
npm init -y
npm install github:mastergray/dos-game-runtime-ts
```

Lay it out as `games/<slug>/` for the files and `manifests/<slug>/`
for `manifest.json` and `main.ts`, with `main.ts` importing the shell
from the package:

```ts
import { mount } from "dos-game-runtime-ts/shell";
void mount(new URL("./manifest.json", import.meta.url));
```

and `"$schema": "../../node_modules/dos-game-runtime-ts/manifests/shell/manifest.schema.json"`
in each manifest for editor completion. Then:

```
npx dos-build-manifests --all          # dist/<slug>/ for every manifest, plus dist/index.html
npx dos-build-manifests <slug>         # one game
npx dos-serve-dir dist 8080            # a look at the result, with the isolation headers; 0.0.0.0 as a third argument serves the LAN
```

`--root <dir>` points the build at a project other than the current
directory, and `--runtime <dir>` bundles against a local checkout of
this repository instead of the installed package, which is how a
runtime change is tried on the deployments before it is published. Game folders in `load.source` resolve against the project
root, so the same manifests build anywhere the project is checked out.

Twelve games have manifests on the author's machine. Their folders
under `manifests/<slug>/` are ignored, like the game files, since they
are commercial titles used as local test material; the shell, the
schema and the build are what the repository carries. `docs/history.md`
records what was built against them.

## Game pages

`deployments/<name>/` is the first way to make a game page: a hand
copy of a page (`index.html`, `main.ts`) that imports the runtime from
`src/index.ts`, with the game packed as `tests/browser/harness/<name>.jsdos`.
The harness serves any such folder at `/<name>` with its `main.ts`
bundled, and `deployments/games/` as a static index at `/games`.
Each page is a text-mode-styled title screen, a corner menu
(fullscreen, touch controls, sound, restart, clear saves), the phone
layout, autosave, and the game's own controller map and quirks. The
folder is ignored: the author's eighteen pages are local, as the games
are, and nothing in the runtime knows they exist. Copy one to start
another game's page, or write a manifest instead (above), which is the
way that builds to a standalone folder.

## Develop

```
npm install
npx playwright install chromium
npm run pack-bundle -- <game dir> <dosbox.conf>        # packs tests/browser/harness/test.jsdos for the browser suite
npm run check        # type-check src and tests
npm test             # spec suite: Node, no browser
npm run test:browser # browser suite: Chromium through ctg-js-browser-test
npm run harness -- 8787   # serve the test harness page for manual play
```

On the harness page, "Boot test.jsdos" runs the test game with your
keyboard and mouse wired to it, and "Boot beep.jsdos" runs a tiny
PC-speaker program that beeps three times, which is the audio check.
The status line shows lifecycle state, audio unlock state, and how much
sound is queued. "Touch controls" shows a D-pad, two buttons and a
trackpad composed through `DosDeployment` for checking on a phone.
"Play mode" fills the screen with the game and overlaid controls (the
phone layout), "D-pad / stick" swaps the pad for an analog stick, and
"Fullscreen" asks the browser for fullscreen on that play area.
"Save game" stores the game's changed files under the bundle's key and
"Forget save" clears them; a game's own save command then survives a
reload.

The browser suite needs `tests/browser/harness/test.jsdos`, a DOS game
packed as a bundle (the author uses a 1990 strategy RPG). Game files
are not committed; the suite skips itself when the bundle or Chromium
is missing. Playwright is pinned to 1.62.0 because its Chromium build is
the one that installs on the development machine.

The probe that established how js-dos 8.4.2 behaves, and the facts the
adapter is built on, is in `docs/probes/js-dos-8.4.2/`.

## License

MIT
