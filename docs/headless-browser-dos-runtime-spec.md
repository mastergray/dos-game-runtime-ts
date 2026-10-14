# Headless Browser DOS Runtime — Implementation Spec

**Status:** draft implementation spec. Companion to
[headless-browser-dos-runtime-roadmap.md](./headless-browser-dos-runtime-roadmap.md),
which states *what* the runtime is and where its boundary lies. This
document states *how* it is built as a CTG TypeScript package under the
four style guides:

| Guide | Governs here |
|---|---|
| `scaffolding.md` | Package layout, build, tsconfigs, test tree, scripts |
| `code-style.md` | File structure, class organization, HM signatures, `types.ts` and predicates, where validation lives |
| `errors.md` | The one base error class, its code registry, its construction rules |
| `testing.md` | `ctg-js-test` pipelines, the runner, one suite per environment, doubles |

Browser-side tests use `ctg-js-browser-test`, the CTG pipeline framework
over Playwright, so the same runner, predicates and case shape apply in
both suites.

This is not a pipeline spec. There are no requirement IDs and no
per-class spec documents. Each class section below is written so a
person (or an agent) can implement the class and its tests from it,
with the style guides filling in everything left to convention.

Where this document departs from a guide, the departure is called out
inline under **Departure:**. There are three, all forced by the runtime
being browser code: the `DOM` lib is added to `tsconfig.json`, the
second suite is `browser` rather than `live` and runs its pipelines in
Chromium through `ctg-js-browser-test`, and one interface
(`EmulatorAdapter`) is a contract with no class behind it in the public
surface.

---

## 1. Package

### 1.1 Identity

| Field | Value |
|---|---|
| Package name | `dos-game-runtime-js` |
| Repository | `github.com/mastergray/dos-game-runtime-js` (personal repo; the CTG test frameworks are dependencies only) |
| Consumer | A *game deployment* (a page that owns its own HTML, layout, game files and control mappings), which imports the runtime from `dist/index.js` |
| Runtime environment | Evergreen browsers with WebAssembly, Pointer Events, `AudioContext`, `Gamepad` API, `requestAnimationFrame` |
| Test environment | Node ≥ 22.13 for the `spec` suite; Chromium through `ctg-js-browser-test` (Playwright) for the `browser` suite |
| Runtime dependency | `emulators` (the js-dos WASM emulator package), confined to one adapter class |
| Dev dependencies beyond the scaffold | `ctg-js-browser-test` v2.0.0, `playwright` 1.62.0, `esbuild` |
| Probed against | `emulators@8.4.2`, Chromium build 1234, a 1990 strategy RPG as the test program (§4.3, `docs/probes/js-dos-8.4.2/`) |

### 1.2 Layout

Exactly the `scaffolding.md` layout. Class folders are listed in
implementation order; each later class may import from earlier ones,
never the reverse.

```
dos-game-runtime-js/
    src/
        index.ts
        shared.types.ts
        DosRuntimeError/
        JsDosEmulatorAdapter/
        DosInput/
        DosDisplay/
        DosAudio/
        DosPlayer/
        KeyboardSource/
        MouseSource/
        Button/
        DPad/
        AnalogStick/
        Trackpad/
        InputMapper/
        GamepadSource/
        DosStorage/
    tests/
        run.ts
        support/
            fixtures.ts
            harness-server.ts
            FakeEmulatorAdapter.ts
            FakeEmulatorSession.ts
            FakeGamepadProvider.ts
            FakeScheduler.ts
            FakeTimer.ts
            FailingIndexedDB.ts
        spec/
            01-shared-types.test.ts
            02-dos-runtime-error.test.ts
            03-dos-input.test.ts
            04-display-layout.test.ts
            05-dpad-geometry.test.ts
            06-analog-stick-geometry.test.ts
            07-input-target.test.ts
            08-gamepad-source.test.ts
        browser/
            harness/
                index.html
                main.ts
                test.jsdos
            01-js-dos-adapter.test.ts
            02-dos-display.test.ts
            03-dos-audio.test.ts
            04-dos-player.test.ts
            05-keyboard-source.test.ts
            06-mouse-source.test.ts
            07-button.test.ts
            08-dpad.test.ts
            09-analog-stick.test.ts
            10-trackpad.test.ts
            11-input-mapper.test.ts
            12-dos-storage.test.ts
    scripts/
        clean-dist.mjs
        serve-harness.ts
    docs/
        headless-browser-dos-runtime-roadmap.md
        headless-browser-dos-runtime-spec.md
    package.json
    tsconfig.json
    tsconfig.package.json
    tsconfig.tests.json
    .gitignore
    LICENSE
    README.md
```

Test files are number-prefixed because the runner executes them in
lexical order and the order above matches the implementation order, so
a red run reads top to bottom as "what exists yet".

The split between the two suites is by one rule: **a test touches the
DOM, it is in `browser`.** A class whose constructor takes an element,
a canvas, a document, `AudioContext`, IndexedDB or the emulator is
tested in the browser, against the real thing. The `spec` suite holds
what has no DOM in it: predicates, the error class, `DosInput` over a
fake session, the pure geometry statics of the display and the
primitives, the `InputTarget` switch, and `GamepadSource`, whose
provider and scheduler are injected. Nothing in `spec` fakes a DOM
object.

### 1.3 Public surface

`src/index.ts` re-exports every class named in §1.2 as a named export,
and every type in `shared.types.ts` and in each class's `types.ts` with
`export type`. The predicates in `shared.types.ts` are exported as
values, since deployments call them. Nothing else is public. Deep
imports into `dist/` are unsupported.

### 1.4 `tsconfig.json`

The scaffold `tsconfig.json` verbatim, with one change:

```json
"lib": ["ES2022", "DOM", "DOM.Iterable"]
```

**Departure:** the scaffold omits `lib`, which defaults to the target's
ES lib only. This package references `HTMLCanvasElement`,
`PointerEvent`, `AudioContext`, `Gamepad` and friends in its types, so
the DOM lib is required. `types` stays `["node"]` so the tests, which
run in Node, still type-check; the classes never touch a DOM global at
module load or in a constructor (see §1.6), which is what keeps the
`spec` suite runnable under Node.

`tsconfig.package.json` and `tsconfig.tests.json` are the scaffold
files unchanged, inheriting the `lib` change.

### 1.5 `package.json`

The scaffold `package.json` with the placeholders filled and these
additions:

```json
"dependencies": {
    "emulators": "8.4.2"
},
"devDependencies": {
    "ctg-js-browser-test": "github:claymoretechgroup/ctg-js-browser-test#v2.0.0",
    "playwright": "1.62.0",
    "esbuild": "<pinned version>"
},
"scripts": {
    "test:browser": "node --import tsx tests/run.ts browser",
    "test:all": "node --import tsx tests/run.ts spec browser",
    "harness": "node --import tsx scripts/serve-harness.ts"
}
```

`ctg-js-browser-test` v2.0.0 resolves `ctg-js-test` v4.0.0, the same
tag the scaffold pins, so one copy is installed. After `npm install`,
`npx playwright install chromium` fetches the browser; the `browser`
suite skips itself when that has not been done (§1.7).

Playwright is pinned to 1.62.0 for two reasons. Its Chromium build
(1234) is already cached on the development machine, and Playwright
1.63 and later refuse to install Chromium on Ubuntu 20.04, which is
what that machine runs. `emulators` is pinned to the probed version;
a bump re-runs the probe in §4.3.

`emulators` is the only runtime dependency, and only
`JsDosEmulatorAdapter` imports it. A grep for `from "emulators"` across
`src/` must return exactly that one folder. That is the whole of the
roadmap's "keep js-dos behind an adapter" rule, expressed mechanically.

### 1.6 Injected-environment rule

Every class in this package obeys one rule beyond the code style:

> A constructor receives every browser object it needs as part of its
> config and never reads a global (`window`, `document`, `navigator`,
> `requestAnimationFrame`, `AudioContext`, `indexedDB`). Anything the
> class would normally reach for on `globalThis` is a config field with
> an interface type declared in `shared.types.ts`, and the `init`
> factory is where the real browser object is defaulted in.

So `new DosDisplay({ canvas, container, resizeObserver })` takes an
object satisfying `ResizeObserverLike`; `DosDisplay.init({ canvas,
container })` fills `resizeObserver` from `globalThis.ResizeObserver`
when it exists. This is the code style's "`init` supplies defaults and
normalization; the constructor validates" applied to the browser.

The rule is not there to let DOM classes run in Node; they are tested
in a browser. It is there so a browser test can hand a class a
**scripted** collaborator where the real one is uncontrollable or
slow: a `FakeEmulatorSession` instead of js-dos, a `FakeTimer` instead
of a 400 ms wait, a `FailingIndexedDB` to provoke `STORAGE_FAILED`.
The DOM parts (elements, events, canvas, pointer capture, fullscreen,
real IndexedDB) are always real in those tests. It also keeps module
load side-effect free, so `import` of the package never throws in a
non-browser environment such as the `spec` suite or a server-side
build step.

### 1.7 Test suites

**`spec`** runs under Node and is what `npm test` runs. It holds the
DOM-free logic listed in §1.2 and uses `CTGTest` from `ctg-js-test`
exactly as `testing.md` describes.

**`browser`** runs each case's pipeline inside Chromium through
`ctg-js-browser-test`. It covers every class that owns a DOM object,
plus `JsDosEmulatorAdapter` against the real `emulators` package.

**Departure:** `testing.md` names the second suite `live` and assumes
it runs under Node against an external process. Here the suite is
named `browser`, `VALID_SUITES` in `run.ts` is `["spec", "browser"]`
(the one edit the guide allows), and the pipeline is a
`CTGBrowserTest` whose subject is the harness URL. Nothing else about
the runner or the case shape changes: `BrowserTestState` extends
`CTGTestState`, so `run` returns it and the runner reads `status` as
usual.

A `browser` test file:

```ts
// realizes: docs/headless-browser-dos-runtime-spec.md > §12 Button

// Dependencies:
import CTGBrowserTest, { CTGTestPredicates as P } from "ctg-js-browser-test";  // Browser pipeline and predicate builders
import { browserSkipReason, withHarness } from "../support/fixtures.ts";       // Environment check; harness server per case

// Type dependencies:
import type { TestFile } from "../run.ts";                                     // Manifest contract consumed by the runner

const testFile: TestFile = {
    label: "Button",
    skip: await browserSkipReason(),
    cases: [
        {
            label: "press on the first pointerdown, release when the last pointer is gone",
            run: () => withHarness((url) => CTGBrowserTest.init("button press/release")
                .interact("mount a Button on #surface and record its events", async ({ page }) => {
                    await page.evaluate(() => window.harness.mount("Button", "#surface"));
                })
                .interact("two fingers down, first lifts, second lifts", async ({ page }) => {
                    await page.evaluate(() => {
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 1, pointerType: "touch" });
                        window.harness.pointer("#surface", "pointerdown", { pointerId: 2, pointerType: "touch" });
                        window.harness.pointer("#surface", "pointerup",   { pointerId: 1, pointerType: "touch" });
                        window.harness.pointer("#surface", "pointerup",   { pointerId: 2, pointerType: "touch" });
                    });
                })
                .assertPage("one press, one release, in that order",
                    (page) => page.evaluate(() => window.harness.events()),
                    P.equals([{ type: "press", pointerId: 1 }, { type: "release", pointerId: 2 }]))
                .start(url, { timeout: 30000 }))
        }
    ]
};

export default testFile;
```

The pieces:

- **`browserSkipReason()`** in `support/fixtures.ts` returns
  `undefined` when `playwright` resolves and a Chromium executable
  exists, otherwise a reason string. The manifest's `skip` field takes
  it directly, so the file is reported skipped rather than failed on a
  machine without a browser. Top-level `await` is fine: the runner
  imports each file dynamically.
- **`withHarness(fn)`** in `support/fixtures.ts` starts the harness
  server from `support/harness-server.ts` on port `0`, calls `fn(url)`,
  and stops the server in a `finally`. One server and one browser per
  case, so a case releases what it acquires and a failed case cannot
  poison the next.
- **`support/harness-server.ts`** is a plain `node:http` server. It
  bundles `src/index.ts` and `tests/browser/harness/main.ts` with
  `esbuild` in memory on startup and serves the result at
  `/harness.js`; serves `tests/browser/harness/index.html` at `/`;
  serves `node_modules/emulators/dist/` at `/emulators/` with
  `application/wasm` for `.wasm`; and sets
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` on every response so
  js-dos's worker mode can use `SharedArrayBuffer`. Tests therefore
  exercise `src/`, never `dist/`, as `scaffolding.md` requires.
- **`tests/browser/harness/`** is the page. `index.html` has a
  `<canvas id="canvas">`, a `<div id="container">`, and a
  `<div id="surface">` sized 200×200 with `touch-action: none`.
  `main.ts` imports the package from `../../../src/index.ts` and the
  doubles from `../../support/`, and assigns `window.harness`:

  | Member | Does |
  |---|---|
  | `runtime` | The package's public surface, so a test can construct any class in-page |
  | `doubles` | `FakeEmulatorSession`, `FakeEmulatorAdapter`, `FakeTimer`, `FakeScheduler`, `FailingIndexedDB` constructors |
  | `mount(className, selector, config?)` | Constructs the named primitive or source on the element, subscribes a recorder to every event it emits, returns nothing |
  | `pointer(selector, type, fields)` | Dispatches a real `PointerEvent` of `type` on the element with `fields` merged over defaults (`isPrimary`, `bubbles`, `clientX/Y` at the element's center) |
  | `key(selector, type, code)` | Dispatches a real `KeyboardEvent` |
  | `events()` | The recorder's array of `{ type, ...detail }`, plain data |
  | `session()` | The `FakeEmulatorSession` the mounted object was given, exposing `calls` |
  | `boot(config?)` | `DosPlayer.init` with the test bundle and real adapter; resolves with the status |
  | `reset()` | Destroys whatever is mounted and clears the recorder |

  Everything the harness returns through `page.evaluate` is plain JSON
  so `P.equals` compares it.
- **Real input where it matters.** Synthetic `PointerEvent`s exercise
  the primitives' logic with exact control of pointer ids and
  coordinates, including multi-touch. A few cases also use
  Playwright's own input (`page.mouse`, `page.keyboard`) so at least
  one path per source is driven by the browser's real event generation
  rather than a constructed event. Real touch goes through the
  `realTap` fixture, which sends a `touchStart`/`touchEnd` pair over
  the DevTools protocol: `ctg-js-browser-test` creates its context
  without `hasTouch`, so `page.touchscreen.tap` refuses.
  Chromium refuses `setPointerCapture` for a pointer id it did not
  create, which is why §11 requires the primitives to tolerate a
  capture failure.
- **`test.jsdos`** is the test game (a 1990 strategy RPG) packed as a
  js-dos bundle: its four game files plus `.jsdos/dosbox.conf`
  (shaped like `docs/probes/js-dos-8.4.2/example-dosbox.conf`, with an
  autoexec that runs the game's launcher so its copy-protection prompt
  accepts a bare Enter) and
  `.jsdos/jsdos.json` holding `{"version":"8"}`. It is a commercial
  game, so it is **not committed**: `tests/browser/harness/test.jsdos`
  is git-ignored and built by `scripts/pack-bundle.ts` from a local
  directory of game files given on argv. `browserSkipReason()` also
  reports the bundle as missing when it is absent, so the suite skips
  cleanly on a machine without the game. The probe showed the test game
  boots to its credits screen in under a second and advances on Enter,
  which makes it a good smoke test: it renders at 320×200, plays sound
  from the first frame, and takes keyboard input immediately.

Cases that start js-dos pass a longer `timeout` to `start` (60 s); the
rest use the framework default of 30 s. `headless` stays `true`
everywhere; `npm run harness` is how a person watches the page.

### 1.8 Scripts

| Script | Purpose |
|---|---|
| `clean-dist.mjs` | Scaffold file, unchanged |
| `serve-harness.ts` | Starts `tests/support/harness-server.ts` on a fixed port for manual play and phone testing. Takes the port from argv or `PORT`, prints a usage line and throws when neither is given, installs `SIGINT`/`SIGTERM` handlers, prints the URL. The only script that imports from `tests/`; it is a convenience over the test fixture, not a second server. |

---

## 2. Shared Types (`src/shared.types.ts`)

Types and predicates more than one class uses. Implemented first.

### 2.1 Declarations

```ts
type NonEmptyString = string;
type FiniteNumber = number;
type KeyCode = string;
type MouseButton = "left" | "middle" | "right";
type JoystickButton = 0 | 1 | 2 | 3;
type JoystickAxis = "x" | "y";
type Unsubscribe = () => void;
type Listener<T> = (event: T) => void;

interface Vector2 {
    readonly x: FiniteNumber;
    readonly y: FiniteNumber;
}

interface Rect {
    readonly left: FiniteNumber;
    readonly top: FiniteNumber;
    readonly width: FiniteNumber;
    readonly height: FiniteNumber;
}

interface PointerEventLike {
    readonly type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture";
    readonly pointerId: number;
    readonly pointerType: "mouse" | "touch" | "pen";
    readonly clientX: FiniteNumber;
    readonly clientY: FiniteNumber;
    readonly button: number;
    readonly buttons: number;
    readonly timeStamp: FiniteNumber;
    preventDefault(): void;
}

interface InputSurface {
    addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
    removeEventListener(type: string, listener: (event: Event) => void, options?: EventListenerOptions): void;
    getBoundingClientRect(): Rect;
    setPointerCapture?(pointerId: number): void;
    releasePointerCapture?(pointerId: number): void;
}

interface FrameScheduler {
    request(callback: (time: FiniteNumber) => void): number;
    cancel(handle: number): void;
}

interface TimerLike {
    setTimeout(callback: () => void, ms: FiniteNumber): number;
    clearTimeout(handle: number): void;
}

interface EmulatorSession {
    readonly soundFrequency: number;
    sendKey(code: KeyCode, pressed: boolean): void;
    sendMouseMotion(dx: FiniteNumber, dy: FiniteNumber): void;
    sendMousePosition(x: FiniteNumber, y: FiniteNumber): void;
    sendMouseButton(button: MouseButton, pressed: boolean): void;
    sendJoystickButton(button: JoystickButton, pressed: boolean): void;
    sendJoystickAxis(axis: JoystickAxis, value: FiniteNumber): void;
    pause(): void;
    resume(): void;
    persist(): Promise<Uint8Array | null>;
    exit(): Promise<void>;
    onFrame(listener: Listener<FrameEvent>): Unsubscribe;
    onSound(listener: Listener<Float32Array>): Unsubscribe;
    onExit(listener: Listener<void>): Unsubscribe;
}

interface FrameEvent {
    readonly width: number;
    readonly height: number;
    readonly rgba: Uint8ClampedArray;
}

interface EmulatorAdapter {
    readonly type: NonEmptyString;
    start(config: EmulatorStartConfig): Promise<EmulatorSession>;
}

interface EmulatorStartConfig {
    readonly bundle: Uint8Array;
    readonly changes?: Uint8Array;
}

function isNonEmptyString(value: unknown): value is NonEmptyString;
function isFiniteNumber(value: unknown): value is FiniteNumber;
function isKeyCode(value: unknown): value is KeyCode;
function isMouseButton(value: unknown): value is MouseButton;
function isJoystickButton(value: unknown): value is JoystickButton;
function isJoystickAxis(value: unknown): value is JoystickAxis;
function isVector2(value: unknown): value is Vector2;
function isRect(value: unknown): value is Rect;
function isPointerEventLike(value: unknown): value is PointerEventLike;
function isInputSurface(value: unknown): value is InputSurface;
function isFrameScheduler(value: unknown): value is FrameScheduler;
function isTimerLike(value: unknown): value is TimerLike;
function isEmulatorSession(value: unknown): value is EmulatorSession;
function isEmulatorAdapter(value: unknown): value is EmulatorAdapter;
function isEmulatorStartConfig(value: unknown): value is EmulatorStartConfig;
```

### 2.2 Meaning

- **`KeyCode`** is a DOM `KeyboardEvent.code` value (`"ArrowUp"`,
  `"ControlLeft"`, `"KeyA"`). The whole package speaks this vocabulary;
  translating it to DOSBox scancodes is the adapter's job and nobody
  else's. `isKeyCode` accepts a non-empty string of ASCII letters and
  digits only; it does not check against a table, because the table is
  adapter-specific and an unknown code is the adapter's
  `UNSUPPORTED_KEY` error, not a shape error.
- **`MouseButton`** and **`JoystickButton`/`JoystickAxis`** are closed
  literal sets; their predicates check membership.
- **`PointerEventLike`** is the subset of `PointerEvent` the primitives
  read, declared so the primitives' code names exactly what it depends
  on. Real `PointerEvent` instances satisfy it structurally; tests
  always dispatch real ones.
- **`InputSurface`** is what a primitive attaches to: a DOM element.
  Pointer capture methods are optional because an old browser may lack
  them; a primitive that wants capture calls them only when present and
  tolerates a throw (§11).
- **`FrameScheduler`** wraps `requestAnimationFrame`/`cancelAnimationFrame`.
  `GamepadSource` polls through it; tests drive it by hand.
- **`TimerLike`** wraps `setTimeout`/`clearTimeout`. `Button` and
  `Trackpad` time their hold gestures through it; `init` defaults it to
  the globals, and tests pass `FakeTimer` so no case waits on a clock.
- **Two mouse primitives.** `sendMouseMotion` is a relative delta,
  for a locked pointer, a trackpad or a gamepad stick. `sendMousePosition`
  is an absolute position normalized to `0..1` across the emulator's
  screen, for an unlocked pointer over the canvas, where it pins the
  DOS cursor under the physical one exactly; the probe (§4.3) showed
  `0.1, 0.1` lands the cursor at pixel `32, 20` of a 320×200 screen.
  The roadmap prefers relative deltas as the primitive; both are needed
  because DOSBox scales relative motion, so an unlocked pointer can
  never track by deltas alone.
- **`EmulatorSession`** and **`EmulatorAdapter`** are the replacement
  boundary from roadmap §5 and §21. `DosPlayer` and `DosInput` talk only
  to these two interfaces. Swapping js-dos for direct DOSBox WASM means
  writing a second class that satisfies `EmulatorAdapter`; nothing
  above it changes. The session's shape follows what the probe (§4.3)
  showed the emulator actually provides: `pause`/`resume` are
  synchronous, `persist` yields `null` when nothing changed and
  otherwise an overlay of changed files, sound arrives as
  `Float32Array` sample pushes at `soundFrequency` and the session does
  no audio playback of its own, and `start` takes an optional
  `changes` overlay from a previous `persist` to restore saves. There
  is no canvas in `EmulatorStartConfig`: the emulator hands frames to
  the session and `DosDisplay` draws them.
- **`isEmulatorSession`** and **`isEmulatorAdapter`** are structural:
  every method named in the interface is `typeof "function"`, and
  `type` is a non-empty string. That is enough for a constructor to
  reject a wrong object; it does not prove behavior.

### 2.3 Tests (`01-shared-types.test.ts`)

One case per predicate: one input meeting every condition, then one
input per condition violating only it. `isFiniteNumber` is cased with
`0`, `-1.5`, `NaN`, `Infinity`, `"1"`. `isKeyCode` is cased with
`"ArrowUp"`, `""`, `"Arrow Up"`, `"Arrow-Up"`. `isEmulatorSession` is
cased with `FakeEmulatorSession` accepted and with an object missing
exactly one method rejected, one case per method.

---

## 3. `DosRuntimeError`

The package's one error class, shaped exactly as `errors.md` prescribes.
No subclasses: nothing in this package has an HTTP status or another
consumer-specific field to carry.

### 3.1 Declarations

```ts
// DosRuntimeError/types.ts
interface DosRuntimeErrorConfig {
    readonly code: number;
    readonly message: NonEmptyString;
    readonly data?: unknown;
}
function isDosRuntimeErrorConfig(value: unknown): value is DosRuntimeErrorConfig;

// DosRuntimeError/DosRuntimeError.ts
class DosRuntimeError extends Error {
    static readonly CODE: {
        readonly INVALID_CODE: -1;
        readonly INVALID_CONFIG: 1;
        readonly INVALID_MESSAGE: 2;
        readonly INTERNAL_ERROR: 3;
        readonly ADAPTER_FAILED: 4;
        readonly BUNDLE_LOAD_FAILED: 5;
        readonly NOT_STARTED: 6;
        readonly ALREADY_STARTED: 7;
        readonly DESTROYED: 8;
        readonly UNSUPPORTED_KEY: 9;
        readonly FULLSCREEN_FAILED: 10;
        readonly AUDIO_FAILED: 11;
        readonly STORAGE_FAILED: 12;
        readonly UNSUPPORTED: 13;
    };

    readonly code: number;
    readonly data: unknown;
    declare readonly message: NonEmptyString;

    constructor(config: DosRuntimeErrorConfig);

    get label(): string;

    static init<T extends DosRuntimeError, C>(this: new (config: C) => T, config: C): T;
    static is(value: unknown): value is DosRuntimeError;
    static labelOf(code: number): string;
}
```

### 3.2 Codes

| Code | Raised by | When |
|---|---|---|
| `INVALID_CODE` / -1 | constructor | Config is not an object with a numeric `code`, or `code` is `-1` or unregistered |
| `INVALID_CONFIG` / 1 | every constructor and setter | A config or setter value fails its predicate; `data` is the rejected value |
| `INVALID_MESSAGE` / 2 | constructor | `message` is not a non-empty string |
| `INTERNAL_ERROR` / 3 | any | A state the class believed impossible; `data` is the caught value when there is one |
| `ADAPTER_FAILED` / 4 | `JsDosEmulatorAdapter`, `DosPlayer` | The emulator library threw or rejected; `data` is the caught value |
| `BUNDLE_LOAD_FAILED` / 5 | `DosPlayer` | The bundle URL could not be fetched or was not an OK response; `data` is the status or caught value |
| `NOT_STARTED` / 6 | `DosPlayer`, `DosInput` | An operation needing a session was called before `start()` resolved |
| `ALREADY_STARTED` / 7 | `DosPlayer` | `start()` called while started or starting |
| `DESTROYED` / 8 | `DosPlayer`, `DosInput` | Any operation after `destroy()` |
| `UNSUPPORTED_KEY` / 9 | `JsDosEmulatorAdapter` | A `KeyCode` the adapter's table does not map |
| `FULLSCREEN_FAILED` / 10 | `DosDisplay` | `requestFullscreen` rejected; `data` is the caught value |
| `AUDIO_FAILED` / 11 | `DosAudio` | The `AudioContext` could not be resumed or a playback node could not be created; `data` is the caught value |
| `STORAGE_FAILED` / 12 | `DosStorage` | IndexedDB open, read or write failed; `data` is the caught value |
| `UNSUPPORTED` / 13 | `DosStorage`, `DosDisplay` | The browser lacks a required API (no IndexedDB, no fullscreen) |

Construction behavior, the `-1` sentinel, the prototype rule for thrown
construction errors, `data` defaulting to `null`, and `init`
constructing with the receiving class are exactly as `errors.md`
states and are not restated.

### 3.3 Tests (`02-dos-runtime-error.test.ts`)

The `errors.md` review checklist, as cases: registry equality against
the full fourteen-entry literal; boundaries `0` and `14` rejected, `1`
and `13` accepted; `INVALID_MESSAGE` for `""`, `"  "`, absent,
`undefined`; `INVALID_CODE` with `data` the rejected number for `-1`,
`0`, `NaN`; the prototype of a thrown construction error is
`DosRuntimeError.prototype` even when constructing a test-local
subclass; `data` stored by reference; `is` accepts instances and thrown
construction errors and rejects a plain `Error`; `labelOf` round-trips
every entry.

`support/fixtures.ts` exports `thrownBy(fn)` and `rejectedBy(promise)`
which return the thrown or rejected value, or `undefined` when nothing
was thrown. Every later test file uses them.

---

## 4. `JsDosEmulatorAdapter`

The only class that imports `emulators`. Implements `EmulatorAdapter`
by wrapping js-dos's `CommandInterface` in an `EmulatorSession`.

### 4.1 Declarations

```ts
// JsDosEmulatorAdapter/types.ts
type JsDosBackend = "dosbox" | "dosbox-x";
type JsDosMode = "direct" | "worker";

interface JsDosEmulatorAdapterConfig {
    readonly emulators: JsDosEmulators;
    readonly pathPrefix: NonEmptyString;
    readonly backend?: JsDosBackend;
    readonly mode?: JsDosMode;
}

// The members of `emulators@8.4.2`'s `Emulators` object that the adapter calls,
// as that version declares them (dist/types/emulators.d.ts), probed in §4.3.
interface JsDosEmulators {
    pathPrefix: string;
    readonly version: string;
    dosboxDirect(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;
    dosboxWorker(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;
    dosboxXDirect(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;
    dosboxXWorker(init: JsDosInitFs, options?: JsDosBackendOptions): Promise<JsDosCommandInterface>;
}

type JsDosInitFs = Uint8Array | ReadonlyArray<Uint8Array>;

interface JsDosBackendOptions {
    readonly audioWorklet?: boolean;
}

// The members of `CommandInterface` the session calls, as 8.4.2 declares them.
interface JsDosCommandInterface {
    width(): number;
    height(): number;
    soundFrequency(): number;
    pause(): void;
    resume(): void;
    exit(): Promise<void>;
    sendKeyEvent(keyCode: number, pressed: boolean): void;
    sendMouseRelativeMotion(x: number, y: number): void;
    sendMouseButton(button: number, pressed: boolean): void;
    persist(onlyChanges?: boolean): Promise<Uint8Array | null>;
    events(): JsDosEvents;
}

interface JsDosEvents {
    onFrameSize(consumer: (width: number, height: number) => void): void;
    onFrame(consumer: (rgb: Uint8Array | null, rgba: Uint8Array | null) => void): void;
    onSoundPush(consumer: (samples: Float32Array) => void): void;
    onExit(consumer: () => void): void;
}

function isJsDosBackend(value: unknown): value is JsDosBackend;
function isJsDosMode(value: unknown): value is JsDosMode;
function isJsDosEmulators(value: unknown): value is JsDosEmulators;
function isJsDosCommandInterface(value: unknown): value is JsDosCommandInterface;
function isJsDosEmulatorAdapterConfig(value: unknown): value is JsDosEmulatorAdapterConfig;

// JsDosEmulatorAdapter/JsDosEmulatorAdapter.ts
class JsDosEmulatorAdapter implements EmulatorAdapter {
    static readonly DEFAULT_BACKEND: JsDosBackend;      // "dosbox"
    static readonly DEFAULT_MODE: JsDosMode;            // "worker"
    static readonly KEY_MAP: Readonly<Record<KeyCode, number>>;
    static readonly MOUSE_BUTTON_MAP: Readonly<Record<MouseButton, number>>;

    readonly type: NonEmptyString;                      // "js-dos"

    constructor(config: JsDosEmulatorAdapterConfig);

    get backend(): JsDosBackend;
    get mode(): JsDosMode;
    get pathPrefix(): NonEmptyString;

    start(config: EmulatorStartConfig): Promise<EmulatorSession>;

    static init(config: Omit<JsDosEmulatorAdapterConfig, "emulators"> & { emulators?: JsDosEmulators }): Promise<JsDosEmulatorAdapter>;
}
```

### 4.2 Behavior

Every bullet here states probed behavior of `emulators@8.4.2` (§4.3)
unless marked **unprobed**.

- **Construction.** The constructor validates with
  `isJsDosEmulatorAdapterConfig` and throws `INVALID_CONFIG` on failure.
  `emulators` is injected so the class is constructible with a fake;
  `init` is `async` because it is the one place `import("emulators")`
  happens. `pathPrefix` is required: the package's `emulators.js` loads
  `wdosbox.js` and `wdosbox.wasm` from `pathPrefix + name`, so the
  deployment must serve `node_modules/emulators/dist/` somewhere and
  say where. `init` sets `emulators.pathPrefix` from it.
- **`start`.** Validates with `isEmulatorStartConfig` (throws
  `INVALID_CONFIG`). Selects the entry point from `backend` and `mode`
  (`dosbox`+`worker` is `dosboxWorker`, and so on), builds the init
  value as `[bundle]` or `[bundle, changes]`, and awaits it with
  `{ audioWorklet: false }`. **Every byte array is copied with
  `slice()` before being passed.** Worker mode transfers the
  `ArrayBuffer` to the worker and detaches it; a second start with the
  caller's original array fails with a `DataCloneError` inside js-dos
  and never resolves. Any throw or rejection from the library is caught
  and rethrown as `ADAPTER_FAILED` with the caught value as `data`.
  Startup from bytes-in-hand to a usable command interface took about
  110–130 ms in both modes.
- **Bundle format.** A bundle is a zip whose root holds the DOS files
  plus `.jsdos/dosbox.conf` and `.jsdos/jsdos.json` (`{"version":"8"}`).
  The `[autoexec]` section of `dosbox.conf` is what runs the game
  (`mount c .` / `c:` / `GAME.EXE`). The adapter does not rewrite it;
  which program runs is the bundle author's decision, which is the
  deployment's. (js-dos also accepts a list of `{ path, contents }`
  entries plus a config object in place of a zip; probed working, not
  used by this package, noted for a future "no zip" option.)
- **Session `sendKey`.** Looks `code` up in `KEY_MAP`; throws
  `UNSUPPORTED_KEY` with `data` the code when absent; otherwise calls
  `sendKeyEvent(mapped, pressed)`. The check is the adapter's because
  js-dos accepts any number silently: `sendKeyEvent(99999, true)` did
  not throw. `KEY_MAP` maps DOM `code` values to the GLFW-style codes
  js-dos uses (extracted from `js-dos@8.4.1` and saved in
  `docs/probes/js-dos-8.4.2/keycodes.json`): letters and digits are
  their ASCII values, `Enter` 257, `Escape` 256, `Tab` 258, `Backspace`
  259, `Delete` 261, arrows `Right`/`Left`/`Down`/`Up` 262–265,
  `F1`–`F12` 290–301, `ShiftLeft` 340, `ControlLeft` 341, `AltLeft` 342,
  right-hand modifiers 344–346, numpad 320–335. `sendKeyEvent(257)`
  advanced the test game from its credits to character select, which is
  the probe's proof that the table and the injection path work.
- **Session `sendMouseMotion`.** Forwards deltas to
  `sendMouseRelativeMotion`, which exists and accepts them. Relative
  motion is the primitive (roadmap §8); the adapter never sends
  absolute coordinates. Probed with a mouse-driven strategy game: injected
  motion moved its menu cursor, at roughly half the injected distance
  in 320×200 screen pixels because DOSBox scales relative motion, so a
  deployment's `sensitivity` is the place to compensate.
- **Session `sendMousePosition`.** Forwards to js-dos's absolute
  `sendMouseMotion(x, y)`, whose arguments are normalized `0..1`
  (js-dos's own player uses it this way for an unlocked pointer).
  Probed: exact placement on the strategy game's menu and a following click
  selected the entry under it.
- **Session `sendMouseButton`.** Maps through `MOUSE_BUTTON_MAP`
  (`left` 0, `right` 1, `middle` 2, DOSBox's SDL numbering) and
  forwards. Probed: a left press and release on a the strategy game menu
  entry selected it.
- **Session `sendJoystickButton` / `sendJoystickAxis`.** Throw
  `UNSUPPORTED`. `emulators@8.4.2`'s `CommandInterface` has no joystick
  method. Roadmap Milestone 10 therefore maps gamepads to keyboard
  input under this adapter; DOS joystick input waits for a backend
  that exposes it.
- **Session `onFrame`.** js-dos delivers frames as `rgb` (`Uint8Array`,
  `width × height × 3`) with `rgba` `null`, in both modes. The session
  keeps the latest size from `onFrameSize`, converts each `rgb` frame
  into a reused `Uint8ClampedArray` of `width × height × 4` with alpha
  255 (reallocated when the size changes), and emits a `FrameEvent`.
  The first frames arrive at 640×400 (the BIOS text mode) before
  `onFrameSize` reports the game's 320×200, and `onFrameSize` is not
  always fired at all: the strategy game's 640×400 setup screens never
  announce a size in either mode. So when the announced size is unset
  or disagrees with a frame's length, the session re-reads
  `width()`/`height()` from the command interface and accepts the
  frame when they match; a frame that matches neither is skipped. Because `events().onFrame` has no unsubscribe, the
  session keeps its own listener set behind one library listener. About
  three frames per second arrived while the title screen was static:
  js-dos emits frames on change, not on a clock, so a consumer must not
  assume a steady rate.
- **Session `onSound`.** Subscribes to `onSoundPush` the same way.
  Samples are `Float32Array`, delivered continuously from boot (about
  100 pushes per second), mono at `soundFrequency()` = 44100. With
  `audioWorklet: false` js-dos creates no `AudioContext`; playing the
  samples is `DosAudio`'s job (§7). `audioWorklet: true` is not used:
  it makes js-dos create its own context, stops `onSoundPush`, and
  exposes no handle to resume that context after a user gesture.
- **Session `pause`/`resume`.** Forwarded, synchronous. No frames
  arrive while paused; frames and input resume after `resume`.
- **Session `persist`.** Forwarded. Returns `null` when no file has
  changed since start, and otherwise a small zip holding only the
  changed files (119 bytes for one 3-byte file), regardless of the
  `onlyChanges` flag. The overlay is cumulative against the base
  bundle: after restoring with `[bundle, overlay]`, `persist()` reports
  the same files again. Restore was probed: a file written, persisted,
  the session exited, and a new session started with `[bundle,
  overlay]` read the file back byte for byte.
- **Session `exit`.** Forwarded. `onExit` fires. After it, js-dos's
  methods still do not throw, so the session tracks its own exited
  state and throws `DESTROYED` from every method afterwards.
- **Not used.** `getRunningProgram()` returns a promise in worker mode
  and `null` in direct mode; `simulateKeyPress`, `sendMouseMotion`
  (absolute), `screenshot`, `fsTree`, `fsReadFile`, `fsWriteFile` and
  the network methods exist and are not part of the session. `fsWriteFile`
  and `fsReadFile` were used by the probe to provoke a change and are
  the natural basis for a later "import a save file" feature.

### 4.3 Probe record

Run on 2026-09-24. Scripts, raw results and screenshots are in
`docs/probes/js-dos-8.4.2/`.

| Item | Value |
|---|---|
| Emulator | `emulators@8.4.2` (`version` string `8.4.2 (7fb80db8…)`), a browserify bundle that assigns `window.emulators` and also exports for CommonJS |
| Key table source | `js-dos@8.4.1` `dist/js-dos.js`, which maps DOM `keyCode` + `location` to the codes; this package maps from DOM `code` instead |
| Browser | Chromium build 1234 (Playwright's cache), headless, launched by Playwright 1.63.0 with `executablePath`; `--autoplay-policy=no-user-gesture-required` for the audio probe only |
| Server | `node:http` on loopback with `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `application/wasm`; `crossOriginIsolated` was `true`. Worker mode was probed only under these headers |
| Test program | the test game, four files, 691 KB packed |
| Modes probed | `dosboxWorker` and `dosboxDirect`; identical results except `getRunningProgram` |
| Boot | 108–128 ms to command interface; 18 frames in the first ~5 s; credits screen rendered with 61,549 of 64,000 pixels non-black |
| Sound | 423 pushes in ~5 s, `Float32Array`, 44100 Hz |
| Input | `sendKeyEvent(257)` advanced the game; unknown code accepted silently; `sendMouseRelativeMotion` moved the strategy game's cursor and `sendMouseButton(0)` selected a menu entry |
| Persist | `null` at boot; 119-byte overlay after one file write; restore via `[bundle, overlay]` verified |
| Detachment | Second start with the same `Uint8Array` fails in worker mode: `DataCloneError … ArrayBuffer at index 0 is already detached` |
| Exit | `onExit` fires; methods do not throw afterwards |
| Not present | Joystick API; a handle to js-dos's own `AudioContext` |

A bump of `emulators` re-runs these scripts and updates this table and
§4.2 before the adapter is changed.

### 4.4 Tests

**`spec`:** none. The adapter's value is in calling a real library,
and a fake of js-dos would test the fake. `FakeEmulatorAdapter` in
`support/` is a double of the `EmulatorAdapter` *contract*, not of
js-dos, and is what `DosPlayer`'s browser cases use.

**`browser/01-js-dos-adapter.test.ts`:** every case runs in-page
through `window.harness.runtime.JsDosEmulatorAdapter`. Constructor
`INVALID_CONFIG` rejection per config field; `KEY_MAP` spot checks
(`"ArrowUp"`, `"ControlLeft"`, `"Numpad5"` present; `"Bogus"` absent);
`init()` resolves; `start()` with `test.jsdos` resolves to a session;
`onFrame` fires at least once within the timeout and the frame's
`width`/`height` are positive; `sendKey("Enter", true)` then `false`
does not throw; `sendKey("Bogus", true)` throws `UNSUPPORTED_KEY`;
`persist()` resolves to `null` before any change (the non-null case
and the overlay restore have no public trigger yet, since nothing in
the package writes a DOS file; they are the Milestone 9 manual check
until a file-import feature gives the tests a handle);
`sendJoystickButton(0, true)` throws `UNSUPPORTED`;
`exit()` resolves and afterwards `sendKey` throws `DESTROYED`; starting
twice from the same kept `Uint8Array` succeeds both times, which is
the detachment guard. These cases pass `timeout: 60000` to `start`.

---

## 5. `DosInput`

The runtime's input API (roadmap §7, §8, §20). Every input source —
physical keyboard, virtual button, trackpad, gamepad mapper — ends
here. It knows nothing about pointers or DOM; it holds a session and
tracks what is currently held so it can release everything on demand.

### 5.1 Declarations

```ts
// DosInput/types.ts
interface DosInputConfig {
    readonly session: EmulatorSession;
}

interface DosInputSnapshot {
    readonly keysDown: ReadonlyArray<KeyCode>;
    readonly mouseButtonsDown: ReadonlyArray<MouseButton>;
    readonly joystickButtonsDown: ReadonlyArray<JoystickButton>;
    readonly joystickAxes: Readonly<Record<JoystickAxis, FiniteNumber>>;
}

function isDosInputConfig(value: unknown): value is DosInputConfig;

// DosInput/DosInput.ts
class DosInput {
    constructor(config: DosInputConfig);

    get snapshot(): DosInputSnapshot;
    get isDestroyed(): boolean;

    keyDown(code: KeyCode): void;
    keyUp(code: KeyCode): void;
    keyPress(code: KeyCode): void;
    mouseMove(dx: FiniteNumber, dy: FiniteNumber): void;
    mouseMoveTo(x: FiniteNumber, y: FiniteNumber): void;
    mouseDown(button: MouseButton): void;
    mouseUp(button: MouseButton): void;
    joystickButtonDown(button: JoystickButton): void;
    joystickButtonUp(button: JoystickButton): void;
    joystickAxis(axis: JoystickAxis, value: FiniteNumber): void;
    releaseAll(): void;
    destroy(): void;

    static init(config: DosInputConfig): DosInput;
}
```

### 5.2 Behavior

- **Construction.** Validates with `isDosInputConfig`; throws
  `INVALID_CONFIG`.
- **Arguments.** Every method validates its arguments with the shared
  predicate and throws `INVALID_CONFIG` with `data` the rejected value.
  `mouseMove` requires both deltas finite. `joystickAxis` requires
  `value` in `-1..1` inclusive; `-1.0001` and `1.0001` are rejected,
  `-1` and `1` accepted.
- **Idempotent holds.** `keyDown` on a key already down is a no-op: the
  session is not called and the snapshot is unchanged. `keyUp` on a key
  not down is likewise a no-op. Same for mouse and joystick buttons.
  This is what lets a physical keyboard's auto-repeat and a virtual
  button's double `pointerdown` coexist safely.
- **`keyPress`.** `keyDown` then `keyUp` synchronously. Exists because
  some deployments want a tap gesture to type a key.
- **`mouseMove`.** Forwards to the session unchanged; the input class
  applies no sensitivity. Sensitivity is a deployment concern applied
  in `Trackpad`/`MouseSource` config (roadmap §9). A zero delta on both
  axes is not forwarded.
- **`mouseMoveTo`.** Requires both coordinates finite and within
  `0..1` inclusive (`-0.001` and `1.001` rejected, `0` and `1`
  accepted); forwards to `sendMousePosition` unchanged. Not
  deduplicated: a DOS program may have moved its own cursor.
- **`joystickAxis`.** Forwards and records; the same value twice is
  forwarded only once.
- **`snapshot`.** A fresh object each read, sorted `keysDown`, so tests
  compare with `equals`.
- **`releaseAll`.** Sends `keyUp` for every held key, `mouseUp` for
  every held mouse button, `joystickButtonUp` for every held joystick
  button, and axis `0` for every axis not already `0`, in that order,
  each through the session. Afterwards the snapshot is empty. Called by
  sources on blur, visibility loss and destroy; this is the mechanism
  behind roadmap §12's "a virtual key must never remain logically
  held".
- **`destroy`.** Calls `releaseAll`, then marks destroyed. Every method
  except `snapshot`, `isDestroyed` and `destroy` itself throws
  `DESTROYED` afterwards; `destroy` twice is a no-op.
- **Session errors** propagate unchanged. `DosInput` does not catch;
  the caller decides.

### 5.3 Tests (`03-dos-input.test.ts`)

Against `FakeEmulatorSession`, which records every call as
`{ method, args }` in order and exposes `calls`. Cases: each method's
argument rejection; `keyDown` twice sends once; `keyUp` without
`keyDown` sends nothing; `keyPress` sends down then up; `mouseMove(0,
0)` sends nothing; axis boundaries; `releaseAll` order with two keys,
one mouse button, one joystick button and one non-zero axis held;
`DESTROYED` after `destroy` for every method; `destroy` twice.

---

## 6. `DosDisplay`

Owns the canvas the emulator draws into and how it fits its container
(roadmap §14). Presentation around the canvas is the deployment's.

### 6.1 Declarations

```ts
// DosDisplay/types.ts
type ScalingMode = "fit" | "integer";

interface DosDisplayConfig {
    readonly canvas: HTMLCanvasElement;
    readonly container: HTMLElement;
    readonly aspectRatio?: FiniteNumber;
    readonly scaling?: ScalingMode;
    readonly resizeObserver?: ResizeObserverLike;
    readonly fullscreenTarget?: FullscreenTargetLike;
}

interface ResizeObserverLike {
    observe(target: Element): void;
    disconnect(): void;
}

interface FullscreenTargetLike {
    requestFullscreen(): Promise<void>;
    readonly ownerDocument: { exitFullscreen(): Promise<void>; readonly fullscreenElement: Element | null };
}

interface DisplayLayout {
    readonly width: FiniteNumber;
    readonly height: FiniteNumber;
    readonly scale: FiniteNumber;
}

function isScalingMode(value: unknown): value is ScalingMode;
function isDosDisplayConfig(value: unknown): value is DosDisplayConfig;
function isResizeObserverLike(value: unknown): value is ResizeObserverLike;
function isFullscreenTargetLike(value: unknown): value is FullscreenTargetLike;

// DosDisplay/DosDisplay.ts
class DosDisplay {
    static readonly DEFAULT_ASPECT_RATIO: FiniteNumber;   // 4 / 3
    static readonly DEFAULT_SCALING: ScalingMode;         // "fit"

    constructor(config: DosDisplayConfig);

    get aspectRatio(): FiniteNumber;
    set aspectRatio(value: FiniteNumber);
    get scaling(): ScalingMode;
    set scaling(value: ScalingMode);
    get layout(): DisplayLayout;
    get isFullscreen(): boolean;

    attach(session: EmulatorSession): Unsubscribe;
    resize(containerWidth: FiniteNumber, containerHeight: FiniteNumber): DisplayLayout;
    onLayout(listener: Listener<DisplayLayout>): Unsubscribe;
    watchFullscreen(target: { addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void }): void;
    fullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    destroy(): void;

    static init(config: DosDisplayConfig): DosDisplay;
    static layoutFor(container: Vector2, frame: Vector2, aspectRatio: FiniteNumber, scaling: ScalingMode): DisplayLayout;
}
```

### 6.2 Behavior

- **Construction.** Validates; throws `INVALID_CONFIG`. `aspectRatio`
  must be a positive finite number. Mutable `aspectRatio` and `scaling`
  are assigned through their setters, which validate and throw
  `INVALID_CONFIG`; a setter assignment triggers a re-layout with the
  last known container size. `init` defaults `resizeObserver` from
  `globalThis.ResizeObserver` when present and `fullscreenTarget` to
  `container`.
- **`layoutFor`** is the pure arithmetic and the thing worth testing
  hardest. Given container size, native frame size, aspect ratio and
  mode, it returns the CSS size the canvas should take:
  - `fit`: the largest rectangle of the given aspect ratio that fits
    the container, centered by the deployment's CSS, `scale` =
    `width / frame.x`.
  - `integer`: the largest integer multiple of the frame's width that
    fits, with height derived from the aspect ratio; falls back to `fit`
    when even 1× does not fit. `scale` is that integer.
  - A frame of `0×0` (no frame received yet) lays out as if `320×200`.
- **`attach`.** Subscribes to the session's `onFrame`, updates the
  canvas's backing size to the frame size when it changes, draws the
  `rgba` buffer through `putImageData`, and re-lays out on a size
  change. Returns an unsubscribe that stops drawing. Attaching twice
  throws `INTERNAL_ERROR`; unsubscribe then attach is allowed.
- **`resize`.** Recomputes and applies `layout` to the canvas's CSS
  width and height, returns the layout. Called by the resize observer
  callback with the container's content box, and callable directly by a
  deployment that manages its own layout.
- **`fullscreen` / `exitFullscreen`.** Forward to `fullscreenTarget`;
  a rejection becomes `FULLSCREEN_FAILED`; absence of the method
  becomes `UNSUPPORTED`. So `isFullscreenTargetLike` accepts a target
  whose `requestFullscreen` or `ownerDocument.exitFullscreen` is
  absent (it checks them only when present): a browser without the
  Fullscreen API is a runtime condition reported by the method, not a
  construction error. `isFullscreen` reads
  `ownerDocument.fullscreenElement === fullscreenTarget`.
- **`onLayout`.** Subscribes to layout changes: every `resize` call
  and every setter-triggered re-layout that produces a layout different
  from the previous one emits the new `DisplayLayout`. A page uses it
  to position overlays relative to the game picture. Returns an
  `Unsubscribe`.
- **Fullscreen changes.** `watchFullscreen(target)` listens for
  `fullscreenchange` on the target and calls `resize` with the
  container's current size; a second call replaces the first watch and
  `destroy` removes it. `init` calls it with the container's document, so entering and leaving fullscreen re-lays out even
  when the resize observer's notification lags; `isFullscreen` reads
  the live state. Orientation changes need nothing special: the
  container's size changes and the observer reports it.
- **`destroy`.** Unsubscribes from frames, disconnects the observer,
  removes the fullscreen listener, and clears the canvas. Idempotent.
- **Not owned:** borders, letterbox color, orientation lock, safe-area
  insets. Those are CSS on the deployment's container (roadmap §15).
  `DosDisplay` sets only `canvas.style.width` and `canvas.style.height`
  and the canvas's `width`/`height` attributes.

### 6.3 Tests

**`spec/04-display-layout.test.ts`** covers the static `layoutFor`,
which has no DOM in it: `fit` in a wider-than-ratio container, a
taller-than-ratio container, an exact-ratio container; `integer` at
exactly 2×, just under 2× (falls to 1×), and under 1× (falls to `fit`);
the `0×0` frame default; each result compared with `equals` against a
`DisplayLayout` literal.

**`browser/02-dos-display.test.ts`** constructs the class on the
harness's real canvas and container with a `FakeEmulatorSession`.
Construction rejection per field, including `aspectRatio` `0` and
`-4/3`; setter re-layout observed through `layout` and through the
canvas's `style.width`/`style.height`; `attach` twice throws
`INTERNAL_ERROR`; `emitFrame` from the fake session with a `320×200`
buffer makes `canvas.width`/`canvas.height` `320`/`200` and, read back
through `getContext("2d").getImageData`, the pixel at `(0,0)` is the
one sent; resizing `#container` through `page.setViewportSize` and
awaiting the real `ResizeObserver` changes `layout`. `fullscreen` is
cased for `UNSUPPORTED` by passing a `fullscreenTarget` object without
`requestFullscreen`, and for `FULLSCREEN_FAILED` with one that rejects;
the success path is not automated because headless Chromium does not
grant fullscreen without a user gesture, and is checked by hand in
`npm run harness`.

---

## 7. `DosAudio`

Owns audio playback and the browser autoplay unlock (roadmap §16). The
probe (§4.3) showed the emulator hands over raw `Float32Array` samples
and creates no `AudioContext` of its own, so this class owns the
context, the playback queue and the gesture unlock.

### 7.1 Declarations

```ts
// DosAudio/types.ts
interface DosAudioConfig {
    readonly session: EmulatorSession;
    readonly gestureSource: GestureSourceLike;
    readonly audioContext: AudioContextLike;
}

interface GestureSourceLike {
    addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
    removeEventListener(type: string, listener: (event: Event) => void, options?: EventListenerOptions): void;
}

// The subset of AudioContext the class uses; a real AudioContext satisfies it.
interface AudioContextLike {
    readonly state: "suspended" | "running" | "closed" | "interrupted";
    readonly sampleRate: number;
    readonly currentTime: number;
    readonly destination: AudioNode;
    resume(): Promise<void>;
    close(): Promise<void>;
    createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
    createBufferSource(): AudioBufferSourceNode;
    createGain(): GainNode;
}

function isDosAudioConfig(value: unknown): value is DosAudioConfig;
function isGestureSourceLike(value: unknown): value is GestureSourceLike;
function isAudioContextLike(value: unknown): value is AudioContextLike;

// DosAudio/DosAudio.ts
class DosAudio {
    static readonly GESTURE_EVENTS: ReadonlyArray<string>;   // ["pointerdown", "keydown", "touchend"]
    static readonly MAX_QUEUE_MS: FiniteNumber;              // 200
    static readonly MIN_CHUNK_MS: FiniteNumber;              // 20

    constructor(config: DosAudioConfig);

    get isUnlocked(): boolean;
    get isMuted(): boolean;
    get sampleRate(): number;
    get queuedMs(): FiniteNumber;
    get droppedSamples(): number;

    unlock(): Promise<void>;
    armGestureUnlock(): Unsubscribe;
    mute(): void;
    unmute(): void;
    destroy(): void;

    static init(config: Omit<DosAudioConfig, "audioContext"> & { audioContext?: AudioContextLike }): DosAudio;
}
```

### 7.2 Behavior

- **Construction.** Validates; throws `INVALID_CONFIG`. Subscribes to
  `session.onSound` immediately so samples that arrive before the
  unlock are queued (up to the cap) rather than lost. `init` constructs
  the real context as `new AudioContext({ sampleRate:
  session.soundFrequency, latencyHint: "interactive" })` when none is
  given. A context whose `sampleRate` differs from
  `session.soundFrequency` is accepted; the samples are then played
  through a buffer created at the session's rate and the browser
  resamples.
- **Playback.** Samples are treated as mono. They accumulate in a
  queue; whenever at least `MIN_CHUNK_MS` worth is queued and the
  context is running, the class creates an `AudioBuffer`, copies the
  samples in, and schedules an `AudioBufferSourceNode` to start at the
  end of the previously scheduled one (or at `currentTime` plus a small
  lead when the schedule has run dry), through one `GainNode` to
  `destination`. Scheduled buffer sources are used rather than an
  `AudioWorklet` because a worklet needs a separately served module
  file, which this package does not want to ask deployments to host.
- **Latency cap.** When the queue exceeds `MAX_QUEUE_MS`, the oldest
  samples are dropped to bring it back under the cap and
  `droppedSamples` is incremented by the count. This keeps audio from
  drifting seconds behind video after a tab was throttled or the
  context was suspended. `queuedMs` reports the current queue length.
- **`unlock`.** Calls `audioContext.resume()`; on resolve `isUnlocked`
  reads `state === "running"`; on reject throws `AUDIO_FAILED`. Calling
  when already running resolves without calling `resume`.
- **`armGestureUnlock`.** Adds a listener for each `GESTURE_EVENTS`
  type on `gestureSource`, `{ passive: true }`. The first event that
  fires calls `unlock()`, and on success removes all the listeners; on
  failure they stay so the next gesture retries. Returns an
  `Unsubscribe` that removes them regardless. Arming twice returns the
  second unsubscribe and does not double-add.
- **`mute` / `unmute`.** Set the gain to `0` or `1`; samples keep
  flowing so unmute is instant and the queue does not fill.
- **`destroy`.** Unsubscribes from the session, removes listeners,
  stops scheduled sources, closes the context (ignoring a rejection
  from an already closed one). Idempotent.

### 7.3 Tests (`browser/03-dos-audio.test.ts`)

Against `FakeEmulatorSession`, whose `emitSound(samples)` feeds the
class. Playwright launches Chromium with autoplay allowed, so a real
`AudioContext` there is `"running"` from construction and no gesture
is ever needed: the locked state cannot be observed with a real
context. The cases therefore use two kinds of context:

- **A real `AudioContext`** for playback: emitting 44100 samples at
  once leaves `queuedMs` at most 200 and `droppedSamples` at least
  35280; after construction on a running context, 4410 emitted
  samples drain so that within one second `queuedMs` is below
  `MIN_CHUNK_MS`; `destroy` closes it (`state` `"closed"`).
- **A gating wrapper** built in-page, satisfying `AudioContextLike`
  and forwarding every method to a real context, but reporting `state`
  `"suspended"` until its own `resume` has been called (and counting
  those calls; scriptable to reject instead): before any gesture,
  `isUnlocked` is `false` and 4410 emitted samples read back as
  `queuedMs` 100; `page.mouse.click` on `#container` after
  `armGestureUnlock` makes `isUnlocked` true and drains the queue below
  `MIN_CHUNK_MS` within one second; a second click does not call
  `resume` again; the `Unsubscribe` from `armGestureUnlock` stops a
  later click from unlocking; `mute` then `unmute` while locked leaves
  `queuedMs` unchanged; a wrapper whose `resume` rejects gives
  `AUDIO_FAILED` from `unlock` and leaves the listener armed.

Whether sound is audible is the Milestone 1 manual check.

---

## 8. `DosPlayer`

The application-facing composition root (roadmap §5, §20). Owns the
lifecycle; delegates everything else.

### 8.1 Declarations

```ts
// DosPlayer/types.ts
type DosPlayerStatus = "idle" | "starting" | "running" | "paused" | "destroyed";

interface DosGameConfig {
    readonly bundle: NonEmptyString | Uint8Array;
    readonly changes?: Uint8Array;
    readonly display?: {
        readonly aspectRatio?: FiniteNumber;
        readonly scaling?: ScalingMode;
    };
}

interface DosPlayerConfig {
    readonly canvas: HTMLCanvasElement;
    readonly container: HTMLElement;
    readonly game: DosGameConfig;
    readonly adapter: EmulatorAdapter;
    readonly fetch?: FetchLike;
    readonly gestureSource?: GestureSourceLike;
}

type FetchLike = (url: string) => Promise<{ readonly ok: boolean; readonly status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

interface DosPlayerEvents {
    readonly status: DosPlayerStatus;
    readonly exit: void;
    readonly error: DosRuntimeError;
}

function isDosPlayerStatus(value: unknown): value is DosPlayerStatus;
function isDosGameConfig(value: unknown): value is DosGameConfig;
function isDosPlayerConfig(value: unknown): value is DosPlayerConfig;

// DosPlayer/DosPlayer.ts
class DosPlayer {
    constructor(config: DosPlayerConfig);

    get status(): DosPlayerStatus;
    get input(): DosInput;
    get display(): DosDisplay;
    get audio(): DosAudio;
    get game(): DosGameConfig;

    start(): Promise<void>;
    pause(): void;
    resume(): void;
    fullscreen(): Promise<void>;
    persist(): Promise<Uint8Array | null>;
    on<K extends keyof DosPlayerEvents>(event: K, listener: Listener<DosPlayerEvents[K]>): Unsubscribe;
    destroy(): Promise<void>;

    static init(config: Omit<DosPlayerConfig, "adapter"> & { adapter?: EmulatorAdapter }): Promise<DosPlayer>;
}
```

### 8.2 Behavior

- **Construction.** Validates with `isDosPlayerConfig`; throws
  `INVALID_CONFIG`. Constructs `DosDisplay` immediately from `canvas`,
  `container` and `game.display`. Does not construct `DosInput` or
  `DosAudio` yet: both need a session. `status` is `"idle"`. Reading
  `input` or `audio` before `start()` resolves throws `NOT_STARTED`.
- **`init`.** The deployment entry point. Defaults `adapter` to `await
  JsDosEmulatorAdapter.init()`, `fetch` to `globalThis.fetch`,
  `gestureSource` to `container`, then constructs. This is the only
  place the package chooses js-dos on the deployment's behalf, and
  passing `adapter` overrides it (roadmap §21).
- **`start`.**
  1. Throws `ALREADY_STARTED` unless `status` is `"idle"`; throws
     `DESTROYED` when destroyed.
  2. Sets `status` `"starting"`, emits it.
  3. Resolves the bundle: a `Uint8Array` is used as is; a string is
     fetched through `fetch`; a non-`ok` response or a rejection
     becomes `BUNDLE_LOAD_FAILED` with `data` the status or caught
     value. The resolved bytes are kept on the player so a later
     `start()` after an exit does not fetch again; the adapter copies
     them before every use (§4.2), so the kept array is never detached.
  4. Awaits `adapter.start({ bundle, changes: game.changes })`. A
     rejection that is already a `DosRuntimeError` is rethrown as is;
     anything else becomes `ADAPTER_FAILED`.
  5. Constructs `DosInput` and `DosAudio` on the session (`DosAudio`
     through `DosAudio.init`, so it owns a real `AudioContext`), calls
     `display.attach(session)`, calls `audio.armGestureUnlock()`,
     subscribes to `session.onExit`.
  6. Sets `status` `"running"`, emits it.

  On any failure at steps 3–5, `status` returns to `"idle"`, the
  `error` event is emitted with the error, and `start` rejects with it.
  A second `start` after a failed one is allowed.
- **`pause` / `resume`.** Forward to the session, synchronously;
  `pause` also calls `input.releaseAll()` first so nothing is held
  across the pause. Status becomes `"paused"` / `"running"` and is
  emitted. `pause` while paused and `resume` while running are no-ops.
  Both throw `NOT_STARTED` before start and `DESTROYED` after destroy.
- **`fullscreen`.** Delegates to `display.fullscreen()`. Allowed in any
  non-destroyed status.
- **`persist`.** Delegates to `session.persist()`; `NOT_STARTED` before
  start. Resolves to the overlay of changed files, or `null` when
  nothing has changed since start (§4.2). Storing it is `DosStorage`'s
  job; feeding it back is `game.changes` on the next start.
- **Session exit.** When the session's `onExit` fires, the player
  emits `exit`, releases input, detaches the display, and sets status
  `"idle"` so a deployment may `start()` again.
- **`on`.** Typed event subscription; returns `Unsubscribe`. Listeners
  that throw do not stop other listeners; the throw is swallowed and
  re-emitted as an `error` event with `INTERNAL_ERROR`, unless the
  listener was itself an `error` listener, in which case it is dropped.
- **`destroy`.** Releases input, detaches display, disarms audio,
  awaits `session.exit()` when a session exists (ignoring `DESTROYED`
  from an already-exited session), destroys the sub-objects, emits
  `status` `"destroyed"`, clears listeners. Idempotent.

### 8.3 Tests (`browser/04-dos-player.test.ts`)

Two groups in one file.

**Lifecycle against doubles.** The player is constructed in-page on
the real canvas and container with a `FakeEmulatorAdapter` (scripted
to resolve with a `FakeEmulatorSession`, reject with an `Error`, or
reject with a `DosRuntimeError`) and a scripted `FetchLike`. Cases:
status sequence `idle → starting → running` captured through
`on("status")`; `input` before start throws `NOT_STARTED`; `start`
twice throws `ALREADY_STARTED`; fetch `404` gives `BUNDLE_LOAD_FAILED`
with `data` `404` and status back to `idle`; adapter rejecting a plain
`Error` gives `ADAPTER_FAILED` with that error's message in
`data.message`; adapter rejecting a `DosRuntimeError` rethrows one
with the same code; `pause` releases held keys (observed through
`input.snapshot` and the fake session's calls); fake session
`emitExit()` produces the `exit` event and status `idle`; `destroy`
calls `session.exit` once and a second `destroy` does not; a throwing
`status` listener produces an `error` event and does not prevent the
next listener.

**Boot against js-dos.** `window.harness.boot()` runs `DosPlayer.init`
with the real adapter and `test.jsdos`; `start()` resolves within
60 s, status is `running`, the canvas backing size is non-zero,
`input.keyPress("Enter")` does not throw, `destroy()` resolves and
status is `destroyed`. A second case asserts the harness page
performed no `import` of `emulators` itself: `main.ts` imports only
`src/index.ts`, and the case checks
`performance.getEntriesByType("resource")` shows `/emulators/` assets
loaded, proving the adapter, not the page, fetched them. This pair is
Milestones 1 and 2's acceptance test.

---

## 9. `KeyboardSource`

Physical keyboard → `DosInput` (roadmap Milestone 3).

### 9.1 Declarations

```ts
// KeyboardSource/types.ts
interface KeyboardSourceConfig {
    readonly input: DosInput;
    readonly target: GestureSourceLike;
    readonly filter?: (code: KeyCode) => boolean;
    readonly preventDefault?: boolean;
}

function isKeyboardSourceConfig(value: unknown): value is KeyboardSourceConfig;

// KeyboardSource/KeyboardSource.ts
class KeyboardSource {
    constructor(config: KeyboardSourceConfig);

    get isAttached(): boolean;
    get enabled(): boolean;
    set enabled(value: boolean);

    attach(): void;
    detach(): void;
    destroy(): void;

    static init(config: KeyboardSourceConfig): KeyboardSource;
}
```

### 9.2 Behavior

- `attach` adds `keydown` and `keyup` listeners to `target`, a `blur`
  listener to the window (the browser reports focus leaving the page
  there, never on the document) and a `visibilitychange` listener to
  the document; when there is no window or document, both fall back
  to `target`. `keydown` with `repeat` true is ignored (the
  emulator does its own repeat); otherwise `input.keyDown(event.code)`.
  `keyup` → `input.keyUp(event.code)`. `blur`, and `visibilitychange`
  when hidden, → `input.releaseAll()`.
- When `filter` is given and returns `false` for a code, the event is
  ignored and not prevented. When `preventDefault` is true (default
  true), handled events are `preventDefault()`ed so the page does not
  scroll on arrows or open find on `/`.
- An `UNSUPPORTED_KEY` thrown by `input.keyDown` is caught and dropped:
  a key the emulator cannot take is not an error for the page. Every
  other error propagates.
- `attach` twice is a no-op; `detach` removes the listeners and calls
  `releaseAll`; `destroy` detaches. Idempotent.
- **`enabled`** (default `true`) is a gate independent of attachment:
  while `false`, key events are ignored and not prevented, and setting
  it to `false` calls `releaseAll` so nothing stays held. The setter
  rejects a non-boolean with `INVALID_CONFIG`. A deployment uses it to
  hold keys back from a game that is not ready for them.

### 9.3 Tests (`browser/05-keyboard-source.test.ts`)

The harness `document` as target, `FakeEmulatorSession` behind a real
`DosInput`. `page.keyboard.down("ArrowUp")` / `up` forward to the
session (real input case); a `KeyboardEvent` dispatched with `repeat:
true` is ignored; `filter` blocks; `window.dispatchEvent(new
Event("blur"))` releases two held keys; `UNSUPPORTED_KEY` is swallowed
(session scripted to throw it for one code); `preventDefault` observed
through `event.defaultPrevented` on a dispatched `keydown`; detach
releases; `enabled = false` releases two held keys and a later keydown
is neither forwarded nor prevented, `enabled = true` forwards again,
and `enabled = "no"` throws `INVALID_CONFIG`.

---

## 10. `MouseSource`

Physical mouse → `DosInput` with relative deltas (roadmap Milestone 4).

### 10.1 Declarations

```ts
// MouseSource/types.ts
type MouseTouchMode = "none" | "absolute";

interface MouseSourceConfig {
    readonly input: DosInput;
    readonly surface: InputSurface;
    readonly sensitivity?: FiniteNumber;
    readonly pointerLock?: PointerLockLike;
    readonly touch?: MouseTouchMode;
}

interface PointerLockLike {
    requestPointerLock(): void | Promise<void>;
    readonly ownerDocument: { exitPointerLock(): void; readonly pointerLockElement: Element | null };
}

function isMouseSourceConfig(value: unknown): value is MouseSourceConfig;
function isPointerLockLike(value: unknown): value is PointerLockLike;
function isMouseTouchMode(value: unknown): value is MouseTouchMode;

// MouseSource/MouseSource.ts
class MouseSource {
    static readonly DEFAULT_SENSITIVITY: FiniteNumber;   // 1
    static readonly BUTTON_MAP: Readonly<Record<number, MouseButton>>;   // 0 left, 1 middle, 2 right

    constructor(config: MouseSourceConfig);

    get sensitivity(): FiniteNumber;
    set sensitivity(value: FiniteNumber);
    get enabled(): boolean;
    set enabled(value: boolean);
    get touch(): MouseTouchMode;
    get isAttached(): boolean;
    get isLocked(): boolean;

    attach(): void;
    detach(): void;
    lock(): void;
    unlock(): void;
    destroy(): void;

    static init(config: MouseSourceConfig): MouseSource;
}
```

### 10.2 Behavior

- Listens for `pointermove`, `pointerdown`, `pointerup`,
  `pointercancel`, `lostpointercapture` and `contextmenu` on
  `surface`. Pointer events with `pointerType === "mouse"` are always
  handled. With `touch: "absolute"` (default `"none"`), events with
  `pointerType === "touch"` are handled too, as a phone player's
  "touch where you want to point": the first touch down sends its
  absolute position then `left` down, its moves send positions, and
  its up sends `left` up; further simultaneous touches are ignored.
  `pen` is treated like `touch`.
- **`enabled`** (default `true`) is a gate independent of attachment:
  while `false`, pointer events are ignored (`contextmenu` is still
  prevented), and setting it to `false` releases every held button.
  The setter rejects a non-boolean with `INVALID_CONFIG`. A deployment
  uses it to keep clicks out of DOS's mouse buffer during an intro.
- **Movement, unlocked.** Each `pointermove` is converted to a
  position normalized over `surface.getBoundingClientRect()`:
  `x = (clientX - left) / width`, likewise `y`, each clamped to
  `0..1`, and sent through `input.mouseMoveTo(x, y)`. This pins the
  DOS cursor under the physical pointer; `sensitivity` does not apply.
  A `pointerdown` sends the position first, then the button, so a click
  lands where the pointer is even when no move preceded it.
- **Movement, locked.** Uses `movementX`/`movementY` from the event,
  multiplies by `sensitivity`, rounds toward zero, and calls
  `input.mouseMove(dx, dy)` when either is non-zero. Sub-pixel
  remainders accumulate so slow movement is not lost.
- **No default prevention** on pointer events: the browser must still
  move focus to the surface on click so a `KeyboardSource` on the
  document keeps receiving keys. Only `contextmenu` is prevented.
- **Buttons.** `pointerdown` with `button` in `BUTTON_MAP` →
  `mouseDown`; `pointerup`/`pointercancel`/`lostpointercapture` →
  `mouseUp` for every button currently held by this source.
  `contextmenu` is prevented so right-click reaches the game; that
  event is prevented whatever its `pointerType`, since browsers deliver
  it as a `PointerEvent` in some versions and a `MouseEvent` in others.
  A `pointerdown` whose `button` is outside `BUTTON_MAP` (a back or
  forward button) is ignored.
- **`lock`/`unlock`.** Forward to `pointerLock` when given; otherwise
  throw `UNSUPPORTED`. `isLocked` is `true` when a `pointerLock` was
  given and its `ownerDocument.pointerLockElement` is that element,
  and `false` otherwise, including when no `pointerLock` was given.
- **Sensitivity setter** validates positive finite; throws
  `INVALID_CONFIG`.
- `detach` and `destroy` release held buttons through
  `input.releaseAll()` and are idempotent.

### 10.3 Tests (`browser/06-mouse-source.test.ts`)

Mounted on `#surface` (200×200) with a `FakeEmulatorSession`.
`page.mouse.move` to the surface's center gives `sendMousePosition(0.5,
0.5)` and to its top-left corner plus 20 px gives `(0.1, 0.1)` (real
input); a synthetic move 50 px outside the surface clamps to `0` or
`1`; `page.mouse.down()` at the center gives `sendMousePosition(0.5,
0.5)` then `sendMouseButton("left", true)`, and `up()` gives `("left",
false)`; a synthetic `pointerdown` with `button` 2 maps to `right` and
1 to `middle`; the locked path is observed by making `isLocked` true
through a `pointerLock` object whose `ownerDocument.pointerLockElement`
is itself, then dispatching synthetic moves with `movementX`
`+10` (gives `mouseMove(10, 0)`), with `sensitivity` 2 (`20, 0`), and
`+0.4` three times at sensitivity 1 (one `mouseMove(1, 0)`);
synthetic `pointercancel` releases held buttons; with the default
`touch: "none"` a synthetic event with `pointerType: "touch"` is
ignored; with `touch: "absolute"`, a synthetic touch pointerdown at the
center gives `sendMousePosition(0.5, 0.5)` then `left` down, a touch
move gives a position, a second touch id while the first is down gives
nothing, and its up gives `left` up; `enabled = false` while `left` is
held releases it and a later move sends nothing, `enabled = true` sends
again, and `enabled = 1` throws `INVALID_CONFIG`; `contextmenu` is
prevented (observed through `defaultPrevented`); `lock` without
`pointerLock` throws `UNSUPPORTED`. Pointer lock's success path needs a user gesture that
headless Chromium does not grant and is checked by hand.

---

## 11. Pointer Primitives — common contract

`Button`, `DPad`, `AnalogStick` and `Trackpad` share one shape
(roadmap §10, §12). Each:

- takes an `InputSurface` and attaches Pointer Event listeners to it;
- tracks pointers by `pointerId` so multi-touch works: a `DPad` and a
  `Button` on different surfaces each see only their own pointers, and
  one surface may hold several pointers (two fingers on a trackpad);
- requests pointer capture on `pointerdown` when the surface supports
  it, so the gesture continues outside the element. The call is
  wrapped: a thrown `NotFoundError` or `InvalidStateError` is ignored,
  because browsers refuse capture for a pointer they did not
  originate, and correctness never depends on capture succeeding,
  only on `pointerup`/`pointercancel`/`lostpointercapture` being
  honored;
- treats `pointerup`, `pointercancel` and `lostpointercapture`
  identically as "this pointer is gone" and releases whatever that
  pointer was holding;
- emits **mechanical** events through a typed `on(event, listener)`
  returning `Unsubscribe`, and knows nothing about `DosInput` or key
  codes. `InputMapper` (§16) is what connects them;
- calls `preventDefault()` on handled pointer events so the page does
  not scroll or select; the deployment still sets `touch-action: none`
  in CSS because Pointer Events alone do not stop every browser
  gesture;
- exposes `isAttached`, `attach()`, `detach()`, `destroy()` with the
  same idempotency rules as the sources above, and `detach` emits a
  release for anything held.

Each primitive's `types.ts` declares its config, its event map and its
predicates. Each has a pure geometry static where the roadmap's
mechanics reduce to arithmetic (`DPad.directionsFor`,
`AnalogStick.valueFor`), tested in `spec`; everything that involves an
element and events is tested in `browser`, mounted on the harness's
`#surface` through `window.harness.mount`, driven by real
`PointerEvent`s built by `window.harness.pointer`, and observed
through `window.harness.events()`. Multi-touch is exercised with two
synthetic pointer ids on one surface, and one case per primitive uses
the `realTap` fixture or `page.mouse` as the real-input path.

## 12. `Button`

```ts
// Button/types.ts
interface ButtonConfig {
    readonly surface: InputSurface;
    readonly holdDelayMs?: FiniteNumber;
    readonly timer?: TimerLike;
}
interface ButtonEvents {
    readonly press: { readonly pointerId: number };
    readonly release: { readonly pointerId: number };
    readonly hold: { readonly pointerId: number };
}
function isButtonConfig(value: unknown): value is ButtonConfig;

// Button/Button.ts
class Button {
    static readonly DEFAULT_HOLD_DELAY_MS: FiniteNumber;   // 400
    constructor(config: ButtonConfig);
    get isPressed(): boolean;
    get isAttached(): boolean;
    on<K extends keyof ButtonEvents>(event: K, listener: Listener<ButtonEvents[K]>): Unsubscribe;
    attach(): void;
    detach(): void;
    destroy(): void;
    static init(config: ButtonConfig): Button;
}
```

- `press` on the first `pointerdown` while not pressed; `release` when
  the last pointer holding it is gone. A second finger on an already
  pressed button neither re-emits `press` nor releases when it lifts
  while the first is still down. `isPressed` mirrors this.
- `hold` fires once, `holdDelayMs` after `press`, if still pressed,
  using a timer injected as `setTimeout`/`clearTimeout` from a
  `TimerLike` config field defaulted by `init`. Tests script the timer.
- Tests (`browser/07-button.test.ts`): press/release with
  `page.touchscreen.tap` (real input); two-finger overlap with two
  synthetic pointer ids; `pointercancel` releases; `lostpointercapture`
  releases; `hold` fires after `FakeTimer.advance` and not after an
  early release; `detach` while pressed emits `release`; the handled
  `pointerdown` has `defaultPrevented` true.

## 13. `DPad`

```ts
// DPad/types.ts
type DPadDirection = "up" | "down" | "left" | "right";
interface DPadConfig {
    readonly surface: InputSurface;
    readonly deadZone?: FiniteNumber;
    readonly diagonals?: boolean;
}
interface DPadEvents {
    readonly change: { readonly directions: ReadonlyArray<DPadDirection> };
    readonly press: { readonly direction: DPadDirection };
    readonly release: { readonly direction: DPadDirection };
}
function isDPadDirection(value: unknown): value is DPadDirection;
function isDPadConfig(value: unknown): value is DPadConfig;

// DPad/DPad.ts
class DPad {
    static readonly DEFAULT_DEAD_ZONE: FiniteNumber;   // 0.2 (fraction of half the shorter side)
    constructor(config: DPadConfig);
    get directions(): ReadonlyArray<DPadDirection>;
    get isAttached(): boolean;
    on<K extends keyof DPadEvents>(event: K, listener: Listener<DPadEvents[K]>): Unsubscribe;
    attach(): void;
    detach(): void;
    destroy(): void;
    static init(config: DPadConfig): DPad;
    static directionsFor(offset: Vector2, radius: FiniteNumber, deadZone: FiniteNumber, diagonals: boolean): ReadonlyArray<DPadDirection>;
}
```

- `directionsFor` is the pure part: `offset` is the pointer position
  relative to the surface center in screen coordinates (negative `y`
  is `up`), `radius` half the shorter side. At or inside `deadZone *
  radius`, no directions. With `diagonals` false (default), the
  dominant axis wins, and on an exact tie the horizontal axis wins;
  with true, both axes contribute when the minor/major axis ratio is
  strictly greater than `tan(22.5°)`, so exactly 22.5° from an axis
  is that axis alone. Result sorted (`up`, `down`, `left`, `right`
  order) for `equals` comparison.
- One pointer drives the pad at a time: the first `pointerdown`;
  additional pointers on the same surface are ignored until it lifts.
  `pointermove` re-evaluates; `change` fires only when the set differs,
  and `press`/`release` fire per direction that entered or left the
  set, releases before presses. Pointer gone → empty set with releases.
- Tests. `spec/05-dpad-geometry.test.ts`: `directionsFor` at eight
  compass points and the dead zone boundary on both sides, each with
  diagonals on and off. `browser/08-dpad.test.ts`: a synthetic drag
  from the top of `#surface` to its right edge emits `release up` then
  `press right`; a second pointer id is ignored while the first is
  down; `pointercancel` empties the set with releases; `page.mouse`
  down at the top edge then up is the real-input case.

## 14. `AnalogStick`

```ts
// AnalogStick/types.ts
interface AnalogStickConfig {
    readonly surface: InputSurface;
    readonly deadZone?: FiniteNumber;
    readonly radius?: FiniteNumber;
}
interface AnalogStickEvents {
    readonly change: { readonly value: Vector2 };
    readonly release: void;
}
function isAnalogStickConfig(value: unknown): value is AnalogStickConfig;

// AnalogStick/AnalogStick.ts
class AnalogStick {
    static readonly DEFAULT_DEAD_ZONE: FiniteNumber;   // 0.1
    constructor(config: AnalogStickConfig);
    get value(): Vector2;
    get isAttached(): boolean;
    on<K extends keyof AnalogStickEvents>(event: K, listener: Listener<AnalogStickEvents[K]>): Unsubscribe;
    attach(): void;
    detach(): void;
    destroy(): void;
    static init(config: AnalogStickConfig): AnalogStick;
    static valueFor(offset: Vector2, radius: FiniteNumber, deadZone: FiniteNumber): Vector2;
}
```

- `valueFor` divides the offset by `radius`, keeps its direction in
  screen coordinates (positive `y` is downward), and sets its
  magnitude to `(length − deadZone) / (1 − deadZone)` clamped to
  `0..1`, so the value is zero at and inside the dead zone, leaves it
  smoothly, and reaches the unit circle at the rim and beyond. `radius` defaults to half the
  shorter side of the surface rect at `pointerdown`; a configured
  `radius` overrides (a "floating" stick pins its origin at the
  `pointerdown` point and uses this radius).
- Origin is the surface center unless `radius` is configured, in which
  case origin is the `pointerdown` point. One pointer at a time.
  `change` on every move whose value differs; pointer gone → `value`
  `{0,0}`, `change` with it, then `release`.
- Tests. `spec/06-analog-stick-geometry.test.ts`: `valueFor` at
  center, at the dead zone edge both sides, at the rim, beyond the rim
  (clamped). `browser/09-analog-stick.test.ts`: a synthetic drag emits
  `change` values matching `valueFor` for the surface's real rect;
  floating origin when `radius` is configured; the release sequence
  (`change {0,0}` then `release`); `page.mouse` drag as real input.

## 15. `Trackpad`

```ts
// Trackpad/types.ts
interface TrackpadConfig {
    readonly surface: InputSurface;
    readonly sensitivity?: FiniteNumber;
    readonly tapMaxMs?: FiniteNumber;
    readonly tapMaxDistance?: FiniteNumber;
    readonly holdDelayMs?: FiniteNumber;
    readonly timer?: TimerLike;
}
interface TrackpadEvents {
    readonly move: { readonly dx: FiniteNumber; readonly dy: FiniteNumber; readonly pointers: number };
    readonly tap: { readonly pointers: number };
    readonly holdStart: { readonly pointers: number };
    readonly holdEnd: { readonly pointers: number };
}
function isTrackpadConfig(value: unknown): value is TrackpadConfig;

// Trackpad/Trackpad.ts
class Trackpad {
    static readonly DEFAULT_SENSITIVITY: FiniteNumber;      // 1
    static readonly DEFAULT_TAP_MAX_MS: FiniteNumber;       // 250
    static readonly DEFAULT_TAP_MAX_DISTANCE: FiniteNumber; // 10 (CSS px)
    static readonly DEFAULT_HOLD_DELAY_MS: FiniteNumber;    // 400
    constructor(config: TrackpadConfig);
    get sensitivity(): FiniteNumber;
    set sensitivity(value: FiniteNumber);
    get activePointers(): number;
    get isAttached(): boolean;
    on<K extends keyof TrackpadEvents>(event: K, listener: Listener<TrackpadEvents[K]>): Unsubscribe;
    attach(): void;
    detach(): void;
    destroy(): void;
    static init(config: TrackpadConfig): Trackpad;
}
```

- **Move.** With one or more pointers down, each `pointermove` of the
  *primary* pointer (the first one down) produces `move` with deltas
  from its previous position times `sensitivity`, integer-rounded with
  remainder accumulation as in `MouseSource`, and `pointers` the
  current count. Two-finger drag therefore emits `move` with
  `pointers: 2`; whether that becomes scroll or nothing is the
  mapper's decision (roadmap §9).
- **Tap.** When the *last* pointer lifts, if the gesture lasted at most
  `tapMaxMs` from the first `pointerdown`, no pointer moved more than
  `tapMaxDistance` from its origin, and no `holdStart` fired, emit
  `tap` with `pointers` the maximum simultaneous count during the
  gesture. So a two-finger tap is `tap { pointers: 2 }`.
- **Hold.** `holdDelayMs` after the first `pointerdown`, if no pointer
  has exceeded `tapMaxDistance`, emit `holdStart { pointers }`; a
  held gesture may then move (a drag), and when the last pointer lifts
  emit `holdEnd`. A gesture that moves before the delay is a plain
  move and never holds.
- `pointercancel`/`lostpointercapture` end the gesture with no `tap`;
  `holdEnd` is emitted if `holdStart` was.
- Tests (`browser/10-trackpad.test.ts`): one-finger move deltas;
  sensitivity; one-finger tap via `page.touchscreen.tap` (real input);
  two-finger tap with two synthetic pointer ids; a move beyond
  `tapMaxDistance` suppresses tap; hold fires after
  `FakeTimer.advance` and `holdEnd` on lift; a cancel mid-hold emits
  `holdEnd` and no `tap`. Gesture duration is read from event
  `timeStamp`, which `window.harness.pointer` accepts as a field, so
  no case waits on a real clock.

---

## 16. `InputMapper`

The deployment's mapping (roadmap §11) turned into a mechanism. The
deployment writes the map; the mapper wires primitives to `DosInput`
according to it. The runtime never contains a specific map.

### 16.1 Declarations

```ts
// InputMapper/types.ts
type KeyTarget = { readonly kind: "key"; readonly code: KeyCode };
type MouseButtonTarget = { readonly kind: "mouseButton"; readonly button: MouseButton };
type JoystickButtonTarget = { readonly kind: "joystickButton"; readonly button: JoystickButton };
type InputTarget = KeyTarget | MouseButtonTarget | JoystickButtonTarget;

interface DPadMap {
    readonly up?: InputTarget;
    readonly down?: InputTarget;
    readonly left?: InputTarget;
    readonly right?: InputTarget;
}

interface AnalogStickMap {
    readonly mode: "joystick" | "keys";
    readonly keys?: DPadMap;
    readonly threshold?: FiniteNumber;
}

interface TrackpadMap {
    readonly move?: "mouse" | "none";
    readonly tap?: InputTarget;
    readonly twoFingerTap?: InputTarget;
    readonly hold?: InputTarget;
    readonly twoFingerMove?: "none" | { readonly kind: "keyWheel"; readonly up: KeyCode; readonly down: KeyCode };
}

interface InputMapperConfig {
    readonly input: DosInput;
}

function isInputTarget(value: unknown): value is InputTarget;
function isDPadMap(value: unknown): value is DPadMap;
function isAnalogStickMap(value: unknown): value is AnalogStickMap;
function isTrackpadMap(value: unknown): value is TrackpadMap;
function isInputMapperConfig(value: unknown): value is InputMapperConfig;

// InputMapper/InputMapper.ts
class InputMapper {
    constructor(config: InputMapperConfig);

    get bindings(): number;

    bindButton(button: Button, target: InputTarget): Unsubscribe;
    bindDPad(dpad: DPad, map: DPadMap): Unsubscribe;
    bindAnalogStick(stick: AnalogStick, map: AnalogStickMap): Unsubscribe;
    bindTrackpad(trackpad: Trackpad, map: TrackpadMap): Unsubscribe;
    bindKey(code: KeyCode, target: InputTarget): Unsubscribe;
    unbindAll(): void;
    destroy(): void;

    static init(config: InputMapperConfig): InputMapper;
    static press(input: DosInput, target: InputTarget): void;
    static release(input: DosInput, target: InputTarget): void;
}
```

### 16.2 Behavior

- Every `bind*` validates its map with the predicate (throws
  `INVALID_CONFIG`), subscribes to the primitive's events, and returns
  an `Unsubscribe` that removes those subscriptions and releases any
  target the binding currently holds. `bindings` counts live bindings.
- **`press` / `release`** are the one switch from `InputTarget` to a
  `DosInput` call: `key` → `keyDown`/`keyUp`, `mouseButton` →
  `mouseDown`/`mouseUp`, `joystickButton` → the joystick pair. Both
  validate `target` with `isInputTarget` and throw `INVALID_CONFIG`
  otherwise.
- **Button:** `press` → `press(target)`, `release` → `release(target)`.
  `hold` is not mapped by this method; a deployment that wants
  hold-to-run binds the `hold` event itself.
- **DPad:** on each `press`/`release` event, press or release the
  target for that direction if the map has one; directions without an
  entry are ignored.
- **AnalogStick, `joystick` mode:** `change` → `joystickAxis("x",
  value.x)` and `("y", value.y)`; `release` → both `0`; unsubscribing
  while the last sent value was non-zero also zeros both.
  **`keys` mode:** each axis of the stick's emitted `value` (after its
  dead-zone rescaling) is quantized independently: at or beyond
  `threshold` (default `0.5`, valid `0 < threshold ≤ 1`) in a
  direction, that direction's target in `keys` is pressed; falling
  back under it releases; negative `y` is `up`. A `keys` map that is
  absent or lacks a direction presses nothing for it.
- **Trackpad:** `move` with `pointers` 1 and `move: "mouse"` (default)
  → `mouseMove(dx, dy)`; `move` with `pointers` 2 and a `keyWheel`
  target → `keyPress(up)` (negative `dy`) or `keyPress(down)` once each
  time the accumulated `dy` reaches 20 px, resetting the accumulator,
  and any move that is not two-finger resets it; a `tap` with three or
  more pointers is ignored; `tap { pointers: 1 }` → `press` then `release` of `tap`;
  `tap { pointers: 2 }` → the same for `twoFingerTap`; `holdStart` →
  `press(hold)`, `holdEnd` → `release(hold)`. Unmapped events are
  ignored.
- **`bindKey`** counts as a binding; binding the same code again
  replaces the earlier record and retires its `Unsubscribe`. It remaps
  a physical key code to a different target at this layer, for deployments that want, say, `KeyW` to act as
  `ArrowUp`. It is consulted by nothing automatically; `KeyboardSource`
  takes a `filter`, and a deployment that wants remapping composes a
  `filter` that returns `false` for the source and routes through
  `bindKey`'s target itself. Kept minimal on purpose.
- `unbindAll` unsubscribes and releases everything; `destroy` does that
  and rejects further binds with `DESTROYED`.

### 16.3 Tests

**`spec/07-input-target.test.ts`** covers the DOM-free part: the
predicates (`isInputTarget`, `isDPadMap`, `isAnalogStickMap`,
`isTrackpadMap`) per condition, and `InputMapper.press`/`release`
against a real `DosInput` on a `FakeEmulatorSession`, one case per
`InputTarget` kind.

**`browser/11-input-mapper.test.ts`** mounts real primitives on
`#surface` (the harness creates extra surfaces on demand for a mapper
case that needs two) with a real `DosInput` on a
`FakeEmulatorSession`. Cases per bind method: the mapped event reaches
the session as the right call; an unmapped direction does nothing;
stick `keys` mode presses `right` at `x = 0.6` and releases at `0.4`;
trackpad two-finger tap sends the `twoFingerTap` target; unsubscribe
of a binding whose button is still pressed sends the release;
`destroy` then `bindButton` throws `DESTROYED`.

---

## 17. `GamepadSource`

Gamepad API → `DosInput` (roadmap Milestone 10). Polled, because the
Gamepad API is polled.

### 17.1 Declarations

```ts
// GamepadSource/types.ts
interface GamepadSnapshotLike {
    readonly index: number;
    readonly connected: boolean;
    readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
    readonly axes: ReadonlyArray<number>;
}
interface GamepadProviderLike {
    getGamepads(): ReadonlyArray<GamepadSnapshotLike | null>;
}
interface GamepadMap {
    readonly buttons: Readonly<Record<number, InputTarget>>;
    readonly axes: Readonly<Record<number, { readonly axis: JoystickAxis } | { readonly negative: InputTarget; readonly positive: InputTarget; readonly threshold?: FiniteNumber }>>;
    readonly deadZone?: FiniteNumber;
}
interface GamepadSourceConfig {
    readonly input: DosInput;
    readonly provider: GamepadProviderLike;
    readonly scheduler: FrameScheduler;
    readonly map: GamepadMap;
    readonly gamepadIndex?: number;
}
function isGamepadMap(value: unknown): value is GamepadMap;
function isGamepadSourceConfig(value: unknown): value is GamepadSourceConfig;

// GamepadSource/GamepadSource.ts
class GamepadSource {
    static readonly DEFAULT_DEAD_ZONE: FiniteNumber;   // 0.15
    constructor(config: GamepadSourceConfig);
    get isPolling(): boolean;
    get isConnected(): boolean;
    start(): void;
    stop(): void;
    poll(): void;
    destroy(): void;
    static init(config: Omit<GamepadSourceConfig, "provider" | "scheduler"> & Partial<Pick<GamepadSourceConfig, "provider" | "scheduler">>): GamepadSource;
}
```

### 17.2 Behavior

- `start` schedules `poll` every frame through `scheduler`; `stop`
  cancels and releases all mapped targets. `poll` reads the gamepad at
  `gamepadIndex` (default: first non-null connected), diffs button
  pressed states against the last poll and calls `InputMapper.press`/
  `release` for each change; for each mapped axis, either forwards to
  `joystickAxis` after the dead zone or quantizes to
  `negative`/`positive` targets by `threshold` (default `0.5`) with
  hysteresis at `threshold - 0.1`. A gamepad that disappears releases
  everything.
- `init` defaults `provider` to `navigator` and `scheduler` to
  `requestAnimationFrame`/`cancelAnimationFrame` when they exist.

### 17.3 Tests (`spec/08-gamepad-source.test.ts`)

Runs under Node: the provider and scheduler are injected and no DOM is
involved. `FakeGamepadProvider` with a settable snapshot and
`FakeScheduler` driven by `tick`. Cases: button press then release reaches the
session once each; axis to joystick with dead zone; axis to keys with
hysteresis (`0.6` press, `0.45` still held, `0.35` release);
disconnect releases; `stop` releases.

---

## 18. `DosStorage`

Persistence across sessions (roadmap §17, Milestone 9). Stores the
overlay `DosPlayer.persist()` returns; the deployment passes it back as
`game.changes` on the next start. The base bundle is never stored:
the probe (§4.2) showed the overlay is cumulative against the bundle
and small (bytes, not the 691 KB game), so the bundle stays a static
asset and only the saves live in the browser.

### 18.1 Declarations

```ts
// DosStorage/types.ts
interface DosStorageConfig {
    readonly key: NonEmptyString;
    readonly indexedDB: IDBFactoryLike;
}
interface IDBFactoryLike {
    open(name: string, version?: number): IDBOpenDBRequest;
}
function isDosStorageConfig(value: unknown): value is DosStorageConfig;
function isIDBFactoryLike(value: unknown): value is IDBFactoryLike;

// DosStorage/DosStorage.ts
class DosStorage {
    static readonly DB_NAME: NonEmptyString;      // "dos-game-runtime"
    static readonly STORE_NAME: NonEmptyString;   // "bundles"
    constructor(config: DosStorageConfig);
    get key(): NonEmptyString;
    save(bytes: Uint8Array): Promise<void>;
    load(): Promise<Uint8Array | null>;
    clear(): Promise<void>;
    static init(config: Omit<DosStorageConfig, "indexedDB"> & { indexedDB?: IDBFactoryLike }): DosStorage;
}
```

### 18.2 Behavior

- One object store keyed by the deployment's `key` (a per-game
  identifier the deployment chooses). `save` overwrites; `load` returns
  `null` when nothing is stored; `clear` deletes the key. Every
  IndexedDB failure becomes `STORAGE_FAILED` with the caught value as
  `data`. `init` without `indexedDB` when `globalThis.indexedDB` is
  absent throws `UNSUPPORTED`.
- The intended deployment flow, in `README.md` not in code: `const
  changes = await storage.load(); game = { bundle: "/game/game.jsdos",
  changes: changes ?? undefined };` before `DosPlayer.init`, and `const
  overlay = await player.persist(); if (overlay !== null) await
  storage.save(overlay);` on a save button or `visibilitychange`. A
  `null` from `persist` means nothing changed and the stored overlay is
  left alone. Deciding *when* to persist is the deployment's.

### 18.3 Tests (`browser/13-dos-storage.test.ts`, `spec/09-storage-config.test.ts`)

`spec/09` drives `isDosStorageConfig` and `isIDBFactoryLike` per
condition against plain objects. `browser/13` runs against the
browser's real `indexedDB`, in a fresh context per case so nothing
persists between cases. Round trip of a 3-byte array; `load`
empty → `null`; `clear` then `load` → `null`; `save` then
`page.reload()` then `load` returns the bytes, which is the actual
persistence claim; two instances with different keys do not see each
other's bytes. Failures use `FailingIndexedDB`, a `support/` double
whose `open` returns a request that fires `onerror`, or whose store
rejects `put` or `get`, each giving `STORAGE_FAILED`. `init` with
`indexedDB` deleted from a test-local config object throws
`UNSUPPORTED`.

---

## 18b. `DosDeployment`

Deployment composition (roadmap §3, §4, §11, Milestone 7). One config
describes a whole game page: the bundle, the display, and every
control with its surface and its meaning. `DosDeployment` constructs
the player, the sources, the primitives and the mapper from it and
owns their lifecycle. The runtime still contains no mapping: every
surface, key code and gesture policy comes in through the config.

### 18b.1 Declarations

```ts
// DosDeployment/types.ts
interface KeyboardControl {
    readonly enabled?: boolean;
    readonly filter?: (code: KeyCode) => boolean;
    readonly preventDefault?: boolean;
}

interface MouseControl {
    readonly enabled?: boolean;
    readonly sensitivity?: FiniteNumber;
    readonly touch?: MouseTouchMode;
    readonly pointerLock?: boolean;
}

interface ButtonControl {
    readonly surface: InputSurface;
    readonly target: InputTarget;
    readonly hold?: InputTarget;
    readonly holdDelayMs?: FiniteNumber;
}

interface DPadControl {
    readonly surface: InputSurface;
    readonly map: DPadMap;
    readonly deadZone?: FiniteNumber;
    readonly diagonals?: boolean;
}

interface StickControl {
    readonly surface: InputSurface;
    readonly map: AnalogStickMap;
    readonly deadZone?: FiniteNumber;
    readonly radius?: FiniteNumber;
}

interface TrackpadControl {
    readonly surface: InputSurface;
    readonly map: TrackpadMap;
    readonly sensitivity?: FiniteNumber;
    readonly tapMaxMs?: FiniteNumber;
    readonly tapMaxDistance?: FiniteNumber;
    readonly holdDelayMs?: FiniteNumber;
}

interface ControlsConfig {
    readonly keyboard?: KeyboardControl;
    readonly mouse?: MouseControl;
    readonly buttons?: ReadonlyArray<ButtonControl>;
    readonly dpads?: ReadonlyArray<DPadControl>;
    readonly sticks?: ReadonlyArray<StickControl>;
    readonly trackpads?: ReadonlyArray<TrackpadControl>;
}

interface DosDeploymentConfig {
    readonly canvas: HTMLCanvasElement;
    readonly container: HTMLElement;
    readonly game: DosGameConfig;
    readonly controls?: ControlsConfig;
    readonly keyboardTarget?: GestureSourceLike;
    readonly adapter?: EmulatorAdapter;
    readonly fetch?: FetchLike;
    readonly storage?: DosStorage;
}

function isKeyboardControl(value: unknown): value is KeyboardControl;
function isMouseControl(value: unknown): value is MouseControl;
function isButtonControl(value: unknown): value is ButtonControl;
function isDPadControl(value: unknown): value is DPadControl;
function isStickControl(value: unknown): value is StickControl;
function isTrackpadControl(value: unknown): value is TrackpadControl;
function isControlsConfig(value: unknown): value is ControlsConfig;
function isDosDeploymentConfig(value: unknown): value is DosDeploymentConfig;

// DosDeployment/DosDeployment.ts
class DosDeployment {
    constructor(config: DosDeploymentConfig);

    get player(): DosPlayer;
    get storage(): DosStorage | null;
    get mapper(): InputMapper | null;
    get keyboard(): KeyboardSource | null;
    get mouse(): MouseSource | null;
    get keyboardEnabled(): boolean;
    set keyboardEnabled(value: boolean);
    get mouseEnabled(): boolean;
    set mouseEnabled(value: boolean);
    get isStarted(): boolean;

    start(): Promise<void>;
    save(): Promise<boolean>;
    fullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    destroy(): Promise<void>;

    static init(config: DosDeploymentConfig): Promise<DosDeployment>;
}
```

`KeyCode`, `FiniteNumber`, `InputSurface`, `GestureSourceLike`,
`EmulatorAdapter` and `FetchLike` are from the shared and class types
already declared; `InputTarget`, `DPadMap`, `AnalogStickMap` and
`TrackpadMap` from `InputMapper`; `MouseTouchMode` from `MouseSource`;
`DosGameConfig` from `DosPlayer`; `DosStorage` from §18.

### 18b.2 Behavior

- **Construction.** Validates with `isDosDeploymentConfig` (throws
  `INVALID_CONFIG`; a control whose `surface` is not an `InputSurface`,
  whose `target` fails `isInputTarget` or whose `map` fails its map
  predicate fails the whole config). Constructs the `DosPlayer` from
  `canvas`, `container`, `game`, `adapter` and `fetch`; `adapter` is
  required by the constructor, and `init` is `async` because it awaits
  `JsDosEmulatorAdapter.init({ pathPrefix: "/emulators/" })` when none
  is given, as `DosPlayer.init` does. Constructs nothing else yet:
  sources, primitives and the mapper need a running input.
  `keyboardTarget` defaults to `container.ownerDocument`.
- **`start`.** Awaits `player.start()`. Then, when `controls.keyboard`
  is present, constructs a `KeyboardSource` on `keyboardTarget` with
  its `filter` and `preventDefault`, attached, `enabled` per the
  control (default `true`). When `controls.mouse` is present,
  constructs a `MouseSource` on `canvas` with its `sensitivity` and
  `touch`, `pointerLock` set to `canvas` when `pointerLock` is `true`,
  attached, `enabled` per the control. Constructs an `InputMapper` and,
  for each entry of `buttons`, `dpads`, `sticks` and `trackpads`, the
  primitive on its `surface` with its options, attached, and binds it
  through the mapper with its `target` or `map`; a button's `hold`
  target, when given, is pressed on the button's `hold` event and
  released on its `release`. `isStarted` becomes `true`. A second
  `start` while started throws `ALREADY_STARTED`; a failed
  `player.start()` rejects with its error and leaves nothing attached.
- **Enable gates.** `keyboardEnabled` and `mouseEnabled` read and set
  the matching source's `enabled`; before `start`, or when the control
  is absent, the getter returns `false`, and the setter records the
  value for the source to take at `start`. Setters reject a
  non-boolean with `INVALID_CONFIG`.
- **Session exit.** When the player's `exit` event fires, the sources,
  primitives and mapper are destroyed and `isStarted` returns to
  `false`; `keyboard`, `mouse` and `mapper` read `null` again, the
  enable getters read `false`, and the recorded enable values persist
  so a later `start` rebuilds the controls with the last values set.
  `isStarted` is `false` before the first `start` too.
- **Control ranges.** The control predicates enforce the ranges the
  primitives' own predicates enforce (positive sensitivities and
  radius, dead zones in their classes' ranges, non-negative delays), so
  a config that constructs cannot fail inside `start`. Unknown extra
  fields are not rejected.
- **`destroy`.** Destroys the sources, primitives and mapper, then
  awaits `player.destroy()`. Idempotent.
- **Persistence.** With `storage` given, `init` (not the constructor)
  loads the stored overlay first and, when `game.changes` is undefined
  and the load returns bytes, constructs with `game.changes` set to
  them, so a page restores its saves by naming a storage. `save()`
  awaits `player.persist()`; on `null` it resolves `false` and leaves
  the store alone; otherwise it stores the overlay and resolves `true`.
  Without `storage`, `save()` rejects with `UNSUPPORTED`. `storage`
  reads the configured instance or `null`. Deciding when to call
  `save()` stays the page's: a save button, `visibilitychange`, or a
  timer.
- **Fullscreen.** `fullscreen()` and `exitFullscreen()` delegate to
  the player's display, whose target is the `container`; a page that
  wants its controls visible in fullscreen makes the container the
  element that holds both the canvas and the controls. Errors
  propagate as the display raises them (`UNSUPPORTED`,
  `FULLSCREEN_FAILED`).
- **What it is not.** No layout, no CSS, no default map, no game
  detection. Every surface is an element the page created and placed;
  every target is the page's decision. This class only saves a page
  from writing the same composition twice.

### 18b.3 Tests

**`spec/08-deployment-config.test.ts`**: the eight predicates per
condition, against plain objects; surfaces are objects with the three
`InputSurface` functions, which needs no DOM, and `canvas`/`container`
are checked only when the DOM globals exist, so under Node any object
passes those two conditions.

**`browser/12-dos-deployment.test.ts`**: constructed in-page on the
harness canvas and container with a `FakeEmulatorAdapter` resolving a
`FakeEmulatorSession`, and controls whose surfaces are `#surface` and
divs created in `#extra`. Cases: `start()` resolves, `isStarted` is
true, `keyboard` and `mouse` are sources when their controls are
present and `null` when absent; a dispatched `keydown` on the document
reaches the session; a real `page.mouse.move` over the canvas reaches
it as a position; a synthetic pointerdown on a button surface presses
its target and pointerup releases it; a D-pad drag presses and releases
its mapped directions; `mouseEnabled = false` releases a held left
button and a later move sends nothing; `mouseEnabled = false` set
before `start` yields a mouse source with `enabled` false after start;
the fake session's `emitExit` makes `isStarted` false and a following
keydown sends nothing; `destroy` calls `session.exit` once and a second
`destroy` does nothing; construction rejects a button whose `target`
is `{ kind: "nope" }` and a d-pad whose `surface` is `{}` with
`INVALID_CONFIG`; `start` twice throws `ALREADY_STARTED`. Persistence:
with a `DosStorage` in the config (a real one, on a fresh key) and the
fake session's `persist` scripted to resolve a 3-byte overlay, `save()`
resolves `true` and `storage.load()` returns those bytes; with `persist`
resolving `null`, `save()` resolves `false` and a previously stored
overlay is untouched; `init` with a storage that already holds an
overlay yields an adapter `startCalls[0].changes` equal to it after
`start`, and with `game.changes` given explicitly the stored overlay is
ignored; without `storage`, `save()` rejects with `UNSUPPORTED` and
`storage` reads `null`.

## 19. Test support (`tests/support/`)

Doubles are written to the code style as classes, each a double of a
contract declared in §2 or a class's `types.ts`, never of an
implementation. They are plain TypeScript with no Node imports, so the
same file is imported by a `spec` test under Node and bundled into the
harness for a `browser` test.

| Double | Of | Scripting surface | Used by |
|---|---|---|---|
| `FakeEmulatorSession` | `EmulatorSession` | `calls: { method, args }[]`; `script(method, "resolve" \| "reject" \| "throw", value)`; `emitFrame(frame)`, `emitSound(samples)`, `emitExit()`; `soundFrequency` 44100 | spec, browser |
| `FakeEmulatorAdapter` | `EmulatorAdapter` | `script("resolve", session)` / `script("reject", error)`; `startCalls` | browser |
| `FakeGamepadProvider` | `GamepadProviderLike` | `snapshot` settable | spec |
| `FakeTimer` | `TimerLike` | `advance(ms)` | browser |
| `FakeScheduler` | `FrameScheduler` | `tick(time)` | spec |
| `FailingIndexedDB` | `IDBFactoryLike` | `failOn("open" \| "put" \| "get")` | browser |

There is no fake element, canvas, surface or document: DOM objects are
always real, in the browser.

`fixtures.ts` exports:

| Function | Does |
|---|---|
| `thrownBy(fn)` | Returns the thrown value, or `undefined` when nothing was thrown |
| `rejectedBy(promise)` | Same for a rejection |
| `errorSnapshot(value)` | `{ isRuntimeError, code, label }` for `equals` comparison |
| `browserSkipReason()` | `undefined` when Playwright and Chromium are available; otherwise the reason string for a manifest's `skip` |
| `withHarness(fn)` | Starts `harness-server.ts` on port 0, awaits `fn(url)`, stops the server in a `finally`; returns what `fn` returned |

`harness-server.ts` is the `node:http` server described in §1.7,
exported as `startHarnessServer(port)` returning `{ url, stop }`.
`fixtures.ts` and `harness-server.ts` are the only files under
`tests/` that import from `node:`; the doubles never do.

---

## 20. Milestone map

How the roadmap's milestones (§18) land in this package. Each row is
done when its `spec` and `browser` tests pass and the manual check,
where there is one, has been done in `npm run harness`. Manual checks
exist only where headless Chromium cannot grant something (fullscreen,
pointer lock, audible audio, a real phone's touch stack, a physical
gamepad).

| Milestone | Classes | Automated | Manual |
|---|---|---|---|
| 1 Bare DOS execution | `shared.types`, `DosRuntimeError`, `JsDosEmulatorAdapter`, harness | `browser/01`: session, frame, key, persist, exit | Audio audible: boot `beep.jsdos` (a committed PC-speaker test program under `tests/browser/harness/beep/`) from the harness page and hear three beeps. the test game is silent on its opening screens under DOSBox (probe record), so it is not the audio check |
| 2 `DosPlayer` boundary | `DosInput`, `DosDisplay`, `DosAudio`, `DosPlayer` | `spec/03`, `spec/04`, `browser/02`–`04`: boot through `DosPlayer.init` only; page imports nothing from `emulators` | — |
| 3 Physical keyboard | `KeyboardSource` | `browser/05` | Hold two keys in the test program |
| 4 Physical mouse | `MouseSource` | `browser/06` | Pointer lock; drag in a mouse-driven program |
| 5 Touch buttons and D-pad | `Button`, `DPad`, `InputMapper` (button/dpad parts) | `spec/05`, `spec/07`, `browser/07`, `08`, `11` | On a phone, with `touch-action: none` |
| 6 Touch trackpad | `Trackpad`, `InputMapper` (trackpad part) | `browser/10`, `11` | On a phone |
| 7 Game-specific composition | `DosDeployment`; `enabled` gates on both sources; `touch: "absolute"` on `MouseSource`; `README.md` deployment guide; harness rewritten as a deployment | `spec/08`, `browser/12`, `browser/05`–`06` gate cases; a grep that no map literal exists under `src/` | Harness page on desktop and phone, composed only through `DosDeployment` config |
| 8 Responsive / fullscreen mobile | `DosDisplay.onLayout` and fullscreen re-layout; `DosDeployment.fullscreen`; the harness as a phone-shaped deployment (fixed play area, controls overlaid with safe-area insets, `viewport-fit=cover`, `overscroll-behavior: none`, `touch-action: none`, an `AnalogStick` option) | `spec/06`, `browser/02` resize and `onLayout`, `browser/09`, `browser/12` fullscreen rejection without a gesture | On a phone: rotate between portrait and landscape, enter and leave fullscreen with the controls still usable, no page scroll or pull-to-refresh during play, controls clear of the notch and home indicator |
| 9 Persistence | `DosStorage`; `storage` and `save()` on `DosDeployment` | `spec/09`, `browser/13` including the reload case, `browser/12` persistence cases | Verified headlessly against the test game: its quit-and-save writes its save file, `save()` stores a 20 KB overlay, a page reload and reboot restore it, and its load command restores the game; DOS directory listings see restored files without a `rescan` |
| 10 Physical gamepads | `GamepadSource` | `spec/08` | A USB or Bluetooth pad, mapped to keys: the js-dos adapter has no joystick input (§4.2) |

Implementation order within the package is the class order in §1.2,
which is also milestone order except that `AnalogStick` (needed by 8)
is written with the other primitives in 5–6 because it shares their
test fixtures.

---

## 20b. Game pages (`deployments/`)

Real game pages live beside the package, not in it: `deployments/<name>/`
holds one page per game (`index.html`, `main.ts`), imports the runtime
from `src/index.ts`, and is served by the harness server at `/<name>`
with its `main.ts` bundled like the harness and its bundle aliased from
the git-ignored game files. The first hand page (kept locally, with the games) is a title
screen whose Play tap is the audio-unlock gesture, a corner menu with
pause, fullscreen, touch controls and pad choice, sound, save, clear
saves and exit, the phone play layout, autosave, and this game's
controller map. Everything in it is the page's decision; nothing in it
is imported by `src/` or by the tests.

**Departure:** `scaffolding.md` says nothing else lives at the package
root. `deployments/` does, because the pages are what the runtime
exists for and they must import `src/` directly to be served unbuilt;
they are excluded from the published package (`files` lists `dist`
only) and type-checked through `tsconfig.tests.json`. The root harness
page stays the test interface the browser suites drive.

## 21. What this spec deliberately leaves to the deployment

Restating the roadmap's boundary as things this package must not grow:

- No default key map, D-pad layout, button set or gesture policy. The
  harness page is the only place a map exists in the repo, and it is a
  test fixture.
- No CSS beyond `canvas.style.width/height`. Safe areas, orientation,
  letterbox color, control placement are deployment CSS.
- No game loader, manifest format, or bundle catalog. `DosGameConfig`
  is one bundle and one optional saves overlay. Which program runs is
  the bundle's `dosbox.conf`, authored by the deployment.
- No save-state UI, account, or server.
- No second adapter yet. The interface exists so one can be added
  without touching anything above it; writing it is a separate piece
  of work, started by the probe in §4.3 against direct DOSBox WASM.
