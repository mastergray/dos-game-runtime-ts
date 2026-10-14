import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const fs = require("fs");
import { chromium } from "playwright";
import { start } from "./server.mjs";
fs.writeFileSync("snd5.log", "");
const log = (...a) => fs.appendFileSync("snd5.log", a.join(" ") + "\n");
// PC speaker beep, ~900 Hz for ~1-2 s: program PIT ch2, gate speaker on via port 61h, busy-wait, gate off.
const BEEP_COM = [0xB0,0xB6, 0xE6,0x43, 0xB8,0x33,0x05, 0xE6,0x42, 0x8A,0xC4, 0xE6,0x42, 0xE4,0x61, 0x0C,0x03, 0xE6,0x61,
                  0xBB,0x40,0x00, 0xB9,0xFF,0xFF, 0xE2,0xFE, 0x4B, 0x75,0xF8, 0xE4,0x61, 0x24,0xFC, 0xE6,0x61, 0xC3];
const { url, stop } = await start(0);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
try {
    const page = await browser.newPage();
    await page.goto(url + "/", { waitUntil: "load" });
    const r = await page.evaluate(async (com) => {
        emulators.pathPrefix = "/emulators/";
        const wait = (t) => new Promise(r => setTimeout(r, t));
        const init = [{ path: "BEEP.COM", contents: new Uint8Array(com) }, { dosboxConf: "[autoexec]\nmount c .\nc:\nBEEP.COM\nBEEP.COM\nBEEP.COM\n", jsdosConf: { version: "8" } }];
        const ci = await emulators.dosboxWorker(init, { audioWorklet: false });
        let peak = 0, nonZero = 0, total = 0, pushes = 0, firstNonZeroPush = -1; const lens = new Set();
        ci.events().onSoundPush((s) => { pushes++; total += s.length; lens.add(s.length); for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > 0) { nonZero++; if (firstNonZeroPush < 0) firstNonZeroPush = pushes; } if (a > peak) peak = a; } });
        await wait(6000);
        const out = await new Promise(r => { const lines = []; ci.events().onStdout(m => lines.push(m)); setTimeout(() => r(lines.slice(-3)), 200); });
        await ci.exit();
        return { pushes, total, nonZero, peak, firstNonZeroPush, lens: [...lens].slice(0, 5) };
    }, BEEP_COM);
    log(JSON.stringify(r));
} finally { await browser.close(); await stop(); }
