const http = require("http");
const os = require("os");
const { spawn } = require("child_process");

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
const nativeControllerClaims = new Map();
const nativeGamepadStates = new Map();
const CONTROLLER_STALE_MS = 3500;
const CONTROLLER_CLAIM_STALE_MS = 2500;
const CONTROLLER_DIRECT_INPUT_GRACE_MS = 650;
const NATIVE_CONTROLLER_CLAIM_STALE_MS = 60 * 60 * 1000;
const NATIVE_GAMEPAD_POLL_MS = 50;
const FRAME_VIEWER_ACTIVE_MS = 6500;
const STANDALONE_EMULATOR_STALE_MS = 3500;
let latestFrame = null;
let latestFrameMs = 0;
let latestFrameEtag = "0";
let frameViewerLastSeenMs = 0;
let nativeGamepadProcess = null;
let nativeGamepadStdout = "";
let hostState = {
  connected: false,
  gameName: selectedGame?.label || gameName,
  lastSeenMs: 0
};
let standaloneEmulatorState = {
  active: false,
  id: "",
  lastSeenMs: 0
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cross-Origin-Resource-Policy": "cross-origin",
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

function normalizeControllerId(value) {
  return String(value || "").slice(0, 80);
}

function normalizeControllerLabel(value) {
  return String(value || "Browser Controller").slice(0, 120);
}

function normalizeControllerSource(value) {
  const source = String(value || "").toLowerCase();
  return ["controller-tab", "front-relay", "native-helper"].includes(source) ? source : "";
}

function normalizeControllerAxis(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}

function normalizeControllerAxes(value) {
  return Array.isArray(value) ? value.slice(0, 8).map(normalizeControllerAxis) : [];
}

function normalizeControllerButtons(value) {
  return Array.isArray(value) ? Array.from(new Set(value.map(button => String(button || "").slice(0, 32)).filter(Boolean))).slice(0, 32) : [];
}

function storeControllerState({ id, label, physicalControllerId = "", buttons = [], axes = [], source = "", now = Date.now() }) {
  if (!id) return null;
  const safeLabel = normalizeControllerLabel(label);
  const safePhysicalControllerId = normalizeControllerClaimId(physicalControllerId);
  const safeSource = normalizeControllerSource(source);

  if (safePhysicalControllerId) {
    releaseControllerClaims(id, safePhysicalControllerId);
    controllerClaims.set(safePhysicalControllerId, { id, label: safeLabel, lastSeenMs: now });
  } else {
    releaseControllerClaims(id);
  }

  const controller = {
    id,
    label: safeLabel,
    physicalControllerId: safePhysicalControllerId,
    buttons: normalizeControllerButtons(buttons),
    axes: normalizeControllerAxes(axes),
    inputSource: safeSource,
    lastSeenMs: now
  };
  controllers.set(id, controller);
  return controller;
}

function normalizeXInputThumb(value, deadzone) {
  const number = Number(value || 0);
  if (Math.abs(number) <= deadzone) return 0;
  const divisor = number < 0 ? 32768 : 32767;
  return Math.max(-1, Math.min(1, number / divisor));
}

function mapXInputStateToController(state) {
  const mask = Number(state?.buttons || 0);
  const buttons = new Set();
  const addButton = (bit, name) => {
    if ((mask & bit) === bit) buttons.add(name);
  };

  addButton(0x1000, "a");
  addButton(0x2000, "b");
  addButton(0x4000, "x");
  addButton(0x8000, "y");
  addButton(0x0100, "l");
  addButton(0x0200, "r");
  addButton(0x0020, "select");
  addButton(0x0010, "start");
  addButton(0x0001, "up");
  addButton(0x0002, "down");
  addButton(0x0004, "left");
  addButton(0x0008, "right");
  if (Number(state?.lt || 0) > 30) buttons.add("z");
  if (Number(state?.rt || 0) > 30) buttons.add("r2");

  return {
    buttons: Array.from(buttons),
    axes: [
      normalizeXInputThumb(state?.lx, 7849),
      -normalizeXInputThumb(state?.ly, 7849),
      normalizeXInputThumb(state?.rx, 8689),
      -normalizeXInputThumb(state?.ry, 8689)
    ]
  };
}

function pruneNativeControllerClaims(now = Date.now()) {
  for (const [physicalId, claim] of nativeControllerClaims.entries()) {
    if (now - claim.lastSeenMs > NATIVE_CONTROLLER_CLAIM_STALE_MS || !controllers.has(claim.id)) {
      nativeControllerClaims.delete(physicalId);
    }
  }
}

function applyNativeControllerClaims() {
  const now = Date.now();
  pruneNativeControllerClaims(now);
  const usedNativeIndexes = new Set();
  for (const claim of nativeControllerClaims.values()) {
    const hasExplicitNativeIndex = Number.isInteger(claim.nativeIndex);
    let state = hasExplicitNativeIndex ? nativeGamepadStates.get(claim.nativeIndex) : null;
    if (state && usedNativeIndexes.has(Number(state.index))) state = null;
    if (!state && !hasExplicitNativeIndex) {
      state = Array.from(nativeGamepadStates.values()).find(candidate => !usedNativeIndexes.has(Number(candidate.index))) || null;
    }
    if (!state) continue;
    const selectedNativeIndex = Number(state.index);
    if (Number.isInteger(selectedNativeIndex)) {
      claim.nativeIndex = selectedNativeIndex;
      usedNativeIndexes.add(selectedNativeIndex);
    }
    const mapped = mapXInputStateToController(state);
    storeControllerState({
      id: claim.id,
      label: claim.label,
      physicalControllerId: claim.physicalControllerId,
      buttons: mapped.buttons,
      axes: mapped.axes,
      source: "native-helper",
      now
    });
  }
}

function handleNativeGamepadLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  try {
    const states = JSON.parse(trimmed);
    nativeGamepadStates.clear();
    (Array.isArray(states) ? states : []).forEach(state => {
      const index = Number(state?.index);
      if (Number.isInteger(index) && index >= 0 && index < 4) nativeGamepadStates.set(index, state);
    });
    applyNativeControllerClaims();
  } catch {}
}

function buildNativeGamepadScript() {
  return `
$ErrorActionPreference = "SilentlyContinue"
$code = @'
using System;
using System.Runtime.InteropServices;
public static class FuitXInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct XINPUT_GAMEPAD {
    public ushort wButtons;
    public byte bLeftTrigger;
    public byte bRightTrigger;
    public short sThumbLX;
    public short sThumbLY;
    public short sThumbRX;
    public short sThumbRY;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct XINPUT_STATE {
    public uint dwPacketNumber;
    public XINPUT_GAMEPAD Gamepad;
  }
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")]
  public static extern uint XInputGetState14(uint userIndex, out XINPUT_STATE state);
  [DllImport("xinput9_1_0.dll", EntryPoint="XInputGetState")]
  public static extern uint XInputGetState910(uint userIndex, out XINPUT_STATE state);
}
'@
try { Add-Type $code } catch {}
while ($true) {
  $states = @()
  for ($i = 0; $i -lt 4; $i += 1) {
    $state = New-Object FuitXInput+XINPUT_STATE
    $result = 1167
    try {
      $result = [FuitXInput]::XInputGetState14([uint32]$i, [ref]$state)
    } catch {
      try { $result = [FuitXInput]::XInputGetState910([uint32]$i, [ref]$state) } catch {}
    }
    if ($result -eq 0) {
      $states += [pscustomobject]@{
        index = $i
        packet = [uint32]$state.dwPacketNumber
        buttons = [uint16]$state.Gamepad.wButtons
        lt = [int]$state.Gamepad.bLeftTrigger
        rt = [int]$state.Gamepad.bRightTrigger
        lx = [int]$state.Gamepad.sThumbLX
        ly = [int]$state.Gamepad.sThumbLY
        rx = [int]$state.Gamepad.sThumbRX
        ry = [int]$state.Gamepad.sThumbRY
      }
    }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @($states)))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${NATIVE_GAMEPAD_POLL_MS}
}
`;
}

function startNativeGamepadPoller() {
  if (process.platform !== "win32") return false;
  if (nativeGamepadProcess && !nativeGamepadProcess.killed) return true;

  try {
    const encodedScript = Buffer.from(buildNativeGamepadScript(), "utf16le").toString("base64");
    nativeGamepadProcess = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    nativeGamepadStdout = "";
    nativeGamepadProcess.stdout.on("data", chunk => {
      nativeGamepadStdout += chunk.toString("utf8");
      const lines = nativeGamepadStdout.split(/\r?\n/);
      nativeGamepadStdout = lines.pop() || "";
      lines.forEach(handleNativeGamepadLine);
    });
    nativeGamepadProcess.on("exit", () => {
      nativeGamepadProcess = null;
      nativeGamepadStdout = "";
      nativeGamepadStates.clear();
    });
    return true;
  } catch {
    nativeGamepadProcess = null;
    nativeGamepadStdout = "";
    return false;
  }
}

function pruneControllers() {
  const now = Date.now();
  for (const [id, controller] of controllers.entries()) {
    if (now - controller.lastSeenMs > CONTROLLER_STALE_MS) controllers.delete(id);
  }
  pruneNativeControllerClaims(now);
  for (const [physicalId, claim] of controllerClaims.entries()) {
    if (now - claim.lastSeenMs > CONTROLLER_CLAIM_STALE_MS || !controllers.has(claim.id)) {
      controllerClaims.delete(physicalId);
    }
  }
  if (hostState.connected && now - hostState.lastSeenMs > 5000) {
    hostState = { ...hostState, connected: false };
  }
  if (standaloneEmulatorState.active && now - standaloneEmulatorState.lastSeenMs > STANDALONE_EMULATOR_STALE_MS) {
    standaloneEmulatorState = { ...standaloneEmulatorState, active: false };
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

function releaseNativeControllerClaims(id, keepPhysicalId = "") {
  for (const [physicalId, claim] of nativeControllerClaims.entries()) {
    if (claim.id === id && physicalId !== keepPhysicalId) {
      nativeControllerClaims.delete(physicalId);
    }
  }
}

function controllerStatusPayload() {
  pruneControllers();
  return {
    ok: true,
    active: true,
    controllers: Array.from(controllers.values()).map(controller => ({
      id: controller.id,
      label: controller.label,
      buttons: controller.buttons,
      axes: controller.axes,
      inputSource: controller.inputSource,
      lastSeenMs: controller.lastSeenMs
    }))
  };
}

function markFrameViewerActive() {
  frameViewerLastSeenMs = Date.now();
}

function frameViewerIsActive(now = Date.now()) {
  return now - frameViewerLastSeenMs <= FRAME_VIEWER_ACTIVE_MS;
}

function frameStatusPayload({ markActive = false } = {}) {
  pruneControllers();
  if (markActive) markFrameViewerActive();
  return {
    ok: true,
    active: true,
    hasFrame: Boolean(latestFrame),
    latestFrameMs,
    hostState
  };
}

function frameDemandPayload() {
  const now = Date.now();
  pruneControllers();
  return {
    ok: true,
    active: true,
    needed: frameViewerIsActive(now),
    viewerLastSeenMs: frameViewerLastSeenMs,
    hasFrame: Boolean(latestFrame),
    latestFrameMs
  };
}

function standaloneEmulatorPayload() {
  pruneControllers();
  return {
    active: Boolean(standaloneEmulatorState.active),
    id: standaloneEmulatorState.active ? standaloneEmulatorState.id : "",
    lastSeenMs: standaloneEmulatorState.active ? standaloneEmulatorState.lastSeenMs : 0
  };
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
    standaloneEmulator: standaloneEmulatorPayload(),
    viewerUrl: `${origin}/room`,
    controllerUrl: `${origin}/controller`,
    controllers: Array.from(controllers.values()).map(controller => ({
      id: controller.id,
      label: controller.label,
      buttons: controller.buttons,
      axes: controller.axes,
      inputSource: controller.inputSource,
      lastSeenMs: controller.lastSeenMs
    })),
    nativeInput: {
      available: process.platform === "win32",
      polling: Boolean(nativeGamepadProcess && !nativeGamepadProcess.killed),
      connectedIndexes: Array.from(nativeGamepadStates.keys()),
      claims: Array.from(nativeControllerClaims.values()).map(claim => ({
        id: claim.id,
        label: claim.label,
        nativeIndex: claim.nativeIndex,
        lastSeenMs: claim.lastSeenMs
      }))
    },
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
    select { width: 100%; border: 1px solid rgba(187,247,208,.28); border-radius: 10px; padding: 10px 12px; background: rgba(15,23,42,.9); color: #dcfce7; font-weight: 1000; outline: none; }
    .muted { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .kbd { display: inline-block; min-width: 28px; padding: 5px 8px; margin: 3px; border-radius: 7px; border: 1px solid rgba(187,247,208,.28); background: rgba(15,23,42,.82); text-align: center; font-weight: 1000; }
    .controller-picker { margin-top: 12px; display: grid; gap: 6px; }
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
          if (document.hidden) return;
          if (refreshing) return;
          refreshing = true;
          try {
            const status = await fetch("/api/frame-status?t=" + Date.now(), { cache: "no-store" }).then(response => response.json());
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
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) refreshFrame();
        });
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
        <div class="controller-picker">
          <label class="sub" for="controllerSelect">Controller</label>
          <select id="controllerSelect"></select>
        </div>
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
            <button id="hidConnect" type="button" style="display:none;margin-top:8px;">Link HID</button>
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
      const hidConnectButton = document.getElementById("hidConnect");
      const controllerSelect = document.getElementById("controllerSelect");
      const selectedControllerKey = "fuitControllerSelectedPadKey";
      const keyboardControllerValue = "__keyboard__";
      let selectedPhysicalControllerId = "";
      let controllerSelectSignature = "";
      try { selectedPhysicalControllerId = sessionStorage.getItem(selectedControllerKey) || ""; } catch {}
      const keyMap = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right", KeyJ: "a", KeyK: "b", KeyU: "x", KeyI: "y", Enter: "start", ShiftRight: "select", ShiftLeft: "select" };
      const gamepadMap = { 0: "a", 1: "b", 2: "x", 3: "y", 4: "l", 5: "r", 6: "z", 7: "r2", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };
      const hidButtonMap = { 1: "a", 2: "b", 3: "x", 4: "y", 5: "l", 6: "r", 7: "select", 8: "start", 11: "z", 12: "r2" };
      const hidGamepadUsages = new Set(["1:4", "1:5", "1:8"]);
      const hidPrimaryAxisUsages = { 48: 0, 49: 1, 51: 2, 52: 3 };
      const hidFallbackAxisUsages = { 50: 2, 53: 3 };
      let claimedPhysicalControllerId = "";
      let claimedNativeController = null;
      let hidDevice = null;
      let hidReportParsers = new Map();
      let hidControllerState = null;
      const controllerTickMs = 50;
      let sendingInput = false;
      let sendAgain = false;
      let lastInputStartedAt = 0;
      let controllerTickSource = null;
      let controllerTickWorker = null;
      let controllerTickWorkerUrl = "";
      let controllerTickFallbackTimer = 0;
      const relayClaimsKey = "fuitControllerRelayClaims";
      const relayClaimTtlMs = 60 * 60 * 1000;
      const openerRelayTargetOrigin = (() => {
        try { return document.referrer ? new URL(document.referrer).origin : "*"; } catch { return "*"; }
      })();
      const nativeHelperFallbackAllowed = (() => {
        const host = String(location.hostname || "").toLowerCase();
        return host === "localhost" || host === "127.0.0.1" || host === "::1";
      })();
      const runSoon = typeof queueMicrotask === "function"
        ? queueMicrotask
        : callback => Promise.resolve().then(callback);

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const makeHidUsage = (page, id) => (Number(page || 0) * 65536) + Number(id || 0);
      const hidUsagePage = (usage, fallbackPage = 0) => {
        const number = Number(usage || 0);
        return number > 65535 ? Math.floor(number / 65536) : Number(fallbackPage || 0);
      };
      const hidUsageId = usage => Number(usage || 0) % 65536;
      const getHidPhysicalControllerId = device => controllerDeviceId + ":hid:" + Number(device?.vendorId || 0) + ":" + Number(device?.productId || 0) + ":" + (device?.productName || "Controller");
      const isHidGamepadCollection = collection => hidGamepadUsages.has(Number(collection?.usagePage || 0) + ":" + Number(collection?.usage || 0));
      function collectHidGamepadCollections(device) {
        const matches = [];
        const visit = collection => {
          if (!collection) return;
          if (isHidGamepadCollection(collection)) {
            matches.push(collection);
            return;
          }
          (collection.children || []).forEach(visit);
        };
        (device?.collections || []).forEach(visit);
        return matches;
      }

      function hidItemUsages(item, fallbackPage) {
        if (Array.isArray(item?.usages) && item.usages.length) {
          return item.usages.map(usage => makeHidUsage(hidUsagePage(usage, fallbackPage), hidUsageId(usage)));
        }

        if (item?.isRange && item.usageMinimum !== undefined && item.usageMaximum !== undefined) {
          const usageMinimum = Number(item.usageMinimum || 0);
          const usageMaximum = Number(item.usageMaximum || 0);
          const usagePage = hidUsagePage(usageMinimum, fallbackPage);
          const minId = hidUsageId(usageMinimum);
          const maxId = hidUsageId(usageMaximum);
          const count = Math.min(Number(item.reportCount || 0), Math.max(0, maxId - minId + 1), 64);
          return Array.from({ length: count }, (_, index) => makeHidUsage(usagePage, minId + index));
        }

        return [];
      }

      function makeHidReportParsers(device) {
        const parsers = new Map();
        collectHidGamepadCollections(device).forEach(collection => {
          (collection.inputReports || []).forEach(report => {
            let bitOffset = 0;
            const fields = [];
            (report.items || []).forEach(item => {
              const reportSize = Number(item.reportSize || 0);
              const reportCount = Number(item.reportCount || 0);
              if (!reportSize || !reportCount) return;
              const usages = hidItemUsages(item, collection.usagePage);
              const usagePage = usages.length ? hidUsagePage(usages[0], collection.usagePage) : Number(collection.usagePage || 0);
              if (!item.isConstant && !item.isBufferedBytes) {
                fields.push({
                  bitOffset,
                  reportSize,
                  reportCount,
                  isArray: Boolean(item.isArray),
                  hasNull: Boolean(item.hasNull),
                  logicalMinimum: Number(item.logicalMinimum || 0),
                  logicalMaximum: Number(item.logicalMaximum || 0),
                  usagePage,
                  usages
                });
              }
              bitOffset += reportSize * reportCount;
            });
            if (fields.length) parsers.set(Number(report.reportId || 0), fields);
          });
        });
        return parsers;
      }

      function readHidBits(bytes, bitOffset, bitLength, signed) {
        let value = 0;
        let multiplier = 1;
        for (let bit = 0; bit < bitLength; bit += 1) {
          const sourceBit = bitOffset + bit;
          const byte = bytes[sourceBit >> 3] || 0;
          if (byte & (1 << (sourceBit & 7))) value += multiplier;
          multiplier *= 2;
        }
        if (signed && bitLength > 0) {
          const sign = Math.pow(2, bitLength - 1);
          if (value >= sign) value -= Math.pow(2, bitLength);
        }
        return value;
      }

      function normalizeHidAxis(value, field) {
        const min = Number(field.logicalMinimum || 0);
        const max = Number(field.logicalMaximum || 0);
        if (max <= min) return 0;
        const center = min < 0 && max > 0 ? 0 : (min + max) / 2;
        const range = min < 0 && max > 0 ? Math.max(Math.abs(min), Math.abs(max)) : (max - min) / 2;
        if (!range) return 0;
        const normalized = clamp((Number(value || 0) - center) / range, -1, 1);
        return Math.abs(normalized) < 0.05 ? 0 : normalized;
      }

      function normalizeHidTrigger(value, field) {
        const min = Number(field.logicalMinimum || 0);
        const max = Number(field.logicalMaximum || 0);
        if (max <= min) return 0;
        const normalized = clamp((Number(value || 0) - min) / (max - min), 0, 1);
        return normalized < 0.08 ? 0 : normalized;
      }

      function addHidHatButtons(buttons, value, field) {
        let hat = Number(value);
        if (field.hasNull && (hat < field.logicalMinimum || hat > field.logicalMaximum)) return;
        if (field.logicalMinimum === 1 && field.logicalMaximum >= 8) hat -= 1;
        if (hat < 0 || hat > 7) return;
        const directions = [
          ["up"],
          ["up", "right"],
          ["right"],
          ["down", "right"],
          ["down"],
          ["down", "left"],
          ["left"],
          ["up", "left"]
        ];
        directions[hat].forEach(direction => buttons.add(direction));
      }

      function applyHidValue(buttons, axes, usage, value, field, context) {
        const page = hidUsagePage(usage, field.usagePage);
        const id = hidUsageId(usage);
        if (page === 9) {
          const mapped = hidButtonMap[id];
          if (mapped && Number(value)) buttons.add(mapped);
          return;
        }
        if (page !== 1) return;
        if (id === 57) {
          addHidHatButtons(buttons, value, field);
          return;
        }
        const axisIndex = hidPrimaryAxisUsages[id];
        if (axisIndex !== undefined) {
          axes[axisIndex] = normalizeHidAxis(value, field);
          context.axesSeen.add(axisIndex);
          return;
        }
        const fallbackAxisIndex = hidFallbackAxisUsages[id];
        if (fallbackAxisIndex === undefined) return;
        if (context.hasPrimaryRightStick) {
          const triggerName = id === 50 ? "z" : "r2";
          if (normalizeHidTrigger(value, field) > 0.45) buttons.add(triggerName);
          return;
        }
        if (!context.axesSeen.has(fallbackAxisIndex)) {
          axes[fallbackAxisIndex] = normalizeHidAxis(value, field);
          context.axesSeen.add(fallbackAxisIndex);
        }
      }

      function parseHidInputReport(event) {
        const fields = hidReportParsers.get(Number(event.reportId || 0));
        if (!fields) return null;
        const matchingPad = document.hidden ? null : findHidGamepad(event.device);
        if (matchingPad) {
          return {
            physicalControllerId: getPadKey(matchingPad),
            label: getPadLabel(matchingPad),
            buttons: readGamepadButtons(matchingPad),
            axes: Array.from(matchingPad.axes || []),
            pad: matchingPad
          };
        }
        const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        const buttons = new Set();
        const axes = [0, 0, 0, 0];
        const hidContext = {
          axesSeen: new Set(),
          hasPrimaryRightStick: fields.some(field => (field.usages || []).some(usage => {
            const page = hidUsagePage(usage, field.usagePage);
            const id = hidUsageId(usage);
            return page === 1 && (id === 51 || id === 52);
          }))
        };
        fields.forEach(field => {
          const signed = field.logicalMinimum < 0;
          for (let index = 0; index < field.reportCount; index += 1) {
            const value = readHidBits(bytes, field.bitOffset + (index * field.reportSize), field.reportSize, signed);
            if (field.isArray) {
              if (!value) continue;
              applyHidValue(buttons, axes, makeHidUsage(field.usagePage, value), 1, field, hidContext);
            } else {
              const usage = field.usages[index] || field.usages[0] || 0;
              if (usage) applyHidValue(buttons, axes, usage, value, field, hidContext);
            }
          }
        });
        return {
          physicalControllerId: getHidPhysicalControllerId(event.device),
          label: event.device.productName || "HID Controller",
          buttons: Array.from(buttons),
          axes
        };
      }

      function handleHidInputReport(event) {
        if (!hidDevice || event.device !== hidDevice) return;
        const state = parseHidInputReport(event);
        if (!state) return;
        hidControllerState = state;
        queueSendInput(true);
      }

      function getActiveHidControllerState() {
        if (!hidDevice || !hidControllerState) return null;
        const matchingPad = document.hidden ? null : (hidControllerState.pad || findHidGamepad(hidDevice));
        if (matchingPad) {
          return {
            physicalControllerId: getPadKey(matchingPad),
            label: getPadLabel(matchingPad),
            buttons: Array.from(new Set([...pressed, ...readGamepadButtons(matchingPad)])),
            axes: Array.from(matchingPad.axes || []),
            pad: matchingPad
          };
        }
        return {
          physicalControllerId: hidControllerState.physicalControllerId,
          label: hidControllerState.label,
          buttons: Array.from(new Set([...pressed, ...hidControllerState.buttons])),
          axes: Array.isArray(hidControllerState.axes) ? hidControllerState.axes : []
        };
      }

      async function openHidDevice(device) {
        if (!device || !collectHidGamepadCollections(device).length) return false;
        const parsers = makeHidReportParsers(device);
        if (!parsers.size) return false;
        if (hidDevice && hidDevice !== device) {
          try { hidDevice.removeEventListener("inputreport", handleHidInputReport); } catch {}
        }
        hidDevice = device;
        hidReportParsers = parsers;
        if (!device.opened) await device.open();
        try { device.removeEventListener("inputreport", handleHidInputReport); } catch {}
        device.addEventListener("inputreport", handleHidInputReport);
        if (hidConnectButton) hidConnectButton.textContent = "HID Linked";
        status.textContent = "HID linked: " + (device.productName || "Controller");
        claimNativeControllerForHidDevice(device).then(claimed => {
          if (claimed) queueSendInput(true);
        }).catch(() => {});
        return true;
      }

      async function connectRememberedHidDevices() {
        if (!navigator.hid) return;
        try {
          const devices = await navigator.hid.getDevices();
          for (const device of devices) {
            if (await openHidDevice(device)) return;
          }
        } catch {}
      }

      async function requestHidDevice() {
        if (!navigator.hid) return;
        try {
          const devices = await navigator.hid.requestDevice({
            filters: [
              { usagePage: 1, usage: 4 },
              { usagePage: 1, usage: 5 },
              { usagePage: 1, usage: 8 }
            ]
          });
          for (const device of devices) {
            if (await openHidDevice(device)) return;
          }
        } catch {}
      }

      if (navigator.hid && hidConnectButton) {
        hidConnectButton.style.display = "inline-block";
        hidConnectButton.addEventListener("click", requestHidDevice);
        connectRememberedHidDevices();
        navigator.hid.addEventListener("disconnect", event => {
          if (event.device !== hidDevice) return;
          try { hidDevice.removeEventListener("inputreport", handleHidInputReport); } catch {}
          hidDevice = null;
          hidReportParsers = new Map();
          hidControllerState = null;
          hidConnectButton.textContent = "Link HID";
          queueSendInput(true);
        });
      }

      function getPadKey(pad) {
        return pad ? controllerDeviceId + ":" + String(pad.index) + ":" + (pad.id || "Gamepad") : "";
      }
      function getPadLabel(pad) {
        return String(pad?.id || "Keyboard").trim() || "Keyboard";
      }
      function getConnectedPads() {
        return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      }
      function normalizePadSearchText(value) {
        return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      }
      function findHidGamepad(device) {
        const pads = getConnectedPads();
        if (!pads.length) return null;
        if (selectedPhysicalControllerId && selectedPhysicalControllerId !== keyboardControllerValue) {
          const selectedPad = pads.find(pad => getPadKey(pad) === selectedPhysicalControllerId);
          if (selectedPad) return selectedPad;
        }
        if (pads.length === 1) return pads[0];
        const vendorHex = Number(device?.vendorId || 0).toString(16).padStart(4, "0");
        const productHex = Number(device?.productId || 0).toString(16).padStart(4, "0");
        const idMatch = pads.find(pad => {
          const id = String(pad?.id || "").toLowerCase();
          return vendorHex !== "0000" && productHex !== "0000" && id.includes(vendorHex) && id.includes(productHex);
        });
        if (idMatch) return idMatch;
        const productWords = normalizePadSearchText(device?.productName).split(" ").filter(word => word.length > 2);
        if (!productWords.length) return null;
        return pads.find(pad => {
          const id = normalizePadSearchText(pad?.id);
          return productWords.every(word => id.includes(word));
        }) || null;
      }
      const getPadOptionLabel = pad => {
        const number = Number(pad?.index);
        const prefix = Number.isInteger(number) ? "Controller " + (number + 1) + " - " : "";
        return prefix + getPadLabel(pad);
      };
      function saveSelectedPhysicalControllerId(value) {
        selectedPhysicalControllerId = value || "";
        try {
          if (selectedPhysicalControllerId) sessionStorage.setItem(selectedControllerKey, selectedPhysicalControllerId);
          else sessionStorage.removeItem(selectedControllerKey);
        } catch {}
      }
      function syncControllerSelect(pads = getConnectedPads()) {
        if (!controllerSelect) return;
        const padOptions = pads.map(pad => ({ value: getPadKey(pad), label: getPadOptionLabel(pad), disabled: false }));
        const selectedPadAvailable = selectedPhysicalControllerId &&
          selectedPhysicalControllerId !== keyboardControllerValue &&
          padOptions.some(option => option.value === selectedPhysicalControllerId);
        const options = [
          {
            value: "",
            label: padOptions.length ? "Select controller" : "No browser controllers found",
            disabled: true
          },
          { value: keyboardControllerValue, label: "Keyboard only", disabled: false },
          ...padOptions
        ];
        if (selectedPhysicalControllerId && selectedPhysicalControllerId !== keyboardControllerValue && !selectedPadAvailable) {
          options.push({ value: selectedPhysicalControllerId, label: "Selected controller disconnected", disabled: true });
        }

        const signature = JSON.stringify(options) + "|" + selectedPhysicalControllerId;
        if (signature === controllerSelectSignature) {
          controllerSelect.value = selectedPhysicalControllerId || "";
          return;
        }

        controllerSelectSignature = signature;
        controllerSelect.replaceChildren(...options.map(option => {
          const element = document.createElement("option");
          element.value = option.value;
          element.textContent = option.label;
          element.disabled = Boolean(option.disabled);
          return element;
        }));
        controllerSelect.value = selectedPhysicalControllerId || "";
      }
      function selectPhysicalController(value) {
        const nextPhysicalControllerId = value || "";
        const previousSelectedPhysicalControllerId = selectedPhysicalControllerId;
        if (
          claimedPhysicalControllerId &&
          claimedPhysicalControllerId !== nextPhysicalControllerId
        ) {
          releaseController(claimedPhysicalControllerId);
          claimedPhysicalControllerId = "";
        } else if (
          previousSelectedPhysicalControllerId &&
          previousSelectedPhysicalControllerId !== keyboardControllerValue &&
          previousSelectedPhysicalControllerId !== nextPhysicalControllerId
        ) {
          releaseController(previousSelectedPhysicalControllerId);
        }

        saveSelectedPhysicalControllerId(nextPhysicalControllerId);
        if (nextPhysicalControllerId) lockedGamepads.delete(nextPhysicalControllerId);
        syncControllerSelect();
        status.textContent = nextPhysicalControllerId === keyboardControllerValue
          ? "Connected: Keyboard"
          : nextPhysicalControllerId
            ? "Controller selected."
            : "Select a controller.";
        queueSendInput(true);
      }
      function readRelayClaims() {
        const now = Date.now();
        try {
          const parsed = JSON.parse(localStorage.getItem(relayClaimsKey) || "[]");
          return (Array.isArray(parsed) ? parsed : [])
            .filter(claim => claim && claim.id && claim.physicalControllerId && now - Number(claim.updatedAt || 0) < relayClaimTtlMs)
            .slice(-8);
        } catch {
          return [];
        }
      }
      function writeRelayClaims(claims) {
        try { localStorage.setItem(relayClaimsKey, JSON.stringify(claims.slice(-8))); } catch {}
      }
      function postOpenerRelayMessage(type, claim = null) {
        try {
          if (!window.opener || window.opener.closed) return;
          window.opener.postMessage({
            source: "fuit-multiplayer-controller",
            type,
            claim
          }, openerRelayTargetOrigin || "*");
        } catch {}
      }
      function publishRelayClaim(controllerState) {
        if (!controllerState?.pad || !controllerState.physicalControllerId) return;
        const claim = {
          id: controllerId,
          label: controllerState.label || getPadLabel(controllerState.pad),
          physicalControllerId: controllerState.physicalControllerId,
          padIndex: Number(controllerState.pad.index),
          padId: String(controllerState.pad.id || ""),
          updatedAt: Date.now()
        };
        const claims = readRelayClaims().filter(existing => existing.id !== controllerId);
        claims.push(claim);
        writeRelayClaims(claims);
        postOpenerRelayMessage("claim", claim);
      }
      function clearRelayClaim() {
        writeRelayClaims(readRelayClaims().filter(existing => existing.id !== controllerId));
        postOpenerRelayMessage("release", { id: controllerId, updatedAt: Date.now() });
      }
      const releaseNativeController = physicalControllerId => {
        const releasePhysicalControllerId = typeof physicalControllerId === "string"
          ? physicalControllerId
          : claimedNativeController?.physicalControllerId || "";
        if (!releasePhysicalControllerId) return;
        fetch("/api/controller/native-release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: controllerId, physicalControllerId: releasePhysicalControllerId }),
          keepalive: true
        }).catch(() => {});
      };
      const releaseController = physicalControllerId => {
        const releasePhysicalControllerId = typeof physicalControllerId === "string"
          ? physicalControllerId
          : claimedPhysicalControllerId || claimedNativeController?.physicalControllerId || "";
        clearRelayClaim();
        releaseNativeController(releasePhysicalControllerId);
        if (!physicalControllerId || releasePhysicalControllerId === claimedNativeController?.physicalControllerId) {
          claimedNativeController = null;
        }
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
      if (controllerSelect) {
        controllerSelect.addEventListener("change", event => selectPhysicalController(event.target.value));
      }
      window.addEventListener("gamepadconnected", () => {
        syncControllerSelect();
        queueSendInput(true);
      });
      window.addEventListener("gamepaddisconnected", () => {
        syncControllerSelect();
        queueSendInput(true);
      });

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

      function readGamepadButtons(pad, includePressed = false) {
        const buttons = Array.from(pressed);
        if (!includePressed) buttons.length = 0;
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

      function readButtons(pad) {
        return readGamepadButtons(pad, true);
      }

      async function claimNativeController(pad) {
        if (!nativeHelperFallbackAllowed) return false;
        if (!pad) return false;
        const nativeIndex = Number(pad.index);
        const preferredNativeIndex = Number.isInteger(nativeIndex) && nativeIndex >= 0 && nativeIndex < 4 ? nativeIndex : null;

        const physicalControllerId = getPadKey(pad);
        const label = getPadLabel(pad);
        try {
          const response = await fetch("/api/controller/native-claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: controllerId,
              label,
              physicalControllerId,
              nativeIndex: preferredNativeIndex
            })
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) {
            if (result?.locked) return false;
            throw new Error(result?.error || "Native controller claim failed.");
          }
          if (result?.nativeAvailable && result?.nativeConnected) {
            claimedNativeController = {
              physicalControllerId,
              nativeIndex: Number.isInteger(result.nativeIndex) ? result.nativeIndex : preferredNativeIndex,
              label
            };
          } else if (claimedNativeController?.physicalControllerId === physicalControllerId) {
            claimedNativeController = null;
          }
          return Boolean(result?.nativeAvailable && result?.nativeConnected);
        } catch {
          return false;
        }
      }

      async function claimNativeControllerForHidDevice(device) {
        if (!nativeHelperFallbackAllowed) return false;
        if (!device) return false;
        const physicalControllerId = getHidPhysicalControllerId(device);
        const label = device.productName || "HID Controller";
        try {
          const response = await fetch("/api/controller/native-claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: controllerId,
              label,
              physicalControllerId,
              nativeIndex: null
            })
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) {
            if (result?.locked) return false;
            throw new Error(result?.error || "Native controller claim failed.");
          }
          if (result?.nativeAvailable && result?.nativeConnected) {
            claimedNativeController = {
              physicalControllerId,
              nativeIndex: Number.isInteger(result.nativeIndex) ? result.nativeIndex : null,
              label
            };
            return true;
          }
          if (claimedNativeController?.physicalControllerId === physicalControllerId) claimedNativeController = null;
          return false;
        } catch {
          return false;
        }
      }

      async function keepNativeControllerClaimAlive() {
        if (!nativeHelperFallbackAllowed) return false;
        if (!claimedNativeController) return false;
        try {
          const response = await fetch("/api/controller/native-claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: controllerId,
              label: claimedNativeController.label,
              physicalControllerId: claimedNativeController.physicalControllerId,
              nativeIndex: claimedNativeController.nativeIndex
            })
          });
          const result = await response.json().catch(() => null);
          if (response.ok && result?.nativeConnected) {
            claimedNativeController.nativeIndex = Number.isInteger(result.nativeIndex)
              ? result.nativeIndex
              : claimedNativeController.nativeIndex;
            return true;
          }
          claimedNativeController = null;
          return false;
        } catch {
          return false;
        }
      }

      async function postControllerState(controllerState) {
        const physicalControllerId = controllerState.physicalControllerId || "";
        const controllerLabel = controllerState.label || "Keyboard";
        const buttons = Array.isArray(controllerState.buttons) ? controllerState.buttons : [];
        const axes = Array.isArray(controllerState.axes) ? controllerState.axes : [];
        const response = await fetch("/api/controller", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: controllerId,
            label: controllerLabel,
            physicalControllerId,
            buttons,
            axes,
            source: "controller-tab"
          })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          if (result?.locked && physicalControllerId) {
            lockedGamepads.set(physicalControllerId, Date.now() + 5000);
            if (claimedPhysicalControllerId === physicalControllerId) claimedPhysicalControllerId = "";
            clearRelayClaim();
            return { ok: false, locked: true, label: result.label || controllerLabel, physicalControllerId };
          }
          throw new Error(result?.error || "Controller update failed.");
        }
        claimedPhysicalControllerId = physicalControllerId;
        if (controllerState.pad) publishRelayClaim(controllerState);
        else clearRelayClaim();
        if (controllerState.pad) await claimNativeController(controllerState.pad);
        else if (claimedNativeController?.physicalControllerId && claimedNativeController.physicalControllerId !== physicalControllerId) {
          releaseNativeController(claimedNativeController.physicalControllerId);
          claimedNativeController = null;
        }
        status.textContent = buttons.length
          ? "Sending from " + controllerLabel + ": " + buttons.join(", ")
          : "Connected: " + controllerLabel;
        return { ok: true, locked: false, label: controllerLabel, physicalControllerId };
      }

      async function postControllerInput(pad) {
        return postControllerState({
          physicalControllerId: getPadKey(pad),
          label: getPadLabel(pad),
          buttons: readButtons(pad),
          axes: Array.from(pad?.axes || []),
          pad
        });
      }

      async function sendInput() {
        if (document.hidden) {
          if (claimedNativeController) {
            const keptAlive = await keepNativeControllerClaimAlive();
            if (keptAlive) {
              status.textContent = "Controller tab is running in the background.";
              return;
            }
          }

          const hidState = getActiveHidControllerState();
          if (hidState) {
            try {
              const result = await postControllerState(hidState);
              if (result.locked) status.textContent = result.label + " is already connected in another controller tab.";
            } catch {
              status.textContent = "Helper connection lost.";
            }
            return;
          }

          status.textContent = "Controller tab is running in the background.";
          return;
        }

        const pads = getConnectedPads();
        syncControllerSelect(pads);

        if (selectedPhysicalControllerId === keyboardControllerValue) {
          try {
            await postControllerInput(null);
          } catch {
            status.textContent = "Helper connection lost.";
          }
          return;
        }

        const hidState = getActiveHidControllerState();
        if (hidState && (!selectedPhysicalControllerId || selectedPhysicalControllerId === hidState.physicalControllerId)) {
          try {
            const result = await postControllerState(hidState);
            if (result.locked) status.textContent = result.label + " is already connected in another controller tab.";
          } catch {
            status.textContent = "Helper connection lost.";
          }
          return;
        }

        if (selectedPhysicalControllerId) {
          const selectedPad = pads.find(candidate => getPadKey(candidate) === selectedPhysicalControllerId) || null;
          if (selectedPad) {
            const lockedUntil = lockedGamepads.get(selectedPhysicalControllerId) || 0;
            if (lockedUntil > Date.now()) {
              status.textContent = getPadLabel(selectedPad) + " is already connected in another controller tab.";
              return;
            }
            lockedGamepads.delete(selectedPhysicalControllerId);
            try {
              const result = await postControllerInput(selectedPad);
              if (result.locked) status.textContent = result.label + " is already connected in another controller tab.";
            } catch {
              status.textContent = "Helper connection lost.";
            }
            return;
          }

          if (claimedPhysicalControllerId) {
            const releasedPhysicalControllerId = claimedPhysicalControllerId;
            lockedGamepads.delete(releasedPhysicalControllerId);
            claimedPhysicalControllerId = "";
            releaseController(releasedPhysicalControllerId);
          }

          releaseController(selectedPhysicalControllerId);
          status.textContent = "Selected controller disconnected.";
          return;
        }

        if (claimedPhysicalControllerId || claimedNativeController) {
          const releasedPhysicalControllerId = claimedPhysicalControllerId || claimedNativeController?.physicalControllerId || "";
          claimedPhysicalControllerId = "";
          releaseController(releasedPhysicalControllerId);
        }
        status.textContent = pads.length ? "Select a controller." : "Select Keyboard only to use this keyboard.";
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

      syncControllerSelect();
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
      "Cross-Origin-Resource-Policy": "cross-origin",
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

  if (req.method === "GET" && url.pathname === "/api/controllers") {
    sendJson(res, 200, controllerStatusPayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/frame-status") {
    sendJson(res, 200, frameStatusPayload({ markActive: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/frame-demand") {
    sendJson(res, 200, frameDemandPayload());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/emulator-tab") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const id = normalizeControllerId(body.id) || `emulator-${Date.now()}`;
      const now = Date.now();
      if (body.active === false) {
        if (!standaloneEmulatorState.id || standaloneEmulatorState.id === id) {
          standaloneEmulatorState = { active: false, id: "", lastSeenMs: 0 };
        }
      } else {
        standaloneEmulatorState = { active: true, id, lastSeenMs: now };
      }
      sendJson(res, 200, { ok: true, standaloneEmulator: standaloneEmulatorPayload() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad emulator tab payload." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/frame.jpg") {
    if (!latestFrame) {
      send(res, 404, "No host frame yet.");
      return;
    }
    markFrameViewerActive();
    res.writeHead(200, {
      "Content-Type": latestFrame.type,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "ETag": latestFrameEtag,
      "Cache-Control": "no-store"
    });
    res.end(latestFrame.buffer);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller/native-claim") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const id = normalizeControllerId(body.id) || `controller-${controllers.size + 1}`;
      const now = Date.now();
      const physicalControllerId = normalizeControllerClaimId(body.physicalControllerId);
      const label = normalizeControllerLabel(body.label || "Browser Controller");
      const nativeIndex = body.nativeIndex === null || body.nativeIndex === undefined || body.nativeIndex === ""
        ? null
        : Number(body.nativeIndex);
      if (!physicalControllerId) throw new Error("Expected a physical controller id.");
      if (nativeIndex !== null && (!Number.isInteger(nativeIndex) || nativeIndex < 0 || nativeIndex > 3)) {
        throw new Error("Expected an XInput controller index from 0 to 3.");
      }
      pruneControllers();

      const existingClaim = controllerClaims.get(physicalControllerId);
      if (
        existingClaim &&
        existingClaim.id !== id &&
        controllers.has(existingClaim.id) &&
        now - existingClaim.lastSeenMs <= CONTROLLER_CLAIM_STALE_MS
      ) {
        sendJson(res, 409, {
          ok: false,
          locked: true,
          error: "This physical controller is already connected in another controller tab.",
          label: existingClaim.label || label
        });
        return;
      }

      const nativeAvailable = startNativeGamepadPoller();
      releaseNativeControllerClaims(id, physicalControllerId);
      nativeControllerClaims.set(physicalControllerId, {
        id,
        label,
        physicalControllerId,
        nativeIndex,
        lastSeenMs: now
      });

      const current = controllers.get(id);
      storeControllerState({
        id,
        label,
        physicalControllerId,
        buttons: current?.buttons || [],
        axes: current?.axes || [],
        now
      });
      applyNativeControllerClaims();
      const selectedClaim = nativeControllerClaims.get(physicalControllerId);
      sendJson(res, 200, {
        ok: true,
        nativeAvailable,
        nativeIndex: selectedClaim?.nativeIndex ?? null,
        nativeConnected: selectedClaim?.nativeIndex !== null && selectedClaim?.nativeIndex !== undefined
          ? nativeGamepadStates.has(selectedClaim.nativeIndex)
          : nativeGamepadStates.size > 0
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad native controller claim payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller/native-release") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const id = normalizeControllerId(body.id);
      const physicalControllerId = normalizeControllerClaimId(body.physicalControllerId);
      if (id) {
        for (const [nativePhysicalId, claim] of nativeControllerClaims.entries()) {
          if (claim.id === id && (!physicalControllerId || nativePhysicalId === physicalControllerId)) {
            nativeControllerClaims.delete(nativePhysicalId);
          }
        }
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Bad native controller release payload." });
    }
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
      const id = normalizeControllerId(body.id) || `controller-${controllers.size + 1}`;
      const now = Date.now();
      const physicalControllerId = normalizeControllerClaimId(body.physicalControllerId);
      const label = normalizeControllerLabel(body.label || "Browser Controller");
      const inputSource = normalizeControllerSource(body.source);
      pruneControllers();

      const currentController = controllers.get(id);
      if (
        inputSource === "front-relay" &&
        currentController?.inputSource &&
        currentController.inputSource !== "front-relay" &&
        now - Number(currentController.lastSeenMs || 0) <= CONTROLLER_DIRECT_INPUT_GRACE_MS
      ) {
        sendJson(res, 200, {
          ok: true,
          ignored: true,
          activeSource: currentController.inputSource
        });
        return;
      }

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
        releaseNativeControllerClaims(id, physicalControllerId);
      } else {
        releaseControllerClaims(id);
        releaseNativeControllerClaims(id);
      }

      storeControllerState({
        id,
        label,
        physicalControllerId,
        buttons: body.buttons,
        axes: body.axes,
        source: inputSource,
        now
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
        releaseNativeControllerClaims(id, physicalControllerId);
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
  try { nativeGamepadProcess?.kill?.(); } catch {}
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
