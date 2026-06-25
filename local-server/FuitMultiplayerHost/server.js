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
const controllerClaims = new Map();
const CONTROLLER_STALE_MS = 10000;
const CONTROLLER_CLAIM_STALE_MS = 5000;
let latestFrame = null;
let latestFrameMs = 0;
let latestFrameEtag = "0";
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
    if (now - controller.lastSeenMs > CONTROLLER_STALE_MS) controllers.delete(id);
  }
  for (const [physicalId, claim] of controllerClaims.entries()) {
    if (now - claim.lastSeenMs > CONTROLLER_CLAIM_STALE_MS || !controllers.has(claim.id)) {
      controllerClaims.delete(physicalId);
    }
  }
  if (hostState.connected && now - hostState.lastSeenMs > 5000) {
    hostState = { ...hostState, connected: false };
  }
}

function normalizeControllerClaimId(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 260);
}

function releaseControllerClaims(id, keepPhysicalId = "") {
  for (const [physicalId, claim] of controllerClaims.entries()) {
    if (claim.id === id && physicalId !== keepPhysicalId) {
      controllerClaims.delete(physicalId);
    }
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
  const stream = streamUrl.trim();
  const isHttpStream = /^https?:\/\//i.test(stream);
  return pageShell("FUIT Multiplayer Room", `
    <main class="display-only-room">
      ${isHttpStream ? `<iframe class="display-frame" src="${escapeHtml(stream)}" allow="autoplay; fullscreen; gamepad"></iframe>` : `
        <img id="frame" alt="FUIT host game stream" />
        <div id="empty" aria-hidden="true"></div>
      `}
      ${isHttpStream ? "" : `<script>
        const img = document.getElementById("frame");
        const empty = document.getElementById("empty");
        let lastFrameMs = 0;
        let refreshing = false;
        async function refreshFrame() {
          if (refreshing) return;
          refreshing = true;
          try {
            const status = await fetch("/status?t=" + Date.now(), { cache: "no-store" }).then(response => response.json());
            if (!status.hasFrame || status.latestFrameMs === lastFrameMs) return;
            lastFrameMs = status.latestFrameMs;
            const next = "/frame.jpg?ts=" + status.latestFrameMs;
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
          } catch {
            img.style.display = "none";
            empty.style.display = "block";
          } finally {
            refreshing = false;
          }
        }
        setInterval(refreshFrame, 750);
        refreshFrame();
      </script>`}
    </main>
  `, `
    <style>
      html, body { background: #000 !important; overflow: hidden; }
      body { display: block !important; }
      .display-only-room {
        width: 100vw;
        height: 100vh;
        margin: 0;
        background: #000;
        display: grid;
        place-items: center;
        overflow: hidden;
      }
      .display-frame,
      #frame,
      #empty {
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
      }
      #frame {
        display: none;
        object-fit: contain;
        image-rendering: auto;
      }
    </style>
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
      const params = new URLSearchParams(location.search);
      const urlControllerId = params.get("id");
      const idKey = "fuitControllerId";
      const deviceIdKey = "fuitControllerDeviceId";
      const controllerId = urlControllerId || sessionStorage.getItem(idKey) || crypto.randomUUID();
      sessionStorage.setItem(idKey, controllerId);
      let controllerDeviceId = "";
      try {
        controllerDeviceId = localStorage.getItem(deviceIdKey) || "";
        if (!controllerDeviceId) {
          controllerDeviceId = crypto.randomUUID();
          localStorage.setItem(deviceIdKey, controllerDeviceId);
        }
      } catch {
        controllerDeviceId = [
          navigator.userAgent || "browser",
          navigator.platform || "platform",
          screen.width + "x" + screen.height
        ].join(":");
      }
      const pressed = new Set();
      const lockedGamepads = new Map();
      const status = document.getElementById("status");
      const keyMap = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right", KeyJ: "a", KeyK: "b", KeyU: "x", KeyI: "y", Enter: "start", ShiftRight: "select", ShiftLeft: "select" };
      const gamepadMap = { 0: "a", 1: "b", 2: "x", 3: "y", 4: "l", 5: "r", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };
      let claimedPhysicalControllerId = "";
      const controllerTickMs = 50;
      let sendingInput = false;
      let sendAgain = false;
      let lastInputStartedAt = 0;
      let controllerTickSource = null;
      let controllerTickWorker = null;
      let controllerTickWorkerUrl = "";
      let controllerTickFallbackTimer = 0;
      const runSoon = typeof queueMicrotask === "function"
        ? queueMicrotask
        : callback => Promise.resolve().then(callback);

      const getPadKey = pad => pad ? controllerDeviceId + ":" + String(pad.index) + ":" + (pad.id || "Gamepad") : "";
      const getPadLabel = pad => String(pad?.id || "Keyboard").trim() || "Keyboard";
      const releaseController = physicalControllerId => {
        const releasePhysicalControllerId = typeof physicalControllerId === "string" ? physicalControllerId : claimedPhysicalControllerId;
        const body = JSON.stringify({ id: controllerId, physicalControllerId: releasePhysicalControllerId });
        try {
          if (navigator.sendBeacon) {
            const sent = navigator.sendBeacon("/api/controller/release", new Blob([body], { type: "application/json" }));
            if (sent) return;
          }
        } catch {}
        fetch("/api/controller/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true
        }).catch(() => {});
      };
      const stopControllerTicker = () => {
        if (controllerTickSource) {
          try { controllerTickSource.close(); } catch {}
          controllerTickSource = null;
        }
        if (controllerTickWorker) {
          try { controllerTickWorker.postMessage({ type: "stop" }); } catch {}
          try { controllerTickWorker.terminate(); } catch {}
          controllerTickWorker = null;
        }
        if (controllerTickWorkerUrl) {
          try { URL.revokeObjectURL(controllerTickWorkerUrl); } catch {}
          controllerTickWorkerUrl = "";
        }
        if (controllerTickFallbackTimer) {
          clearInterval(controllerTickFallbackTimer);
          controllerTickFallbackTimer = 0;
        }
      };

      window.addEventListener("pagehide", () => {
        stopControllerTicker();
        releaseController();
      });
      window.addEventListener("beforeunload", () => {
        stopControllerTicker();
        releaseController();
      });
      document.addEventListener("visibilitychange", () => queueSendInput(true));

      window.addEventListener("keydown", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        pressed.add(mapped);
        queueSendInput(true);
      });

      window.addEventListener("keyup", event => {
        const mapped = keyMap[event.code];
        if (!mapped) return;
        event.preventDefault();
        pressed.delete(mapped);
        queueSendInput(true);
      });

      window.addEventListener("blur", () => {
        if (!pressed.size) return;
        pressed.clear();
        queueSendInput(true);
      });

      function readButtons(pad) {
        const buttons = Array.from(pressed);
        if (pad) {
          pad.buttons.forEach((button, index) => { if (button.pressed && gamepadMap[index]) buttons.push(gamepadMap[index]); });
          const x = pad.axes[0] || 0;
          const y = pad.axes[1] || 0;
          if (x < -0.45) buttons.push("left");
          if (x > 0.45) buttons.push("right");
          if (y < -0.45) buttons.push("up");
          if (y > 0.45) buttons.push("down");
        }
        return buttons;
      }

      async function postControllerInput(pad) {
        const physicalControllerId = getPadKey(pad);
        const controllerLabel = getPadLabel(pad);
        const buttons = readButtons(pad);
        const response = await fetch("/api/controller", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: controllerId,
            label: controllerLabel,
            physicalControllerId,
            buttons,
            axes: Array.from(pad?.axes || [])
          })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          if (result?.locked && physicalControllerId) {
            lockedGamepads.set(physicalControllerId, Date.now() + 5000);
            if (claimedPhysicalControllerId === physicalControllerId) claimedPhysicalControllerId = "";
            return { ok: false, locked: true, label: result.label || controllerLabel, physicalControllerId };
          }
          throw new Error(result?.error || "Controller update failed.");
        }
        claimedPhysicalControllerId = physicalControllerId;
        status.textContent = buttons.length
          ? "Sending from " + controllerLabel + ": " + buttons.join(", ")
          : "Connected: " + controllerLabel;
        return { ok: true, locked: false, label: controllerLabel, physicalControllerId };
      }

      async function sendInput() {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        if (claimedPhysicalControllerId) {
          const claimedPad = pads.find(candidate => getPadKey(candidate) === claimedPhysicalControllerId) || null;
          if (claimedPad) {
            try {
              const result = await postControllerInput(claimedPad);
              if (result.locked) status.textContent = result.label + " is already connected in another controller tab.";
            } catch {
              status.textContent = "Helper connection lost.";
            }
            return;
          }

          const releasedPhysicalControllerId = claimedPhysicalControllerId;
          claimedPhysicalControllerId = "";
          lockedGamepads.delete(releasedPhysicalControllerId);
          releaseController(releasedPhysicalControllerId);
        }

        let lockedLabel = "";
        const now = Date.now();
        for (const pad of pads) {
          const physicalControllerId = getPadKey(pad);
          const lockedUntil = lockedGamepads.get(physicalControllerId) || 0;
          if (lockedUntil > now) {
            lockedLabel = lockedLabel || getPadLabel(pad);
            continue;
          }
          lockedGamepads.delete(physicalControllerId);
          try {
            const result = await postControllerInput(pad);
            if (result.ok) return;
            if (result.locked) {
              lockedLabel = lockedLabel || result.label;
              continue;
            }
          } catch {
            status.textContent = "Helper connection lost.";
            return;
          }
        }

        if (pads.length) {
          status.textContent = (lockedLabel || getPadLabel(pads[0])) + " is already connected in another controller tab.";
          return;
        }

        try {
          await postControllerInput(null);
        } catch {
          status.textContent = "Helper connection lost.";
        }
      }

      function queueSendInput(force = false) {
        const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        if (!force && now - lastInputStartedAt < controllerTickMs - 5) return;
        if (sendingInput) {
          sendAgain = true;
          return;
        }

        sendingInput = true;
        lastInputStartedAt = now;
        Promise.resolve()
          .then(sendInput)
          .catch(() => {})
          .finally(() => {
            sendingInput = false;
            if (sendAgain) {
              sendAgain = false;
              runSoon(() => queueSendInput(true));
            }
          });
      }

      function startControllerTicker() {
        if (window.EventSource) {
          try {
            controllerTickSource = new EventSource("/api/controller/ticks");
            controllerTickSource.onmessage = () => queueSendInput();
            controllerTickSource.onerror = () => {};
          } catch {}
        }

        try {
          const workerCode = [
            "let timer = 0;",
            "function tick() { postMessage(0); }",
            "onmessage = function(event) {",
            "  const data = event.data || {};",
            "  if (data.type === 'start') {",
            "    clearInterval(timer);",
            "    timer = setInterval(tick, Math.max(16, Number(data.interval) || 50));",
            "    tick();",
            "  }",
            "  if (data.type === 'stop') {",
            "    clearInterval(timer);",
            "    close();",
            "  }",
            "};"
          ].join("\\n");
          const workerBlob = new Blob([workerCode], { type: "application/javascript" });
          controllerTickWorkerUrl = URL.createObjectURL(workerBlob);
          controllerTickWorker = new Worker(controllerTickWorkerUrl);
          controllerTickWorker.onmessage = () => queueSendInput();
          controllerTickWorker.postMessage({ type: "start", interval: controllerTickMs });
        } catch {}

        controllerTickFallbackTimer = setInterval(() => queueSendInput(), 250);
        queueSendInput(true);
      }

      startControllerTicker();
    </script>
  `);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.setTimeout(4000, () => fail(new Error("Request body timed out.")));
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024 * 2) fail(new Error("Request body too large."));
    });
    req.on("end", () => finish(body));
    req.on("aborted", () => fail(new Error("Request aborted.")));
    req.on("close", () => {
      if (!req.complete) fail(new Error("Request closed before the body finished."));
    });
    req.on("error", fail);
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

  if (req.method === "GET" && url.pathname === "/api/controller/ticks") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    const sendTick = () => {
      if (res.destroyed) return;
      res.write(`data: ${Date.now()}\n\n`);
    };
    const tickTimer = setInterval(sendTick, 50);
    tickTimer.unref?.();
    sendTick();
    req.on("close", () => clearInterval(tickTimer));
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
      "ETag": latestFrameEtag,
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
      latestFrameEtag = `"${latestFrameMs}-${latestFrame.buffer.length}"`;
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
      const now = Date.now();
      const physicalControllerId = normalizeControllerClaimId(body.physicalControllerId);
      const label = String(body.label || "Browser Controller").slice(0, 120);
      pruneControllers();

      if (physicalControllerId) {
        const existingClaim = controllerClaims.get(physicalControllerId);
        if (
          existingClaim &&
          existingClaim.id !== id &&
          controllers.has(existingClaim.id) &&
          now - existingClaim.lastSeenMs <= CONTROLLER_CLAIM_STALE_MS
        ) {
          const currentController = controllers.get(id);
          const hasDifferentPhysicalClaim = currentController?.physicalControllerId && currentController.physicalControllerId !== physicalControllerId;
          if (!hasDifferentPhysicalClaim) {
            controllers.delete(id);
            releaseControllerClaims(id);
          }
          sendJson(res, 409, {
            ok: false,
            locked: true,
            error: "This physical controller is already connected in another controller tab.",
            label: existingClaim.label || label
          });
          return;
        }

        releaseControllerClaims(id, physicalControllerId);
        controllerClaims.set(physicalControllerId, { id, label, lastSeenMs: now });
      } else {
        releaseControllerClaims(id);
      }

      controllers.set(id, {
        id,
        label,
        physicalControllerId,
        buttons: Array.isArray(body.buttons) ? body.buttons.slice(0, 32) : [],
        axes: Array.isArray(body.axes) ? body.axes.slice(0, 8) : [],
        lastSeenMs: now
      });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad controller payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller/release") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const id = String(body.id || "").slice(0, 80);
      const physicalControllerId = normalizeControllerClaimId(body.physicalControllerId);
      if (id) {
        controllers.delete(id);
        if (physicalControllerId) {
          const claim = controllerClaims.get(physicalControllerId);
          if (claim?.id === id) controllerClaims.delete(physicalControllerId);
        } else {
          releaseControllerClaims(id);
        }
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad controller release payload." });
    }
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/shutdown" || url.pathname === "/api/stop")) {
    sendJson(res, 200, { ok: true, shuttingDown: true });
    setTimeout(() => shutdown(0), 25).unref();
    return;
  }

  send(res, 404, "Not found");
});

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    server.close(() => process.exit(exitCode));
  } catch {
    process.exit(exitCode);
  }
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

server.on("error", error => {
  if (error?.code === "EADDRINUSE") {
    console.error(`FUIT Multiplayer helper could not start because port ${PORT} is already in use.`);
  } else {
    console.error(error);
  }
  shutdown(1);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", error => {
  console.error(error);
  shutdown(1);
});
process.on("unhandledRejection", error => {
  console.error(error);
  shutdown(1);
});

if (!process.stdin.destroyed) {
  process.stdin.on("end", () => shutdown(0));
  process.stdin.on("error", () => shutdown(0));
}

const parentPid = Number(process.env.FUIT_HELPER_PARENT_PID || 0);
if (parentPid > 0 && parentPid !== process.pid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      shutdown(0);
    }
  }, 2000).unref();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FUIT Multiplayer helper running at http://127.0.0.1:${PORT}`);
  console.log(`Room: ${roomName}`);
  console.log(`Game: ${gameName}`);
  console.log(`Stream URL: ${streamUrl || "(none yet)"}`);
  console.log("Keep this window open while the multiplayer room is on.");
});

server.requestTimeout = 5000;
server.headersTimeout = 6000;
server.keepAliveTimeout = 1000;
