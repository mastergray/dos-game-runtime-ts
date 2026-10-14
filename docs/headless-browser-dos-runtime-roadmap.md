# Headless Browser DOS Runtime — Roadmap

## 1. Project Definition

This project is:

> **A headless browser DOS runtime plus reusable input primitives, where each game deployment owns everything above that boundary.**

It is not a DOS game launcher, game library, emulator frontend, universal virtual gamepad, or deployment framework.

The reusable project provides the machinery required to execute DOS software in a browser and translate browser-side interaction into DOS input. It deliberately does not determine how a particular game page looks, which controls it exposes, how those controls are arranged, or what those controls mean.

The boundary is:

```text
Game Deployment
│
├── game files
├── page / DOM
├── visual design
├── layout
├── controller composition
├── input mappings
└── game-specific configuration
        │
        ▼
Headless Browser DOS Runtime
│
├── DOS execution
├── filesystem
├── video
├── audio
├── persistence
├── input API
│   ├── keyboard
│   ├── mouse
│   └── joystick
└── input primitives
    ├── Button
    ├── DPad
    ├── AnalogStick
    └── Trackpad
        │
        ▼
Emulator Backend
│
└── DOSBox / DOSBox-X / WASM
```

The initial emulator backend can use the js-dos/emulators infrastructure where it saves useful browser-integration work. That dependency should remain behind an adapter so it can later be replaced with direct DOSBox/WASM integration without changing the public runtime or deployment model.

### Ownership Rule

A useful test for deciding whether functionality belongs in the runtime is:

> **Does every deployment need the mechanism, independent of what the game-specific interface looks like?**

If yes, it probably belongs in the runtime. If it determines presentation, layout, game semantics, or game-specific behavior, it belongs in the deployment.

For example:

```text
Runtime owns                         Deployment owns
─────────────────────────────────   ───────────────────────────────
DOS execution                       Which game executes
Keyboard injection                  Which action maps to which key
Relative mouse injection            Mouse sensitivity/configuration
Pointer tracking mechanics          Where a trackpad appears
Multi-touch mechanics               Which touch controls exist
Framebuffer output                  How the display is presented
Audio plumbing                      Page-level audio controls/UI
Persistent filesystem mechanism     Game-specific save expectations
```

### Input Primitives Are Mechanical, Not Semantic

Input primitives provide reusable interaction mechanics without imposing game meaning or presentation.

For example, a `DPad` can detect directional pointer input and expose:

```text
up
down
left
right
```

It does not decide that `up` means `ArrowUp`, where the D-pad is positioned, or how it is styled. The deployment makes those decisions.

Likewise, a `Trackpad` can produce:

```text
move(dx, dy)
tap
hold
multi-pointer gestures
```

The deployment determines whether those events become DOS mouse movement, left/right clicks, or some game-specific mapping.

This distinction keeps the runtime genuinely headless.

---

## 2. Architectural Boundary

```text
Game Deployment
│
├── Page / visual design
├── Game files
├── Game configuration
└── Controller configuration
        │
        ▼
Shared DOS Web Runtime
│
├── DosPlayer
├── Display
├── Input
│   ├── Keyboard
│   ├── Mouse
│   ├── Gamepad
│   └── Touch
├── Storage
└── Emulator Adapter
        │
        ▼
DOSBox / DOSBox-X WASM
```

The important boundary is:

> The runtime knows how to run DOS software and inject input. The deployment knows what game is being run and how the user should interact with it.

---

## 3. Deployment Model

There is no general-purpose game loader in the initial design.

A deployment might look like:

```text
game/
├── index.html
├── src/
│   ├── main.js
│   ├── game.js
│   └── controls.js
├── game/
│   └── game.jsdos
├── runtime/
│   └── ...
└── assets/
    └── ...
```

Different games can therefore have completely different interfaces while sharing the same runtime.

For example:

```text
doom/
├── Doom-specific page
├── Doom-specific touch controls
├── Doom files
└── shared runtime

keen/
├── Keen-specific page
├── Keen-specific touch controls
├── Keen files
└── shared runtime
```

This avoids forcing every DOS game into a universal launcher or universal controller.

---

## 4. Game Configuration

Each deployment should define its emulator requirements explicitly.

Example:

```javascript
export default {
    bundle: "/game/game.jsdos",

    executable: "GAME.EXE",

    display: {
        aspectRatio: 4 / 3
    },

    emulator: {
        type: "dosbox"
    }
};
```

The exact configuration format can evolve as the emulator API becomes concrete.

The important point is that configuration belongs to the deployment rather than being inferred by the runtime.

---

## 5. Shared `DosPlayer`

Create a thin application-facing abstraction:

```javascript
const player = new DosPlayer({
    canvas,
    game
});

await player.start();
```

Initial responsibilities:

```text
DosPlayer
├── initialize emulator
├── mount/load game files
├── start executable
├── connect display
├── expose input API
├── pause/resume
├── fullscreen
└── destroy emulator
```

The rest of the application should not depend directly on the js-dos/emulators API.

This gives us an explicit replacement boundary:

```text
Application
    │
    ▼
DosPlayer
    │
    ▼
EmulatorAdapter
    │
    ├── js-dos/emulators initially
    │
    └── direct DOSBox/WASM later
```

---

## 6. Input Model

Input should be represented independently of the physical control producing it.

```text
Physical Input
      │
      ▼
Input Mapper
      │
      ▼
DOS Input
```

Supported DOS input classes:

```text
Input
├── Keyboard
├── Mouse
└── Joystick / Gamepad
```

Supported browser-side input sources:

```text
Browser Input
├── physical keyboard
├── physical mouse
├── browser Gamepad API
├── touchscreen buttons
├── touchscreen D-pad
├── touchscreen joystick
└── touchscreen trackpad
```

A touchscreen button and a physical keyboard key can therefore produce exactly the same logical DOS input.

---

## 7. Keyboard Input

The runtime should expose operations resembling:

```javascript
input.keyDown("ControlLeft");
input.keyUp("ControlLeft");
```

The emulator adapter translates these into whatever representation the underlying DOSBox implementation expects.

This API is then reusable by:

- physical keyboard events;
- virtual buttons;
- D-pads;
- gamepad mappings.

---

## 8. Mouse Input

Mouse support is a first-class requirement.

Many DOS games cannot be represented adequately using only a D-pad and action buttons, particularly:

- adventure games;
- strategy games;
- simulation games;
- editors/tools;
- FPS games using mouse look.

The runtime should expose at least:

```javascript
input.mouseMove(dx, dy);
input.mouseDown(button);
input.mouseUp(button);
```

Prefer **relative mouse movement** as the primitive because DOS games generally expect mouse deltas rather than browser page coordinates.

The browser layer can translate conventional mouse movement into these deltas.

---

## 9. Touch Mouse / Trackpad

Mobile deployments should be able to create a touch surface that behaves like a laptop trackpad.

```text
Touch movement
     │
     ▼
calculate delta
     │
     ├── dx
     └── dy
     │
     ▼
input.mouseMove(dx, dy)
```

Possible gestures:

```text
one-finger drag    -> mouse movement
tap                -> left click
two-finger tap     -> right click
tap-and-hold       -> mouse button held
two-finger drag    -> optional wheel/scroll behavior
```

Gesture policy should belong to the deployment/controller configuration rather than being permanently embedded in the emulator runtime.

Mouse sensitivity should also be configurable per game.

Example:

```javascript
mouse: {
    sensitivity: 1.25,
    tap: "left",
    twoFingerTap: "right"
}
```

---

## 10. Touch Controller Primitives

Do not build one universal mobile controller.

Build reusable primitives instead:

```text
Controls
├── Button
├── DPad
├── AnalogStick
├── Trackpad
└── MouseButton
```

A game's page composes whichever primitives make sense.

A platformer might use:

```text
┌───────────┐                   ┌─────┐
│     ▲     │                   │  B  │
│   ◀   ▶   │              ┌─────┐
│     ▼     │              │  A  │
└───────────┘              └─────┘

                  START
```

An adventure game might instead use:

```text
┌────────────────────────────────────┐
│                                    │
│              GAME                  │
│                                    │
├────────────────────────────────────┤
│                                    │
│           TOUCH TRACKPAD           │
│                                    │
│                         LEFT RIGHT │
└────────────────────────────────────┘
```

An FPS could combine movement, mouse-look, and action buttons.

---

## 11. Controller Mapping

Each deployment maps controls to DOS input.

Example:

```javascript
export default {
    dpad: {
        up: "ArrowUp",
        down: "ArrowDown",
        left: "ArrowLeft",
        right: "ArrowRight"
    },

    buttons: {
        fire: "ControlLeft",
        use: "Space",
        run: "ShiftLeft"
    },

    mouse: {
        enabled: true,
        sensitivity: 1.0,
        leftButton: true,
        rightButton: true
    }
};
```

The eventual schema should support mapping a control to:

- keyboard keys;
- mouse buttons;
- mouse movement;
- joystick buttons;
- joystick axes.

---

## 12. Pointer Events

Touch controls should be implemented primarily using browser Pointer Events rather than separate mouse and touch implementations.

This gives the controller layer one event model for:

- mouse;
- touch;
- stylus.

Controls need to handle both press and release reliably.

A virtual key must never remain logically held because the pointer moved outside a button or the browser cancelled the gesture.

Therefore controls should handle events such as:

```text
pointerdown
pointerup
pointercancel
lostpointercapture
```

Pointer capture will likely be useful for D-pads, analog controls, and trackpads.

---

## 13. Physical Gamepads

Browser Gamepad API support should fit through the same input mapping layer.

```text
Physical gamepad
      │
      ▼
Gamepad Mapper
      │
      ▼
DOS keyboard / joystick input
```

This allows a deployment to map a modern controller either to DOS joystick input or keyboard controls depending on what the game supports.

Physical gamepads are useful but are secondary to keyboard, mouse, and touch support for the first implementation.

---

## 14. Display

The display layer should initially provide:

- DOS framebuffer rendered into the browser;
- aspect-ratio preservation;
- responsive scaling;
- fullscreen;
- landscape mobile support;
- optional integer scaling where practical.

The game page controls presentation.

The runtime should not assume borders, menus, toolbars, title screens, or other player chrome.

---

## 15. Mobile Layout

Mobile layouts should be deployment-specific.

The runtime should expose the necessary components without deciding where they appear.

Important mobile concerns:

- landscape orientation;
- safe-area insets;
- preventing browser scrolling during gameplay;
- preventing accidental text selection;
- pointer capture;
- fullscreen behavior;
- touch-action CSS;
- controls large enough for reliable simultaneous presses.

Multi-touch is important. A player must be able to hold a direction while pressing another control.

---

## 16. Audio

Connect DOSBox audio to the browser's audio system.

Account for browser autoplay restrictions: audio initialization may need to occur after the user's first interaction with the page.

The runtime should own this browser/emulator plumbing rather than each deployment implementing it independently.

---

## 17. Persistent Storage

Eventually support persistence for:

- DOS save files;
- configuration changes;
- possibly emulator state.

Prefer browser-local persistence such as OPFS or IndexedDB where supported by the emulator architecture.

The initial milestone only needs ordinary in-game saving to survive during the current session. Persistent saves across browser sessions can follow once basic execution is reliable.

---

## 18. Initial Implementation Milestones

### Milestone 1 — Bare DOS Execution

Get one legal/test DOS executable running in the browser.

Success means:

- WASM emulator initializes;
- game filesystem mounts;
- executable starts;
- video appears;
- audio works.

No custom controller UI is required yet.

### Milestone 2 — `DosPlayer` Boundary

Hide emulator-specific operations behind `DosPlayer` and `EmulatorAdapter`.

The page should no longer directly call the js-dos/emulators API.

### Milestone 3 — Physical Keyboard

Implement:

```text
browser keyboard
       ->
Input
       ->
emulator
```

Verify press/release behavior and simultaneous keys.

### Milestone 4 — Physical Mouse

Implement relative movement and mouse buttons.

Verify:

```text
movement
left button
right button
dragging
```

Mouse behavior should be correct before building touch mouse emulation.

### Milestone 5 — Touch Buttons and D-pad

Implement reusable:

```text
Button
DPad
```

Map them through the same keyboard input API.

Verify multi-touch.

### Milestone 6 — Touch Trackpad

Implement:

```text
Trackpad
    ->
relative mouse deltas
    ->
Input.mouseMove()
```

Add left/right click gestures or explicit mouse buttons.

### Milestone 7 — Game-Specific Controller Composition

Move layout and mappings completely into the game deployment.

The shared runtime should contain no assumptions about which controls a game requires.

### Milestone 8 — Responsive / Fullscreen Mobile Experience

Handle:

- portrait/landscape changes;
- fullscreen;
- resizing;
- safe areas;
- touch-action suppression;
- browser navigation gesture conflicts where possible.

### Milestone 9 — Persistence

Persist DOS filesystem changes across sessions.

### Milestone 10 — Physical Gamepads

Add Gamepad API support and map it through the same input system.

---

## 19. First Prototype

The first useful prototype should deliberately stay small.

Target:

```text
one DOS game
one page
one canvas
physical keyboard
physical mouse
touch D-pad
2-4 touch buttons
touch trackpad
```

No game browser.

No universal launcher.

No generalized metadata database.

No account system.

No server-side emulator.

No elaborate save-state UI.

The purpose of the prototype is to prove the runtime/input boundary.

---

## 20. Proposed Runtime API

A reasonable target API is:

```javascript
const player = new DosPlayer({
    canvas,
    game
});

await player.start();

player.input.keyDown("ArrowUp");
player.input.keyUp("ArrowUp");

player.input.mouseMove(12, -4);

player.input.mouseDown("left");
player.input.mouseUp("left");

player.pause();
player.resume();
player.fullscreen();
player.destroy();
```

Everything specific to the underlying emulator should remain below this API.

---

## 21. Longer-Term Option: Remove js-dos

The first implementation should use the js-dos/emulators infrastructure where it saves significant browser integration work.

However, the architecture should not make it indispensable.

If the dependency becomes limiting, replace:

```text
EmulatorAdapter
      │
      ▼
js-dos/emulators
```

with:

```text
EmulatorAdapter
      │
      ▼
direct DOSBox WASM
```

The page, game configuration, controller primitives, and input mapping should remain largely unchanged.

This is why the emulator adapter and input abstraction are important from the beginning.

---

## 22. Core Design Principle

The project is a **headless browser DOS runtime plus input primitives**.

Everything above that boundary belongs to the game deployment.

Each deployment determines:

```text
what runs
how the page looks
how the display is arranged
what controls exist
where controls appear
what controls mean
how game-specific configuration is expressed
```

The runtime determines:

```text
how DOS executes
how files are mounted
how video/audio reach the browser
how keyboard input reaches DOS
how relative mouse input reaches DOS
how joystick input reaches DOS
how reusable pointer/touch mechanics work
how persistent storage is provided
```

The runtime should expose mechanisms rather than opinions. A deployment composes those mechanisms into the interface appropriate for its particular DOS game.

If a proposed runtime feature starts deciding game-page presentation, controller layout, or game-specific semantics, it has crossed the project boundary and belongs in the deployment instead.
