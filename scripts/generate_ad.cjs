/**
 * ValleyCroft — mobile site capture ad (~60s)
 *
 * Capture matches iPhone 14 Pro Max (Puppeteer device preset): 430×739 CSS px @3×,
 * then scales/pads to 1080×1920 for social export.
 *
 * Prereq: npm run dev  (default http://127.0.0.1:5173)
 *
 * Output:
 *   out/valleycroft-mobile-ad.mp4  — clean (no burned-in subtitles by default)
 *   ad_voiceover_script.txt + out/ad_voiceover_script.txt — optional VO script
 *   ad_subtitles.srt — optional sidecar (not embedded unless AD_BURN_SUBTITLES=1)
 *
 * Voiceover is not generated as audio: record yourself or hire VO using those two text files.
 *
 * Optional: background_music.mp3 in project root
 *
 *   npm run ad:generate
 */

const puppeteer = require("puppeteer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

/** Set AD_BURN_SUBTITLES=1 to hard-embed ad_subtitles.srt into the MP4; default is off. */
const BURN_SUBTITLES = process.env.AD_BURN_SUBTITLES === "1";

/** Same viewport as puppeteer-core "iPhone 14 Pro Max" (portrait). */
const IPHONE_14_PRO_MAX = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  viewport: {
    width: 430,
    height: 739,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

const CONFIG = {
  siteUrl: process.env.AD_SITE_URL || "http://127.0.0.1:5173",
  musicFile: path.join(__dirname, "..", "background_music.mp3"),
  voiceoverScriptFile: path.join(__dirname, "..", "ad_voiceover_script.txt"),
  srtFile: path.join(__dirname, "..", "ad_subtitles.srt"),
  outputFile: path.join(__dirname, "..", "out", "valleycroft-mobile-ad.mp4"),
  framesDir: path.join(__dirname, "..", "ad_frames"),
  fps: 24,
  /** Final video size (portrait). */
  outputWidth: 1080,
  outputHeight: 1920,
};

/**
 * Shorter lines + modest timing — on-screen text is small (see ffmpeg style).
 * [startSec, endSec, line]
 */
const SUBTITLES = [
  [0, 5, "Cosy B&B on a working farm? This site is built for guests like you."],
  [5, 10, "ValleyCroft — cottages, fresh air, and hospitality that feels personal."],
  [10, 16, "Here’s the real homepage on a phone — straight down to the footer."],
  [16, 23, "Available farm houses: swipe the row for photos, rates, and each cottage."],
  [23, 28, "Then the rest — experiences, events, and contact at the bottom."],
  [28, 34, "Booking picks dates and guests first — clear steps, like a real guest."],
  [34, 41, "Choose your cottage, add your details, then review before you confirm."],
  [41, 47, "Accept terms and send — you get a code to track your stay anytime."],
  [47, 53, "Track with code + email. That’s ValleyCroft — see you on the farm."],
];

/**
 * `continueFromPrevious`: skip page.goto — keeps React booking state between segments.
 */
const SCENES = [
  {label: "Home — hero", route: "/", duration: 5, scrollTo: 0, actions: []},
  {label: "Home — toward farm houses", route: "/", duration: 6, scrollTo: 920, actions: []},
  {
    label: "Home — available farm houses & photos",
    route: "/",
    duration: 14,
    anchorSelector: "#accommodation .rooms-grid-wide",
    scrollDelta: 1180,
    scrollPhaseRatio: 0.72,
    horizontalScrollSelector: "#accommodation .rooms-grid-wide",
    horizontalScrollMax: 680,
    horizontalScrollStartRatio: 0.15,
    horizontalScrollPhaseRatio: 0.72,
    actions: [],
  },
  {
    label: "Home — experience to footer",
    route: "/",
    duration: 10,
    anchorSelector: "#experience",
    scrollDelta: 2100,
    scrollPhaseRatio: 0.55,
    actions: [],
  },
  {
    label: "Booking — step 1 · dates & guests",
    route: "/booking",
    duration: 5,
    scrollTo: 0,
    scrollPhaseRatio: 0.35,
    actions: [
      {type: "wait", ms: 400},
      {type: "reactDate", selector: "#checkin-input", daysFromToday: 14},
      {type: "reactDate", selector: "#checkout-input", daysFromToday: 18},
      {type: "select", selector: "#step-1 .booking-guests-row > .form-group:nth-child(1) select", value: "3"},
      {type: "select", selector: "#step-1 .booking-guests-row > .form-group:nth-child(2) select", value: "1"},
    ],
  },
  {
    label: "Booking — step 2 · pick a room",
    route: "/booking",
    duration: 5,
    continueFromPrevious: true,
    scrollTo: 280,
    scrollPhaseRatio: 0.45,
    actions: [
      {type: "click", selector: "#step-1 .btn-primary"},
      {type: "wait", ms: 1200},
      {type: "click", selector: ".room-opt:not(.unavail)"},
      {type: "wait", ms: 600},
      {type: "click", selector: "#step-2 .room-carousel-next"},
      {type: "wait", ms: 350},
      {type: "click", selector: "#step-2 .room-carousel-next"},
      {type: "wait", ms: 400},
    ],
  },
  {
    label: "Booking — step 3 · guest details",
    route: "/booking",
    duration: 6,
    continueFromPrevious: true,
    scrollTo: 0,
    scrollPhaseRatio: 0.4,
    actions: [
      {type: "click", selector: "#step-2 .btn-primary"},
      {type: "wait", ms: 1000},
      {type: "reactInput", selector: '#step-3 input[placeholder="e.g. Sipho"]', text: "Thabo"},
      {type: "reactInput", selector: '#step-3 input[placeholder="e.g. Dlamini"]', text: "Mbeki"},
      {type: "reactInput", selector: '#step-3 input[placeholder="sipho@email.com"]', text: "guest.demo@valleycroft.test"},
      {type: "reactInput", selector: '#step-3 input[placeholder="+27 82 456 7890"]', text: "+27 82 555 0142"},
      {type: "wait", ms: 500},
      {type: "click", selector: "#step-3 .btn-primary"},
      {type: "wait", ms: 1000},
    ],
  },
  {
    label: "Booking — step 4–5 · review & confirm",
    route: "/booking",
    duration: 8,
    continueFromPrevious: true,
    scrollFrom: 0,
    scrollTo: 520,
    scrollPhaseRatio: 0.5,
    actions: [
      {type: "click", selector: "#terms-check"},
      {type: "wait", ms: 700},
      {type: "click", selector: "#step-4 .btn-gold"},
      {type: "wait", ms: 3200},
    ],
  },
  {
    label: "Track booking",
    route: "/booking-track?ref=VC-DEMO-2026&email=guest.demo@valleycroft.test",
    duration: 5,
    scrollTo: 0,
    scrollPhaseRatio: 0.3,
    actions: [{type: "wait", ms: 600}],
  },
];

const TOTAL_SECONDS = SCENES.reduce((a, s) => a + s.duration, 0);

if (SUBTITLES.length && SUBTITLES[SUBTITLES.length - 1][1] > TOTAL_SECONDS + 0.5) {
  console.warn(
    `Subtitle ends at ${SUBTITLES[SUBTITLES.length - 1][1]}s but video is ~${TOTAL_SECONDS}s — extend SCENES or shorten last subtitle.`,
  );
}

function launchWindowSize() {
  const v = IPHONE_14_PRO_MAX.viewport;
  const ww = Math.max(960, Math.round(v.width * v.deviceScaleFactor) + 80);
  const wh = Math.max(1200, Math.round(v.height * v.deviceScaleFactor) + 200);
  return `${ww},${wh}`;
}

async function setReactInput(page, selector, text) {
  await page.waitForSelector(selector, {timeout: 8000});
  await page.focus(selector);
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const proto =
        el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc.set.call(el, val);
      el.dispatchEvent(new Event("input", {bubbles: true}));
      el.dispatchEvent(new Event("change", {bubbles: true}));
    },
    selector,
    text,
  );
}

/** Set type=date for React controlled inputs (YYYY-MM-DD). */
async function setReactDateFromDays(page, selector, daysFromToday) {
  await page.waitForSelector(selector, {timeout: 8000});
  const iso = await page.evaluate((days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, daysFromToday);
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      desc.set.call(el, val);
      el.dispatchEvent(new Event("input", {bubbles: true}));
      el.dispatchEvent(new Event("change", {bubbles: true}));
    },
    selector,
    iso,
  );
}

async function runActions(page, actions) {
  for (const action of actions) {
    if (action.type === "wait") {
      await delay(action.ms ?? 400);
      continue;
    }
    if (action.type === "click") {
      try {
        await page.waitForSelector(action.selector, {timeout: 8000});
        await page.click(action.selector);
        await delay(action.afterMs ?? 450);
      } catch {
        console.warn(`  Could not click: ${action.selector}`);
      }
      continue;
    }
    if (action.type === "type") {
      try {
        await page.waitForSelector(action.selector, {timeout: 5000});
        await page.type(action.selector, action.text, {delay: 35});
      } catch {
        console.warn(`  Could not type: ${action.selector}`);
      }
      continue;
    }
    if (action.type === "select") {
      try {
        await page.waitForSelector(action.selector, {timeout: 5000});
        await page.select(action.selector, action.value);
        await delay(200);
      } catch {
        console.warn(`  Could not select: ${action.selector}`);
      }
      continue;
    }
    if (action.type === "reactInput") {
      try {
        await setReactInput(page, action.selector, action.text);
        await delay(120);
      } catch {
        console.warn(`  Could not reactInput: ${action.selector}`);
      }
      continue;
    }
    if (action.type === "reactDate") {
      try {
        await setReactDateFromDays(page, action.selector, action.daysFromToday ?? 7);
        await delay(200);
      } catch {
        console.warn(`  Could not reactDate: ${action.selector}`);
      }
    }
  }
}

async function recordFrames() {
  if (!fs.existsSync(CONFIG.framesDir)) fs.mkdirSync(CONFIG.framesDir, {recursive: true});
  const outDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", `--window-size=${launchWindowSize()}`],
  });

  const page = await browser.newPage();
  await page.setUserAgent(IPHONE_14_PRO_MAX.userAgent);
  await page.setViewport(IPHONE_14_PRO_MAX.viewport);

  await page.evaluateOnNewDocument(() => {
    window.addEventListener("error", (e) => e.stopImmediatePropagation(), true);
    const hide = () => {
      const style = document.createElement("style");
      style.textContent =
        "#vite-error-overlay, vite-error-overlay { display: none !important; visibility: hidden !important; }";
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });

  let frameIndex = 0;
  let prevRoute = null;

  console.log(
    `Capture viewport: iPhone 14 Pro Max (${IPHONE_14_PRO_MAX.viewport.width}×${IPHONE_14_PRO_MAX.viewport.height} @ ${IPHONE_14_PRO_MAX.viewport.deviceScaleFactor}×) → output ${CONFIG.outputWidth}×${CONFIG.outputHeight}\n`,
  );

  for (const scene of SCENES) {
    console.log(`Recording: ${scene.label}`);

    const skipGoto = scene.continueFromPrevious === true && prevRoute === scene.route.split("?")[0];
    if (!skipGoto) {
      await page.goto(`${CONFIG.siteUrl}${scene.route}`, {
        waitUntil: "load",
        timeout: 60000,
      });
      prevRoute = scene.route.split("?")[0];
      await delay(1400);
    } else {
      await delay(500);
    }

    await runActions(page, scene.actions || []);

    const totalFrames = CONFIG.fps * scene.duration;

    let startScroll = scene.scrollFrom ?? 0;
    if (scene.anchorSelector) {
      try {
        await page.waitForSelector(scene.anchorSelector, {timeout: 8000});
        await page.evaluate((sel) => {
          document.querySelector(sel)?.scrollIntoView({block: "start", behavior: "instant"});
        }, scene.anchorSelector);
        await delay(450);
      } catch {
        console.warn(`  Anchor not found: ${scene.anchorSelector}`);
      }
      startScroll = await page.evaluate(() => window.scrollY);
    }

    let endScroll = startScroll;
    if (scene.anchorSelector != null && scene.scrollDelta != null) {
      endScroll = startScroll + scene.scrollDelta;
    } else if (scene.scrollTo != null && scene.scrollTo !== undefined) {
      endScroll = scene.scrollTo;
    }

    const scrollRange = endScroll - startScroll;
    const scrollPhaseRatio = scene.scrollPhaseRatio ?? 0.42;
    const scrollPhase =
      scrollRange !== 0 ? Math.max(1, Math.floor(totalFrames * scrollPhaseRatio)) : 0;

    const hSel = scene.horizontalScrollSelector;
    const hMaxRaw = scene.horizontalScrollMax;
    const hMax = typeof hMaxRaw === "number" && hMaxRaw > 0 ? hMaxRaw : 0;
    const hStartRatio = scene.horizontalScrollStartRatio ?? 0;
    const hPhaseRatio = scene.horizontalScrollPhaseRatio ?? 0.5;
    const hStart = Math.floor(totalFrames * hStartRatio);
    const hPhase = hMax > 0 && hSel ? Math.max(1, Math.floor(totalFrames * hPhaseRatio)) : 0;

    for (let f = 0; f < totalFrames; f++) {
      if (scrollPhase > 0 && f < scrollPhase) {
        const progress = f / scrollPhase;
        const y = Math.round(startScroll + easeInOut(progress) * scrollRange);
        await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      }

      if (hPhase > 0 && f >= hStart && f < hStart + hPhase) {
        const hp = (f - hStart) / hPhase;
        let left = Math.round(easeInOut(hp) * hMax);
        const cap = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return Math.max(0, el.scrollWidth - el.clientWidth);
        }, hSel);
        if (cap != null && cap < left) left = cap;
        await page.evaluate(
          ({sel, x}) => {
            const el = document.querySelector(sel);
            if (el) el.scrollLeft = x;
          },
          {sel: hSel, x: left},
        );
      }

      const framePath = path.join(
        CONFIG.framesDir,
        `frame_${String(frameIndex).padStart(6, "0")}.png`,
      );
      await page.screenshot({path: framePath});
      frameIndex++;
    }
  }

  await browser.close();
  console.log(`Captured ${frameIndex} frames (~${TOTAL_SECONDS}s@${CONFIG.fps}fps, device pixels)\n`);
  return frameIndex;
}

function toSrtTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function writeSrt() {
  let n = 1;
  const blocks = SUBTITLES.map(([start, end, text]) => {
    return [String(n++), `${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}`, text, ""].join("\n");
  });
  fs.writeFileSync(CONFIG.srtFile, blocks.join("\n"), "utf8");
  console.log(`Wrote ${CONFIG.srtFile}`);
  return CONFIG.srtFile;
}

function writeVoiceoverScript() {
  const lines = SUBTITLES.map(([start, end, text]) => {
    const mm = String(Math.floor(start / 60)).padStart(2, "0");
    const ss = String(Math.floor(start % 60)).padStart(2, "0");
    return `[${mm}:${ss}] ${text}`;
  });
  const header = [
    "ValleyCroft — VOICEOVER SCRIPT (read aloud or record in a DAW)",
    "",
    "This is NOT an audio file. The generator does not create spoken audio.",
    "Record each line near the [mm:ss] timecodes; mix under background_music.mp3 or replace it.",
    `Target length: ~${TOTAL_SECONDS} seconds (optional — MP4 has no burned-in text unless AD_BURN_SUBTITLES=1).`,
    "",
  ];
  const body = lines.join("\n\n");
  fs.writeFileSync(CONFIG.voiceoverScriptFile, header.join("\n") + body + "\n", "utf8");
  const outCopy = path.join(path.dirname(CONFIG.outputFile), "ad_voiceover_script.txt");
  fs.copyFileSync(CONFIG.voiceoverScriptFile, outCopy);
  console.log(`Wrote ${CONFIG.voiceoverScriptFile}`);
  console.log(`Also copied to ${outCopy}\n`);
}

/** Subtitle style: smaller, lower-third friendly, less coverage of the site UI */
function ffmpegVideoFilter(absPath) {
  const normalized = path.resolve(absPath).replace(/\\/g, "/");
  const escaped = normalized.replace(/^([A-Za-z]):/, "$1\\:");
  const style =
    "FontName=Arial,FontSize=15,PrimaryColour=&H00F0F0F0,OutlineColour=&H80000000,Bold=0,Outline=1,Shadow=0,MarginV=120,WrapStyle=2,Alignment=2";
  return `subtitles='${escaped}':force_style='${style}'`;
}

function scalePadFilter() {
  const w = CONFIG.outputWidth;
  const h = CONFIG.outputHeight;
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
}

function assembleVideo() {
  return new Promise((resolve, reject) => {
    console.log(`Assembling ${CONFIG.outputWidth}×${CONFIG.outputHeight} video (from device screenshots)...`);

    const framePattern = path.join(CONFIG.framesDir, "frame_%06d.png");
    const hasMusic = fs.existsSync(CONFIG.musicFile);
    const fadeOutStart = Math.max(0, TOTAL_SECONDS - 2.5);
    const vf = BURN_SUBTITLES
      ? `${scalePadFilter()},${ffmpegVideoFilter(CONFIG.srtFile)}`
      : scalePadFilter();
    if (!BURN_SUBTITLES) {
      console.log("MP4: no burned-in subtitles (set AD_BURN_SUBTITLES=1 to embed ad_subtitles.srt).\n");
    }

    let command = ffmpeg()
      .input(framePattern)
      .inputFPS(CONFIG.fps)
      .videoCodec("libx264")
      .outputOptions(["-crf 20", "-preset medium", "-pix_fmt yuv420p", "-movflags +faststart"])
      .videoFilters(vf);

    if (hasMusic) {
      command = command
        .input(CONFIG.musicFile)
        .outputOptions([
          "-shortest",
          "-af",
          `afade=t=in:ss=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2.5`,
        ])
        .audioCodec("aac")
        .audioBitrate("192k");
    } else {
      console.warn(
        "No background_music.mp3 — video is silent. Add music or lay in a VO in an editor.",
      );
    }

    command
      .output(CONFIG.outputFile)
      .on("progress", (p) => {
        if (p.percent) process.stdout.write(`\r  Progress: ${Math.round(p.percent)}%`);
      })
      .on("end", () => {
        console.log(`\nDone: ${CONFIG.outputFile}`);
        resolve();
      })
      .on("error", reject)
      .run();
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

(async () => {
  try {
    await recordFrames();
    writeSrt();
    writeVoiceoverScript();
    await assembleVideo();
    console.log(
      "Optional VO script: ad_voiceover_script.txt or out/ad_voiceover_script.txt (no auto .mp3).",
    );
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
