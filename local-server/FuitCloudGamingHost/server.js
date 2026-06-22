const http = require("http");
const os = require("os");

const PORT = Number(process.env.FUIT_CLOUD_GAMING_PORT || 8175);
const startedAtMs = Date.now();
const sessionName = process.env.FUIT_CLOUD_SESSION_NAME || "FUIT Cloud Gaming";
const gameName = process.env.FUIT_CLOUD_GAME_NAME || "PC emulator game";
const gamePath = process.env.FUIT_CLOUD_GAME_PATH || "";

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function publicOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return `${proto}://${host}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusPayload(req) {
  const origin = publicOrigin(req);
  return {
    ok: true,
    active: true,
    mode: "cloud-gaming",
    sessionName,
    gameName,
    gamePath,
    viewerUrl: `${origin}/room`,
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    host: os.hostname()
  };
}

function roomPage(req) {
  const status = statusPayload(req);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(status.sessionName)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; background: #020617; color: #dbeafe; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    body { display: grid; place-items: stretch; }
    main { width: 100%; min-height: 100%; display: grid; grid-template-rows: auto 1fr auto; gap: 12px; padding: 14px; }
    .panel { border: 1px solid rgba(147,197,253,.26); background: linear-gradient(180deg, rgba(30,64,175,.72), rgba(15,23,42,.96)); border-radius: 14px; padding: 14px; box-shadow: inset 0 0 24px rgba(0,0,0,.38); }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 18px; font-weight: 1000; color: #bfdbfe; }
    .sub { color: #93c5fd; font-size: 12px; font-weight: 850; line-height: 1.4; }
    .stage { min-height: 260px; padding: 0; overflow: hidden; display: grid; place-items: center; background: #000; }
    video { width: 100%; height: 100%; min-height: 300px; object-fit: contain; background: #000; }
    button { border: 0; border-radius: 10px; padding: 10px 12px; background: #93c5fd; color: #0f172a; font-weight: 1000; cursor: pointer; }
    button.secondary { background: rgba(15,23,42,.86); color: #dbeafe; border: 1px solid rgba(147,197,253,.34); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .muted { color: #94a3b8; font-size: 11px; font-weight: 800; line-height: 1.4; }
  </style>
</head>
<body>
  <main>
    <section class="panel top">
      <div>
        <div class="title">${escapeHtml(status.sessionName)}</div>
        <div class="sub">${escapeHtml(status.gameName)}${status.gamePath ? " - " + escapeHtml(status.gamePath) : ""}</div>
      </div>
      <button class="secondary" onclick="location.reload()">Refresh</button>
    </section>
    <section class="panel stage">
      <video id="gameView" autoplay muted playsinline></video>
      <div id="empty" style="padding: 20px; text-align: center;">
        <div class="title" style="margin-bottom: 8px;">PC game window not captured yet</div>
        <div class="sub">Click Capture PC Game Window, then choose the emulator/game window that is running on this computer.</div>
      </div>
    </section>
    <section class="panel">
      <div class="actions">
        <button id="captureBtn">Capture PC Game Window</button>
        <button class="secondary" id="fullscreenBtn">Fullscreen View</button>
        <button class="secondary" id="stopBtn">Stop Capture</button>
      </div>
      <p id="status" class="muted">This uses your browser's screen/window capture. It is local to this PC for now; multiplayer streaming comes in the next layer.</p>
    </section>
  </main>
  <script>
    const video = document.getElementById("gameView");
    const empty = document.getElementById("empty");
    const statusLine = document.getElementById("status");
    let captureStream = null;

    function setCaptured(stream) {
      captureStream = stream;
      video.srcObject = stream;
      video.style.display = "block";
      empty.style.display = "none";
      statusLine.textContent = "Capturing PC game window. Keep this helper open while you play.";
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
    }

    function stopCapture() {
      if (captureStream) {
        captureStream.getTracks().forEach(track => track.stop());
      }
      captureStream = null;
      video.srcObject = null;
      video.style.display = "none";
      empty.style.display = "block";
      statusLine.textContent = "Capture stopped.";
    }

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

    document.getElementById("fullscreenBtn").addEventListener("click", () => {
      const target = video.srcObject ? video : document.documentElement;
      const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
      requestFullscreen?.call(target);
    });

    document.getElementById("stopBtn").addEventListener("click", stopCapture);
    stopCapture();
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/room")) {
    send(res, 200, roomPage(req), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    sendJson(res, 200, statusPayload(req));
    return;
  }

  send(res, 404, "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FUIT Cloud Gaming helper running at http://127.0.0.1:${PORT}`);
  console.log(`Session: ${sessionName}`);
  console.log(`Game: ${gameName}`);
  console.log("Open FUIT, choose FUITS CLOUD GAMING, then capture the PC emulator/game window.");
});
