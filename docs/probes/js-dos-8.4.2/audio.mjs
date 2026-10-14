import { chromium } from "playwright";
import { start } from "./server.mjs";
const { url, stop } = await start(0);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
        const Real = window.AudioContext; window.__ctxs = [];
        window.AudioContext = function (...a) { const c = new Real(...a); window.__ctxs.push(c); return c; };
        window.AudioContext.prototype = Real.prototype;
    });
    await page.goto(url + "/", { waitUntil: "load" });
    for (const opt of [false, true]) {
        const r = await page.evaluate(async (audioWorklet) => {
            emulators.pathPrefix = "/emulators/";
            const bundle = new Uint8Array(await (await fetch("/test.jsdos")).arrayBuffer());
            const before = window.__ctxs.length;
            const ci = await emulators.dosboxWorker(bundle, { audioWorklet });
            let pushes = 0; ci.events().onSoundPush(() => pushes++);
            await new Promise(r => setTimeout(r, 3000));
            const ctxs = window.__ctxs.slice(before).map(c => ({ state: c.state, sampleRate: c.sampleRate }));
            const keys = Object.keys(ci).filter(k => /audio|sound|ctx|context/i.test(k));
            await ci.exit();
            const after = window.__ctxs.slice(before).map(c => c.state);
            return { audioWorklet, pushes, ctxs, ciAudioKeys: keys, soundFrequency: ci.soundFrequency(), ctxStateAfterExit: after };
        }, opt);
        console.log(JSON.stringify(r));
    }
} finally { await browser.close(); await stop(); }
