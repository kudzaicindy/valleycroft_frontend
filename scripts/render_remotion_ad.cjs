/**
 * Remotion ValleyCroftAd export: if no server is on 127.0.0.1:5173, start Vite,
 * wait until it responds, run `remotion render`, then stop Vite if we started it.
 */
const http = require("http");
const path = require("path");
const {spawn} = require("child_process");

const ROOT = path.join(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = 5173;
const SITE = `http://${HOST}:${PORT}/`;
const READY_RETRIES = 120;
const READY_MS = 1000;

function checkReady() {
  return new Promise((resolve) => {
    const req = http.get(SITE, {timeout: 2000}, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  let viteProc = null;
  let weStartedVite = false;

  if (await checkReady()) {
    process.stderr.write(`Using existing dev server at ${SITE}\n`);
  } else {
    process.stderr.write(`Starting Vite on ${SITE} (none was listening)…\n`);
    const viteJs = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
    viteProc = spawn(process.execPath, [viteJs, "--host", "127.0.0.1", "--strictPort"], {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    weStartedVite = true;
    viteProc.on("error", (err) => {
      process.stderr.write(String(err) + "\n");
    });

    let up = false;
    for (let i = 0; i < READY_RETRIES; i++) {
      await sleep(READY_MS);
      if (await checkReady()) {
        up = true;
        break;
      }
    }
    if (!up) {
      process.stderr.write(`Timed out waiting for Vite at ${SITE}. Is port ${PORT} in use?\n`);
      if (viteProc.pid) {
        try {
          viteProc.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
      process.exit(1);
    }
  }

  const extra = process.argv.slice(2);
  /* One browser tab: parallel workers often capture iframe content out of sync (looks like flicker). */
  const renderArgs = [
    "remotion",
    "render",
    "remotion/index.jsx",
    "ValleyCroftAd",
    "out/valleycroft-remotion-ad.mp4",
    "--concurrency=1",
    "--overwrite",
    ...extra,
  ];
  const render = spawn("npx", renderArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  const code = await new Promise((resolve) => {
    render.on("close", resolve);
    render.on("error", () => resolve(1));
  });

  if (weStartedVite && viteProc && !viteProc.killed) {
    try {
      viteProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await sleep(500);
  }

  process.exit(code === 0 ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(e.stack || String(e));
  process.stderr.write("\n");
  process.exit(1);
});
