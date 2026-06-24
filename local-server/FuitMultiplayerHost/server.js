const http = require("http");
const os = require("os");

const PORT = Number(process.env.FUIT_MULTIPLAYER_PORT || 8174);
const startedAtMs = Date.now();
const roomName = process.env.FUIT_ROOM_NAME || "FUIT Multiplayer Room";
const gameName = process.env.FUIT_GAME_NAME || "Any game you choose";
const gamePath = process.env.FUIT_GAME_PATH || "";
const streamUrl = process.env.FUIT_STREAM_URL || "";
const selectedGame = (() => {
  try {
    const parsed = JSON.parse(process.env.FUIT_SELECTED_GAME || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      label: String(parsed.label || gameName).slice(0, 180),
      system: String(parsed.system || "").slice(0, 20),
      core: String(parsed.core || "").slice(0, 20),
      file: String(parsed.file || "").slice(0, 260),
      relativePath: String(parsed.relativePath || "").slice(0, 520),
      gameUrl: String(parsed.gameUrl || "").slice(0, 520),
      discUrls: Array.isArray(parsed.discUrls) ? parsed.discUrls.map(url => String(url).slice(0, 520)).slice(0, 8) : []
    };
  } catch {
    return null;
  }
})();
const controllers = new Map();
let latestFrame = null;
let latestFrameMs = 0;
let hostState = {
  connected: false,
  gameName: selectedGame?.label || gameName,
  lastSeenMs: 0
};

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

function pruneControllers() {
  const now = Date.now();
  for (const [id, controller] of controllers.entries()) {
    if (now - controller.lastSeenMs > 10000) controllers.delete(id);
  }
  if (hostState.connected && now - hostState.lastSeenMs > 5000) {
    hostState = { ...hostState, connected: false };
  }
}

function statusPayload(req) {
  pruneControllers();
  const origin = publicOrigin(req);
  return {
    ok: true,
    active: true,
    roomName,
    gameName: selectedGame?.label || gameName,
    gamePath,
    selectedGame,
    streamUrl,
    hasFrame: Boolean(latestFrame),
    latestFrameMs,
    hostState,
    viewerUrl: `${origin}/room`,
    controllerUrl: `${origin}/controller`,
    controllers: Array.from(controllers.values()).map(controller => ({
      id: controller.id,
      label: controller.label,
      buttons: controller.buttons,
      axes: controller.axes,
      lastSeenMs: controller.lastSeenMs
    })),
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    host: os.hostname()
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageShell(title, body, extraHead = "") {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${extraHead}
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; background: #020617; color: #dcfce7; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    body { display: grid; place-items: center; }
    .wrap { width: min(100%, 980px); height: 100%; min-height: 280px; display: grid; gap: 14px; padding: 18px; }
    .panel { border: 1px solid rgba(187,247,208,.22); background: linear-gradient(180deg, rgba(6,78,59,.72), rgba(15,23,42,.96)); border-radius: 14px; padding: 16px; box-shadow: inset 0 0 24px rgba(0,0,0,.38); }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 18px; font-weight: 1000; color: #bbf7d0; }
    .sub { color: #86efac; font-size: 13px; font-weight: 800; line-height: 1.4; }
    .stream { min-height: 220px; overflow: hidden; padding: 0; display: grid; place-items: center; background: #000; }
    iframe { width: 100%; height: 100%; min-height: 320px; border: 0; background: #000; }
    button { border: 0; border-radius: 10px; padding: 10px 12px; background: #bbf7d0; color: #052e16; font-weight: 1000; cursor: pointer; }
    .muted { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .kbd { display: inline-block; min-width: 28px; padding: 5px 8px; margin: 3px; border-radius: 7px; border: 1px solid rgba(187,247,208,.28); background: rgba(15,23,42,.82); text-align: center; font-weight: 1000; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function roomPage(req) {
  const status = statusPayload(req);
  const stream = streamUrl.trim();
  const isHttpStream = /^https?:\/\//i.test(stream);
  return pageShell("FUIT Multiplayer Room", `
    <main class="wrap">
      <section class="panel top">
        <div>
          <div class="title">${escapeHtml(status.roomName)}</div>
          <div class="sub">${escapeHtml(status.gameName)} - ${status.controllers.length} controller${status.controllers.length === 1 ? "" : "s"} connected</div>
        </div>
        <button onclick="location.reload()">Refresh</button>
      </section>
      <section class="panel stream">
        ${isHttpStream ? `<iframe src="${escapeHtml(stream)}" allow="autoplay; fullscreen; gamepad"></iframe>` : `
          <div style="max-width: 560px; padding: 24px; text-align: center;">
            <img id="frame" alt="FUIT host game stream" style="display: none; width: 100%; max-height: 70vh; object-fit: contain; image-rendering: auto;" />
            <div id="empty">
              <div class="title" style="margin-bottom: 8px;">Waiting for host browser</div>
              <div class="sub">Start a browser emulator game in the FUIT Multiplayer box. This room will show that same game view when frames arrive.</div>
              ${stream ? `<p class="muted">Saved stream value: ${escapeHtml(stream)}</p>` : ""}
            </div>
          </div>
        `}
      </section>
      ${isHttpStream ? "" : `<script>
        const img = document.getElementById("frame");
        const empty = document.getElementById("empty");
        async function refreshFrame() {
          const next = "/frame.jpg?t=" + Date.now();
          const probe = new Image();
          probe.onload = () => {
            img.src = next;
            img.style.display = "block";
            empty.style.display = "none";
          };
          probe.onerror = () => {
            img.style.display = "none";
            empty.style.display = "block";
          };
          probe.src = next;
        }
        setInterval(refreshFrame, 120);
        refreshFrame();
      </script>`}
    </main>
  `);
}

function controllerPage() {
  return pageShell("FUIT Controller", `
    <main class="wrap">
      <section class="panel">
        <div class="title">Add Controller</div>
        <div class="sub">This page sends keyboard/gamepad input to the FUIT helper. Virtual controller injection comes in the next layer.</div>
      </section>
      <section class="panel">
        <div class="grid">
          <div>
            <div class="sub">Keyboard</div>
            <div><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span></div>
            <div><span class="kbd">J</span><span class="kbd">K</span><span class="kbd">U</span><span class="kbd">I</span><span class="kbd">Enter</span></div>
          </div>
          <div>
            <div class="sub">Status</div>
            <p id="status" class="muted">Waiting for input...</p>
          </div>
        </div>
      </section>
    </main>
    <script>
      const idKey = "fuitControllerId";
      const controllerId = localStorage.getItem(idKey) || crypto.randomUUID();
      localStorage.setItem(idKey, controllerId);
      const pressed = new Set();
      const status = document.getElementById("status");
      const keyMap = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right", KeyJ: "a", KeyK: "b", KeyU: "x", KeyI: "y", Enter: "start", ShiftRight: "select", ShiftLeft: "select" };

      window.addEventListener("keydown", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        pressed.add(mapped);
      });

      window.addEventListener("keyup", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        pressed.delete(mapped);
      });

      async function sendInput() {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        const pad = pads[0];
      const buttons = Array.from(pressed);
      if (pad) {
          const gamepadMap = { 0: "a", 1: "b", 2: "x", 3: "y", 4: "l", 5: "r", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };
          pad.buttons.forEach((button, index) => { if (button.pressed && gamepadMap[index]) buttons.push(gamepadMap[index]); });
          const x = pad.axes[0] || 0;
          const y = pad.axes[1] || 0;
          if (x < -0.45) buttons.push("left");
          if (x > 0.45) buttons.push("right");
          if (y < -0.45) buttons.push("up");
          if (y > 0.45) buttons.push("down");
      }
        try {
          await fetch("/api/controller", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: controllerId, label: pad?.id || "Browser Controller", buttons, axes: pad?.axes || [] })
          });
          status.textContent = buttons.length ? "Sending: " + buttons.join(", ") : "Connected. Press a key or gamepad button.";
        } catch {
          status.textContent = "Helper connection lost.";
        }
      }
      setInterval(sendInput, 100);
      sendInput();
    </script>
  `);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024 * 5) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
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

  if (req.method === "GET" && url.pathname === "/frame.jpg") {
    if (!latestFrame) {
      send(res, 404, "No host frame yet.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": latestFrame.type,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    });
    res.end(latestFrame.buffer);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/host") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      hostState = {
        connected: true,
        gameName: String(body.gameName || gameName).slice(0, 160),
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
      controllers.set(id, {
        id,
        label: String(body.label || "Browser Controller").slice(0, 120),
        buttons: Array.isArray(body.buttons) ? body.buttons.slice(0, 32) : [],
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
  console.log(`FUIT Multiplayer helper running at http://127.0.0.1:${PORT}`);
  console.log(`Room: ${roomName}`);
  console.log(`Game: ${gameName}`);
  console.log(`Stream URL: ${streamUrl || "(none yet)"}`);
  console.log("Keep this window open while the multiplayer room is on.");
});
