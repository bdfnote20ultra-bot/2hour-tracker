const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PORT = Number(process.env.FUIT_CLOUD_GAMING_PORT || 8175);
const startedAtMs = Date.now();
const sessionName = process.env.FUIT_CLOUD_SESSION_NAME || "FUIT Cloud Gaming";
const gameName = process.env.FUIT_CLOUD_GAME_NAME || "PC emulator game";
const gamePath = process.env.FUIT_CLOUD_GAME_PATH || "";
const rmgPath = process.env.FUIT_CLOUD_RMG_PATH || "T:\\FattysLiveTV\\Tools\\Emulators\\RMG\\RMG.exe";
const n64RomRoot = process.env.FUIT_CLOUD_N64_ROM_ROOT || "T:\\FattysLiveTV\\Games\\Roms\\N64";
const streamMaxWidth = Number(process.env.FUIT_CLOUD_STREAM_MAX_WIDTH || 384);
const streamJpegQuality = Math.min(0.86, Math.max(0.35, Number(process.env.FUIT_CLOUD_STREAM_JPEG_QUALITY || 0.35)));
const streamFrameIntervalMs = Math.max(33, Number(process.env.FUIT_CLOUD_STREAM_FRAME_MS || 34));
const autoCaptureScript = process.env.FUIT_CLOUD_AUTO_CAPTURE_SCRIPT || path.join(__dirname, "AutoCapture.ps1");
const graphicsCaptureScript = process.env.FUIT_CLOUD_GRAPHICS_CAPTURE_SCRIPT || path.join(__dirname, "GraphicsCapture.py");
const graphicsCapturePydeps = process.env.FUIT_CLOUD_GRAPHICS_CAPTURE_PYDEPS || path.join(__dirname, "pydeps");
const graphicsCapturePython = process.env.FUIT_CLOUD_PYTHON || "python";
const ffmpegPath = process.env.FUIT_CLOUD_FFMPEG || "C:\\Program Files\\Jellyfin\\Server\\ffmpeg.exe";
const videoEncoder = process.env.FUIT_CLOUD_VIDEO_ENCODER || "h264_qsv";
const videoBitrate = process.env.FUIT_CLOUD_VIDEO_BITRATE || "2600k";
const captureBackend = String(process.env.FUIT_CLOUD_CAPTURE_BACKEND || "graphics").toLowerCase();
const obsWebRtcEnabled = ["obs", "obs-webrtc", "webrtc"].includes(captureBackend);
const obsWebRtcPath = (process.env.FUIT_CLOUD_OBS_WEBRTC_PATH || "fuits").replace(/^\/+|\/+$/g, "") || "fuits";
const obsWebRtcPort = Number(process.env.FUIT_CLOUD_OBS_WEBRTC_PORT || 8889);
const obsWhipUrlOverride = process.env.FUIT_CLOUD_OBS_WHIP_URL || "";
const obsWhepUrlOverride = process.env.FUIT_CLOUD_OBS_WHEP_URL || "";
const obsFallbackEnabled = String(process.env.FUIT_CLOUD_OBS_FALLBACK || "off").toLowerCase() !== "off";
const hlsDir = process.env.FUIT_CLOUD_HLS_DIR || path.join(os.tmpdir(), `fuit-cloud-hls-${PORT}`);
const helperPriorityClass = normalizeWindowsPriority(process.env.FUIT_CLOUD_HELPER_PRIORITY || "BelowNormal", "BelowNormal");
const capturePriorityClass = normalizeWindowsPriority(process.env.FUIT_CLOUD_CAPTURE_PRIORITY || "BelowNormal", "BelowNormal");
const emulatorPriorityClass = normalizeWindowsPriority(process.env.FUIT_CLOUD_EMULATOR_PRIORITY || "High", "High");
const ffmpegStreamingEnabled = captureBackend === "ffmpeg" || captureBackend === "video";

const controllers = new Map();
const mjpegClients = new Set();
const MJPEG_BOUNDARY = "fuitcloudframe";
let autoCaptureProcess = null;
let hlsProcess = null;
let hlsStopTimer = null;
let hlsLastClientMs = 0;
let latestFrame = null;
let latestFrameMs = 0;
let latestFrameSequence = 0;
let hostCaptureState = {
  connected: false,
  lastSeenMs: 0,
  status: "idle",
  mode: "auto"
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

function normalizeWindowsPriority(value, fallback) {
  const priorities = new Map([
    ["idle", "Idle"],
    ["belownormal", "BelowNormal"],
    ["below-normal", "BelowNormal"],
    ["normal", "Normal"],
    ["abovenormal", "AboveNormal"],
    ["above-normal", "AboveNormal"],
    ["high", "High"]
  ]);
  return priorities.get(String(value || "").trim().toLowerCase()) || fallback;
}

function psQuote(value) {
  return String(value || "").replace(/'/g, "''");
}

function setWindowsProcessPriority({ pid = 0, processName = "", priority = "Normal" } = {}) {
  if (os.platform() !== "win32") return;

  const safePriority = normalizeWindowsPriority(priority, "Normal");
  const safePid = Number(pid || 0);
  const safeProcessName = psQuote(processName);
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$priority = '${safePriority}'`,
    "$matched = $false",
    safePid > 0 ? `$proc = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue` : "$proc = $null",
    "if ($proc) { $proc.PriorityClass = $priority; $matched = $true }",
    safeProcessName
      ? `if (-not $matched) { Get-Process -Name '${safeProcessName}' -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = $priority } }`
      : ""
  ].filter(Boolean).join("; ");

  try {
    const priorityProcess = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", script
    ], {
      cwd: __dirname,
      detached: false,
      stdio: "ignore",
      windowsHide: true
    });
    priorityProcess.unref();
  } catch {}
}

function getRmgWindowTitle() {
  if (os.platform() !== "win32") return "";

  try {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-Process -Name RMG -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle)"
    ], {
      cwd: __dirname,
      encoding: "utf8",
      timeout: 2500,
      windowsHide: true
    });
    return String(result.stdout || "").trim();
  } catch {
    return "";
  }
}

function encoderArgs() {
  const encoder = String(videoEncoder || "h264_nvenc").toLowerCase();
  const baseArgs = [
    "-c:v", encoder,
    "-b:v", videoBitrate,
    "-maxrate", videoBitrate,
    "-bufsize", "900k",
    "-g", "30",
    "-bf", "0",
    "-pix_fmt", "yuv420p"
  ];

  if (encoder === "h264_nvenc") {
    return [...baseArgs, "-preset", "p1", "-tune", "ull"];
  }
  if (encoder === "h264_qsv") {
    return [...baseArgs, "-preset", "veryfast", "-async_depth", "1", "-look_ahead", "0", "-low_delay_brc", "1"];
  }
  if (encoder === "h264_amf") {
    return [...baseArgs, "-quality", "speed", "-usage", "ultralowlatency"];
  }
  return [...baseArgs, "-preset", "veryfast"];
}

function resetHlsDir() {
  try {
    fs.rmSync(hlsDir, { recursive: true, force: true });
    fs.mkdirSync(hlsDir, { recursive: true });
  } catch {}
}

function stopHlsStream() {
  if (hlsStopTimer) {
    clearTimeout(hlsStopTimer);
    hlsStopTimer = null;
  }
  if (!hlsProcess) return;
  try {
    hlsProcess.kill("SIGTERM");
  } catch {}
  hlsProcess = null;
}

function touchHlsStream() {
  hlsLastClientMs = Date.now();
  if (hlsStopTimer) clearTimeout(hlsStopTimer);
  hlsStopTimer = setTimeout(() => {
    if (Date.now() - hlsLastClientMs >= 15000) {
      stopHlsStream();
      hostCaptureState = {
        ...hostCaptureState,
        connected: false,
        status: "waiting",
        lastSeenMs: Date.now()
      };
    }
  }, 16000);
}

function startHlsStream() {
  if (!ffmpegStreamingEnabled) return;
  if (hlsProcess && !hlsProcess.killed) return;
  if (!fs.existsSync(ffmpegPath)) return;

  resetHlsDir();
  const windowTitle = getRmgWindowTitle();
  const inputTarget = windowTitle ? `title=${windowTitle}` : "desktop";
  const playlistPath = path.join(hlsDir, "stream.m3u8");
  const segmentPath = path.join(hlsDir, "segment-%05d.ts");
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-f", "gdigrab",
    "-draw_mouse", "0",
    "-framerate", String(Math.max(15, Math.min(60, Math.round(1000 / streamFrameIntervalMs)))),
    "-i", inputTarget,
    "-an",
    ...encoderArgs(),
    "-f", "hls",
    "-hls_time", "1",
    "-hls_list_size", "10",
    "-hls_delete_threshold", "10",
    "-hls_flags", "delete_segments+omit_endlist",
    "-hls_base_url", "/hls/",
    "-hls_segment_filename", segmentPath,
    playlistPath
  ];

  let ffmpegError = "";
  const processRef = spawn(ffmpegPath, args, {
    cwd: path.dirname(ffmpegPath),
    detached: false,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  hlsProcess = processRef;
  setWindowsProcessPriority({ pid: processRef.pid || 0, priority: capturePriorityClass });

  hostCaptureState = {
    connected: true,
    lastSeenMs: Date.now(),
    status: "streaming",
    mode: "video",
    backend: "ffmpeg-hls-h264",
    encoder: videoEncoder,
    target: windowTitle || "desktop"
  };

  processRef.stderr.on("data", chunk => {
    ffmpegError = (ffmpegError + chunk.toString("utf8")).slice(-4000);
  });

  processRef.on("exit", (code, signal) => {
    if (!hlsProcess || hlsProcess.pid !== processRef.pid) return;
    hlsProcess = null;
    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: code === 0 ? "stopped" : "ffmpeg hls stopped",
      lastExitCode: code,
      lastExitSignal: signal || "",
      lastError: ffmpegError.trim(),
      lastSeenMs: Date.now()
    };
  });

  processRef.on("error", error => {
    if (hlsProcess && hlsProcess.pid !== processRef.pid) return;
    hlsProcess = null;
    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: error.message || "ffmpeg hls failed",
      lastSeenMs: Date.now()
    };
  });
}

function waitForFile(filePath, timeoutMs = 2500) {
  const startedAt = Date.now();
  return new Promise(resolve => {
    const check = () => {
      if (fs.existsSync(filePath)) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function startFfmpegStream(res) {
  if (!ffmpegStreamingEnabled) {
    send(res, 409, "FFmpeg streaming is disabled while the graphics capture backend is active.");
    return;
  }

  if (!fs.existsSync(ffmpegPath)) {
    send(res, 503, `FFmpeg was not found at ${ffmpegPath}`);
    return;
  }

  const windowTitle = getRmgWindowTitle();
  const inputTarget = windowTitle ? `title=${windowTitle}` : "desktop";
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-f", "gdigrab",
    "-draw_mouse", "0",
    "-framerate", String(Math.max(15, Math.min(60, Math.round(1000 / streamFrameIntervalMs)))),
    "-i", inputTarget,
    "-an",
    ...encoderArgs(),
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-frag_duration", "250000",
    "-f", "mp4",
    "pipe:1"
  ];

  let headersSent = false;
  const ffmpeg = spawn(ffmpegPath, args, {
    cwd: path.dirname(ffmpegPath),
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  setWindowsProcessPriority({ pid: ffmpeg.pid || 0, priority: capturePriorityClass });

  const startedAt = Date.now();
  hostCaptureState = {
    connected: true,
    lastSeenMs: startedAt,
    status: "streaming",
    mode: "video",
    backend: "ffmpeg-h264",
    encoder: videoEncoder,
    target: windowTitle || "desktop"
  };

  function ensureHeaders() {
    if (headersSent || res.headersSent) return;
    headersSent = true;
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store, max-age=0, no-transform",
      "Pragma": "no-cache",
      "Connection": "keep-alive",
      "X-FUIT-Video-Backend": "ffmpeg-h264",
      "X-FUIT-Video-Encoder": videoEncoder,
      "X-FUIT-Video-Target": windowTitle || "desktop"
    });
  }

  ffmpeg.stdout.on("data", chunk => {
    ensureHeaders();
    hostCaptureState.lastSeenMs = Date.now();
    if (!res.write(chunk)) {
      ffmpeg.stdout.pause();
    }
  });

  res.on("drain", () => ffmpeg.stdout.resume());

  let ffmpegError = "";
  ffmpeg.stderr.on("data", chunk => {
    ffmpegError = (ffmpegError + chunk.toString("utf8")).slice(-4000);
  });

  ffmpeg.on("exit", (code, signal) => {
    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: code === 0 ? "stopped" : "ffmpeg stopped",
      lastExitCode: code,
      lastExitSignal: signal || "",
      lastError: ffmpegError.trim(),
      lastSeenMs: Date.now()
    };
    if (!headersSent && !res.headersSent) {
      sendJson(res, 500, {
        ok: false,
        error: "FFmpeg stream failed to start.",
        detail: ffmpegError.trim()
      });
      return;
    }
    try { res.end(); } catch {}
  });

  ffmpeg.on("error", error => {
    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: error.message || "ffmpeg failed",
      lastSeenMs: Date.now()
    };
    if (!headersSent && !res.headersSent) {
      sendJson(res, 500, { ok: false, error: error.message || "FFmpeg failed." });
    }
  });

  res.on("close", () => {
    try { ffmpeg.kill("SIGTERM"); } catch {}
  });
}

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

function writeMjpegFrame(res, frame) {
  try {
    res.write(`--${MJPEG_BOUNDARY}\r\n`);
    res.write(`Content-Type: ${frame.type}\r\n`);
    res.write(`Content-Length: ${frame.buffer.length}\r\n`);
    res.write(`X-FUIT-Frame-Ms: ${latestFrameMs}\r\n`);
    res.write(`X-FUIT-Frame-Seq: ${latestFrameSequence}\r\n\r\n`);
    res.write(frame.buffer);
    res.write("\r\n");
    return true;
  } catch {
    return false;
  }
}

function broadcastMjpegFrame() {
  if (!latestFrame) return;
  for (const client of Array.from(mjpegClients)) {
    if (!writeMjpegFrame(client, latestFrame)) {
      mjpegClients.delete(client);
      try { client.end(); } catch {}
    }
  }
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
    hostCaptureState = { ...hostCaptureState, connected: false, status: "waiting" };
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
  const obsWebRtc = obsWebRtcPayload(req);
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
    latestFrameSequence,
    stream: {
      backend: captureBackend,
      ffmpegStreamingEnabled,
      obsWebRtc,
      videoEncoder,
      maxWidth: streamMaxWidth,
      jpegQuality: streamJpegQuality,
      frameIntervalMs: streamFrameIntervalMs
    },
    priorities: {
      helper: helperPriorityClass,
      capture: capturePriorityClass,
      emulator: emulatorPriorityClass
    },
    hostCaptureState,
    launchState,
    viewerUrl: `${origin}/room?viewer=1`,
    embedViewerUrl: `${origin}/room?embed=1`,
    controllerUrl: `${origin}/controller`,
    hostUrl: `${origin}/room?host=1`,
    inputStateUrl: `${origin}/input-state`,
    controllers: controllersList,
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    host: os.hostname()
  };
}

function obsWebRtcPayload(req) {
  const hostHeader = String(req?.headers?.host || `127.0.0.1:${PORT}`);
  const hostName = hostHeader.split(":")[0] || "127.0.0.1";
  const scheme = String(req?.headers?.["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  const baseUrl = `${scheme}://${hostName}:${obsWebRtcPort}/${obsWebRtcPath}`;
  return {
    enabled: obsWebRtcEnabled,
    fallbackEnabled: obsFallbackEnabled,
    path: obsWebRtcPath,
    port: obsWebRtcPort,
    rtmpServer: "rtmp://127.0.0.1:1935",
    rtmpStreamKey: obsWebRtcPath,
    rtmpUrl: `rtmp://127.0.0.1:1935/${obsWebRtcPath}`,
    whipUrl: obsWhipUrlOverride || `http://127.0.0.1:${obsWebRtcPort}/${obsWebRtcPath}/whip`,
    whepUrl: obsWhepUrlOverride || `${baseUrl}/whep`
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
    main.embed { min-height: 100vh; grid-template-rows: minmax(0, 1fr); gap: 0; padding: 0; background: #000; }
    main.embed .top, main.embed .controls-panel, main.viewer .controls-panel { display: none; }
    .panel { border: 1px solid rgba(147,197,253,.26); background: linear-gradient(180deg, rgba(30,64,175,.72), rgba(15,23,42,.96)); border-radius: 8px; padding: 14px; box-shadow: inset 0 0 24px rgba(0,0,0,.38); }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 18px; font-weight: 1000; color: #bfdbfe; }
    .sub { color: #93c5fd; font-size: 12px; font-weight: 850; line-height: 1.4; }
    .stage { min-height: 260px; padding: 0; overflow: hidden; display: grid; place-items: center; background: #000; position: relative; }
    main.embed .stage { min-height: 100vh; border: 0; border-radius: 0; }
    video, img.stream { width: 100%; height: 100%; min-height: 0; object-fit: contain; background: #000; }
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
  const roomUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const isEmbed = roomUrl.searchParams.get("embed") === "1";
  const isHost = roomUrl.searchParams.get("host") === "1";
  const mainClass = [isEmbed ? "embed" : "", isHost ? "host" : "viewer"].filter(Boolean).join(" ");
  return pageShell("FUITS Cloud Gaming", `
    <main class="${mainClass}">
      <section class="panel top">
        <div>
          <div class="title">${escapeHtml(status.sessionName)}</div>
          <div class="sub">${escapeHtml(status.gameName)}${status.gamePath ? " - " + escapeHtml(status.gamePath) : ""}</div>
        </div>
        <button class="secondary" onclick="location.reload()">Refresh</button>
      </section>
      <section class="panel stage">
        <video id="hostVideo" autoplay muted playsinline></video>
        <img id="frame" class="stream" alt="" style="display: none;" />
        <div id="empty" class="empty">
          <div class="title" style="margin-bottom: 8px;">Waiting for PC emulator stream</div>
          <div class="sub">${isHost ? "Launch or focus the emulator on this PC, then use capture only as a manual fallback." : "Launch an N64 game from the FUIT site. The host helper starts streaming automatically once RMG opens."}</div>
        </div>
      </section>
      <section class="panel controls-panel">
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
      const isHostPage = ${JSON.stringify(isHost)};
      const isEmbedPage = ${JSON.stringify(isEmbed)};
      const streamBackend = ${JSON.stringify(captureBackend)};
      const obsWebRtc = ${JSON.stringify(status.stream.obsWebRtc)};
      let captureStream = null;
      let uploadTimer = null;
      let statusTimer = null;
      let uploadAnimationFrame = 0;
      let uploadInFlight = false;
      let lastUploadStartedAt = 0;
      let frameRefreshTimer = 0;
      let frameLoadInFlight = false;
      let viewerFallbackStarted = false;
      let mjpegFallbackTimer = 0;
      let games = [];

      function showViewerFrame() {
        if (captureStream) return;
        img.style.display = "block";
        video.style.display = "none";
        empty.style.display = "none";
      }

      function showViewerVideo() {
        if (captureStream) return;
        video.style.display = "block";
        img.style.display = "none";
        empty.style.display = "none";
      }

      function showEmpty() {
        if (captureStream) return;
        img.style.display = "none";
        video.style.display = "none";
        empty.style.display = "block";
      }

      function scheduleFrameRefresh(delay = ${JSON.stringify(streamFrameIntervalMs)}) {
        if (frameRefreshTimer) return;
        frameRefreshTimer = window.setTimeout(() => {
          frameRefreshTimer = 0;
          refreshFrame();
        }, delay);
      }

      function refreshFrame() {
        if (captureStream) return;
        if (!isHostPage && !viewerFallbackStarted) return;
        if (frameLoadInFlight) {
          scheduleFrameRefresh();
          return;
        }

        frameLoadInFlight = true;
        img.onload = () => {
          frameLoadInFlight = false;
          showViewerFrame();
          scheduleFrameRefresh();
        };
        img.onerror = () => {
          frameLoadInFlight = false;
          showEmpty();
          scheduleFrameRefresh(240);
        };
        img.src = "/frame.jpg?t=" + Date.now();
      }

      function startViewerFallback() {
        if (viewerFallbackStarted) return;
        viewerFallbackStarted = true;
        if (mjpegFallbackTimer) window.clearTimeout(mjpegFallbackTimer);
        mjpegFallbackTimer = 0;
        img.removeAttribute("src");
        showEmpty();
        refreshFrame();
      }

      function startMjpegViewer() {
        let mjpegLoaded = false;
        showEmpty();
        img.onload = () => {
          mjpegLoaded = true;
          if (mjpegFallbackTimer) window.clearTimeout(mjpegFallbackTimer);
          mjpegFallbackTimer = 0;
          showViewerFrame();
        };
        img.onerror = startViewerFallback;
        mjpegFallbackTimer = window.setTimeout(() => {
          if (!mjpegLoaded) startViewerFallback();
        }, 1600);
        img.src = "/stream.mjpg?t=" + Date.now();
      }

      function startVideoViewer() {
        showEmpty();
        video.srcObject = null;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.onloadeddata = showViewerVideo;
        video.onplaying = showViewerVideo;
        video.onerror = () => {
          video.removeAttribute("src");
          video.load();
          startMjpegViewer();
        };
        const hlsUrl = "/stream.m3u8?t=" + Date.now();
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.play?.().catch(() => {});
          return;
        }

        const startWithHlsJs = () => {
          if (!window.Hls || !window.Hls.isSupported()) {
            startMjpegViewer();
            return;
          }
          const hls = new window.Hls({
            liveSyncDurationCount: 2,
            maxBufferLength: 6,
            lowLatencyMode: true
          });
          hls.on(window.Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal) return;
            hls.destroy();
            startMjpegViewer();
          });
          hls.attachMedia(video);
          hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
            hls.loadSource(hlsUrl);
            video.play?.().catch(() => {});
          });
        };

        if (window.Hls) {
          startWithHlsJs();
          return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.async = true;
        script.onload = startWithHlsJs;
        script.onerror = startMjpegViewer;
        document.head.appendChild(script);
      }

      function waitForIceGatheringComplete(peerConnection) {
        if (peerConnection.iceGatheringState === "complete") return Promise.resolve();
        return new Promise(resolve => {
          const timeout = window.setTimeout(resolve, 1800);
          peerConnection.addEventListener("icegatheringstatechange", () => {
            if (peerConnection.iceGatheringState === "complete") {
              window.clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      async function startObsWebRtcViewer() {
        if (!obsWebRtc?.enabled || !obsWebRtc?.whepUrl) {
          startMjpegViewer();
          return;
        }

        showEmpty();
        const peerConnection = new RTCPeerConnection();
        const remoteStream = new MediaStream();
        let settled = false;
        const fallbackTimer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          try { peerConnection.close(); } catch {}
          if (obsWebRtc?.fallbackEnabled) {
            startMjpegViewer();
          } else {
            showEmpty();
            statusLine.textContent = "Waiting for OBS to start streaming to MediaMTX.";
          }
        }, 4500);

        peerConnection.addEventListener("track", event => {
          event.streams?.[0]?.getTracks()?.forEach(track => remoteStream.addTrack(track));
          event.track && remoteStream.addTrack(event.track);
          video.srcObject = remoteStream;
          video.muted = true;
          video.autoplay = true;
          video.playsInline = true;
          video.play?.().catch(() => {});
          settled = true;
          window.clearTimeout(fallbackTimer);
          showViewerVideo();
        });

        try {
          peerConnection.addTransceiver("video", { direction: "recvonly" });
          peerConnection.addTransceiver("audio", { direction: "recvonly" });
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          await waitForIceGatheringComplete(peerConnection);

          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 2600);
          const response = await fetch(obsWebRtc.whepUrl, {
            method: "POST",
            mode: "cors",
            cache: "no-store",
            headers: {
              "Content-Type": "application/sdp",
              "Accept": "application/sdp"
            },
            body: peerConnection.localDescription.sdp,
            signal: controller.signal
          });
          window.clearTimeout(timeout);
          if (!response.ok) throw new Error("OBS WebRTC stream is not ready.");
          const answer = await response.text();
          await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
        } catch {
          if (!settled) {
            settled = true;
            window.clearTimeout(fallbackTimer);
            try { peerConnection.close(); } catch {}
            if (obsWebRtc?.fallbackEnabled) {
              startMjpegViewer();
            } else {
              showEmpty();
              statusLine.textContent = "Waiting for OBS to start streaming to MediaMTX.";
            }
          }
        }
      }

      async function postHostStatus() {
        if (!isHostPage) return;
        try {
          await fetch("/api/host", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameName: ${JSON.stringify(gameName)} })
          });
        } catch {}
      }

      async function uploadFrame() {
        if (!isHostPage) return;
        if (!captureStream || !video.videoWidth || !video.videoHeight) return;
        const now = performance.now();
        if (uploadInFlight || now - lastUploadStartedAt < ${JSON.stringify(streamFrameIntervalMs)}) return;
        uploadInFlight = true;
        lastUploadStartedAt = now;

        const maxWidth = ${JSON.stringify(streamMaxWidth)};
        const scale = Math.min(1, maxWidth / video.videoWidth);
        captureCanvas.width = Math.max(2, Math.round(video.videoWidth * scale));
        captureCanvas.height = Math.max(2, Math.round(video.videoHeight * scale));
        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        try {
          const frameBlob = await new Promise(resolve => captureCanvas.toBlob(resolve, "image/jpeg", ${JSON.stringify(streamJpegQuality)}));
          if (!frameBlob) return;
          await fetch("/api/frame", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": frameBlob.type || "image/jpeg" },
            body: frameBlob
          });
        } catch {} finally {
          uploadInFlight = false;
        }
      }

      function uploadLoop() {
        if (!isHostPage) return;
        if (!captureStream) return;
        uploadFrame();
        uploadAnimationFrame = window.requestAnimationFrame(uploadLoop);
      }

      function setCaptured(stream) {
        captureStream = stream;
        video.srcObject = stream;
        video.style.display = "block";
        img.style.display = "none";
        empty.style.display = "none";
        statusLine.textContent = "Capturing and sharing the PC emulator window. Keep the emulator focused for controller input.";
        stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
        uploadLoop();
        statusTimer = window.setInterval(postHostStatus, 2000);
        postHostStatus();
      }

      function stopCapture() {
        if (captureStream) captureStream.getTracks().forEach(track => track.stop());
        captureStream = null;
        video.srcObject = null;
        if (uploadTimer) window.clearInterval(uploadTimer);
        if (uploadAnimationFrame) window.cancelAnimationFrame(uploadAnimationFrame);
        if (statusTimer) window.clearInterval(statusTimer);
        uploadTimer = null;
        uploadAnimationFrame = 0;
        uploadInFlight = false;
        statusTimer = null;
        statusLine.textContent = "Capture stopped.";
        refreshFrame();
      }

      async function loadGames() {
        if (!isHostPage) return;
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

      launchBtn?.addEventListener("click", async () => {
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

      document.getElementById("captureBtn")?.addEventListener("click", async () => {
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

      document.getElementById("controllerBtn")?.addEventListener("click", () => {
        window.open("/controller", "_blank", "noopener,noreferrer");
      });

      document.getElementById("fullscreenBtn")?.addEventListener("click", () => {
        const target = captureStream ? video : (img.style.display === "none" ? document.documentElement : img);
        const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
        requestFullscreen?.call(target);
      });

      document.getElementById("stopBtn")?.addEventListener("click", stopCapture);
      if (isHostPage) {
        refreshFrame();
      } else if (streamBackend === "obs-webrtc" || streamBackend === "webrtc" || streamBackend === "obs") {
        startObsWebRtcViewer();
      } else if (streamBackend === "ffmpeg") {
        startVideoViewer();
      } else {
        startMjpegViewer();
      }
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

function readBodyBuffer(req, maxBytes = 1024 * 1024 * 6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("Frame payload is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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

function stopAutoCapture() {
  if (!autoCaptureProcess) return;
  try {
    autoCaptureProcess.kill();
  } catch {}
  autoCaptureProcess = null;
}

function setAutoCaptureFailed(status) {
  autoCaptureProcess = null;
  hostCaptureState = {
    ...hostCaptureState,
    connected: false,
    status,
    mode: "auto",
    lastSeenMs: 0
  };
}

function trackAutoCaptureProcess(processRef, capturePid, state) {
  autoCaptureProcess = processRef;
  const startedAt = Date.now();
  const { launched, ...publicState } = state;
  hostCaptureState = {
    connected: false,
    lastSeenMs: 0,
    status: "starting",
    mode: "auto",
    processId: capturePid,
    lastStartedMs: startedAt,
    ...publicState
  };

  processRef.on("exit", (code, signal) => {
    if (!autoCaptureProcess || autoCaptureProcess.pid !== capturePid) return;
    const wasConnected = hostCaptureState.connected;
    const backend = hostCaptureState.backend || state.backend || "";
    autoCaptureProcess = null;

    if (backend === "graphics-capture" && !wasConnected && Date.now() - startedAt < 5000 && launched) {
      startPowerShellAutoCapture(launched, "graphics capture failed; using powershell fallback");
      return;
    }

    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: "stopped",
      backend,
      lastExitCode: code,
      lastExitSignal: signal || "",
      lastSeenMs: Date.now()
    };
  });

  processRef.on("error", error => {
    if (!autoCaptureProcess || autoCaptureProcess.pid !== capturePid) return;
    const backend = hostCaptureState.backend || state.backend || "";
    autoCaptureProcess = null;

    if (backend === "graphics-capture" && launched) {
      startPowerShellAutoCapture(launched, error.message || "graphics capture failed; using powershell fallback");
      return;
    }

    hostCaptureState = {
      ...hostCaptureState,
      connected: false,
      status: error.message || "auto capture failed to start",
      backend,
      lastSeenMs: 0
    };
  });
}

function startPowerShellAutoCapture(launched, status = "starting") {
  if (!fs.existsSync(autoCaptureScript)) {
    setAutoCaptureFailed("auto capture script missing");
    return;
  }

  const targetProcessName = path.basename(launched.exe || rmgPath, path.extname(launched.exe || rmgPath)) || "RMG";
  const args = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", autoCaptureScript,
    "-Port", String(PORT),
    "-ProcessId", String(launched.pid || 0),
    "-ProcessName", targetProcessName,
    "-MaxWidth", String(streamMaxWidth),
    "-IntervalMs", String(streamFrameIntervalMs),
    "-JpegQuality", String(Math.round(streamJpegQuality * 100))
  ];

  try {
    const processRef = spawn("powershell.exe", args, {
      cwd: __dirname,
      detached: false,
      stdio: "ignore",
      windowsHide: true
    });
    setWindowsProcessPriority({ pid: processRef.pid || 0, priority: capturePriorityClass });
    trackAutoCaptureProcess(processRef, processRef.pid || 0, {
      status,
      backend: "powershell",
      targetProcessId: launched.pid || 0,
      targetProcessName,
      launched
    });
  } catch (error) {
    setAutoCaptureFailed(error.message || "auto capture failed to start");
  }
}

function startGraphicsAutoCapture(launched) {
  if (!fs.existsSync(graphicsCaptureScript)) {
    startPowerShellAutoCapture(launched, "graphics capture script missing; using powershell fallback");
    return;
  }

  const targetProcessName = path.basename(launched.exe || rmgPath, path.extname(launched.exe || rmgPath)) || "RMG";
  const args = [
    graphicsCaptureScript,
    "--port", String(PORT),
    "--process-id", String(launched.pid || 0),
    "--process-name", targetProcessName,
    "--max-width", String(streamMaxWidth),
    "--interval-ms", String(streamFrameIntervalMs),
    "--jpeg-quality", String(Math.round(streamJpegQuality * 100))
  ];
  const env = {
    ...process.env,
    PYTHONPATH: [graphicsCapturePydeps, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
  };

  try {
    const processRef = spawn(graphicsCapturePython, args, {
      cwd: __dirname,
      detached: false,
      stdio: "ignore",
      windowsHide: true,
      env
    });
    setWindowsProcessPriority({ pid: processRef.pid || 0, priority: capturePriorityClass });
    trackAutoCaptureProcess(processRef, processRef.pid || 0, {
      backend: "graphics-capture",
      targetProcessId: launched.pid || 0,
      targetProcessName,
      launched
    });
  } catch (error) {
    startPowerShellAutoCapture(launched, error.message || "graphics capture failed; using powershell fallback");
  }
}

function startFfmpegAutoCapture(launched) {
  const targetProcessName = path.basename(launched.exe || rmgPath, path.extname(launched.exe || rmgPath)) || "RMG";
  hostCaptureState = {
    connected: false,
    lastSeenMs: Date.now(),
    status: "ready",
    mode: "video",
    backend: "ffmpeg-h264",
    encoder: videoEncoder,
    targetProcessId: launched.pid || 0,
    targetProcessName,
    launched
  };
}

function startAutoCapture(launched) {
  stopHlsStream();
  stopAutoCapture();

  if (captureBackend === "ffmpeg" || captureBackend === "video") {
    startFfmpegAutoCapture(launched);
    return;
  }

  if (captureBackend === "powershell") {
    startPowerShellAutoCapture(launched);
    return;
  }

  if (obsWebRtcEnabled) {
    if (obsFallbackEnabled) {
      startGraphicsAutoCapture(launched);
      return;
    }
    hostCaptureState = {
      connected: false,
      lastSeenMs: Date.now(),
      status: "waiting for OBS WebRTC publish",
      mode: "obs-webrtc",
      backend: "obs-webrtc",
      targetProcessId: launched.pid || 0,
      targetProcessName: path.basename(launched.exe || rmgPath, path.extname(launched.exe || rmgPath)) || "RMG",
      launched
    };
    return;
  }

  startGraphicsAutoCapture(launched);
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

  const targetProcessName = path.basename(launchExe, path.extname(launchExe));
  setWindowsProcessPriority({ pid: child.pid || 0, processName: targetProcessName, priority: emulatorPriorityClass });

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
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-FUIT-Frame-Ms": String(latestFrameMs),
      "X-FUIT-Frame-Seq": String(latestFrameSequence),
      "Content-Length": String(latestFrame.buffer.length)
    });
    res.end(latestFrame.buffer);
    return;
  }

  if (req.method === "GET" && url.pathname === "/stream.m3u8") {
    if (!ffmpegStreamingEnabled) {
      sendJson(res, 409, {
        ok: false,
        error: "FFmpeg/HLS streaming is disabled while the graphics capture backend is active.",
        backend: captureBackend
      });
      return;
    }

    const playlistPath = path.join(hlsDir, "stream.m3u8");
    touchHlsStream();
    startHlsStream();
    if (!await waitForFile(playlistPath, 30000)) {
      sendJson(res, 503, {
        ok: false,
        error: "H.264 stream is still starting.",
        detail: hostCaptureState.lastError || ""
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store, max-age=0, no-transform",
      "Pragma": "no-cache"
    });
    res.end(fs.readFileSync(playlistPath));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/hls/")) {
    if (!ffmpegStreamingEnabled) {
      send(res, 404, "Not found");
      return;
    }

    touchHlsStream();
    const fileName = path.basename(url.pathname);
    if (!/^segment-\d+\.ts$/.test(fileName)) {
      send(res, 404, "Not found");
      return;
    }
    const segmentPath = path.join(hlsDir, fileName);
    if (!fs.existsSync(segmentPath)) {
      send(res, 404, "Segment not found.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "video/mp2t",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store, max-age=0, no-transform",
      "Pragma": "no-cache",
      "Content-Length": String(fs.statSync(segmentPath).size)
    });
    fs.createReadStream(segmentPath).pipe(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/stream.mp4") {
    startFfmpegStream(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/stream.mjpg") {
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store, max-age=0, no-transform",
      "Pragma": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    mjpegClients.add(res);
    if (latestFrame) writeMjpegFrame(res, latestFrame);
    req.on("close", () => {
      mjpegClients.delete(res);
      try { res.end(); } catch {}
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/launch") {
    try {
      const launched = launchConfiguredGame({
        system: String(url.searchParams.get("system") || "").toUpperCase(),
        gameId: url.searchParams.get("gameId") || ""
      });
      startAutoCapture(launched);
      launchState = {
        requested: true,
        ok: true,
        message: `Launch requested for ${launched.label}. Stream capture is starting automatically.`,
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
      startAutoCapture(launched);
      launchState = {
        requested: true,
        ok: true,
        message: `Launch requested for ${launched.label}. Stream capture is starting automatically.`,
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
        ...hostCaptureState,
        connected: true,
        lastSeenMs: Date.now(),
        status: "streaming"
      };
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad host payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/frame") {
    try {
      const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        const buffer = await readBodyBuffer(req);
        if (!buffer.length) throw new Error("Empty frame payload.");
        latestFrame = { type: contentType, buffer };
      } else {
        const body = JSON.parse(await readBody(req) || "{}");
        const match = String(body.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!match) throw new Error("Expected an image frame.");
        latestFrame = {
          type: match[1],
          buffer: Buffer.from(match[2], "base64")
        };
      }
      latestFrameMs = Date.now();
      latestFrameSequence += 1;
      broadcastMjpegFrame();
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
  setWindowsProcessPriority({ pid: process.pid, priority: helperPriorityClass });
  setWindowsProcessPriority({
    processName: path.basename(rmgPath, path.extname(rmgPath)),
    priority: emulatorPriorityClass
  });
  console.log(`FUIT Cloud Gaming helper running at http://127.0.0.1:${PORT}`);
  console.log(`Session: ${sessionName}`);
  console.log(`Game: ${gameName}`);
  console.log(`Launch path: ${gamePath || "(none selected)"}`);
  console.log(`Viewer: http://127.0.0.1:${PORT}/room`);
  console.log(`Controller: http://127.0.0.1:${PORT}/controller`);
  startAutoCapture({ label: "RMG", exe: rmgPath, rom: "", system: "N64", pid: 0 });
});

process.on("exit", () => {
  stopHlsStream();
  stopAutoCapture();
});
process.on("SIGINT", () => {
  stopHlsStream();
  stopAutoCapture();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopHlsStream();
  stopAutoCapture();
  process.exit(0);
});
