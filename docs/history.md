# History

The commit history of the runtime before the repository was published,
oldest first. The repository was then restarted from one commit so that
no commercial game files, configs or screenshots used as local test
material remain in its history; the game pages and manifests those
commits describe live on as ignored local folders.


## Runtime (Milestones 1 to 9)

- 2026-09-24: add headless DOS runtime through Milestone 2
- 2026-09-24: add KeyboardSource for physical keyboard input (Milestone 3)
- 2026-09-24: fix harness double boot and run the first test game through its launcher
- 2026-09-24: fix harness Boot button keeping focus so Enter rebooted the game
- 2026-09-24: set package author, repository and license holder to mastergray
- 2026-09-24: add MouseSource for physical mouse input (Milestone 4)
- 2026-09-24: send absolute mouse positions while unlocked; keep focus on the game
- 2026-09-24: add pointer primitives and InputMapper (Milestones 5 and 6)
- 2026-09-24: size frames from the command interface when onFrameSize is silent; LAN harness
- 2026-09-24: add DosDeployment, input gates and absolute touch (Milestone 7)
- 2026-09-28: harness: drop the type box's focus when a touch lands on the game or controls
- 2026-09-28: add DosStorage and deployment saves (Milestone 9)
- 2026-09-30: harness: autosave the overlay on an interval, on tab hide and on unload
- 2026-09-30: harness: clear saves restarts the game clean so autosave cannot store them back
- 2026-09-30: harness: clear saves works while no game is running
- 2026-10-01: add layout events, fullscreen re-layout and a phone play layout (Milestone 8)

## Game pages by hand

- 2026-10-01: add the first game page (a 1990 strategy RPG)
- 2026-10-01: first game page: tap outside resumes, Restart and Clear saves confirm in-panel, drop Pause, Save now and the pad choice
- 2026-10-01: first game page: stacked menu without a Resume button
- 2026-10-01: first game page: center the menu button labels
- 2026-10-01: first game page: BIOS-style text-mode theme
- 2026-10-01: first game page: autosave reports only failures
- 2026-10-01: first game page: the dialog footer shows play time, or the last save problem
- 2026-10-01: first game page: centered footer; title screen is the name and Play only
- 2026-10-01: add a second game page (a strategy game) with its setup prompts answered on boot; serve any deployments/<name>/
- 2026-10-01: second game page: answer setup with VGA, AdLib/Sound Blaster, mouse and keyboard
- 2026-10-01: second game page: no automatic setup answers; the game asks and the player answers
- 2026-10-01: add a third game page (an RPG) by copying a page, no runtime changes
- 2026-10-01: add a fourth game page (a simulation); its menu keycap sits top-right, clear of the game's menu bar
- 2026-10-01: fourth game page: menu keycap back at the top-left like every other page
- 2026-10-01: add a text-mode board game page through the same page
- 2026-10-01: board game page: run the 1989 version
- 2026-10-01: board game page: run the version the user chose
- 2026-10-01: first game page: Norton-style blue dialog theme selectable with ?theme=blue
- 2026-10-01: game pages: blue dialog on grey chrome as the one theme, applied to all five pages
- 2026-10-01: add an educational game page
- 2026-10-01: add an RPG page
- 2026-10-01: add another RPG page
- 2026-10-01: add a simulation page; pack-bundle writes directory entries
- 2026-10-01: docs: TODO for the deployment definition, touch controls, remaining runtime work
- 2026-10-01: add a city simulation page
- 2026-10-01: add a puzzle game page
- 2026-10-01: note packed progress files in the deployment TODO
- 2026-10-01: add a two-player artillery game page
- 2026-10-01: add a business simulation page
- 2026-10-01: fix a game's sound: pack the Sound Blaster config its setup program writes
- 2026-10-01: add a platformer page
- 2026-10-01: add a planet simulation page
- 2026-10-01: run the planet simulation in its 640x480 16-colour mode
- 2026-10-01: add a shooter page
- 2026-10-01: add a turn-based strategy page
- 2026-10-01: add a games index page at /games
- 2026-10-01: add a CGA helicopter shooter page; eighteen pages in all

## The deployment manifest

- 2026-10-01: spec the deployment manifest
- 2026-10-01: manifest spec: JSON files, not TypeScript
- 2026-10-01: manifest spec: each deployment is self-contained
- 2026-10-01: manifest spec: note the planned React version and keep the shell's state DOM-free
- 2026-10-01: manifest spec: prove the fields on four games, not one
- 2026-10-01: manifest spec: manifests/ beside deployments/, three games first
- 2026-10-01: manifest step 1: types, parser, packer mode, schema, server discovery
- 2026-10-01: manifest steps 2 and 3: the shell, and the first game through it
- 2026-10-01: manifest steps 4 and 5: the second and third games through the shell
- 2026-10-01: drop the setup hint; the game's own prompts explain themselves
- 2026-10-01: drop the other hints too; no manifest page shows hints for now
- 2026-10-01: first manifest: save verified through the shell (save, reload, restore)
- 2026-10-01: second manifest: save verified by hand (save, reload, load from drive C)
- 2026-10-01: third manifest: save verified through the shell, with the game's prompt and save quirks recorded
- 2026-10-01: second manifest: record how its menus and saves work; overwrite-and-load verified headlessly

## The shell's touch controls

- 2026-10-01: shell: theme the touch controls as keycaps
- 2026-10-01: shell: keyboard overlay with modifier latches, and quick keys from the manifest
- 2026-10-02: shell: placed control components that never cover the picture
- 2026-10-02: shell: keys-row component, smaller portrait d-pad, roomier menu bar
- 2026-10-02: shell: bigger landscape picture via compact letters and digits
- 2026-10-02: shell: controls hug the picture, inline components, Backspace, digits for the strategy game
- 2026-10-04: shell: letters and digits in any column count, MENU left, inline keys beside the portrait d-pad
- 2026-10-10: shell: phone-style keyboard component with letters and numbers panes
- 2026-10-10: shell: full keyboard in three panes with punctuation and Enter
- 2026-10-10: shell: digits and punctuation show their shifted glyphs while Shift is latched
- 2026-10-10: shell: arrow cluster and Esc on every keyboard pane; portrait is the keyboard alone
- 2026-10-10: shell: arrows as a keyboard pane of their own
- 2026-10-10: shell: keyboard panes switch through a tab row under the keyboard
- 2026-10-10: shell: pane tabs above the keyboard
- 2026-10-10: shell: Esc and F1-F12 as a fixed row above the keyboard panes
- 2026-10-10: shell: ask for a portrait lock when entering fullscreen (Android grants it, others ignore it)
- 2026-10-10: shell: landscape splits the screen between the picture and the keyboard
- 2026-10-11: shell: MENU stays left unless a right column is shown; portrait picture shrinks rather than scrolls
- 2026-10-12: shell: lower-case letters that capitalise under Shift; Nav pane as a compass with diagonals
- 2026-10-12: shell: the compass centre is empty rather than a numpad-5 key
- 2026-10-12: shell: Enter at the centre of the compass

## More games on manifests, and the games index

- 2026-10-12: shell: Esc at the centre of the compass
- 2026-10-12: manifest: the RPG
- 2026-10-12: manifest: the business simulation, the first to use a pack-time overlay
- 2026-10-12: manifest: the city simulation, the first to use a stage directory
- 2026-10-12: manifest: the ant simulation
- 2026-10-12: manifest: the second RPG
- 2026-10-12: manifest: the planet simulation
- 2026-10-12: manifest: the life simulation
- 2026-10-12: manifest: the puzzle game
- 2026-10-12: manifest: the educational game

## Menu bar, themes, screen modes and keyboard styles

- 2026-10-12: manifests: games index at /manifests/ from every manifest's metadata
- 2026-10-12: shell: optional menu bar (metadata.menu), tried on one game
- 2026-10-12: shell: menu bar is a QBasic-style strip of pull-downs
- 2026-10-12: shell: rule and gap under the menu bar
- 2026-10-12: shell: fixed 8px gap under the menu bar
- 2026-10-12: shell: menu bar is a View toggle for every game; touch devices start on it
- 2026-10-12: shell: remember touch controls and menu bar in the browser
- 2026-10-12: shell: Theme under View (Black, Blue, Grey, Teal), remembered
- 2026-10-12: shell: Dark grey and Beige themes
- 2026-10-12: shell: Off white theme
- 2026-10-12: shell: keycap, tab and menu bar colours per theme
- 2026-10-12: shell: fullscreen with touch off shows the game alone; bar peeks at the top edge; Escape kept for the game
- 2026-10-12: shell: fullscreen forces the menu bar on so leaving it needs no Escape
- 2026-10-12: shell: four fullscreen modes chosen in the dialog (plain or stretched, with or without the menu bar), remembered
- 2026-10-12: shell: Screen mode chooser adds window Stretched modes; hidden bar returns from the top edge
- 2026-10-12: shell: window Stretched always keeps the menu bar
- 2026-10-12: shell: bar-less window Stretched is back; the top edge reveals the bar
- 2026-10-12: shell: parked bar returns on leaving through the top edge, or a top-pixel dwell in fullscreen
- 2026-10-12: shell: PicoCalc-inspired keyboard style (compass with Esc centre beside F-keys), tried on one game
- 2026-10-12: shell: pico keyboard swaps panes from a 123 / ABC key instead of a tab row
- 2026-10-12: manifest: the strategy game uses the pico keyboard
- 2026-10-13: shell: compass gets explicit widths for Safari; portrait keycaps grow with the screen
- 2026-10-13: shell: portrait keyboard spans the width while key height yields to the picture
- 2026-10-13: shell: Keyboard under View cycles Tabs, Phone and Pico styles, remembered
- 2026-10-13: shell: Keyboard opens a chooser like Screen mode; the d-pad style is named Compass
- 2026-10-13: shell: phone keyboard drops the Nav key; chooser labels shortened
- 2026-10-13: shell: keyboard chooser names each style before its description
- 2026-10-13: manifests: every keyboard starts on the Compass style

## Standalone builds

- 2026-10-13: manifests: the simulations, the board game and the educational game start on the Tabs keyboard
- 2026-10-13: build-manifests: self-contained game folders and index at any address; harness shares the page fillers
- 2026-10-13: README: deploy a game from a manifest, step by step
- 2026-10-13: docs: a game folder may be anywhere; absolute paths pass through the packer
