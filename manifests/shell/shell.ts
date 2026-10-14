// realizes: docs/deployment-manifest-spec.md > §2.3 Page shell (the DOM layer: mount)

// Dependencies:
import {
    DosDeployment,                                                 // Composes the player, sources, primitives and mapper from the controls config
    DosStorage,                                                    // Saves overlay persistence under the manifest's key
    JsDosEmulatorAdapter,                                          // Emulator backend; mode chosen by whether the page is cross-origin isolated
} from "../../src/index.ts";
import { parseManifest } from "./manifest.ts";                     // Validates the fetched manifest
import {
    GROUP_ROWS,                                                    // The fixed key groups
    KEYBOARD_TOP_ROW,                                              // Esc and the function keys, fixed above every pane
    COMPASS_KEYS,                                                  // The compass-style compass d-pad
    COMPASS_SIDE,                                                     // The keys beside it
    keyboardTabsFor,                                               // The tabs a keyboard style shows
    keyboardPanesFor,                                              // The panes a keyboard style shows
    keyboardStyleFrom,                                             // A remembered keyboard style, or the manifest's
    keyboardStyleLabel,                                            // The keyboard toggle's label
    keyboardTopFor,                                                // What sits above a style's panes
    KEYBOARD_STYLES,                                               // The keyboard choices
    MENU_BAR,                                                      // The pull-down menus of the QBasic-style bar
    aspectRatioFor,                                                // Display aspect from the manifest
    chordFor,                                                      // Codes to hold for a press under the current latches
    confirmTextsFor,                                               // The two confirm questions
    controlsConfigFor,                                             // Controls config from the policy and the d-pad surface
    dpadFor,                                                       // Whether and how the page builds a d-pad
    footerText,                                                    // Dialog footer line
    headingFor,                                                    // Splash heading
    hintsFor,                                                      // Hint lines under PLAY
    isModifier,                                                    // Whether a key latches
    layoutFor,                                                     // The components for an orientation
    SETTING_KEYS,                                                  // Browser-storage keys of the remembered settings
    nextTheme,                                                     // The theme after the current one
    themeFrom,                                                     // A remembered theme, or the default
    themeLabel,                                                    // The theme toggle's label
    NORMAL_SCREEN,                                                 // The ordinary layout
    SCREEN_MODES,                                                  // The screen choices
    screenModeFrom,                                                // A remembered screen mode, or normal
    settingFrom,                                                   // A remembered on/off, or the device default
    settingText,                                                   // How an on/off is stored
    regionOf,                                                      // Where a component sits in landscape
    rowsOf,                                                        // Letters or digits in rows of a given width
    toggledLatch,                                                  // Latches after a modifier tap
} from "./page-state.ts";

// Type dependencies:
import type { KeyCode } from "../../src/index.ts";                 // Codes the keys send
import type { GameManifest, KeyboardPane, LayoutComponent } from "./manifest.types.ts";   // What mount reads and places
import type { GroupKey, MenuItem, Orientation, ScreenMode, ThemeId } from "./page-state.ts";
import type { KeyboardStyle } from "./manifest.types.ts";          // The keyboard arrangement in effect      // The pull-down items and which layout list is in effect

/**
 *
 * Constants
 *
 */

const AUTOSAVE_MS = 5000;                                          // How often the game's changed files are persisted

/**
 *
 * Functions
 *
 */

// HELPER :: STRING -> htmlElement
// The element with the id, or an Error naming it: the shell's markup is a contract.
const element = <T extends HTMLElement>(id: string): T => {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`missing #${id}`);
    return found as T;
};

// HELPER :: VOID -> htmlDivElement
// Builds the d-pad surface: a cross of four arrow glyphs; the DPad primitive reads direction from where the pointer is.
const buildDpad = (): HTMLDivElement => {
    const dpad = document.createElement("div");
    dpad.id = "dpad";
    for (const [name, glyph] of [["up", "\u25b2"], ["down", "\u25bc"], ["left", "\u25c0"], ["right", "\u25b6"]] as const) {
        const arrow = document.createElement("span");
        arrow.className = `arrow ${name}`;
        arrow.textContent = glyph;
        dpad.append(arrow);
    }
    return dpad;
};

// HELPER :: VOID -> orientation
// Which layout applies to the viewport now.
const orientationNow = (): Orientation => (matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape");

// INTERFACE :: {down:(keyCode -> VOID), up:(keyCode -> VOID)}
// Where a built key sends its presses: the running game's input, or nothing on the title screen.
interface KeySink {
    readonly down: (code: KeyCode) => void;                        // Press
    readonly up: (code: KeyCode) => void;                          // Release
}

// HELPER :: htmlElement, keyCode, STRING, BOOLEAN, keySink, (keyCode -> VOID) -> htmlElement
// Builds one keycap div that holds its code (with the current latches) while a pointer is down, or toggles a latch when it is a modifier.
// NOTE: Divs, not inputs, so the phone's own keyboard never appears; pointer capture keeps the release paired with the press.
const REPEAT_DELAY_MS = 350;                                       // Hold before a repeating key starts repeating
const REPEAT_EVERY_MS = 90;                                        // Then its rate
const buildKey = (parent: HTMLElement, code: KeyCode, label: string, wide: boolean, sink: KeySink, latches: () => ReadonlySet<KeyCode>, onModifier: (code: KeyCode) => void, shifted?: string, repeat = false): HTMLElement => {
    const key = document.createElement("div");
    key.className = `key${wide ? " wide" : ""}${isModifier(code) ? " modifier" : ""}`;
    key.dataset["code"] = code;
    key.dataset["label"] = label;
    if (shifted !== undefined) key.dataset["shifted"] = shifted;
    key.textContent = label;
    let held: ReadonlyArray<KeyCode> = [];
    let repeatTimer: ReturnType<typeof setTimeout> | null = null;
    key.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (isModifier(code)) { onModifier(code); return; }
        key.setPointerCapture(event.pointerId);
        held = chordFor(latches(), code);
        for (const held_ of held) sink.down(held_);
        key.classList.add("down");
        if (repeat) repeatTimer = setTimeout(() => { repeatTimer = setInterval(() => { sink.up(code); sink.down(code); }, REPEAT_EVERY_MS); }, REPEAT_DELAY_MS);
    });
    const release = (): void => {
        if (repeatTimer !== null) { clearTimeout(repeatTimer); clearInterval(repeatTimer); repeatTimer = null; }
        if (held.length === 0) return;
        for (const held_ of [...held].reverse()) sink.up(held_);
        held = [];
        key.classList.remove("down");
        onModifier("");                                            // A plain key's release clears the latches
    };
    key.addEventListener("pointerup", release);
    key.addEventListener("pointercancel", release);
    key.addEventListener("lostpointercapture", release);
    parent.append(key);
    return key;
};

// HELPER :: URL | STRING -> PROMISE(VOID)
// Fetches and validates the manifest beside the page, then wires the shell: title screen, menu, autosave and the game.
// NOTE: Every asset is resolved against the manifest URL, so the folder stands alone wherever it is hosted.
export const mount = async (manifestUrl: URL | string): Promise<void> => {
    const base = new URL(manifestUrl, document.baseURI);
    const title = element<HTMLDivElement>("title");
    const titleHint = element<HTMLParagraphElement>("title-hint");
    let manifest: GameManifest;
    try {
        const response = await fetch(base);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        manifest = parseManifest(await response.text(), base.pathname);
    } catch (error) {
        console.error(error);
        titleHint.textContent = `Could not load the manifest: ${String(error)}`;
        return;
    }

    /* Elements */
    const play = element<HTMLDivElement>("play");
    const canvas = element<HTMLCanvasElement>("canvas");
    const heading = element<HTMLHeadingElement>("title-heading");
    const hints = element<HTMLParagraphElement>("title-hints");
    const menu = element<HTMLDivElement>("menu");
    const picture = element<HTMLDivElement>("picture");
    const status = element<HTMLDivElement>("m-status");
    const buttons = {
        play: element<HTMLButtonElement>("play-button"),
        menu: element<HTMLButtonElement>("menu-button"),
        fullscreen: element<HTMLButtonElement>("m-fullscreen"),
        touch: element<HTMLButtonElement>("m-touch"),
        mute: element<HTMLButtonElement>("m-mute"),
        menubar: element<HTMLButtonElement>("m-menubar"),
        keyboard: element<HTMLButtonElement>("m-keyboard"),
        theme: element<HTMLButtonElement>("m-theme"),
        restart: element<HTMLButtonElement>("m-restart"),
        clear: element<HTMLButtonElement>("m-clear"),
        confirmYes: element<HTMLButtonElement>("m-confirm-yes"),
        confirmNo: element<HTMLButtonElement>("m-confirm-no"),
    };
    const confirmBox = element<HTMLDivElement>("m-confirm");
    const modesBox = element<HTMLDivElement>("m-modes");
    const confirmText = element<HTMLParagraphElement>("m-confirm-text");
    /* The menu chrome: the dialog's items either sit in the dialog under one MENU keycap, or in pull-downs on a QBasic-style strip
       where the dialog is only the confirm step. The strip is built once; the toggle moves the same buttons between the two. */
    let menuBar = false;                                           // Whether the strip is in use
    const dialogItems = element<HTMLDivElement>("menu").querySelector<HTMLDivElement>(".items") ?? menu;
    const itemOrder: ReadonlyArray<HTMLButtonElement> = [buttons.fullscreen, buttons.touch, buttons.mute, buttons.menubar, buttons.keyboard, buttons.theme, buttons.restart, buttons.clear];
    const drops = new Map<MenuItem, HTMLDivElement>();             // Pull-down panel per item
    {
        const strip = document.createElement("div");
        strip.className = "menubar";
        const pulls: HTMLDivElement[] = [];
        const closePulls = (): void => { for (const pull of pulls) pull.classList.remove("open"); };
        for (const spec of MENU_BAR) {
            const pull = document.createElement("div");
            pull.className = "pull";
            const title = document.createElement("button");
            const first = document.createElement("b");
            first.textContent = spec.title.slice(0, 1);
            title.append(first, spec.title.slice(1));
            title.addEventListener("click", (event) => { event.stopPropagation(); const open = pull.classList.contains("open"); closePulls(); if (!open) pull.classList.add("open"); });
            title.addEventListener("pointerenter", () => { if (pulls.some((other) => other !== pull && other.classList.contains("open"))) { closePulls(); pull.classList.add("open"); } });
            const drop = document.createElement("div");
            drop.className = "drop";
            for (const item of spec.items) {
                buttons[item].addEventListener("click", closePulls);
                drops.set(item, drop);
            }
            pull.append(title, drop);
            pulls.push(pull);
            strip.append(pull);
        }
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = manifest.metadata.name;
        strip.append(name);
        element<HTMLDivElement>("bar").append(strip);
        document.addEventListener("pointerdown", (event) => { if (!(event.target instanceof Node) || !strip.contains(event.target)) closePulls(); });
    }
    const setMenuBar = (on: boolean): void => {
        menuBar = on;
        play.classList.toggle("menubar", on);
        buttons.menubar.textContent = `Menu bar: ${on ? "on" : "off"}`;
        if (on) { for (const [item, drop] of drops) drop.append(buttons[item]); }
        else dialogItems.prepend(...itemOrder);
    };

    /* From the manifest */
    document.title = manifest.metadata.name;
    heading.textContent = headingFor(manifest);
    hints.replaceChildren(...hintsFor(manifest).map((line) => { const p = document.createElement("span"); p.textContent = line; return p; }));
    const confirmTexts = confirmTextsFor(manifest);
    const bundle = new URL("./game.jsdos", base).href;
    const pathPrefix = new URL("./emulators/", base).pathname;
    const dpadElement = dpadFor(manifest) === null ? null : buildDpad();
    const controls = controlsConfigFor(manifest, dpadElement);
    const storage = DosStorage.init({ key: manifest.saves.key });

    /* Keys: every key component shares the sink and the modifier latches */
    let latches: ReadonlySet<KeyCode> = new Set();
    const sink: KeySink = {
        down: (code) => { if (deployment?.isStarted) deployment.player.input.keyDown(code); },
        up: (code) => { if (deployment?.isStarted) deployment.player.input.keyUp(code); },
    };
    let modifierKeys: HTMLElement[] = [];
    const setLatches = (next: ReadonlySet<KeyCode>): void => {
        latches = next;
        for (const key of modifierKeys) key.classList.toggle("latched", latches.has(key.dataset["code"] ?? ""));
        const shifted = latches.has("ShiftLeft");
        for (const key of play.querySelectorAll<HTMLElement>(".key[data-shifted]")) key.textContent = shifted ? key.dataset["shifted"] ?? "" : key.dataset["label"] ?? "";
    };
    const onModifier = (code: KeyCode): void => { setLatches(code === "" ? new Set() : toggledLatch(latches, code)); };

    // The keyboard style in effect: remembered in this browser, else the first keyboard component's choice, else tabs.
    const manifestKeyboardStyle = (): KeyboardStyle => {
        for (const orientation of ["portrait", "landscape"] as const) for (const component of layoutFor(manifest, orientation)) if (component.component === "keyboard" && component.style !== undefined) return component.style;
        return "tabs";
    };
    let keyboardStyle: KeyboardStyle = keyboardStyleFrom(((): string | null => { try { return localStorage.getItem(SETTING_KEYS.keyboard); } catch { return null; } })(), manifestKeyboardStyle());
    buttons.keyboard.textContent = keyboardStyleLabel(keyboardStyle);

    // HELPER :: layoutComponent -> htmlElement
    // Builds one placed component: the shared d-pad, a single key, or a group of key rows.
    const buildComponent = (component: LayoutComponent): HTMLElement => {
        if (component.component === "dpad") {
            if (dpadElement === null) throw new Error("layout places a d-pad the manifest did not declare");
            return dpadElement;
        }
        const box = document.createElement("div");
        box.className = `component c-${component.component}`;
        if (component.component === "keyboard") {
            box.style.setProperty("--cols", "10");
            const panes = new Map<KeyboardPane, HTMLDivElement>();
            const tabs = new Map<KeyboardPane, HTMLDivElement>();
            const show = (name: KeyboardPane): void => {
                for (const [pane, el] of panes) el.classList.toggle("hidden", pane !== name);
                for (const [pane, el] of tabs) el.classList.toggle("active", pane === name);
            };
            const style = keyboardStyle;                                                   // The player's choice, started from the manifest's
            const rowsInto = (parent: HTMLElement, rows: ReadonlyArray<ReadonlyArray<{ readonly label: string; readonly code: KeyCode; readonly repeat?: boolean }>>, className: string): void => {
                for (const row of rows) {
                    const line = document.createElement("div");
                    line.className = `row ${className}`;
                    for (const key of row) { const built = buildKey(line, key.code, key.label, false, sink, () => latches, onModifier, undefined, key.repeat === true); if (key.repeat === true) built.classList.add("arrow-key"); }
                    parent.append(line);
                }
            };
            if (keyboardTopFor(style) === "block") {
                const block = document.createElement("div");
                block.className = "compass-block";
                const compass = document.createElement("div");
                compass.className = "compass";
                rowsInto(compass, COMPASS_KEYS, "");
                const side = document.createElement("div");
                side.className = "beside";
                rowsInto(side, COMPASS_SIDE, "toprow");
                block.append(compass, side);
                box.append(block);
            } else {
                const top = document.createElement("div");
                top.className = "row toprow";
                for (const key of KEYBOARD_TOP_ROW) buildKey(top, key.code, key.label, false, sink, () => latches, onModifier);
                box.append(top);
            }
            for (const [name, rows] of Object.entries(keyboardPanesFor(style)) as ReadonlyArray<[KeyboardPane, ReadonlyArray<ReadonlyArray<GroupKey>>]>) {
                const pane = document.createElement("div");
                pane.className = "pane";
                for (const row of rows) {
                    const line = document.createElement("div");
                    line.className = "row";
                    for (const key of row) {
                        if (key.pane !== undefined) {                                              // A pane switch, as the 123 and ABC keys of a phone keyboard
                            const target = key.pane;
                            const sw = document.createElement("div");
                            sw.className = "key switch";
                            sw.textContent = key.label;
                            sw.addEventListener("pointerdown", (event) => { event.preventDefault(); show(target); });
                            line.append(sw);
                            continue;
                        }
                        if (key.code === "") {                                                     // A spacer: takes a key's place, sends nothing
                            const spacer = document.createElement("div");
                            spacer.className = `spacer${key.wide ? " wide" : ""}`;
                            line.append(spacer);
                            continue;
                        }
                        const built = buildKey(line, key.code, key.label, key.wide, sink, () => latches, onModifier, key.shifted, key.repeat === true);
                        if (key.repeat === true) built.classList.add("arrow-key");
                        if (isModifier(key.code)) modifierKeys.push(built);
                    }
                    pane.append(line);
                }
                panes.set(name, pane);
                box.append(pane);
            }
            const tabList = keyboardTabsFor(style);
            const bar = document.createElement("div");
            bar.className = "tabs";
            for (const tab of tabList) {
                const el = document.createElement("div");
                el.className = "tab";
                el.textContent = tab.label;
                el.addEventListener("pointerdown", (event) => { event.preventDefault(); show(tab.pane); });
                tabs.set(tab.pane, el);
                bar.append(el);
            }
            if (tabList.length > 0) box.prepend(bar);
            show(component.pane ?? "letters");
            return box;
        }
        const rows = component.component === "key" ? [[{ label: component.label, code: component.code, wide: false }]]
            : component.component === "keys" ? [component.keys.map((key) => ({ label: key.label, code: key.code, wide: false }))]
            : (component.component === "letters" || component.component === "digits") && component.columns !== undefined ? rowsOf(component.component, component.columns)
            : GROUP_ROWS[component.component];
        if (component.component === "keys") box.style.setProperty("--cols", String(component.keys.length * 2.4));
        if ((component.component === "letters" || component.component === "digits") && component.columns !== undefined) { box.classList.add("compact"); box.style.setProperty("--cols", String(component.columns)); }
        for (const row of rows) {
            const line = document.createElement("div");
            line.className = "row";
            for (const key of row) {
                const built = buildKey(line, key.code, key.label, key.wide, sink, () => latches, onModifier, key.shifted);
                if (isModifier(key.code)) modifierKeys.push(built);
            }
            box.append(line);
        }
        return box;
    };

    // HELPER :: VOID -> VOID
    // Lays the components out for the current orientation: landscape into the side regions, portrait below the picture.
    const slots = {
        left: element<HTMLDivElement>("left"), right: element<HTMLDivElement>("right"), below: element<HTMLDivElement>("below"),
        "upper-left": element<HTMLDivElement>("upper-left"), "lower-left": element<HTMLDivElement>("lower-left"),
        "upper-right": element<HTMLDivElement>("upper-right"), "lower-right": element<HTMLDivElement>("lower-right"),
    };
    const render = (): void => {
        const orientation = orientationNow();
        modifierKeys = [];
        for (const slot of Object.values(slots)) slot.replaceChildren();
        for (const slot of [slots.left, slots.right]) { slot.classList.remove("whole"); slot.append(slot === slots.left ? slots["upper-left"] : slots["upper-right"], slot === slots.left ? slots["lower-left"] : slots["lower-right"]); }
        // HELPER :: htmlElement, htmlElement, BOOLEAN -> VOID
        // Appends a component to a slot, or beside the slot's previous component in a row when inline.
        const place = (slot: HTMLElement, built: HTMLElement, inline: boolean): void => {
            const last = slot.lastElementChild;
            if (!inline || last === null) { slot.append(built); return; }
            if (last.classList.contains("inline-row")) { last.append(built); return; }
            const row = document.createElement("div");
            row.className = "inline-row";
            slot.append(row);
            row.append(last, built);
        };
        for (const component of layoutFor(manifest, orientation)) {
            const built = buildComponent(component);
            const inline = component.inline === true;
            if (orientation === "portrait") { place(slots.below, built, inline); continue; }
            const region = regionOf(component);
            if (region === "left" || region === "right") { slots[region].classList.add("whole"); place(slots[region], built, inline); }
            else place(slots[region], built, inline);
        }
        play.classList.toggle("has-left", slots.left.textContent !== "" || slots.left.querySelector("#dpad") !== null);
        play.classList.toggle("has-right", slots.right.textContent !== "" || slots.right.querySelector("#dpad") !== null);
        setLatches(new Set());
    };
    // HELPER :: VOID -> VOID
    // Sizes the picture cell in landscape: as wide as the height allows at the game's aspect, but no wider than the columns leave.
    // The columns are measured by their content, so the cell shrinks to the picture and the leftover is shared beside it.
    const sizePicture = (): void => {
        if (orientationNow() === "portrait") {
            // Full width, unless the stack below would not fit: then as wide as the height left over allows, so nothing scrolls.
            picture.style.width = "";
            const bar = element<HTMLDivElement>("bar");
            if (!play.classList.contains("touch-on")) return;
            const spare = play.clientHeight - bar.offsetHeight - slots.below.scrollHeight;
            const byHeight = Math.floor(spare * aspectRatioFor(manifest));
            if (byHeight < picture.clientWidth) picture.style.width = `${Math.max(0, byHeight)}px`;
            return;
        }
        // A column is as wide as its widest component or inline row. They are measured with the picture collapsed, so a wide
        // component such as the keyboard is seen at its natural width rather than squeezed by the picture.
        picture.style.width = "0px";
        const contentWidth = (side: HTMLDivElement): number => (play.classList.contains("touch-on") && getComputedStyle(side).display !== "none"
            ? Math.max(...[...side.querySelectorAll<HTMLElement>(".half > *, .side.whole > *")].map((item) => item.offsetWidth), 0) + 12 : 0);
        const barWidth = menuBar || play.classList.contains("nobar") ? 0 : buttons.menu.offsetWidth + 32;   // The bar's width beside the picture: its keycap and padding, or nothing when it spans the top or is hidden
        const hasLeft = play.classList.contains("has-left"), hasRight = play.classList.contains("has-right") && play.classList.contains("touch-on");
        const leftWidth = hasLeft || !hasRight ? Math.max(contentWidth(slots.left), barWidth) : 0;
        const rightWidth = hasRight ? Math.max(contentWidth(slots.right), hasLeft ? 0 : barWidth) : 0;
        const available = play.clientWidth - leftWidth - rightWidth;
        const byHeight = picture.clientHeight * aspectRatioFor(manifest);
        picture.style.width = `${Math.max(0, Math.floor(play.classList.contains("stretch") ? available : Math.min(available, byHeight)))}px`;   // Stretched, the picture ignores its aspect
    };
    const relayout = (): void => { render(); sizePicture(); };
    /* Remembered settings: touch controls and the menu bar are kept in this browser for every game on the origin; a browser that
       refuses storage (private windows, blocked site data) falls back to the device default, touch-first devices starting both on. */
    const remembered = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
    const remember = (key: string, on: boolean): void => { try { localStorage.setItem(key, settingText(on)); } catch { /* not kept */ } };
    const touchFirst = matchMedia("(pointer: coarse)").matches;
    const setTouch = (on: boolean): void => { play.classList.toggle("touch-on", on); buttons.touch.textContent = `Touch controls: ${settingText(on)}`; };
    setTouch(settingFrom(remembered(SETTING_KEYS.touch), touchFirst));
    setMenuBar(settingFrom(remembered(SETTING_KEYS.menuBar), touchFirst));
    let theme: ThemeId = themeFrom(remembered(SETTING_KEYS.theme));
    const setTheme = (id: ThemeId): void => { theme = id; document.documentElement.dataset["theme"] = id; buttons.theme.textContent = themeLabel(id); };
    setTheme(theme);
    relayout();
    matchMedia("(orientation: portrait)").addEventListener("change", relayout);
    new ResizeObserver(() => sizePicture()).observe(play);
    play.style.setProperty("--aspect", String(aspectRatioFor(manifest)));

    /* Page state */
    let deployment: DosDeployment | null = null;                   // The running deployment, or null on the title screen
    let muted = false;                                             // Sound preference, kept across boots
    let startedAt = 0;                                             // performance.now() at the last boot
    let problem = "";                                              // A save failure to show instead of the play time, until the next boot
    let pendingAction: (() => void) | null = null;                 // What Yes in the confirm does

    const setStatus = (text: string): void => { status.textContent = text; };
    const refreshStatus = (): void => { setStatus(footerText({ startedAt, problem }, performance.now())); };
    const openMenu = (open: boolean): void => {
        menu.classList.toggle("open", open);
        menu.classList.remove("confirming", "choosing");
        confirmBox.classList.remove("open");
        modesBox.classList.remove("open");
        if (deployment !== null) { if (open) deployment.player.pause(); else if (deployment.player.status === "paused") deployment.player.resume(); }
        if (open) refreshStatus();
        if (!open) play.focus();
    };
    const confirm = (text: string, action: () => void): void => {
        if (!menu.classList.contains("open")) openMenu(true);                             // From the bar, the dialog opens for the question alone
        confirmText.textContent = text;
        pendingAction = action;
        menu.classList.add("confirming");
        confirmBox.classList.add("open");
    };
    const showTitle = (hint = ""): void => {
        title.classList.remove("hidden");
        titleHint.textContent = hint;
        openMenu(false);
    };

    /* Lifecycle */
    const boot = async (): Promise<void> => {
        buttons.play.disabled = true;
        titleHint.textContent = "Loading…";
        try {
            const adapter = await JsDosEmulatorAdapter.init({ pathPrefix, mode: globalThis.crossOriginIsolated ? "worker" : "direct" });
            deployment = await DosDeployment.init({ canvas, container: picture, game: { bundle, display: { aspectRatio: aspectRatioFor(manifest) } }, adapter, storage, controls });
            deployment.player.on("exit", () => { void stop("The game exited."); });
            await deployment.start();
            await deployment.player.audio.unlock().catch(() => undefined);
            if (muted) deployment.player.audio.mute();
            titleHint.textContent = "";
            title.classList.add("hidden");
            sizePicture();
            play.focus();
            startedAt = performance.now();
            problem = "";
        } catch (error) {
            console.error(error);
            showTitle(`Could not start: ${String(error)}`);
        } finally {
            buttons.play.disabled = false;
        }
    };
    const stop = async (hint: string): Promise<void> => {
        const running = deployment;
        deployment = null;
        if (running !== null) {
            await running.save().catch(() => false);
            await running.destroy().catch((error: unknown) => console.error(error));
        }
        showTitle(hint);
    };
    const autosave = async (reason: string): Promise<void> => {
        if (deployment === null || !deployment.isStarted) return;
        try {
            await deployment.save();
        } catch (error) {
            console.error(`autosave (${reason})`, error);
            problem = "Could not save your progress to this browser's storage.";
            if (menu.classList.contains("open")) refreshStatus();
        }
    };
    setInterval(() => { void autosave("auto"); }, AUTOSAVE_MS);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void autosave("hidden"); });
    window.addEventListener("pagehide", () => { void autosave("leaving"); });

    /* Menu */
    buttons.play.addEventListener("click", () => { void boot(); });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !title.classList.contains("hidden") && !buttons.play.disabled) { event.preventDefault(); void boot(); }
    });
    buttons.menu.addEventListener("click", () => { if (deployment !== null) openMenu(true); });
    menu.addEventListener("click", (event) => { if (event.target === menu) openMenu(false); });
    buttons.confirmNo.addEventListener("click", () => { pendingAction = null; menu.classList.remove("confirming"); confirmBox.classList.remove("open"); if (menuBar) openMenu(false); });
    const setKeyboardStyle = (id: KeyboardStyle): void => { keyboardStyle = id; buttons.keyboard.textContent = keyboardStyleLabel(id); try { localStorage.setItem(SETTING_KEYS.keyboard, id); } catch { /* not kept */ } relayout(); };
    buttons.theme.addEventListener("click", () => { setTheme(nextTheme(theme)); try { localStorage.setItem(SETTING_KEYS.theme, theme); } catch { /* not kept */ } });
    buttons.menubar.addEventListener("click", () => { const on = !menuBar; setMenuBar(on); remember(SETTING_KEYS.menuBar, on); if (on) openMenu(false); sizePicture(); });
    buttons.confirmYes.addEventListener("click", () => { const action = pendingAction; pendingAction = null; if (action !== null) action(); });
    // Fullscreen also asks for a portrait lock, which Android browsers grant inside fullscreen and others refuse; the refusal is ignored.
    const lockPortrait = async (): Promise<void> => {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
        try { await orientation.lock?.("portrait"); } catch { /* not supported here */ }
    };
    // The screen mode is chosen from a list in the dialog: normal, fullscreen plain or stretched, or stretched in the window, each
    // with or without the menu bar. With the bar it is forced on so Normal is a click away and Escape stays with the game; without
    // it the chrome parks above the top edge and a pointer or tap there brings it back. The choice is remembered, and the window
    // modes come back on the next visit; a fullscreen one needs a click, so it waits in the chooser. The player's menu setting
    // returns on Normal.
    let screenMode: ScreenMode = NORMAL_SCREEN;
    let menuBarBefore: boolean | null = null;                      // The setting before a mode forced the bar, or null in normal
    const applyScreen = (mode: ScreenMode): void => {
        screenMode = mode;
        const normal = mode.id === "normal";
        play.classList.toggle("stretch", mode.stretch);
        play.classList.toggle("nobar", !normal && !mode.bar);
        play.classList.remove("peek");
        if (!normal) { if (menuBarBefore === null) menuBarBefore = menuBar; if (mode.bar && !menuBar) setMenuBar(true); }
        else if (menuBarBefore !== null) { setMenuBar(menuBarBefore); menuBarBefore = null; }
        sizePicture();
    };
    const chooseScreen = (mode: ScreenMode): void => {
        try { localStorage.setItem(SETTING_KEYS.screen, mode.id); } catch { /* not kept */ }
        openMenu(false);
        const fullscreen = document.fullscreenElement !== null;
        if (mode.fullscreen && !fullscreen) { screenMode = mode; play.requestFullscreen().then(lockPortrait).catch((error: unknown) => setStatus(`Fullscreen: ${String(error)}`)); }
        else if (!mode.fullscreen && fullscreen) { screenMode = mode; document.exitFullscreen().catch((error: unknown) => setStatus(`Fullscreen: ${String(error)}`)); }
        else applyScreen(mode);
    };
    // HELPER :: [{label, pick}] -> VOID
    // Opens the dialog on a list of choices and Cancel, in place of its items; Screen mode and Keyboard use it.
    const openChooser = (choices: ReadonlyArray<{ readonly label: string; readonly pick: () => void }>): void => {
        modesBox.replaceChildren();
        for (const choice of choices) {
            const button = document.createElement("button");
            button.textContent = choice.label;
            button.addEventListener("click", choice.pick);
            modesBox.append(button);
        }
        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => { if (menuBar) openMenu(false); else { menu.classList.remove("choosing"); modesBox.classList.remove("open"); } });
        modesBox.append(cancel);
        if (!menu.classList.contains("open")) openMenu(true);
        menu.classList.add("choosing");
        modesBox.classList.add("open");
    };
    buttons.fullscreen.addEventListener("click", () => openChooser(SCREEN_MODES.map((mode) => ({ label: mode.label, pick: () => chooseScreen(mode) }))));
    buttons.keyboard.addEventListener("click", () => openChooser(KEYBOARD_STYLES.map((style) => ({
        label: `${style.label}: ${style.description}`,
        pick: () => { setKeyboardStyle(style.id); openMenu(false); },
    }))));
    document.addEventListener("fullscreenchange", () => {
        const fullscreen = document.fullscreenElement !== null;
        if (fullscreen) applyScreen(screenMode.fullscreen ? screenMode : NORMAL_SCREEN);
        else applyScreen(screenMode.fullscreen ? NORMAL_SCREEN : screenMode);   // Escape or the browser left: back to normal unless a window mode was chosen
    });
    // Bringing the parked bar back must not fire from a game's own mouse moves, so a mouse reveals it only by leaving the window
    // through the top edge, or, in fullscreen where the pointer cannot leave, by resting on the top pixel for a moment. It stays
    // while the pointer is on it and parks again when the pointer moves back down. A finger taps the top edge instead.
    const DWELL_MS = 400;
    let dwell: ReturnType<typeof setTimeout> | null = null;
    const onBar = (event: Event): boolean => event.target instanceof Node && element<HTMLDivElement>("bar").contains(event.target);
    const parked = (): boolean => play.classList.contains("nobar");
    document.addEventListener("pointermove", (event) => {
        if (!parked() || event.pointerType !== "mouse") return;
        const atTop = document.fullscreenElement !== null && event.clientY <= 0;
        if (atTop && dwell === null) dwell = setTimeout(() => { dwell = null; play.classList.add("peek"); }, DWELL_MS);
        if (!atTop && dwell !== null) { clearTimeout(dwell); dwell = null; }
        if (play.classList.contains("peek") && !onBar(event) && event.clientY > element<HTMLDivElement>("bar").offsetHeight) play.classList.remove("peek");
    });
    document.documentElement.addEventListener("pointerleave", (event) => { if (parked() && event.pointerType === "mouse" && event.clientY <= 0) play.classList.add("peek"); });
    document.addEventListener("pointerdown", (event) => { if (parked() && event.pointerType !== "mouse") play.classList.toggle("peek", event.clientY <= 16 || onBar(event)); });
    { const stored = screenModeFrom(remembered(SETTING_KEYS.screen)); if (!stored.fullscreen) applyScreen(stored); }
    buttons.touch.addEventListener("click", () => {
        const on = !play.classList.contains("touch-on");
        setTouch(on);
        remember(SETTING_KEYS.touch, on);
        sizePicture();
    });
    buttons.mute.addEventListener("click", () => {
        muted = !muted;
        if (deployment !== null) { if (muted) deployment.player.audio.mute(); else deployment.player.audio.unmute(); }
        buttons.mute.textContent = `Sound: ${muted ? "off" : "on"}`;
    });
    buttons.restart.addEventListener("click", () => confirm(confirmTexts.restart, () => {
        void (async () => {
            const running = deployment; deployment = null;
            if (running !== null) { await running.save().catch(() => false); await running.destroy().catch(() => undefined); }
            menu.classList.remove("open");
            await boot();
        })();
    }));
    buttons.clear.addEventListener("click", () => confirm(confirmTexts.clear, () => {
        void (async () => {
            const running = deployment; deployment = null;
            if (running !== null) await running.destroy().catch(() => undefined);
            await storage.clear().catch((error: unknown) => setStatus(`Clear failed: ${String(error)}`));
            menu.classList.remove("open");
            await boot();
        })();
    }));

    if (!document.fullscreenEnabled) buttons.fullscreen.disabled = true;
    showTitle("");
};
