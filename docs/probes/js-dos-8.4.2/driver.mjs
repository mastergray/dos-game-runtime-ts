// Drives the probe page in headless Chromium and prints findings as JSON.
import { chromium } from "playwright";
import { start } from "./server.mjs";
import { writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "worker";
const executablePath = process.env.CHROME ?? undefined;
const { url, stop } = await start(0);
const browser = await chromium.launch({ headless: true, executablePath, args: ["--autoplay-policy=no-user-gesture-required"] });
const out = { mode };
try {
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.text().startsWith("[probe]")) console.error(m.text()); });
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    await page.goto(url + "/", { waitUntil: "load" });
    out.crossOriginIsolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    out.emulatorsKeys = await page.evaluate(() => Object.keys(emulators).sort());
    out.emulatorsVersion = await page.evaluate(() => emulators.version);
    out.start = await page.evaluate((m) => window.probe.start(m), mode);
    await page.waitForFunction(() => window.probe.frames > 5, null, { timeout: 30000 }).catch((e) => { out.frameWait = "timeout"; });
    await page.waitForTimeout(4000);
    out.afterBoot = await page.evaluate(() => window.probe.snapshot());
    out.pixels = await page.evaluate(() => window.probe.pixelStats());
    await page.screenshot({ path: `shot-${mode}-boot.png` });
    // input
    out.keyEnter = await page.evaluate(() => [window.probe.key(257, true), window.probe.key(257, false)]);
    out.keyBogus = await page.evaluate(() => window.probe.key(99999, true));
    out.mouse = await page.evaluate(() => [window.probe.mouseRel(10, -4), window.probe.mouseBtn(0, true), window.probe.mouseBtn(0, false)]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `shot-${mode}-after-input.png` });
    out.afterInput = await page.evaluate(() => ({ frames: window.probe.frames, sound: [window.probe.soundPushes, window.probe.soundSamples, window.probe.soundCtor], running: window.probe.running, errors: window.probe.errors, messages: window.probe.messages.slice(0, 10), stdout: window.probe.stdout.slice(0, 10) }));
    out.persistFull = await page.evaluate(() => window.probe.persist());
    out.persistChanges = await page.evaluate(() => window.probe.persist(true));
    out.fsTree = await page.evaluate(() => window.probe.fsTree());
    out.pause = await page.evaluate(async () => { window.probe.ci.pause(); const f = window.probe.frames; await new Promise(r => setTimeout(r, 1500)); const paused = window.probe.frames === f; window.probe.ci.resume(); await new Promise(r => setTimeout(r, 1000)); return { framesDuringPause: window.probe.frames - f, paused, resumedFrames: window.probe.frames - f }; });
    out.exit = await page.evaluate(() => window.probe.exit());
    await page.waitForTimeout(500);
    out.afterExit = await page.evaluate(() => ({ exited: window.probe.exited, sendKey: window.probe.afterExit() }));
} finally {
    await browser.close();
    await stop();
}
writeFileSync(`result-${mode}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
