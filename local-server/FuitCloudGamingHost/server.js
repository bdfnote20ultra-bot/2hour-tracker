const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.FUIT_CLOUD_GAMING_PORT || 8175);
const startedAtMs = Date.now();
const sessionName = process.env.FUIT_CLOUD_SESSION_NAME || "FUIT Cloud Gaming";
const gameName = process.env.FUIT_CLOUD_GAME_NAME || "PC emulator game";
const gamePath = process.env.FUIT_CLOUD_GAME_PATH || "";
const rmgPath = process.env.FUIT_CLOUD_RMG_PATH || "T:\\FattysLiveTV\\Tools\\Emulators\\RMG\\RMG.exe";
const n64RomRoot = process.env.FUIT_CLOUD_N64_ROM_ROOT || "T:\\FattysLiveTV\\Games\\Roms\\N64";

const controllers = new Map();
let latestFrame = null;
let latestFrameMs = 0;
let hostCaptureState = {
  connected: false,
  lastSeenMs: 0
};
let launchState = {
  requested: false,
  ok: false,
  message: "Ready for N64 browser launch.",
  gameName,
  lastRequestedMs: 0
};

const allowedButtons = new Set([
  "up",
  "down",
  "left",
  "right",
  "a",
  "b",
  "start",
  "select",
  "l",
  "r",
  "z",
  "c-up",
  "c-down",
  "c-left",
  "c-right"
]);

function makeGameId(filePath) {
  return Buffer.from(filePath, "utf8").toString("base64url");
}

function readGameId(gameId) {
  try {
    return Buffer.from(String(gameId || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function listN64Games() {
  const extensions = new Set([".n64", ".z64", ".v64"]);
  const games = [];

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach(entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        return;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) return;

      const label = path.basename(entry.name, ext)
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim() || path.basename(entry.name, ext);

      games.push({
        id: makeGameId(fullPath),
        system: "N64",
        label,
        fileName: entry.name,
        emulator: "RMG"
      });
    });
  }

  walk(n64RomRoot);
  return games.sort((a, b) => a.label.localeCompare(b.label));
}

function resolveN64Game(gameId) {
  const decodedPath = readGameId(gameId);
  if (!decodedPath) return null;

  const resolvedRoot = path.resolve(n64RomRoot).toLowerCase();
  const resolvedGame = path.resolve(decodedPath);
  const resolvedGameLower = resolvedGame.toLowerCase();
  const ext = path.extname(resolvedGame).toLowerCase();

  if (![".n64", ".z64", ".v64"].includes(ext)) return null;
  if (!resolvedGameLower.startsWith(resolvedRoot + path.sep.toLowerCase()) && resolvedGameLower !== resolvedRoot) return null;
  if (!fs.existsSync(resolvedGame)) return null;

  return {
    path: resolvedGame,
    label: path.basename(resolvedGame, ext)
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim() || path.basename(resolvedGame, ext)
  };
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function sendLaunchPage(res, status, value) {
  const title = value.ok ? "Launch Requested" : "Launch Failed";
  const message = value.message || title;
  send(res, status, `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #020617;
      color: #dbeafe;
      font-family: Arial, sans-serif;
      font-weight: 900;
      text-align: center;
    }
    main {
      max-width: 520px;
      padding: 24px;
    }
    h1 {
      margin: 0 0 10px;
      color: ${value.ok ? "#86efac" : "#fca5a5"};
      font-size: 24px;
    }
    p {
      margin: 0;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
  <script>
    setTimeout(() => {
      try { window.close(); } catch {}
    }, 900);
  </script>
</body>
</html>`, "text/html; charset=utf-8");
}

function publicOrigin(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto || (host.includes("trycloudflare.com") || host.includes("flivetv.qzz.io") ? "https" : "http");
  return `${proto}://${host}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pruneControllers() {
  const now = Date.now();
  for (const [id, controller] of controllers.entries()) {
    if (now - controller.lastSeenMs > 10000) controllers.delete(id);
  }
  if (hostCaptureState.connected && now - hostCaptureState.lastSeenMs > 6000) {
    hostCaptureState = { ...hostCaptureState, connected: false };
  }
}

function activeControllers() {
  pruneControllers();
  return Array.from(controllers.values()).map(controller => ({
    id: controller.id,
    label: controller.label,
    buttons: controller.buttons,
    axes: controller.axes,
    lastSeenMs: controller.lastSeenMs
  }));
}

function aggregateInput() {
  const buttons = new Set();
  const controllersList = activeControllers();
  controllersList.forEach(controller => {
    controller.buttons.forEach(button => {
      if (allowedButtons.has(button)) buttons.add(button);
    });
  });

  return {
    ok: true,
    buttons: Array.from(buttons),
    controllers: controllersList,
    updatedAt: new Date().toISOString()
  };
}

function statusPayload(req) {
  const origin = publicOrigin(req);
  const controllersList = activeControllers();
  return {
    ok: true,
    active: true,
    mode: "cloud-gaming",
    sessionName,
    gameName,
    gamePath,
    hasLaunchPath: Boolean(gamePath || fs.existsSync(rmgPath)),
    systems: {
      N64: {
        enabled: fs.existsSync(rmgPath) && fs.existsSync(n64RomRoot),
        emulator: "RMG",
        emulatorPath: rmgPath,
        romRoot: n64RomRoot
      }
    },
    hasFrame: Boolean(latestFrame),
    latestFrameMs,
    hostCaptureState,
    launchState,
    viewerUrl: `${origin}/room`,
    controllerUrl: `${origin}/controller`,
    hostUrl: `${origin}/room?host=1`,
    inputStateUrl: `${origin}/input-state`,
    controllers: controllersList,
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    host: os.hostname()
  };
}

function pageShell(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; background: #020617; color: #dbeafe; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    body { display: grid; place-items: stretch; }
    main { width: 100%; min-height: 100%; display: grid; grid-template-rows: auto minmax(260px, 1fr) auto; gap: 12px; padding: 14px; }
    .panel { border: 1px solid rgba(147,197,253,.26); background: linear-gradient(180deg, rgba(30,64,175,.72), rgba(15,23,42,.96)); border-radius: 8px; padding: 14px; box-shadow: inset 0 0 24px rgba(0,0,0,.38); }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 18px; font-weight: 1000; color: #bfdbfe; }
    .sub { color: #93c5fd; font-size: 12px; font-weight: 850; line-height: 1.4; }
    .stage { min-height: 260px; padding: 0; overflow: hidden; display: grid; place-items: center; background: #000; position: relative; }
    video, img.stream { width: 100%; height: 100%; min-height: 300px; object-fit: contain; background: #000; }
    video { display: none; }
    .empty { padding: 20px; max-width: 560px; text-align: center; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button { border: 0; border-radius: 8px; padding: 10px 12px; background: #93c5fd; color: #0f172a; font-weight: 1000; cursor: pointer; }
    select { min-width: 210px; border: 1px solid rgba(147,197,253,.34); border-radius: 8px; padding: 9px 10px; background: rgba(15,23,42,.86); color: #dbeafe; font-weight: 900; }
    button.secondary { background: rgba(15,23,42,.86); color: #dbeafe; border: 1px solid rgba(147,197,253,.34); }
    button.warn { background: #fde68a; color: #422006; }
    button:disabled { opacity: .48; cursor: default; }
    .muted { color: #94a3b8; font-size: 11px; font-weight: 800; line-height: 1.4; }
    .kbd { display: inline-block; min-width: 28px; padding: 5px 8px; margin: 3px; border-radius: 7px; border: 1px solid rgba(147,197,253,.28); background: rgba(15,23,42,.82); text-align: center; font-weight: 1000; }
    .pad { width: 100%; max-width: 640px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: center; }
    .dpad { display: grid; grid-template-columns: repeat(3, 70px); grid-template-rows: repeat(3, 58px); gap: 8px; justify-content: center; }
    .cluster { display: grid; grid-template-columns: repeat(3, minmax(64px, 1fr)); gap: 8px; }
    .control { min-height: 54px; touch-action: none; user-select: none; }
    .control.active { background: #fef08a; color: #0f172a; }
    @media (max-width: 680px) {
      main { padding: 10px; }
      .top { align-items: flex-start; flex-direction: column; }
      .pad { grid-template-columns: 1fr; }
      .dpad { grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 54px); }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function roomPage(req) {
  const status = statusPayload(req);
  return pageShell("FUITS Cloud Gaming", `
    <main>
      <section class="panel top">
        <div>
          <div class="title">${escapeHtml(status.sessionName)}</div>
          <div class="sub">${escapeHtml(status.gameName)}${status.gamePath ? " - " + escapeHtml(status.gamePath) : ""}</div>
        </div>
        <button class="secondary" onclick="location.reload()">Refresh</button>
      </section>
      <section class="panel stage">
        <video id="hostVideo" autoplay muted playsinline></video>
        <img id="frame" class="stream" alt="FUITS Cloud Gaming stream" style="display: none;" />
        <div id="empty" class="empty">
          <div class="title" style="margin-bottom: 8px;">Waiting for PC emulator stream</div>
          <div class="sub">Launch or focus the emulator on this PC, click Capture PC Game Window, then choose the emulator window.</div>
        </div>
      </section>
      <section class="panel">
        <div class="actions">
          <select id="gameSelect" aria-label="N64 game"></select>
          <button id="launchBtn" ${status.hasLaunchPath ? "" : "disabled"}>Launch N64 Game</button>
          <button id="captureBtn">Capture PC Game Window</button>
          <button class="secondary" id="controllerBtn">Open Controller</button>
          <button class="secondary" id="fullscreenBtn">Fullscreen View</button>
          <button class="warn" id="stopBtn">Stop Capture</button>
        </div>
        <p id="status" class="muted">Open the emulator window, keep it focused for controller input, and leave this helper running.</p>
      </section>
    </main>
    <script>
      const video = document.getElementById("hostVideo");
      const img = document.getElementById("frame");
      const empty = document.getElementById("empty");
      const statusLine = document.getElementById("status");
      const captureCanvas = document.createElement("canvas");
      const captureCtx = captureCanvas.getContext("2d", { alpha: false });
      const gameSelect = document.getElementById("gameSelect");
      const launchBtn = document.getElementById("launchBtn");
      let captureStream = null;
      let uploadTimer = null;
      let statusTimer = null;
      let games = [];

      function showViewerFrame(src) {
        if (captureStream) return;
        img.src = src;
        img.style.display = "block";
        video.style.display = "none";
        empty.style.display = "none";
      }

      function showEmpty() {
        if (captureStream) return;
        img.style.display = "none";
        video.style.display = "none";
        empty.style.display = "block";
      }

      async function refreshFrame() {
        const next = "/frame.jpg?t=" + Date.now();
        const probe = new Image();
        probe.onload = () => showViewerFrame(next);
        probe.onerror = showEmpty;
        probe.src = next;
      }

      async function postHostStatus() {
        try {
          await fetch("/api/host", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameName: ${JSON.stringify(gameName)} })
          });
        } catch {}
      }

      async function uploadFrame() {
        if (!captureStream || !video.videoWidth || !video.videoHeight) return;
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        captureCanvas.width = Math.max(2, Math.round(video.videoWidth * scale));
        captureCanvas.height = Math.max(2, Math.round(video.videoHeight * scale));
        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const image = captureCanvas.toDataURL("image/jpeg", 0.68);
        try {
          await fetch("/api/frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image })
          });
        } catch {}
      }

      function setCaptured(stream) {
        captureStream = stream;
        video.srcObject = stream;
        video.style.display = "block";
        img.style.display = "none";
        empty.style.display = "none";
        statusLine.textContent = "Capturing and sharing the PC emulator window. Keep the emulator focused for controller input.";
        stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
        uploadTimer = window.setInterval(uploadFrame, 90);
        statusTimer = window.setInterval(postHostStatus, 2000);
        postHostStatus();
      }

      function stopCapture() {
        if (captureStream) captureStream.getTracks().forEach(track => track.stop());
        captureStream = null;
        video.srcObject = null;
        if (uploadTimer) window.clearInterval(uploadTimer);
        if (statusTimer) window.clearInterval(statusTimer);
        uploadTimer = null;
        statusTimer = null;
        statusLine.textContent = "Capture stopped.";
        refreshFrame();
      }

      async function loadGames() {
        try {
          const response = await fetch("/api/games?system=N64", { cache: "no-store" });
          const data = await response.json();
          games = Array.isArray(data.games) ? data.games : [];
          gameSelect.innerHTML = "";
          games.forEach(game => {
            const option = document.createElement("option");
            option.value = game.id;
            option.textContent = game.label;
            gameSelect.appendChild(option);
          });
          if (games.length) {
            launchBtn.disabled = false;
            statusLine.textContent = "Choose an N64 game, launch it, then capture the RMG window.";
          } else {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No N64 games found";
            gameSelect.appendChild(option);
            launchBtn.disabled = true;
            statusLine.textContent = "No N64 games were found in the configured ROM folder.";
          }
        } catch {
          gameSelect.innerHTML = "<option value=\\"\\">Game list unavailable</option>";
          launchBtn.disabled = true;
          statusLine.textContent = "Could not load the N64 game list from the helper.";
        }
      }

      launchBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system: "N64",
              gameId: gameSelect.value || games[0]?.id || ""
            })
          });
          const data = await response.json();
          statusLine.textContent = data.message || (data.ok ? "Launch requested." : "Launch failed.");
        } catch {
          statusLine.textContent = "Could not reach the launcher helper.";
        }
      });

      document.getElementById("captureBtn").addEventListener("click", async () => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 60 },
            audio: true
          });
          setCaptured(stream);
        } catch (error) {
          statusLine.textContent = error?.message || "Screen capture was cancelled.";
        }
      });

      document.getElementById("controllerBtn").addEventListener("click", () => {
        window.open("/controller", "_blank", "noopener,noreferrer");
      });

      document.getElementById("fullscreenBtn").addEventListener("click", () => {
        const target = captureStream ? video : (img.style.display === "none" ? document.documentElement : img);
        const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
        requestFullscreen?.call(target);
      });

      document.getElementById("stopBtn").addEventListener("click", stopCapture);
      setInterval(refreshFrame, 180);
      refreshFrame();
      loadGames();
    </script>
  `);
}

function controllerPage() {
  return pageShell("FUITS Cloud Controller", `
    <main>
      <section class="panel top">
        <div>
          <div class="title">FUITS Cloud Controller</div>
          <div class="sub">This browser controls the focused emulator window on the host PC.</div>
        </div>
        <button class="secondary" onclick="location.reload()">Reconnect</button>
      </section>
      <section class="panel" style="display: grid; place-items: center;">
        <div class="pad">
          <div class="dpad">
            <span></span><button class="control" data-button="up">UP</button><span></span>
            <button class="control" data-button="left">LEFT</button><span></span><button class="control" data-button="right">RIGHT</button>
            <span></span><button class="control" data-button="down">DOWN</button><span></span>
          </div>
          <div class="cluster">
            <button class="control" data-button="l">L</button>
            <button class="control" data-button="z">Z</button>
            <button class="control" data-button="r">R</button>
            <button class="control" data-button="c-left">C LEFT</button>
            <button class="control" data-button="c-up">C UP</button>
            <button class="control" data-button="c-right">C RIGHT</button>
            <button class="control" data-button="b">B</button>
            <button class="control" data-button="c-down">C DOWN</button>
            <button class="control" data-button="a">A</button>
            <button class="control secondary" data-button="select">SELECT</button>
            <button class="control secondary" data-button="start">START</button>
            <span></span>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="sub">Keyboard fallback</div>
        <div><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span><span class="kbd">J</span><span class="kbd">K</span><span class="kbd">Enter</span></div>
        <p id="status" class="muted">Connecting...</p>
      </section>
    </main>
    <script>
      const idKey = "fuitsCloudControllerId";
      const controllerId = localStorage.getItem(idKey) || crypto.randomUUID();
      localStorage.setItem(idKey, controllerId);
      const pressed = new Set();
      const status = document.getElementById("status");
      const keyMap = {
        KeyW: "up",
        KeyA: "left",
        KeyS: "down",
        KeyD: "right",
        KeyJ: "b",
        KeyK: "a",
        KeyU: "c-left",
        KeyI: "c-up",
        KeyO: "c-right",
        KeyL: "c-down",
        KeyQ: "l",
        KeyE: "r",
        KeyZ: "z",
        Enter: "start",
        ShiftRight: "select",
        ShiftLeft: "select"
      };

      function setButton(button, down) {
        if (!button) return;
        if (down) pressed.add(button); else pressed.delete(button);
        document.querySelectorAll("[data-button]").forEach(item => {
          item.classList.toggle("active", pressed.has(item.dataset.button));
        });
      }

      document.querySelectorAll("[data-button]").forEach(button => {
        const name = button.dataset.button;
        button.addEventListener("pointerdown", event => {
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          setButton(name, true);
        });
        button.addEventListener("pointerup", event => {
          event.preventDefault();
          setButton(name, false);
        });
        button.addEventListener("pointercancel", () => setButton(name, false));
        button.addEventListener("pointerleave", event => {
          if (event.buttons) return;
          setButton(name, false);
        });
      });

      window.addEventListener("keydown", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        setButton(mapped, true);
      });

      window.addEventListener("keyup", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        setButton(mapped, false);
      });

      async function sendInput() {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        const pad = pads[0];
        const buttons = Array.from(pressed);
        if (pad) {
          const gamepadMap = { 0: "a", 1: "b", 2: "z", 3: "start", 4: "l", 5: "r", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };
          pad.buttons.forEach((button, index) => { if (button.pressed && gamepadMap[index]) buttons.push(gamepadMap[index]); });
          const x = pad.axes[0] || 0;
          const y = pad.axes[1] || 0;
          const cx = pad.axes[2] || 0;
          const cy = pad.axes[3] || 0;
          if (x < -0.45) buttons.push("left");
          if (x > 0.45) buttons.push("right");
          if (y < -0.45) buttons.push("up");
          if (y > 0.45) buttons.push("down");
          if (cx < -0.45) buttons.push("c-left");
          if (cx > 0.45) buttons.push("c-right");
          if (cy < -0.45) buttons.push("c-up");
          if (cy > 0.45) buttons.push("c-down");
        }
        const uniqueButtons = Array.from(new Set(buttons));
        try {
          await fetch("/api/controller", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: controllerId, label: pad?.id || "Browser Controller", buttons: uniqueButtons, axes: pad?.axes || [] })
          });
          status.textContent = uniqueButtons.length ? "Sending: " + uniqueButtons.join(", ") : "Connected. Press a button.";
        } catch {
          status.textContent = "Helper connection lost.";
        }
      }

      window.addEventListener("blur", () => pressed.clear());
      setInterval(sendInput, 60);
      sendInput();
    </script>
  `);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024 * 8) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function disableRmgPauseOnFocusLoss(launchExe) {
  const configPath = path.join(path.dirname(launchExe), "Config", "mupen64plus.cfg");
  if (!fs.existsSync(configPath)) return;

  const config = fs.readFileSync(configPath, "utf8");
  const nextConfig = config.replace(
    /^PauseEmulationOnFocusLoss\s*=\s*True$/m,
    "PauseEmulationOnFocusLoss = False"
  );

  if (nextConfig !== config) {
    fs.writeFileSync(configPath, nextConfig, "utf8");
  }
}

function launchConfiguredGame(options = {}) {
  let launchExe = gamePath;
  let launchRom = "";
  let launchLabel = gameName;
  const system = String(options.system || "").toUpperCase();
  const wantsN64 = system === "N64" || (!launchExe && !options.gameId);
  const gameId = options.gameId || (wantsN64 ? listN64Games()[0]?.id : "");

  if (wantsN64) {
    const selectedGame = resolveN64Game(gameId);
    if (!selectedGame) throw new Error("That N64 game was not found on the host PC.");
    if (!fs.existsSync(rmgPath)) throw new Error(`RMG emulator was not found at ${rmgPath}.`);
    launchExe = rmgPath;
    launchRom = selectedGame.path;
    launchLabel = selectedGame.label;
  }

  if (!launchExe) {
    throw new Error("No emulator/game path was selected when the helper started.");
  }

  if (launchExe.toLowerCase() === rmgPath.toLowerCase()) {
    disableRmgPauseOnFocusLoss(launchExe);
  }

  const child = spawn(launchExe, launchRom ? [launchRom] : [], {
    cwd: path.dirname(launchExe),
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();

  return { label: launchLabel, exe: launchExe, rom: launchRom, system: launchRom ? "N64" : "", pid: child.pid || 0 };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/room")) {
    send(res, 200, roomPage(req), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/controller") {
    send(res, 200, controllerPage(), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    sendJson(res, 200, statusPayload(req));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/games") {
    const system = String(url.searchParams.get("system") || "N64").toUpperCase();
    if (system !== "N64") {
      sendJson(res, 400, { ok: false, error: "Only N64 cloud games are configured right now." });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      system: "N64",
      emulator: "RMG",
      games: listN64Games()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/input-state") {
    sendJson(res, 200, aggregateInput());
    return;
  }

  if (req.method === "GET" && url.pathname === "/frame.jpg") {
    if (!latestFrame) {
      send(res, 404, "No host frame yet.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": latestFrame.type,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store"
    });
    res.end(latestFrame.buffer);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/launch") {
    try {
      const launched = launchConfiguredGame({
        system: String(url.searchParams.get("system") || "").toUpperCase(),
        gameId: url.searchParams.get("gameId") || ""
      });
      launchState = {
        requested: true,
        ok: true,
        message: `Launch requested for ${launched.label}.`,
        gameName: launched.label,
        system: launched.system || String(url.searchParams.get("system") || "").toUpperCase(),
        rom: launched.rom || "",
        lastRequestedMs: Date.now()
      };
      sendLaunchPage(res, 200, { ok: true, message: launchState.message });
    } catch (error) {
      launchState = {
        requested: true,
        ok: false,
        message: error.message || "Launch failed.",
        gameName: "",
        system: String(url.searchParams.get("system") || "").toUpperCase(),
        rom: "",
        lastRequestedMs: Date.now()
      };
      sendLaunchPage(res, 500, { ok: false, message: launchState.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/launch") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const launched = launchConfiguredGame({
        system: String(body.system || "").toUpperCase(),
        gameId: body.gameId
      });
      launchState = {
        requested: true,
        ok: true,
        message: `Launch requested for ${launched.label}.`,
        gameName: launched.label,
        system: launched.system || body.system || "",
        rom: launched.rom || "",
        lastRequestedMs: Date.now()
      };
      sendJson(res, 200, { ok: true, message: launchState.message, launched });
    } catch (error) {
      launchState = {
        requested: true,
        ok: false,
        message: error.message || "Launch failed.",
        lastRequestedMs: Date.now()
      };
      sendJson(res, 400, { ok: false, message: launchState.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/host") {
    try {
      JSON.parse(await readBody(req) || "{}");
      hostCaptureState = {
        connected: true,
        lastSeenMs: Date.now()
      };
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad host payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/frame") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const match = String(body.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match) throw new Error("Expected a data URL image frame.");
      latestFrame = {
        type: match[1],
        buffer: Buffer.from(match[2], "base64")
      };
      latestFrameMs = Date.now();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad frame payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const id = String(body.id || "").slice(0, 80) || `controller-${controllers.size + 1}`;
      const buttons = Array.isArray(body.buttons)
        ? body.buttons.map(button => String(button)).filter(button => allowedButtons.has(button)).slice(0, 32)
        : [];
      controllers.set(id, {
        id,
        label: String(body.label || "Browser Controller").slice(0, 120),
        buttons,
        axes: Array.isArray(body.axes) ? body.axes.slice(0, 8) : [],
        lastSeenMs: Date.now()
      });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad controller payload." });
    }
    return;
  }

  send(res, 404, "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FUIT Cloud Gaming helper running at http://127.0.0.1:${PORT}`);
  console.log(`Session: ${sessionName}`);
  console.log(`Game: ${gameName}`);
  console.log(`Launch path: ${gamePath || "(none selected)"}`);
  console.log(`Viewer: http://127.0.0.1:${PORT}/room`);
  console.log(`Controller: http://127.0.0.1:${PORT}/controller`);
});
