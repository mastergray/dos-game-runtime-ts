// Persist / resume / fs probe.
import { chromium } from "playwright";
import { start } from "./server.mjs";

const { url, stop } = await start(0);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
const out = {};
try {
    const page = await browser.newPage();
    await page.goto(url + "/", { waitUntil: "load" });
    await page.evaluate(() => window.probe.start("worker"));
    await page.waitForFunction(() => window.probe.frames > 5, null, { timeout: 30000 });
    out.persistAtBoot = await page.evaluate(() => window.probe.persist());
    out.writeFile = await page.evaluate(async () => { try { await window.probe.ci.fsWriteFile("SAVE1.DAT", new Uint8Array([1, 2, 3, 4])); return "ok"; } catch (e) { return "ERR " + e.message; } });
    out.readBack = await page.evaluate(async () => { try { const b = await window.probe.ci.fsReadFile("SAVE1.DAT"); return Array.from(b); } catch (e) { return "ERR " + e.message; } });
    out.persistAfterWrite = await page.evaluate(() => window.probe.persist());
    out.persistChangesAfterWrite = await page.evaluate(() => window.probe.persist(true));
    // resume check: pause, resume, then send a key and count frames over 3s
    out.resume = await page.evaluate(async () => {
        const ci = window.probe.ci;
        ci.pause(); await new Promise(r => setTimeout(r, 1000)); ci.resume();
        const f = window.probe.frames;
        ci.sendKeyEvent(257, true); ci.sendKeyEvent(257, false);
        await new Promise(r => setTimeout(r, 3000));
        return { framesAfterResumeAndKey: window.probe.frames - f };
    });
    // persist after the game itself may have written something (character select -> A)
    await page.evaluate(() => { window.probe.ci.sendKeyEvent(65, true); window.probe.ci.sendKeyEvent(65, false); });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "shot-persist.png" });
    out.persistLater = await page.evaluate(() => window.probe.persist());
    out.persistLaterChanges = await page.evaluate(() => window.probe.persist(true));
    out.fsTree = await page.evaluate(() => window.probe.fsTree());
    out.exit = await page.evaluate(() => window.probe.exit());
} finally {
    await browser.close();
    await stop();
}
console.log(JSON.stringify(out, null, 1));
