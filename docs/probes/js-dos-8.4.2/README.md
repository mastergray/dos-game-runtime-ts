# js-dos `emulators@8.4.2` probe

Throwaway scripts that produced the probe record in
`docs/headless-browser-dos-runtime-spec.md` §4.3. Run on 2026-09-24 with
a 1990 strategy RPG as the test program, Playwright 1.63.0 driving
the cached Chromium build 1234 (`~/.cache/ms-playwright/chromium-1234`)
on Ubuntu 20.04.

To rerun:

```
mkdir probe && cd probe && npm init -y && npm install emulators@8.4.2 playwright
cp <this dir>/*.mjs <this dir>/index.html .
mkdir -p bundle/.jsdos && cp <game files> bundle/ && cp example-dosbox.conf bundle/.jsdos/dosbox.conf   # edit the autoexec for the game
printf '{"version":"8"}\n' > bundle/.jsdos/jsdos.json && (cd bundle && zip -qr ../test.jsdos .)
CHROME=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome node driver.mjs worker
CHROME=... node driver.mjs direct
CHROME=... node persist.mjs
CHROME=... node restore2.mjs
CHROME=... node audio.mjs
```

| File | What it established |
|---|---|
| `driver.mjs` + `index.html` | Boot, frame format, sound push, key/mouse injection, pause/resume, exit behavior; `result-worker.json`, `result-direct.json`, screenshots |
| `persist.mjs` | `persist()` is `null` until a file changes, then a zip overlay of changed files; `fsWriteFile`/`fsReadFile` |
| `restore2.mjs` | Worker mode detaches the bundle buffer; `[bundle, overlay]` restores; file entries + config object work without a zip |
| `audio.mjs` | `audioWorklet: false` delivers `Float32Array` samples via `onSoundPush` and creates no `AudioContext`; `true` creates an unreachable context and stops `onSoundPush` |
| `audio-beep.mjs` | Positive control: a hand-assembled PC-speaker `BEEP.COM` yields non-zero samples (peak 0.15) through `onSoundPush`, so the delivery path carries real audio |
| (amplitude probe, not kept) | the test game produces all-zero samples on its opening screens; the game is silent there under DOSBox, not the runtime |
| (mouse probe, not kept) | a mouse-driven strategy game sees `sendMouseRelativeMotion` and `sendMouseButton`: at its main menu, +80,+60 of injected motion moved the cursor about +40,+25 screen pixels at 320×200 (DOSBox scales relative motion), and a left click on a menu entry opened it. Its setup prompts are keyboard text menus answered with `1` |
| (Milestone 9, harness-driven) | the test game's quit-and-save writes its save file; `persist()` returns a 20,531-byte overlay; restoring with `[bundle, overlay]` makes the file visible to DOS `dir` without `rescan`, and the game's load command then restores the saved game |
| `keycodes.json` | The GLFW-style key codes js-dos 8.4.1 passes to `sendKeyEvent` |

The game files are not in this repo.

`example-dosbox.conf` is the shape of the conf every bundle carries;
its autoexec names the game's executable. The per-game confs, the
mouse and amplitude probes and the screenshots that used commercial
games are kept out of the repository.
