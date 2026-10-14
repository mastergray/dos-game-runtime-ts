import { chromium } from "playwright";
import { start } from "./server.mjs";
const { url, stop } = await start(0);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
try {
    const page = await browser.newPage();
    page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
    await page.goto(url + "/", { waitUntil: "load" });
    const step = (label, fn) => page.evaluate(fn).then(v => console.log(label, JSON.stringify(v)), e => console.log(label, "ERR", e.message.split("\n")[0]));
    await step("boot1", async () => { emulators.pathPrefix = "/emulators/"; window.bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer()); window.ci1 = await emulators.dosboxWorker(window.bundle.slice(), {}); return "ok"; });
    await page.waitForTimeout(1500);
    await step("write", async () => { await ci1.fsWriteFile("SAVE1.DAT", new Uint8Array([9, 8, 7])); return "ok"; });
    await step("persist", async () => { window.changes = await ci1.persist(); return changes.length; });
    await step("exit1", async () => { await ci1.exit(); return "ok"; });
    await step("boot2", async () => { window.ci2 = await Promise.race([emulators.dosboxWorker([bundle.slice(), changes.slice()], {}), new Promise((_, r) => setTimeout(() => r(new Error("boot2 timeout 20s")), 20000))]); return "ok"; });
    await page.waitForTimeout(1500);
    await step("readBack", async () => Array.from(await ci2.fsReadFile("SAVE1.DAT")));
    await step("persist2", async () => { const p = await ci2.persist(); return p === null ? "null" : p.length; });
    await step("exit2", async () => { await ci2.exit(); return "ok"; });
    await step("boot3-nozip", async () => { window.ci3 = await Promise.race([emulators.dosboxWorker([{ path: "HELLO.TXT", contents: new Uint8Array([72, 73]) }, { dosboxConf: "[autoexec]\nmount c .\nc:\n", jsdosConf: { version: "8" } }], {}), new Promise((_, r) => setTimeout(() => r(new Error("boot3 timeout 20s")), 20000))]); return "ok"; });
    await page.waitForTimeout(1500);
    await step("hello", async () => Array.from(await ci3.fsReadFile("HELLO.TXT")));
    await step("exit3", async () => { await ci3.exit(); return "ok"; });
} finally { await browser.close(); await stop(); }
