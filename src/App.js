import { forwardRef, useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle } from "react";
import { MUSIC_LIBRARY } from "./musicLibraryData";
import { FATTYS_LIVE_TV, FUITS_LIVE_TV_PLAYLIST } from "./fattysLiveTvData";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_PROJECTS = [
  { id: "default", name: "My Project", color: "#A8D5A2" },
];

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins) {
  if (mins == null || isNaN(mins)) return "--:--";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function calcWorked(start, end, breakMins) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return null;
  let total = e - s;
  if (total < 0) total += 24 * 60;
  total -= breakMins || 0;
  return Math.max(0, total);
}

// Calculate total worked including optional split shifts
function calcTotalWorked(form) {
  const shift1 = calcWorked(form.start, form.end, totalBreakMins(form.breaks));
  if (!form.splitShift) return shift1;

  const shift2 = calcWorked(form.start2, form.end2, 0);
  const extraShiftTotal = (form.extraShifts || []).reduce((sum, shift) => {
    const worked = calcWorked(shift.start, shift.end, 0);
    return sum + (worked || 0);
  }, 0);

  if (shift1 == null && shift2 == null && extraShiftTotal === 0) return null;
  return (shift1 || 0) + (shift2 || 0) + extraShiftTotal;
}

function to12Hour(timeStr) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

function calcExactPay(mins, rate, includeOvertime = false) {
  if (!mins || !rate || rate <= 0) return null;
  const overtimeThreshold = 40 * 60;
  let totalPay = 0;

  if (includeOvertime && mins > overtimeThreshold) {
    const regularMins = overtimeThreshold;
    const overtimeMins = mins - overtimeThreshold;
    totalPay =
      (regularMins / 60) * rate +
      (overtimeMins / 60) * (rate * 1.5);
  } else {
    totalPay = (mins / 60) * rate;
  }

  return (Math.floor(totalPay * 100) / 100).toFixed(2);
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthKeyFromDatePart(datePart) {
  if (!datePart) return getMonthKey(new Date());
  const [year, month] = datePart.split("-");
  return year && month ? `${year}-${month}` : getMonthKey(new Date(datePart));
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const defaultEntry = () => ({ start: "", end: "", breaks: [], note: "", splitShift: false, start2: "", end2: "", extraShifts: [] });

function totalBreakMins(breaks) {
  return (breaks || []).reduce((sum, b) => sum + (parseInt(b.mins) || 0), 0);
}

const STORAGE_KEY = "hoursTrackerData_v2";
const PROJECTS_KEY = "hoursTrackerProjects_v2";
const RATES_KEY = "hoursTrackerRates_v1";
const MONTHLY_TRACKER_KEY = "hoursTrackerMonthlyTrackerMonths_v1";
const KICK_GAMING_CHANNEL_KEY = "fuitLiveGamingKickChannel_v1";
const YOUTUBE_GAMING_CHANNEL_URL = "https://www.youtube.com/@xflivetv";
const YOUTUBE_GAMING_VIDEOS_URL = "https://www.youtube.com/@xflivetv/videos";
const RETROARCH_WEB_PLAYER_URL = "https://web.libretro.com/";
const SIGNUP_REQUESTS_KEY = "fuitsSignupRequests_v1";
const APPROVED_USERS_KEY = "fuitsApprovedUsers_v1";
const BANNED_USERS_KEY = "fuitsBannedUsers_v1";
const FUIT_CREDITS_BASE_URL = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
const DEFAULT_FUIT_CREDIT_SETTINGS = {
  creditSymbol: "FUIT",
  depositToken: "USDT",
  depositNetwork: "Polygon",
  treasuryWallet: "",
  instructions: "Convert or buy USDT on Polygon, keep enough POL for gas, then send USDT to the admin wallet. FUIT Coin is issued only after admin approval."
};
function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function loadProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY)) || DEFAULT_PROJECTS; } catch { return DEFAULT_PROJECTS; }
}
function saveProjects(p) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(p)); } catch {}
}
function loadRates() {
  try {
    const stored = JSON.parse(localStorage.getItem(RATES_KEY)) || {};
    const legacy = parseFloat(localStorage.getItem("hourlyRate")) || 0;
    if (legacy && Object.keys(stored).length === 0) {
      const projects = loadProjects();
      projects.forEach(p => { stored[p.id] = legacy; });
    }
    return stored;
  } catch { return {}; }
}
function saveRates(rates) {
  try { localStorage.setItem(RATES_KEY, JSON.stringify(rates)); } catch {}
}
function loadMonthlyTrackerMonths() {
  try { return JSON.parse(localStorage.getItem(MONTHLY_TRACKER_KEY)) || {}; } catch { return {}; }
}
function saveMonthlyTrackerMonths(months) {
  try { localStorage.setItem(MONTHLY_TRACKER_KEY, JSON.stringify(months)); } catch {}
}
function loadSignupRequests() {
  try { return JSON.parse(localStorage.getItem(SIGNUP_REQUESTS_KEY)) || []; } catch { return []; }
}
function saveSignupRequests(requests) {
  try { localStorage.setItem(SIGNUP_REQUESTS_KEY, JSON.stringify(requests)); } catch {}
}
function loadApprovedUsers() {
  try { return JSON.parse(localStorage.getItem(APPROVED_USERS_KEY)) || []; } catch { return []; }
}
function saveApprovedUsers(users) {
  try { localStorage.setItem(APPROVED_USERS_KEY, JSON.stringify(users)); } catch {}
}
function loadBannedUsers() {
  try { return JSON.parse(localStorage.getItem(BANNED_USERS_KEY)) || []; } catch { return []; }
}
function saveBannedUsers(users) {
  try { localStorage.setItem(BANNED_USERS_KEY, JSON.stringify(users)); } catch {}
}

function extractFuitWalletAddress(value) {
  const match = String(value || "").trim().match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : "";
}

function isValidFuitWalletAddress(value) {
  return Boolean(extractFuitWalletAddress(value));
}

function formatFuitCreditAmount(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function getFuitQrImageUrl(value, size = 180) {
  const data = String(value || "").trim();
  if (!data) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

function FuitWalletInputWithScanner({ value, onChange, inputStyle, buttonStyle, placeholder = "Polygon wallet address" }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopScanner = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  useEffect(() => {
    if (!scannerOpen || !streamRef.current || !videoRef.current) return undefined;
    let cancelled = false;
    let rafId = 0;
    let detector = null;
    try {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      setScanStatus("QR scan is not available in this browser. Paste the wallet address.");
      return undefined;
    }

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    const scanFrame = async () => {
      if (cancelled) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          const wallet = extractFuitWalletAddress(codes?.[0]?.rawValue || "");
          if (wallet) {
            onChange(wallet);
            setScanStatus("Wallet QR scanned.");
            stopScanner();
            return;
          }
        }
      } catch {}
      rafId = window.requestAnimationFrame(scanFrame);
    };
    video.play().then(scanFrame).catch(() => {
      setScanStatus("Camera could not start. Paste the wallet address.");
      stopScanner();
    });
    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [scannerOpen, onChange, stopScanner]);

  const startScanner = async () => {
    setScanStatus("");
    if (!("BarcodeDetector" in window)) {
      setScanStatus("QR scan is not available in this browser. Paste the wallet address.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Camera access is not available. Paste the wallet address.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setScannerOpen(true);
      setScanStatus("Point camera at the wallet QR code.");
    } catch {
      setScanStatus("Camera permission denied. Paste the wallet address.");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
        <button
          type="button"
          onClick={scannerOpen ? stopScanner : startScanner}
          style={{ ...buttonStyle, whiteSpace: "nowrap" }}
        >
          {scannerOpen ? "Stop" : "Scan QR"}
        </button>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>Manual Enter Address</div>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{ ...inputStyle, minWidth: 0 }}
      />
      {scannerOpen && (
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", maxHeight: 220, objectFit: "cover", border: "1px solid rgba(191,219,254,.45)", background: "#020617" }}
        />
      )}
      {scanStatus && <div style={{ color: scannerOpen ? "#bfdbfe" : "#94a3b8", fontSize: 11, fontWeight: 900 }}>{scanStatus}</div>}
    </div>
  );
}

function resizeProfilePicture(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Choose an image from photos."));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSize = 160;
      const ratio = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.width || maxSize) * ratio));
      canvas.height = Math.max(1, Math.round((image.height || maxSize) * ratio));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare profile picture."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that profile picture."));
    };
    image.src = objectUrl;
  });
}
function getDataUrlByteSize(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
function formatBytesAsGb(bytes) {
  return (Math.max(0, bytes) / 1073741824).toFixed(6);
}
function downloadDataUrl(dataUrl, fileName) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function normalizeKickChannel(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.hostname.toLowerCase().endsWith("kick.com")) {
      return (url.pathname.split("/").filter(Boolean)[0] || "").replace(/^@/, "");
    }
  } catch {}

  return trimmed.replace(/^@/, "").replace(/^kick\.com\//i, "").split(/[/?#]/)[0];
}

const PROJECT_COLORS = [
  "#A8D5A2", "#A2C4D5", "#D5A2A8", "#D5CBA2", "#C4A2D5",
  "#A2D5C4", "#D5B8A2", "#B8A2D5", "#A2D5B8", "#D5A2C4"
];


const THEME_KEY = "hoursTrackerTheme_v1";
const CUSTOM_BG_KEY = "hoursTrackerCustomBackground_v1";
const MUSIC_KEY = "hoursTrackerBackgroundMusic_v1";
const MUSIC_SETTINGS_KEY = "hoursTrackerMusicSettings_v1";

const THEMES = {
  midnight: {
    id: "midnight", name: "Midnight", emoji: "Moon",
    appBg: "linear-gradient(180deg, #0F1117 0%, #1A1D29 100%)", headerBg: "rgba(12,14,20,0.96)", statsBg: "rgba(34,38,52,0.92)", cardBg: "rgba(255,255,255,0.08)", modalBg: "#151822", text: "#F7F5F2", headerText: "#F7F5F2", muted: "#9CA3AF", line: "rgba(255,255,255,0.12)", buttonBg: "#F7F5F2", buttonText: "#111827", shadow: "0 8px 30px rgba(0,0,0,0.25)", font: "Georgia, serif"
  },
  ice: {
    id: "ice", name: "Ice", emoji: "Ice",
    appBg: "linear-gradient(180deg, #EFF7FF 0%, #FFFFFF 100%)", headerBg: "#EAF4FF", statsBg: "rgba(255,255,255,0.9)", cardBg: "rgba(255,255,255,0.95)", modalBg: "#F7FBFF", text: "#172033", headerText: "#172033", muted: "#6B7280", line: "rgba(23,32,51,0.12)", buttonBg: "#172033", buttonText: "#FFFFFF", shadow: "0 8px 24px rgba(50,85,120,0.12)", font: "Georgia, serif"
  },
  construction: {
    id: "construction", name: "Construction", emoji: "Work",
    appBg: "linear-gradient(180deg, #2A241D 0%, #403323 100%)", headerBg: "#1F1A14", statsBg: "#2E261B", cardBg: "#FFF4D6", modalBg: "#FFF4D6", text: "#251A0D", headerText: "#FFE4A3", muted: "#9B7A47", line: "rgba(255,196,84,0.35)", buttonBg: "#FFC145", buttonText: "#1F1A14", shadow: "0 8px 24px rgba(0,0,0,0.25)", font: "Georgia, serif"
  },
  cyber: {
    id: "cyber", name: "Cyber", emoji: "Power",
    appBg: "radial-gradient(circle at top, #22234B 0%, #090A12 58%, #050509 100%)", headerBg: "rgba(5,5,12,0.96)", statsBg: "rgba(22,20,45,0.94)", cardBg: "rgba(15,16,35,0.92)", modalBg: "#0B0C1A", text: "#ECFEFF", headerText: "#ECFEFF", muted: "#8B9BB4", line: "rgba(103,232,249,0.2)", buttonBg: "#67E8F9", buttonText: "#060712", shadow: "0 0 28px rgba(103,232,249,0.12)", font: "Georgia, serif"
  },
  classic: {
    id: "classic", name: "Classic", emoji: "Book",
    appBg: "#F7F5F2", headerBg: "#1C1C1E", statsBg: "#FFFFFF", cardBg: "#FFFFFF", modalBg: "#F7F5F2", text: "#1C1C1E", headerText: "#F7F5F2", muted: "#4B5563", line: "rgba(0,0,0,0.12)", buttonBg: "#1C1C1E", buttonText: "#F7F5F2", shadow: "0 2px 10px rgba(0,0,0,0.10)", font: "Georgia, serif"
  },
  oled: {
    id: "oled", name: "OLED Black", emoji: "Black",
    appBg: "#000000", headerBg: "#000000", statsBg: "#0A0A0A", cardBg: "#111111", modalBg: "#050505", text: "#FFFFFF", headerText: "#FFFFFF", muted: "#8A8A8A", line: "rgba(255,255,255,0.12)", buttonBg: "#FFFFFF", buttonText: "#000000", shadow: "0 0 0 1px rgba(255,255,255,0.08)", font: "Georgia, serif"
  },
  custom: {
    id: "custom", name: "Custom", emoji: "Image",
    appBg: "linear-gradient(180deg, #1C1C1E 0%, #34343A 100%)", headerBg: "rgba(20,20,22,0.82)", statsBg: "rgba(25,25,28,0.78)", cardBg: "rgba(255,255,255,0.16)", modalBg: "rgba(247,245,242,0.96)", text: "#F7F5F2", headerText: "#F7F5F2", muted: "#C7C7CC", line: "rgba(255,255,255,0.18)", buttonBg: "#F7F5F2", buttonText: "#1C1C1E", shadow: "0 10px 36px rgba(0,0,0,0.32)", font: "Georgia, serif"
  }
};

function loadThemeId() {
  try { return localStorage.getItem(THEME_KEY) || "classic"; } catch { return "classic"; }
}
function loadCustomBackground() {
  try { return localStorage.getItem(CUSTOM_BG_KEY) || ""; } catch { return ""; }
}
function saveThemeId(themeId) {
  try { localStorage.setItem(THEME_KEY, themeId); } catch {}
}
function saveCustomBackground(bg) {
  try {
    if (bg) localStorage.setItem(CUSTOM_BG_KEY, bg);
    else localStorage.removeItem(CUSTOM_BG_KEY);
  } catch {}
}

function loadMusicData() {
  try { return localStorage.getItem(MUSIC_KEY) || ""; } catch { return ""; }
}
function saveMusicData(data) {
  try {
    if (data) localStorage.setItem(MUSIC_KEY, data);
    else localStorage.removeItem(MUSIC_KEY);
    return true;
  } catch {
    return false;
  }
}
function loadMusicSettings() {
  try {
    return JSON.parse(localStorage.getItem(MUSIC_SETTINGS_KEY)) || { volume: 0.35, fileName: "" };
  } catch {
    return { volume: 0.35, fileName: "" };
  }
}
function saveMusicSettings(settings) {
  try { localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function AnimatedMoney({ value, style, prefix = "$" }) {
  const numericValue = Number.parseFloat(value || 0) || 0;
  const [displayValue, setDisplayValue] = useState(numericValue);
  const previousValue = useRef(numericValue);

  useEffect(() => {
    const from = previousValue.current;
    const to = numericValue;
    const duration = 450;
    const start = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previousValue.current = to;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numericValue]);

  return <span style={style}>{prefix}{displayValue.toFixed(2)}</span>;
}


const POKEMON_ROMS = [
  { label: "Pokemon - Red Version (USA, Europe) (SGB Enhanced)", system: "GB", core: "gb", year: "1998", file: "Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb" },
  { label: "Pokemon - Blue Version (USA, Europe) (SGB Enhanced)", system: "GB", core: "gb", year: "1998", file: "Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb" },
  { label: "Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced)", system: "GB", core: "gb", year: "1999", file: "Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb" },
  { label: "Pokemon - Gold Version (USA, Europe) (SGB Enhanced) (GB Compatible)", system: "GBC", core: "gb", year: "2000", file: "Pokemon - Gold Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Pokemon - Silver Version (USA, Europe) (SGB Enhanced) (GB Compatible)", system: "GBC", core: "gb", year: "2000", file: "Pokemon - Silver Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Pokemon - Crystal Version (USA, Europe) (Rev 1)", system: "GBC", core: "gb", year: "2001", file: "Pokemon - Crystal Version (USA, Europe) (Rev 1).gbc" },
  { label: "Pokemon Trading Card Game (USA, Australia) (SGB Enhanced) (GB Compatible)", system: "GBC", core: "gb", year: "2000", file: "Pokemon Trading Card Game (USA, Australia) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Pokemon Puzzle Challenge (USA, Australia)", system: "GBC", core: "gb", year: "2000", file: "Pokemon Puzzle Challenge (USA, Australia).gbc" },
  { label: "Pokemon Jade Version - Special Pikachu Edition (USA) (Pirate)", system: "GBC", core: "gb", year: "2001", file: "Pokemon Jade Version - Special Pikachu Edition (USA) (Pirate).gbc" },
  { label: "Pokemon - Ruby Version (USA, Europe) (Rev 2)", system: "GBA", core: "gba", year: "2003", file: "Pokemon - Ruby Version (USA, Europe) (Rev 2).gba" },
  { label: "Pokemon - Sapphire Version (USA, Europe) (Rev 2)", system: "GBA", core: "gba", year: "2003", file: "Pokemon - Sapphire Version (USA, Europe) (Rev 2).gba" },
  { label: "Pokemon - FireRed Version (USA, Europe) (Rev 1)", system: "GBA", core: "gba", year: "2004", file: "Pokemon - FireRed Version (USA, Europe) (Rev 1).gba" },
  { label: "Pokemon - LeafGreen Version (USA, Europe) (Rev 1)", system: "GBA", core: "gba", year: "2004", file: "Pokemon - LeafGreen Version (USA, Europe) (Rev 1).gba" },
  { label: "Pokemon - Emerald Version (USA, Europe)", system: "GBA", core: "gba", year: "2005", file: "Pokemon - Emerald Version (USA, Europe).gba" },
  { label: "Pokemon Mystery Dungeon - Red Rescue Team (USA, Australia)", system: "GBA", core: "gba", year: "2006", file: "Pokemon Mystery Dungeon - Red Rescue Team (USA, Australia).gba" },
  { label: "Pokemon Pinball - Ruby & Sapphire (USA)", system: "GBA", core: "gba", year: "2003", file: "Pokemon Pinball - Ruby & Sapphire (USA).gba" },
  { label: "Pokemon - Aurora Ticket Distribution (USA) (Kiosk)", system: "GBA", core: "gba", year: "2004", file: "Pokemon - Aurora Ticket Distribution (USA) (Kiosk).gba" },
];

const SYSTEM_BACKGROUNDS = {
  GB: "sidequest-gb.png",
  GBC: "sidequest-gbc.png",
  GBA: "sidequest-gba.png",
  N64: "sidequest-gba.png",
  PS1: "sidequest-gba.png",
};
const GAME_SYSTEMS = ["GB", "GBC", "GBA", "N64", "PS1"];
const POKEMON_SYSTEM_ASPECTS = {
  GB: 160 / 144,
  GBC: 160 / 144,
  GBA: 240 / 160,
  N64: 4 / 3,
  PS1: 4 / 3
};
const POKEMON_STRETCH_DEFAULT_OPTIONS = {
  aspect_ratio_index: "1",
  video_force_aspect: "false",
  video_scale_integer: "false",
  video_aspect_ratio_auto: "false"
};
const POKEMON_N64_DEFAULT_OPTIONS = {
  video_scale_integer: "false",
  video_smooth: "false",
  "mupen64plus-cpucore": "dynamic_recompiler",
  "mupen64plus-rdp-plugin": "gliden64",
  "mupen64plus-rsp-plugin": "hle",
  "mupen64plus-MultiSampling": "0",
  "mupen64plus-FXAA": "0",
  "mupen64plus-EnableFBEmulation": "True",
  "mupen64plus-EnableCopyColorToRDRAM": "Async",
  "mupen64plus-EnableCopyDepthToRDRAM": "Software",
  "mupen64plus-EnableNativeResTexrects": "Disabled"
};
const POKEMON_MARIO_KART_64_DEFAULT_OPTIONS = {
  ...POKEMON_N64_DEFAULT_OPTIONS,
  "mupen64plus-rsp-plugin": "parallel",
  "mupen64plus-EnableLegacyBlending": "True",
  "mupen64plus-EnableFragmentDepthWrite": "True",
  "mupen64plus-BackgroundMode": "OnePiece",
  "mupen64plus-CorrectTexrectCoords": "Auto",
  "mupen64plus-FrameDuping": "False",
  "mupen64plus-Framerate": "Original",
  "mupen64plus-virefresh": "Auto"
};
const isN64Game = game => game?.system === "N64" || game?.core === "n64";
const isMarioKart64Game = game => isN64Game(game) && /mario\s*kart\s*64|mariokart64/i.test(
  [game?.label, game?.file, game?.gameUrl].filter(Boolean).join(" ")
);
const getPokemonN64DefaultOptions = game => (
  isMarioKart64Game(game) ? POKEMON_MARIO_KART_64_DEFAULT_OPTIONS : POKEMON_N64_DEFAULT_OPTIONS
);
const POKEMON_FULLSCREEN_ASPECT = 16 / 9;

function pokemonAssetPath(game, fileName) {
  if (game?.assetBaseUrl) return `${normalizePublicUrl(game.assetBaseUrl)}/${fileName}`;
  return `${process.env.PUBLIC_URL}/rom-images/${encodeURIComponent(game.label)}/${fileName}`;
}

const POKEMON_BACK_FILES = ["back.jpg", "back.png", "back.jpeg", "back.webp", "back.avif"];
const POKEMON_COVER_FILES = ["cover.jpg", "cover.png", "cover.jpeg", "cover.webp", "cover.avif", "front.jpg", "front.png", "front.jpeg", "front.webp", "front.avif"];
const POKEMON_MANUAL_FILES = ["manual.pdf", "manual.PDF"];

function normalizePublicUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url.replace(/^http:\/\/([^/]+\.trycloudflare\.com)/i, "https://$1");
}

function normalizePublicUrls(urls) {
  return Array.isArray(urls) ? urls.map(normalizePublicUrl).filter(Boolean) : undefined;
}

function formatSavedGameBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getSavedGameKey(system, gameFile = "") {
  return `${system || "GAME"}::${gameFile || ""}`;
}

function pokemonAssetOverride(game, keys) {
  const value = keys.map(key => game?.[key]).find(Boolean);
  if (!value || typeof value !== "string") return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return normalizePublicUrl(value);
  return pokemonAssetPath(game, value);
}

function pokemonAssetExists(url, type = "file") {
  if (!url) return Promise.resolve(false);

  if (type === "image") {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }

  return fetch(url, { method: "HEAD", cache: "no-store" })
    .then(response => response.ok)
    .catch(() => false);
}

async function findPokemonAsset(game, fileNames, type = "file") {
  if (!game) return "";

  const overrideUrl = type === "image"
    ? pokemonAssetOverride(game, ["backUrl", "backImageUrl", "backImage", "back"])
    : pokemonAssetOverride(game, ["manualUrl", "manualFile", "manual"]);
  if (overrideUrl && await pokemonAssetExists(overrideUrl, type)) return overrideUrl;

  for (const fileName of fileNames) {
    const url = pokemonAssetPath(game, fileName);
    if (await pokemonAssetExists(url, type)) return url;
  }

  return "";
}

function resetPokemonEmulator(playerElement) {
  const emulator = window.EJS_emulator;
  const shutdownTargets = [
    [emulator, "pause"],
    [emulator, "stop"],
    [emulator, "destroy"],
    [emulator, "exit"],
    [emulator?.gameManager, "pause"],
    [emulator?.gameManager, "stop"],
    [emulator?.gameManager, "destroy"],
    [emulator?.gameManager?.game, "pause"],
    [emulator?.gameManager?.game, "stop"],
    [emulator?.gameManager?.game, "destroy"]
  ];

  shutdownTargets.forEach(([target, method]) => {
    try {
      if (typeof target?.[method] === "function") target[method]();
    } catch {}
  });

  [
    emulator?.audioContext,
    emulator?.audio?.context,
    emulator?.gameManager?.audioContext,
    emulator?.gameManager?.audio?.context
  ].forEach(context => {
    try {
      if (context?.state !== "closed") {
        if (typeof context?.close === "function") context.close();
        else context?.suspend?.();
      }
    } catch {}
  });

  [
    emulator?.worker,
    emulator?.gameManager?.worker,
    emulator?.gameManager?.game?.worker
  ].forEach(worker => {
    try { worker?.terminate?.(); } catch {}
  });

  try {
    if (window.EJS_emulator?.destroy) window.EJS_emulator.destroy();
  } catch {}

  document.querySelectorAll("script[data-pokemon-emulator-loader='true']").forEach(script => script.remove());
  document.querySelectorAll("[id^='pokemon-game-player-']").forEach(element => {
    element.querySelectorAll("audio, video").forEach(media => {
      try {
        media.pause();
        media.removeAttribute("src");
        media.load?.();
      } catch {}
    });
    element.innerHTML = "";
    element.remove();
  });

  [
    "EJS_emulator",
    "EJS_player",
    "EJS_core",
    "EJS_gameName",
    "EJS_gameUrl",
    "EJS_pathtodata",
    "EJS_startOnLoaded",
    "EJS_backgroundColor",
    "EJS_color",
    "EJS_defaultControls",
    "EJS_defaultOptions",
    "EJS_disableLocalStorage",
    "EJS_threads",
    "EJS_controlScheme"
  ].forEach(key => {
    try { delete window[key]; } catch {}
  });

  if (playerElement) playerElement.innerHTML = "";
}

function PokemonCoverImage({ game, onZoom, compact = false, imageType = "cover" }) {
  const coverFiles = imageType === "back" ? POKEMON_BACK_FILES : POKEMON_COVER_FILES;
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [game.label, imageType]);

  const src = pokemonAssetPath(game, coverFiles[index]);
  const title = `${game.label} ${imageType === "back" ? "Back Cover" : "Cover"}`;

  if (failed) {
    return (
      <button
        type="button"
        disabled
        style={{
          width: compact ? "var(--flive-gaming-carousel-cover-width, 70px)" : "var(--flive-gaming-detail-cover-width, 92px)",
          height: compact ? "var(--flive-gaming-carousel-cover-height, 92px)" : "var(--flive-gaming-detail-cover-height, 126px)",
          borderRadius: 10,
          border: "2px dashed rgba(255,255,255,.28)",
          background: "rgba(255,255,255,.08)",
          color: "#cbd5e1",
          fontSize: 11,
          fontWeight: 900,
          padding: 8,
          textAlign: "center"
        }}
      >
        No {imageType === "back" ? "back cover" : "cover"} found
      </button>
    );
  }

  return (
    <img
      key={`${game.label}-${imageType}-${index}`}
      onClick={() => onZoom && onZoom({ src, title })}
      src={src}
      alt={title}
      onError={() => {
        if (index < coverFiles.length - 1) setIndex(i => i + 1);
        else setFailed(true);
      }}
      style={{
        width: compact ? "var(--flive-gaming-carousel-cover-width, 70px)" : "var(--flive-gaming-detail-cover-width, 92px)",
        height: compact ? "var(--flive-gaming-carousel-cover-height, 92px)" : "var(--flive-gaming-detail-cover-height, 126px)",
        objectFit: "cover",
        borderRadius: 10,
        border: "2px solid rgba(255,255,255,.25)",
        background: "rgba(255,255,255,.08)",
        cursor: "zoom-in",
        boxShadow: "0 8px 22px rgba(0,0,0,.35)"
      }}
    />
  );
}

function GamingCenterSecondPanel() {
  const areas = [
    {
      title: "Casino / Sportsbook",
      eyebrow: "Credits Area",
      lines: ["Prematch esports board", "USDC / USDT deposit review", "0.05% admin fee ledger"],
      active: true
    },
    {
      title: "Blank Area 2",
      eyebrow: "Ready",
      lines: ["Black blank slot", "Reserved for next panel", "Matches the row format"],
      active: false
    },
    {
      title: "Blank Area 3",
      eyebrow: "Ready",
      lines: ["Black blank slot", "Reserved for admin tools", "Matches the row format"],
      active: false
    }
  ];

  return (
    <section style={{
      width: "100%",
      boxSizing: "border-box",
      borderRadius: 14,
      border: "2px solid rgba(250,204,21,.24)",
      background: "linear-gradient(180deg, rgba(2,6,23,.96), rgba(2,6,23,.9))",
      boxShadow: "0 1px 4px rgba(0,0,0,0.16)",
      padding: 12,
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      pointerEvents: "auto"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "center",
        marginBottom: 10
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: 1.1, color: "#facc15", textTransform: "uppercase" }}>
            Casino Row
          </div>
          <div style={{ fontSize: 15, fontWeight: 1000, color: "#fff", marginTop: 2 }}>
            Casino / Sportsbook Expansion
          </div>
        </div>
        <div style={{
          borderRadius: 999,
          padding: "5px 8px",
          background: "rgba(34,197,94,.16)",
          border: "1px solid rgba(34,197,94,.35)",
          color: "#bbf7d0",
          fontSize: 10,
          fontWeight: 1000
        }}>
          3 AREAS
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
        overflow: "hidden",
        paddingBottom: 3
      }}>
        {areas.map(area => (
          <div key={area.title} style={{
            minHeight: 132,
            minWidth: 0,
            borderRadius: 14,
            padding: 8,
            background: area.active
              ? "linear-gradient(180deg, rgba(20,83,45,.96), rgba(2,6,23,.96))"
              : "#000",
            border: area.active ? "1px solid rgba(250,204,21,.42)" : "1px solid rgba(255,255,255,.12)",
            boxShadow: area.active ? "0 10px 28px rgba(0,0,0,.35)" : "inset 0 0 18px rgba(255,255,255,.04)"
          }}>
            <div style={{ fontSize: 9, fontWeight: 1000, color: area.active ? "#facc15" : "#64748b", letterSpacing: 1, textTransform: "uppercase" }}>
              {area.eyebrow}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, fontWeight: 1000, lineHeight: 1.15, color: area.active ? "#fff" : "#94a3b8" }}>
              {area.title}
            </div>
            <div style={{ display: "grid", gap: 4, marginTop: 9 }}>
              {area.lines.map(line => (
                <div key={line} style={{
                  borderRadius: 8,
                  padding: "5px 6px",
                  background: area.active ? "rgba(15,23,42,.68)" : "rgba(15,23,42,.35)",
                  color: area.active ? "#e2e8f0" : "#475569",
                  fontSize: 9,
                  fontWeight: 900,
                  lineHeight: 1.15
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PokemonSidebar({ loggedInUsername = "" } = {}) {
  const fuitsLiveTvChannelUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const [games, setGames] = useState(POKEMON_ROMS);
  const [activeSystem, setActiveSystem] = useState("GB");
  const [activeGame, setActiveGame] = useState(() => POKEMON_ROMS.find(game => game.system === "GB") || POKEMON_ROMS[0] || null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeGamingApp, setActiveGamingApp] = useState("gaming-center");
  const [gamingMenuOpen, setGamingMenuOpen] = useState(false);
  const [kickGamingChannelInput, setKickGamingChannelInput] = useState(() => {
    try { return localStorage.getItem(KICK_GAMING_CHANNEL_KEY) || "flivetv"; } catch { return "flivetv"; }
  });
  const [gameSearch, setGameSearch] = useState("");
  const [savedGames, setSavedGames] = useState({ loading: false, error: "", items: [] });
  const [savedGameOpenSections, setSavedGameOpenSections] = useState({ master: true });
  const [savedGameUpload, setSavedGameUpload] = useState({ system: "GB", gameFile: "", saveName: "" });
  const [savedGameUploadFile, setSavedGameUploadFile] = useState(null);
  const [savedGameUploadStatus, setSavedGameUploadStatus] = useState("");
  const [savedGameUploading, setSavedGameUploading] = useState(false);
  const [selectedArt, setSelectedArt] = useState("cover");
  const [zoomedCover, setZoomedCover] = useState(null);
  const [activeGameAssets, setActiveGameAssets] = useState({ manualUrl: "", backUrl: "" });
  const [gameLaunch, setGameLaunch] = useState(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState(0);
  const [stretchGame, setStretchGame] = useState(false);
  const [gameFullscreen, setGameFullscreen] = useState(false);
  const gamingStackRef = useRef(null);
  const emulatorFrameRef = useRef(null);
  const emulatorHostRef = useRef(null);
  const retroarchPlayerRef = useRef(null);
  const gameCarouselRef = useRef(null);
  const savedGameFileInputRef = useRef(null);
  const gameCardRefs = useRef({});
  const gamepadKeysRef = useRef(new Set());
  const emulatorMenuOpenAllowedUntilRef = useRef(0);
  const gamingScrollDragRef = useRef({
    active: false,
    dragging: false,
    touchId: null,
    startX: 0,
    startY: 0,
    lastY: 0,
    blockClickUntil: 0
  });
  const n64PerformanceMode = isN64Game(gameLaunch);
  const isInteractiveElement = (element) => {
    if (!element || element === document.body) return false;
    return Boolean(element.closest?.("select, input, textarea, button, [contenteditable='true']"));
  };

  const focusPokemonEmulator = ({ click = false } = {}) => {
    if (isInteractiveElement(document.activeElement)) return;

    const host = emulatorHostRef.current;
    const frame = emulatorFrameRef.current;
    const target =
      host?.querySelector("canvas") ||
      host?.querySelector(".ejs_canvas") ||
      host?.querySelector(".ejs_game") ||
      host ||
      frame;

    try { frame?.focus?.({ preventScroll: true }); } catch {}
    try { host?.focus?.({ preventScroll: true }); } catch {}
    try { target?.focus?.({ preventScroll: true }); } catch {}
    if (click) {
      try { target?.click?.(); } catch {}
    }
    try { window.EJS_emulator?.gameManager?.resume?.(); } catch {}
    try { window.EJS_emulator?.resume?.(); } catch {}
  };

  const getEventClientPoint = (event) => {
    const point = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    if (typeof point?.clientX !== "number" || typeof point?.clientY !== "number") return null;
    return { x: point.clientX, y: point.clientY };
  };

  const isMobileLandscapeGamingScrollEnabled = useCallback(() => {
    if (typeof window === "undefined") return false;

    const query = "(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px)";
    if (typeof window.matchMedia === "function") return window.matchMedia(query).matches;

    const touchPoints = typeof navigator === "undefined" ? 0 : Number(navigator.maxTouchPoints || 0);
    return touchPoints > 0 && window.innerWidth > window.innerHeight && window.innerWidth <= 1100 && window.innerHeight <= 560;
  }, []);

  const getEmulatorEventNow = () => (
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );

  const isVisibleElement = (element) => {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  };

  const getPokemonEmulatorMenuToggle = () => (
    window.EJS_emulator?.elements?.menuToggle ||
    emulatorHostRef.current?.querySelector(".ejs_virtualGamepad_open") ||
    null
  );

  const getPokemonEmulatorMenuBar = () => (
    window.EJS_emulator?.elements?.menu ||
    emulatorHostRef.current?.querySelector(".ejs_menu_bar") ||
    null
  );

  const isEventInsideElement = (event, element) => {
    if (!element) return false;

    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    if (path.some(node => node === element || (node?.nodeType && element.contains?.(node)))) return true;

    const point = getEventClientPoint(event);
    if (!point || !isVisibleElement(element)) return false;

    const rect = element.getBoundingClientRect();
    return (
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    );
  };

  const isPokemonEmulatorMenuGesture = (event) => {
    const host = emulatorHostRef.current;
    if (!host) return false;

    const menuToggle = getPokemonEmulatorMenuToggle();
    if (isVisibleElement(menuToggle) && isEventInsideElement(event, menuToggle)) return true;

    const menuBar = getPokemonEmulatorMenuBar();
    if (
      isVisibleElement(menuBar) &&
      !menuBar.classList?.contains("ejs_menu_bar_hidden") &&
      isEventInsideElement(event, menuBar)
    ) {
      return true;
    }

    const target = event?.target;
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    return path.concat(target || []).some(element => {
      if (!element || typeof element.closest !== "function") return false;
      return Boolean(element.closest(".ejs_settings_parent, .ejs_popup_container, .ejs_context_menu, .ejs_cheat_parent, .ejs_control_bar, .ejs_control_set_button"));
    });
  };

  const allowPokemonEmulatorMenuOpen = () => {
    emulatorMenuOpenAllowedUntilRef.current = getEmulatorEventNow() + 900;
    emulatorHostRef.current?.classList.add("pokemon-emulator-menu-user-open");
  };

  const lockPokemonEmulatorMenuOpen = () => {
    emulatorMenuOpenAllowedUntilRef.current = 0;
    emulatorHostRef.current?.classList.remove("pokemon-emulator-menu-user-open");
  };

  const closePokemonEmulatorMenu = () => {
    lockPokemonEmulatorMenuOpen();
    try { window.EJS_emulator?.menu?.close?.(); } catch {}
    try { window.EJS_emulator?.closePopup?.(); } catch {}
  };

  const patchPokemonEmulatorMenu = () => {
    const menu = window.EJS_emulator?.menu;
    if (!menu || typeof menu.open !== "function") return false;
    if (menu.__fuitHamburgerOnlyOpenVersion === 2) return true;

    const originalClose = typeof menu.close === "function" ? menu.close.bind(menu) : null;
    const originalOpen = menu.open.bind(menu);
    const originalToggle = typeof menu.toggle === "function" ? menu.toggle.bind(menu) : null;
    const isAllowed = () => getEmulatorEventNow() <= emulatorMenuOpenAllowedUntilRef.current;

    if (originalClose) {
      menu.close = (...args) => {
        lockPokemonEmulatorMenuOpen();
        return originalClose(...args);
      };
    }

    menu.open = (...args) => {
      if (!isAllowed()) {
        lockPokemonEmulatorMenuOpen();
        window.setTimeout(closePokemonEmulatorMenu, 0);
        return undefined;
      }

      emulatorHostRef.current?.classList.add("pokemon-emulator-menu-user-open");
      emulatorMenuOpenAllowedUntilRef.current = 0;
      return originalOpen(...args);
    };

    if (originalToggle) {
      menu.toggle = (...args) => {
        const menuBar = getPokemonEmulatorMenuBar();
        const opening = Boolean(menuBar?.classList?.contains("ejs_menu_bar_hidden"));
        if (opening && !isAllowed()) {
          lockPokemonEmulatorMenuOpen();
          window.setTimeout(closePokemonEmulatorMenu, 0);
          return undefined;
        }

        if (opening) emulatorHostRef.current?.classList.add("pokemon-emulator-menu-user-open");
        else lockPokemonEmulatorMenuOpen();
        emulatorMenuOpenAllowedUntilRef.current = 0;
        return originalToggle(...args);
      };
    }

    menu.__fuitHamburgerOnlyOpen = true;
    menu.__fuitHamburgerOnlyOpenVersion = 2;
    return true;
  };

  const stopRunningGame = () => {
    resetPokemonEmulator(emulatorHostRef.current);
    gamepadKeysRef.current.clear();
    setStretchGame(false);
    setGameFullscreen(false);
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document);
      }
    } catch {}
    setGameLaunch(null);
  };

  const startBrowserGame = (game) => {
    if (!game?.gameUrl && !game?.discUrls?.length) return;
    resetPokemonEmulator(emulatorHostRef.current);
    gamepadKeysRef.current.clear();
    setStretchGame(false);
    setGameFullscreen(false);
    setSelectedDiscIndex(0);
    setGameLaunch({ ...game, launchId: Date.now() });
  };

  const constrainPokemonEmulatorLayout = () => {
    const host = emulatorHostRef.current;
    if (!host) return;

    host.querySelectorAll(".ejs_parent, .ejs_game, .ejs_canvas_parent, .ejs_canvas, canvas").forEach(element => {
      element.style.maxWidth = "100%";
      element.style.maxHeight = "100%";
      element.style.minWidth = "0";
      element.style.minHeight = "0";
      if (element !== host.querySelector("canvas")) {
        element.style.overflow = "hidden";
      }
    });
  };

  const applyPokemonStretch = (shouldStretch, { resize = true } = {}) => {
    const host = emulatorHostRef.current;
    if (!host) return;

    const systemAspect = POKEMON_SYSTEM_ASPECTS[activeGame?.system];
    const scaleX = shouldStretch && systemAspect ? POKEMON_FULLSCREEN_ASPECT / systemAspect : 1;
    host.style.setProperty("--pokemon-stretch-scale-x", String(scaleX));
    host.classList.toggle("pokemon-emulator-stretch", shouldStretch);
    constrainPokemonEmulatorLayout();

    if (resize) {
      try {
        window.EJS_emulator?.resize?.();
        window.EJS_emulator?.gameManager?.resize?.();
      } catch {}
      constrainPokemonEmulatorLayout();
    }
  };

  const toggleGameFullscreen = () => {
    const frame = emulatorFrameRef.current;
    if (!gameFullscreen) {
      if (!stretchGame) setStretchGame(true);
      setGameFullscreen(true);
      const requestFullscreen =
        frame?.requestFullscreen ||
        frame?.webkitRequestFullscreen ||
        frame?.msRequestFullscreen;
      try { requestFullscreen?.call(frame); } catch {}
      return;
    }

    setGameFullscreen(false);
    const exitFullscreen =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        exitFullscreen?.call(document);
      }
    } catch {}
  };

  const toggleRetroarchFullscreen = () => {
    const player = retroarchPlayerRef.current;
    const fullscreenElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;

    if (fullscreenElement) {
      const exitFullscreen =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen;
      try { exitFullscreen?.call(document); } catch {}
      return;
    }

    const requestFullscreen =
      player?.requestFullscreen ||
      player?.webkitRequestFullscreen ||
      player?.msRequestFullscreen;
    try { requestFullscreen?.call(player); } catch {}
  };

  const systemGames = games.filter(game => game.system === activeSystem);
  const gameSearchQuery = gameSearch.trim().toLowerCase();
  const filteredSystemGames = gameSearchQuery
    ? systemGames.filter(game =>
        [game.label, game.system, game.year, game.file]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(gameSearchQuery))
      )
    : systemGames;
  const carouselGames = filteredSystemGames;
  const activeGameIndex = activeGame ? Math.max(0, carouselGames.findIndex(game => game.file === activeGame.file)) : 0;
  const savedGameItems = Array.isArray(savedGames.items) ? savedGames.items : [];
  const savedGameUploadGames = games.filter(game => game.system === savedGameUpload.system);
  const selectedSavedGameUploadGame = savedGameUploadGames.find(game => game.file === savedGameUpload.gameFile) || savedGameUploadGames[0] || null;
  const savedGameSystems = GAME_SYSTEMS.map(system => {
    const knownGames = games.filter(game => game.system === system);
    const knownKeys = new Set(knownGames.map(game => getSavedGameKey(game.system, game.file)));
    const saveOnlyGames = savedGameItems
      .filter(save => save.system === system && !knownKeys.has(getSavedGameKey(save.system, save.gameFile)))
      .map(save => ({
        system: save.system,
        file: save.gameFile || save.gameLabel,
        label: save.gameLabel || save.gameFile || "Saved Game"
      }));
    const gamesForSystem = [...knownGames, ...saveOnlyGames]
      .map(game => ({
        ...game,
        saves: savedGameItems.filter(save => save.system === game.system && save.gameFile === game.file)
      }))
      .filter(game => game.saves.length);
    return {
      system,
      games: gamesForSystem,
      count: gamesForSystem.reduce((sum, game) => sum + game.saves.length, 0)
    };
  }).filter(group => group.count > 0);
  const backgroundImage = SYSTEM_BACKGROUNDS[activeSystem] || SYSTEM_BACKGROUNDS.GB;
  const kickGamingChannel = normalizeKickChannel(kickGamingChannelInput) || "flivetv";
  const kickGamingEmbedUrl = `https://player.kick.com/${encodeURIComponent(kickGamingChannel)}?autoplay=true&muted=true`;
  const kickGamingChatUrl = `https://kick.com/popout/${encodeURIComponent(kickGamingChannel)}/chat`;

  const loadSavedGames = useCallback(async () => {
    if (!fuitsLiveTvChannelUrl) {
      setSavedGames({ loading: false, error: "FUITS Live TV URL is not set yet.", items: [] });
      return;
    }

    setSavedGames(current => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`${fuitsLiveTvChannelUrl}/saved-games.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("Saved games are not available yet.");
      const data = await response.json();
      setSavedGames({ loading: false, error: "", items: Array.isArray(data) ? data : [] });
    } catch (error) {
      setSavedGames({ loading: false, error: error.message || "Could not load saved games.", items: [] });
    }
  }, [fuitsLiveTvChannelUrl]);

  const toggleSavedGameSection = key => {
    setSavedGameOpenSections(current => ({ ...current, [key]: !current[key] }));
  };

  const uploadSavedGame = async event => {
    event.preventDefault();
    if (!fuitsLiveTvChannelUrl) {
      setSavedGameUploadStatus("FUITS Live TV URL is not set yet.");
      return;
    }
    if (!loggedInUsername) {
      setSavedGameUploadStatus("Sign in before uploading a save.");
      return;
    }
    if (!selectedSavedGameUploadGame) {
      setSavedGameUploadStatus("Choose a game first.");
      return;
    }
    if (!savedGameUploadFile) {
      setSavedGameUploadStatus("Choose a save file first.");
      return;
    }

    const formData = new FormData();
    formData.append("username", loggedInUsername);
    formData.append("system", selectedSavedGameUploadGame.system);
    formData.append("gameFile", selectedSavedGameUploadGame.file);
    formData.append("gameLabel", selectedSavedGameUploadGame.label);
    formData.append("saveName", savedGameUpload.saveName || savedGameUploadFile.name);
    formData.append("saveFile", savedGameUploadFile);

    setSavedGameUploading(true);
    setSavedGameUploadStatus("Uploading save...");
    try {
      const response = await fetch(`${fuitsLiveTvChannelUrl}/saved-games/upload`, {
        method: "POST",
        body: formData
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Upload failed.");
      setSavedGameUpload(current => ({ ...current, saveName: "" }));
      setSavedGameUploadFile(null);
      if (savedGameFileInputRef.current) savedGameFileInputRef.current.value = "";
      setSavedGameUploadStatus("Save uploaded.");
      await loadSavedGames();
    } catch (error) {
      setSavedGameUploadStatus(error.message || "Could not upload that save.");
    } finally {
      setSavedGameUploading(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem(KICK_GAMING_CHANNEL_KEY, kickGamingChannel); } catch {}
  }, [kickGamingChannel]);

  useEffect(() => {
    if (activeGamingApp !== "saved-games") return;
    loadSavedGames();
  }, [activeGamingApp, loadSavedGames]);

  useEffect(() => {
    if (savedGameUploadGames.some(game => game.file === savedGameUpload.gameFile)) return;
    const nextGame = savedGameUploadGames[0] || games[0] || null;
    if (!nextGame) return;
    setSavedGameUpload(current => ({
      ...current,
      system: nextGame.system,
      gameFile: nextGame.file
    }));
  }, [games, savedGameUpload.gameFile, savedGameUploadGames, savedGameUpload.system]);

  useEffect(() => {
    const carousel = gameCarouselRef.current;
    const selectedCard = activeGame ? gameCardRefs.current[activeGame.file] : null;
    if (!carousel || !selectedCard) return;

    selectedCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [activeGame?.file, activeSystem]);

  useEffect(() => {
    let cancelled = false;
    const loadGames = async () => {
      const applyGames = (nextGames) => {
        if (cancelled || !Array.isArray(nextGames) || !nextGames.length) return;
        setGames(nextGames);
        setActiveGame(current => {
          const currentStillExists = current && nextGames.find(game => game.file === current.file && game.system === current.system);
          if (currentStillExists) return currentStillExists;
          return nextGames.find(game => game.system === activeSystem) || nextGames[0] || current;
        });
      };

      applyGames(POKEMON_ROMS);

      if (!fuitsLiveTvChannelUrl) return;

      try {
        const response = await fetch(`${fuitsLiveTvChannelUrl}/games.json`, { cache: "no-store" });
        const serverGames = await response.json();
        if (!cancelled && Array.isArray(serverGames) && serverGames.length) {
          const merged = serverGames.map(game => {
            const known = POKEMON_ROMS.find(item => item.file === game.file || item.label === game.label);
            const normalizedGame = {
              ...game,
              gameUrl: normalizePublicUrl(game.gameUrl),
              assetBaseUrl: normalizePublicUrl(game.assetBaseUrl),
              discUrls: normalizePublicUrls(game.discUrls)
            };
            return known ? { ...known, ...normalizedGame, year: known.year || game.year } : normalizedGame;
          });
          applyGames(merged);
        }
      } catch {}
    };

    loadGames();
  }, [activeSystem, fuitsLiveTvChannelUrl]);

  useEffect(() => {
    let cancelled = false;
    setActiveGameAssets({ manualUrl: "", backUrl: "" });

    if (!activeGame) return () => { cancelled = true; };

    const loadAssets = async () => {
      const [manualUrl, backUrl] = await Promise.all([
        findPokemonAsset(activeGame, POKEMON_MANUAL_FILES),
        findPokemonAsset(activeGame, POKEMON_BACK_FILES, "image")
      ]);

      if (!cancelled) setActiveGameAssets({ manualUrl, backUrl });
    };

    loadAssets();
    return () => { cancelled = true; };
  }, [activeGame]);

  useEffect(() => {
    if (selectedArt === "back" && !activeGameAssets.backUrl) {
      setSelectedArt("cover");
    }
  }, [activeGameAssets.backUrl, selectedArt]);

  useEffect(() => {
    document.body.classList.toggle("fuit-n64-performance-mode", n64PerformanceMode);
    return () => document.body.classList.remove("fuit-n64-performance-mode");
  }, [n64PerformanceMode]);

  const moveCarousel = (direction) => {
    if (!carouselGames.length) return;
    const nextIndex = (activeGameIndex + direction + carouselGames.length) % carouselGames.length;
    stopRunningGame();
    setActiveGame(carouselGames[nextIndex]);
    setSelectedArt("cover");
    setSelectedDiscIndex(0);
  };

  const chooseCarouselGame = (game) => {
    stopRunningGame();
    setActiveGame(game);
    setSelectedArt("cover");
    setSelectedDiscIndex(0);
  };

  const handleSystemChange = (nextSystem) => {
    const firstGame = games.find(game => game.system === nextSystem) || null;
    stopRunningGame();
    setActiveSystem(nextSystem);
    setActiveGame(firstGame);
    setSelectedArt("cover");
    setSelectedDiscIndex(0);
  };

  const handleGameChange = (gameFile) => {
    const next = games.find(g => g.file === gameFile) || systemGames[0] || games[0] || null;
    stopRunningGame();
    setActiveGame(next);
    setSelectedArt("cover");
    setSelectedDiscIndex(0);
  };

  useEffect(() => {
    if (!gameLaunch) {
      resetPokemonEmulator();
      setStretchGame(false);
      setGameFullscreen(false);
      return;
    }
    if (collapsed || !emulatorHostRef.current) return;

    resetPokemonEmulator(emulatorHostRef.current);

    const playerId = `pokemon-game-player-${gameLaunch.core}-${Date.now()}`;
    const mount = document.createElement("div");
    mount.id = playerId;
    mount.style.width = "100%";
    mount.style.height = "100%";
    emulatorHostRef.current.appendChild(mount);

    window.EJS_player = `#${playerId}`;
    window.EJS_core = gameLaunch.core;
    window.EJS_gameName = gameLaunch.label;
    window.EJS_gameUrl = gameLaunch.core === "psx" && gameLaunch.discUrls?.length
      ? gameLaunch.discUrls[Math.min(selectedDiscIndex, gameLaunch.discUrls.length - 1)]
      : gameLaunch.gameUrl;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = true;
    window.EJS_backgroundColor = "#111827";
    window.EJS_color = "#38bdf8";
    const n64Launch = isN64Game(gameLaunch);
    const marioKart64Launch = isMarioKart64Game(gameLaunch);
    window.EJS_defaultOptions = {
      ...(stretchGame ? POKEMON_STRETCH_DEFAULT_OPTIONS : {}),
      ...(n64Launch ? getPokemonN64DefaultOptions(gameLaunch) : {})
    };
    window.EJS_disableLocalStorage = stretchGame || marioKart64Launch;
    if (n64Launch && typeof window.SharedArrayBuffer === "function") {
      window.EJS_threads = true;
    }
    const makeN64ControllerControls = (keys = {}) => ({
      0: { value: keys[0] || "", value2: "BUTTON_1" },
      1: { value: keys[1] || "", value2: "BUTTON_2" },
      2: { value: keys[2] || "", value2: "SELECT" },
      3: { value: keys[3] || "", value2: "START" },
      4: { value: keys[4] || "", value2: "DPAD_UP" },
      5: { value: keys[5] || "", value2: "DPAD_DOWN" },
      6: { value: keys[6] || "", value2: "DPAD_LEFT" },
      7: { value: keys[7] || "", value2: "DPAD_RIGHT" },
      8: { value: keys[8] || "", value2: "BUTTON_3" },
      9: { value: keys[9] || "", value2: "BUTTON_4" },
      10: { value: keys[10] || "", value2: "LEFT_TOP_SHOULDER" },
      11: { value: keys[11] || "", value2: "RIGHT_TOP_SHOULDER" },
      12: { value: keys[12] || "", value2: "LEFT_BOTTOM_SHOULDER" },
      13: { value: keys[13] || "", value2: "RIGHT_BOTTOM_SHOULDER" },
      14: { value: keys[14] || "", value2: "LEFT_STICK" },
      15: { value: keys[15] || "", value2: "RIGHT_STICK" },
      16: { value: keys[16] || "", value2: "LEFT_STICK_X:+1" },
      17: { value: keys[17] || "", value2: "LEFT_STICK_X:-1" },
      18: { value: keys[18] || "", value2: "LEFT_STICK_Y:+1" },
      19: { value: keys[19] || "", value2: "LEFT_STICK_Y:-1" },
      20: { value: keys[20] || "", value2: "RIGHT_STICK_X:+1" },
      21: { value: keys[21] || "", value2: "RIGHT_STICK_X:-1" },
      22: { value: keys[22] || "", value2: "RIGHT_STICK_Y:+1" },
      23: { value: keys[23] || "", value2: "RIGHT_STICK_Y:-1" }
    });
    window.EJS_defaultControls = {
      0: {
        ...makeN64ControllerControls({
          0: "x",
          1: "s",
          2: "v",
          3: "enter",
          4: "up arrow",
          5: "down arrow",
          6: "left arrow",
          7: "right arrow",
          8: "z",
          9: "a",
          10: "q",
          11: "e",
          12: "tab",
          13: "r",
          16: "h",
          17: "f",
          18: "g",
          19: "t",
          20: "l",
          21: "j",
          22: "k",
          23: "i"
        }),
        24: { value: "1" },
        25: { value: "2" },
        26: { value: "3" },
        27: { value: "add" },
        28: { value: "space" },
        29: { value: "subtract" }
      },
      1: makeN64ControllerControls({
        0: "u",
        1: "o",
        2: "b",
        3: "n",
        4: "w",
        5: "c",
        6: "d",
        7: "m",
        8: "y",
        9: "p"
      }),
      2: makeN64ControllerControls(),
      3: makeN64ControllerControls()
    };

    const previousEjsReady = window.EJS_ready;
    window.EJS_ready = (...args) => {
      try { previousEjsReady?.(...args); } catch {}
      patchPokemonEmulatorMenu();
      closePokemonEmulatorMenu();
    };

    const script = document.createElement("script");
    script.src = `https://cdn.emulatorjs.org/stable/data/loader.js?v=${Date.now()}`;
    script.async = true;
    script.dataset.pokemonEmulatorLoader = "true";
    document.body.appendChild(script);
    emulatorMenuOpenAllowedUntilRef.current = 0;
    let menuGuardPatched = false;
    const menuGuard = () => {
      if (menuGuardPatched) return;
      if (!patchPokemonEmulatorMenu()) return;
      menuGuardPatched = true;
      closePokemonEmulatorMenu();
      window.clearInterval(menuGuardInterval);
    };
    const menuGuardInterval = window.setInterval(menuGuard, 80);
    const menuGuardStopTimer = window.setTimeout(() => window.clearInterval(menuGuardInterval), 30000);
    menuGuard();
    focusPokemonEmulator();

    const focusTimers = (n64Launch ? [250] : [150, 400, 900, 1600, 2600]).map(delay =>
      window.setTimeout(() => focusPokemonEmulator(), delay)
    );

    return () => {
      if (previousEjsReady) window.EJS_ready = previousEjsReady;
      else {
        try { delete window.EJS_ready; } catch {}
      }
      window.clearInterval(menuGuardInterval);
      window.clearTimeout(menuGuardStopTimer);
      focusTimers.forEach(timer => window.clearTimeout(timer));
      resetPokemonEmulator(emulatorHostRef.current);
    };
  }, [activeGamingApp, gameLaunch?.core, gameLaunch?.discUrls?.join("|"), gameLaunch?.file, gameLaunch?.gameUrl, gameLaunch?.label, gameLaunch?.launchId, selectedDiscIndex, collapsed]);

  useEffect(() => {
    if (!gameLaunch || collapsed || !emulatorHostRef.current) return undefined;

    const host = emulatorHostRef.current;
    const handleMenuGesture = (event) => {
      if (isPokemonEmulatorMenuGesture(event)) {
        allowPokemonEmulatorMenuOpen();
        return;
      }

      lockPokemonEmulatorMenuOpen();
      window.setTimeout(closePokemonEmulatorMenu, 0);
    };
    const handleSurfaceClick = (event) => {
      patchPokemonEmulatorMenu();
      if (isPokemonEmulatorMenuGesture(event)) {
        allowPokemonEmulatorMenuOpen();
        return;
      }

      lockPokemonEmulatorMenuOpen();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      window.setTimeout(closePokemonEmulatorMenu, 0);
    };

    host.addEventListener("pointerdown", handleMenuGesture, true);
    host.addEventListener("mousedown", handleMenuGesture, true);
    host.addEventListener("touchstart", handleMenuGesture, true);
    host.addEventListener("click", handleSurfaceClick, true);

    return () => {
      host.removeEventListener("pointerdown", handleMenuGesture, true);
      host.removeEventListener("mousedown", handleMenuGesture, true);
      host.removeEventListener("touchstart", handleMenuGesture, true);
      host.removeEventListener("click", handleSurfaceClick, true);
    };
  }, [gameLaunch, collapsed]);

  useEffect(() => {
    if (!gameLaunch || collapsed) return;

    const keyMap = {
      z: { key: "z", code: "KeyZ", keyCode: 90 },
      x: { key: "x", code: "KeyX", keyCode: 88 },
      a: { key: "a", code: "KeyA", keyCode: 65 },
      s: { key: "s", code: "KeyS", keyCode: 83 },
      q: { key: "q", code: "KeyQ", keyCode: 81 },
      e: { key: "e", code: "KeyE", keyCode: 69 },
      f: { key: "f", code: "KeyF", keyCode: 70 },
      g: { key: "g", code: "KeyG", keyCode: 71 },
      h: { key: "h", code: "KeyH", keyCode: 72 },
      t: { key: "t", code: "KeyT", keyCode: 84 },
      i: { key: "i", code: "KeyI", keyCode: 73 },
      j: { key: "j", code: "KeyJ", keyCode: 74 },
      k: { key: "k", code: "KeyK", keyCode: 75 },
      l: { key: "l", code: "KeyL", keyCode: 76 },
      r: { key: "r", code: "KeyR", keyCode: 82 },
      v: { key: "v", code: "KeyV", keyCode: 86 },
      tab: { key: "Tab", code: "Tab", keyCode: 9 },
      enter: { key: "Enter", code: "Enter", keyCode: 13 },
      up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
      down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
      left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
      right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 }
    };

    const buttonToKey = {
      0: "z",
      1: "x",
      2: "a",
      3: "s",
      4: "q",
      5: "e",
      6: "tab",
      7: "r",
      8: "v",
      9: "enter",
      12: "up",
      13: "down",
      14: "left",
      15: "right"
    };
    const buttonEntries = Object.entries(buttonToKey);
    const getFirstGamepad = () => {
      const pads = navigator.getGamepads?.();
      if (!pads) return null;
      for (let index = 0; index < pads.length; index += 1) {
        if (pads[index]) return pads[index];
      }
      return null;
    };

    const dispatchGameKey = (keyName, type) => {
      const mapped = keyMap[keyName];
      if (!mapped) return;

      const canvas = emulatorHostRef.current?.querySelector("canvas");
      const targets = [canvas || document.activeElement || document.body, document, window];
      targets.forEach(target => {
        const event = new KeyboardEvent(type, {
          key: mapped.key,
          code: mapped.code,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, "keyCode", { get: () => mapped.keyCode });
        Object.defineProperty(event, "which", { get: () => mapped.keyCode });
        target.dispatchEvent(event);
      });
    };

    const setGameKey = (keyName, pressed) => {
      const activeKeys = gamepadKeysRef.current;
      if (pressed && !activeKeys.has(keyName)) {
        activeKeys.add(keyName);
        dispatchGameKey(keyName, "keydown");
      } else if (!pressed && activeKeys.has(keyName)) {
        activeKeys.delete(keyName);
        dispatchGameKey(keyName, "keyup");
      }
    };

    const releaseAllKeys = () => {
      Array.from(gamepadKeysRef.current).forEach(keyName => setGameKey(keyName, false));
    };

    let gamepadTimer = 0;
    let gamepadScheduleType = "timeout";
    let lastGamepadFocus = 0;
    let lastGamepadInputSnapshot = "";
    const n64Launch = isN64Game(gameLaunch);
    const n64IdlePollDelay = 900;
    const n64ActivePollDelay = 50;
    const axisButtonSnapshot = (value, threshold) => {
      const amount = Number(value || 0);
      if (amount < -threshold) return "n";
      if (amount > threshold) return "p";
      return "0";
    };
    const makeGamepadInputSnapshot = (pad) => {
      const buttonSnapshot = buttonEntries
        .map(([index]) => (pad.buttons[Number(index)]?.pressed ? "1" : "0"))
        .join("");
      const axes = n64Launch
        ? [
            axisButtonSnapshot(pad.axes[0], 0.35),
            axisButtonSnapshot(pad.axes[1], 0.35),
            axisButtonSnapshot(pad.axes[2], 0.45),
            axisButtonSnapshot(pad.axes[3], 0.45)
          ]
        : [
            axisButtonSnapshot(pad.axes[0], 0.45),
            axisButtonSnapshot(pad.axes[1], 0.45)
          ];
      return `${buttonSnapshot}|${axes.join("")}`;
    };
    const scheduleGamepadPoll = (hasPad = false) => {
      if (n64Launch) {
        gamepadScheduleType = "timeout";
        gamepadTimer = window.setTimeout(pollGamepads, hasPad ? n64ActivePollDelay : n64IdlePollDelay);
      } else {
        gamepadScheduleType = "raf";
        gamepadTimer = window.requestAnimationFrame(pollGamepads);
      }
    };
    const pollGamepads = () => {
      const pad = getFirstGamepad();

      if (!pad) {
        lastGamepadInputSnapshot = "";
        releaseAllKeys();
        scheduleGamepadPoll(false);
        return;
      }

      const now = performance.now();
      if (!n64Launch && now - lastGamepadFocus > 1000) {
        lastGamepadFocus = now;
        focusPokemonEmulator();
      }
      const inputSnapshot = makeGamepadInputSnapshot(pad);
      if (inputSnapshot === lastGamepadInputSnapshot) {
        scheduleGamepadPoll(true);
        return;
      }
      lastGamepadInputSnapshot = inputSnapshot;

      buttonEntries.forEach(([index, keyName]) => {
        setGameKey(keyName, Boolean(pad.buttons[Number(index)]?.pressed));
      });

      const xAxis = pad.axes[0] || 0;
      const yAxis = pad.axes[1] || 0;
      if (n64Launch) {
        setGameKey("f", xAxis < -0.35);
        setGameKey("h", xAxis > 0.35);
        setGameKey("t", yAxis < -0.35);
        setGameKey("g", yAxis > 0.35);
        const rightXAxis = pad.axes[2] || 0;
        const rightYAxis = pad.axes[3] || 0;
        setGameKey("j", rightXAxis < -0.45);
        setGameKey("l", rightXAxis > 0.45);
        setGameKey("i", rightYAxis < -0.45);
        setGameKey("k", rightYAxis > 0.45);
      } else {
        setGameKey("left", xAxis < -0.45);
        setGameKey("right", xAxis > 0.45);
        setGameKey("up", yAxis < -0.45);
        setGameKey("down", yAxis > 0.45);
      }

      scheduleGamepadPoll(true);
    };

    const handleGamepadConnected = () => {
      if (gamepadScheduleType === "timeout") window.clearTimeout(gamepadTimer);
      else window.cancelAnimationFrame(gamepadTimer);
      lastGamepadInputSnapshot = "";
      focusPokemonEmulator();
      scheduleGamepadPoll(true);
    };

    scheduleGamepadPoll(Boolean(getFirstGamepad()));
    window.addEventListener("gamepadconnected", handleGamepadConnected);

    return () => {
      if (gamepadScheduleType === "timeout") window.clearTimeout(gamepadTimer);
      else window.cancelAnimationFrame(gamepadTimer);
      window.removeEventListener("gamepadconnected", handleGamepadConnected);
      releaseAllKeys();
    };
  }, [gameLaunch, collapsed]);

  useEffect(() => {
    if (!gameLaunch) return;

    applyPokemonStretch(stretchGame, { resize: false });
    const settleDelay = isN64Game(gameLaunch) ? 650 : 450;
    const settleTimeout = window.setTimeout(() => applyPokemonStretch(stretchGame), settleDelay);
    const finalClampTimeout = window.setTimeout(
      () => applyPokemonStretch(stretchGame, { resize: false }),
      settleDelay + 600
    );

    return () => {
      window.clearTimeout(settleTimeout);
      window.clearTimeout(finalClampTimeout);
    };
  }, [gameLaunch, stretchGame]);

  useEffect(() => {
    const stack = gamingStackRef.current;
    if (!stack) return undefined;

    const drag = gamingScrollDragRef.current;
    const canDragScroll = () => (
      !collapsed &&
      isMobileLandscapeGamingScrollEnabled() &&
      stack.scrollHeight > stack.clientHeight + 1
    );
    const resetDrag = () => {
      drag.active = false;
      drag.dragging = false;
      drag.touchId = null;
    };
    const getTrackedTouch = (event) => {
      const touches = Array.from(event.touches || []);
      const changedTouches = Array.from(event.changedTouches || []);
      const touch = drag.touchId == null
        ? touches[0] || changedTouches[0]
        : touches.find(item => item.identifier === drag.touchId) ||
          changedTouches.find(item => item.identifier === drag.touchId);

      if (!touch) return null;
      return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    };
    const handleTouchStart = (event) => {
      if (!canDragScroll()) return;

      const touch = event.touches?.[0];
      if (!touch) return;

      drag.active = true;
      drag.dragging = false;
      drag.touchId = touch.identifier;
      drag.startX = touch.clientX;
      drag.startY = touch.clientY;
      drag.lastY = touch.clientY;
    };
    const handleTouchMove = (event) => {
      if (!drag.active || !canDragScroll()) return;

      const point = getTrackedTouch(event);
      if (!point) return;

      const deltaX = point.x - drag.startX;
      const deltaY = point.y - drag.startY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (!drag.dragging) {
        if (absoluteX < 6 && absoluteY < 6) return;
        if (absoluteY <= absoluteX) return;
        drag.dragging = true;
      }

      stack.scrollTop -= point.y - drag.lastY;
      drag.lastY = point.y;

      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    const handleTouchEnd = () => {
      if (drag.dragging) drag.blockClickUntil = Date.now() + 450;
      resetDrag();
    };
    const handleClick = (event) => {
      if (Date.now() > drag.blockClickUntil) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const passiveCaptureOptions = { capture: true, passive: true };
    const activeCaptureOptions = { capture: true, passive: false };

    stack.addEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
    stack.addEventListener("touchmove", handleTouchMove, activeCaptureOptions);
    stack.addEventListener("touchend", handleTouchEnd, passiveCaptureOptions);
    stack.addEventListener("touchcancel", handleTouchEnd, passiveCaptureOptions);
    stack.addEventListener("click", handleClick, true);

    return () => {
      stack.removeEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
      stack.removeEventListener("touchmove", handleTouchMove, activeCaptureOptions);
      stack.removeEventListener("touchend", handleTouchEnd, passiveCaptureOptions);
      stack.removeEventListener("touchcancel", handleTouchEnd, passiveCaptureOptions);
      stack.removeEventListener("click", handleClick, true);
    };
  }, [collapsed, isMobileLandscapeGamingScrollEnabled]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;

      if (!fullscreenElement && gameFullscreen) setGameFullscreen(false);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [gameFullscreen]);

  return (
    <div ref={gamingStackRef} className={`pokemon-desktop-stack${n64PerformanceMode ? " pokemon-n64-performance" : ""}`} style={{
      position: "fixed",
      left: "calc(18px * var(--flive-scale, 1))",
      top: "calc(4px * var(--flive-scale, 1))",
      bottom: "calc(8px * var(--flive-scale, 1))",
      width: collapsed ? "calc(72px * var(--flive-gaming-scale, var(--flive-scale, 1)))" : "calc(390px * var(--flive-gaming-scale, var(--flive-scale, 1)))",
      zIndex: 4,
      display: "flex",
      flexDirection: "column",
      gap: "calc(10px * var(--flive-gaming-scale, var(--flive-scale, 1)))",
      paddingBottom: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
      overflowY: collapsed ? "hidden" : "auto",
      pointerEvents: "none",
      transition: n64PerformanceMode ? "none" : "width .25s ease"
    }}>
    <aside className="pokemon-desktop-sidebar" style={{
      width: "100%",
      flex: "0 0 auto",
      borderRadius: "calc(24px * var(--flive-gaming-scale, var(--flive-scale, 1)))",
      border: "2px solid rgba(255,255,255,0.22)",
      background: n64PerformanceMode ? "rgba(2,6,23,.96)" : `linear-gradient(rgba(2,6,23,0.62), rgba(2,6,23,0.82)), url(${process.env.PUBLIC_URL}/${backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      boxShadow: n64PerformanceMode ? "none" : "0 18px 60px rgba(0,0,0,0.55)",
      padding: "calc(12px * var(--flive-gaming-scale, var(--flive-scale, 1)))",
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      transition: n64PerformanceMode ? "none" : "width .25s ease, padding .25s ease",
      overflow: "hidden",
      pointerEvents: "auto"
    }}>
      <style>{`
        @media (max-width: 1350px) and (max-height: 760px) {
          .pokemon-desktop-sidebar > :not(style) {
            zoom: var(--flive-gaming-content-scale, var(--flive-panel-content-scale, 1));
          }
        }
        @media (hover: hover) and (pointer: fine) and (max-width: 1400px) and (max-height: 790px),
          (hover: hover) and (pointer: fine) and (min-device-width: 900px) and (max-device-height: 820px) {
          .pokemon-desktop-stack {
            bottom: auto !important;
            --flive-gaming-stack-base-height: calc(
              (846px * var(--flive-scale, 1) * var(--flive-menu-gap-scale, 1)) +
              (var(--flive-menu-top-offset, 0px) * var(--flive-scale, 1)) +
              (var(--flive-wealth-extra-top-offset, 0px) * var(--flive-scale, 1)) +
              (46.2px * var(--flive-menu-text-scale, var(--flive-scale, 1)))
            );
            --flive-gaming-stack-target-height: calc(var(--flive-gaming-stack-base-height) * var(--flive-gaming-stack-height-scale, 1));
            height: var(--flive-gaming-stack-target-height) !important;
            height: min(var(--flive-gaming-stack-target-height), calc(100vh - (12px * var(--flive-scale, 1)))) !important;
            height: min(var(--flive-gaming-stack-target-height), calc(100dvh - (12px * var(--flive-scale, 1)))) !important;
            max-height: calc(100vh - (12px * var(--flive-scale, 1))) !important;
            max-height: calc(100dvh - (12px * var(--flive-scale, 1))) !important;
            overflow-y: hidden !important;
          }
          .pokemon-desktop-sidebar {
            height: 100% !important;
            max-height: 100% !important;
          }
          .pokemon-desktop-sidebar > :not(style) {
            zoom: var(--flive-gaming-content-scale, var(--flive-panel-content-scale, 1));
          }
        }
        .pokemon-desktop-stack { scrollbar-width: none; -ms-overflow-style: none; }
        .pokemon-desktop-stack::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .pokemon-desktop-sidebar button:hover { transform: translateY(-1px); }
        .pokemon-desktop-stack.pokemon-n64-performance,
        .pokemon-desktop-stack.pokemon-n64-performance * {
          transition: none !important;
        }
        .pokemon-desktop-stack.pokemon-n64-performance .pokemon-desktop-sidebar button:hover {
          transform: none !important;
        }
        body.fuit-n64-performance-mode .flive-center-shell {
          background-attachment: scroll !important;
          transition: none !important;
        }
        .game-cover-carousel { scrollbar-width: none; -ms-overflow-style: none; }
        .game-cover-carousel::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .pokemon-emulator-host {
          position: relative;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
          contain: layout paint;
        }
        .pokemon-emulator-host > div,
        .pokemon-emulator-host .ejs_parent,
        .pokemon-emulator-host .ejs_game,
        .pokemon-emulator-host .ejs_canvas_parent {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
        .pokemon-emulator-host canvas,
        .pokemon-emulator-host .ejs_canvas {
          display: block !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain;
        }
        .pokemon-emulator-host:not(.pokemon-emulator-menu-user-open) .ejs_menu_bar:not(.ejs_menu_bar_hidden) {
          opacity: 0 !important;
          pointer-events: none !important;
          transform: translateY(120%) !important;
        }
        .pokemon-emulator-frame:fullscreen,
        .pokemon-emulator-frame:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          min-height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
          background: #000 !important;
        }
        .pokemon-emulator-frame:fullscreen .pokemon-emulator-host,
        .pokemon-emulator-frame:-webkit-full-screen .pokemon-emulator-host {
          width: 100vw !important;
          height: 100vh !important;
        }
        .pokemon-desktop-stack.pokemon-n64-performance .pokemon-emulator-host canvas,
        .pokemon-desktop-stack.pokemon-n64-performance .pokemon-emulator-host .ejs_canvas {
          backface-visibility: hidden;
          transform: translateZ(0);
          will-change: transform;
        }
        .pokemon-emulator-host.pokemon-emulator-stretch {
          overflow: hidden !important;
        }
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_parent,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_game,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas_parent,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
        }
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas {
          transform: translateZ(0) scaleX(var(--pokemon-stretch-scale-x, 1)) !important;
          transform-origin: center center !important;
          image-rendering: pixelated;
        }
        .retroarch-player-shell:fullscreen,
        .retroarch-player-shell:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          min-height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
          background: #020617 !important;
        }
        .retroarch-player-shell:fullscreen iframe,
        .retroarch-player-shell:-webkit-full-screen iframe {
          width: 100vw !important;
          height: 100vh !important;
          min-height: 100vh !important;
        }
      `}</style>
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 6,
        marginBottom: 8,
        flex: "0 0 auto"
      }}>
        <button
          onClick={() => setGamingMenuOpen(open => !open)}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 16,
            padding: collapsed ? "12px 0" : "10px 12px",
            background: "linear-gradient(135deg, #facc15, #38bdf8)",
            color: "#06111f",
            fontWeight: 1000,
            letterSpacing: 1,
            cursor: "pointer",
            boxShadow: "0 8px 22px rgba(56,189,248,.32)",
            textAlign: "center",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}
        >
          <span style={{ flex: 1 }}>
            {collapsed
              ? "Game"
              : activeGamingApp === "live-gaming"
                ? "FUIT LIVE GAMING"
                : activeGamingApp === "live-gaming-youtube"
                  ? "FUIT LIVE GAMING YOUTUBE"
                : activeGamingApp === "multiplayer-blank"
                  ? "FUIT MULTIPLAYER"
                  : activeGamingApp === "saved-games"
                    ? "FUITS SAVED GAMES"
                  : activeGamingApp === "retroarch"
                    ? "RETROARCH WEB PLAYER"
                  : activeGamingApp === "free-games"
                    ? "FREE GAMES"
                  : "FUIT GAMING CENTER"}
          </span>
          {!collapsed && <span style={{ fontSize: 12, fontWeight: 1000 }}>{gamingMenuOpen ? "^" : "v"}</span>}
        </button>
        {gamingMenuOpen && !collapsed && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 12,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(148,163,184,.28)",
            background: "rgba(2,6,23,.98)",
            boxShadow: "0 16px 36px rgba(0,0,0,.45)"
          }}>
            {[
              { value: "gaming-center", label: "FUIT GAMING CENTER" },
              { value: "multiplayer-blank", label: "FUIT MULTIPLAYER" },
              { value: "saved-games", label: "FUITS SAVED GAMES" },
              { value: "retroarch", label: "RETROARCH WEB PLAYER" },
              { value: "free-games", label: "FREE GAMES" },
              { value: "live-gaming", label: "FUIT LIVE GAMING" },
              { value: "live-gaming-youtube", label: "FUIT LIVE GAMING YOUTUBE" }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => {
                  setActiveGamingApp(option.value);
                  setGamingMenuOpen(false);
                  setCollapsed(false);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,.14)",
                  background: activeGamingApp === option.value ? "rgba(255,255,255,.14)" : "transparent",
                  color: "#f8fafc",
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 1000,
                  textTransform: "uppercase",
                  letterSpacing: .7
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!collapsed && (activeGamingApp === "live-gaming" ? (
        <div style={{
          width: "100%",
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(83,20,78,.92), rgba(15,23,42,.96))",
          border: "2px solid rgba(56,189,248,.28)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          overflow: "hidden",
          padding: 10,
          display: "grid",
          gap: 10
        }}>
          <div style={{
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}>
            <input
              value={kickGamingChannelInput}
              onChange={event => setKickGamingChannelInput(event.target.value)}
              onBlur={() => setKickGamingChannelInput(kickGamingChannel)}
              placeholder="Kick channel"
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,.28)",
                background: "rgba(2,6,23,.86)",
                color: "#f8fafc",
                padding: "9px 10px",
                outline: "none",
                fontSize: 12,
                fontWeight: 900
              }}
            />
            <button
              onClick={() => window.open(`https://kick.com/${kickGamingChannel}`, "_blank", "noopener,noreferrer")}
              style={{
                border: "1px solid rgba(56,189,248,.35)",
                borderRadius: 10,
                background: "rgba(56,189,248,.16)",
                color: "#e0f2fe",
                cursor: "pointer",
                padding: "9px 10px",
                fontSize: 11,
                fontWeight: 1000,
                textTransform: "uppercase"
              }}
            >
              Open
            </button>
          </div>
          <iframe
            key={kickGamingEmbedUrl}
            title={`Kick stream ${kickGamingChannel}`}
            src={kickGamingEmbedUrl}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            scrolling="no"
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              minHeight: 218,
              border: "1px solid rgba(148,163,184,.22)",
              borderRadius: 14,
              background: "#000"
            }}
          />
          <iframe
            key={kickGamingChatUrl}
            title={`Kick chat ${kickGamingChannel}`}
            src={kickGamingChatUrl}
            style={{
              width: "100%",
              minHeight: 430,
              border: "1px solid rgba(83,252,24,.32)",
              borderRadius: 14,
              background: "#0b0f14"
            }}
          />
        </div>
      ) : activeGamingApp === "live-gaming-youtube" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(127,29,29,.94), rgba(15,23,42,.96))",
          border: "2px solid rgba(56,189,248,.28)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          overflow: "hidden",
          padding: 10,
          display: "grid",
          gap: 10
        }}>
          <div style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{
              minWidth: 0,
              color: "#fee2e2",
              fontSize: 12,
              fontWeight: 1000,
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
              youtube.com/@xflivetv
            </div>
            <button
              onClick={() => window.open(YOUTUBE_GAMING_CHANNEL_URL, "_blank", "noopener,noreferrer")}
              style={{
                border: "1px solid rgba(248,113,113,.45)",
                borderRadius: 10,
                background: "rgba(248,113,113,.18)",
                color: "#fee2e2",
                cursor: "pointer",
                padding: "9px 10px",
                fontSize: 11,
                fontWeight: 1000,
                textTransform: "uppercase",
                flex: "0 0 auto"
              }}
            >
              Open
            </button>
          </div>
          <div style={{
            width: "100%",
            minHeight: 218,
            border: "1px solid rgba(248,113,113,.32)",
            borderRadius: 14,
            background: "radial-gradient(circle at 50% 0%, rgba(248,113,113,.24), rgba(2,6,23,.94) 54%)",
            display: "grid",
            placeItems: "center",
            padding: 18,
            textAlign: "center"
          }}>
            <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: 260 }}>
              <div style={{
                width: 64,
                height: 45,
                borderRadius: 12,
                background: "#ef4444",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                margin: "0 auto",
                fontSize: 14,
                fontWeight: 1000,
                lineHeight: 1
              }}>
                PLAY
              </div>
              <div>
                <div style={{ color: "#fff", fontSize: 18, fontWeight: 1000, textTransform: "uppercase" }}>FLIVETV</div>
                <div style={{ color: "#fecaca", fontSize: 12, fontWeight: 900, lineHeight: 1.35, marginTop: 5 }}>
                  Open the channel to view available videos and live content.
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => window.open(YOUTUBE_GAMING_CHANNEL_URL, "_blank", "noopener,noreferrer")}
                  style={{
                    border: "1px solid rgba(248,113,113,.52)",
                    borderRadius: 10,
                    background: "rgba(248,113,113,.2)",
                    color: "#fee2e2",
                    cursor: "pointer",
                    padding: "10px 8px",
                    fontSize: 11,
                    fontWeight: 1000,
                    textTransform: "uppercase"
                  }}
                >
                  Channel
                </button>
                <button
                  onClick={() => window.open(YOUTUBE_GAMING_VIDEOS_URL, "_blank", "noopener,noreferrer")}
                  style={{
                    border: "1px solid rgba(56,189,248,.42)",
                    borderRadius: 10,
                    background: "rgba(56,189,248,.16)",
                    color: "#e0f2fe",
                    cursor: "pointer",
                    padding: "10px 8px",
                    fontSize: 11,
                    fontWeight: 1000,
                    textTransform: "uppercase"
                  }}
                >
                  Videos
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeGamingApp === "multiplayer-blank" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "rgba(15,23,42,.94)",
          border: "2px solid rgba(148,163,184,.28)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
        }} />
      ) : activeGamingApp === "saved-games" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(15,118,110,.92), rgba(15,23,42,.96))",
          border: "2px solid rgba(45,212,191,.42)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          padding: 12,
          color: "#ccfbf1",
          fontWeight: 1000,
          display: "grid",
          gap: 10
        }}>
          <form onSubmit={uploadSavedGame} style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 14,
            background: "rgba(2,6,23,.58)",
            border: "1px solid rgba(204,251,241,.20)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ color: "#99f6e4", fontSize: 15, marginBottom: 2 }}>FUITS SAVED GAMES</div>
                <div style={{ color: "#5eead4", fontSize: 10, lineHeight: 1.25 }}>Uploading as {loggedInUsername || "SIGNED OUT"}</div>
              </div>
              <button
                type="button"
                onClick={loadSavedGames}
                style={{
                  border: "1px solid rgba(204,251,241,.28)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "rgba(15,23,42,.82)",
                  color: "#ccfbf1",
                  cursor: "pointer",
                  fontSize: 10,
                  fontWeight: 1000
                }}
              >
                REFRESH
              </button>
            </div>
            <select
              value={savedGameUpload.system}
              onChange={event => setSavedGameUpload(current => ({ ...current, system: event.target.value, gameFile: "" }))}
              style={{
                width: "100%",
                border: "1px solid rgba(204,251,241,.24)",
                borderRadius: 10,
                padding: "9px 10px",
                background: "rgba(15,23,42,.92)",
                color: "#f8fafc",
                fontWeight: 900
              }}
            >
              {GAME_SYSTEMS.map(system => (
                <option key={system} value={system}>{system}</option>
              ))}
            </select>
            <select
              value={selectedSavedGameUploadGame?.file || ""}
              onChange={event => setSavedGameUpload(current => ({ ...current, gameFile: event.target.value }))}
              disabled={!savedGameUploadGames.length}
              style={{
                width: "100%",
                border: "1px solid rgba(204,251,241,.24)",
                borderRadius: 10,
                padding: "9px 10px",
                background: "rgba(15,23,42,.92)",
                color: "#f8fafc",
                fontWeight: 900
              }}
            >
              {savedGameUploadGames.map(game => (
                <option key={game.file} value={game.file}>{game.label}</option>
              ))}
            </select>
            <input
              value={savedGameUpload.saveName}
              onChange={event => setSavedGameUpload(current => ({ ...current, saveName: event.target.value }))}
              placeholder="Name this save"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid rgba(204,251,241,.24)",
                borderRadius: 10,
                padding: "9px 10px",
                background: "rgba(15,23,42,.92)",
                color: "#f8fafc",
                fontWeight: 900
              }}
            />
            <input
              ref={savedGameFileInputRef}
              type="file"
              onChange={event => setSavedGameUploadFile(event.target.files?.[0] || null)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid rgba(204,251,241,.24)",
                borderRadius: 10,
                padding: "8px 9px",
                background: "rgba(15,23,42,.92)",
                color: "#f8fafc",
                fontSize: 11,
                fontWeight: 900
              }}
            />
            <button
              type="submit"
              disabled={savedGameUploading || !selectedSavedGameUploadGame || !savedGameUploadFile}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 12px",
                background: savedGameUploading || !selectedSavedGameUploadGame || !savedGameUploadFile ? "rgba(148,163,184,.42)" : "#2dd4bf",
                color: savedGameUploading || !selectedSavedGameUploadGame || !savedGameUploadFile ? "#94a3b8" : "#042f2e",
                fontSize: 12,
                fontWeight: 1000,
                cursor: savedGameUploading || !selectedSavedGameUploadGame || !savedGameUploadFile ? "default" : "pointer"
              }}
            >
              UPLOAD SAVE
            </button>
            {savedGameUploadStatus && (
              <div style={{ color: savedGameUploadStatus.includes("uploaded") ? "#bbf7d0" : "#fef3c7", fontSize: 11, lineHeight: 1.35 }}>
                {savedGameUploadStatus}
              </div>
            )}
          </form>

          <div style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 14,
            background: "rgba(2,6,23,.50)",
            border: "1px solid rgba(204,251,241,.18)"
          }}>
            <button
              type="button"
              onClick={() => toggleSavedGameSection("master")}
              style={{
                border: "1px solid rgba(204,251,241,.22)",
                borderRadius: 10,
                padding: "10px 12px",
                background: "rgba(15,23,42,.82)",
                color: "#f8fafc",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 12,
                fontWeight: 1000
              }}
            >
              <span>MASTER</span>
              <span>{savedGameOpenSections.master ? "^" : "v"} {savedGameItems.length}</span>
            </button>
            {savedGames.loading && <div style={{ color: "#99f6e4", fontSize: 12 }}>Loading saved games...</div>}
            {savedGames.error && <div style={{ color: "#fecaca", fontSize: 12 }}>{savedGames.error}</div>}
            {savedGameOpenSections.master && !savedGames.loading && !savedGames.error && (
              <div style={{ display: "grid", gap: 8 }}>
                {!savedGameSystems.length && (
                  <div style={{ color: "#99f6e4", fontSize: 12, lineHeight: 1.35 }}>No uploaded saves yet.</div>
                )}
                {savedGameSystems.map(group => {
                  const systemKey = `system:${group.system}`;
                  const systemOpen = Boolean(savedGameOpenSections[systemKey]);
                  return (
                    <div key={group.system} style={{ display: "grid", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => toggleSavedGameSection(systemKey)}
                        style={{
                          border: "1px solid rgba(94,234,212,.22)",
                          borderRadius: 10,
                          padding: "9px 10px",
                          background: "rgba(13,148,136,.22)",
                          color: "#ccfbf1",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 12,
                          fontWeight: 1000
                        }}
                      >
                        <span>{group.system}</span>
                        <span>{systemOpen ? "^" : "v"} {group.count}</span>
                      </button>
                      {systemOpen && group.games.map(game => {
                        const gameKey = `game:${group.system}:${game.file}`;
                        const gameOpen = Boolean(savedGameOpenSections[gameKey]);
                        return (
                          <div key={gameKey} style={{ display: "grid", gap: 6, paddingLeft: 8 }}>
                            <button
                              type="button"
                              onClick={() => toggleSavedGameSection(gameKey)}
                              style={{
                                border: "1px solid rgba(148,163,184,.20)",
                                borderRadius: 10,
                                padding: "9px 10px",
                                background: "rgba(15,23,42,.76)",
                                color: "#f8fafc",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                textAlign: "left",
                                fontSize: 11,
                                fontWeight: 1000
                              }}
                            >
                              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{game.label}</span>
                              <span style={{ whiteSpace: "nowrap" }}>{gameOpen ? "^" : "v"} {game.saves.length}</span>
                            </button>
                            {gameOpen && game.saves.map(save => (
                              <div key={save.id} style={{
                                display: "grid",
                                gap: 5,
                                marginLeft: 8,
                                padding: 9,
                                borderRadius: 10,
                                border: "1px solid rgba(204,251,241,.18)",
                                background: "rgba(2,6,23,.58)",
                                fontSize: 11,
                                lineHeight: 1.3
                              }}>
                                <div style={{ color: "#fff", overflowWrap: "anywhere" }}>{save.saveName || save.fileName || "Saved Game"}</div>
                                <div style={{ color: "#99f6e4", overflowWrap: "anywhere" }}>By {save.username || "User"} - {formatSavedGameBytes(save.sizeBytes)}</div>
                                <div style={{ color: "#5eead4" }}>{save.uploadedAt ? new Date(save.uploadedAt).toLocaleString() : ""}</div>
                                <a
                                  href={save.downloadUrl}
                                  style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                    background: "#ccfbf1",
                                    color: "#042f2e",
                                    textDecoration: "none",
                                    textAlign: "center",
                                    fontSize: 11,
                                    fontWeight: 1000
                                  }}
                                >
                                  DOWNLOAD
                                </a>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeGamingApp === "retroarch" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(67,56,202,.94), rgba(15,23,42,.96))",
          border: "2px solid rgba(129,140,248,.42)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          padding: 12,
          color: "#e0e7ff",
          fontWeight: 1000,
          display: "grid",
          gap: 10
        }}>
          <div style={{
            display: "grid",
            gap: 4
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#c7d2fe", fontSize: 16, fontWeight: 1000 }}>RETROARCH WEB PLAYER</div>
              <div style={{ color: "#a5b4fc", fontSize: 10, fontWeight: 900, lineHeight: 1.35, marginTop: 3 }}>
                Pick an N64 core, run it, then add your Conker ROM from your computer.
              </div>
            </div>
          </div>

          <div ref={retroarchPlayerRef} className="retroarch-player-shell" style={{
            border: "1px solid rgba(199,210,254,.24)",
            borderRadius: 12,
            overflow: "hidden",
            background: "#020617",
            minHeight: 360
          }}>
            <iframe
              key={RETROARCH_WEB_PLAYER_URL}
              title="RetroArch Web Player"
              src={RETROARCH_WEB_PLAYER_URL}
              allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
              allowFullScreen
              style={{
                width: "100%",
                height: 420,
                minHeight: 360,
                border: "none",
                background: "#020617"
              }}
            />
          </div>

          <button
            type="button"
            onClick={toggleRetroarchFullscreen}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "11px 12px",
              background: "#818cf8",
              color: "#111827",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 1000,
              textTransform: "uppercase"
            }}
          >
            Fullscreen Player
          </button>

          <div style={{
            display: "grid",
            gap: 6,
            fontSize: 10,
            lineHeight: 1.35,
            color: "#c7d2fe",
            fontWeight: 900
          }}>
            <div style={{ padding: 8, borderRadius: 10, background: "rgba(15,23,42,.62)", border: "1px solid rgba(199,210,254,.18)" }}>
              Try Chrome or Edge first. If the embedded player feels cramped, use Full Tab.
            </div>
          </div>
        </div>
      ) : activeGamingApp === "free-games" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(30,64,175,.92), rgba(15,23,42,.96))",
          border: "2px solid rgba(96,165,250,.42)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          display: "grid",
          placeItems: "center",
          padding: 18,
          color: "#dbeafe",
          textAlign: "center",
          fontWeight: 1000
        }}>
          <div>
            <div style={{ fontSize: 18, color: "#bfdbfe", marginBottom: 8 }}>FREE GAMES</div>
            <div style={{ fontSize: 12, color: "#93c5fd", lineHeight: 1.35 }}>Free game links and launches will live here.</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(51,65,85,.92), rgba(15,23,42,.96))",
            padding: "var(--flive-gaming-stage-padding, 10px)",
            border: "2px solid rgba(248,250,252,.38)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
          }}>
            <div ref={emulatorFrameRef} className="pokemon-emulator-frame" tabIndex={0} style={{
              width: "100%",
              aspectRatio: "4 / 3",
              minHeight: "var(--flive-gaming-emulator-min-height, 220px)",
              borderRadius: 14,
              overflow: "hidden",
              background: "#020617",
              border: "4px solid #0f172a",
              position: "relative"
            }}>
              {!activeGame && (
                <div style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#cbd5e1",
                  fontSize: "var(--flive-gaming-emulator-message-font-size, 13px)",
                  fontWeight: 900,
                  textAlign: "center",
                  padding: "var(--flive-gaming-emulator-message-padding, 18px)"
                }}>
                  Add games to T:\FattysLiveTV\Games\Roms\{activeSystem}
                </div>
              )}
              {activeGame && gameLaunch && (
                <div
                  ref={emulatorHostRef}
                  className={`pokemon-emulator-host${stretchGame ? " pokemon-emulator-stretch" : ""}`}
                  tabIndex={0}
                  style={{ width: "100%", height: "100%" }}
                />
              )}
              {activeGame && !gameLaunch && (
                <div style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  color: "#f8fafc",
                  fontSize: "var(--flive-gaming-emulator-message-font-size, 13px)",
                  fontWeight: 900,
                  textAlign: "center",
                  padding: "var(--flive-gaming-emulator-message-padding, 18px)"
                }}>
                  <div>
                    <div style={{ color: "#facc15", marginBottom: 8 }}>Selected</div>
                    <div style={{ lineHeight: 1.25 }}>{activeGame.label}</div>
                    {activeGame.discUrls?.length > 1 && (
                      <div style={{ marginTop: 12 }}>
                        <select
                          value={selectedDiscIndex}
                          onChange={event => setSelectedDiscIndex(Number(event.target.value))}
                          style={{
                            width: "100%",
                            border: "1px solid rgba(255,255,255,.22)",
                            borderRadius: 10,
                            padding: "8px 10px",
                            background: "rgba(15,23,42,.96)",
                            color: "#fff",
                            fontWeight: 900
                          }}
                        >
                          {activeGame.discUrls.map((url, index) => (
                            <option key={url} value={index}>Disc {index + 1}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => startBrowserGame(activeGame)}
                      style={{
                        marginTop: "var(--flive-gaming-start-margin-top, 14px)",
                        border: "none",
                        borderRadius: 999,
                        padding: "var(--flive-gaming-start-padding, 10px 14px)",
                        background: "#22c55e",
                        color: "#052e16",
                        fontSize: "var(--flive-gaming-start-font-size, 12px)",
                        fontWeight: 1000,
                        cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(34,197,94,.28)"
                      }}
                    >
                      Start Selected Game
                    </button>
                  </div>
                </div>
              )}
            </div>
            {activeGame && gameLaunch && (
              <button
                type="button"
                onClick={toggleGameFullscreen}
                style={{
                  width: "100%",
                  marginTop: 10,
                  border: "1px solid rgba(255,255,255,.26)",
                  borderRadius: 999,
                  padding: "9px 12px",
                  background: gameFullscreen ? "rgba(34,197,94,.94)" : "rgba(15,23,42,.88)",
                  color: gameFullscreen ? "#052e16" : "#fff",
                  fontSize: 12,
                  fontWeight: 1000,
                  cursor: "pointer",
                  boxShadow: "0 8px 18px rgba(0,0,0,.32)"
                }}
              >
                {gameFullscreen ? "Exit Fullscreen" : "Stretch Fullscreen"}
              </button>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <select
              value={activeSystem}
              onChange={event => handleSystemChange(event.target.value)}
              aria-label="Choose game system"
              style={{
                width: "100%",
                border: "1px solid rgba(255,255,255,.22)",
                borderRadius: 12,
                padding: "10px 12px",
                background: "rgba(15,23,42,.92)",
                color: "#f8fafc",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "inset 0 0 16px rgba(0,0,0,.22)"
              }}
            >
              {GAME_SYSTEMS.map(system => (
                <option key={system} value={system}>{system}</option>
              ))}
            </select>
          </div>

          <div style={{
            marginTop: 8,
            padding: "var(--flive-gaming-carousel-panel-padding, 8px)",
            borderRadius: 18,
            background: "rgba(15,23,42,.86)",
            border: "1px solid rgba(255,255,255,.14)",
            boxShadow: "inset 0 0 18px rgba(0,0,0,.28)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8
            }}>
              <button onClick={() => moveCarousel(-1)} style={{
                width: "var(--flive-gaming-carousel-arrow-size, 38px)", height: "var(--flive-gaming-carousel-arrow-size, 38px)", borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: "var(--flive-gaming-carousel-arrow-font-size, 22px)", fontWeight: 900
              }}>{"<"}</button>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: "#facc15", textTransform: "uppercase" }}>
                  {activeSystem} Game Carousel
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {carouselGames.length ? activeGameIndex + 1 : 0} / {carouselGames.length}
                </div>
              </div>
              <button onClick={() => moveCarousel(1)} style={{
                width: "var(--flive-gaming-carousel-arrow-size, 38px)", height: "var(--flive-gaming-carousel-arrow-size, 38px)", borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: "var(--flive-gaming-carousel-arrow-font-size, 22px)", fontWeight: 900
              }}>{">"}</button>
            </div>

            <div style={{
              marginBottom: 8,
              color: "#cbd5e1",
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.3,
              textAlign: "center"
            }}>
              For multi disc games, export save, then start next disc and import.
            </div>

            <div style={{ marginBottom: 8 }}>
              <input
                value={gameSearch}
                onChange={event => setGameSearch(event.target.value)}
                placeholder={`Search ${activeSystem} games...`}
                aria-label={`Search ${activeSystem} games`}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(56,189,248,.34)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "rgba(2,6,23,.9)",
                  color: "#f8fafc",
                  outline: "none",
                  fontSize: 12,
                  fontWeight: 900,
                  boxShadow: "inset 0 0 18px rgba(56,189,248,.12)"
                }}
              />
              {gameSearchQuery && (
                <div style={{ marginTop: 6, color: "#93c5fd", fontSize: 10, fontWeight: 900, textAlign: "center" }}>
                  {carouselGames.length} match{carouselGames.length === 1 ? "" : "es"} in {activeSystem}
                </div>
              )}
            </div>

            <div ref={gameCarouselRef} className="game-cover-carousel" style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              paddingTop: 8,
              paddingBottom: 4
            }}>
              {carouselGames.length === 0 && (
                <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 900, padding: 12 }}>
                  {gameSearchQuery ? `No ${activeSystem} games match that search.` : `No ${activeSystem} games found yet.`}
                </div>
              )}
              {carouselGames.map(game => {
                const selected = activeGame && game.file === activeGame.file;
                const discCount = game.discUrls?.length || 0;
                return (
                  <button
                    key={game.file}
                    ref={element => {
                      if (element) gameCardRefs.current[game.file] = element;
                      else delete gameCardRefs.current[game.file];
                    }}
                    onClick={() => chooseCarouselGame(game)}
                    style={{
                    minWidth: "var(--flive-gaming-carousel-card-width, 94px)",
                    maxWidth: "var(--flive-gaming-carousel-card-width, 94px)",
                    scrollSnapAlign: "center",
                    border: selected ? "2px solid #facc15" : "1px solid rgba(255,255,255,.18)",
                    borderRadius: 13,
                    padding: "var(--flive-gaming-carousel-card-padding, 6px)",
                    background: selected ? "rgba(250,204,21,.18)" : "rgba(2,6,23,.72)",
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: selected ? "0 0 18px rgba(250,204,21,.32)" : "0 8px 18px rgba(0,0,0,.22)",
                    transform: selected ? "scale(.99)" : "scale(.97)",
                    transition: "transform .18s ease, box-shadow .18s ease, border .18s ease",
                    textAlign: "center"
                  }}>
                    <div style={{ pointerEvents: "none", display: "flex", justifyContent: "center" }}>
                      <PokemonCoverImage game={game} onZoom={() => {}} compact />
                    </div>
                    <div style={{
                      marginTop: "var(--flive-gaming-carousel-title-margin, 6px)", fontSize: "var(--flive-gaming-carousel-title-font-size, 10px)", fontWeight: 900, lineHeight: 1.12,
                      height: "var(--flive-gaming-carousel-title-height, 34px)", overflow: "hidden", color: selected ? "#fff" : "#cbd5e1"
                    }}>
                      {game.label}
                    </div>
                    <div style={{ marginTop: "var(--flive-gaming-carousel-meta-margin, 4px)", fontSize: "var(--flive-gaming-carousel-meta-font-size, 10px)", fontWeight: 900, color: selected ? "#facc15" : "#94a3b8" }}>
                      {game.system} - {game.year}
                    </div>
                    {discCount > 1 && (
                      <div style={{ marginTop: "var(--flive-gaming-carousel-meta-margin, 4px)", fontSize: "var(--flive-gaming-carousel-meta-font-size, 10px)", fontWeight: 1000, color: "#38bdf8" }}>
                        {discCount} discs
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {activeGame && (
          <div style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: "var(--flive-gaming-detail-cover-width, 92px) 1fr",
            gap: "var(--flive-gaming-detail-gap, 10px)",
            alignItems: "center",
            padding: "var(--flive-gaming-detail-padding, 8px)",
            borderRadius: 16,
            background: "rgba(15,23,42,.88)",
            border: "1px solid rgba(255,255,255,.14)"
          }}>
            <PokemonCoverImage game={activeGame} imageType={selectedArt} onZoom={setZoomedCover} />
            <div>
              <div style={{ fontSize: "var(--flive-gaming-detail-title-font-size, 12px)", fontWeight: 900, lineHeight: 1.25, color: "#fff" }}>{activeGame.label}</div>
              <div style={{ fontSize: "var(--flive-gaming-detail-meta-font-size, 11px)", fontWeight: 800, color: "#cbd5e1", marginTop: 4 }}>{activeGame.system} - {activeGame.year}</div>
              {activeGame.discUrls?.length > 1 && (
                <select
                  value={selectedDiscIndex}
                  onChange={event => {
                    stopRunningGame();
                    setSelectedDiscIndex(Number(event.target.value));
                  }}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    border: "1px solid rgba(255,255,255,.18)",
                    borderRadius: 10,
                    padding: "7px 9px",
                    background: "rgba(2,6,23,.92)",
                    color: "#fff",
                    fontWeight: 900
                  }}
                >
                  {activeGame.discUrls.map((url, index) => (
                    <option key={url} value={index}>Disc {index + 1}</option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: "var(--flive-gaming-detail-button-gap, 8px)", flexWrap: "wrap", marginTop: "var(--flive-gaming-detail-button-margin, 10px)" }}>
                <button onClick={() => setSelectedArt("cover")} style={{
                  border: "none", borderRadius: 999, padding: "var(--flive-gaming-detail-button-padding, 7px 10px)", cursor: "pointer",
                  background: selectedArt === "cover" ? "#22c55e" : "rgba(255,255,255,.14)", color: selectedArt === "cover" ? "#052e16" : "#fff", fontWeight: 900, fontSize: "var(--flive-gaming-detail-button-font-size)"
                }}>Cover</button>
                {activeGameAssets.backUrl && (
                  <button onClick={() => setSelectedArt("back")} style={{
                    border: "none", borderRadius: 999, padding: "var(--flive-gaming-detail-button-padding, 7px 10px)", cursor: "pointer",
                    background: selectedArt === "back" ? "#a855f7" : "rgba(255,255,255,.14)", color: "#fff", fontWeight: 900, fontSize: "var(--flive-gaming-detail-button-font-size)"
                  }}>Back</button>
                )}
                {activeGameAssets.manualUrl && (
                  <a href={activeGameAssets.manualUrl} target="_blank" rel="noreferrer" style={{
                    borderRadius: 999, padding: "var(--flive-gaming-detail-button-padding, 7px 10px)", textDecoration: "none", background: "rgba(59,130,246,.9)", color: "#fff", fontWeight: 900, fontSize: "var(--flive-gaming-detail-button-font-size, 13px)"
                  }}>Manual</a>
                )}
              </div>
            </div>
          </div>
          )}

          {zoomedCover && (
            <div
              onClick={() => setZoomedCover(null)}
              style={{
                position: "fixed",
                left: 18,
                top: 18,
                bottom: 18,
                width: 390,
                zIndex: 9999,
                background: "rgba(0,0,0,0.88)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                cursor: "zoom-out"
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <button
                  onClick={() => setZoomedCover(null)}
                  style={{
                    alignSelf: "flex-end",
                    border: "1px solid rgba(255,255,255,.22)",
                    borderRadius: 999,
                    padding: "8px 14px",
                    background: "rgba(15,23,42,.92)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900
                  }}
                >
                  X Close
                </button>
                <img
                  src={zoomedCover.src}
                  alt={zoomedCover.title}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "calc(100vh - 150px)",
                    objectFit: "contain",
                    borderRadius: 18,
                    border: "3px solid rgba(255,255,255,.32)",
                    boxShadow: "0 24px 80px rgba(0,0,0,.75)",
                    background: "#020617"
                  }}
                />
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 900, textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>
                  {zoomedCover.title}
                </div>
              </div>
            </div>
          )}
        </>
      ))}
    </aside>
    </div>
  );
}

function LiveChatBox({ title = "Live Chat", src, height = 250, minHeight = 250 }) {
  const frameRef = useRef(null);
  const [softFullscreen, setSoftFullscreen] = useState(false);

  const postFullscreenState = useCallback((active, targetOrigin = "*") => {
    const frame = frameRef.current;
    try {
      frame?.contentWindow?.postMessage({ type: "FUITS_CHAT_FULLSCREEN_STATE", active }, targetOrigin || "*");
    } catch {}
  }, []);

  useEffect(() => {
    if (!softFullscreen || typeof document === "undefined") return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.classList.add("fuits-chat-soft-fullscreen-active");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("fuits-chat-soft-fullscreen-active");
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [softFullscreen]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof window === "undefined" || typeof document === "undefined") return undefined;

    const requestFrameFullscreen = async () => {
      const requestFullscreen =
        frame.requestFullscreen ||
        frame.webkitRequestFullscreen ||
        frame.webkitRequestFullScreen ||
        frame.msRequestFullscreen;
      if (!requestFullscreen) return false;
      try {
        const result = requestFullscreen.call(frame);
        if (result?.then) await result;
        return true;
      } catch {
        return false;
      }
    };

    const exitFrameFullscreen = async () => {
      const exitFullscreen =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.webkitCancelFullScreen ||
        document.msExitFullscreen;
      if (!exitFullscreen) return false;
      try {
        const result = exitFullscreen.call(document);
        if (result?.then) await result;
        return true;
      } catch {
        return false;
      }
    };

    const handleMessage = async event => {
      if (event.data?.type !== "FUITS_CHAT_FULLSCREEN_TOGGLE") return;
      let frameOrigin = "";
      try {
        frameOrigin = new URL(frame.src || src || "", window.location.href).origin;
      } catch {}
      const fromFrame = event.source === frame.contentWindow || (frameOrigin && event.origin === frameOrigin);
      if (!fromFrame) return;

      const targetOrigin = event.origin || "*";
      const fullscreenElement = getFuitsFullscreenElement();
      if (softFullscreen || fullscreenElement === frame) {
        setSoftFullscreen(false);
        if (fullscreenElement === frame) await exitFrameFullscreen();
        postFullscreenState(false, targetOrigin);
        return;
      }

      const nativeStarted = await requestFrameFullscreen();
      window.setTimeout(() => {
        if (!nativeStarted || getFuitsFullscreenElement() !== frame) {
          setSoftFullscreen(true);
        }
        postFullscreenState(true, targetOrigin);
      }, 80);
    };

    const handleFullscreenChange = () => {
      postFullscreenState(softFullscreen || getFuitsFullscreenElement() === frame);
    };

    window.addEventListener("message", handleMessage);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [postFullscreenState, softFullscreen, src]);

  return (
    <iframe
      ref={frameRef}
      className={`fuits-live-chat-frame${softFullscreen ? " fuits-live-chat-frame-soft-fullscreen" : ""}`}
      title={title}
      src={src}
      allow="fullscreen"
      allowFullScreen
      style={{
        position: softFullscreen ? "fixed" : undefined,
        inset: softFullscreen ? 0 : undefined,
        zIndex: softFullscreen ? 2147483647 : undefined,
        width: softFullscreen ? "100vw" : "100%",
        height: softFullscreen ? "100dvh" : height,
        minHeight: softFullscreen ? "100dvh" : minHeight,
        maxHeight: softFullscreen ? "none" : undefined,
        border: "1px solid rgba(148,163,184,.22)",
        borderRadius: softFullscreen ? 0 : 14,
        background: "#020617"
      }}
    />
  );
}

function AdultRelaxLiveChatRoom({ baseUrl, accentColor = "#38bdf8", mobileLandscapeActive = false }) {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [error, setError] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [localSlot, setLocalSlot] = useState(0);
  const [localReady, setLocalReady] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [softFullscreen, setSoftFullscreen] = useState(false);
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false);
  const localVideoRef = useRef(null);
  const roomShellRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRefs = useRef(new Map());
  const pollingRef = useRef(null);
  const lastSeqRef = useRef(0);
  const clientIdRef = useRef((() => {
    if (typeof window === "undefined") {
      return `adult-relax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const storageKey = "adult-relax-client-id";
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) return stored;
    const created = `adult-relax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, created);
    return created;
  })());
  const workingSignalBaseRef = useRef("");
  const roomId = "adult-relax-time";
  const maxParticipants = 8;
  const signalBaseUrls = useMemo(() => {
    const urls = [`${baseUrl.replace(/\/+$/, "")}/adult-relax-signal`];
    if (typeof window !== "undefined" && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(window.location.origin)) {
      urls.push("http://127.0.0.1:8099/adult-relax-signal");
    }
    return [...new Set(urls)];
  }, [baseUrl]);

  const readSignalJson = async response => {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `Live chat server returned ${response.status}.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(text || "Live chat server did not return JSON.");
    }
  };

  const requestSignal = useCallback(async (payload = null, query = {}) => {
    const orderedUrls = workingSignalBaseRef.current
      ? [workingSignalBaseRef.current, ...signalBaseUrls.filter(url => url !== workingSignalBaseRef.current)]
      : signalBaseUrls;
    let lastError = null;

    for (const signalUrl of orderedUrls) {
      try {
        const params = new URLSearchParams({ room: roomId, ...query });
        const response = await fetch(`${signalUrl}?${params.toString()}`, payload ? {
          method: "POST",
          body: JSON.stringify({ room: roomId, clientId: clientIdRef.current, ...payload })
        } : {
          cache: "no-store"
        });
        const data = await readSignalJson(response);
        workingSignalBaseRef.current = signalUrl;
        return data;
      } catch (signalError) {
        lastError = signalError;
      }
    }

    throw new Error(lastError?.message || "Live chat server is not ready yet.");
  }, [signalBaseUrls]);

  const sendSignal = useCallback(async payload => {
    await requestSignal(payload);
  }, [requestSignal]);

  const closePeer = useCallback(clientId => {
    const peerInfo = peerRefs.current.get(clientId);
    if (peerInfo?.peer) peerInfo.peer.close();
    peerRefs.current.delete(clientId);
    setRemoteStreams(current => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }, []);

  const stopRoom = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    peerRefs.current.forEach(peerInfo => peerInfo.peer.close());
    peerRefs.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalReady(false);
    setRemoteStreams({});
    setParticipants([]);
    setLocalSlot(0);
    setParticipantCount(0);
    setStarted(false);
    setStatus("Ready when you are.");
  }, []);

  const ensurePeer = useCallback((remoteClientId, remoteSlot) => {
    if (!remoteClientId || remoteClientId === clientIdRef.current) return null;
    const existing = peerRefs.current.get(remoteClientId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    const peerInfo = { peer, remoteSlot, offerSent: false };
    peerRefs.current.set(remoteClientId, peerInfo);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));
    }

    peer.ontrack = event => {
      if (event.streams[0]) {
        setRemoteStreams(current => ({ ...current, [remoteClientId]: event.streams[0] }));
        setStatus("Live chat connected.");
      }
    };
    peer.onicecandidate = event => {
      if (event.candidate) {
        sendSignal({ action: "signal", type: "candidate", to: remoteClientId, data: event.candidate }).catch(() => {});
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("Live chat connected.");
      if (peer.connectionState === "failed" || peer.connectionState === "closed") closePeer(remoteClientId);
    };

    return peerInfo;
  }, [closePeer, sendSignal]);

  const handleSignalMessages = useCallback(async messages => {
    for (const message of messages) {
      const peerInfo = ensurePeer(message.from);
      const peer = peerInfo?.peer;
      if (!peer) continue;

      if (message.type === "offer" && message.data) {
        await peer.setRemoteDescription(new RTCSessionDescription(message.data));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal({ action: "signal", type: "answer", to: message.from, data: peer.localDescription });
        setStatus("Connected. Waiting for video to appear...");
      }
      if (message.type === "answer" && message.data && peer.signalingState !== "stable") {
        await peer.setRemoteDescription(new RTCSessionDescription(message.data));
        setStatus("Connected. Waiting for video to appear...");
      }
      if (message.type === "candidate" && message.data) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(message.data));
        } catch {}
      }
    }
  }, [ensurePeer, sendSignal]);

  const pollSignals = useCallback(async () => {
    const params = new URLSearchParams({
      room: roomId,
      client: clientIdRef.current,
      since: String(lastSeqRef.current)
    });
    const data = await requestSignal(null, Object.fromEntries(params.entries()));
    if (!data.ok) return;

    lastSeqRef.current = Math.max(lastSeqRef.current, Number(data.seq) || 0);
    const activeParticipants = Array.isArray(data.participants)
      ? data.participants.filter(item => item.slot >= 1 && item.slot <= maxParticipants)
      : [];
    const participant = data.participant || activeParticipants.find(item => item.clientId === clientIdRef.current);
    const mySlot = Number(participant?.slot) || localSlot;
    if (mySlot) setLocalSlot(mySlot);
    setParticipants(activeParticipants);
    setParticipantCount(activeParticipants.length);

    const activeClientIds = new Set(activeParticipants.map(item => item.clientId));
    [...peerRefs.current.keys()].forEach(clientId => {
      if (!activeClientIds.has(clientId)) closePeer(clientId);
    });

    for (const remoteParticipant of activeParticipants) {
      if (remoteParticipant.clientId === clientIdRef.current || !mySlot) continue;
      const peerInfo = ensurePeer(remoteParticipant.clientId, remoteParticipant.slot);
      if (
        peerInfo &&
        mySlot < remoteParticipant.slot &&
        !peerInfo.offerSent &&
        peerInfo.peer.signalingState === "stable"
      ) {
        peerInfo.offerSent = true;
        const offer = await peerInfo.peer.createOffer();
        await peerInfo.peer.setLocalDescription(offer);
        await sendSignal({ action: "signal", type: "offer", to: remoteParticipant.clientId, data: peerInfo.peer.localDescription });
      }
    }
    await handleSignalMessages(Array.isArray(data.messages) ? data.messages : []);
  }, [closePeer, ensurePeer, handleSignalMessages, localSlot, requestSignal, sendSignal]);

  const startRoom = async () => {
    setError("");
    setStatus("Joining live chat room...");
    setStarted(true);

    try {
      const joinData = await requestSignal({ action: "join" });
      const slot = Number(joinData?.participant?.slot) || 0;
      lastSeqRef.current = 0;
      if (slot) setLocalSlot(slot);
      const activeParticipants = Array.isArray(joinData.participants)
        ? joinData.participants.filter(item => item.slot >= 1 && item.slot <= maxParticipants)
        : [];
      setParticipants(activeParticipants);
      setParticipantCount(activeParticipants.length || (slot ? 1 : 0));

      if (slot === 0) {
        setStatus("Eight people are already in the room. You can wait here for a spot.");
        return;
      }

      setStatus("Asking for camera and mic...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setLocalReady(true);
      setStatus(slot === 1 ? "You are Person 1. Waiting for others..." : `You are Person ${slot}. Waiting for others...`);

      pollingRef.current = setInterval(() => pollSignals().catch(() => {}), 1000);
      await pollSignals();
    } catch (roomError) {
      stopRoom();
      setStarted(true);
      setError(roomError?.message || "Camera or mic could not start.");
      setStatus("Camera and mic are off.");
    }
  };

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localReady, localSlot]);

  const getRoomFullscreenElement = () => (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );

  const exitRoomNativeFullscreen = async () => {
    const exitFullscreen =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    if (!exitFullscreen) return false;
    try {
      const result = exitFullscreen.call(document);
      if (result?.then) await result;
      return true;
    } catch {
      return false;
    }
  };

  const requestRoomNativeFullscreen = async roomShell => {
    const requestFullscreen =
      roomShell.requestFullscreen ||
      roomShell.webkitRequestFullscreen ||
      roomShell.msRequestFullscreen;
    if (!requestFullscreen) return false;
    try {
      const result = requestFullscreen.call(roomShell);
      if (result?.then) await result;
      return true;
    } catch {
      return false;
    }
  };

  const exitRoomFullscreen = async () => {
    setSoftFullscreen(false);
    setNativeFullscreenActive(false);
    if (getRoomFullscreenElement() === roomShellRef.current) {
      await exitRoomNativeFullscreen();
    }
  };

  useEffect(() => {
    if (!softFullscreen || typeof document === "undefined") return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.classList.add("adult-relax-room-soft-fullscreen-active");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("adult-relax-room-soft-fullscreen-active");
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [softFullscreen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleFullscreenChange = () => {
      const roomIsFullscreen = getRoomFullscreenElement() === roomShellRef.current;
      setNativeFullscreenActive(roomIsFullscreen);
      if (roomIsFullscreen) setSoftFullscreen(false);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!mobileLandscapeActive && softFullscreen) setSoftFullscreen(false);
  }, [mobileLandscapeActive, softFullscreen]);

  const fullscreenRoom = async () => {
    const roomShell = roomShellRef.current;
    if (!roomShell) return;

    const fullscreenElement = getRoomFullscreenElement();
    if (softFullscreen || fullscreenElement === roomShell) {
      await exitRoomFullscreen();
      return;
    }

    const nativeStarted = await requestRoomNativeFullscreen(roomShell);
    window.setTimeout(() => {
      const roomIsFullscreen = getRoomFullscreenElement() === roomShell;
      setNativeFullscreenActive(roomIsFullscreen);
      if (roomIsFullscreen) return;
      if (mobileLandscapeActive) {
        setSoftFullscreen(true);
        return;
      }
      if (!nativeStarted) setStatus("Fullscreen is not available in this browser.");
    }, nativeStarted ? 120 : 0);
  };

  useEffect(() => () => {
    sendSignal({ action: "leave" }).catch(() => {});
    stopRoom();
  }, [sendSignal, stopRoom]);

  const roomFullscreenActive = softFullscreen || nativeFullscreenActive;

  const slotStyle = {
    position: "relative",
    minHeight: 210,
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: 12,
    background: "rgba(2,6,23,.92)",
    overflow: "hidden"
  };

  return (
    <div ref={roomShellRef} className={`adult-relax-room-shell${softFullscreen ? " adult-relax-room-soft-fullscreen" : ""}${mobileLandscapeActive ? " adult-relax-room-mobile-landscape" : ""}${roomFullscreenActive ? " adult-relax-room-fullscreen-active" : " adult-relax-room-regular-view"}`} style={{
      width: "100%",
      display: "grid",
      gap: 10,
      border: "1px solid rgba(148,163,184,.22)",
      borderRadius: 14,
      padding: 12,
      background: "rgba(15,23,42,.78)"
    }}>
      <style>{`
        .adult-relax-room-shell:fullscreen,
        .adult-relax-room-shell:-webkit-full-screen,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          padding: 12px !important;
          box-sizing: border-box;
          display: flex !important;
          flex-direction: column;
          gap: 8px;
          overflow: hidden;
          background: #020617 !important;
          border-radius: 0 !important;
          margin: 0 !important;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-toolbar,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-toolbar,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-toolbar,
        .adult-relax-room-shell:fullscreen .adult-relax-start-panel,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-start-panel,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-start-panel,
        .adult-relax-room-shell:fullscreen .adult-relax-leave-btn,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-leave-btn,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-leave-btn {
          flex-shrink: 0;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-grid,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-grid,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-grid {
          flex: 1;
          min-height: 0;
          width: 100%;
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
          align-items: stretch;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-slot,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-slot,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-slot {
          min-height: 0 !important;
          height: 100% !important;
        }
        .adult-relax-room-shell:fullscreen video,
        .adult-relax-room-shell:-webkit-full-screen video,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen video {
          width: 100% !important;
          min-height: 0 !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-slot-empty > div,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-slot-empty > div,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-slot-empty > div {
          height: 100%;
          padding: 10px !important;
          display: flex !important;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 11px;
        }
        .adult-relax-slot-empty-content {
          height: 100%;
          min-height: 190px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .adult-relax-slot-label {
          position: absolute;
          left: 8px;
          bottom: 8px;
          color: #fff;
          font-size: 10px;
          font-weight: 1000;
          text-align: center;
          pointer-events: none;
          z-index: 2;
        }
        .adult-relax-slot-label span {
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(2,6,23,.76);
          text-transform: uppercase;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view {
          gap: 5px !important;
          padding: 6px !important;
          overflow: hidden !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-toolbar {
          gap: 4px !important;
          font-size: 9px !important;
          line-height: 1.12 !important;
          min-width: 0 !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-toolbar > span,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-toolbar div,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-toolbar div span,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-toolbar button {
          min-width: 0 !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          grid-auto-rows: clamp(48px, 12dvh, 64px) !important;
          gap: 4px !important;
          min-width: 0 !important;
          width: 100% !important;
          overflow: hidden !important;
          align-items: stretch !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot {
          min-width: 0 !important;
          min-height: 0 !important;
          height: 100% !important;
          border-radius: 7px !important;
          overflow: hidden !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view video {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
          object-fit: cover !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot-empty-content {
          box-sizing: border-box !important;
          min-width: 0 !important;
          min-height: 0 !important;
          height: 100% !important;
          padding: 4px !important;
          gap: 3px !important;
          font-size: 8px !important;
          line-height: 1.08 !important;
          overflow: hidden !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot-empty-content > div {
          min-width: 0 !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot-empty-content button {
          min-height: 26px !important;
          max-width: 100% !important;
          padding: 3px 4px !important;
          font-size: 7px !important;
          line-height: 1.05 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot-label {
          left: 3px !important;
          right: 3px !important;
          bottom: 3px !important;
          font-size: 7px !important;
          line-height: 1 !important;
          max-width: calc(100% - 6px) !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-slot-label span {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
          padding: 2px 4px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-regular-view .adult-relax-leave-btn {
          min-height: 28px !important;
          padding: 4px 6px !important;
          font-size: 9px !important;
          line-height: 1.08 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-start-panel,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-start-panel,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-start-panel {
          flex: 1;
          min-height: 0;
          display: flex !important;
          flex-direction: column;
          align-items: stretch;
          justify-content: center;
          gap: 10px;
        }
        .adult-relax-room-shell:fullscreen .adult-relax-slot-empty button,
        .adult-relax-room-shell:-webkit-full-screen .adult-relax-slot-empty button,
        .adult-relax-room-shell.adult-relax-room-soft-fullscreen .adult-relax-slot-empty button {
          min-height: 44px !important;
          font-size: 10px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen {
          padding: 5px !important;
          gap: 4px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-toolbar,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-toolbar,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-toolbar {
          gap: 4px !important;
          font-size: 9px !important;
          line-height: 1.12 !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-start-panel,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-start-panel,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-start-panel {
          gap: 6px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-start-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-start-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-start-btn {
          min-height: 118px !important;
          font-size: 18px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-exit-fullscreen-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-exit-fullscreen-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-exit-fullscreen-btn {
          min-height: 34px !important;
          padding: 6px 8px !important;
          font-size: 10px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-grid,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-grid,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
          gap: 4px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-slot,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-slot,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-slot {
          border-radius: 7px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-slot-empty > div,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-slot-empty > div,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-slot-empty > div {
          padding: 5px !important;
          gap: 4px !important;
          font-size: 9px !important;
          line-height: 1.12 !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-slot-empty button,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-slot-empty button,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-slot-empty button {
          min-height: 30px !important;
          max-width: 100% !important;
          padding: 4px 5px !important;
          font-size: 8px !important;
          line-height: 1.05 !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-leave-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-leave-btn,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-leave-btn {
          min-height: 28px !important;
          padding: 4px 6px !important;
          font-size: 9px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-slot-label,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-slot-label,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-slot-label {
          left: 4px !important;
          bottom: 4px !important;
          font-size: 8px !important;
        }
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:fullscreen .adult-relax-slot-label span,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape:-webkit-full-screen .adult-relax-slot-label span,
        .adult-relax-room-shell.adult-relax-room-mobile-landscape.adult-relax-room-soft-fullscreen .adult-relax-slot-label span {
          padding: 2px 5px !important;
        }
      `}</style>
      {!started ? (
        <div className="adult-relax-start-panel" style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            className="adult-relax-start-btn"
            onClick={startRoom}
            style={{
              width: "100%",
              minHeight: 170,
              border: `1px solid ${accentColor}`,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${accentColor}, #14b8a6)`,
              color: "#fff",
              cursor: "pointer",
              fontSize: 24,
              fontWeight: 1000,
              textTransform: "uppercase",
              letterSpacing: 0,
              boxShadow: "0 18px 44px rgba(0,0,0,.35)"
            }}
          >
            WANT TO LIVE CHAT?
          </button>
          {mobileLandscapeActive && roomFullscreenActive && (
            <button
              type="button"
              className="adult-relax-exit-fullscreen-btn"
              onClick={exitRoomFullscreen}
              style={{
                width: "100%",
                minHeight: 42,
                border: "1px solid rgba(148,163,184,.34)",
                borderRadius: 10,
                background: "rgba(2,6,23,.88)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 1000,
                textTransform: "uppercase"
              }}
            >
              Exit Fullscreen
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="adult-relax-toolbar" style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            color: "#e2e8f0",
            fontSize: 12,
            fontWeight: 900
          }}>
            <span>{status}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{participantCount}/{maxParticipants} PEOPLE</span>
              <button
                type="button"
                onClick={fullscreenRoom}
                style={{
                  border: "1px solid rgba(148,163,184,.32)",
                  borderRadius: 8,
                  padding: "5px 8px",
                  background: "rgba(2,6,23,.82)",
                  color: "#f8fafc",
                  cursor: "pointer",
                  fontSize: 10,
                  fontWeight: 1000,
                  textTransform: "uppercase"
                }}
              >
                {roomFullscreenActive ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>
          {error && (
            <div style={{
              border: "1px solid rgba(248,113,113,.42)",
              borderRadius: 8,
              padding: "8px 10px",
              background: "rgba(127,29,29,.32)",
              color: "#fecaca",
              fontSize: 12,
              fontWeight: 900
            }}>
              {error}
            </div>
          )}
          <div className="adult-relax-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10
          }}>
            {Array.from({ length: maxParticipants }, (_, index) => {
              const slot = index + 1;
              const participant = participants.find(item => item.slot === slot);
              const isLocal = localReady && localSlot === slot;
              const remoteStream = participant && !isLocal ? remoteStreams[participant.clientId] : null;
              const hasVideo = isLocal || Boolean(remoteStream);
              const isOccupied = isLocal || Boolean(participant);
              return (
                <div key={slot} className={`adult-relax-slot ${isOccupied ? "adult-relax-slot-active" : "adult-relax-slot-empty"}`} style={slotStyle}>
                  {isLocal && (
                    <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", minHeight: 190, objectFit: "cover", display: "block" }} />
                  )}
                  {remoteStream && (
                    <video
                      ref={element => {
                        if (element && element.srcObject !== remoteStream) element.srcObject = remoteStream;
                      }}
                      autoPlay
                      playsInline
                      style={{ width: "100%", height: "100%", minHeight: 190, objectFit: "cover", display: "block" }}
                    />
                  )}
                  {!hasVideo && (
                    <div className="adult-relax-slot-empty-content" style={{ padding: 18, gap: 10, color: "#cbd5e1", fontWeight: 900 }}>
                      <div>{isLocal ? "YOU" : `PERSON ${slot}`}</div>
                      {participant && <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>Connecting...</div>}
                      {localReady && !participant && (
                        <button
                          type="button"
                          onClick={() => setStatus(`Person ${slot} should open Adult Relax Time and click WANT TO CHAT to join.`)}
                          style={{
                            width: "100%",
                            maxWidth: 220,
                            minHeight: 76,
                            border: `1px solid ${accentColor}`,
                            borderRadius: 10,
                            background: `linear-gradient(135deg, ${accentColor}, #14b8a6)`,
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: 16,
                            fontWeight: 1000,
                            textTransform: "uppercase",
                            letterSpacing: 0
                          }}
                        >
                          WANT TO CHAT?
                        </button>
                      )}
                    </div>
                  )}
                  {hasVideo && (
                    <div className="adult-relax-slot-label">
                      <span>{isLocal ? "YOU" : `PERSON ${slot}`}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="adult-relax-leave-btn"
            onClick={() => {
              sendSignal({ action: "leave" }).catch(() => {});
              stopRoom();
            }}
            style={{
              border: "1px solid rgba(248,113,113,.36)",
              borderRadius: 10,
              padding: "9px 10px",
              background: "rgba(127,29,29,.28)",
              color: "#fecaca",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 1000,
              textTransform: "uppercase"
            }}
          >
            Leave Live Chat
          </button>
        </>
      )}
    </div>
  );
}

function FuitsLiveAnnouncementPlayer({ baseUrl, playerMuted, playerVolume, onVolumeChange }) {
  const liveVideoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    video.muted = playerMuted;
    video.volume = playerVolume;
  }, [playerMuted, playerVolume]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video || !baseUrl) return undefined;

    const liveSrc = `${baseUrl.replace(/\/+$/, "")}/owncast-hls/stream.m3u8`;
    let cancelled = false;

    const playLive = () => {
      if (cancelled) return;
      const playPromise = video.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    };

    const loadHls = () => {
      if (cancelled) return;
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = liveSrc;
        video.load();
        playLive();
        return;
      }

      if (window.Hls?.isSupported()) {
        hlsRef.current?.destroy?.();
        const hls = new window.Hls({
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxBufferLength: 6,
          lowLatencyMode: true
        });
        hlsRef.current = hls;
        hls.on(window.Hls.Events.MANIFEST_PARSED, playLive);
        hls.on(window.Hls.Events.ERROR, (event, data) => {
          if (!data?.fatal) return;
          if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else {
            hls.destroy();
            hlsRef.current = null;
            window.setTimeout(loadHls, 1000);
          }
        });
        hls.loadSource(liveSrc);
        hls.attachMedia(video);
      }
    };

    if (window.Hls || video.canPlayType("application/vnd.apple.mpegurl")) {
      loadHls();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1";
      script.async = true;
      script.onload = loadHls;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [baseUrl]);

  return (
    <div>
      <div style={{
        background: "#000",
        border: "2px solid rgba(239,68,68,.72)",
        boxShadow: "0 0 24px rgba(239,68,68,.28)"
      }}>
        <video
          ref={liveVideoRef}
          controls
          autoPlay
          playsInline
          muted={playerMuted}
          preload="auto"
          onVolumeChange={onVolumeChange}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            height: "auto",
            maxHeight: 520,
            background: "#000",
            display: "block"
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: 7,
          color: "#ef4444",
          fontSize: 12,
          fontWeight: 900,
          textTransform: "uppercase"
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#ef4444",
          boxShadow: "0 0 10px rgba(239,68,68,.75)",
          flex: "0 0 auto"
        }} />
        Livestream Active
      </div>
    </div>
  );
}

const LARGE_FUITS_VIDEO_BYTES = 1024 * 1024 * 1024;
const LARGE_FUITS_PRELOAD_FRACTION = 0.07;
const LARGE_FUITS_PRELOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const LARGE_FUITS_PRELOAD_PARALLEL_CHUNKS = 6;
const FUITS_RESTART_PASSWORD = "FOOLIO";
const FUITS_TRANSITION_BUFFER_SECONDS = 4;
const FUITS_MOBILE_SAFARI_STARTUP_BUFFER_SECONDS = 4;
const FUITS_MOBILE_SAFARI_SYNC_DRIFT_SECONDS = 12;
const FUITS_MOBILE_SAFARI_SYNC_INTERVAL_MS = 6000;
const FUITS_DEFAULT_VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";
const FUITS_SAFARI_ZOOM_RESET_VIEWPORT_CONTENT = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
const FUITS_MOBILE_LANDSCAPE_QUERY = "(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px)";
const FUITS_SILK_JELLYFIN_KEEPALIVE_MS = 12 * 60 * 1000;
let fuitsSafariZoomResetTimer = null;
let fuitsSafariZoomRestoreViewportContent = null;

const getFuitsFullscreenElement = () => {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
};

const isFuitsMobileLandscapeProfile = () => {
  if (typeof window === "undefined") return false;

  const touchPoints = typeof navigator === "undefined" ? 0 : Number(navigator.maxTouchPoints || 0);
  const mediaMatches = typeof window.matchMedia === "function" && window.matchMedia(FUITS_MOBILE_LANDSCAPE_QUERY).matches;
  const landscapeMatches =
    window.innerWidth > window.innerHeight ||
    (typeof window.matchMedia === "function" && window.matchMedia("(orientation: landscape)").matches);

  if (!landscapeMatches) return false;
  if (mediaMatches) return true;
  if (touchPoints <= 0) return false;

  const visualViewport = window.visualViewport;
  const viewportPairs = [
    [window.innerWidth, window.innerHeight],
    [visualViewport?.width, visualViewport?.height]
  ];

  return viewportPairs.some(([width, height]) => {
    const viewportWidth = Number(width || 0);
    const viewportHeight = Number(height || 0);
    if (!viewportWidth || !viewportHeight) return false;

    return Math.max(viewportWidth, viewportHeight) <= 1100 && Math.min(viewportWidth, viewportHeight) <= 560;
  });
};

const FUITS_MOBILE_PORTRAIT_GATE_QUERY = "(hover: none) and (pointer: coarse) and (orientation: portrait) and (max-width: 820px)";

const isFuitsPhoneSafariProfile = () => {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const isPhone = /iPhone|iPod/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && /Apple/i.test(vendor) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|SamsungBrowser|Chrome|Chromium/i.test(userAgent);

  return isPhone && isSafari && touchPoints > 0;
};

const isFuitsMobileLandscapeSafariProfile = () => (
  isFuitsPhoneSafariProfile() && isFuitsMobileLandscapeProfile()
);

const resetFuitsMobileSafariViewportZoom = () => {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (!isFuitsMobileLandscapeSafariProfile()) return false;

  let viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) {
    viewportMeta = document.createElement("meta");
    viewportMeta.setAttribute("name", "viewport");
    document.head.appendChild(viewportMeta);
  }

  const currentContent = viewportMeta.getAttribute("content") || FUITS_DEFAULT_VIEWPORT_CONTENT;
  if (currentContent !== FUITS_SAFARI_ZOOM_RESET_VIEWPORT_CONTENT) {
    fuitsSafariZoomRestoreViewportContent = currentContent;
  } else if (!fuitsSafariZoomRestoreViewportContent) {
    fuitsSafariZoomRestoreViewportContent = FUITS_DEFAULT_VIEWPORT_CONTENT;
  }

  window.clearTimeout(fuitsSafariZoomResetTimer);
  viewportMeta.setAttribute("content", FUITS_SAFARI_ZOOM_RESET_VIEWPORT_CONTENT);

  fuitsSafariZoomResetTimer = window.setTimeout(() => {
    if (document.head.contains(viewportMeta)) {
      viewportMeta.setAttribute("content", fuitsSafariZoomRestoreViewportContent || FUITS_DEFAULT_VIEWPORT_CONTENT);
    }
    fuitsSafariZoomRestoreViewportContent = null;
  }, 450);

  return true;
};

const resetFuitsMobileSafariViewportZoomForNavigation = () => {
  const didReset = resetFuitsMobileSafariViewportZoom();
  if (!didReset || typeof window === "undefined") return didReset;

  const resetAgain = () => resetFuitsMobileSafariViewportZoom();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(resetAgain);
  }
  window.setTimeout(resetAgain, 120);

  return didReset;
};

const isFuitsMobilePortraitGateProfile = () => {
  if (typeof window === "undefined") return false;
  if (!isFuitsPhoneSafariProfile()) return false;
  if (typeof window.matchMedia === "function") return window.matchMedia(FUITS_MOBILE_PORTRAIT_GATE_QUERY).matches;

  const touchPoints = typeof navigator === "undefined" ? 0 : Number(navigator.maxTouchPoints || 0);
  return touchPoints > 0 && window.innerHeight >= window.innerWidth && window.innerWidth <= 820;
};

const getFuitsAmazonSilkProfile = () => {
  if (typeof navigator === "undefined") {
    return { active: false, isSilk: false, isFireTv: false, mode: "", version: "", deviceModel: "" };
  }

  const userAgent = navigator.userAgent || "";
  const silkMatch = /(?:; ([^;)]+) Build\/.*)?\bSilk\/([0-9._-]+)\b(.*\bMobile Safari\b)?/i.exec(userAgent);
  const fireTvModelMatch = /\b(AFT[A-Z0-9]+)\b/i.exec(userAgent);
  const kindleModelMatch = /\b(KF[A-Z0-9]+)\b/i.exec(userAgent);
  const isAmazonWebAppPlatform = /AmazonWebAppPlatform|cordova-amazon-fireos/i.test(userAgent);
  const isSilk = Boolean(silkMatch) || /Silk-Accelerated=/i.test(userAgent);
  const isFireTv = Boolean(fireTvModelMatch || isAmazonWebAppPlatform);
  const deviceModel = (fireTvModelMatch?.[1] || silkMatch?.[1] || kindleModelMatch?.[1] || "").trim();
  const mode = silkMatch ? (silkMatch[3] ? "mobile" : "default") : "";

  return {
    active: isSilk || isFireTv,
    isSilk,
    isFireTv,
    mode,
    version: silkMatch?.[2] || "",
    deviceModel
  };
};

const FuitsLiveTvPlayer = forwardRef(function FuitsLiveTvPlayer({ baseUrl, channelId = "channel-a", startupBufferSeconds = 0, liveAnnouncementOnline = false, restartSignal = 0, onPlaybackAnchor, onStretchFullscreenChange }, ref) {
  const videoRef = useRef(null);
  const videoShellRef = useRef(null);
  const loadedVideoSrcRef = useRef("");
  const syncedVideoSrcRef = useRef("");
  const refreshQueuedRef = useRef(false);
  const transitionBufferPendingRef = useRef(false);
  const pendingTransitionStartRef = useRef(false);
  const stretchVideoRequestedRef = useRef(false);
  const anchoredPlaybackKeyRef = useRef("");
  const lastAllowedPlaybackTimeRef = useRef(0);
  const seekingLockRef = useRef(false);
  const programmaticSeekUntilRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const lastMobileAudioToggleAtRef = useRef(0);
  const channelSwitchPendingRef = useRef(false);
  const previousChannelIdRef = useRef(channelId);
  const stalledRecoveryTimerRef = useRef(null);
  const [preloadedLargeVideoKey, setPreloadedLargeVideoKey] = useState("");
  const autoPreloadKeyRef = useRef("");
  const [largePreloadProgress, setLargePreloadProgress] = useState(0);
  const [largePreloadActive, setLargePreloadActive] = useState(false);
  const [channel, setChannel] = useState(null);
  const [status, setStatus] = useState("Loading FUITS Live TV...");
  const [playerMuted, setPlayerMuted] = useState(true);
  const [playerVolume, setPlayerVolume] = useState(1);
  const [stretchVideoFullscreen, setStretchVideoFullscreen] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [playbackLocked, setPlaybackLocked] = useState(false);
  const [restartAnchor, setRestartAnchor] = useState(null);
  const currentItem = channel?.playlist?.[channel.currentIndex] || null;
  const mobileLandscapeSafariProfile = isFuitsMobileLandscapeSafariProfile();
  const videoStreamQuery = currentItem
    ? new URLSearchParams({
      stream: `${channelId}-${currentItem.id}-${currentItem.sizeBytes || currentItem.duration || ""}`,
      ...(mobileLandscapeSafariProfile ? { profile: "mobile-safari-landscape" } : {})
    }).toString()
    : "";
  const videoSrc = currentItem?.src
    ? `${baseUrl}${currentItem.src.startsWith("/") ? "" : "/"}${currentItem.src}${currentItem.src.includes("?") ? "&" : "?"}${videoStreamQuery}`
    : "";
  const largeVideoKey = currentItem && videoSrc ? `${channelId}:${currentItem.id}:${currentItem.sizeBytes || 0}` : "";
  const needsLargeVideoPreload = false;
  const currentOffsetSeconds = useMemo(() => {
    if (!channel || !currentItem) return 0;
    return Math.max(0, Math.min(channel.offsetSeconds || 0, Math.max(0, (currentItem.duration || 1) - 1)));
  }, [channel, currentItem]);

  const getLiveOffsetSeconds = useCallback((snapshot = channel, item = currentItem) => {
    if (!snapshot || !item) return 0;
    const duration = Number(item.duration) || 1;
    if (restartAnchor?.channelId === channelId && restartAnchor?.itemId === item.id) {
      return Math.max(0, (Date.now() - restartAnchor.startedAtMs) / 1000);
    }
    const snapshotOffset = Number(snapshot.offsetSeconds) || 0;
    const generatedAtMs = Number(snapshot.generatedAtMs);
    const elapsedSinceSnapshot = Number.isFinite(generatedAtMs)
      ? Math.max(0, (Date.now() - generatedAtMs) / 1000)
      : 0;
    return Math.max(0, snapshotOffset + elapsedSinceSnapshot);
  }, [channel, channelId, currentItem, restartAnchor]);

  const setProgrammaticVideoTime = useCallback((video, time) => {
    if (!video || !Number.isFinite(time)) return;
    seekingLockRef.current = true;
    programmaticSeekUntilRef.current = Date.now() + 1800;
    try {
      video.currentTime = time;
    } catch {}
    window.setTimeout(() => {
      seekingLockRef.current = false;
      lastAllowedPlaybackTimeRef.current = Number(video.currentTime) || time;
    }, 0);
  }, []);

  const syncVideoToLiveOffset = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !channel || !currentItem || !Number.isFinite(video.duration)) return;
    const duration = Number(currentItem.duration) || video.duration || 1;
    const rawLiveOffset = getLiveOffsetSeconds(channel, currentItem);
    if (rawLiveOffset >= duration - 0.5) {
      if (!refreshQueuedRef.current) {
        refreshQueuedRef.current = true;
        window.setTimeout(() => loadChannel().catch(() => {}), 0);
      }
      return;
    }

    const liveOffset = Math.max(0, Math.min(rawLiveOffset, Math.max(0, duration - 1.5)));
    const driftSeconds = video.currentTime - liveOffset;
    const driftSeekSeconds = mobileLandscapeSafariProfile ? FUITS_MOBILE_SAFARI_SYNC_DRIFT_SECONDS : 1.75;
    if (force || Math.abs(driftSeconds) > driftSeekSeconds) {
      try {
        setProgrammaticVideoTime(video, liveOffset);
        video.playbackRate = 1;
      } catch {
        setVideoError("Video loaded, but the stream could not seek. Try Next or restart the tunnel.");
      }
      return;
    }

    if (mobileLandscapeSafariProfile) {
      video.playbackRate = 1;
      return;
    }

    video.playbackRate = driftSeconds < -0.35 ? 1.08 : 1;
  }, [channel, currentItem, getLiveOffsetSeconds, mobileLandscapeSafariProfile, setProgrammaticVideoTime, videoSrc]);

  useEffect(() => {
    if (!baseUrl) return;
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = baseUrl;
    preconnect.crossOrigin = "anonymous";
    const dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = baseUrl;
    document.head.appendChild(preconnect);
    document.head.appendChild(dnsPrefetch);
    return () => {
      preconnect.remove();
      dnsPrefetch.remove();
    };
  }, [baseUrl]);

  const loadChannel = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${baseUrl}/channel.json?channel=${encodeURIComponent(channelId)}&cache=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Channel feed failed");
      const data = await response.json();
      refreshQueuedRef.current = false;
      if (!Number.isFinite(Number(data.generatedAtMs))) data.generatedAtMs = Date.now();
      setChannel(data);
      setStatus(data?.playlist?.length ? "" : "No videos found in FUITS Live TV.");
      setVideoError("");
      return data;
    } catch (error) {
      const message = "FUITS Live TV is not answering at the saved START BAT URL yet. Keep the FUITS server and Cloudflare windows open, then refresh.";
      setVideoLoading(false);
      setVideoError(message);
      setStatus(message);
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [baseUrl, channelId]);

  useEffect(() => {
    if (!baseUrl) return;
    let cancelled = false;

    const refreshChannel = async () => {
      try {
        const data = await loadChannel();
        if (cancelled || data?.playlist?.length) return;
      } catch {
        if (!cancelled) setStatus("FUITS Live TV is not answering at the saved START BAT URL yet. Keep the FUITS server and Cloudflare windows open, then refresh.");
      }
    };

    refreshChannel();
    const timer = window.setInterval(refreshChannel, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [baseUrl, loadChannel]);

  useEffect(() => {
    const channelChanged = previousChannelIdRef.current !== channelId;
    previousChannelIdRef.current = channelId;
    if (!channelChanged) return;

    channelSwitchPendingRef.current = true;
    transitionBufferPendingRef.current = false;
    pendingTransitionStartRef.current = true;
    syncedVideoSrcRef.current = "";
    loadedVideoSrcRef.current = "";
    anchoredPlaybackKeyRef.current = "";
    playbackStartedRef.current = false;
    lastAllowedPlaybackTimeRef.current = 0;
    refreshQueuedRef.current = false;
    autoPreloadKeyRef.current = "";
    setRestartAnchor(null);
    setPlaybackLocked(false);
    setVideoLoading(true);
    setVideoError("");
    loadChannel().catch(() => {});
  }, [channelId, loadChannel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel || !currentItem || !videoSrc || syncedVideoSrcRef.current === videoSrc) return;

    const syncTime = () => {
      if (syncedVideoSrcRef.current === videoSrc) return;
      if (!Number.isFinite(video.duration)) return;
      syncVideoToLiveOffset(true);
      syncedVideoSrcRef.current = videoSrc;
      pendingTransitionStartRef.current = false;
    };

    if (video.readyState >= 1) syncTime();
    else {
      video.addEventListener("loadedmetadata", syncTime, { once: true });
      return () => {
        video.removeEventListener("loadedmetadata", syncTime);
      };
    }
  }, [channel, currentItem, currentOffsetSeconds, videoSrc, syncVideoToLiveOffset]);

  useEffect(() => {
    if (!videoSrc) return undefined;
    const syncIntervalMs = mobileLandscapeSafariProfile ? FUITS_MOBILE_SAFARI_SYNC_INTERVAL_MS : 2000;
    const timer = window.setInterval(() => syncVideoToLiveOffset(false), syncIntervalMs);
    return () => window.clearInterval(timer);
  }, [mobileLandscapeSafariProfile, videoSrc, syncVideoToLiveOffset]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveAnnouncementOnline) return;
    video.pause();
  }, [liveAnnouncementOnline]);

  const playCurrentVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    const attemptPlay = allowMutedFallback => {
      if (allowMutedFallback) {
        video.muted = true;
        setPlayerMuted(true);
      }
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          if (!allowMutedFallback) attemptPlay(true);
        });
      }
    };
    attemptPlay(false);
  }, []);

  const keepVideoPlaying = useCallback(() => {
    const video = videoRef.current;
    if (!video || liveAnnouncementOnline || video.ended || !videoSrc) return;
    window.setTimeout(() => {
      const currentVideo = videoRef.current;
      if (!currentVideo || liveAnnouncementOnline || currentVideo.ended || !currentVideo.paused) return;
      playCurrentVideo();
    }, 120);
  }, [liveAnnouncementOnline, playCurrentVideo, videoSrc]);

  const preloadLargeVideoFromTimestamp = useCallback(async () => {
    if (!currentItem || !videoSrc || !needsLargeVideoPreload || largePreloadActive) return;

    const sizeBytes = Number(currentItem.sizeBytes);
    const duration = Number(currentItem.duration) || 1;
    const liveOffset = Math.max(0, Math.min(getLiveOffsetSeconds(channel, currentItem), Math.max(0, duration - 1)));
    const startByte = Math.max(0, Math.min(sizeBytes - 1, Math.floor((liveOffset / duration) * sizeBytes)));
    const targetBytes = Math.max(LARGE_FUITS_PRELOAD_CHUNK_BYTES, Math.floor(sizeBytes * LARGE_FUITS_PRELOAD_FRACTION));
    const endByte = Math.min(sizeBytes - 1, startByte + targetBytes - 1);

    setLargePreloadActive(true);
    setLargePreloadProgress(0);
    setVideoLoading(true);
    setVideoError("");

    try {
      let loadedBytes = 0;
      const chunks = [];
      for (let byte = startByte; byte <= endByte; byte += LARGE_FUITS_PRELOAD_CHUNK_BYTES) {
        chunks.push([byte, Math.min(endByte, byte + LARGE_FUITS_PRELOAD_CHUNK_BYTES - 1)]);
      }

      for (let index = 0; index < chunks.length; index += LARGE_FUITS_PRELOAD_PARALLEL_CHUNKS) {
        const batch = chunks.slice(index, index + LARGE_FUITS_PRELOAD_PARALLEL_CHUNKS);
        const buffers = await Promise.all(batch.map(async ([byte, chunkEnd]) => {
          const response = await fetch(videoSrc, {
            cache: "force-cache",
            headers: { Range: `bytes=${byte}-${chunkEnd}` }
          });
          if (!response.ok && response.status !== 206) throw new Error("Preload failed");
          return response.arrayBuffer();
        }));
        loadedBytes += buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
        setLargePreloadProgress(Math.min(100, Math.round((loadedBytes / (endByte - startByte + 1)) * 100)));
      }

      setPreloadedLargeVideoKey(largeVideoKey);
      setLargePreloadProgress(100);
      window.setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.preload = "auto";
        syncVideoToLiveOffset(true);
        const playPromise = video.play();
        if (playPromise?.catch) playPromise.catch(() => {});
      }, 0);
    } catch {
      setVideoError("Large movie preload did not finish. Check the FUITS tunnel, then try preload again.");
    } finally {
      setLargePreloadActive(false);
      setVideoLoading(false);
    }
  }, [channel, currentItem, getLiveOffsetSeconds, largePreloadActive, largeVideoKey, needsLargeVideoPreload, syncVideoToLiveOffset, videoSrc]);

  const getBufferedAheadSeconds = video => {
    if (!video?.buffered?.length) return 0;
    for (let i = 0; i < video.buffered.length; i += 1) {
      if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
        return video.buffered.end(i) - video.currentTime;
      }
    }
    return 0;
  };

  const playWhenBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video) return false;
    const baseBufferSeconds = transitionBufferPendingRef.current
      ? FUITS_TRANSITION_BUFFER_SECONDS
      : startupBufferSeconds;
    const bufferSeconds = mobileLandscapeSafariProfile
      ? Math.max(baseBufferSeconds, FUITS_MOBILE_SAFARI_STARTUP_BUFFER_SECONDS)
      : baseBufferSeconds;
    const enoughBuffered = bufferSeconds <= 0 || getBufferedAheadSeconds(video) >= bufferSeconds;
    const nearEnd = Number.isFinite(video.duration) && video.duration - video.currentTime < bufferSeconds;
    if (video.readyState >= 1 && (enoughBuffered || nearEnd)) {
      transitionBufferPendingRef.current = false;
      setVideoLoading(false);
      playCurrentVideo();
      return true;
    }
    if (mobileLandscapeSafariProfile && bufferSeconds > 0) setVideoLoading(true);
    return false;
  }, [mobileLandscapeSafariProfile, playCurrentVideo, startupBufferSeconds]);

  const startChannelPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || liveAnnouncementOnline) return;
    if (syncedVideoSrcRef.current !== videoSrc) {
      syncVideoToLiveOffset(true);
      syncedVideoSrcRef.current = videoSrc;
    }
    pendingTransitionStartRef.current = false;
    const bufferedPlaybackStarted = playWhenBuffered();
    if (!mobileLandscapeSafariProfile || bufferedPlaybackStarted) playCurrentVideo();
    else setVideoLoading(true);
  }, [liveAnnouncementOnline, mobileLandscapeSafariProfile, playCurrentVideo, playWhenBuffered, syncVideoToLiveOffset, videoSrc]);

  const showBufferingIfNeeded = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) return;
    const minimumBufferSeconds = mobileLandscapeSafariProfile ? 1.25 : 0.35;
    const minimumReadyState = mobileLandscapeSafariProfile ? 3 : 1;
    if (video.readyState < minimumReadyState && getBufferedAheadSeconds(video) < minimumBufferSeconds) setVideoLoading(true);
  };

  const recoverFromMobileLandscapeStall = () => {
    const video = videoRef.current;
    if (!video) return;

    const safariLandscapeProfile = isFuitsMobileLandscapeSafariProfile();
    const hasRecoveryBuffer = targetVideo => (
      safariLandscapeProfile
        ? targetVideo.readyState >= 3 || getBufferedAheadSeconds(targetVideo) > 1.25
        : targetVideo.readyState >= 2 || getBufferedAheadSeconds(targetVideo) > 0.25
    );

    if (!isFuitsMobileLandscapeProfile()) {
      setVideoError("Stream stalled. The tunnel or source video is not sending data fast enough.");
      return;
    }

    window.clearTimeout(stalledRecoveryTimerRef.current);
    setVideoError("");

    if (hasRecoveryBuffer(video)) {
      setVideoLoading(false);
      playCurrentVideo();
      return;
    }

    setVideoLoading(true);
    stalledRecoveryTimerRef.current = window.setTimeout(() => {
      const currentVideo = videoRef.current;
      if (!currentVideo || !isFuitsMobileLandscapeProfile()) return;

      if (hasRecoveryBuffer(currentVideo)) {
        setVideoLoading(false);
        playCurrentVideo();
        return;
      }

      if (syncedVideoSrcRef.current !== videoSrc) {
        syncVideoToLiveOffset(true);
        syncedVideoSrcRef.current = videoSrc;
      }
      if (safariLandscapeProfile) playWhenBuffered();
      else playCurrentVideo();
    }, 650);
  };

  useEffect(() => () => {
    window.clearTimeout(stalledRecoveryTimerRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    video.muted = playerMuted;
    video.volume = playerVolume;

    if (loadedVideoSrcRef.current === videoSrc) {
      if (!isFuitsMobileLandscapeProfile()) playCurrentVideo();
      return;
    }

    loadedVideoSrcRef.current = videoSrc;
    setVideoLoading(true);
    setVideoError("");
    setLargePreloadProgress(0);
    setPlaybackLocked(false);
    playbackStartedRef.current = false;
    lastAllowedPlaybackTimeRef.current = 0;
    anchoredPlaybackKeyRef.current = "";

    if (channelSwitchPendingRef.current) {
      channelSwitchPendingRef.current = false;
      transitionBufferPendingRef.current = false;
      pendingTransitionStartRef.current = true;
    } else if (syncedVideoSrcRef.current && syncedVideoSrcRef.current !== videoSrc) {
      transitionBufferPendingRef.current = true;
      pendingTransitionStartRef.current = true;
    }
    syncedVideoSrcRef.current = "";
    video.preload = "auto";
    video.load();

    const handleReady = () => startChannelPlayback();

    if (video.readyState >= 1) handleReady();
    else {
      video.addEventListener("loadedmetadata", handleReady, { once: true });
      video.addEventListener("canplay", handleReady, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleReady);
      video.removeEventListener("canplay", handleReady);
    };
  }, [videoSrc, playerMuted, playerVolume, startChannelPlayback]);

  useEffect(() => {
    if (!needsLargeVideoPreload || !largeVideoKey || largePreloadActive) return;
    if (autoPreloadKeyRef.current === largeVideoKey) return;
    autoPreloadKeyRef.current = largeVideoKey;
    preloadLargeVideoFromTimestamp();
  }, [largePreloadActive, largeVideoKey, needsLargeVideoPreload, preloadLargeVideoFromTimestamp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = playerMuted;
    video.volume = playerVolume;
  }, [playerMuted, playerVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let resetTimer = null;
    const resetNativeFullscreenButton = () => {
      if (!isFuitsMobileLandscapeProfile()) return;

      stretchVideoRequestedRef.current = false;
      setStretchVideoFullscreen(false);

      const wasPaused = video.paused;
      video.controls = false;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        if (videoRef.current !== video) return;
        video.controls = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        if (!wasPaused) {
          const playPromise = video.play();
          if (playPromise?.catch) playPromise.catch(() => {});
        }
      }, 80);
    };

    video.addEventListener("webkitendfullscreen", resetNativeFullscreenButton);
    return () => {
      window.clearTimeout(resetTimer);
      video.removeEventListener("webkitendfullscreen", resetNativeFullscreenButton);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;

      if (!fullscreenElement) {
        stretchVideoRequestedRef.current = false;
        setStretchVideoFullscreen(false);
        return;
      }

      const stretchFullscreenElement =
        fullscreenElement === videoRef.current ||
        (isFuitsMobileLandscapeProfile() && fullscreenElement === videoShellRef.current);
      setStretchVideoFullscreen(Boolean(stretchVideoRequestedRef.current && stretchFullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    onStretchFullscreenChange?.(stretchVideoFullscreen);
    return () => onStretchFullscreenChange?.(false);
  }, [onStretchFullscreenChange, stretchVideoFullscreen]);

  useEffect(() => {
    const unmuteOnFirstPageClick = () => {
      if (isFuitsMobileLandscapeProfile()) return;
      const video = videoRef.current;
      setPlayerMuted(false);
      setPlayerVolume(1);
      if (video) {
        video.muted = false;
        video.volume = 1;
        const playPromise = video.play();
        if (playPromise?.catch) playPromise.catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unmuteOnFirstPageClick, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", unmuteOnFirstPageClick, { capture: true });
  }, []);

  const handleVideoVolumeChange = event => {
    const video = event.currentTarget;
    const nextMuted = video.muted;
    const nextVolume = video.volume;
    setPlayerMuted(nextMuted);
    setPlayerVolume(nextVolume);

    if (!isFuitsMobileLandscapeProfile() || nextMuted || nextVolume <= 0) return;

    video.muted = false;
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const toggleMobileLandscapeAudio = event => {
    if (!isFuitsMobileLandscapeProfile()) return;
    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    if (now - lastMobileAudioToggleAtRef.current < 350) return;
    lastMobileAudioToggleAtRef.current = now;

    const video = videoRef.current;
    if (!video) return;

    const currentlyAudible = !video.muted && !playerMuted && (Number(video.volume) || playerVolume) > 0;
    const nextMuted = currentlyAudible;
    video.muted = nextMuted;
    video.defaultMuted = nextMuted;
    video.volume = 1;
    setPlayerMuted(nextMuted);
    setPlayerVolume(1);

    if (nextMuted) return;

    if (!video.paused && !video.ended) {
      try { video.pause(); } catch {}
    }

    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoLoading(true);
    setVideoError("");
    video.load();
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const exitStretchVideoFullscreen = useCallback(async () => {
    const fullscreenElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;

    if (fullscreenElement) {
      const exitFullscreen =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen;
      try { await exitFullscreen?.call(document); } catch {}
    }

    stretchVideoRequestedRef.current = false;
    setStretchVideoFullscreen(false);
  }, []);

  const stretchVideoToFullscreen = useCallback(async () => {
    const video = videoRef.current;
    const shell = videoShellRef.current;
    const mobileLandscapeProfile = isFuitsMobileLandscapeProfile();

    const fullscreenElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;
    if (fullscreenElement || stretchVideoFullscreen) {
      await exitStretchVideoFullscreen();
      return;
    }

    if (!video) return;

    stretchVideoRequestedRef.current = true;
    setStretchVideoFullscreen(true);
    video.muted = false;
    video.volume = 1;
    setPlayerMuted(false);
    setPlayerVolume(1);
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});

    const fullscreenTarget = mobileLandscapeProfile ? (shell || video) : video;
    const requestFullscreen =
      fullscreenTarget?.requestFullscreen ||
      fullscreenTarget?.webkitRequestFullscreen ||
      fullscreenTarget?.msRequestFullscreen;
    if (!requestFullscreen) {
      if (!mobileLandscapeProfile) {
        stretchVideoRequestedRef.current = false;
        setStretchVideoFullscreen(false);
      }
      return;
    }
    try {
      await requestFullscreen.call(fullscreenTarget);
    } catch {
      if (!mobileLandscapeProfile) {
        stretchVideoRequestedRef.current = false;
        setStretchVideoFullscreen(false);
      }
    }
  }, [exitStretchVideoFullscreen, stretchVideoFullscreen]);

  useImperativeHandle(ref, () => ({
    stretchVideoToFullscreen
  }), [stretchVideoToFullscreen]);

  const confirmRestartPassword = async () => {
    const password = window.prompt("Restart password");
    if (!password) return false;
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/admin/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      return response.ok;
    } catch {
      return password === FUITS_RESTART_PASSWORD;
    }
  };

  const restartCurrentVideo = async (requirePassword = true) => {
    if (requirePassword && !(await confirmRestartPassword())) {
      setVideoError("Restart blocked. Password required.");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    try {
      setProgrammaticVideoTime(video, 0);
      syncedVideoSrcRef.current = videoSrc;
      if (currentItem) {
        const startedAtMs = Date.now();
        setRestartAnchor({
          channelId,
          itemId: currentItem.id,
          startedAtMs
        });
        onPlaybackAnchor?.({
          channelId,
          itemId: currentItem.id,
          startedAtMs
        });
      }
      setVideoLoading(false);
      setVideoError("");
      playCurrentVideo();
    } catch {
      setVideoError("This video could not restart from the beginning. Try Retry or Next.");
    }
  };

  useEffect(() => {
    if (!restartSignal) return;
    restartCurrentVideo(false);
  }, [restartSignal]);

  const handleVideoEnded = () => {
    let attempts = 0;
    transitionBufferPendingRef.current = true;
    const pollForNextItem = async () => {
      attempts += 1;
      setVideoLoading(true);
      syncedVideoSrcRef.current = "";
      try {
        await loadChannel();
      } catch {
        setVideoError("FUITS Live TV did not load from the saved START BAT URL yet. Keep the FUITS server and Cloudflare windows open, then try again.");
        return;
      }

      const video = videoRef.current;
      if (video?.ended && attempts < 8) {
        window.setTimeout(pollForNextItem, 1000);
      }
    };

    pollForNextItem();
  };

  return (
    <div style={{
      width: "100%",
      flexShrink: 0,
      border: "1px solid rgba(148,163,184,.22)",
      borderRadius: 14,
      background: "#020617",
      overflow: "hidden"
    }}>
      {videoSrc ? (
        <>
          {liveAnnouncementOnline ? (
            <FuitsLiveAnnouncementPlayer
              baseUrl={baseUrl}
              playerMuted={playerMuted}
              playerVolume={playerVolume}
              onVolumeChange={event => {
                setPlayerMuted(event.currentTarget.muted);
                setPlayerVolume(event.currentTarget.volume);
              }}
            />
          ) : (
          <div
            ref={videoShellRef}
            className={`fuits-video-shell${stretchVideoFullscreen ? " fuits-video-shell-stretching" : ""}`}
            style={{
              position: "relative",
              background: "#000",
              height: "clamp(190px, calc(100vh - 500px), 270px)",
              minHeight: 0
            }}
          >
            <style>{`
              .fuits-video-shell:fullscreen,
              .fuits-video-shell:-webkit-full-screen {
                width: 100vw !important;
                height: 100vh !important;
                background: #000 !important;
              }
              .fuits-video-shell:fullscreen .fuits-video-player-stretch,
              .fuits-video-shell:-webkit-full-screen .fuits-video-player-stretch {
                width: 100vw !important;
                height: 100vh !important;
                max-height: none !important;
                object-fit: fill !important;
              }
              .fuits-video-player:fullscreen,
              .fuits-video-player:-webkit-full-screen {
                width: 100vw !important;
                height: 100vh !important;
                max-height: none !important;
                object-fit: contain !important;
              }
              .fuits-video-player-stretch:fullscreen,
              .fuits-video-player-stretch:-webkit-full-screen {
                width: 100vw !important;
                height: 100vh !important;
                max-height: none !important;
                object-fit: fill !important;
              }
              .fuits-video-shell video::-webkit-media-controls-timeline,
              .fuits-video-player-stretch::-webkit-media-controls-timeline {
                pointer-events: none !important;
              }
              .fuits-video-shell video::-webkit-media-controls-play-button,
              .fuits-video-player-stretch::-webkit-media-controls-play-button {
                display: none !important;
                -webkit-appearance: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
              .fuits-mobile-landscape-audio-hitbox {
                display: none;
              }
              .fuits-mobile-landscape-stretch-exit {
                display: none;
              }
              @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px) {
                .fuits-video-shell.fuits-video-shell-stretching {
                  position: fixed !important;
                  inset: 0 !important;
                  width: 100vw !important;
                  height: 100vh !important;
                  height: 100dvh !important;
                  max-height: none !important;
                  z-index: 2147483647 !important;
                  border-radius: 0 !important;
                  background: #000 !important;
                }
                .fuits-video-shell.fuits-video-shell-stretching .fuits-video-player-stretch {
                  width: 100vw !important;
                  height: 100vh !important;
                  height: 100dvh !important;
                  max-height: none !important;
                  object-fit: fill !important;
                }
                .fuits-video-shell video::-webkit-media-controls-start-playback-button,
                .fuits-video-player-stretch::-webkit-media-controls-start-playback-button {
                  display: none !important;
                  -webkit-appearance: none !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
                .fuits-mobile-landscape-audio-hitbox {
                  display: block;
                  position: absolute;
                  left: 0;
                  bottom: 0;
                  width: 96px;
                  height: 44px;
                  z-index: 7;
                  border: 0;
                  padding: 0;
                  margin: 0;
                  background: transparent;
                  color: transparent;
                  touch-action: manipulation;
                  cursor: pointer;
                }
                .fuits-video-shell.fuits-video-shell-stretching .fuits-mobile-landscape-stretch-exit {
                  display: grid;
                  place-items: center;
                  position: absolute;
                  top: 7px;
                  right: 7px;
                  width: 32px;
                  height: 32px;
                  z-index: 9;
                  border: 1px solid rgba(255,255,255,.35);
                  border-radius: 999px;
                  padding: 0;
                  background: rgba(2,6,23,.72);
                  color: #fff;
                  font-size: 18px;
                  font-weight: 1000;
                  line-height: 1;
                  cursor: pointer;
                  touch-action: manipulation;
                }
              }
              @media (hover: hover) and (pointer: fine) and (min-width: 900px) and (max-width: 1400px) and (max-height: 790px),
                (hover: hover) and (pointer: fine) and (min-device-width: 900px) and (max-device-height: 820px) {
                .fuits-video-shell {
                  height: var(--flive-tv-video-shell-height, 165px) !important;
                }
                .fuits-video-shell .fuits-video-player,
                .fuits-video-shell .fuits-video-player-stretch {
                  height: var(--flive-tv-video-player-height, 100%) !important;
                  max-height: var(--flive-tv-video-player-max-height, 520px) !important;
                }
                .fuits-video-title {
                  box-sizing: border-box !important;
                  min-height: var(--flive-tv-video-title-min-height, 56px) !important;
                  max-height: var(--flive-tv-video-title-max-height, 76px) !important;
                  padding: var(--flive-tv-video-title-padding, 7px 8px 10px) !important;
                  color: #f8fafc !important;
                  font-size: var(--flive-tv-video-title-font-size, 13px) !important;
                  font-weight: 1000 !important;
                  line-height: var(--flive-tv-video-title-line-height, 1.2) !important;
                  overflow-y: var(--flive-tv-video-title-overflow, visible) !important;
                  margin-bottom: 2px !important;
                  text-shadow: 0 1px 3px rgba(0,0,0,.9) !important;
                }
                iframe[title="FUITS Live TV Chat"],
                .fuits-live-tv-panel .fuits-live-chat-frame {
                  flex: var(--flive-tv-chat-flex, 1 1 auto) !important;
                  height: var(--flive-tv-chat-height, auto) !important;
                  min-height: var(--flive-tv-chat-min-height, 0) !important;
                  max-height: var(--flive-tv-chat-max-height, none) !important;
                }
              }
            `}</style>
            <video
              ref={videoRef}
              className={stretchVideoFullscreen ? "fuits-video-player-stretch" : "fuits-video-player"}
              src={videoSrc}
              controls
              controlsList="noplaybackrate nodownload noremoteplayback"
              disablePictureInPicture
              playsInline
              muted={playerMuted}
              autoPlay={!needsLargeVideoPreload && !mobileLandscapeSafariProfile}
              preload="auto"
              onLoadedMetadata={() => {
                setVideoLoading(false);
                if (needsLargeVideoPreload) {
                  videoRef.current?.pause();
                  return;
                }
                syncVideoToLiveOffset(true);
                syncedVideoSrcRef.current = videoSrc;
                pendingTransitionStartRef.current = false;
                const bufferedPlaybackStarted = playWhenBuffered();
                if (!mobileLandscapeSafariProfile || bufferedPlaybackStarted) playCurrentVideo();
              }}
              onCanPlayThrough={() => {
                if (needsLargeVideoPreload) return;
                playWhenBuffered();
              }}
              onProgress={() => {
                if (needsLargeVideoPreload) return;
                playWhenBuffered();
              }}
              onCanPlay={event => {
                setVideoLoading(false);
                setVideoError("");
                if (needsLargeVideoPreload) {
                  event.currentTarget.pause();
                  return;
                }
                startChannelPlayback();
              }}
              onLoadedData={() => {
                setVideoLoading(false);
                setVideoError("");
                startChannelPlayback();
              }}
              onPlaying={() => {
                const video = videoRef.current;
                if (video) {
                  playbackStartedRef.current = true;
                  lastAllowedPlaybackTimeRef.current = Number(video.currentTime) || 0;
                }
                const playbackKey = `${channelId}:${currentItem?.id || ""}:${videoSrc}`;
                if (video && currentItem && anchoredPlaybackKeyRef.current !== playbackKey) {
                  if (!mobileLandscapeSafariProfile || syncedVideoSrcRef.current !== videoSrc) {
                    syncVideoToLiveOffset(true);
                  }
                  anchoredPlaybackKeyRef.current = playbackKey;
                  pendingTransitionStartRef.current = false;
                  syncedVideoSrcRef.current = videoSrc;
                }
                setPlaybackLocked(true);
                setVideoLoading(false);
                setVideoError("");
              }}
              onPause={() => {
                const video = videoRef.current;
                if (!playbackLocked || liveAnnouncementOnline || video?.ended) return;
                keepVideoPlaying();
              }}
              onEnded={handleVideoEnded}
              onTimeUpdate={event => {
                if (!seekingLockRef.current) {
                  lastAllowedPlaybackTimeRef.current = Number(event.currentTarget.currentTime) || 0;
                }
              }}
              onSeeking={event => {
                const video = event.currentTarget;
                const allowedTime = lastAllowedPlaybackTimeRef.current;
                if (!video || !playbackStartedRef.current || video.ended || seekingLockRef.current) return;
                if (Date.now() < programmaticSeekUntilRef.current) return;
                seekingLockRef.current = true;
                try { video.currentTime = allowedTime; } catch {}
                window.setTimeout(() => { seekingLockRef.current = false; }, 0);
              }}
              onSeeked={event => {
                const video = event.currentTarget;
                const allowedTime = lastAllowedPlaybackTimeRef.current;
                if (!video || !playbackStartedRef.current || video.ended || seekingLockRef.current) return;
                if (Date.now() < programmaticSeekUntilRef.current) {
                  lastAllowedPlaybackTimeRef.current = Number(video.currentTime) || allowedTime;
                  return;
                }
                if (Math.abs((Number(video.currentTime) || 0) - allowedTime) <= 0.35) return;
                seekingLockRef.current = true;
                try { video.currentTime = allowedTime; } catch {}
                window.setTimeout(() => { seekingLockRef.current = false; }, 0);
              }}
              onWaiting={showBufferingIfNeeded}
              onStalled={recoverFromMobileLandscapeStall}
              onError={() => setVideoError("This video did not load. Try Next, Shuffle, or Retry.")}
              onVolumeChange={handleVideoVolumeChange}
              style={{
                width: "100%",
                height: "100%",
                maxHeight: 520,
                background: "#000",
                display: "block",
                objectFit: stretchVideoFullscreen ? "fill" : "contain"
              }}
            />
            <button
              type="button"
              className="fuits-mobile-landscape-audio-hitbox"
              aria-label={playerMuted ? "Unmute video" : "Mute video"}
              onPointerUp={toggleMobileLandscapeAudio}
              onClick={toggleMobileLandscapeAudio}
            />
            <button
              type="button"
              className="fuits-mobile-landscape-stretch-exit"
              aria-label="Exit stretch fullscreen"
              onClick={exitStretchVideoFullscreen}
            >
              x
            </button>
            {needsLargeVideoPreload && (
              <div style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,.78)",
                color: "#fef3c7",
                fontSize: 18,
                fontWeight: 1000,
                textAlign: "center",
                padding: 18,
                pointerEvents: "none"
              }}>
                Preloading {largePreloadProgress}%
              </div>
            )}
          </div>
          )}
          {(videoLoading || videoError) && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 10px",
              color: videoError ? "#fecaca" : "#bfdbfe",
              background: videoError ? "rgba(127,29,29,.36)" : "rgba(30,64,175,.24)",
              borderTop: "1px solid rgba(148,163,184,.16)",
              fontSize: 12,
              fontWeight: 900,
              lineHeight: 1.3
            }}>
              <span>{videoError || "Loading stream..."}</span>
              <button
                onClick={() => restartCurrentVideo(true)}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "#22c55e",
                  color: "#04111d",
                  padding: "7px 9px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 1000,
                  whiteSpace: "nowrap"
                }}
              >
                Restart Video
              </button>
              {videoError && (
                <button
                  onClick={retryVideo}
                  style={{
                    border: "1px solid rgba(255,255,255,.24)",
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "#111827",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 900
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {needsLargeVideoPreload && (
            <div style={{
              display: "grid",
              gap: 8,
              padding: "10px",
              color: "#fef3c7",
              background: "rgba(120,53,15,.42)",
              borderTop: "1px solid rgba(251,191,36,.32)",
              fontSize: 12,
              fontWeight: 900,
              lineHeight: 1.3
            }}>
              <span>Large file preloading from the live timestamp: {largePreloadProgress}%</span>
              <button
                type="button"
                onClick={preloadLargeVideoFromTimestamp}
                disabled={largePreloadActive}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: largePreloadActive ? "#64748b" : "#facc15",
                  color: "#111827",
                  padding: "8px 10px",
                  fontWeight: 1000,
                  cursor: largePreloadActive ? "default" : "pointer"
                }}
              >
                {largePreloadActive ? `Preloading ${largePreloadProgress}%` : "Preload now"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{
          minHeight: 260,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: 900,
          padding: 16,
          textAlign: "center"
        }}>
          {status}
        </div>
      )}
      <div className="fuits-video-title" style={{
        padding: "8px 10px 10px",
        color: "#cbd5e1",
        fontSize: 10,
        fontWeight: 900,
        lineHeight: 1.25,
        minHeight: 46,
        maxHeight: 74,
        overflowY: "auto",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        borderTop: "1px solid rgba(148,163,184,.16)"
      }}>
        {currentItem ? `${channel.channel?.label || "FUITS"} now playing: ${currentItem.title}` : status}
      </div>
    </div>
  );
});

const getWeatherSummary = code => {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storms";
  return "Weather";
};

const getWeatherIconUrl = code => {
  if (code === 0) return "https://openweathermap.org/img/wn/01d@2x.png";
  if (code === 1) return "https://openweathermap.org/img/wn/02d@2x.png";
  if ([2, 3].includes(code)) return "https://openweathermap.org/img/wn/03d@2x.png";
  if ([45, 48].includes(code)) return "https://openweathermap.org/img/wn/50d@2x.png";
  if ([51, 53, 55, 56, 57].includes(code)) return "https://openweathermap.org/img/wn/09d@2x.png";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "https://openweathermap.org/img/wn/10d@2x.png";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "https://openweathermap.org/img/wn/13d@2x.png";
  if ([95, 96, 99].includes(code)) return "https://openweathermap.org/img/wn/11d@2x.png";
  return "https://openweathermap.org/img/wn/02d@2x.png";
};

const getFuitsLiveDeviceId = () => {
  try {
    let deviceId = localStorage.getItem("fuitsLiveDeviceId_v1") || "";
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("fuitsLiveDeviceId_v1", deviceId);
    }
    return deviceId;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

const getFuitsLiveDeviceProfile = () => {
  const userAgent = navigator.userAgent || "";
  const amazonSilkProfile = getFuitsAmazonSilkProfile();
  const platform = navigator.userAgentData?.platform || navigator.platform || "unknown";
  const brands = Array.isArray(navigator.userAgentData?.brands)
    ? navigator.userAgentData.brands.map(brand => `${brand.brand} ${brand.version}`).join(", ")
    : "";
  const width = Math.round(window.screen?.width || window.innerWidth || 0);
  const height = Math.round(window.screen?.height || window.innerHeight || 0);
  const viewportWidth = Math.round(window.innerWidth || 0);
  const viewportHeight = Math.round(window.innerHeight || 0);
  const pixelRatio = Number(window.devicePixelRatio || 1);
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const mobileHint = Boolean(navigator.userAgentData?.mobile);
  const isAndroid = /Android/i.test(userAgent);
  const isIphone = /iPhone/i.test(userAgent);
  const isIpad = /iPad/i.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
  const isWindows = /Windows/i.test(userAgent) || /Win/i.test(platform);
  const isMac = /Macintosh|Mac OS/i.test(userAgent) || /Mac/i.test(platform);
  const isMobileSized = Math.min(width, height) <= 520 || Math.min(viewportWidth, viewportHeight) <= 520;
  const isTabletSized = Math.min(width, height) > 520 && Math.min(width, height) <= 950 && touchPoints > 0;
  const deviceType = amazonSilkProfile.isFireTv ? "TV" : isIpad || isTabletSized ? "Tablet" : (mobileHint || isAndroid || isIphone || isMobileSized ? "Mobile" : "Desktop/Laptop");
  const os = amazonSilkProfile.active ? "Fire OS / Amazon Web" : isIphone || isIpad ? "iOS/iPadOS" : isAndroid ? "Android" : isWindows ? "Windows" : isMac ? "macOS" : platform;
  const browser = amazonSilkProfile.isSilk
    ? `Amazon Silk${amazonSilkProfile.version ? ` ${amazonSilkProfile.version}` : ""}`
    : amazonSilkProfile.active
      ? "Amazon Fire TV Web"
      : /Edg\//i.test(userAgent) ? "Edge" : /OPR\//i.test(userAgent) ? "Opera" : /Firefox\//i.test(userAgent) ? "Firefox" : /Chrome\//i.test(userAgent) ? "Chrome" : /Safari\//i.test(userAgent) ? "Safari" : "Unknown browser";
  const modelMatch = userAgent.match(/Android[^;]*;\s*([^;)]+)\)/i);
  const modelHint = amazonSilkProfile.deviceModel || (isIphone ? "iPhone" : isIpad ? "iPad" : modelMatch?.[1]?.replace(/\s+Build\/.*/i, "").trim() || "");

  return {
    deviceType,
    os,
    browser,
    modelHint,
    platform,
    brands,
    screen: `${width}x${height}`,
    viewport: `${viewportWidth}x${viewportHeight}`,
    pixelRatio,
    touchPoints,
    mobileHint,
    amazonSilkProfile: amazonSilkProfile.active ? amazonSilkProfile : null
  };
};

const fetchFuitsLiveOnlineStats = async (baseUrl, extraParams = {}) => {
  const statsUrls = [
    `${window.location.origin.replace(/\/+$/, "")}/online-stats`,
    baseUrl && `${baseUrl.replace(/\/+$/, "")}/online-stats`
  ].filter(Boolean);

  for (const statsBaseUrl of statsUrls) {
    try {
      const params = new URLSearchParams({
        device: getFuitsLiveDeviceId(),
        deviceProfile: JSON.stringify(getFuitsLiveDeviceProfile()),
        cache: String(Date.now()),
        ...extraParams
      });
      const response = await fetch(`${statsBaseUrl}?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) continue;
      const stats = await response.json();
      return {
        devices: Number(stats.devices) || 0,
        households: Number(stats.households) || 0,
        householdDetails: Array.isArray(stats.householdDetails) ? stats.householdDetails : []
      };
    } catch {}
  }

  throw new Error("online stats unavailable");
};

function MusicLibrarySidebar({ accentColor, loggedInUsername, approvedUsers = [], onLogout }) {
  const fuitsLiveTvChannelUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const [musicLibrary, setMusicLibrary] = useState(MUSIC_LIBRARY);
  const [activeGenre, setActiveGenre] = useState("Other");
  const [selectedId, setSelectedId] = useState(musicLibrary[0]?.id || null);
  const [ratings, setRatings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hoursTrackerStaticMusicRatings_v1")) || {}; } catch { return {}; }
  });
  const [musicSearch, setMusicSearch] = useState("");
  const [activeMediaMenu, setActiveMediaMenu] = useState("liveTv");
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [activeMusicView, setActiveMusicView] = useState("library");
  const [musicViewMenuOpen, setMusicViewMenuOpen] = useState(false);
  const [radioFrameVersion, setRadioFrameVersion] = useState(0);
  const [musicChannels, setMusicChannels] = useState([]);
  const [liveTvMenuOpen, setLiveTvMenuOpen] = useState(false);
  const [activeLiveTv, setActiveLiveTv] = useState("fattys");
  const [activeFuitsLiveTvChannel, setActiveFuitsLiveTvChannel] = useState("channel-a");
  const [playlistRestartSignal, setPlaylistRestartSignal] = useState(0);
  const [customTvItems, setCustomTvItems] = useState([]);
  const [selectedCustomTvId, setSelectedCustomTvId] = useState(null);
  const [customTvUrl, setCustomTvUrl] = useState("");
  const [owncastOnline, setOwncastOnline] = useState(false);
  const [onlineStats, setOnlineStats] = useState({ devices: null, households: null });
  const [localForecast, setLocalForecast] = useState({ status: "asking", days: [] });
  const [fuitsSchedule, setFuitsSchedule] = useState({ channelLabel: "", items: [], loading: true });
  const [fuitsPlaybackAnchor, setFuitsPlaybackAnchor] = useState(null);
  const [fuitsStretchFullscreenActive, setFuitsStretchFullscreenActive] = useState(false);
  const [fuitsMobileLandscapeProfileActive, setFuitsMobileLandscapeProfileActive] = useState(() => isFuitsMobileLandscapeProfile());
  const [jellyfinSilkFullscreenActive, setJellyfinSilkFullscreenActive] = useState(false);
  const [jellyfinNativeFullscreenActive, setJellyfinNativeFullscreenActive] = useState(false);
  const [jellyfinSoftFullscreenActive, setJellyfinSoftFullscreenActive] = useState(false);
  const [openMusicSections, setOpenMusicSections] = useState({ videos: false, music: false });
  const [zoomedDonationQr, setZoomedDonationQr] = useState(null);
  const jellyfinFrameRef = useRef(null);
  const adultSwimFrameRef = useRef(null);
  const fuitsLiveTvPlayerRef = useRef(null);
  const fuitsScheduleDataRef = useRef(null);
  const jellyfinSilkWakeLockRef = useRef(null);
  const amazonSilkProfile = useMemo(() => getFuitsAmazonSilkProfile(), []);
  const loggedInUserProfile = approvedUsers.find(user =>
    (user.username || "").toUpperCase() === String(loggedInUsername || "").toUpperCase()
  );
  const loggedInProfilePicture = loggedInUserProfile?.profilePicture || "";
  useEffect(() => {
    const handleFuitsBlankPage = event => {
      if (event.data?.type !== "FUITS_SITE_BLANKED") return;

      try {
        const bannedUrl = new URL(event.data.url);
        const allowedHost =
          bannedUrl.hostname === "localhost" ||
          bannedUrl.hostname === "127.0.0.1" ||
          bannedUrl.hostname.endsWith(".trycloudflare.com") ||
          bannedUrl.hostname === "flivetv.qzz.io" ||
          bannedUrl.hostname.endsWith(".flivetv.qzz.io");

        if (allowedHost) {
          bannedUrl.searchParams.set("returnUrl", window.location.href);
          window.location.href = bannedUrl.href;
        }
      } catch {}
    };

    window.addEventListener("message", handleFuitsBlankPage);
    return () => window.removeEventListener("message", handleFuitsBlankPage);
  }, []);

  const activeMusicChannelId = activeMusicView.startsWith("music-channel:")
    ? activeMusicView.slice("music-channel:".length)
    : "";
  const activeMusicChannel = musicChannels.find(channel => channel.id === activeMusicChannelId);
  const currentMusicLibrary = activeMusicChannel ? activeMusicChannel.items || [] : musicLibrary;
  const genres = useMemo(() => Array.from(new Set(currentMusicLibrary.map(item => item.genre || "Other"))), [currentMusicLibrary]);
  const filteredLibrary = useMemo(() => currentMusicLibrary.filter(item => {
    const query = musicSearch.trim().toLowerCase();
    const matchesGenre = (item.genre || "Other") === activeGenre;
    const matchesSearch =
      !query ||
      (item.title || "").toLowerCase().includes(query) ||
      (item.artist || "").toLowerCase().includes(query) ||
      (item.genre || "").toLowerCase().includes(query);
    return matchesGenre && matchesSearch;
  }), [activeGenre, currentMusicLibrary, musicSearch]);

  useEffect(() => {
    try { localStorage.setItem("hoursTrackerStaticMusicRatings_v1", JSON.stringify(ratings)); } catch {}
  }, [ratings]);

  useEffect(() => {
    let cancelled = false;
    const loadMusicLibrary = async () => {
      try {
        const response = await fetch(`${fuitsLiveTvChannelUrl}/music-library.json`, { cache: "no-store" });
        const items = await response.json();
        if (!cancelled && Array.isArray(items) && items.length) {
          setMusicLibrary(items);
        }
      } catch {}
    };

    loadMusicLibrary();
  }, [fuitsLiveTvChannelUrl]);

  useEffect(() => {
    let cancelled = false;
    const loadMusicChannels = async () => {
      try {
        const response = await fetch(`${fuitsLiveTvChannelUrl}/music-channels.json`, { cache: "no-store" });
        const channels = await response.json();
        if (!cancelled && Array.isArray(channels)) {
          setMusicChannels(channels);
        }
      } catch {
        if (!cancelled) setMusicChannels([]);
      }
    };

    loadMusicChannels();
    const timer = setInterval(loadMusicChannels, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fuitsLiveTvChannelUrl]);

  useEffect(() => {
    if (!genres.includes(activeGenre)) {
      setActiveGenre(genres[0] || "Other");
    }
  }, [genres, activeGenre]);

  useEffect(() => {
    if (!filteredLibrary.find(item => item.id === selectedId)) {
      setSelectedId(filteredLibrary[0]?.id || currentMusicLibrary[0]?.id || null);
    }
  }, [activeGenre, musicSearch, currentMusicLibrary, filteredLibrary, selectedId]);

  const selectedTrack =
    currentMusicLibrary.find(item => item.id === selectedId) ||
    filteredLibrary[0] ||
    currentMusicLibrary[0] ||
    null;

  useEffect(() => {
    let cancelled = false;
    const checkOwncastStatus = async () => {
      try {
        const response = await fetch(`${fuitsLiveTvChannelUrl}/owncast-status`, { cache: "no-store" });
        const status = await response.json();
        if (!cancelled) setOwncastOnline(Boolean(status.online));
      } catch {
        if (!cancelled) setOwncastOnline(false);
      }
    };
    checkOwncastStatus();
    const timer = setInterval(checkOwncastStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!fuitsLiveTvChannelUrl) return undefined;

    let cancelled = false;

    const loadOnlineStats = async () => {
      try {
        const stats = await fetchFuitsLiveOnlineStats(fuitsLiveTvChannelUrl);
        if (!cancelled) {
          setOnlineStats(stats);
        }
      } catch {
        if (!cancelled) setOnlineStats(current => current.devices === null ? { devices: null, households: null } : current);
      }
    };

    loadOnlineStats();
    const timer = setInterval(loadOnlineStats, 12 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fuitsLiveTvChannelUrl]);

  useEffect(() => {
    const reportWeatherLocation = async (status, coords = null, timezone = "") => {
      if (!fuitsLiveTvChannelUrl) return;
      const params = new URLSearchParams({
        device: getFuitsLiveDeviceId(),
        deviceProfile: JSON.stringify(getFuitsLiveDeviceProfile()),
        weatherStatus: status,
        cache: String(Date.now())
      });
      if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
        params.set("lat", String(coords.latitude));
        params.set("lon", String(coords.longitude));
        if (timezone) params.set("timezone", timezone);
      }

      try {
        await fetch(`${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/online-stats?${params.toString()}`, { cache: "no-store" });
      } catch {}
    };

    if (!navigator.geolocation) {
      setLocalForecast({ status: "unsupported", days: [] });
      reportWeatherLocation("unsupported");
      return undefined;
    }

    let cancelled = false;
    let weatherStarted = false;
    setLocalForecast({ status: "waiting", days: [] });

    const loadForecastOnce = () => {
      if (cancelled || weatherStarted) return;
      weatherStarted = true;
      setLocalForecast({ status: "asking", days: [] });

      navigator.geolocation.getCurrentPosition(
        async position => {
          if (cancelled) return;
          const { latitude, longitude } = position.coords || {};
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            reportWeatherLocation("unavailable");
            setLocalForecast({ status: "unavailable", days: [] });
            return;
          }

          setLocalForecast({ status: "loading", days: [] });
          try {
            const params = new URLSearchParams({
              latitude: String(latitude),
              longitude: String(longitude),
              daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
              temperature_unit: "fahrenheit",
              timezone: "auto",
              forecast_days: "3"
            });
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
            if (!response.ok) throw new Error("forecast unavailable");
            const data = await response.json();
            reportWeatherLocation("ready", { latitude, longitude }, data?.timezone || "");
            const daily = data?.daily || {};
            const days = (daily.time || []).slice(0, 3).map((date, index) => {
              const code = Number(daily.weather_code?.[index]);
              return {
                date,
                summary: getWeatherSummary(code),
                icon: getWeatherIconUrl(code),
                high: Math.round(Number(daily.temperature_2m_max?.[index])),
                low: Math.round(Number(daily.temperature_2m_min?.[index])),
                rain: Math.round(Number(daily.precipitation_probability_max?.[index] || 0))
              };
            });
            if (!cancelled) setLocalForecast({ status: days.length ? "ready" : "unavailable", days });
          } catch {
            reportWeatherLocation("unavailable", { latitude, longitude });
            if (!cancelled) setLocalForecast({ status: "unavailable", days: [] });
          }
        },
        () => {
          reportWeatherLocation("denied");
          if (!cancelled) setLocalForecast({ status: "denied", days: [] });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
      );
    };

    const idleId = window.setTimeout(loadForecastOnce, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(idleId);
    };
  }, [fuitsLiveTvChannelUrl]);

  const buildFuitsSchedule = useCallback((data, playbackAnchor = fuitsPlaybackAnchor) => {
    const playlist = Array.isArray(data?.playlist) ? data.playlist : [];
    if (!playlist.length) return { channelLabel: data?.channel?.label || "", items: [], loading: false, nextRefreshMs: null };

    const generatedAtMs = Number(data.generatedAtMs) || Date.now();
    const elapsedSinceSnapshot = Math.max(0, (Date.now() - generatedAtMs) / 1000);
    const currentIndex = Math.max(0, Math.min(Number(data.currentIndex) || 0, playlist.length - 1));
    const currentDuration = Math.max(1, Number(playlist[currentIndex]?.duration) || 1);
    const anchorApplies =
      playbackAnchor?.channelId === activeFuitsLiveTvChannel &&
      playbackAnchor?.itemId === playlist[currentIndex]?.id;
    const anchoredOffset = anchorApplies
      ? Math.max(0, (Date.now() - playbackAnchor.startedAtMs) / 1000)
      : null;
    const liveOffset = Math.min(
      currentDuration - 1,
      Math.max(0, anchoredOffset ?? ((Number(data.offsetSeconds) || 0) + elapsedSinceSnapshot))
    );
    const horizonMs = Date.now() + 3 * 60 * 60 * 1000;
    const nextRefreshMs = Math.max(1000, (currentDuration - liveOffset) * 1000 + 1500);
    const schedule = [];
    let startMs = Date.now() - liveOffset * 1000;
    let index = currentIndex;
    let guard = 0;

    while (startMs < horizonMs && guard < Math.max(playlist.length * 4, 20)) {
      const item = playlist[index];
      if (!item) break;
      const durationSeconds = Math.max(1, Number(item.duration) || 1);
      const endMs = startMs + durationSeconds * 1000;
      if (endMs > Date.now()) {
        schedule.push({
          id: `${item.id || item.title || index}-${startMs}`,
          title: item.title || "Untitled",
          startMs,
          durationSeconds,
          current: schedule.length === 0 && index === currentIndex
        });
      }
      startMs = endMs;
      index = (index + 1) % playlist.length;
      guard += 1;
    }

    return {
      channelLabel: data?.channel?.label || "",
      items: schedule.slice(0, 7),
      loading: false,
      nextRefreshMs
    };
  }, [activeFuitsLiveTvChannel]);

  useEffect(() => {
    if (!fuitsLiveTvChannelUrl || !activeFuitsLiveTvChannel) {
      setFuitsSchedule({ channelLabel: "", items: [], loading: false });
      return undefined;
    }

    let cancelled = false;
    let refreshTimer = null;
    const loadFuitsSchedule = async () => {
      try {
        const scheduleUrls = [
          `${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/channel.json?channel=${encodeURIComponent(activeFuitsLiveTvChannel)}&cache=${Date.now()}`
        ];
        let data = null;
        for (const scheduleUrl of scheduleUrls) {
          try {
            const response = await fetch(scheduleUrl, { cache: "no-store" });
            if (!response.ok) continue;
            data = await response.json();
            break;
          } catch {}
        }
        if (!data) throw new Error("schedule unavailable");
        if (!cancelled) {
          fuitsScheduleDataRef.current = data;
          const schedule = buildFuitsSchedule(data);
          setFuitsSchedule(schedule);
          if (refreshTimer) clearTimeout(refreshTimer);
          if (schedule.nextRefreshMs) {
            refreshTimer = setTimeout(loadFuitsSchedule, schedule.nextRefreshMs);
          }
        }
      } catch {
        if (!cancelled) setFuitsSchedule(current => ({ ...current, loading: false }));
      }
    };

    setFuitsSchedule(current => ({ ...current, loading: true }));
    refreshTimer = setTimeout(loadFuitsSchedule, 4500);
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [activeFuitsLiveTvChannel, buildFuitsSchedule, fuitsLiveTvChannelUrl]);

  useEffect(() => {
    if (!fuitsPlaybackAnchor || !fuitsScheduleDataRef.current) return;
    setFuitsSchedule(buildFuitsSchedule(fuitsScheduleDataRef.current, fuitsPlaybackAnchor));
  }, [buildFuitsSchedule, fuitsPlaybackAnchor]);

  const filteredVideos = filteredLibrary.filter(item =>
    item.type === "video" || (item.src || "").toLowerCase().endsWith(".mp4")
  );
  const filteredMusic = filteredLibrary.filter(item =>
    item.type === "audio" || (item.src || "").toLowerCase().endsWith(".mp3")
  );
  const separateFuitsLiveTvChannelIds = useMemo(() => new Set([
    "channel-adult-relax-time",
    "channel-adultrelaxtime",
    "channel-smoking-channel",
    "channel-smokingchannel"
  ]), []);
  const isSeparateFuitsLiveTvChannel = useCallback(channel => {
    const label = (channel.label || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return separateFuitsLiveTvChannelIds.has(channel.id) || label === "adultrelaxtime" || label === "smokingchannel";
  }, [separateFuitsLiveTvChannelIds]);
  const liveTvOptions = [
    { id: "fattys", label: "FUITS LIVE TV WORLD", heading: "FUITS LIVE TV WORLD", custom: true },
    { id: "adultRelax", label: "ADULT RELAX TIME", heading: "ADULT RELAX TIME", custom: true, liveChat: true },
    { id: "smokingChannel", label: "SMOKING CHANNEL", heading: "SMOKING CHANNEL", custom: true, defaultChannel: "channel-smoking-channel" },
    { id: "fuit", label: "Open Fuit LIVE TV", heading: "SPORTS + CABLE TV", url: "https://thetvapp.to/", embed: false },
    { id: "athf", label: "ADULT SWIM ZONE", heading: "ADULT SWIM ZONE", url: "https://www.adultswim.com/streams/aqua-teen-hunger-force", embed: true },
    { id: "youtube", label: "YOUTUBE", heading: "YOUTUBE", url: "https://www.youtube.com/", embed: false },
    { id: "southpark", label: "SOUTH PARK WORLD", heading: "SOUTH PARK WORLD", url: "https://southpark.cc.com/seasons/south-park", embed: false },
    { id: "jellyfin", label: "FUIT JELLYFIN", heading: "FUIT JELLYFIN", url: "https://jellyfin.flivetv.qzz.io/web/", embed: true }
  ];
  const fuitsLiveTvChannels = useMemo(() => ([
    { id: "channel-a", label: "Channel A" },
    { id: "channel-b", label: "Channel B" },
    { id: "channel-fuit-mom-channel", label: "FUIT MOM CHANNEL" },
    { id: "channel-fuits-live-tv-world", label: "FUITS LIVE TV WORLD" },
    { id: "channel-movie-night", label: "MOVIE NIGHT" },
    { id: "channel-new-releases", label: "NEW RELEASES" },
    { id: "channel-sleep-chill", label: "SLEEP CHILL" }
  ]), []);
  const [liveFuitsLiveTvChannels, setLiveFuitsLiveTvChannels] = useState(fuitsLiveTvChannels);
  const activeLiveTvOption = liveTvOptions.find(option => option.id === activeLiveTv) || liveTvOptions[0];
  const activeLiveTvFixedChannel = Boolean(activeLiveTvOption.defaultChannel);
  const activeFuitsLiveTvChannelLabel = (
    liveFuitsLiveTvChannels.find(channel => channel.id === activeFuitsLiveTvChannel) ||
    fuitsLiveTvChannels.find(channel => channel.id === activeFuitsLiveTvChannel)
  )?.label || activeFuitsLiveTvChannel;
  const activeFuitsLiveTvChannelNameLength = activeFuitsLiveTvChannelLabel.length;
  const activeFuitsLiveTvChannelSelectFontSize =
    activeFuitsLiveTvChannelNameLength > 34 ? 8 :
    activeFuitsLiveTvChannelNameLength > 26 ? 9 :
    activeFuitsLiveTvChannelNameLength > 18 ? 10 : 11;
  const activeFuitsLiveTvChannelSelectHeight =
    activeFuitsLiveTvChannelNameLength > 34 ? 38 :
    activeFuitsLiveTvChannelNameLength > 26 ? 36 :
    activeFuitsLiveTvChannelNameLength > 18 ? 34 : 30;
  useEffect(() => {
    if (typeof window === "undefined") {
      setFuitsMobileLandscapeProfileActive(isFuitsMobileLandscapeProfile());
      return undefined;
    }

    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia(FUITS_MOBILE_LANDSCAPE_QUERY) : null;
    const orientationQuery = typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)") : null;
    const updateMobileLandscapeProfile = () => setFuitsMobileLandscapeProfileActive(isFuitsMobileLandscapeProfile());
    updateMobileLandscapeProfile();

    if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", updateMobileLandscapeProfile);
    else if (mediaQuery?.addListener) mediaQuery.addListener(updateMobileLandscapeProfile);
    if (orientationQuery?.addEventListener) orientationQuery.addEventListener("change", updateMobileLandscapeProfile);
    else if (orientationQuery?.addListener) orientationQuery.addListener(updateMobileLandscapeProfile);
    window.addEventListener("resize", updateMobileLandscapeProfile);
    window.addEventListener("orientationchange", updateMobileLandscapeProfile);
    window.visualViewport?.addEventListener?.("resize", updateMobileLandscapeProfile);

    return () => {
      if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener("change", updateMobileLandscapeProfile);
      else if (mediaQuery?.removeListener) mediaQuery.removeListener(updateMobileLandscapeProfile);
      if (orientationQuery?.removeEventListener) orientationQuery.removeEventListener("change", updateMobileLandscapeProfile);
      else if (orientationQuery?.removeListener) orientationQuery.removeListener(updateMobileLandscapeProfile);
      window.removeEventListener("resize", updateMobileLandscapeProfile);
      window.removeEventListener("orientationchange", updateMobileLandscapeProfile);
      window.visualViewport?.removeEventListener?.("resize", updateMobileLandscapeProfile);
    };
  }, []);
  const musicViewOptions = [
    { id: "library", label: "Music Library" },
    { id: "radio", label: "FUIT RADIO WORLD" },
    ...musicChannels
      .filter(channel => (channel.items || []).length > 0)
      .map(channel => ({ id: `music-channel:${channel.id}`, label: channel.label })),
  ];
  const activeMusicViewOption = musicViewOptions.find(option => option.id === activeMusicView) || musicViewOptions[0];
  const isRadioMusicView = activeMusicView === "radio" || activeMusicView.startsWith("radio:");
  const activeRadioChannelId = activeMusicView.startsWith("radio:") ? activeMusicView.slice("radio:".length) : "";
  const radioIframeParams = new URLSearchParams();
  if (activeRadioChannelId) radioIframeParams.set("channel", activeRadioChannelId);
  const radioIframeQuery = radioIframeParams.toString();
  const radioIframeSrc = `${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/fuits-radio${radioIframeQuery ? `?${radioIframeQuery}` : ""}`;

  useEffect(() => {
    if (!fuitsLiveTvChannelUrl) {
      setLiveFuitsLiveTvChannels(fuitsLiveTvChannels);
      return undefined;
    }

    let canceled = false;
    const loadLiveChannels = async () => {
      try {
        const response = await fetch(`${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/channels.json?cache=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;

        const parsedChannels = (await response.json())
          .map(channel => ({
            id: channel.id || "",
            label: channel.label || ""
          }))
          .filter(channel => channel.id && channel.label);

        if (!parsedChannels.length || canceled) return;

        const mergedChannels = [...fuitsLiveTvChannels];
        const seen = new Set(mergedChannels.map(channel => channel.id));
        parsedChannels.forEach(channel => {
          if (!seen.has(channel.id)) {
            seen.add(channel.id);
            mergedChannels.push(channel);
          }
        });

        const visibleChannels = mergedChannels.filter(channel => !isSeparateFuitsLiveTvChannel(channel));
        setLiveFuitsLiveTvChannels(visibleChannels);
        if (!seen.has(activeFuitsLiveTvChannel) && !separateFuitsLiveTvChannelIds.has(activeFuitsLiveTvChannel)) {
          setActiveFuitsLiveTvChannel((visibleChannels[0] || mergedChannels[0]).id);
        }
      } catch {
        if (!canceled) {
          setLiveFuitsLiveTvChannels(fuitsLiveTvChannels);
        }
      }
    };

    loadLiveChannels();
    return () => {
      canceled = true;
    };
  }, [activeFuitsLiveTvChannel, fuitsLiveTvChannelUrl, fuitsLiveTvChannels, isSeparateFuitsLiveTvChannel, separateFuitsLiveTvChannelIds]);

  useEffect(() => {
    if (!musicViewOptions.some(option => option.id === activeMusicView)) {
      setActiveMusicView("library");
    }
  }, [activeMusicView, musicViewOptions]);

  const rateTrack = (id, rating) => {
    setRatings(prev => ({ ...prev, [id]: rating }));
  };

  const toggleMusicSection = (section) => {
    setOpenMusicSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const chooseMediaMenu = (menu) => {
    setActiveMediaMenu(menu);
    setMediaMenuOpen(false);
  };

  const chooseMusicView = (view) => {
    setActiveMusicView(view);
    setMusicViewMenuOpen(false);
    if (view === "radio" || view.startsWith("radio:")) {
      setRadioFrameVersion(Date.now());
    }
  };

  const openExternalLink = (url) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getFuitsLiveTvUrl = (path = "") => {
    if (!fuitsLiveTvChannelUrl) return "";
    return `${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}${path}`;
  };

  const fuitsLiveTvVideoUrl = getFuitsLiveTvUrl("/embed/video");
  const fuitsLiveTvChatUrl = getFuitsLiveTvUrl("/chat-only");
  const fuitsLiveTvChatParams = new URLSearchParams();
  if (activeLiveTvOption.id === "adultRelax") {
    fuitsLiveTvChatParams.set("layout", fuitsMobileLandscapeProfileActive ? "adult-relax-mobile-landscape" : "adult-relax");
  } else if (fuitsMobileLandscapeProfileActive) {
    fuitsLiveTvChatParams.set("layout", "mobile-landscape");
  }
  const fuitsLiveTvChatQuery = fuitsLiveTvChatParams.toString();
  const fuitsLiveTvChatSrc = `${fuitsLiveTvChatUrl || `${fuitsLiveTvChannelUrl}/chat-only`}${fuitsLiveTvChatQuery ? `?${fuitsLiveTvChatQuery}` : ""}`;
  const fuitsLiveTvChatFrameHeight = fuitsMobileLandscapeProfileActive ? 560 : 260;
  const fuitsLiveTvCompactChatFrameHeight = fuitsMobileLandscapeProfileActive ? 560 : 250;

  const releaseJellyfinSilkWakeLock = useCallback(() => {
    const wakeLock = jellyfinSilkWakeLockRef.current;
    jellyfinSilkWakeLockRef.current = null;
    try {
      if (wakeLock && !wakeLock.released) {
        const releaseResult = wakeLock.release?.();
        if (releaseResult?.catch) releaseResult.catch(() => {});
      }
    } catch {}
  }, []);

  const requestJellyfinSilkWakeLock = useCallback(async () => {
    if (!amazonSilkProfile.active || typeof navigator === "undefined" || typeof document === "undefined") return;
    if (document.visibilityState === "hidden") return;

    const currentWakeLock = jellyfinSilkWakeLockRef.current;
    if (currentWakeLock && !currentWakeLock.released) return;

    try {
      const wakeLock = await navigator.wakeLock?.request?.("screen");
      if (!wakeLock) return;
      jellyfinSilkWakeLockRef.current = wakeLock;
      wakeLock.addEventListener?.("release", () => {
        if (jellyfinSilkWakeLockRef.current === wakeLock) {
          jellyfinSilkWakeLockRef.current = null;
        }
      });
    } catch {}
  }, [amazonSilkProfile.active]);

  const exitJellyfinFullscreen = useCallback(async () => {
    setJellyfinSoftFullscreenActive(false);
    setJellyfinNativeFullscreenActive(false);
    setJellyfinSilkFullscreenActive(false);

    const fullscreenElement = getFuitsFullscreenElement();
    if (fullscreenElement !== jellyfinFrameRef.current) return;

    const exitFullscreen =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.webkitCancelFullScreen ||
      document.msExitFullscreen;

    try {
      const exitResult = exitFullscreen?.call(document);
      if (exitResult?.then) await exitResult;
    } catch {}
  }, []);

  const sendJellyfinSilkKeepAlive = useCallback(() => {
    if (!amazonSilkProfile.active || activeLiveTvOption.id !== "jellyfin") return;
    requestJellyfinSilkWakeLock();

    try {
      document.documentElement?.setAttribute("data-fuits-silk-jellyfin-keepalive", String(Date.now()));
    } catch {}

    try {
      const src = jellyfinFrameRef.current?.src || activeLiveTvOption.url || "";
      if (!src || typeof window === "undefined") return;
      const pingUrl = new URL(src, window.location.href);
      pingUrl.pathname = "/System/Ping";
      pingUrl.search = "";
      pingUrl.searchParams.set("fuitsSilkKeepAwake", String(Date.now()));
      fetch(pingUrl.href, { method: "GET", mode: "no-cors", cache: "no-store", keepalive: true }).catch(() => {});
    } catch {}
  }, [activeLiveTvOption.id, activeLiveTvOption.url, amazonSilkProfile.active, requestJellyfinSilkWakeLock]);

  useEffect(() => {
    if (!amazonSilkProfile.active || !jellyfinSilkFullscreenActive) return undefined;

    let cancelled = false;
    const frame = jellyfinFrameRef.current;
    const keepAlive = () => {
      if (cancelled) return;
      const fullscreenElement = getFuitsFullscreenElement();
      if (fullscreenElement && frame && fullscreenElement !== frame) {
        setJellyfinSilkFullscreenActive(false);
        return;
      }
      sendJellyfinSilkKeepAlive();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") keepAlive();
      else releaseJellyfinSilkWakeLock();
    };
    const handleFullscreenChange = () => {
      const fullscreenElement = getFuitsFullscreenElement();
      if (!fullscreenElement || (frame && fullscreenElement !== frame)) {
        setJellyfinSilkFullscreenActive(false);
        return;
      }
      keepAlive();
    };

    keepAlive();
    const keepAliveTimer = window.setInterval(keepAlive, FUITS_SILK_JELLYFIN_KEEPALIVE_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      cancelled = true;
      window.clearInterval(keepAliveTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      releaseJellyfinSilkWakeLock();
    };
  }, [amazonSilkProfile.active, jellyfinSilkFullscreenActive, releaseJellyfinSilkWakeLock, sendJellyfinSilkKeepAlive]);

  useEffect(() => {
    if (!jellyfinSoftFullscreenActive || typeof document === "undefined") return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.classList.add("fuits-jellyfin-soft-fullscreen-active");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("fuits-jellyfin-soft-fullscreen-active");
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [jellyfinSoftFullscreenActive]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleFullscreenChange = () => {
      const frameIsFullscreen = getFuitsFullscreenElement() === jellyfinFrameRef.current;
      setJellyfinNativeFullscreenActive(frameIsFullscreen);
      if (frameIsFullscreen) setJellyfinSoftFullscreenActive(false);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if ((!fuitsMobileLandscapeProfileActive || activeLiveTvOption.id !== "jellyfin") && jellyfinSoftFullscreenActive) {
      setJellyfinSoftFullscreenActive(false);
    }
  }, [activeLiveTvOption.id, fuitsMobileLandscapeProfileActive, jellyfinSoftFullscreenActive]);

  const runFuitsOwnerCommand = async (command) => {
    if (!fuitsLiveTvChannelUrl) return;
    const password = window.prompt(`${command.label} password`);
    if (!password) return;
    if (command.confirm && !window.confirm(command.confirm)) return;

    try {
      const response = await fetch(getFuitsLiveTvUrl(command.path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command.body(password))
      });

      if (!response.ok) {
        window.alert(`${command.label} failed. Check the password and tunnel.`);
        return;
      }

      window.alert(command.success);
    } catch {
      window.alert(`${command.label} failed. Check the Cloudflare tunnel.`);
    }
  };

  const restartFuitsChannelWithPassword = async () => {
    const password = window.prompt("Restart password");
    if (!password) return;
    try {
      const response = await fetch(getFuitsLiveTvUrl("/admin/unlock"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error("Wrong password");
    } catch {
      window.alert("Restart blocked. Password required.");
      return;
    }
    setPlaylistRestartSignal(value => value + 1);
  };

  const backFuitsChannelWithPassword = async () => {
    if (!fuitsLiveTvChannelUrl) return;
    const password = window.prompt("Back password");
    if (!password) return;

    try {
      const response = await fetch(getFuitsLiveTvUrl("/admin/previous"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channel: activeFuitsLiveTvChannel })
      });

      if (!response.ok) {
        window.alert("Back failed. Check the password and tunnel.");
        return;
      }

      setPlaylistRestartSignal(value => value + 1);
    } catch {
      window.alert("Back failed. Check the Cloudflare tunnel.");
    }
  };

  const fuitsOwnerCommands = [
    {
      label: "Owner",
      path: "/admin/site-blank",
      body: password => ({ password, blank: true }),
      confirm: "Blank the FUITS site for everyone?",
      success: "FUITS site blanked."
    },
    {
      label: "Shuffle",
      path: "/admin/shuffle",
      body: password => ({ password }),
      success: "Playlist shuffled."
    },
    {
      label: "Next",
      path: "/admin/next",
      body: password => ({ password, channel: activeFuitsLiveTvChannel }),
      success: "Next video started."
    },
    {
      label: "Restart",
      localAction: restartFuitsChannelWithPassword
    }
  ];

  const renderFuitsOwnerControls = () => (
    <div className="fuits-owner-controls" style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 6,
      width: "100%",
      marginTop: 6
    }}>
      {fuitsOwnerCommands.map(command => (
        <button
          type="button"
          className="fuits-owner-control-button"
          key={command.label}
          onClick={() => command.localAction ? command.localAction() : runFuitsOwnerCommand(command)}
          style={{
            border: "1px solid rgba(34,211,238,.4)",
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(187,247,208,.95), rgba(56,189,248,.95))",
            color: "#020617",
            padding: "7px 5px",
            fontSize: 11,
            lineHeight: 1.05,
            fontWeight: 1000,
            cursor: "pointer",
            boxShadow: "0 8px 18px rgba(34,211,238,.14)"
          }}
        >
          {command.label}
        </button>
      ))}
    </div>
  );

  const addCustomTvItem = (item) => {
    setCustomTvItems(prev => [item, ...prev]);
    setSelectedCustomTvId(item.id);
  };

  const addCustomTvUrl = () => {
    const url = customTvUrl.trim();
    if (!url) return;
    addCustomTvItem({
      id: `custom_tv_${Date.now()}`,
      title: url.split("/").pop() || "Custom stream",
      src: url
    });
    setCustomTvUrl("");
  };

  const allCustomTvItems = [...customTvItems, ...FATTYS_LIVE_TV];
  const selectedCustomTvItem =
    allCustomTvItems.find(item => item.id === selectedCustomTvId) ||
    allCustomTvItems[0] ||
    null;

  const openFrameFullscreen = async (frame) => {
    if (!frame) return false;
    const requestFullscreen =
      frame.requestFullscreen ||
      frame.webkitRequestFullscreen ||
      frame.msRequestFullscreen;
    if (requestFullscreen) {
      try {
        const fullscreenResult = requestFullscreen.call(frame);
        if (fullscreenResult?.then) await fullscreenResult;
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const openJellyfinFullscreen = async () => {
    const frame = jellyfinFrameRef.current;
    if (!frame) return;

    const fullscreenElement = getFuitsFullscreenElement();
    if (jellyfinSoftFullscreenActive || fullscreenElement === frame) {
      await exitJellyfinFullscreen();
      return;
    }

    const fullscreenStarted = await openFrameFullscreen(frame);
    window.setTimeout(() => {
      const frameIsFullscreen = getFuitsFullscreenElement() === frame;
      setJellyfinNativeFullscreenActive(frameIsFullscreen);
      if (frameIsFullscreen) {
        if (amazonSilkProfile.active) {
          setJellyfinSilkFullscreenActive(true);
          sendJellyfinSilkKeepAlive();
        }
        return;
      }

      if (fuitsMobileLandscapeProfileActive) {
        setJellyfinSoftFullscreenActive(true);
      }
    }, fullscreenStarted ? 120 : 0);
  };

  const openAdultSwimFullscreen = () => {
    openFrameFullscreen(adultSwimFrameRef.current);
  };

  const jellyfinFullscreenActive = jellyfinSoftFullscreenActive || jellyfinNativeFullscreenActive || jellyfinSilkFullscreenActive;

  return (
    <aside className={`music-library-desktop-sidebar${amazonSilkProfile.active ? " fuits-amazon-silk-profile" : ""}${fuitsStretchFullscreenActive ? " fuits-live-tv-stretching-fullscreen" : ""}${jellyfinSilkFullscreenActive ? " fuits-jellyfin-silk-fullscreen-active" : ""}${jellyfinSoftFullscreenActive ? " fuits-jellyfin-soft-fullscreen-active" : ""}`} style={{
      position: "fixed",
      right: "calc(18px * var(--flive-scale, 1))",
      top: "calc(18px * var(--flive-scale, 1))",
      bottom: "calc(18px * var(--flive-scale, 1))",
      width: "min(calc(460px * var(--flive-scale, 1) * var(--flive-tv-width-scale, 1)), calc((390px * var(--flive-scale, 1) * var(--flive-schedule-right-scale, var(--flive-info-right-scale, 1))) - (30px * var(--flive-scale, 1))))",
      zIndex: 4,
      borderRadius: "calc(20px * var(--flive-scale, 1))",
      border: "1px solid rgba(148,163,184,0.2)",
      background: "linear-gradient(180deg, rgba(15,23,42,.94), rgba(2,6,23,.96))",
      boxShadow: "0 18px 48px rgba(0,0,0,0.46)",
      padding: "calc(14px * var(--flive-scale, 1))",
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }}>
      <style>{`
        @media (max-width: 360px) { .music-library-desktop-sidebar { display: none !important; } }
        @media (max-width: 360px) {
          .fuits-online-indicator,
          .fuits-weather-panel,
          .fuits-schedule-panel { display: none !important; }
        }
        @media (max-width: 1350px) and (max-height: 760px) {
          .music-library-desktop-sidebar > :not(style):not(.fuits-online-indicator):not(.fuits-weather-panel):not(.fuits-schedule-panel) {
            zoom: var(--flive-tv-content-scale, var(--flive-panel-content-scale, 1));
          }
          .fuits-online-indicator > :not(style),
          .fuits-weather-panel > :not(style) {
            zoom: var(--flive-info-content-scale, var(--flive-panel-content-scale, 1));
          }
          .fuits-schedule-panel > :not(style) {
            zoom: var(--flive-schedule-content-scale, var(--flive-info-content-scale, var(--flive-panel-content-scale, 1)));
          }
        }
        @media (hover: hover) and (pointer: fine) and (min-width: 900px) and (max-width: 1400px) and (max-height: 790px),
          (hover: hover) and (pointer: fine) and (min-device-width: 900px) and (max-device-height: 820px) {
          .music-library-desktop-sidebar > :not(style):not(.fuits-online-indicator):not(.fuits-weather-panel):not(.fuits-schedule-panel) {
            zoom: var(--flive-tv-content-scale, var(--flive-panel-content-scale, 1)) !important;
          }
          .music-library-desktop-sidebar button {
            padding: var(--flive-tv-button-padding, 5px 7px) !important;
            border-radius: var(--flive-tv-button-radius, 9px) !important;
            font-size: var(--flive-tv-button-font-size, 9px) !important;
            line-height: var(--flive-tv-button-line-height, 1.08) !important;
            letter-spacing: var(--flive-tv-button-letter-spacing, .25px) !important;
          }
          .fuits-live-tv-scroll {
            gap: var(--flive-tv-scroll-gap, 10px) !important;
            padding: var(--flive-tv-scroll-padding, 12px 2px 6px) !important;
          }
          .fuits-live-tv-heading {
            font-size: var(--flive-tv-heading-font-size, 13px) !important;
            line-height: var(--flive-tv-heading-line-height, 1.45) !important;
          }
          .fuits-live-tv-channel-controls {
            gap: var(--flive-tv-channel-controls-gap, 6px) !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select-wrap {
            flex: 0 0 var(--flive-tv-channel-select-height, 58px) !important;
            min-height: var(--flive-tv-channel-select-height, 58px) !important;
            height: var(--flive-tv-channel-select-height, 58px) !important;
            block-size: var(--flive-tv-channel-select-height, 58px) !important;
            min-block-size: var(--flive-tv-channel-select-height, 58px) !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select-display {
            padding: var(--flive-tv-channel-select-display-padding, 2px 42px 2px 12px) !important;
            font-size: var(--flive-tv-channel-select-font-size, 11px) !important;
            line-height: var(--flive-tv-channel-select-line-height, 1.08) !important;
          }
          .fuits-live-tv-panel .fuits-owner-controls {
            gap: var(--flive-tv-owner-controls-gap, 6px) !important;
            margin-top: var(--flive-tv-owner-controls-margin-top, 7px) !important;
          }
          .fuits-live-tv-panel .fuits-owner-control-button {
            min-height: var(--flive-tv-owner-button-min-height, 32px) !important;
            padding: var(--flive-tv-owner-button-padding, 8px 6px) !important;
            font-size: var(--flive-tv-owner-button-font-size, 10px) !important;
            line-height: var(--flive-tv-owner-button-line-height, 1.12) !important;
          }
          .fuits-video-title {
            box-sizing: border-box !important;
            min-height: var(--flive-tv-video-title-min-height, 56px) !important;
            max-height: var(--flive-tv-video-title-max-height, 76px) !important;
            padding: var(--flive-tv-video-title-padding, 7px 8px 10px) !important;
            color: #f8fafc !important;
            font-size: var(--flive-tv-video-title-font-size, 13px) !important;
            font-weight: 1000 !important;
            line-height: var(--flive-tv-video-title-line-height, 1.2) !important;
            overflow-y: var(--flive-tv-video-title-overflow, visible) !important;
            margin-bottom: 2px !important;
            text-shadow: 0 1px 3px rgba(0,0,0,.9) !important;
          }
          iframe[title="FUITS Live TV Chat"],
          .fuits-live-tv-panel .fuits-live-chat-frame {
            flex: var(--flive-tv-chat-flex, 1 1 auto) !important;
            height: var(--flive-tv-chat-height, auto) !important;
            min-height: var(--flive-tv-chat-min-height, 0) !important;
            max-height: var(--flive-tv-chat-max-height, none) !important;
          }
        }
        @media (min-width: 1401px) and (max-height: 1040px) {
          iframe[title="FUITS Live TV Chat"] {
            flex: 1 1 auto !important;
            height: auto !important;
            min-height: 0 !important;
          }
        }
        .fuits-live-tv-channel-select-display {
          display: none;
        }
        @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px) {
          .music-library-desktop-sidebar {
            overflow: visible !important;
          }
          .music-library-desktop-sidebar.fuits-live-tv-stretching-fullscreen {
            z-index: 2147483646 !important;
            overflow: visible !important;
            isolation: isolate;
          }
          .music-library-desktop-sidebar.fuits-live-tv-stretching-fullscreen > .fuits-live-tv-panel {
            position: relative !important;
            z-index: 2147483646 !important;
            isolation: isolate;
          }
          .music-library-desktop-sidebar.fuits-live-tv-stretching-fullscreen > .fuits-online-indicator,
          .music-library-desktop-sidebar.fuits-live-tv-stretching-fullscreen > .fuits-weather-panel,
          .music-library-desktop-sidebar.fuits-live-tv-stretching-fullscreen > .fuits-schedule-panel {
            display: none !important;
            pointer-events: none !important;
          }
          body.fuits-chat-soft-fullscreen-active .music-library-desktop-sidebar {
            z-index: 2147483647 !important;
            overflow: visible !important;
            isolation: isolate;
          }
          body.fuits-chat-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-live-tv-panel {
            position: relative !important;
            z-index: 2147483647 !important;
            isolation: isolate;
          }
          body.fuits-chat-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-online-indicator,
          body.fuits-chat-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-weather-panel,
          body.fuits-chat-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-schedule-panel {
            display: none !important;
            pointer-events: none !important;
          }
          body.adult-relax-room-soft-fullscreen-active .music-library-desktop-sidebar {
            z-index: 2147483647 !important;
            overflow: visible !important;
            isolation: isolate;
          }
          body.adult-relax-room-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-live-tv-panel {
            position: relative !important;
            z-index: 2147483647 !important;
            isolation: isolate;
          }
          body.adult-relax-room-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-online-indicator,
          body.adult-relax-room-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-weather-panel,
          body.adult-relax-room-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-schedule-panel {
            display: none !important;
            pointer-events: none !important;
          }
          body.fuits-jellyfin-soft-fullscreen-active .music-library-desktop-sidebar {
            z-index: 2147483647 !important;
            overflow: visible !important;
            isolation: isolate;
          }
          body.fuits-jellyfin-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-live-tv-panel {
            position: relative !important;
            z-index: 2147483647 !important;
            isolation: isolate;
          }
          body.fuits-jellyfin-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-online-indicator,
          body.fuits-jellyfin-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-weather-panel,
          body.fuits-jellyfin-soft-fullscreen-active .music-library-desktop-sidebar > .fuits-schedule-panel {
            display: none !important;
            pointer-events: none !important;
          }
          .music-library-desktop-sidebar > .fuits-live-tv-panel {
            zoom: 1 !important;
            min-height: 0 !important;
            overflow: visible !important;
            isolation: isolate;
          }
          .fuits-live-tv-scroll {
            gap: 4px !important;
            padding: 3px 1px 4px !important;
            align-items: stretch !important;
            overflow-x: visible !important;
            overflow-y: auto !important;
          }
          .fuits-live-tv-heading {
            font-size: 9px !important;
            line-height: 1.12 !important;
          }
          .fuits-live-tv-menu-wrap {
            z-index: 80 !important;
          }
          .fuits-live-tv-menu {
            position: static !important;
            margin-top: 4px !important;
            max-height: min(230px, calc(100dvh - 126px)) !important;
            overflow-y: auto !important;
            border-radius: 9px !important;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }
          .fuits-live-tv-menu button {
            min-height: 28px !important;
            padding: 7px 9px !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            line-height: 1.2 !important;
            text-align: left !important;
          }
          .fuits-live-tv-panel button,
          .fuits-live-tv-panel select,
          .fuits-live-tv-panel a {
            font-size: 8px !important;
            line-height: 1.08 !important;
            letter-spacing: .25px !important;
          }
          .fuits-live-tv-panel button,
          .fuits-live-tv-panel a {
            padding: 5px 7px !important;
            border-radius: 9px !important;
          }
          .fuits-live-tv-panel .fuits-owner-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin-top: 7px !important;
          }
          .fuits-live-tv-panel .fuits-owner-control-button {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 0 !important;
            min-height: 32px !important;
            height: auto !important;
            padding: 8px 6px !important;
            font-size: 10px !important;
            line-height: 1.12 !important;
            letter-spacing: 0 !important;
            text-align: center !important;
            white-space: normal !important;
            overflow: visible !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
          }
          .fuits-live-tv-panel select {
            min-height: 26px !important;
            padding: 4px 6px !important;
            border-radius: 8px !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select-wrap {
            box-sizing: border-box !important;
            display: block !important;
            position: relative !important;
            width: 100% !important;
            flex: 0 0 var(--fuits-channel-select-height, 58px) !important;
            align-self: stretch !important;
            min-height: var(--fuits-channel-select-height, 58px) !important;
            height: var(--fuits-channel-select-height, 58px) !important;
            max-height: none !important;
            block-size: var(--fuits-channel-select-height, 58px) !important;
            min-block-size: var(--fuits-channel-select-height, 58px) !important;
            border: 1px solid rgba(148,163,184,.42) !important;
            border-radius: 9px !important;
            background-color: #020617 !important;
            background-image:
              linear-gradient(45deg, transparent 50%, #f8fafc 50%),
              linear-gradient(135deg, #f8fafc 50%, transparent 50%),
              linear-gradient(to right, rgba(148,163,184,.28), rgba(148,163,184,.28)) !important;
            background-position:
              calc(100% - 22px) 50%,
              calc(100% - 15px) 50%,
              calc(100% - 35px) 50% !important;
            background-size: 7px 7px, 7px 7px, 1px 18px !important;
            background-repeat: no-repeat !important;
            z-index: 3;
            margin-bottom: 3px !important;
            overflow: hidden !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select-display {
            box-sizing: border-box !important;
            display: flex !important;
            align-items: center !important;
            width: 100% !important;
            min-height: 100% !important;
            padding: 2px 42px 2px 12px !important;
            color: #f8fafc !important;
            font-size: var(--fuits-channel-select-font-size, 11px) !important;
            font-weight: 1000 !important;
            line-height: 1.08 !important;
            letter-spacing: 0 !important;
            text-align: left !important;
            text-transform: uppercase !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            pointer-events: none !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select {
            position: absolute !important;
            inset: 0 !important;
            z-index: 4 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            margin: 0 !important;
            border: 0 !important;
            opacity: 0 !important;
            cursor: pointer !important;
            font-size: 16px !important;
            appearance: none !important;
            -webkit-appearance: none !important;
          }
          .fuits-live-tv-panel .fuits-live-tv-channel-select option {
            font-size: 16px !important;
            font-weight: 1000 !important;
          }
          .fuits-live-tv-channel-controls {
            gap: 4px !important;
            flex-wrap: nowrap !important;
            justify-content: space-between !important;
            position: relative;
            z-index: 2;
          }
          .fuits-live-tv-channel-controls button {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            padding: 4px 5px !important;
            white-space: normal !important;
          }
          .fuits-live-tv-channel-controls button:first-child {
            flex: 0 0 42px !important;
          }
          .fuits-live-tv-panel .fuits-video-shell {
            display: block !important;
            visibility: visible !important;
            height: 126px !important;
            min-height: 126px !important;
            flex: 0 0 126px !important;
            overflow: hidden !important;
            contain: none !important;
            backface-visibility: hidden;
            transform: none !important;
            -webkit-transform: none !important;
          }
          .fuits-live-tv-panel .fuits-video-player,
          .fuits-live-tv-panel .fuits-video-player-stretch {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            background: #000 !important;
            transform: none !important;
            -webkit-transform: none !important;
            backface-visibility: hidden;
            will-change: auto !important;
            touch-action: manipulation;
          }
          .fuits-live-tv-panel .fuits-video-player:fullscreen,
          .fuits-live-tv-panel .fuits-video-player:-webkit-full-screen {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-height: none !important;
            object-fit: contain !important;
            background: #000 !important;
            z-index: 2147483647 !important;
          }
          .fuits-live-tv-panel .fuits-video-player-stretch:fullscreen,
          .fuits-live-tv-panel .fuits-video-player-stretch:-webkit-full-screen {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-height: none !important;
            object-fit: fill !important;
            background: #000 !important;
            z-index: 2147483647 !important;
          }
          .fuits-live-tv-panel .fuits-video-title {
            min-height: 24px !important;
            max-height: 30px !important;
            padding: 3px 6px !important;
            font-size: 8px !important;
            line-height: 1.12 !important;
            overflow-y: hidden !important;
          }
          .fuits-live-tv-panel .fuits-live-chat-frame {
            display: block !important;
            flex: 0 0 560px !important;
            height: 560px !important;
            min-height: 560px !important;
            max-height: none !important;
            background: #020617 !important;
            color-scheme: dark;
          }
        }
        .fuits-live-chat-frame:fullscreen,
        .fuits-live-chat-frame:-webkit-full-screen,
        .fuits-live-chat-frame.fuits-live-chat-frame-soft-fullscreen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          display: block !important;
          flex: none !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-height: 100vh !important;
          min-height: 100dvh !important;
          max-height: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
          background: #020617 !important;
        }
        .fuits-jellyfin-frame:fullscreen,
        .fuits-jellyfin-frame:-webkit-full-screen,
        .fuits-jellyfin-frame.fuits-jellyfin-frame-soft-fullscreen {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483646 !important;
          display: block !important;
          flex: none !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-height: 100vh !important;
          min-height: 100dvh !important;
          max-height: none !important;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #020617 !important;
        }
        .fuits-jellyfin-soft-exit {
          display: none;
        }
        @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px) {
          .fuits-jellyfin-soft-exit {
            position: fixed !important;
            top: max(8px, env(safe-area-inset-top, 0px)) !important;
            right: max(8px, env(safe-area-inset-right, 0px)) !important;
            z-index: 2147483647 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 34px !important;
            padding: 7px 10px !important;
            border: 1px solid rgba(248,250,252,.38) !important;
            border-radius: 9px !important;
            background: rgba(2,6,23,.92) !important;
            color: #f8fafc !important;
            font-size: 10px !important;
            font-weight: 1000 !important;
            line-height: 1 !important;
            text-transform: uppercase !important;
            box-shadow: 0 10px 28px rgba(0,0,0,.45) !important;
          }
        }
        .music-library-desktop-sidebar button:hover { transform: translateY(-1px); }
        @keyframes fuits-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,.62); }
          50% { opacity: .42; transform: scale(.82); box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>

      <div className="fuits-online-indicator" style={{
        position: "fixed",
        right: "calc(430px * var(--flive-scale, 1) * var(--flive-info-right-scale, 1))",
        top: "calc(18px * var(--flive-scale, 1) * var(--flive-online-top-scale, 1))",
        zIndex: 8,
        width: "calc(220px * var(--flive-scale, 1) * var(--flive-info-width-scale, 1))",
        border: "1px solid rgba(239,68,68,.28)",
        borderRadius: "calc(14px * var(--flive-scale, 1))",
        background: "rgba(2,6,23,.88)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
        padding: "calc(10px * var(--flive-scale, 1)) calc(12px * var(--flive-scale, 1))",
        color: "#f8fafc",
        display: "grid",
        gap: 6
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#ef4444",
            animation: "fuits-live-pulse 1.15s ease-in-out infinite",
            flex: "0 0 auto"
          }} />
          <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: .8, textTransform: "uppercase", color: "#fecaca" }}>
            Live Online
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 1000, textTransform: "uppercase", lineHeight: 1.15 }}>
          {onlineStats.devices === null ? "Checking" : onlineStats.devices} Devices Online
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#cbd5e1", textTransform: "uppercase", lineHeight: 1.15 }}>
          {onlineStats.households === null ? "Checking" : onlineStats.households} Households Logged In
        </div>
      </div>

      <div className="fuits-weather-panel" style={{
        position: "fixed",
        right: "calc(430px * var(--flive-scale, 1) * var(--flive-info-right-scale, 1))",
        top: "calc(110px * var(--flive-scale, 1) * var(--flive-weather-top-scale, 1))",
        zIndex: 8,
        width: "calc(220px * var(--flive-scale, 1) * var(--flive-info-width-scale, 1))",
        border: "1px solid rgba(56,189,248,.28)",
        borderRadius: "calc(14px * var(--flive-scale, 1))",
        background: "rgba(2,6,23,.88)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
        padding: "calc(10px * var(--flive-scale, 1)) calc(12px * var(--flive-scale, 1))",
        color: "#f8fafc",
        display: "grid",
        gap: 8
      }}>
        <div style={{ fontSize: 10, fontWeight: 1000, color: "#bae6fd", textTransform: "uppercase", letterSpacing: .7 }}>
          3 Day Forecast
        </div>
        {localForecast.status === "ready" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
            {localForecast.days.map(day => (
              <div key={day.date} style={{
                minWidth: 0,
                display: "grid",
                justifyItems: "center",
                gap: 3,
                color: "#e2e8f0",
                textAlign: "center",
                fontSize: 9,
                fontWeight: 900,
                lineHeight: 1.1
              }}>
                <img
                  src={day.icon}
                  alt={day.summary}
                  loading="lazy"
                  style={{ width: 38, height: 38, objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.38))" }}
                />
                <div style={{ color: "#fef08a", textTransform: "uppercase", fontSize: 10, fontWeight: 1000 }}>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}
                </div>
                <div>{day.summary}</div>
                <div style={{ color: "#bfdbfe" }}>
                  {Number.isFinite(day.high) ? day.high : "--"} / {Number.isFinite(day.low) ? day.low : "--"}
                </div>
                {!!day.rain && <div style={{ color: "#93c5fd" }}>{day.rain}% rain</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", lineHeight: 1.2 }}>
            {localForecast.status === "waiting"
              ? "Weather asks location each page open."
              : localForecast.status === "asking"
                ? "Allow location for local forecast."
                : localForecast.status === "loading"
                  ? "Loading local forecast..."
                  : localForecast.status === "denied"
                    ? "Location blocked."
                    : "Forecast unavailable."}
          </div>
        )}
      </div>

      <div className="fuits-schedule-panel" style={{
        position: "fixed",
        right: "calc(390px * var(--flive-scale, 1) * var(--flive-schedule-right-scale, var(--flive-info-right-scale, 1)))",
        bottom: "calc(26px * var(--flive-scale, 1) * var(--flive-schedule-bottom-scale, 1))",
        zIndex: 8,
        width: "calc(300px * var(--flive-scale, 1) * var(--flive-schedule-width-scale, 1))",
        transform: "scale(var(--flive-schedule-box-scale, 1))",
        transformOrigin: "right bottom",
        border: "1px solid rgba(250,204,21,.32)",
        borderRadius: "calc(14px * var(--flive-scale, 1))",
        background: "rgba(2,6,23,.9)",
        boxShadow: "0 16px 38px rgba(0,0,0,.48)",
        padding: "calc(12px * var(--flive-scale, 1)) calc(14px * var(--flive-scale, 1))",
        color: "#f8fafc",
        display: "grid",
        gap: 8
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid rgba(148,163,184,.18)",
          paddingBottom: 8
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, color: "#bbf7d0", fontSize: 11, fontWeight: 1000, textTransform: "uppercase", overflowWrap: "anywhere" }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1px solid rgba(187,247,208,.62)",
              background: loggedInProfilePicture ? `center / cover no-repeat url(${loggedInProfilePicture})` : "rgba(20,83,45,.72)",
              color: "#bbf7d0",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 1000,
              overflow: "hidden"
            }}>
              {!loggedInProfilePicture && String(loggedInUsername || "U").slice(0, 1)}
            </div>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{loggedInUsername || "User"} logged in</span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              border: "1px solid rgba(248,113,113,.78)",
              borderRadius: 8,
              background: "rgba(127,29,29,.78)",
              color: "#fee2e2",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 1000,
              padding: "6px 8px",
              textTransform: "uppercase"
            }}
          >
            Logout
          </button>
        </div>
        <div style={{
          display: "grid",
          gap: 5,
          justifyItems: "start",
          borderBottom: "1px solid rgba(250,204,21,.24)",
          paddingBottom: 8
        }}>
          <div style={{ fontSize: 14, fontWeight: 1000, color: "#fef08a", textTransform: "uppercase", lineHeight: 1.1 }}>
            Listed Schedule
          </div>
          <div style={{ fontSize: 15, fontWeight: 1000, color: "#e0f2fe", textTransform: "uppercase", lineHeight: 1.15, textAlign: "left" }}>
            Next 3 Hours{fuitsSchedule.channelLabel ? ` - ${fuitsSchedule.channelLabel}` : ""}
          </div>
        </div>
        {fuitsSchedule.loading ? (
          <div style={{ fontSize: 14, fontWeight: 900, color: "#cbd5e1", lineHeight: 1.3 }}>Loading schedule...</div>
        ) : fuitsSchedule.items.length ? (
          <div style={{ display: "grid", borderTop: "1px solid rgba(148,163,184,.14)" }}>
            {fuitsSchedule.items.map(item => (
              <div key={item.id} style={{
                display: "grid",
                gridTemplateColumns: "76px 1fr",
                gap: 10,
                alignItems: "start",
                color: item.current ? "#fef08a" : "#e2e8f0",
                fontSize: 14,
                fontWeight: 900,
                lineHeight: 1.28,
                borderBottom: "1px solid rgba(148,163,184,.18)",
                padding: "8px 0",
                background: item.current ? "rgba(250,204,21,.08)" : "transparent"
              }}>
                <span style={{ display: "grid", gap: 3, color: item.current ? "#facc15" : "#94a3b8", textTransform: "uppercase", fontSize: 12, fontWeight: 1000 }}>
                  <span>{item.current ? "Now" : new Date(item.startMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <span style={{ color: "#cbd5e1", fontSize: 10, lineHeight: 1.1, textTransform: "none" }}>
                    {(() => {
                      const totalMinutes = Math.max(1, Math.round((Number(item.durationSeconds) || 0) / 60));
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      if (hours && minutes) return `${hours}h ${minutes}m`;
                      if (hours) return `${hours}h`;
                      return `${minutes}m`;
                    })()}
                  </span>
                </span>
                <span style={{
                  fontSize: 12,
                  lineHeight: 1.22,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word"
                }}>
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 900, color: "#cbd5e1", lineHeight: 1.3 }}>No schedule found</div>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <button onClick={() => setMediaMenuOpen(open => !open)} style={{
          width: "100%",
          border: "none",
          borderRadius: 14,
          padding: "11px 13px",
          background: `linear-gradient(135deg, ${accentColor}, #38bdf8)`,
          color: "#06111f",
          fontWeight: 1000,
          letterSpacing: .8,
          textTransform: "uppercase",
          boxShadow: `0 8px 24px ${accentColor}55`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10
        }}>
          <span>{activeMediaMenu === "music" ? "Fuit Music" : "Fuit LIVE TV"}</span>
          <span style={{ fontSize: 12, fontWeight: 1000 }}>{mediaMenuOpen ? "^" : "v"}</span>
        </button>
        {mediaMenuOpen && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 10,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(148,163,184,.28)",
            background: "rgba(2,6,23,.98)",
            boxShadow: "0 16px 36px rgba(0,0,0,.45)"
          }}>
            {[
              { label: "Fuit Music", value: "music" },
              { label: "Fuit LIVE TV", value: "liveTv" }
            ].map(option => (
              <button key={option.value} onClick={() => chooseMediaMenu(option.value)} style={{
                width: "100%",
                border: "none",
                borderBottom: "1px solid rgba(148,163,184,.14)",
                background: activeMediaMenu === option.value ? "rgba(255,255,255,.14)" : "transparent",
                color: "#f8fafc",
                padding: "12px 14px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                fontWeight: 1000,
                textTransform: "uppercase",
                letterSpacing: .8
              }}>
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeMediaMenu === "liveTv" ? (
        <div className="fuits-live-tv-panel" style={{
          flex: 1,
          border: "none",
          borderRadius: 0,
          background: "transparent",
          overflow: "visible",
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}>
          {activeLiveTvOption.url && (
          <div style={{
            padding: "0 2px 6px",
            display: "flex",
            justifyContent: "flex-end"
          }}>
            <button onClick={() => openExternalLink(activeLiveTvOption.url)} style={{
              border: "1px solid rgba(148,163,184,.28)",
              background: "rgba(255,255,255,.08)",
              color: "#f8fafc",
              borderRadius: 10,
              padding: "7px 9px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 900
            }}>
              New Tab
            </button>
          </div>
          )}
          <div className="fuits-live-tv-scroll" style={{
            flex: 1,
            padding: "12px 2px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            textAlign: "center",
            gap: 10,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: 2,
            paddingBottom: 6
          }}>
            <div className="fuits-live-tv-heading" style={{
              color: "#cbd5e1",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.45
            }}>
              {activeLiveTvOption.heading}
            </div>
            <div className="fuits-live-tv-menu-wrap" style={{ position: "relative", width: "100%" }}>
              <button className="fuits-live-tv-menu-button" onClick={() => setLiveTvMenuOpen(open => !open)} style={{
                width: "100%",
                border: "none",
                background: `linear-gradient(135deg, ${accentColor}, #38bdf8)`,
                color: "#06111f",
                borderRadius: 12,
                padding: "11px 13px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 1000,
                textTransform: "uppercase",
                letterSpacing: .7,
                boxShadow: `0 8px 24px ${accentColor}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10
              }}>
                <span>{activeLiveTvOption.label}</span>
                <span>{liveTvMenuOpen ? "^" : "v"}</span>
              </button>
              {liveTvMenuOpen && (
                <div className="fuits-live-tv-menu" style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  right: 0,
                  zIndex: 12,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(148,163,184,.28)",
                  background: "rgba(2,6,23,.98)",
                  boxShadow: "0 16px 36px rgba(0,0,0,.45)"
                }}>
                  {liveTvOptions.map(option => (
                    <button key={option.id} onClick={() => {
                      setActiveLiveTv(option.id);
                      if (option.defaultChannel) {
                        setActiveFuitsLiveTvChannel(option.defaultChannel);
                      } else if (option.id === "fattys" && separateFuitsLiveTvChannelIds.has(activeFuitsLiveTvChannel)) {
                        setActiveFuitsLiveTvChannel((liveFuitsLiveTvChannels[0] || fuitsLiveTvChannels[0]).id);
                      }
                      setLiveTvMenuOpen(false);
                    }} style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid rgba(148,163,184,.14)",
                      background: activeLiveTv === option.id ? "rgba(255,255,255,.14)" : "transparent",
                      color: "#f8fafc",
                      padding: "12px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                      fontWeight: 1000,
                      textTransform: "uppercase",
                      letterSpacing: .7
                    }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {activeLiveTvOption.custom && fuitsLiveTvChannelUrl && (
              <>
                {activeLiveTvOption.liveChat ? (
                  <AdultRelaxLiveChatRoom
                    baseUrl={fuitsLiveTvChannelUrl}
                    accentColor={accentColor}
                    mobileLandscapeActive={fuitsMobileLandscapeProfileActive}
                  />
                ) : (
                  <>
                    {!activeLiveTvFixedChannel && (
                      <div
                        className="fuits-live-tv-channel-select-wrap"
                        style={{
                          width: "100%",
                          "--fuits-channel-select-font-size": `${activeFuitsLiveTvChannelSelectFontSize}px`,
                          "--fuits-channel-select-height": `${activeFuitsLiveTvChannelSelectHeight}px`
                        }}
                      >
                        <span className="fuits-live-tv-channel-select-display" aria-hidden="true">
                          {activeFuitsLiveTvChannelLabel}
                        </span>
                        <select
                          className="fuits-live-tv-channel-select"
                          value={activeFuitsLiveTvChannel}
                          onChange={event => setActiveFuitsLiveTvChannel(event.target.value)}
                          aria-label="Choose FUITS Live TV playlist"
                          style={{
                            width: "100%",
                            border: "1px solid rgba(148,163,184,.28)",
                            borderRadius: 12,
                            background: "#020617",
                            color: "#f8fafc",
                            padding: "7px 9px",
                            outline: "none",
                            fontSize: 11,
                            fontWeight: 1000,
                            textTransform: "uppercase",
                            letterSpacing: .7
                          }}
                        >
                          {liveFuitsLiveTvChannels.map(channel => (
                            <option key={channel.id} value={channel.id}>{channel.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="fuits-live-tv-channel-controls" style={{ width: "100%", display: "flex", justifyContent: "flex-start", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={backFuitsChannelWithPassword}
                        style={{
                          border: "1px solid rgba(255,255,255,.26)",
                          borderRadius: 999,
                          padding: "4px 7px",
                          background: "rgba(15,23,42,.88)",
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow: "0 5px 12px rgba(0,0,0,.26)",
                          textTransform: "uppercase"
                        }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => fuitsLiveTvPlayerRef.current?.stretchVideoToFullscreen()}
                        style={{
                          border: "1px solid rgba(255,255,255,.26)",
                          borderRadius: 999,
                          padding: "4px 7px",
                          background: "rgba(15,23,42,.88)",
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 1000,
                          cursor: "pointer",
                          boxShadow: "0 5px 12px rgba(0,0,0,.26)",
                          textTransform: "uppercase"
                        }}
                      >
                        Stretch Fullscreen
                      </button>
                    </div>
                    <FuitsLiveTvPlayer
                      ref={fuitsLiveTvPlayerRef}
                      baseUrl={fuitsLiveTvChannelUrl}
                      channelId={activeFuitsLiveTvChannel}
                      startupBufferSeconds={0.2}
                      liveAnnouncementOnline={owncastOnline}
                      restartSignal={playlistRestartSignal}
                      onPlaybackAnchor={setFuitsPlaybackAnchor}
                      onStretchFullscreenChange={setFuitsStretchFullscreenActive}
                    />
                    {renderFuitsOwnerControls()}
                <LiveChatBox
                  title="FUITS Live TV Chat"
                  src={fuitsLiveTvChatSrc}
                  height={fuitsLiveTvChatFrameHeight}
                  minHeight={fuitsLiveTvChatFrameHeight}
                />
                  </>
                )}
              </>
            )}
            {activeLiveTvOption.custom && !owncastOnline && !fuitsLiveTvChannelUrl && (
              <>
                <div style={{ display: "flex", width: "100%", gap: 8 }}>
                  <input
                    value={customTvUrl}
                    onChange={event => setCustomTvUrl(event.target.value)}
                    onKeyDown={event => { if (event.key === "Enter") addCustomTvUrl(); }}
                    placeholder="Paste stream URL..."
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,.28)",
                      background: "#020617",
                      color: "#f8fafc",
                      padding: "10px 11px",
                      outline: "none",
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  />
                  <button onClick={addCustomTvUrl} style={{
                    border: "none",
                    borderRadius: 12,
                    background: accentColor,
                    color: "#06111f",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 1000,
                    padding: "0 12px"
                  }}>
                    Add
                  </button>
                </div>
                {selectedCustomTvItem ? (
                  <video
                    key={selectedCustomTvItem.id}
                    src={selectedCustomTvItem.src}
                    controls
                    playsInline
                    style={{
                      width: "100%",
                      maxHeight: 240,
                      border: "1px solid rgba(148,163,184,.22)",
                      borderRadius: 14,
                      background: "#000"
                    }}
                  />
                ) : (
                  <div style={{
                    width: "100%",
                    border: "1px dashed rgba(148,163,184,.24)",
                    borderRadius: 14,
                    color: "#94a3b8",
                    fontSize: 12,
                    fontWeight: 800,
                    padding: "16px 12px",
                    boxSizing: "border-box"
                  }}>
                    Add built-in items in src/fattysLiveTvData.js or paste a direct video URL above.
                  </div>
                )}
                {allCustomTvItems.length > 0 && (
                  <div style={{ width: "100%", maxHeight: 150, overflowY: "auto" }}>
                    {allCustomTvItems.map(item => (
                      <button key={item.id} onClick={() => setSelectedCustomTvId(item.id)} style={{
                        width: "100%",
                        border: selectedCustomTvItem?.id === item.id ? `2px solid ${accentColor}` : "1px solid rgba(148,163,184,.18)",
                        background: selectedCustomTvItem?.id === item.id ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.72)",
                        color: "#f8fafc",
                        borderRadius: 12,
                        padding: 10,
                        marginBottom: 8,
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 900,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {activeLiveTvOption.embed && (
              <>
                {activeLiveTvOption.id === "jellyfin" && (
                  <div style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid rgba(148,163,184,.18)",
                    borderRadius: 10,
                    background: "rgba(15,23,42,.72)",
                    color: "#cbd5e1",
                    fontSize: 11,
                    fontWeight: 900,
                    padding: "6px 8px",
                    lineHeight: 1.25
                  }}>
                    USER: fuitviewer | PASS: fuittocool<br />
                    NO LIVE TV RECORDING
                  </div>
                )}
                {activeLiveTvOption.id === "jellyfin" && (
                  <button
                    onClick={openJellyfinFullscreen}
                    style={{
                      width: "100%",
                      border: "1px solid rgba(148,163,184,.24)",
                      borderRadius: 10,
                      background: "rgba(248,250,252,.94)",
                      color: "#020617",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 1000,
                      padding: "7px 9px"
                    }}
                  >
                    {jellyfinFullscreenActive ? "EXIT JELLYFIN FULLSCREEN" : "FULLSCREEN JELLYFIN"}
                  </button>
                )}
                {activeLiveTvOption.id === "athf" && (
                  <button
                    onClick={openAdultSwimFullscreen}
                    style={{
                      width: "100%",
                      border: "1px solid rgba(148,163,184,.24)",
                      borderRadius: 10,
                      background: "rgba(248,250,252,.94)",
                      color: "#020617",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 1000,
                      padding: "7px 9px"
                    }}
                  >
                    FULLSCREEN ADULT SWIM
                  </button>
                )}
                <iframe
                  ref={activeLiveTvOption.id === "jellyfin" ? jellyfinFrameRef : activeLiveTvOption.id === "athf" ? adultSwimFrameRef : null}
                  className={activeLiveTvOption.id === "jellyfin" ? `fuits-jellyfin-frame${jellyfinSoftFullscreenActive ? " fuits-jellyfin-frame-soft-fullscreen" : ""}` : undefined}
                  title={activeLiveTvOption.label}
                  src={activeLiveTvOption.url}
                  allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{
                    width: "100%",
                    flex: (activeLiveTvOption.id === "jellyfin" || activeLiveTvOption.id === "athf") ? "0 0 auto" : 1,
                    height: activeLiveTvOption.id === "jellyfin" ? 330 : activeLiveTvOption.id === "athf" ? 330 : "auto",
                    minHeight: activeLiveTvOption.id === "jellyfin" ? 330 : activeLiveTvOption.id === "athf" ? 330 : 280,
                    border: "1px solid rgba(148,163,184,.22)",
                    borderRadius: 14,
                    background: "#020617"
                  }}
                />
                {activeLiveTvOption.id === "jellyfin" && jellyfinSoftFullscreenActive && (
                  <button
                    type="button"
                    className="fuits-jellyfin-soft-exit"
                    onClick={exitJellyfinFullscreen}
                  >
                    Exit Fullscreen
                  </button>
                )}
                {(activeLiveTvOption.id === "jellyfin" || activeLiveTvOption.id === "athf") && (
                  <LiveChatBox
                    title={`${activeLiveTvOption.label} Chat`}
                    src={fuitsLiveTvChatSrc}
                    height={activeLiveTvOption.id === "jellyfin" ? fuitsLiveTvChatFrameHeight : fuitsLiveTvCompactChatFrameHeight}
                    minHeight={activeLiveTvOption.id === "jellyfin" ? fuitsLiveTvChatFrameHeight : fuitsLiveTvCompactChatFrameHeight}
                  />
                )}
              </>
            )}
            {!activeLiveTvOption.embed && !activeLiveTvOption.custom && (
              <>
                <a
                  href={activeLiveTvOption.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid rgba(148,163,184,.28)",
                    background: "rgba(255,255,255,.08)",
                    color: "#f8fafc",
                    borderRadius: 14,
                    padding: "12px 14px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 1000,
                    textTransform: "uppercase",
                    letterSpacing: .7,
                    textDecoration: "none",
                    textAlign: "center"
                  }}
                >
                  Open In New Tab
                </a>
                {(activeLiveTvOption.id === "southpark" || activeLiveTvOption.id === "youtube" || activeLiveTvOption.id === "fuit") && (
                  <LiveChatBox
                    title={`${activeLiveTvOption.label} Chat`}
                    src={fuitsLiveTvChatSrc}
                    height={fuitsLiveTvCompactChatFrameHeight}
                    minHeight={fuitsLiveTvCompactChatFrameHeight}
                  />
                )}
                {(activeLiveTvOption.id === "southpark" || activeLiveTvOption.id === "youtube" || activeLiveTvOption.id === "fuit") && (
                  <div
                    style={{
                      border: "1px solid rgba(56,189,248,.28)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "rgba(15,23,42,.82)",
                      color: "#e0f2fe",
                      fontSize: 9,
                      fontWeight: 1000,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                      textAlign: "center"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 5 }}>
                      {[
                        { label: "PayPal", src: "/donation-qrs/paypal.jpeg" },
                        { label: "Cash App", src: "/donation-qrs/cashapp.jpg" }
                      ].map(qr => (
                        <div key={qr.label} style={{ display: "grid", gap: 3, justifyItems: "center", color: "#cbd5e1", fontSize: 8 }}>
                          <button
                            type="button"
                            onClick={() => setZoomedDonationQr(qr)}
                            style={{
                              display: "block",
                              padding: 0,
                              border: 0,
                              background: "transparent",
                              borderRadius: 6,
                              cursor: "pointer",
                              lineHeight: 0
                            }}
                          >
                            <img
                              src={qr.src}
                              alt={`${qr.label} QR`}
                              style={{
                                width: 46,
                                height: 46,
                                objectFit: "cover",
                                borderRadius: 6,
                                background: "#fff",
                                border: "1px solid rgba(248,250,252,.25)"
                              }}
                            />
                          </button>
                          <strong>{qr.label}</strong>
                        </div>
                      ))}
                    </div>
                    DONATE VIA SOLONA <span style={{ color: "#67e8f9" }}>8BEogzpRAUM92NCYAhhFdf4gmoV3gNyDmQHZYoEfVbKB</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <>

      <div style={{ display: "none",
        borderRadius: 18,
        padding: "12px 14px",
        background: `linear-gradient(135deg, ${accentColor}, #38bdf8)`,
        color: "#06111f",
        fontWeight: 1000,
        letterSpacing: .8,
        textTransform: "uppercase",
        boxShadow: `0 8px 24px ${accentColor}55`,
        marginBottom: 12,
        textAlign: "center"
      }}>
        Fuit Music
      </div>

      <div style={{ display: "none", marginBottom: 10 }}>
        <button onClick={() => toggleMusicSection("liveTv")} style={{
          width: "100%",
          border: "1px solid rgba(148,163,184,.24)",
          background: "rgba(2,6,23,.86)",
          color: "#f8fafc",
          borderRadius: 14,
          padding: "10px 12px",
          marginBottom: openMusicSections.liveTv ? 8 : 0,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10
        }}>
          <span style={{
            fontSize: 12,
            fontWeight: 1000,
            color: "#cbd5e1",
            textTransform: "uppercase",
            letterSpacing: .9
          }}>
            Fuit LIVE TV
          </span>
          <span style={{
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap"
          }}>
            {openMusicSections.liveTv ? "^" : "v"}
          </span>
        </button>
        {openMusicSections.liveTv && (
          <div style={{
            border: "1px dashed rgba(148,163,184,.22)",
            borderRadius: 12,
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 800,
            padding: "10px 12px",
            marginBottom: 8,
            lineHeight: 1.4
          }}>
            No live TV channels added yet.
          </div>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <button
          onClick={() => setMusicViewMenuOpen(open => !open)}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 16,
            padding: "10px 12px",
            background: `linear-gradient(135deg, ${accentColor}, #38bdf8)`,
            color: "#06111f",
            fontWeight: 1000,
            letterSpacing: 1,
            cursor: "pointer",
            boxShadow: `0 8px 22px ${accentColor}44`,
            textAlign: "center",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}
        >
          <span style={{ flex: 1 }}>{activeMusicViewOption.label}</span>
          <span style={{ fontSize: 12, fontWeight: 1000 }}>{musicViewMenuOpen ? "^" : "v"}</span>
        </button>
        {musicViewMenuOpen && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 12,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(148,163,184,.28)",
            background: "rgba(2,6,23,.98)",
            boxShadow: "0 16px 36px rgba(0,0,0,.45)"
          }}>
            {musicViewOptions.map(option => (
              <button
                key={option.id}
                onClick={() => chooseMusicView(option.id)}
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,.14)",
                  background: activeMusicView === option.id ? "rgba(255,255,255,.14)" : "transparent",
                  color: "#f8fafc",
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 1000,
                  textTransform: "uppercase",
                  letterSpacing: .7
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isRadioMusicView ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <iframe
            key={`${radioIframeSrc}:${radioFrameVersion}`}
            title="FUIT RADIO WORLD"
            src={radioIframeSrc}
            allow="autoplay; encrypted-media"
            style={{
              width: "100%",
              flex: 1,
              minHeight: 560,
              border: "1px solid rgba(148,163,184,.22)",
              borderRadius: 14,
              background: "#020617"
            }}
          />
        </div>
      ) : (
        <>

      <input
        value={musicSearch}
        onChange={e => setMusicSearch(e.target.value)}
        placeholder="Search songs..."
        style={{
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,.16)",
          background: "rgba(2,6,23,.64)",
          color: "#f8fafc",
          padding: "10px 11px",
          outline: "none",
          fontSize: 13,
          fontWeight: 800,
          marginBottom: 10
        }}
      />

      <select
        value={activeGenre}
        onChange={event => setActiveGenre(event.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,.16)",
          background: "rgba(15,23,42,.72)",
          color: "#f8fafc",
          padding: "9px 11px",
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 1000,
          textTransform: "uppercase"
        }}
      >
        {genres.map(genre => (
          <option key={genre} value={genre}>{genre}</option>
        ))}
      </select>

      {selectedTrack ? (
        <div style={{
          borderRadius: 14,
          background: "rgba(15,23,42,.68)",
          border: "1px solid rgba(148,163,184,.14)",
          padding: 12,
          marginBottom: 12
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedTrack.title}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800, marginBottom: 8 }}>
            {selectedTrack.artist || "Unknown Artist"} - {selectedTrack.genre || "Other"}
          </div>

          {selectedTrack.type === "video" ? (
            <video key={selectedTrack.id} src={selectedTrack.src} controls style={{
              width: "100%",
              maxHeight: 180,
              borderRadius: 12,
              background: "#000"
            }} />
          ) : (
            <audio key={selectedTrack.id} src={selectedTrack.src} controls style={{ width: "100%" }} />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => rateTrack(selectedTrack.id, star)} style={{
                  background: "none",
                  border: "none",
                  color: star <= (ratings[selectedTrack.id] || 0) ? "#facc15" : "#64748b",
                  cursor: "pointer",
                  fontSize: 22,
                  padding: "0 1px",
                  lineHeight: 1
                }}>
                  *
                </button>
              ))}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#94a3b8",
              border: "1px solid rgba(148,163,184,.24)",
              borderRadius: 999,
              padding: "5px 9px"
            }}>
              {selectedTrack.type.toUpperCase()}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          borderRadius: 18,
          background: "rgba(15,23,42,.75)",
          border: "1px dashed rgba(148,163,184,.35)",
          padding: 18,
          color: "#cbd5e1",
          fontSize: 13,
          lineHeight: 1.45,
          marginBottom: 12,
          textAlign: "center",
          fontWeight: 700
        }}>
          No songs found.
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, marginBottom: 12 }}>
        {[
          { label: "Videos", key: "videos", items: filteredVideos },
          { label: "Music", key: "music", items: filteredMusic }
        ].map(section => (
          <div key={section.label} style={{ marginBottom: 10 }}>
            <button onClick={() => toggleMusicSection(section.key)} style={{
              width: "100%",
              border: "none",
              borderBottom: "1px solid rgba(148,163,184,.12)",
              background: "rgba(2,6,23,.46)",
              color: "#f8fafc",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: openMusicSections[section.key] ? 8 : 0,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 1000,
                color: "#cbd5e1",
                textTransform: "uppercase",
                letterSpacing: .9
              }}>
                {section.label}
              </span>
              <span style={{
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 900,
                whiteSpace: "nowrap"
              }}>
                {section.items.length} {openMusicSections[section.key] ? "^" : "v"}
              </span>
            </button>
            {openMusicSections[section.key] && (section.items.length > 0 ? section.items.map(item => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} style={{
                width: "100%",
                border: selectedTrack?.id === item.id ? `1px solid ${accentColor}` : "1px solid transparent",
                background: selectedTrack?.id === item.id ? "rgba(255,255,255,.1)" : "rgba(15,23,42,.42)",
                color: "#f8fafc",
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
                cursor: "pointer",
                textAlign: "left"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      {item.artist || "Unknown Artist"}
                    </div>
                  </div>
                  <div style={{ color: "#facc15", fontSize: 12, whiteSpace: "nowrap" }}>
                    {"*".repeat(ratings[item.id] || 0)}{"-".repeat(5 - (ratings[item.id] || 0))}
                  </div>
                </div>
              </button>
            )) : (
              <div style={{
                border: "1px dashed rgba(148,163,184,.22)",
                borderRadius: 12,
                color: "#64748b",
                fontSize: 12,
                fontWeight: 800,
                padding: "10px 12px",
                marginBottom: 8
              }}>
                No {section.label.toLowerCase()} found.
              </div>
            ))}
          </div>
        ))}
      </div>

      {selectedTrack && (
        <div style={{
          borderRadius: 12,
          background: "rgba(15,23,42,.6)",
          border: "1px solid rgba(148,163,184,.12)",
          padding: 8,
          minHeight: 270
        }}>
          <LiveChatBox
            title="FUITS Music Live Chat"
            src={fuitsLiveTvChatSrc}
            height={fuitsLiveTvCompactChatFrameHeight}
            minHeight={fuitsLiveTvCompactChatFrameHeight}
          />
        </div>
      )}
        </>
      )}
        </>
      )}
      {zoomedDonationQr && (
        <div
          onClick={() => setZoomedDonationQr(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(2,6,23,.86)"
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              display: "grid",
              gap: 10,
              justifyItems: "center",
              maxWidth: "min(92vw, 420px)",
              color: "#f8fafc",
              fontSize: 14,
              fontWeight: 900
            }}
          >
            <div>{zoomedDonationQr.label} QR</div>
            <img
              src={zoomedDonationQr.src}
              alt={`${zoomedDonationQr.label} QR zoom`}
              style={{
                width: "min(82vw, 360px)",
                maxHeight: "72vh",
                objectFit: "contain",
                borderRadius: 12,
                background: "#fff",
                border: "1px solid rgba(248,250,252,.35)",
                boxShadow: "0 20px 60px rgba(0,0,0,.55)"
              }}
            />
            <button
              type="button"
              onClick={() => setZoomedDonationQr(null)}
              style={{
                border: "1px solid #f8fafc",
                background: "#f8fafc",
                color: "#020617",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 900
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function FuitCoinPage({ onClose, loggedInUsername = "", approvedUsers = [] }) {
  const loggedInUser = useMemo(() => approvedUsers.find(user =>
    (user.username || "").toLowerCase() === String(loggedInUsername || "").toLowerCase()
  ), [approvedUsers, loggedInUsername]);
  const savedWalletAddress = loggedInUser?.walletAddress || "";
  const [walletAddress, setWalletAddress] = useState(savedWalletAddress);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [status, setStatus] = useState("Loading FUIT Coin...");
  const [summary, setSummary] = useState({
    loading: true,
    settings: DEFAULT_FUIT_CREDIT_SETTINGS,
    user: {
      username: loggedInUsername,
      wallet: savedWalletAddress,
      walletBlacklisted: false,
      balance: 0,
      issuedTotal: 0,
      withdrawnTotal: 0,
      deposits: []
    }
  });

  useEffect(() => {
    if (savedWalletAddress) setWalletAddress(current => current || savedWalletAddress);
  }, [savedWalletAddress]);

  const baseUrl = FUIT_CREDITS_BASE_URL ? FUIT_CREDITS_BASE_URL.replace(/\/+$/, "") : "";
  const cleanUsername = String(loggedInUsername || loggedInUser?.username || "").trim();
  const cleanWalletAddress = extractFuitWalletAddress(walletAddress);
  const settings = { ...DEFAULT_FUIT_CREDIT_SETTINGS, ...(summary.settings || {}) };
  const creditUser = summary.user || {};
  const deposits = Array.isArray(creditUser.deposits) ? creditUser.deposits : [];
  const treasuryWallet = settings.treasuryWallet || "";
  const treasuryQrUrl = getFuitQrImageUrl(treasuryWallet, 210);
  const walletQrUrl = getFuitQrImageUrl(cleanWalletAddress, 150);

  const postFuitCredits = useCallback(async payload => {
    if (!baseUrl) throw new Error("FUITS Live TV URL is not set yet.");
    const response = await fetch(`${baseUrl}/fuit-credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, [baseUrl]);

  const loadCreditSummary = useCallback(async (nextWallet = walletAddress) => {
    try {
      const validWallet = extractFuitWalletAddress(nextWallet);
      const result = await postFuitCredits({
        action: "summary",
        username: cleanUsername,
        wallet: validWallet || undefined
      });
      setSummary({ loading: false, ...result });
      if (result.user?.wallet) setWalletAddress(result.user.wallet);
      setStatus(result.user?.walletBlacklisted ? "This wallet is blacklisted for new deposits." : "FUIT Coin balance ready.");
    } catch (err) {
      setSummary(current => ({ ...current, loading: false }));
      setStatus(err?.message || "Could not load FUIT Coin yet.");
    }
  }, [cleanUsername, postFuitCredits, walletAddress]);

  useEffect(() => {
    loadCreditSummary();
  }, [loadCreditSummary]);

  const saveWallet = async () => {
    if (!cleanUsername) {
      setStatus("Login username is missing.");
      return;
    }
    if (!cleanWalletAddress) {
      setStatus("Enter or scan a valid Polygon wallet address.");
      return;
    }
    try {
      setStatus("Saving wallet...");
      const result = await postFuitCredits({
        action: "saveWallet",
        username: cleanUsername,
        wallet: cleanWalletAddress
      });
      setSummary({ loading: false, ...result });
      setStatus("Wallet saved for FUIT Coin tracking.");
    } catch (err) {
      setStatus(err?.message || "Could not save wallet.");
    }
  };

  const submitDeposit = async () => {
    if (!cleanUsername) {
      setStatus("Login username is missing.");
      return;
    }
    if (!cleanWalletAddress) {
      setStatus("Enter or scan your deposit wallet first.");
      return;
    }
    if (!Number(depositAmount) || Number(depositAmount) <= 0) {
      setStatus("Enter the USDT amount you deposited.");
      return;
    }
    try {
      setStatus("Submitting deposit for admin approval...");
      const result = await postFuitCredits({
        action: "submitDeposit",
        username: cleanUsername,
        wallet: cleanWalletAddress,
        amount: depositAmount,
        txHash: depositTxHash,
        note: depositNote
      });
      setSummary({ loading: false, ...result });
      setDepositAmount("");
      setDepositTxHash("");
      setDepositNote("");
      setStatus("Deposit submitted. FUIT Coin will appear after admin approval.");
    } catch (err) {
      setStatus(err?.message || "Could not submit deposit.");
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setStatus("No browser wallet found. Open this page inside Trust Wallet or paste the address manually.");
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0] || "";
      if (!address) return;
      setWalletAddress(address);
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] });
      } catch (switchError) {
        if (switchError?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: "0x89", chainName: "Polygon", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: ["https://polygon-rpc.com/"], blockExplorerUrls: ["https://polygonscan.com/"] }]
          });
        }
      }
      setStatus("Wallet connected. Save it before submitting deposits.");
    } catch (err) {
      setStatus(`Wallet connection failed: ${err?.message || err}`);
    }
  };

  const openTrustWallet = () => {
    window.open(`https://link.trustwallet.com/open_url?coin_id=966&url=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer");
  };

  const copyTreasuryWallet = async () => {
    if (!treasuryWallet) return;
    try {
      await navigator.clipboard.writeText(treasuryWallet);
      setStatus("Admin wallet copied.");
    } catch {
      setStatus("Admin wallet is shown on screen. Copy it manually.");
    }
  };

  const cardStyle = {
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: 8,
    background: "rgba(15,23,42,.88)",
    boxShadow: "0 14px 36px rgba(0,0,0,.28)",
    padding: 16,
    minWidth: 0
  };
  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.35)",
    borderRadius: 8,
    background: "#020617",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 900,
    padding: "11px 12px",
    minWidth: 0
  };
  const buttonStyle = {
    border: "1px solid #67e8f9",
    borderRadius: 8,
    background: "#67e8f9",
    color: "#020617",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 1000,
    padding: "11px 13px",
    textTransform: "uppercase"
  };
  const secondaryButtonStyle = {
    ...buttonStyle,
    borderColor: "rgba(148,163,184,.35)",
    background: "rgba(15,23,42,.95)",
    color: "#f8fafc"
  };
  const labelStyle = {
    color: "#bfdbfe",
    fontSize: 11,
    fontWeight: 1000,
    textTransform: "uppercase"
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#020617,#0f172a 50%,#1e1b4b)", color: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: 18, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 1000, letterSpacing: 0 }}>FUIT Coin</h1>
            <div style={{ color: "#cbd5e1", fontSize: 14, fontWeight: 900, marginTop: 4 }}>
              Admin-issued FUIT balance after Polygon USDT deposit approval.
            </div>
          </div>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Back</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <div style={cardStyle}>
            <div style={labelStyle}>Logged In</div>
            <div style={{ fontSize: 22, fontWeight: 1000, overflowWrap: "anywhere", marginTop: 4 }}>{cleanUsername || "Unknown User"}</div>
            <div style={{ color: "#bbf7d0", fontSize: 26, fontWeight: 1000, marginTop: 12 }}>
              {formatFuitCreditAmount(creditUser.balance)} {settings.creditSymbol}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
              Issued: {formatFuitCreditAmount(creditUser.issuedTotal)} / Withdrawn: {formatFuitCreditAmount(creditUser.withdrawnTotal)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Deposit Coin</div>
            <div style={{ fontSize: 22, fontWeight: 1000, marginTop: 4 }}>{settings.depositToken} on {settings.depositNetwork}</div>
            <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 850, lineHeight: 1.45, marginTop: 8 }}>
              In Trust Wallet, swap POL or another supported token to Polygon {settings.depositToken}, keep a little POL for gas, then send the {settings.depositToken} to the admin wallet.
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Status</div>
            <div style={{ color: creditUser.walletBlacklisted ? "#fecaca" : "#dbeafe", fontSize: 14, fontWeight: 900, lineHeight: 1.45, marginTop: 6 }}>{status}</div>
            <button type="button" onClick={() => loadCreditSummary()} style={{ ...secondaryButtonStyle, marginTop: 12 }}>Refresh</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 1000 }}>Your Deposit Wallet</h2>
            <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 850, lineHeight: 1.45, margin: "7px 0 12px" }}>
              This wallet is how admin tracks your deposits and issues your FUIT Coin.
            </div>
            <FuitWalletInputWithScanner
              value={walletAddress}
              onChange={setWalletAddress}
              inputStyle={inputStyle}
              buttonStyle={buttonStyle}
              placeholder="Manual Polygon wallet address"
            />
            {walletQrUrl && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
                <img src={walletQrUrl} alt="Your wallet QR code" style={{ width: 150, height: 150, border: "1px solid rgba(148,163,184,.35)", background: "#fff" }} />
                <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>{cleanWalletAddress}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" onClick={saveWallet} style={buttonStyle}>Save Wallet</button>
              <button type="button" onClick={connectWallet} style={secondaryButtonStyle}>Connect Wallet</button>
              <button type="button" onClick={openTrustWallet} style={secondaryButtonStyle}>Trust Wallet</button>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 1000 }}>Admin Receiving Wallet</h2>
            {treasuryWallet ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {treasuryQrUrl && <img src={treasuryQrUrl} alt="Admin receiving wallet QR code" style={{ width: 210, height: 210, border: "1px solid rgba(148,163,184,.35)", background: "#fff" }} />}
                <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 900, overflowWrap: "anywhere" }}>{treasuryWallet}</div>
                <button type="button" onClick={copyTreasuryWallet} style={{ ...secondaryButtonStyle, width: "fit-content" }}>Copy Admin Wallet</button>
              </div>
            ) : (
              <div style={{ color: "#facc15", fontSize: 13, fontWeight: 900, lineHeight: 1.45, marginTop: 10 }}>
                Admin wallet is not set yet. Wait for admin to add the Polygon USDT receiving wallet before sending funds.
              </div>
            )}
            <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 850, lineHeight: 1.45, marginTop: 12 }}>{settings.instructions}</div>
          </section>
        </div>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 1000 }}>Report A Deposit</h2>
          <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 850, lineHeight: 1.45, marginTop: 6 }}>
            Report the transaction after you send {settings.depositToken} on {settings.depositNetwork}. FUIT stays pending until admin approves.
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <input type="number" min="0" value={depositAmount} onChange={event => setDepositAmount(event.target.value)} placeholder={`${settings.depositToken} amount`} style={inputStyle} />
            <input value={depositTxHash} onChange={event => setDepositTxHash(event.target.value)} placeholder="Transaction hash" style={inputStyle} />
            <input value={depositNote} onChange={event => setDepositNote(event.target.value)} placeholder="Optional note" style={inputStyle} />
          </div>
          <button type="button" disabled={creditUser.walletBlacklisted} onClick={submitDeposit} style={{ ...buttonStyle, marginTop: 12, opacity: creditUser.walletBlacklisted ? .55 : 1 }}>
            Submit For Admin Approval
          </button>
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 1000 }}>Deposit History</h2>
          <div style={{ marginTop: 10, display: "grid", gap: 9 }}>
            {!deposits.length && <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>No deposits reported yet.</div>}
            {deposits.map(deposit => (
              <div key={deposit.id} style={{ border: "1px solid rgba(148,163,184,.2)", background: "rgba(2,6,23,.58)", borderRadius: 8, padding: 10, display: "grid", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ color: "#f8fafc", fontWeight: 1000 }}>{formatFuitCreditAmount(deposit.amount)} {deposit.token || settings.depositToken}</div>
                  <div style={{ color: deposit.status === "issued" ? "#bbf7d0" : deposit.status === "rejected" ? "#fecaca" : "#fef3c7", fontSize: 12, fontWeight: 1000, textTransform: "uppercase" }}>{deposit.status}</div>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>{deposit.txHash}</div>
                {deposit.issuedAmount && <div style={{ color: "#bbf7d0", fontSize: 12, fontWeight: 900 }}>Issued: {formatFuitCreditAmount(deposit.issuedAmount)} {settings.creditSymbol}</div>}
                {deposit.adminNote && <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800 }}>{deposit.adminNote}</div>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyUtilityPage({ title, onClose }) {
  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <button onClick={onClose} style={{ border: "1px solid rgba(148,163,184,.3)", borderRadius: 999, background: "rgba(15,23,42,.9)", color: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 900, padding: "9px 14px" }}>
        Back
      </button>
      <h1 style={{ marginTop: 28, fontSize: 32, fontWeight: 1000, letterSpacing: .4 }}>{title}</h1>
    </div>
  );
}

function AdminPage({ onClose, loggedInUsername, signupRequests, approvedUsers, bannedUsers, onApproveSignup, onDenySignup, onBanUser, onUnbanUser, onShowBanList }) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [videoChunkMb, setVideoChunkMb] = useState(4);
  const [videoChunkStatus, setVideoChunkStatus] = useState("Loading video stream controls...");
  const [videoRepairStatus, setVideoRepairStatus] = useState("Ready to check the FUITS videos folder.");
  const [videoRepairFlagged, setVideoRepairFlagged] = useState([]);
  const [videoRepairReport, setVideoRepairReport] = useState("");
  const [videoRepairFinish, setVideoRepairFinish] = useState("keep");
  const [videoRepairOverwrite, setVideoRepairOverwrite] = useState(false);
  const [videoRepairBusy, setVideoRepairBusy] = useState(false);
  const [videoRepairLog, setVideoRepairLog] = useState([]);
  const [videoRepairBackups, setVideoRepairBackups] = useState([]);
  const [videoRepairSelectedBackup, setVideoRepairSelectedBackup] = useState("");
  const [videoRepairProgress, setVideoRepairProgress] = useState(null);
  const [videoRepairProgressNow, setVideoRepairProgressNow] = useState(Date.now());
  const [videoRepairCancelling, setVideoRepairCancelling] = useState(false);
  const [serverVideoRepairStatus, setServerVideoRepairStatus] = useState(null);
  const videoRepairCancelRequestedRef = useRef(false);
  const [onlineUserInfo, setOnlineUserInfo] = useState({ loading: true, devices: 0, households: 0, householdDetails: [] });
  const [playlistManager, setPlaylistManager] = useState({ loading: false, channels: [], selectedChannel: null, items: [], availableVideos: [] });
  const [playlistManagerStatus, setPlaylistManagerStatus] = useState("Loading playlist manager...");
  const [playlistManagerChannelId, setPlaylistManagerChannelId] = useState("");
  const [playlistManagerNewChannelName, setPlaylistManagerNewChannelName] = useState("");
  const [playlistManagerRenameChannelName, setPlaylistManagerRenameChannelName] = useState("");
  const [playlistManagerAddPath, setPlaylistManagerAddPath] = useState("");
  const [playlistManagerSearch, setPlaylistManagerSearch] = useState("");
  const [accessControl, setAccessControl] = useState({ whitelistIps: [], blacklistIps: [], whitelistDevices: [], blacklistDevices: [] });
  const [accessControlStatus, setAccessControlStatus] = useState("Loading access control...");
  const [accessControlValue, setAccessControlValue] = useState("");
  const [accessControlList, setAccessControlList] = useState("blacklistIp");
  const [accessControlNote, setAccessControlNote] = useState("");
  const [visibleAdminPasswords, setVisibleAdminPasswords] = useState({});
  const [fuitCreditAdmin, setFuitCreditAdmin] = useState({
    loading: true,
    settings: DEFAULT_FUIT_CREDIT_SETTINGS,
    wallets: {},
    balances: {},
    deposits: [],
    ledger: [],
    blacklistedWallets: [],
    totals: { issued: 0, balance: 0, withdrawn: 0 },
    pendingCount: 0
  });
  const [fuitCreditStatus, setFuitCreditStatus] = useState("Loading FUIT Coin ledger...");
  const [fuitTreasuryWallet, setFuitTreasuryWallet] = useState("");
  const [fuitInstructions, setFuitInstructions] = useState(DEFAULT_FUIT_CREDIT_SETTINGS.instructions);
  const [fuitManualUsername, setFuitManualUsername] = useState("");
  const [fuitManualWallet, setFuitManualWallet] = useState("");
  const [fuitManualAmount, setFuitManualAmount] = useState("");
  const [fuitManualNote, setFuitManualNote] = useState("");
  const [fuitWithdrawUsername, setFuitWithdrawUsername] = useState("");
  const [fuitWithdrawAmount, setFuitWithdrawAmount] = useState("");
  const [fuitWithdrawNote, setFuitWithdrawNote] = useState("");
  const [fuitBlacklistWallet, setFuitBlacklistWallet] = useState("");
  const [fuitBlacklistNote, setFuitBlacklistNote] = useState("");
  const fuitsAdminBaseUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const sectionStyle = {
    background: "rgba(15,23,42,.92)",
    border: "2px solid rgba(96,165,250,.7)",
    borderRadius: 0,
    padding: 18,
    minWidth: 0,
    boxShadow: "0 14px 36px rgba(0,0,0,.34)"
  };
  const sectionTitleStyle = {
    margin: 0,
    color: "#dbeafe",
    fontSize: 24,
    fontWeight: 1000,
    letterSpacing: 1
  };
  const controlLabelStyle = {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0
  };
  const adminButtonStyle = {
    border: "1px solid #67e8f9",
    borderRadius: 8,
    background: "#67e8f9",
    color: "#020617",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 1000,
    padding: "11px 14px"
  };
  const adminInputStyle = {
    border: "1px solid rgba(148,163,184,.35)",
    borderRadius: 8,
    background: "rgba(2,6,23,.72)",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 900,
    padding: "11px 12px"
  };

  const formatRepairTime = seconds => {
    const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
  };

  const getRepairProgressPercent = () => {
    if (!videoRepairProgress?.total) return 0;
    return Math.min(100, Math.round((videoRepairProgress.done / videoRepairProgress.total) * 100));
  };

  const getRepairProgressEta = () => {
    if (!videoRepairProgress?.startedAt || !videoRepairProgress.done) return "Calculating...";
    const elapsedSeconds = (videoRepairProgressNow - videoRepairProgress.startedAt) / 1000;
    const averageSeconds = elapsedSeconds / videoRepairProgress.done;
    const remainingItems = Math.max(0, videoRepairProgress.total - videoRepairProgress.done);
    return formatRepairTime(averageSeconds * remainingItems);
  };

  useEffect(() => {
    if (!videoRepairBusy || !videoRepairProgress) return undefined;
    const timer = setInterval(() => setVideoRepairProgressNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [videoRepairBusy, videoRepairProgress]);

  useEffect(() => {
    if (!unlocked) return undefined;
    let cancelled = false;
    const loadVideoRepairStatus = async () => {
      try {
        const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        if (!response.ok) throw new Error("Video repair status unavailable");
        const status = await response.json();
        if (cancelled) return;
        setServerVideoRepairStatus(status);
        const batch = status.batch;
        if (batch?.active) {
          const currentLabel = status.relativePath || status.fileName || batch.current?.relativePath || batch.current?.fileName || "current video";
          setVideoRepairStatus(`${status.cancelling ? "Stopping video repair queue" : "Video editing in progress"}. Currently on ${currentLabel}.`);
          setVideoRepairProgress({
            action: batch.action === "remux" ? "remux" : "audio timing fix",
            current: currentLabel,
            done: Number(batch.done) || 0,
            failed: Number(batch.failed) || 0,
            source: "server",
            startedAt: Number(batch.startedAtMs) || Date.now(),
            total: Number(batch.total) || 1
          });
          setVideoRepairLog(Array.isArray(batch.results) ? batch.results : []);
          setVideoRepairBusy(true);
          setVideoRepairProgressNow(Date.now());
          return;
        }
        if (batch && serverVideoRepairStatus?.batch?.active) {
          const counts = batch.counts || {};
          setVideoRepairLog(Array.isArray(batch.results) ? batch.results : []);
          setVideoRepairProgress(null);
          setVideoRepairBusy(false);
          setVideoRepairStatus(batch.status === "cancelled"
            ? `Repair stopped. Finished ${batch.done || 0} item${batch.done === 1 ? "" : "s"} before stopping.`
            : batch.status === "failed"
              ? (batch.error || "Video repair queue failed.")
              : `Repair complete. Kept ${counts.kept || 0}, overwritten ${counts.overwritten || 0}, replaced ${counts.replaced || 0}, deleted ${counts.deleted || 0}, skipped ${counts.skipped || 0}, failed ${counts.failed || 0}.`);
          setVideoRepairCancelling(false);
          return;
        }
        if (status.active) {
          const currentLabel = status.relativePath || status.fileName || "current video";
          setVideoRepairStatus(`Video editing in progress. Currently on ${currentLabel}.`);
          setVideoRepairProgress(current => current && current.source !== "server"
            ? current
            : {
              action: status.action === "remux" ? "remux" : "audio timing fix",
              current: currentLabel,
              done: 0,
              failed: 0,
              source: "server",
              startedAt: Number(status.startedAtMs) || Date.now(),
              total: 1
            });
          setVideoRepairBusy(true);
          setVideoRepairProgressNow(Date.now());
          return;
        }
        setVideoRepairProgress(current => current?.source === "server" ? null : current);
        if (serverVideoRepairStatus?.active) {
          setVideoRepairBusy(false);
          setVideoRepairStatus("No active video edit right now.");
        }
      } catch {
        if (!cancelled) setServerVideoRepairStatus(null);
      }
    };
    loadVideoRepairStatus();
    const timer = setInterval(loadVideoRepairStatus, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [unlocked, fuitsAdminBaseUrl, password, serverVideoRepairStatus?.active]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const loadVideoSettings = async () => {
      try {
        const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-stream-settings`, { cache: "no-store" });
        if (!response.ok) throw new Error("Settings unavailable");
        const settings = await response.json();
        if (cancelled) return;
        setVideoChunkMb(Number(settings.chunkMb) || 4);
        setVideoChunkStatus("Video chunks are ready.");
      } catch {
        if (!cancelled) setVideoChunkStatus("Could not load video chunk settings yet.");
      }
    };
    loadVideoSettings();
    return () => { cancelled = true; };
  }, [unlocked, fuitsAdminBaseUrl]);

  const applyPlaylistManagerResult = result => {
    const channels = Array.isArray(result.channels) ? result.channels : [];
    const selectedChannel = result.selectedChannel || channels[0] || null;
    setPlaylistManager({
      loading: false,
      channels,
      selectedChannel,
      items: Array.isArray(result.items) ? result.items : [],
      availableVideos: Array.isArray(result.availableVideos) ? result.availableVideos : []
    });
    setPlaylistManagerChannelId(selectedChannel?.id || "");
    setPlaylistManagerRenameChannelName(selectedChannel?.label || "");
    setPlaylistManagerAddPath("");
  };

  const postPlaylistManager = async payload => {
    setPlaylistManager(current => ({ ...current, loading: true }));
    const response = await fetch(`${fuitsAdminBaseUrl}/admin/playlist-management`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, channelId: playlistManagerChannelId, ...payload })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    applyPlaylistManagerResult(result);
    return result;
  };

  const loadPlaylistManager = async (channelId = playlistManagerChannelId) => {
    try {
      setPlaylistManagerStatus("Loading playlist management...");
      await postPlaylistManager({ action: "load", channelId });
      setPlaylistManagerStatus("Playlist management ready.");
    } catch (err) {
      setPlaylistManager(current => ({ ...current, loading: false }));
      setPlaylistManagerStatus(err?.message || "Could not load playlist management.");
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    loadPlaylistManager("");
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const loadOnlineUserInfo = async () => {
      let liveStats = null;
      try {
        liveStats = await fetchFuitsLiveOnlineStats(fuitsAdminBaseUrl);
        let adminDetails = [];
        let adminError = "";
        const params = new URLSearchParams({ password, cache: String(Date.now()) });
        try {
          const response = await fetch(`${fuitsAdminBaseUrl}/admin/online-users?${params.toString()}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Online users unavailable");
          const info = await response.json();
          adminDetails = Array.isArray(info.householdDetails) ? info.householdDetails : [];
          if (info.accessControl) setAccessControl(info.accessControl);
        } catch {
          adminError = liveStats.householdDetails.length
            ? ""
            : "Could not load detailed online user information yet.";
        }
        if (cancelled) return;
        setOnlineUserInfo({
          loading: false,
          devices: liveStats.devices,
          households: liveStats.households,
          householdDetails: adminDetails.length ? adminDetails : liveStats.householdDetails,
          error: adminError
        });
      } catch {
        if (!cancelled) setOnlineUserInfo(current => ({
          ...current,
          loading: false,
          devices: liveStats?.devices ?? current.devices,
          households: liveStats?.households ?? current.households,
          householdDetails: liveStats?.householdDetails?.length ? liveStats.householdDetails : current.householdDetails,
          error: "Could not load detailed online user information yet."
        }));
      }
    };

    loadOnlineUserInfo();
    const timer = setInterval(loadOnlineUserInfo, 12 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [unlocked, fuitsAdminBaseUrl, password]);

  const saveVideoChunkSize = async () => {
    setVideoChunkStatus("Saving video chunk size...");
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-stream-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, chunkMb: videoChunkMb })
      });
      if (!response.ok) {
        setVideoChunkStatus("Wrong password or server not ready.");
        return;
      }
      const settings = await response.json();
      setVideoChunkMb(Number(settings.chunkMb) || videoChunkMb);
      setVideoChunkStatus(`Saved. All streams now use ${settings.chunkMb} MB chunks.`);
    } catch {
      setVideoChunkStatus("Could not save video chunk size yet.");
    }
  };

  const postAccessControl = async payload => {
    const response = await fetch(`${fuitsAdminBaseUrl}/admin/access-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...payload })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    setAccessControl(result.accessControl || { whitelistIps: [], blacklistIps: [], whitelistDevices: [], blacklistDevices: [] });
    return result;
  };

  const loadAccessControl = async () => {
    try {
      setAccessControlStatus("Loading access control...");
      await postAccessControl({ action: "load" });
      setAccessControlStatus("Access control ready.");
    } catch (err) {
      setAccessControlStatus(err?.message || "Could not load access control.");
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    loadAccessControl();
  }, [unlocked]);

  const applyFuitCreditAdminResult = result => {
    const settings = { ...DEFAULT_FUIT_CREDIT_SETTINGS, ...(result.settings || {}) };
    setFuitCreditAdmin({
      loading: false,
      settings,
      wallets: result.wallets && typeof result.wallets === "object" ? result.wallets : {},
      balances: result.balances && typeof result.balances === "object" ? result.balances : {},
      deposits: Array.isArray(result.deposits) ? result.deposits : [],
      ledger: Array.isArray(result.ledger) ? result.ledger : [],
      blacklistedWallets: Array.isArray(result.blacklistedWallets) ? result.blacklistedWallets : [],
      totals: result.totals || { issued: 0, balance: 0, withdrawn: 0 },
      pendingCount: Number(result.pendingCount) || 0
    });
    setFuitTreasuryWallet(settings.treasuryWallet || "");
    setFuitInstructions(settings.instructions || DEFAULT_FUIT_CREDIT_SETTINGS.instructions);
  };

  const postAdminFuitCredits = async payload => {
    if (!fuitsAdminBaseUrl) throw new Error("FUITS Live TV URL is not set yet.");
    const response = await fetch(`${fuitsAdminBaseUrl.replace(/\/+$/, "")}/admin/fuit-credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...payload })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    applyFuitCreditAdminResult(result);
    return result;
  };

  const loadFuitCreditAdmin = async () => {
    try {
      setFuitCreditStatus("Loading FUIT Coin ledger...");
      await postAdminFuitCredits({ action: "load" });
      setFuitCreditStatus("FUIT Coin ledger ready.");
    } catch (err) {
      setFuitCreditAdmin(current => ({ ...current, loading: false }));
      setFuitCreditStatus(err?.message || "Could not load FUIT Coin ledger.");
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    loadFuitCreditAdmin();
  }, [unlocked]);

  const saveFuitCreditSettings = async () => {
    try {
      setFuitCreditStatus("Saving admin deposit wallet...");
      await postAdminFuitCredits({
        action: "settings",
        treasuryWallet: fuitTreasuryWallet,
        instructions: fuitInstructions
      });
      setFuitCreditStatus("Admin deposit wallet saved. Users will deposit to this wallet.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not save admin deposit wallet.");
    }
  };

  const issueFuitDeposit = async deposit => {
    const amount = window.prompt("FUIT Coin amount to issue", String(deposit.amount || ""));
    if (!amount) return;
    const adminNote = window.prompt("Admin note for this issue", "") || "";
    try {
      setFuitCreditStatus("Issuing FUIT Coin for deposit...");
      await postAdminFuitCredits({ action: "issueDeposit", depositId: deposit.id, amount, adminNote });
      setFuitCreditStatus("FUIT Coin issued for approved deposit.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not issue FUIT Coin.");
    }
  };

  const rejectFuitDeposit = async deposit => {
    const adminNote = window.prompt("Reason or note for rejection", "") || "";
    try {
      setFuitCreditStatus("Rejecting deposit...");
      await postAdminFuitCredits({ action: "rejectDeposit", depositId: deposit.id, adminNote });
      setFuitCreditStatus("Deposit rejected.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not reject deposit.");
    }
  };

  const manualIssueFuit = async () => {
    try {
      setFuitCreditStatus("Manually issuing FUIT Coin...");
      await postAdminFuitCredits({
        action: "manualIssue",
        username: fuitManualUsername,
        wallet: fuitManualWallet,
        amount: fuitManualAmount,
        note: fuitManualNote
      });
      setFuitManualUsername("");
      setFuitManualWallet("");
      setFuitManualAmount("");
      setFuitManualNote("");
      setFuitCreditStatus("Manual FUIT Coin issue saved.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not manually issue FUIT Coin.");
    }
  };

  const withdrawFuitCredits = async () => {
    try {
      setFuitCreditStatus("Withdrawing FUIT Coin from user balance...");
      await postAdminFuitCredits({
        action: "withdrawCredits",
        username: fuitWithdrawUsername,
        amount: fuitWithdrawAmount,
        note: fuitWithdrawNote
      });
      setFuitWithdrawUsername("");
      setFuitWithdrawAmount("");
      setFuitWithdrawNote("");
      setFuitCreditStatus("FUIT Coin withdrawn from user balance.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not withdraw FUIT Coin.");
    }
  };

  const blacklistFuitWallet = async () => {
    try {
      setFuitCreditStatus("Blacklisting FUIT wallet...");
      await postAdminFuitCredits({ action: "blacklistWallet", wallet: fuitBlacklistWallet, note: fuitBlacklistNote });
      setFuitBlacklistWallet("");
      setFuitBlacklistNote("");
      setFuitCreditStatus("Wallet blacklisted for FUIT Coin deposits.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not blacklist wallet.");
    }
  };

  const unblacklistFuitWallet = async wallet => {
    try {
      setFuitCreditStatus("Removing FUIT wallet blacklist...");
      await postAdminFuitCredits({ action: "unblacklistWallet", wallet });
      setFuitCreditStatus("Wallet removed from FUIT blacklist.");
    } catch (err) {
      setFuitCreditStatus(err?.message || "Could not remove wallet blacklist.");
    }
  };

  const addAccessControlEntry = async (list = accessControlList, value = accessControlValue, note = accessControlNote) => {
    if (!String(value || "").trim()) {
      setAccessControlStatus("Enter an IP or device ID first.");
      return;
    }
    try {
      setAccessControlStatus("Saving access control...");
      await postAccessControl({ action: "add", list, value, note });
      setAccessControlValue("");
      setAccessControlNote("");
      setAccessControlStatus("Access control updated.");
    } catch (err) {
      setAccessControlStatus(err?.message || "Access control update failed.");
    }
  };

  const removeAccessControlEntry = async (list, value) => {
    try {
      setAccessControlStatus("Removing access control entry...");
      await postAccessControl({ action: "remove", list, value });
      setAccessControlStatus("Access control updated.");
    } catch (err) {
      setAccessControlStatus(err?.message || "Could not remove access control entry.");
    }
  };

  const renderAccessControlList = (title, listKey, items) => (
    <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 10, display: "grid", gap: 6 }}>
      <div style={{ color: "#dbeafe", fontSize: 12, fontWeight: 1000 }}>{title}</div>
      {(items || []).map(item => (
        <div key={`${listKey}-${item.value}`} style={{ display: "grid", gap: 4, borderTop: "1px solid rgba(148,163,184,.16)", paddingTop: 6 }}>
          <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 900, overflowWrap: "anywhere" }}>{item.value}</div>
          {item.note && <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>{item.note}</div>}
          <button type="button" onClick={() => removeAccessControlEntry(listKey, item.value)} style={{ ...adminButtonStyle, width: "fit-content", padding: "7px 9px", fontSize: 11, borderColor: "#fb7185", background: "#fb7185" }}>
            Remove
          </button>
        </div>
      ))}
      {!(items || []).length && <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>None</div>}
    </div>
  );

  const runPlaylistAction = async (payload, successMessage) => {
    try {
      setPlaylistManagerStatus("Saving playlist change...");
      await postPlaylistManager(payload);
      setPlaylistManagerStatus(successMessage || "Playlist updated.");
    } catch (err) {
      setPlaylistManager(current => ({ ...current, loading: false }));
      setPlaylistManagerStatus(err?.message || "Playlist update failed.");
    }
  };

  const createPlaylistChannelFromAdmin = () => {
    if (!playlistManagerNewChannelName.trim()) {
      setPlaylistManagerStatus("Enter a new playlist channel name.");
      return;
    }
    runPlaylistAction({ action: "createChannel", name: playlistManagerNewChannelName }, "Playlist channel created.");
    setPlaylistManagerNewChannelName("");
  };

  const renamePlaylistChannelFromAdmin = () => {
    if (!playlistManagerChannelId || !playlistManagerRenameChannelName.trim()) return;
    if (!window.confirm(`Rename this playlist channel to ${playlistManagerRenameChannelName.trim()}?`)) return;
    runPlaylistAction({ action: "renameChannel", channelId: playlistManagerChannelId, name: playlistManagerRenameChannelName }, "Playlist channel renamed.");
  };

  const deletePlaylistChannelFromAdmin = () => {
    const label = playlistManager.selectedChannel?.label || "this playlist channel";
    if (!playlistManagerChannelId) return;
    if (!window.confirm(`Delete playlist channel ${label}? This deletes the playlist file, not the videos.`)) return;
    runPlaylistAction({ action: "deleteChannel", channelId: playlistManagerChannelId }, "Playlist channel deleted.");
  };

  const addPlaylistVideoFromAdmin = () => {
    if (!playlistManagerAddPath) {
      setPlaylistManagerStatus("Choose a video to add.");
      return;
    }
    runPlaylistAction({ action: "addItems", channelId: playlistManagerChannelId, paths: [playlistManagerAddPath] }, "Video added to playlist.");
  };

  const renamePlaylistItemFromAdmin = item => {
    const title = window.prompt("New playlist display name", item.title || item.fileName || "");
    if (!title) return;
    runPlaylistAction({ action: "renameItem", channelId: playlistManagerChannelId, index: item.index, title }, "Playlist item renamed.");
  };

  const renamePlaylistFileFromAdmin = item => {
    const currentName = (item.fileName || "").replace(/\.[^.]+$/, "");
    const name = window.prompt("New video file name", currentName);
    if (!name) return;
    runPlaylistAction({ action: "renameFile", channelId: playlistManagerChannelId, path: item.file, name }, "Video file renamed.");
  };

  const removePlaylistItemFromAdmin = item => {
    if (!window.confirm(`Remove ${item.title || item.fileName} from this playlist? The video file stays in the videos folder.`)) return;
    runPlaylistAction({ action: "removeItem", channelId: playlistManagerChannelId, index: item.index, deleteFile: false }, "Removed from playlist.");
  };

  const deletePlaylistFileFromAdmin = item => {
    if (!window.confirm(`DELETE ${item.title || item.fileName} from the videos folder and remove it from all playlists?`)) return;
    runPlaylistAction({ action: "removeItem", channelId: playlistManagerChannelId, index: item.index, deleteFile: true }, "Video file deleted.");
  };

  const scanVideoRepair = async () => {
    if (!window.confirm("Run the video repair check on T:\\FattysLiveTV\\Videos?")) return;
    setVideoRepairBusy(true);
    setVideoRepairStatus("Checking videos...");
    setVideoRepairFlagged([]);
    setVideoRepairReport("");
    setVideoRepairLog([]);
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setVideoRepairFlagged(Array.isArray(result.flagged) ? result.flagged : []);
      setVideoRepairReport(result.reportPath || "");
      setVideoRepairStatus(`Checked ${result.checked || 0} videos. Suggested repairs: ${result.flaggedCount || 0}.`);
    } catch (err) {
      setVideoRepairStatus(err?.message || "Video repair check failed.");
    } finally {
      setVideoRepairBusy(false);
    }
  };

  const runVideoRepair = async (action, target = "all") => {
    const isAll = target === "all";
    const selected = isAll ? null : videoRepairFlagged[Number(target)];
    const actionLabel = action === "remux" ? "remux" : "audio timing fix";
    const targetLabel = isAll ? "ALL suggested videos" : selected?.fileName;
    if (!targetLabel) return;
    if (!window.confirm(`Run ${actionLabel} on ${targetLabel}?`)) return;

    setVideoRepairBusy(true);
    setVideoRepairCancelling(false);
    videoRepairCancelRequestedRef.current = false;
    setVideoRepairStatus(`Running ${actionLabel}...`);
    setVideoRepairLog([]);
    setVideoRepairProgress(isAll ? {
      action: actionLabel,
      current: "",
      done: 0,
      failed: 0,
      startedAt: Date.now(),
      total: videoRepairFlagged.length
    } : null);
    setVideoRepairProgressNow(Date.now());
    let startedServerQueue = false;
    try {
      if (isAll) {
        const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password,
            action,
            finish: videoRepairFinish,
            overwriteExisting: videoRepairOverwrite,
            background: true,
            paths: videoRepairFlagged.map(video => video.path).filter(Boolean)
          })
        });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        const batch = result.batch || {};
        startedServerQueue = true;
        setServerVideoRepairStatus(current => ({ ...(current || {}), active: true, batch }));
        setVideoRepairStatus(`${actionLabel} queue started on the server. You can leave Admin and it will keep going.`);
        setVideoRepairProgress({
          action: actionLabel,
          current: batch.current?.relativePath || batch.current?.fileName || "Waiting for first video.",
          done: Number(batch.done) || 0,
          failed: Number(batch.failed) || 0,
          source: "server",
          startedAt: Number(batch.startedAtMs) || Date.now(),
          total: Number(batch.total) || videoRepairFlagged.length
        });
        return;
      }

      const payload = {
        password,
        action,
        finish: videoRepairFinish,
        overwriteExisting: videoRepairOverwrite,
        paths: [selected.path]
      };
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setVideoRepairLog(Array.isArray(result.results) ? result.results : []);
      if (result.cancelled || (Array.isArray(result.results) && result.results.some(item => item.status === "cancelled"))) {
        setVideoRepairStatus("Repair stopped.");
        return;
      }
      const counts = result.counts || {};
      setVideoRepairStatus(`Repair complete. Kept ${counts.kept || 0}, overwritten ${counts.overwritten || 0}, replaced ${counts.replaced || 0}, deleted ${counts.deleted || 0}, skipped ${counts.skipped || 0}, failed ${counts.failed || 0}.`);
    } catch (err) {
      setVideoRepairStatus(err?.message || "Video repair failed.");
    } finally {
      setVideoRepairCancelling(false);
      if (!startedServerQueue) setVideoRepairBusy(false);
    }
  };

  const deleteVideoRepairItem = async index => {
    const selected = videoRepairFlagged[Number(index)];
    if (!selected?.path) return;
    const label = selected.relativePath || selected.fileName || "this video";
    if (!window.confirm(`Delete ${label} from T:\\FattysLiveTV\\Videos?`)) return;

    setVideoRepairBusy(true);
    setVideoRepairStatus(`Deleting ${selected.fileName || label}...`);
    setVideoRepairLog([]);
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, path: selected.path })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setVideoRepairFlagged(current => current.filter((item, itemIndex) => itemIndex !== Number(index)));
      setVideoRepairLog([result]);
      setVideoRepairStatus(`Deleted ${result.relativePath || result.fileName || label}.`);
    } catch (err) {
      setVideoRepairStatus(err?.message || "Video delete failed.");
    } finally {
      setVideoRepairCancelling(false);
      setVideoRepairBusy(false);
    }
  };

  const cancelVideoRepairQueue = async () => {
    videoRepairCancelRequestedRef.current = true;
    setVideoRepairCancelling(true);
    setVideoRepairStatus("Stopping the current repair and queue...");
    setVideoRepairProgress(current => current ? { ...current, current: "Stopping current video..." } : current);
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error(await response.text());
      setVideoRepairStatus("Stop requested. Waiting for the current repair to shut down...");
    } catch (err) {
      setVideoRepairStatus(err?.message || "Could not stop video repair.");
      setVideoRepairCancelling(false);
    }
  };

  const loadVideoRepairBackups = async () => {
    setVideoRepairBusy(true);
    setVideoRepairStatus("Loading old video repair backups...");
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      const backups = Array.isArray(result.backups) ? result.backups : [];
      setVideoRepairBackups(backups);
      setVideoRepairSelectedBackup(backups[0]?.path || "");
      setVideoRepairStatus(backups.length ? `Loaded ${backups.length} old backup${backups.length === 1 ? "" : "s"}.` : "No old backups found.");
    } catch (err) {
      setVideoRepairStatus(err?.message || "Could not load old backups.");
    } finally {
      setVideoRepairBusy(false);
    }
  };

  const restoreVideoRepairBackup = async () => {
    if (!videoRepairSelectedBackup) {
      setVideoRepairStatus("Load and choose an old backup first.");
      return;
    }
    if (!window.confirm("Restore this old backup over the current video? The current newer copy will be deleted.")) return;

    setVideoRepairBusy(true);
    setVideoRepairStatus("Restoring old backup...");
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/video-repair-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, backupPath: videoRepairSelectedBackup })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setVideoRepairLog([result]);
      setVideoRepairStatus(result.message || "Old backup restored.");
      await loadVideoRepairBackups();
    } catch (err) {
      setVideoRepairStatus(err?.message || "Restore failed.");
    } finally {
      setVideoRepairBusy(false);
    }
  };

  const changeAdminPassword = async () => {
    if (!newAdminPassword.trim()) {
      setPasswordStatus("Enter a new password first.");
      return;
    }
    setPasswordStatus("Updating admin password...");
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, newPassword: newAdminPassword.trim() })
      });
      if (!response.ok) {
        setPasswordStatus("Wrong current password or server not ready.");
        return;
      }
      setPassword(newAdminPassword.trim());
      setNewAdminPassword("");
      setPasswordStatus("Admin password updated everywhere.");
    } catch {
      setPasswordStatus("Could not update password yet.");
    }
  };

  const unlockAdmin = async event => {
    event.preventDefault();
    try {
      const response = await fetch(`${fuitsAdminBaseUrl}/admin/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error("Wrong password");
      setOnlineUserInfo({ loading: true, devices: 0, households: 0, householdDetails: [] });
      setUnlocked(true);
      setError("");
      return;
    } catch {
      setError("Wrong password");
    }
  };

  const formatWeatherLocation = location => {
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return "NULL";
    const lat = Number(location.latitude).toFixed(4);
    const lon = Number(location.longitude).toFixed(4);
    return `${lat}, ${lon}${location.timezone ? ` (${location.timezone})` : ""}`;
  };

  const formatDeviceProfile = profile => {
    if (!profile || typeof profile !== "object") return "Unknown device profile";
    const parts = [
      profile.deviceType,
      profile.modelHint || profile.os,
      profile.browser,
      profile.screen ? `Screen ${profile.screen}` : "",
      profile.viewport ? `View ${profile.viewport}` : "",
      Number.isFinite(Number(profile.pixelRatio)) ? `DPR ${Number(profile.pixelRatio).toFixed(2).replace(/\.00$/, "")}` : "",
      Number.isFinite(Number(profile.touchPoints)) ? `${profile.touchPoints} touch points` : ""
    ].filter(Boolean);
    return parts.join(" - ") || "Unknown device profile";
  };

  const playlistAvailableVideos = playlistManager.availableVideos.filter(video => {
    const query = playlistManagerSearch.trim().toLowerCase();
    if (!query) return true;
    return `${video.relativePath || ""} ${video.fileName || ""}`.toLowerCase().includes(query);
  });
  const adminPasswordRows = [
    { label: "Admin Page", password },
    { label: "Owner Ban", password },
    { label: "Blacklist Page", password },
    { label: "Playlist Management", password },
    { label: "Video Repair", password },
    { label: "Stream Controls", password },
    { label: "Shuffle / Next / Back", password },
    { label: "Restart Controls", password },
    { label: "Owner Everyone Ban", password: "fukuu" },
    { label: "Master Site Login", password: "MASTER / FartAss!1" },
    { label: "Crypto Admin", password: "FUCKNUTZ22!" }
  ];
  const userManagementRows = [
    { username: "MASTER", email: "", walletAddress: "", password: "FartAss!1", passwordKey: "masterUserManagement", profilePicture: "" },
    ...approvedUsers.map(user => ({
      ...user,
      passwordKey: `approvedUser_${user.id || user.username}`
    }))
  ];
  const signupInformationRows = [
    ...signupRequests.map(request => ({
      id: request.id,
      username: request.username,
      email: request.email || "",
      walletAddress: request.walletAddress || "",
      password: request.password || "",
      passwordKey: `signupInfo_${request.id}`,
      profilePicture: request.profilePicture || "",
      status: request.status || "pending",
      fullPhotoLibraryAccess: request.fullPhotoLibraryAccess === true,
      banned: bannedUsers.some(user => user.value === (request.username || "").toLowerCase() || user.value === (request.email || "").toLowerCase())
    })),
    ...approvedUsers
      .filter(user => !signupRequests.some(request =>
        (request.username || "").toUpperCase() === (user.username || "").toUpperCase() ||
        (request.email || "").toLowerCase() === (user.email || "").toLowerCase()
      ))
      .map(user => ({
        id: user.id || user.username,
        username: user.username,
        email: user.email || "",
        walletAddress: user.walletAddress || "",
        password: user.password || "",
        passwordKey: `signupInfo_${user.id || user.username}`,
        profilePicture: user.profilePicture || "",
        status: "approved",
        fullPhotoLibraryAccess: user.fullPhotoLibraryAccess === true,
        banned: bannedUsers.some(item => item.value === (user.username || "").toLowerCase() || item.value === (user.email || "").toLowerCase())
      }))
  ];
  const downloadUserPhotoLibrary = user => {
    if (!user?.profilePicture) {
      window.alert(`${user?.username || "This user"} has no available stored photos to download.`);
      return;
    }
    const bytes = getDataUrlByteSize(user.profilePicture);
    const sizeGb = formatBytesAsGb(bytes);
    const shouldDownload = window.confirm(`${user.username || "User"} available photos library is ${sizeGb} GB.\n\nWould you like to download the available photos library?\n\nYes or No`);
    if (!shouldDownload) return;
    const cleanName = String(user.username || "user").replace(/[^a-z0-9_-]+/gi, "_");
    downloadDataUrl(user.profilePicture, `${cleanName}-available-photo-library.jpg`);
  };

  if (unlocked) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: 24, boxSizing: "border-box" }}>
        <button onClick={onClose} style={{ border: "1px solid rgba(148,163,184,.3)", borderRadius: 999, background: "rgba(15,23,42,.9)", color: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 900, padding: "9px 14px" }}>
          Back
        </button>
        <div style={{ width: "100%", maxWidth: 1880, marginTop: 28, display: "grid", gap: 14, boxSizing: "border-box" }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 1000, letterSpacing: .4 }}>ADMIN</h1>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
              <section style={sectionStyle}>
                <h2 style={sectionTitleStyle}>CONTROLS</h2>
                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={controlLabelStyle}>VIDEO CONTROL</div>
                      <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>All Stream Chunk Size</div>
                    </div>
                    <div style={{ color: "#67e8f9", fontSize: 22, fontWeight: 1000 }}>{videoChunkMb} MB</div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={videoChunkMb}
                    onChange={event => setVideoChunkMb(Number(event.target.value))}
                    style={{ width: "100%", accentColor: "#67e8f9" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                    <span>1 MB</span>
                    <span>16 MB</span>
                  </div>
                  <button
                    type="button"
                    onClick={saveVideoChunkSize}
                    style={{ ...adminButtonStyle, width: "fit-content" }}
                  >
                    Save Video Control
                  </button>
                  <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{videoChunkStatus}</div>
                </div>
              </section>
              <section style={sectionStyle}>
                <h2 style={sectionTitleStyle}>WHITELIST / BLACKLIST</h2>
                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  <div>
                    <div style={controlLabelStyle}>ACCESS CONTROL</div>
                    <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Whitelist / Blacklist IPs + Devices</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) minmax(160px,1fr)", gap: 8 }}>
                    <select value={accessControlList} onChange={event => setAccessControlList(event.target.value)} style={adminInputStyle}>
                      <option value="blacklistIp">Blacklist IP</option>
                      <option value="whitelistIp">Whitelist IP</option>
                      <option value="blacklistDevice">Blacklist Device</option>
                      <option value="whitelistDevice">Whitelist Device</option>
                    </select>
                    <input value={accessControlValue} onChange={event => setAccessControlValue(event.target.value)} placeholder="IP or device ID" style={adminInputStyle} />
                  </div>
                  <input value={accessControlNote} onChange={event => setAccessControlNote(event.target.value)} placeholder="Note" style={adminInputStyle} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => addAccessControlEntry()} style={{ ...adminButtonStyle, width: "fit-content" }}>
                      Add Rule
                    </button>
                    <button type="button" onClick={loadAccessControl} style={{ ...adminButtonStyle, width: "fit-content", borderColor: "#94a3b8", background: "#94a3b8" }}>
                      Refresh Rules
                    </button>
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{accessControlStatus}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
                    {renderAccessControlList("BLACKLISTED IPS", "blacklistIp", accessControl.blacklistIps)}
                    {renderAccessControlList("WHITELISTED IPS", "whitelistIp", accessControl.whitelistIps)}
                    {renderAccessControlList("BLACKLISTED DEVICES", "blacklistDevice", accessControl.blacklistDevices)}
                    {renderAccessControlList("WHITELISTED DEVICES", "whitelistDevice", accessControl.whitelistDevices)}
                  </div>
                </div>
              </section>
            </div>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>PLAYLIST MANAGEMENT</h2>
              <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <div style={controlLabelStyle}>FUITS LIVE TV WORLD PLAYLIST CHANNELS</div>
                <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Choose, edit, add, or remove playlist content</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
                <select
                  value={playlistManagerChannelId}
                  onChange={event => loadPlaylistManager(event.target.value)}
                  disabled={playlistManager.loading}
                  style={adminInputStyle}
                >
                  {playlistManager.channels.map(channel => (
                    <option key={channel.id} value={channel.id}>{channel.label} ({channel.itemCount || 0})</option>
                  ))}
                </select>
                <button type="button" disabled={playlistManager.loading} onClick={() => loadPlaylistManager(playlistManagerChannelId)} style={{ ...adminButtonStyle, opacity: playlistManager.loading ? .62 : 1 }}>
                  Refresh
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
                <input
                  value={playlistManagerRenameChannelName}
                  onChange={event => setPlaylistManagerRenameChannelName(event.target.value)}
                  placeholder="Selected channel name"
                  style={adminInputStyle}
                />
                <button type="button" disabled={playlistManager.loading || !playlistManagerChannelId} onClick={renamePlaylistChannelFromAdmin} style={{ ...adminButtonStyle, opacity: playlistManager.loading || !playlistManagerChannelId ? .62 : 1 }}>
                  Rename Channel
                </button>
                <button type="button" disabled={playlistManager.loading || !playlistManagerChannelId} onClick={deletePlaylistChannelFromAdmin} style={{ ...adminButtonStyle, borderColor: "#fb7185", background: "#fb7185", opacity: playlistManager.loading || !playlistManagerChannelId ? .62 : 1 }}>
                  Delete Channel
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
                <input
                  value={playlistManagerNewChannelName}
                  onChange={event => setPlaylistManagerNewChannelName(event.target.value)}
                  placeholder="New playlist channel name"
                  style={adminInputStyle}
                />
                <button type="button" disabled={playlistManager.loading} onClick={createPlaylistChannelFromAdmin} style={{ ...adminButtonStyle, opacity: playlistManager.loading ? .62 : 1 }}>
                  Add Channel
                </button>
              </div>
              <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 900 }}>{playlistManagerStatus}</div>
              <div style={{ border: "1px solid rgba(148,163,184,.28)", background: "rgba(2,6,23,.72)", padding: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ color: "#f8fafc", fontSize: 15, fontWeight: 1000 }}>{playlistManager.selectedChannel?.label || "No playlist selected"}</div>
                  <div style={{ color: "#67e8f9", fontSize: 13, fontWeight: 1000 }}>{playlistManager.items.length} item{playlistManager.items.length === 1 ? "" : "s"}</div>
                </div>
                <div style={{ display: "grid", gap: 8, maxHeight: 300, overflow: "auto" }}>
                  {playlistManager.items.map(item => (
                    <div key={`${item.file}-${item.index}`} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 7 }}>
                      <div style={{ color: item.exists ? "#f8fafc" : "#fecaca", fontSize: 13, fontWeight: 1000, overflowWrap: "anywhere" }}>
                        {item.title || item.fileName}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>
                        {item.relativePath || item.file}{item.exists ? "" : " - missing file"}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={playlistManager.loading} onClick={() => renamePlaylistItemFromAdmin(item)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, opacity: playlistManager.loading ? .62 : 1 }}>Edit Name</button>
                        <button type="button" disabled={playlistManager.loading || !item.exists} onClick={() => renamePlaylistFileFromAdmin(item)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, opacity: playlistManager.loading || !item.exists ? .62 : 1 }}>Rename File</button>
                        <button type="button" disabled={playlistManager.loading} onClick={() => removePlaylistItemFromAdmin(item)} style={{ ...adminButtonStyle, borderColor: "#facc15", background: "#facc15", padding: "8px 10px", fontSize: 12, opacity: playlistManager.loading ? .62 : 1 }}>Remove From Playlist</button>
                        <button type="button" disabled={playlistManager.loading || !item.exists} onClick={() => deletePlaylistFileFromAdmin(item)} style={{ ...adminButtonStyle, borderColor: "#fb7185", background: "#fb7185", padding: "8px 10px", fontSize: 12, opacity: playlistManager.loading || !item.exists ? .62 : 1 }}>Delete File</button>
                      </div>
                    </div>
                  ))}
                  {!playlistManager.items.length && (
                    <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>This playlist channel is empty.</div>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={controlLabelStyle}>ADD CONTENT FROM VIDEOS FOLDER</div>
                <input
                  value={playlistManagerSearch}
                  onChange={event => setPlaylistManagerSearch(event.target.value)}
                  placeholder="Search videos folder"
                  style={adminInputStyle}
                />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10 }}>
                  <select
                    value={playlistManagerAddPath}
                    onChange={event => setPlaylistManagerAddPath(event.target.value)}
                    style={adminInputStyle}
                  >
                    <option value="">Choose video to add</option>
                    {playlistAvailableVideos.slice(0, 250).map(video => (
                      <option key={video.path} value={video.path}>{video.relativePath || video.fileName}</option>
                    ))}
                  </select>
                  <button type="button" disabled={playlistManager.loading || !playlistManagerAddPath || !playlistManagerChannelId} onClick={addPlaylistVideoFromAdmin} style={{ ...adminButtonStyle, opacity: playlistManager.loading || !playlistManagerAddPath || !playlistManagerChannelId ? .62 : 1 }}>
                    Add To Playlist
                  </button>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
                  Showing {Math.min(playlistAvailableVideos.length, 250)} of {playlistAvailableVideos.length} matching videos.
                </div>
              </div>
              </div>
            </section>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>ADMIN PASSWORDS</h2>
              <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                <div style={{ border: "1px solid rgba(96,165,250,.35)", background: "rgba(2,6,23,.72)", padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={controlLabelStyle}>ADMIN SECURITY</div>
                      <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Change Admin Password</div>
                    </div>
                    <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(103,232,249,.5)", display: "grid", placeItems: "center", color: "#67e8f9", fontSize: 20, fontWeight: 1000 }}>
                      &#128273;
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) auto", gap: 10 }}>
                    <input
                      type="password"
                      value={newAdminPassword}
                      onChange={event => setNewAdminPassword(event.target.value)}
                      placeholder="New admin password"
                      style={adminInputStyle}
                    />
                    <button type="button" onClick={changeAdminPassword} style={adminButtonStyle}>
                      Update
                    </button>
                  </div>
                  {passwordStatus && <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{passwordStatus}</div>}
                </div>
                {adminPasswordRows.map(row => (
                  <div key={row.label} style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 10, display: "grid", gridTemplateColumns: "minmax(130px,1fr) minmax(72px,auto) auto", gap: 10, alignItems: "center" }}>
                    <div style={{ color: "#dbeafe", fontSize: 12, fontWeight: 1000, textTransform: "uppercase" }}>{row.label}</div>
                    <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 1000, overflowWrap: "anywhere", textAlign: "right" }}>
                      {visibleAdminPasswords[row.label] ? row.password : "********"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setVisibleAdminPasswords(current => ({ ...current, [row.label]: !current[row.label] }))}
                      style={{ ...adminButtonStyle, padding: "7px 10px", fontSize: 11, borderColor: "#94a3b8", background: "#94a3b8" }}
                    >
                      {visibleAdminPasswords[row.label] ? "Hide" : "Show"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>USER MANAGEMENT</h2>
              <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 8, display: "grid", gridTemplateColumns: "minmax(78px,.9fr) minmax(96px,1.35fr) minmax(46px,auto) minmax(48px,.55fr) auto", gap: 6, alignItems: "center" }}>
                  <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase" }}>Username</div>
                  <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase" }}>Email</div>
                  <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase", textAlign: "center" }}>Status</div>
                  <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase", textAlign: "right" }}>Password</div>
                  <div />
                </div>
                {userManagementRows.map(user => {
                  const isLoggedIn = String(loggedInUsername || "").toUpperCase() === user.username.toUpperCase();
                  return (
                    <div key={user.username} style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 8, display: "grid", gridTemplateColumns: "minmax(78px,.9fr) minmax(96px,1.35fr) minmax(46px,auto) minmax(48px,.55fr) auto", gap: 6, alignItems: "center", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px solid rgba(191,219,254,.58)",
                          background: user.profilePicture ? `center / cover no-repeat url(${user.profilePicture})` : "rgba(30,41,59,.92)",
                          color: "#bfdbfe",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 9,
                          fontWeight: 1000,
                          flexShrink: 0,
                          overflow: "hidden",
                          textTransform: "uppercase"
                        }}>
                          {!user.profilePicture && String(user.username || "?").slice(0, 1)}
                        </div>
                        <div style={{ color: "#f8fafc", fontSize: 11, fontWeight: 1000, textTransform: "uppercase", overflowWrap: "anywhere", lineHeight: 1.15 }}>{user.username}</div>
                      </div>
                      <div style={{ color: "#cbd5e1", fontSize: 11, fontWeight: 900, overflowWrap: "anywhere", lineHeight: 1.15, minWidth: 0 }}>
                        <div>{user.email || "No email yet"}</div>
                        {user.walletAddress && <div style={{ color: "#93c5fd", fontSize: 10, marginTop: 3 }}>Wallet: {user.walletAddress}</div>}
                      </div>
                      <div style={{
                        border: `1px solid ${isLoggedIn ? "rgba(34,197,94,.72)" : "rgba(148,163,184,.36)"}`,
                        borderRadius: 999,
                        background: isLoggedIn ? "rgba(22,101,52,.62)" : "rgba(51,65,85,.62)",
                        color: isLoggedIn ? "#bbf7d0" : "#cbd5e1",
                        fontSize: 9,
                        fontWeight: 1000,
                        padding: "4px 6px",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap"
                      }}>
                        {isLoggedIn ? "Logged In" : "Offline"}
                      </div>
                      <div style={{ color: "#f8fafc", fontSize: 11, fontWeight: 1000, overflowWrap: "anywhere", textAlign: "right", lineHeight: 1.15 }}>
                        {visibleAdminPasswords[user.passwordKey] ? user.password : "********"}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVisibleAdminPasswords(current => ({ ...current, [user.passwordKey]: !current[user.passwordKey] }))}
                        style={{ ...adminButtonStyle, padding: "6px 8px", fontSize: 10, borderColor: "#94a3b8", background: "#94a3b8" }}
                      >
                        {visibleAdminPasswords[user.passwordKey] ? "Hide" : "Show"}
                      </button>
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid rgba(148,163,184,.22)", marginTop: 8, paddingTop: 14, display: "grid", gap: 8 }}>
                  <h3 style={{ margin: 0, color: "#dbeafe", fontSize: 16, fontWeight: 1000, textTransform: "uppercase" }}>SIGN UP / COMMUNICATION</h3>
                  {!signupRequests.length && (
                    <div style={{ border: "1px dashed rgba(148,163,184,.28)", background: "rgba(2,6,23,.36)", padding: 12, color: "#94a3b8", fontSize: 13, fontWeight: 900, textAlign: "center" }}>
                      No signup requests yet.
                    </div>
                  )}
                  {signupRequests.map(request => {
                    const status = request.status || "pending";
                    const isPending = status === "pending";
                    return (
                      <div key={request.id} style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 10, display: "grid", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "start" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <div style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              border: "1px solid rgba(191,219,254,.58)",
                              background: request.profilePicture ? `center / cover no-repeat url(${request.profilePicture})` : "rgba(30,41,59,.92)",
                              color: "#bfdbfe",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 10,
                              fontWeight: 1000,
                              flexShrink: 0,
                              overflow: "hidden",
                              textTransform: "uppercase"
                            }}>
                              {!request.profilePicture && String(request.username || "?").slice(0, 1)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 1000, textTransform: "uppercase", overflowWrap: "anywhere" }}>{request.username}</div>
                              <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 900, overflowWrap: "anywhere" }}>{request.email}</div>
                              {request.walletAddress && <div style={{ color: "#93c5fd", fontSize: 11, fontWeight: 900, overflowWrap: "anywhere" }}>Wallet: {request.walletAddress}</div>}
                            </div>
                          </div>
                          <div style={{
                            border: `1px solid ${status === "approved" ? "rgba(34,197,94,.72)" : status === "denied" ? "rgba(248,113,113,.72)" : "rgba(250,204,21,.72)"}`,
                            background: status === "approved" ? "rgba(22,101,52,.62)" : status === "denied" ? "rgba(127,29,29,.62)" : "rgba(113,63,18,.62)",
                            color: status === "approved" ? "#bbf7d0" : status === "denied" ? "#fecaca" : "#fef3c7",
                            fontSize: 10,
                            fontWeight: 1000,
                            padding: "5px 8px",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap"
                          }}>
                            {status}
                          </div>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>
                          Requested password: {visibleAdminPasswords[`signup_${request.id}`] ? request.password : "********"}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setVisibleAdminPasswords(current => ({ ...current, [`signup_${request.id}`]: !current[`signup_${request.id}`] }))}
                            style={{ ...adminButtonStyle, padding: "7px 10px", fontSize: 11, borderColor: "#94a3b8", background: "#94a3b8" }}
                          >
                            {visibleAdminPasswords[`signup_${request.id}`] ? "Hide" : "Show"}
                          </button>
                          {isPending && (
                            <button type="button" onClick={() => onApproveSignup(request.id)} style={{ ...adminButtonStyle, padding: "7px 10px", fontSize: 11 }}>
                              Approve
                            </button>
                          )}
                          {isPending && (
                            <button type="button" onClick={() => onDenySignup(request.id)} style={{ ...adminButtonStyle, padding: "7px 10px", fontSize: 11, borderColor: "#fb7185", background: "#fb7185" }}>
                              No
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: "1px solid rgba(148,163,184,.22)", marginTop: 8, paddingTop: 14, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, color: "#dbeafe", fontSize: 16, fontWeight: 1000, textTransform: "uppercase" }}>USER INFORMATION</h3>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" onClick={onBanUser} style={{ ...adminButtonStyle, padding: "5px 8px", fontSize: 10, borderColor: "#fb7185", background: "#fb7185" }}>
                          Ban
                        </button>
                        <button type="button" onClick={onUnbanUser} style={{ ...adminButtonStyle, padding: "5px 8px", fontSize: 10, borderColor: "#bbf7d0", background: "#bbf7d0" }}>
                          Unban
                        </button>
                        <button type="button" onClick={onShowBanList} style={{ ...adminButtonStyle, padding: "5px 8px", fontSize: 10, borderColor: "#94a3b8", background: "#94a3b8" }}>
                          Ban List
                        </button>
                      </div>
                    </div>
                    <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 8, display: "grid", gridTemplateColumns: "minmax(108px,1.05fr) minmax(84px,1.15fr) minmax(58px,.65fr) minmax(58px,auto) minmax(58px,auto)", gap: 6, alignItems: "center" }}>
                      <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase" }}>Username</div>
                      <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase" }}>Email</div>
                      <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase", textAlign: "right" }}>Password</div>
                      <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase", textAlign: "center" }}>Status</div>
                      <div style={{ color: "#dbeafe", fontSize: 10, fontWeight: 1000, textTransform: "uppercase", textAlign: "center" }}>All Photos</div>
                    </div>
                    {!signupInformationRows.length && (
                      <div style={{ border: "1px dashed rgba(148,163,184,.28)", background: "rgba(2,6,23,.36)", padding: 12, color: "#94a3b8", fontSize: 13, fontWeight: 900, textAlign: "center" }}>
                        No signup user information yet.
                      </div>
                    )}
                    {signupInformationRows.map(user => (
                      <div key={`signupInfo_${user.id}`} style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 8, display: "grid", gridTemplateColumns: "minmax(108px,1.05fr) minmax(84px,1.15fr) minmax(58px,.65fr) minmax(58px,auto) minmax(58px,auto)", gap: 6, alignItems: "center", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            border: "1px solid rgba(191,219,254,.58)",
                            background: user.profilePicture ? `center / cover no-repeat url(${user.profilePicture})` : "rgba(30,41,59,.92)",
                            color: "#bfdbfe",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 9,
                            fontWeight: 1000,
                            flexShrink: 0,
                            overflow: "hidden",
                            textTransform: "uppercase"
                          }}>
                            {!user.profilePicture && String(user.username || "?").slice(0, 1)}
                          </div>
                          <div style={{ color: "#f8fafc", fontSize: 11, fontWeight: 1000, textTransform: "uppercase", overflowWrap: "anywhere", lineHeight: 1.15, minWidth: 0 }}>{user.username}</div>
                        </div>
                        <div style={{ color: "#cbd5e1", fontSize: 11, fontWeight: 900, overflowWrap: "anywhere", lineHeight: 1.15, minWidth: 0 }}>
                          <div>{user.email || "No email"}</div>
                          {user.walletAddress && <div style={{ color: "#93c5fd", fontSize: 10, marginTop: 3 }}>Wallet: {user.walletAddress}</div>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => window.alert(`${user.username || "User"} password:\n\n${user.password || "No password"}`)}
                            style={{ ...adminButtonStyle, padding: "4px 6px", fontSize: 9, borderColor: "#94a3b8", background: "#94a3b8" }}
                          >
                            Show
                          </button>
                        </div>
                        <div style={{ color: user.banned ? "#fecaca" : "#fef3c7", fontSize: 9, fontWeight: 1000, textTransform: "uppercase", textAlign: "center", overflowWrap: "anywhere" }}>{user.banned ? "banned" : user.status}</div>
                        <div style={{
                          border: `1px solid ${user.fullPhotoLibraryAccess ? "rgba(34,197,94,.72)" : "rgba(248,113,113,.72)"}`,
                          background: user.fullPhotoLibraryAccess ? "rgba(22,101,52,.62)" : "rgba(127,29,29,.62)",
                          color: user.fullPhotoLibraryAccess ? "#bbf7d0" : "#fecaca",
                          fontSize: 10,
                          fontWeight: 1000,
                          padding: "4px 6px",
                          textAlign: "center",
                          textTransform: "uppercase"
                        }}>
                          {user.fullPhotoLibraryAccess ? "Yes" : "No"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>VIDEO REPAIR</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <div style={controlLabelStyle}>VIDEOS FOLDER CHECK</div>
                <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Remuxer + Audio Timing Fix</div>
              </div>
              <button
                type="button"
                disabled={videoRepairBusy}
                onClick={scanVideoRepair}
                style={{ ...adminButtonStyle, width: "fit-content", maxWidth: "100%", opacity: videoRepairBusy ? .62 : 1 }}
              >
                Run Check On Videos Folder
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, minWidth: 0 }}>
                <select
                  value={videoRepairFinish}
                  onChange={event => setVideoRepairFinish(event.target.value)}
                  style={{ ...adminInputStyle, minWidth: 0, width: "100%" }}
                >
                  <option value="keep">Keep fixed copy next to original</option>
                  <option value="overwrite">Fix Original And Overwrite</option>
                  <option value="replace">Replace Original With Fixed Copy</option>
                  <option value="delete">Delete fixed copy and keep original</option>
                </select>
                <label style={{ ...adminInputStyle, display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflowWrap: "anywhere" }}>
                  <input
                    type="checkbox"
                    checked={videoRepairOverwrite}
                    onChange={event => setVideoRepairOverwrite(event.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  Overwrite existing fixed copies
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={videoRepairBusy || !videoRepairFlagged.length}
                  onClick={() => runVideoRepair("remux", "all")}
                  style={{ ...adminButtonStyle, opacity: videoRepairBusy || !videoRepairFlagged.length ? .62 : 1 }}
                >
                  Remux All Suggested
                </button>
                <button
                  type="button"
                  disabled={videoRepairBusy || !videoRepairFlagged.length}
                  onClick={() => runVideoRepair("syncfix", "all")}
                  style={{ ...adminButtonStyle, borderColor: "#facc15", background: "#facc15", opacity: videoRepairBusy || !videoRepairFlagged.length ? .62 : 1 }}
                >
                  Audio Fix All Suggested
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) repeat(2,minmax(110px,auto))", gap: 10, alignItems: "center", minWidth: 0 }}>
                <select
                  value={videoRepairSelectedBackup}
                  onChange={event => setVideoRepairSelectedBackup(event.target.value)}
                  style={{ ...adminInputStyle, minWidth: 0, width: "100%" }}
                >
                  <option value="">No old backup selected</option>
                  {videoRepairBackups.map((backup, index) => (
                    <option key={`${backup.path}-${index}`} value={backup.path}>
                      {(backup.targetRelativePath || backup.fileName || "Old backup") + " - " + (backup.modifiedAt ? new Date(backup.modifiedAt).toLocaleString() : "unknown date")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={videoRepairBusy}
                  onClick={loadVideoRepairBackups}
                  style={{ ...adminButtonStyle, minWidth: 0, whiteSpace: "normal", opacity: videoRepairBusy ? .62 : 1 }}
                >
                  Load Old Backups
                </button>
                <button
                  type="button"
                  disabled={videoRepairBusy || !videoRepairSelectedBackup}
                  onClick={restoreVideoRepairBackup}
                  style={{ ...adminButtonStyle, minWidth: 0, whiteSpace: "normal", borderColor: "#fb7185", background: "#fb7185", opacity: videoRepairBusy || !videoRepairSelectedBackup ? .62 : 1 }}
                >
                  Restore Old Backup
                </button>
              </div>
              {serverVideoRepairStatus?.active && (
                <div style={{ border: "1px solid rgba(250,204,21,.48)", background: "rgba(113,63,18,.42)", color: "#fef3c7", padding: 12, fontSize: 13, fontWeight: 1000, overflowWrap: "anywhere" }}>
                  VIDEO EDITING IN PROGRESS, CURRENTLY ON {serverVideoRepairStatus.relativePath || serverVideoRepairStatus.fileName || "CURRENT VIDEO"}
                </div>
              )}
              {videoRepairProgress && (
                <div style={{ border: "1px solid rgba(148,163,184,.28)", background: "rgba(2,6,23,.72)", padding: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#f8fafc", fontSize: 13, fontWeight: 1000, flexWrap: "wrap" }}>
                    <span>{videoRepairProgress.action || "Repair"} progress</span>
                    <span>{videoRepairProgress.done || 0} / {videoRepairProgress.total || 0} ({getRepairProgressPercent()}%)</span>
                  </div>
                  <div style={{ height: 12, borderRadius: 999, background: "rgba(148,163,184,.22)", overflow: "hidden" }}>
                    <div style={{ width: `${getRepairProgressPercent()}%`, height: "100%", background: "#67e8f9", transition: "width .2s ease" }} />
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                    Current: {videoRepairProgress.current || "Waiting for next video."}
                    <br />
                    Elapsed: {formatRepairTime((videoRepairProgressNow - videoRepairProgress.startedAt) / 1000)} / Estimated left: {getRepairProgressEta()} / Failed: {videoRepairProgress.failed || 0}
                  </div>
                  {videoRepairBusy && (
                    <button
                      type="button"
                      disabled={videoRepairCancelling}
                      onClick={cancelVideoRepairQueue}
                      style={{ ...adminButtonStyle, width: "fit-content", borderColor: "#fb7185", background: "#fb7185", opacity: videoRepairCancelling ? .62 : 1 }}
                    >
                      {videoRepairCancelling ? "Stopping..." : "Cancel / Stop Editing"}
                    </button>
                  )}
                </div>
              )}
              <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 900 }}>{videoRepairStatus}</div>
              {videoRepairReport && (
                <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>Report: {videoRepairReport}</div>
              )}
              {!!videoRepairFlagged.length && (
                <div style={{ display: "grid", gap: 10, maxHeight: 360, overflow: "auto" }}>
                  {videoRepairFlagged.map((video, index) => (
                    <div key={`${video.path}-${index}`} style={{ border: "1px solid rgba(148,163,184,.24)", background: "rgba(2,6,23,.72)", padding: 12, display: "grid", gap: 8, minWidth: 0, overflow: "hidden" }}>
                      <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 1000, overflowWrap: "anywhere" }}>{video.relativePath || video.fileName}</div>
                      <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                        Video {video.videoSeconds}s / Audio {video.audioSeconds}s / Difference {video.durationDiffSeconds}s / Start difference {video.startDiffSeconds}s / Audio {video.audioCodec || "unknown"}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={videoRepairBusy} onClick={() => runVideoRepair("remux", index)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, opacity: videoRepairBusy ? .62 : 1 }}>Remux</button>
                        <button type="button" disabled={videoRepairBusy} onClick={() => runVideoRepair("syncfix", index)} style={{ ...adminButtonStyle, borderColor: "#facc15", background: "#facc15", padding: "8px 10px", fontSize: 12, opacity: videoRepairBusy ? .62 : 1 }}>Audio Fix</button>
                        <button type="button" disabled={videoRepairBusy} onClick={() => deleteVideoRepairItem(index)} style={{ ...adminButtonStyle, borderColor: "#fb7185", background: "#fb7185", padding: "8px 10px", fontSize: 12, opacity: videoRepairBusy ? .62 : 1 }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!!videoRepairLog.length && (
                <div style={{ display: "grid", gap: 6 }}>
                  {videoRepairLog.map((item, index) => (
                    <div key={`${item.fileName}-${index}`} style={{ color: item.ok === false ? "#fecaca" : "#bbf7d0", fontSize: 12, fontWeight: 900, overflowWrap: "anywhere" }}>
                      {item.fileName}: {item.status}{item.backupPath ? ` - Backup: ${item.backupPath}` : item.outputPath ? ` - Copy: ${item.outputPath}` : item.message ? ` - ${item.message}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>LIVE USER INFORMATION</h2>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <div style={{ border: "1px solid rgba(148,163,184,.24)", padding: 12, background: "rgba(2,6,23,.72)" }}>
                <div style={controlLabelStyle}>DEVICES CONNECTED</div>
                <div style={{ fontSize: 28, fontWeight: 1000, color: "#67e8f9" }}>{onlineUserInfo.loading ? "..." : onlineUserInfo.devices}</div>
              </div>
              <div style={{ border: "1px solid rgba(148,163,184,.24)", padding: 12, background: "rgba(2,6,23,.72)" }}>
                <div style={controlLabelStyle}>HOUSEHOLDS ONLINE</div>
                <div style={{ fontSize: 28, fontWeight: 1000, color: "#bbf7d0" }}>{onlineUserInfo.loading ? "..." : onlineUserInfo.households}</div>
              </div>
            </div>
            {onlineUserInfo.error && (
              <div style={{ marginTop: 12, color: "#fecaca", fontSize: 13, fontWeight: 900 }}>{onlineUserInfo.error}</div>
            )}
            {!onlineUserInfo.loading && !onlineUserInfo.householdDetails.length && onlineUserInfo.households === 0 && (
              <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 14, fontWeight: 900 }}>No users are currently connected.</div>
            )}
            {!onlineUserInfo.loading && !onlineUserInfo.householdDetails.length && onlineUserInfo.households > 0 && (
              <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 14, fontWeight: 900 }}>Household/device details are loading. Counts are live.</div>
            )}
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {onlineUserInfo.householdDetails.map(household => (
                <details key={household.ip} style={{ border: "1px solid rgba(96,165,250,.35)", background: "rgba(2,6,23,.7)", padding: 12 }}>
                  <summary style={{ cursor: "pointer", listStyle: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={controlLabelStyle}>HOUSEHOLD IP</div>
                        <div style={{ fontSize: 16, fontWeight: 1000, color: "#f8fafc" }}>{household.ip || "unknown"}</div>
                        {household.accessStatus?.blacklisted && <div style={{ color: "#fecaca", fontSize: 11, fontWeight: 1000 }}>BLACKLISTED</div>}
                        {household.accessStatus?.whitelisted && <div style={{ color: "#bbf7d0", fontSize: 11, fontWeight: 1000 }}>WHITELISTED</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={controlLabelStyle}>USER DEVICES CONNECTED</div>
                        <div style={{ fontSize: 18, fontWeight: 1000, color: "#67e8f9" }}>{household.deviceCount || 0}</div>
                      </div>
                    </div>
                  </summary>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => addAccessControlEntry("blacklistIp", household.ip, "Added from online users")} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, borderColor: "#fb7185", background: "#fb7185" }}>Blacklist IP</button>
                      <button type="button" onClick={() => removeAccessControlEntry("blacklistIp", household.ip)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12 }}>Unblacklist IP</button>
                      <button type="button" onClick={() => addAccessControlEntry("whitelistIp", household.ip, "Added from online users")} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, borderColor: "#bbf7d0", background: "#bbf7d0" }}>Whitelist IP</button>
                    </div>
                    {(household.devices || []).map(device => (
                      <div key={device.deviceId} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 4 }}>
                        <div style={{ color: "#dbeafe", fontSize: 13, fontWeight: 1000, overflowWrap: "anywhere" }}>Device ID: {device.deviceId || "unknown"}</div>
                        {device.accessStatus?.blacklisted && <div style={{ color: "#fecaca", fontSize: 11, fontWeight: 1000 }}>DEVICE BLACKLISTED</div>}
                        {device.accessStatus?.whitelisted && <div style={{ color: "#bbf7d0", fontSize: 11, fontWeight: 1000 }}>DEVICE WHITELISTED</div>}
                        <div style={{ color: "#fef3c7", fontSize: 12, fontWeight: 1000, overflowWrap: "anywhere" }}>Detected Device: {formatDeviceProfile(device.deviceProfile)}</div>
                        {device.deviceProfile?.platform && (
                          <div style={{ color: "#fde68a", fontSize: 11, fontWeight: 800, overflowWrap: "anywhere" }}>Platform Hint: {device.deviceProfile.platform}{device.deviceProfile.brands ? ` - ${device.deviceProfile.brands}` : ""}</div>
                        )}
                        <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>Location From Weather Check: {formatWeatherLocation(device.weatherLocation)}</div>
                        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800, overflowWrap: "anywhere" }}>Weather Permission: {device.weatherStatus || "unknown"}</div>
                        <div style={{ color: "#64748b", fontSize: 10, fontWeight: 800, overflowWrap: "anywhere" }}>Device Browser: {device.userAgent || "unknown"}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => addAccessControlEntry("blacklistDevice", device.deviceId, "Added from online users")} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11, borderColor: "#fb7185", background: "#fb7185" }}>Blacklist Device</button>
                          <button type="button" onClick={() => removeAccessControlEntry("blacklistDevice", device.deviceId)} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11 }}>Unblacklist Device</button>
                          <button type="button" onClick={() => addAccessControlEntry("whitelistDevice", device.deviceId, "Added from online users")} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11, borderColor: "#bbf7d0", background: "#bbf7d0" }}>Whitelist Device</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>FUIT COIN</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                <div style={{ border: "1px solid rgba(34,197,94,.42)", background: "rgba(20,83,45,.34)", padding: 12 }}>
                  <div style={controlLabelStyle}>ACTIVE BALANCE</div>
                  <div style={{ color: "#bbf7d0", fontSize: 24, fontWeight: 1000 }}>{formatFuitCreditAmount(fuitCreditAdmin.totals?.balance)} FUIT</div>
                </div>
                <div style={{ border: "1px solid rgba(96,165,250,.35)", background: "rgba(2,6,23,.72)", padding: 12 }}>
                  <div style={controlLabelStyle}>TOTAL ISSUED</div>
                  <div style={{ color: "#bfdbfe", fontSize: 24, fontWeight: 1000 }}>{formatFuitCreditAmount(fuitCreditAdmin.totals?.issued)} FUIT</div>
                </div>
                <div style={{ border: "1px solid rgba(250,204,21,.35)", background: "rgba(113,63,18,.32)", padding: 12 }}>
                  <div style={controlLabelStyle}>PENDING DEPOSITS</div>
                  <div style={{ color: "#fef3c7", fontSize: 24, fontWeight: 1000 }}>{fuitCreditAdmin.pendingCount || 0}</div>
                </div>
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 10 }}>
                <div>
                  <div style={controlLabelStyle}>ADMIN DEPOSIT WALLET</div>
                  <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Everyone deposits Polygon USDT to this wallet</div>
                </div>
                <input
                  value={fuitTreasuryWallet}
                  onChange={event => setFuitTreasuryWallet(event.target.value)}
                  placeholder="Admin Polygon wallet address"
                  style={adminInputStyle}
                />
                <textarea
                  value={fuitInstructions}
                  onChange={event => setFuitInstructions(event.target.value)}
                  placeholder="Deposit instructions users will see"
                  style={{ ...adminInputStyle, minHeight: 82, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={saveFuitCreditSettings} style={{ ...adminButtonStyle, width: "fit-content" }}>Save Admin Wallet</button>
                  <button type="button" onClick={loadFuitCreditAdmin} style={{ ...adminButtonStyle, width: "fit-content", borderColor: "#94a3b8", background: "#94a3b8" }}>Refresh</button>
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{fuitCreditStatus}</div>
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={controlLabelStyle}>USER DEPOSIT REPORTS</div>
                    <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 1000 }}>Approve deposits, then issue FUIT Coin</div>
                  </div>
                  <div style={{ color: "#67e8f9", fontSize: 13, fontWeight: 1000 }}>
                    {(fuitCreditAdmin.settings?.depositToken || "USDT")} on {(fuitCreditAdmin.settings?.depositNetwork || "Polygon")}
                  </div>
                </div>
                {!(fuitCreditAdmin.deposits || []).length && (
                  <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>No FUIT deposits reported yet.</div>
                )}
                {(fuitCreditAdmin.deposits || []).slice(0, 80).map(deposit => (
                  <div key={deposit.id} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 9, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 1000, overflowWrap: "anywhere" }}>
                        {deposit.username} - {formatFuitCreditAmount(deposit.amount)} {deposit.token || "USDT"}
                      </div>
                      <div style={{ color: deposit.status === "issued" ? "#bbf7d0" : deposit.status === "rejected" ? "#fecaca" : "#fef3c7", fontSize: 12, fontWeight: 1000, textTransform: "uppercase" }}>
                        {deposit.status}
                      </div>
                    </div>
                    <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>Wallet: {deposit.wallet}</div>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>TX: {deposit.txHash}</div>
                    {deposit.adminNote && <div style={{ color: "#dbeafe", fontSize: 12, fontWeight: 800 }}>Admin note: {deposit.adminNote}</div>}
                    {deposit.status === "pending" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => issueFuitDeposit(deposit)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12 }}>Approve + Issue</button>
                        <button type="button" onClick={() => rejectFuitDeposit(deposit)} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, borderColor: "#fb7185", background: "#fb7185" }}>Reject</button>
                        <button type="button" onClick={() => { setFuitManualUsername(deposit.username || ""); setFuitManualWallet(deposit.wallet || ""); setFuitManualAmount(String(deposit.amount || "")); }} style={{ ...adminButtonStyle, padding: "8px 10px", fontSize: 12, borderColor: "#94a3b8", background: "#94a3b8" }}>Use Below</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
                <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 8 }}>
                  <div style={controlLabelStyle}>MANUAL ISSUE</div>
                  <input value={fuitManualUsername} onChange={event => setFuitManualUsername(event.target.value)} placeholder="Username" style={adminInputStyle} />
                  <input value={fuitManualWallet} onChange={event => setFuitManualWallet(event.target.value)} placeholder="User wallet address" style={adminInputStyle} />
                  <input type="number" min="0" value={fuitManualAmount} onChange={event => setFuitManualAmount(event.target.value)} placeholder="FUIT amount" style={adminInputStyle} />
                  <input value={fuitManualNote} onChange={event => setFuitManualNote(event.target.value)} placeholder="Note" style={adminInputStyle} />
                  <button type="button" onClick={manualIssueFuit} style={adminButtonStyle}>Issue FUIT</button>
                </div>
                <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 8 }}>
                  <div style={controlLabelStyle}>WITHDRAW / REMOVE BALANCE</div>
                  <input value={fuitWithdrawUsername} onChange={event => setFuitWithdrawUsername(event.target.value)} placeholder="Username" style={adminInputStyle} />
                  <input type="number" min="0" value={fuitWithdrawAmount} onChange={event => setFuitWithdrawAmount(event.target.value)} placeholder="FUIT amount" style={adminInputStyle} />
                  <input value={fuitWithdrawNote} onChange={event => setFuitWithdrawNote(event.target.value)} placeholder="Note" style={adminInputStyle} />
                  <button type="button" onClick={withdrawFuitCredits} style={{ ...adminButtonStyle, borderColor: "#facc15", background: "#facc15" }}>Withdraw FUIT</button>
                </div>
                <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 8 }}>
                  <div style={controlLabelStyle}>BLACKLIST WALLET</div>
                  <input value={fuitBlacklistWallet} onChange={event => setFuitBlacklistWallet(event.target.value)} placeholder="Wallet address" style={adminInputStyle} />
                  <input value={fuitBlacklistNote} onChange={event => setFuitBlacklistNote(event.target.value)} placeholder="Note" style={adminInputStyle} />
                  <button type="button" onClick={blacklistFuitWallet} style={{ ...adminButtonStyle, borderColor: "#fb7185", background: "#fb7185" }}>Blacklist Wallet</button>
                </div>
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 10 }}>
                <div style={controlLabelStyle}>USER FUIT BALANCES</div>
                {!Object.values(fuitCreditAdmin.balances || {}).length && (
                  <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>No FUIT balances yet.</div>
                )}
                {Object.values(fuitCreditAdmin.balances || {}).map(balance => (
                  <div key={balance.username} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 1000 }}>{balance.username}</div>
                      <div style={{ color: "#bbf7d0", fontSize: 14, fontWeight: 1000 }}>{formatFuitCreditAmount(balance.balance)} FUIT</div>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>{balance.wallet || "No wallet saved"}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => { setFuitManualUsername(balance.username || ""); setFuitManualWallet(balance.wallet || ""); }} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11 }}>Issue More</button>
                      <button type="button" onClick={() => { setFuitWithdrawUsername(balance.username || ""); setFuitWithdrawAmount(""); }} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11, borderColor: "#facc15", background: "#facc15" }}>Withdraw</button>
                      {balance.wallet && <button type="button" onClick={() => setFuitBlacklistWallet(balance.wallet)} style={{ ...adminButtonStyle, padding: "7px 9px", fontSize: 11, borderColor: "#fb7185", background: "#fb7185" }}>Use For Blacklist</button>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 8 }}>
                <div style={controlLabelStyle}>BLACKLISTED FUIT WALLETS</div>
                {!(fuitCreditAdmin.blacklistedWallets || []).length && <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>No wallets blacklisted.</div>}
                {(fuitCreditAdmin.blacklistedWallets || []).map(item => (
                  <div key={item.wallet} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 4 }}>
                    <div style={{ color: "#fecaca", fontSize: 12, fontWeight: 1000, overflowWrap: "anywhere" }}>{item.wallet}</div>
                    {item.note && <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>{item.note}</div>}
                    <button type="button" onClick={() => unblacklistFuitWallet(item.wallet)} style={{ ...adminButtonStyle, width: "fit-content", padding: "7px 9px", fontSize: 11 }}>Unblacklist</button>
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 12, display: "grid", gap: 8 }}>
                <div style={controlLabelStyle}>RECENT FUIT LEDGER</div>
                {!(fuitCreditAdmin.ledger || []).length && <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 900 }}>No ledger entries yet.</div>}
                {(fuitCreditAdmin.ledger || []).slice(0, 25).map(item => (
                  <div key={item.id} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 3 }}>
                    <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 1000 }}>{item.type} - {item.username} - {formatFuitCreditAmount(item.amount)} FUIT</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800, overflowWrap: "anywhere" }}>{item.wallet || item.txHash || item.createdAt}</div>
                    {item.note && <div style={{ color: "#cbd5e1", fontSize: 11, fontWeight: 800 }}>{item.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>USER PHOTO / ACESS</h2>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <div style={{ border: "1px solid rgba(96,165,250,.35)", background: "rgba(2,6,23,.72)", padding: 12 }}>
                <div style={controlLabelStyle}>USERS WITH PHOTOS</div>
                <div style={{ color: "#bfdbfe", fontSize: 28, fontWeight: 1000 }}>{signupInformationRows.filter(user => user.profilePicture).length}</div>
              </div>
              <div style={{ border: "1px solid rgba(34,197,94,.42)", background: "rgba(20,83,45,.34)", padding: 12 }}>
                <div style={controlLabelStyle}>ALL PHOTO ACCESS</div>
                <div style={{ color: "#bbf7d0", fontSize: 28, fontWeight: 1000 }}>{signupInformationRows.filter(user => user.fullPhotoLibraryAccess).length}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
              {!signupInformationRows.length && (
                <div style={{ border: "1px dashed rgba(148,163,184,.28)", background: "rgba(2,6,23,.36)", padding: 12, color: "#94a3b8", fontSize: 13, fontWeight: 900, textAlign: "center" }}>
                  No user photos available yet.
                </div>
              )}
              {signupInformationRows.map(user => (
                <div key={`photoAccess_${user.id}`} style={{ border: "1px solid rgba(148,163,184,.22)", background: "rgba(2,6,23,.58)", padding: 10, display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    border: "1px solid rgba(191,219,254,.58)",
                    background: user.profilePicture ? `center / cover no-repeat url(${user.profilePicture})` : "rgba(30,41,59,.92)",
                    color: "#bfdbfe",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 1000,
                    overflow: "hidden",
                    textTransform: "uppercase"
                  }}>
                    {!user.profilePicture && String(user.username || "?").slice(0, 1)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 1000, textTransform: "uppercase", overflowWrap: "anywhere" }}>{user.username}</div>
                    <div style={{ color: user.fullPhotoLibraryAccess ? "#bbf7d0" : "#fecaca", fontSize: 11, fontWeight: 1000, textTransform: "uppercase" }}>
                      {user.fullPhotoLibraryAccess ? "Full access saved" : "No full access saved"} / {formatBytesAsGb(getDataUrlByteSize(user.profilePicture))} GB
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!user.profilePicture}
                    onClick={() => downloadUserPhotoLibrary(user)}
                    style={{ ...adminButtonStyle, padding: "7px 10px", fontSize: 11, opacity: user.profilePicture ? 1 : .5 }}
                  >
                    Choose
                  </button>
                </div>
              ))}
            </div>
          </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <button onClick={onClose} style={{ border: "1px solid rgba(148,163,184,.3)", borderRadius: 999, background: "rgba(15,23,42,.9)", color: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 900, padding: "9px 14px" }}>
        Back
      </button>
      <form onSubmit={unlockAdmin} style={{ marginTop: 28, maxWidth: 360, display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 1000, letterSpacing: .4 }}>ADMIN</h1>
        <input
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="Password"
          autoFocus
          style={{ border: "1px solid rgba(148,163,184,.3)", borderRadius: 10, background: "rgba(15,23,42,.9)", color: "#f8fafc", fontSize: 16, fontWeight: 800, padding: "12px 14px", outline: "none" }}
        />
        {error && <div style={{ color: "#fecaca", fontSize: 13, fontWeight: 900 }}>{error}</div>}
        <button type="submit" style={{ border: "1px solid #f8fafc", borderRadius: 10, background: "#f8fafc", color: "#020617", cursor: "pointer", fontSize: 14, fontWeight: 1000, padding: "12px 14px" }}>
          Enter
        </button>
      </form>
    </div>
  );
}

function ProjectDropdown({ projects, activeId, onSelect, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = projects.find(p => p.id === activeId) || projects[0];
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "var(--flive-project-button-gap, 8px)",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "var(--flive-project-button-radius, 10px)", padding: "var(--flive-project-button-padding, 7px 12px)",
          color: "#F7F5F2", cursor: "pointer", fontSize: "var(--flive-project-button-font-size, 13px)",
          fontFamily: "system-ui", transition: "background 0.15s",
          maxWidth: "var(--flive-project-button-max-width, 200px)",
        }}
      >
        <span style={{ width: "var(--flive-project-dot-size, 8px)", height: "var(--flive-project-dot-size, 8px)", borderRadius: "50%", background: active?.color || "#A8D5A2", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "var(--flive-project-label-max-width, 140px)" }}>
          {active?.name || "Select project"}
        </span>
        <span style={{ color: "#888", fontSize: "var(--flive-project-caret-font-size, 10px)", marginLeft: 2 }}>{open ? "^" : "v"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          background: "#2C2C2E", borderRadius: 12, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)", overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)"
        }}>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "11px 16px",
                background: p.id === activeId ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none", color: "#F7F5F2", cursor: "pointer",
                fontSize: 13, fontFamily: "system-ui", textAlign: "left",
                transition: "background 0.1s"
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              {p.id === activeId && <span style={{ color: "#A8D5A2", fontSize: 11 }}>OK</span>}
            </button>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => { onManage(); setOpen(false); }}
              style={{
                width: "100%", padding: "11px 16px",
                background: "transparent", border: "none",
                color: "#888", cursor: "pointer", fontSize: 12,
                fontFamily: "system-ui", textAlign: "left"
              }}
            >
              + Manage projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin, approvedUsers, bannedUsers = [], onSignupRequest }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [fullPhotoLibraryAccess, setFullPhotoLibraryAccess] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const profilePictureInputRef = useRef(null);

  const clearLoginFeedback = () => {
    if (error) setError("");
    if (success) setSuccess("");
  };
  const updateUsername = value => {
    setUsername(value);
    clearLoginFeedback();
  };
  const updateEmail = value => {
    setEmail(value);
    clearLoginFeedback();
  };
  const updateWalletAddress = value => {
    setWalletAddress(value);
    clearLoginFeedback();
  };
  const updatePassword = value => {
    setPassword(value);
    clearLoginFeedback();
  };
  const updateProfilePicture = async file => {
    clearLoginFeedback();
    if (!file) {
      setProfilePicture("");
      return;
    }
    try {
      setProfilePicture(await resizeProfilePicture(file));
      setFullPhotoLibraryAccess(true);
    } catch (err) {
      setProfilePicture("");
      setSuccess("");
      setError(err?.message || "Choose an image from photos.");
    }
  };
  const openProfilePicturePicker = () => {
    const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator?.userAgent || "");
    if (isPhone) {
      window.alert("Please choose full photo access, then select your profile picture.");
    }
    profilePictureInputRef.current?.click();
  };

  const submitLogin = event => {
    event.preventDefault();
    const cleanUsername = username.trim();
    const enteredLogin = cleanUsername.toLowerCase();
    if (bannedUsers.some(user => user.value === enteredLogin)) {
      setPassword("");
      setSuccess("");
      setError("User banned.");
      return;
    }
    if (cleanUsername.toUpperCase() === "MASTER" && password === "FartAss!1") {
      setError("");
      onLogin("MASTER");
      return;
    }
    const approvedUser = approvedUsers.find(user => {
      return (user.username || "").toLowerCase() === enteredLogin || (user.email || "").toLowerCase() === enteredLogin;
    });
    if (approvedUser && bannedUsers.some(user => user.value === (approvedUser.username || "").toLowerCase() || user.value === (approvedUser.email || "").toLowerCase())) {
      setPassword("");
      setSuccess("");
      setError("User banned.");
      return;
    }
    if (approvedUser && approvedUser.password === password) {
      setError("");
      onLogin(approvedUser.username);
      return;
    }
    if (cleanUsername.toUpperCase() === "MASTER" || approvedUser) {
      setPassword("");
      setSuccess("");
      setError("Password wrong.");
      return;
    }
    setPassword("");
    setSuccess("");
    setError("Login not approved yet.");
  };

  const submitSignup = event => {
    event.preventDefault();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    if (!cleanUsername || !cleanEmail || !password) {
      setSuccess("");
      setError("Fill in username, email, and password.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setSuccess("");
      setError("Enter a valid email.");
      return;
    }
    if (!profilePicture) {
      setSuccess("");
      setError("Choose a profile picture from photos.");
      return;
    }
    const cleanWalletAddress = extractFuitWalletAddress(walletAddress);
    if (!cleanWalletAddress) {
      setSuccess("");
      setError("Enter or scan a valid wallet address.");
      return;
    }
    const message = onSignupRequest({ username: cleanUsername, email: cleanEmail, walletAddress: cleanWalletAddress, password, profilePicture, fullPhotoLibraryAccess: true });
    setUsername("");
    setEmail("");
    setWalletAddress("");
    setPassword("");
    setProfilePicture("");
    setFullPhotoLibraryAccess(false);
    setError("");
    setSuccess(message || "Signup request sent. Wait for approval.");
    setMode("login");
  };

  const loginInputStyle = {
    border: "1px solid rgba(148,163,184,.38)",
    borderRadius: 8,
    background: "rgba(15,23,42,.92)",
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: 900,
    padding: "12px 13px",
    minWidth: 0
  };
  const loginPrimaryButtonStyle = {
    border: "1px solid #67e8f9",
    borderRadius: 8,
    background: "#67e8f9",
    color: "#020617",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 1000,
    padding: "12px 14px",
    textTransform: "uppercase"
  };
  const switchMode = nextMode => {
    setMode(nextMode);
    setError("");
    setSuccess("");
    if (nextMode !== "signup") {
      setProfilePicture("");
      setFullPhotoLibraryAccess(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #020617, #082f49 52%, #111827)",
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      display: "grid",
      placeItems: "center",
      padding: 22,
      boxSizing: "border-box"
    }}>
      <form onSubmit={mode === "signup" ? submitSignup : submitLogin} style={{
        width: "min(100%, 430px)",
        border: "2px solid rgba(96,165,250,.72)",
        background: "rgba(2,6,23,.9)",
        boxShadow: "0 24px 70px rgba(0,0,0,.48)",
        padding: 22,
        display: "grid",
        gap: 14
      }}>
        <h1 style={{ margin: 0, color: "#fef08a", fontSize: 28, fontWeight: 1000, lineHeight: 1.08, textTransform: "uppercase" }}>
          Welcome to FUITS Live TV + Internet Center
        </h1>
        <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>{mode === "signup" ? "Signup Request" : "Login"}</div>
        <input
          value={username}
          onChange={event => updateUsername(event.target.value)}
          placeholder="Username"
          autoComplete="username"
          style={loginInputStyle}
        />
        {mode === "signup" && (
          <input
            type="email"
            value={email}
            onChange={event => updateEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            style={loginInputStyle}
          />
        )}
        {mode === "signup" && (
          <div style={{ display: "grid", gap: 7 }}>
            <div style={{ color: "#bfdbfe", fontSize: 11, fontWeight: 1000, textTransform: "uppercase" }}>Wallet For FUIT Coin</div>
            <FuitWalletInputWithScanner
              value={walletAddress}
              onChange={updateWalletAddress}
              inputStyle={loginInputStyle}
              buttonStyle={{ ...loginPrimaryButtonStyle, padding: "10px 12px", width: "fit-content" }}
              placeholder="Manual wallet address"
            />
            <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>
              Scan QR or manually enter the wallet you will use for deposits and FUIT Coin.
            </div>
          </div>
        )}
        {mode === "signup" && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "1px solid rgba(191,219,254,.58)",
                background: profilePicture ? `center / cover no-repeat url(${profilePicture})` : "rgba(30,41,59,.92)",
                display: "grid",
                placeItems: "center",
                color: "#bfdbfe",
                fontSize: 11,
                fontWeight: 1000,
                overflow: "hidden"
              }}>
                {!profilePicture && "PIC"}
              </div>
              <button
                type="button"
                onClick={openProfilePicturePicker}
                style={{ ...loginInputStyle, padding: "11px 12px", cursor: "pointer", textTransform: "uppercase", textAlign: "center" }}
              >
                {profilePicture ? "Photo selected" : "Select here"}
              </button>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                onChange={event => updateProfilePicture(event.target.files?.[0])}
                style={{ display: "none" }}
              />
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 10 }}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={event => updatePassword(event.target.value)}
            placeholder="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={loginInputStyle}
          />
          <button
            type="button"
            onClick={() => setShowPassword(current => !current)}
            aria-label={showPassword ? "Hide password" : "Reveal password"}
            style={{
              border: "1px solid rgba(191,219,254,.58)",
              borderRadius: 8,
              background: "rgba(30,41,59,.92)",
              color: "#bfdbfe",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 1000,
              padding: "12px 10px",
              textTransform: "uppercase",
              whiteSpace: "nowrap"
            }}
          >
            {showPassword ? "Hide" : "Reveal"}
          </button>
          <button
            type="submit"
            disabled={mode === "signup" && !profilePicture}
            style={{
              ...loginPrimaryButtonStyle,
              opacity: mode === "signup" && !profilePicture ? .45 : 1,
              cursor: mode === "signup" && !profilePicture ? "not-allowed" : "pointer",
              background: mode === "signup" && !profilePicture ? "#64748b" : loginPrimaryButtonStyle.background,
              borderColor: mode === "signup" && !profilePicture ? "#64748b" : loginPrimaryButtonStyle.borderColor
            }}
          >
            {mode === "signup" ? "Send" : "Sign In"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" onClick={() => switchMode(mode === "signup" ? "login" : "signup")} style={{ border: "none", background: "transparent", color: "#bfdbfe", cursor: "pointer", fontSize: 13, fontWeight: 1000, padding: 0 }}>
            {mode === "signup" ? "Back To Login" : "Sign Up"}
          </button>
          {mode === "login" && <button type="button" onClick={() => alert("Forgot password recovery will be added later.")} style={{ border: "none", background: "transparent", color: "#bfdbfe", cursor: "pointer", fontSize: 13, fontWeight: 1000, padding: 0 }}>
            Forget Password
          </button>}
        </div>
        {error && <div style={{ color: "#fecaca", fontSize: 13, fontWeight: 900 }}>{error}</div>}
        {success && <div style={{ color: "#bbf7d0", fontSize: 13, fontWeight: 900 }}>{success}</div>}
      </form>
    </div>
  );
}

function MobileLandscapeGate({ onEnter }) {
  return (
    <div style={{
      minHeight: "100vh",
      minHeight: "100dvh",
      width: "100vw",
      background: "radial-gradient(circle at 50% 0%, #0f766e 0%, #020617 54%, #000 100%)",
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      display: "grid",
      placeItems: "center",
      padding: 20,
      boxSizing: "border-box",
      textAlign: "center",
      overflow: "hidden"
    }}>
      <div style={{
        width: "min(100%, 390px)",
        display: "grid",
        justifyItems: "center",
        gap: 16
      }}>
        <div aria-hidden="true" style={{
          width: 96,
          height: 58,
          border: "4px solid #67e8f9",
          borderRadius: 12,
          boxShadow: "0 0 28px rgba(103,232,249,.52)",
          transform: "rotate(90deg)",
          position: "relative"
        }}>
          <div style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: -14,
            height: 4,
            borderRadius: 999,
            background: "#fef08a"
          }} />
        </div>
        <div style={{
          color: "#fef08a",
          fontSize: 24,
          fontWeight: 1000,
          lineHeight: 1.05,
          textTransform: "uppercase"
        }}>
          Rotate For FUITS TV
        </div>
        <div style={{
          color: "#cbd5e1",
          fontSize: 13,
          fontWeight: 850,
          lineHeight: 1.4,
          maxWidth: 310
        }}>
          Turn your phone sideways, then press the button to open the landscape mobile view.
        </div>
        <button
          type="button"
          onClick={onEnter}
          style={{
            border: "1px solid #67e8f9",
            borderRadius: 10,
            background: "#67e8f9",
            color: "#020617",
            cursor: "pointer",
            padding: "13px 18px",
            fontSize: 13,
            fontWeight: 1000,
            textTransform: "uppercase",
            boxShadow: "0 12px 34px rgba(103,232,249,.34)"
          }}
        >
          Enter Landscape
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [loggedInUsername, setLoggedInUsername] = useState(() => {
    try { return localStorage.getItem("fuitsLoggedInUsername") || ""; } catch { return ""; }
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState(loadData);
  const [editingDay, setEditingDay] = useState(null);
  const [projectRates, setProjectRates] = useState(loadRates);
  const [monthlyTrackerMonths, setMonthlyTrackerMonths] = useState(loadMonthlyTrackerMonths);
  const [view, setView] = useState("week");
  const [form, setForm] = useState(defaultEntry());
  const [projects, setProjects] = useState(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState(() => loadProjects()[0]?.id || "default");
  const [themeId, setThemeId] = useState(loadThemeId);
  const [customBackground, setCustomBackground] = useState(loadCustomBackground);
  const [musicData, setMusicData] = useState(loadMusicData);
  const [musicSettings, setMusicSettings] = useState(loadMusicSettings);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicNeedsTap, setMusicNeedsTap] = useState(false);
  const [inAppBrowserOpen, setInAppBrowserOpen] = useState(false);
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState("https://www.google.com/search?igu=1");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [signupRequests, setSignupRequests] = useState(loadSignupRequests);
  const [approvedUsers, setApprovedUsers] = useState(loadApprovedUsers);
  const [bannedUsers, setBannedUsers] = useState(loadBannedUsers);
  const [mainFuitWealth, setMainFuitWealth] = useState({ loading: true, balance: 0, symbol: "FUIT" });
  const [showMobileLandscapeGate, setShowMobileLandscapeGate] = useState(() => isFuitsMobilePortraitGateProfile());
  const weekDates = getWeekDates(weekOffset);
  const loggedInApprovedUser = useMemo(() => approvedUsers.find(user =>
    (user.username || "").toLowerCase() === String(loggedInUsername || "").toLowerCase()
  ), [approvedUsers, loggedInUsername]);
  const loggedInWalletAddress = loggedInApprovedUser?.walletAddress || "";

  useEffect(() => { saveData(entries); }, [entries]);
  useEffect(() => { saveRates(projectRates); }, [projectRates]);
  useEffect(() => { saveMonthlyTrackerMonths(monthlyTrackerMonths); }, [monthlyTrackerMonths]);
  useEffect(() => { saveProjects(projects); }, [projects]);
  useEffect(() => { saveThemeId(themeId); }, [themeId]);
  useEffect(() => { saveCustomBackground(customBackground); }, [customBackground]);
  useEffect(() => { saveMusicSettings(musicSettings); }, [musicSettings]);
  useEffect(() => { saveSignupRequests(signupRequests); }, [signupRequests]);
  useEffect(() => { saveApprovedUsers(approvedUsers); }, [approvedUsers]);
  useEffect(() => { saveBannedUsers(bannedUsers); }, [bannedUsers]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isFuitsPhoneSafariProfile()) {
      setShowMobileLandscapeGate(false);
      return undefined;
    }

    const updateGate = () => setShowMobileLandscapeGate(isFuitsMobilePortraitGateProfile());
    const portraitQuery = typeof window.matchMedia === "function" ? window.matchMedia(FUITS_MOBILE_PORTRAIT_GATE_QUERY) : null;
    const landscapeQuery = typeof window.matchMedia === "function" ? window.matchMedia(FUITS_MOBILE_LANDSCAPE_QUERY) : null;

    updateGate();
    if (portraitQuery?.addEventListener) portraitQuery.addEventListener("change", updateGate);
    else if (portraitQuery?.addListener) portraitQuery.addListener(updateGate);
    if (landscapeQuery?.addEventListener) landscapeQuery.addEventListener("change", updateGate);
    else if (landscapeQuery?.addListener) landscapeQuery.addListener(updateGate);
    window.addEventListener("resize", updateGate);
    window.addEventListener("orientationchange", updateGate);

    return () => {
      if (portraitQuery?.removeEventListener) portraitQuery.removeEventListener("change", updateGate);
      else if (portraitQuery?.removeListener) portraitQuery.removeListener(updateGate);
      if (landscapeQuery?.removeEventListener) landscapeQuery.removeEventListener("change", updateGate);
      else if (landscapeQuery?.removeListener) landscapeQuery.removeListener(updateGate);
      window.removeEventListener("resize", updateGate);
      window.removeEventListener("orientationchange", updateGate);
    };
  }, []);
  useEffect(() => {
    if (!loggedInUsername) {
      setMainFuitWealth({ loading: false, balance: 0, symbol: "FUIT" });
      return undefined;
    }
    let cancelled = false;
    const baseUrl = FUIT_CREDITS_BASE_URL ? FUIT_CREDITS_BASE_URL.replace(/\/+$/, "") : "";
    const loadMainFuitWealth = async () => {
      if (!baseUrl) {
        if (!cancelled) setMainFuitWealth(current => ({ ...current, loading: false }));
        return;
      }
      try {
        const wallet = extractFuitWalletAddress(loggedInWalletAddress);
        const response = await fetch(`${baseUrl}/fuit-credits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "summary",
            username: loggedInUsername,
            wallet: wallet || undefined
          })
        });
        if (!response.ok) throw new Error("FUIT wealth unavailable");
        const result = await response.json();
        if (cancelled) return;
        setMainFuitWealth({
          loading: false,
          balance: Number(result.user?.balance) || 0,
          symbol: result.settings?.creditSymbol || "FUIT"
        });
      } catch {
        if (!cancelled) setMainFuitWealth(current => ({ ...current, loading: false }));
      }
    };
    setMainFuitWealth(current => ({ ...current, loading: true }));
    loadMainFuitWealth();
    const timer = setInterval(loadMainFuitWealth, 7 * 60 * 1000);
    window.addEventListener("focus", loadMainFuitWealth);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", loadMainFuitWealth);
    };
  }, [loggedInUsername, loggedInWalletAddress]);
  const activeMusicSrc = musicData || "";

  const hourlyRate = projectRates[activeProjectId] || 0;
  const setHourlyRate = (val) => setProjectRates(prev => ({ ...prev, [activeProjectId]: val }));

  const getKey = (date, projectId) => `${projectId}__${date.toISOString().split("T")[0]}`;
  const getEntry = (date, projectId) => entries[getKey(date, projectId)] || defaultEntry();
  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const accentColor = activeProject?.color || "#A8D5A2";
  const theme = THEMES[themeId] || THEMES.classic;
  const isDarkTheme = ["midnight", "cyber", "oled", "custom"].includes(theme.id);
  const pageBackground = theme.id === "custom" && customBackground
    ? `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.62)), url(${customBackground})`
    : theme.appBg;
  const appTextColor = isDarkTheme ? theme.headerText : theme.text;
  const dayCardBg = isDarkTheme ? "rgba(255,255,255,0.12)" : theme.cardBg;
  const dayCardText = isDarkTheme ? theme.headerText : theme.text;
  const readableTextShadow = isDarkTheme || theme.id === "custom"
    ? "0 1px 3px rgba(0,0,0,0.85), 0 0 10px rgba(0,0,0,0.35)"
    : "0 1px 0 rgba(255,255,255,0.65)";
  const vibrantLabelColor = isDarkTheme || theme.id === "custom" ? "#FFFFFF" : "#111827";
  const vibrantMutedColor = isDarkTheme || theme.id === "custom" ? "#E5E7EB" : "#374151";
  const darkHeaderThemes = ["classic", "midnight", "cyber", "oled", "custom", "construction"];
  const headerLabelColor = theme.headerText || "#FFFFFF";
  const headerMutedColor = darkHeaderThemes.includes(theme.id) ? "#E5E7EB" : vibrantMutedColor;
  const statValueColor = isDarkTheme || theme.id === "custom" ? "#FFFFFF" : "#111827";
  const vibrantLabelStyle = {
    fontSize: "var(--flive-center-stat-label-font-size, 11px)", color: vibrantLabelColor, letterSpacing: 1.1, textTransform: "uppercase",
    fontFamily: "system-ui", fontWeight: 900, textShadow: readableTextShadow
  };
  const vibrantSmallStyle = {
    fontSize: "var(--flive-center-stat-small-font-size, 11px)", color: vibrantMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow
  };
  const statValueStyle = {
    fontSize: "var(--flive-center-stat-value-font-size, 24px)", fontWeight: 900, color: statValueColor, marginTop: "var(--flive-center-stat-value-margin-top, 2px)", fontFamily: "Georgia, serif", textShadow: readableTextShadow
  };
  const loginUser = username => {
    const cleanUsername = username || "MASTER";
    setLoggedInUsername(cleanUsername);
    try { localStorage.setItem("fuitsLoggedInUsername", cleanUsername); } catch {}
  };
  const logoutUser = () => {
    setLoggedInUsername("");
    setView("week");
    try { localStorage.removeItem("fuitsLoggedInUsername"); } catch {}
  };
  const submitSignupRequest = request => {
    const cleanUsername = request.username.trim();
    const cleanEmail = request.email.trim();
    const usernameTaken = ["MASTER", ...approvedUsers.map(user => user.username.toUpperCase())].includes(cleanUsername.toUpperCase());
    const emailTaken = approvedUsers.some(user => (user.email || "").toLowerCase() === cleanEmail.toLowerCase());
    if (usernameTaken || emailTaken) return "That username or email is already approved.";
    const existingPending = signupRequests.some(item =>
      (item.status || "pending") === "pending" &&
      ((item.username || "").toUpperCase() === cleanUsername.toUpperCase() || (item.email || "").toLowerCase() === cleanEmail.toLowerCase())
    );
    if (existingPending) return "Signup request already waiting for approval.";
    setSignupRequests(current => [
      {
        id: `signup_${Date.now()}`,
        username: cleanUsername,
        email: cleanEmail,
        walletAddress: request.walletAddress || "",
        password: request.password,
        profilePicture: request.profilePicture || "",
        fullPhotoLibraryAccess: request.fullPhotoLibraryAccess === true,
        status: "pending",
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    return "Signup request sent. Wait for approval.";
  };
  const approveSignupRequest = requestId => {
    const request = signupRequests.find(item => item.id === requestId);
    if (!request) return;
    setApprovedUsers(current => {
      const alreadyApproved = current.some(user =>
        (user.username || "").toUpperCase() === request.username.toUpperCase() ||
        (user.email || "").toLowerCase() === request.email.toLowerCase()
      );
      if (alreadyApproved) return current;
      return [
        ...current,
        { id: request.id, username: request.username, email: request.email, walletAddress: request.walletAddress || "", password: request.password, profilePicture: request.profilePicture || "", fullPhotoLibraryAccess: request.fullPhotoLibraryAccess === true }
      ];
    });
    setSignupRequests(current => current.map(item => item.id === requestId ? { ...item, status: "approved" } : item));
  };
  const denySignupRequest = requestId => {
    setSignupRequests(current => current.map(item => item.id === requestId ? { ...item, status: "denied" } : item));
  };
  const getBanTargetsForValue = value => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return [];
    const matchedUser = [...approvedUsers, ...signupRequests].find(user =>
      (user.username || "").toLowerCase() === normalized ||
      (user.email || "").toLowerCase() === normalized
    );
    if (!matchedUser) return [{ value: normalized, label: value.trim() }];
    return [
      matchedUser.username ? { value: matchedUser.username.toLowerCase(), label: matchedUser.username } : null,
      matchedUser.email ? { value: matchedUser.email.toLowerCase(), label: matchedUser.email } : null
    ].filter(Boolean);
  };
  const promptBanUser = () => {
    const value = window.prompt("Username or email to ban");
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;
    const targets = getBanTargetsForValue(cleanValue);
    setBannedUsers(current => {
      const existing = new Set(current.map(user => user.value));
      const additions = targets
        .filter(target => !existing.has(target.value))
        .map(target => ({ ...target, bannedAt: new Date().toISOString() }));
      return additions.length ? [...additions, ...current] : current;
    });
    const loggedInUser = approvedUsers.find(user =>
      targets.some(target => target.value === (user.username || "").toLowerCase() || target.value === (user.email || "").toLowerCase())
    );
    if (loggedInUser && String(loggedInUsername || "").toLowerCase() === (loggedInUser.username || "").toLowerCase()) logoutUser();
  };
  const promptUnbanUser = () => {
    const value = window.prompt("Username or email to unban");
    const targets = getBanTargetsForValue(value);
    if (!targets.length) return;
    const targetValues = new Set(targets.map(target => target.value));
    setBannedUsers(current => current.filter(user => !targetValues.has(user.value)));
  };
  const showBanList = () => {
    if (!bannedUsers.length) {
      window.alert("No banned users.");
      return;
    }
    window.alert(`Banned users:\n\n${bannedUsers.map(user => user.label || user.value).join("\n")}`);
  };

  const miniStatValueStyle = {
    fontSize: "var(--flive-center-mini-stat-value-font-size, 18px)", fontWeight: 900, color: statValueColor, marginTop: "var(--flive-center-stat-value-margin-top, 2px)", fontFamily: "Georgia, serif", textShadow: readableTextShadow
  };
  const glassStyle = theme.id === "custom" ? { backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } : {};

  const totalWeekMins = weekDates.reduce((acc, d) => {
    const e = getEntry(d, activeProjectId);
    const w = calcTotalWorked(e);
    return acc + (w || 0);
  }, 0);

  const projectEntries = Object.entries(entries).filter(([key]) =>
    key.startsWith(`${activeProjectId}__`)
  );

  // The monthly tracker follows the month of the most recently saved entry
  // for this project. Date strings are handled directly so 5/1 does not get
  // shifted back to 4/30 by timezone parsing.
  const latestEntryMonthKey = projectEntries.length
    ? projectEntries
        .map(([key]) => key.split("__")[1])
        .sort()
        .slice(-1)[0]
        ?.slice(0, 7)
    : null;

  const currentMonthKey =
    monthlyTrackerMonths[activeProjectId] || latestEntryMonthKey || getMonthKey(new Date());

  const monthlyMins = projectEntries.reduce((sum, [key, entry]) => {
    const datePart = key.split("__")[1];
    return getMonthKeyFromDatePart(datePart) === currentMonthKey
      ? sum + (calcTotalWorked(entry) || 0)
      : sum;
  }, 0);

  const allTimeMins = projectEntries.reduce(
    (sum, [, entry]) => sum + (calcTotalWorked(entry) || 0),
    0
  );

  const overtimeMins = Math.max(0, totalWeekMins - (40 * 60));
  const overtimePay = calcExactPay(overtimeMins, hourlyRate * 1.5, false);

  const weekPay = calcExactPay(totalWeekMins, hourlyRate, true);
  const monthlyPay = calcExactPay(monthlyMins, hourlyRate, true);
  const allTimePay = calcExactPay(allTimeMins, hourlyRate, true);

  const openEdit = (date) => {
    // When you tap any date, show that date's month in the monthly tracker.
    // This lets older dates like 3/31/2026 switch Monthly back to March totals.
    setMonthlyTrackerMonths(prev => ({
      ...prev,
      [activeProjectId]: getMonthKey(date),
    }));
    setEditingDay(date);
    setForm({ ...defaultEntry(), ...getEntry(date, activeProjectId) });
  };
  const saveEntry = () => {
    const key = getKey(editingDay, activeProjectId);
    setEntries(prev => ({ ...prev, [key]: { ...form } }));
    setMonthlyTrackerMonths(prev => ({
      ...prev,
      [activeProjectId]: getMonthKey(editingDay),
    }));
    setEditingDay(null);
  };
  const clearEntry = () => {
    const key = getKey(editingDay, activeProjectId);
    setEntries(prev => { const next = { ...prev }; delete next[key]; return next; });
    setEditingDay(null);
  };
  const addProject = () => {
    if (!newProjectName.trim()) return;
    const id = `proj_${Date.now()}`;
    const newProj = { id, name: newProjectName.trim(), color: newProjectColor };
    setProjects(prev => [...prev, newProj]);
    setActiveProjectId(id);
    setNewProjectName("");
    setNewProjectColor(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]);
  };
  const deleteProject = (id) => {
    if (projects.length <= 1) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(projects.find(p => p.id !== id)?.id);
  };
  const saveProjectEdit = (id) => {
    if (!editProjectName.trim()) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: editProjectName.trim() } : p));
    setEditingProjectId(null);
  };

  const exportData = () => {
    const payload = { entries, projects, projectRates, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRef = useRef(null);
  const backgroundRef = useRef(null);
  const musicRef = useRef(null);
  const audioFileRef = useRef(null);
  const centerShellRef = useRef(null);
  const centerScrollDragRef = useRef({
    active: false,
    dragging: false,
    touchId: null,
    startX: 0,
    startY: 0,
    lastY: 0,
    blockClickUntil: 0
  });

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = Number(musicSettings.volume ?? 0.35);
  }, [musicSettings.volume, activeMusicSrc]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio || !activeMusicSrc) return;
    audio.pause();
    audio.currentTime = 0;
    setIsMusicPlaying(false);
    setMusicNeedsTap(false);
  }, [activeMusicSrc]);

  useEffect(() => {
    const shell = centerShellRef.current;
    if (!shell) return undefined;

    const drag = centerScrollDragRef.current;
    const isMobileLandscape = () => {
      const query = "(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px)";
      if (typeof window.matchMedia === "function") return window.matchMedia(query).matches;

      const touchPoints = typeof navigator === "undefined" ? 0 : Number(navigator.maxTouchPoints || 0);
      return touchPoints > 0 && window.innerWidth > window.innerHeight && window.innerWidth <= 1100 && window.innerHeight <= 560;
    };
    const canDragScroll = () => (
      view === "week" &&
      isMobileLandscape() &&
      shell.scrollHeight > shell.clientHeight + 1
    );
    const resetDrag = () => {
      drag.active = false;
      drag.dragging = false;
      drag.touchId = null;
    };
    const getTrackedTouch = (event) => {
      const touches = Array.from(event.touches || []);
      const changedTouches = Array.from(event.changedTouches || []);
      const touch = drag.touchId == null
        ? touches[0] || changedTouches[0]
        : touches.find(item => item.identifier === drag.touchId) ||
          changedTouches.find(item => item.identifier === drag.touchId);

      if (!touch) return null;
      return { x: touch.clientX, y: touch.clientY };
    };
    const handleTouchStart = (event) => {
      if (!canDragScroll()) return;

      const touch = event.touches?.[0];
      if (!touch) return;

      drag.active = true;
      drag.dragging = false;
      drag.touchId = touch.identifier;
      drag.startX = touch.clientX;
      drag.startY = touch.clientY;
      drag.lastY = touch.clientY;
    };
    const handleTouchMove = (event) => {
      if (!drag.active || !canDragScroll()) return;

      const point = getTrackedTouch(event);
      if (!point) return;

      const deltaX = point.x - drag.startX;
      const deltaY = point.y - drag.startY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (!drag.dragging) {
        if (absoluteX < 6 && absoluteY < 6) return;
        if (absoluteY <= absoluteX) return;
        drag.dragging = true;
      }

      shell.scrollTop -= point.y - drag.lastY;
      drag.lastY = point.y;

      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    const handleTouchEnd = () => {
      if (drag.dragging) drag.blockClickUntil = Date.now() + 450;
      resetDrag();
    };
    const handleClick = (event) => {
      if (Date.now() > drag.blockClickUntil) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const passiveCaptureOptions = { capture: true, passive: true };
    const activeCaptureOptions = { capture: true, passive: false };

    shell.addEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
    shell.addEventListener("touchmove", handleTouchMove, activeCaptureOptions);
    shell.addEventListener("touchend", handleTouchEnd, passiveCaptureOptions);
    shell.addEventListener("touchcancel", handleTouchEnd, passiveCaptureOptions);
    shell.addEventListener("click", handleClick, true);

    return () => {
      shell.removeEventListener("touchstart", handleTouchStart, passiveCaptureOptions);
      shell.removeEventListener("touchmove", handleTouchMove, activeCaptureOptions);
      shell.removeEventListener("touchend", handleTouchEnd, passiveCaptureOptions);
      shell.removeEventListener("touchcancel", handleTouchEnd, passiveCaptureOptions);
      shell.removeEventListener("click", handleClick, true);
    };
  }, [loggedInUsername, view]);

  const enterMobileLandscapeGate = useCallback(async () => {
    if (typeof window === "undefined") return;

    const page = document.documentElement;
    const fullscreenElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;

    try {
      if (!fullscreenElement) {
        const requestFullscreen =
          page.requestFullscreen ||
          page.webkitRequestFullscreen ||
          page.msRequestFullscreen;
        const fullscreenResult = requestFullscreen?.call(page);
        if (fullscreenResult?.then) await fullscreenResult;
      }
    } catch {}

    try {
      const lockResult = window.screen?.orientation?.lock?.("landscape");
      if (lockResult?.then) await lockResult;
    } catch {}

    const updateGate = () => setShowMobileLandscapeGate(isFuitsMobilePortraitGateProfile());
    updateGate();
    window.setTimeout(updateGate, 250);
    window.setTimeout(updateGate, 800);
  }, []);

  if (showMobileLandscapeGate) {
    return <MobileLandscapeGate onEnter={enterMobileLandscapeGate} />;
  }

  if (!loggedInUsername) {
    return <LoginPage onLogin={loginUser} approvedUsers={approvedUsers} bannedUsers={bannedUsers} onSignupRequest={submitSignupRequest} />;
  }

  const toggleMusic = async () => {
    const audio = musicRef.current;
    if (!audio || !activeMusicSrc) {
      alert("Choose a soundtrack file first.");
      return;
    }
    try {
      if (isMusicPlaying) {
        audio.pause();
        setIsMusicPlaying(false);
        setMusicNeedsTap(false);
      } else {
        await audio.play();
        setIsMusicPlaying(true);
        setMusicNeedsTap(false);
      }
    } catch {
      setIsMusicPlaying(false);
      setMusicNeedsTap(true);
      alert("Click Play Soundtrack to start the background song.");
    }
  };

  const handleMusicFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      alert("Please choose an audio file.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setMusicData(dataUrl);
      const saved = saveMusicData(dataUrl);
      setMusicSettings(prev => ({ ...prev, fileName: file.name }));
      setIsMusicPlaying(false);
      if (!saved) {
        alert("Song added for this session, but it may be too large to save permanently on this device. A shorter MP3 should save better.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeMusic = () => {
    musicRef.current?.pause();
    setIsMusicPlaying(false);
    setMusicData("");
    saveMusicData("");
    setMusicSettings(prev => ({ ...prev, fileName: "" }));
  };

  const handleCustomBackground = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomBackground(ev.target.result);
      setThemeId("custom");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (payload.entries) setEntries(payload.entries);
        if (payload.projects) setProjects(payload.projects);
        if (payload.projectRates) setProjectRates(payload.projectRates);
        alert("Data imported successfully!");
      } catch {
        alert("Invalid backup file. Please use a file exported from this app.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const today = new Date();
  const todayKey = (d) => d.toISOString().split("T")[0] === today.toISOString().split("T")[0];

  const totalWorked = calcTotalWorked(form);
  const totalPay = calcExactPay(totalWorked, hourlyRate);

  if (view === "cryptoNfts" || view === "creditHub") {
    return <FuitCoinPage onClose={() => setView("week")} loggedInUsername={loggedInUsername} approvedUsers={approvedUsers} />;
  }

  
  if (view === "admin") {
    return <AdminPage
      onClose={() => setView("week")}
      loggedInUsername={loggedInUsername}
      signupRequests={signupRequests}
      approvedUsers={approvedUsers}
      bannedUsers={bannedUsers}
      onApproveSignup={approveSignupRequest}
      onDenySignup={denySignupRequest}
      onBanUser={promptBanUser}
      onUnbanUser={promptUnbanUser}
      onShowBanList={showBanList}
    />;
  }

  if (view === "news") {
    return <EmptyUtilityPage title="NEWS" onClose={() => setView("week")} />;
  }

  const blankPages = {
    discounts: "DISCOUNTS",
    availableResidence: "AVAILABLE RESIDENCE",
    emergencyPlanning: "EMERGENCY PLANNING!",
    familyHub: "FAMILY HUB",
    programming: "PROGRAMMING",
    housingLandForSale: "HOUSING + LAND FOR SALE",
    radioCommunication: "RADIO + COMMUNICATION",
    jobsBoard: "JOBS BOARD",
    spiritualism: "SPIRITUALISM",
    science: "SCIENCE",
    userRequestsUploads: "USER REQUEST & UPLOADS",
    itemsServicesForSale: "ITEMS / SERVICES FOR SALE",
    foodCooking: "FOOD AND COOKING",
    dispatching: "DISPATCHING",
    systemUpgrades: "SYSTEM UPGRADES",
    cardCoinCollecting: "CARD + COIN COLLECTING",
    exitMatrix: "EXIT THE MATRIX"
  };

  if (blankPages[view]) {
    return <EmptyUtilityPage title={blankPages[view]} onClose={() => setView("week")} />;
  }

if (view === "gambling") {
    return (
      <div style={{ minHeight: "100vh", background: "#000", position: "relative" }}>
        <aside className="pokemon-desktop-sidebar" style={{
          position: "fixed",
          left: 18,
          top: 18,
          bottom: 18,
          width: 390,
          zIndex: 4,
          borderRadius: 24,
          border: "2px solid rgba(255,255,255,0.22)",
          background: "linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.98))",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          padding: 16,
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          boxSizing: "border-box"
        }}>
          <div style={{
            width: "100%",
            border: "none",
            borderRadius: 16,
            padding: "10px 12px",
            background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
            color: "white",
            fontWeight: 900,
            letterSpacing: 1,
            boxShadow: "0 8px 22px rgba(37,99,235,.35)",
            marginBottom: 12,
            textAlign: "center"
          }}>
            FUITS SPORTSBOOK + CASINO
          </div>

          <div style={{
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(51,65,85,.92), rgba(15,23,42,.96))",
            padding: 12,
            border: "2px solid rgba(248,250,252,.38)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
          }}>
            <div style={{
              width: "100%",
              aspectRatio: "4 / 3",
              minHeight: 245,
              borderRadius: 14,
              overflow: "hidden",
              background: "#020617",
              border: "4px solid #0f172a"
            }} />
          </div>
        </aside>

        <button
          onClick={() => setView("week")}
          style={{
            position: "fixed",
            top: 64,
            left: 430,
            zIndex: 20,
            background: "transparent",
            border: "none",
            color: "#38bdf8",
            cursor: "pointer",
            fontSize: 22,
            fontWeight: 1000,
            letterSpacing: .6,
            textTransform: "uppercase",
            textShadow: "0 2px 10px rgba(56,189,248,.45)",
            fontFamily: "system-ui"
          }}
        >
          HOME
        </button>

        <main style={{
          minHeight: "100vh",
          maxWidth: 480,
          margin: "0 auto",
          background: "#000"
        }} />

        <aside style={{
          position: "fixed",
          right: 18,
          top: 18,
          bottom: 18,
          width: 360,
          borderRadius: 24,
          background: "#000"
        }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      position: "relative"
    }}>
      <style>{`
        :root {
          --flive-scale: 1;
          --flive-panel-content-scale: 1;
          --flive-gaming-scale: var(--flive-scale);
          --flive-gaming-content-scale: var(--flive-panel-content-scale);
          --flive-menu-text-scale: var(--flive-scale);
          --flive-menu-width-scale: 1;
          --flive-menu-white-space: normal;
          --flive-menu-gap-scale: 1;
          --flive-menu-top-offset: 0px;
          --flive-menu-left-offset: 0px;
          --flive-wealth-extra-top-offset: 0px;
          --flive-ticker-top-scale: 1;
          --flive-center-width-scale: 1;
          --flive-center-content-scale: 1;
          --flive-tv-width-scale: 1;
          --flive-tv-content-scale: var(--flive-panel-content-scale);
          --flive-info-right-scale: 1;
          --flive-info-width-scale: 1;
          --flive-info-content-scale: var(--flive-panel-content-scale);
          --flive-online-top-scale: 1;
          --flive-weather-top-scale: 1;
          --flive-schedule-right-scale: var(--flive-info-right-scale);
          --flive-schedule-width-scale: 1;
          --flive-schedule-content-scale: var(--flive-info-content-scale);
          --flive-schedule-bottom-scale: 1;
          --flive-schedule-box-scale: 1;
        }
        @media (max-width: 1891px) {
          :root { --flive-scale: clamp(.34, min(calc(100vw / 1892px), calc(100vh / 907px)), 1); }
        }
        @media (max-width: 1350px) and (max-height: 760px) {
          :root {
            --flive-scale: .45;
            --flive-panel-content-scale: .70;
            --flive-gaming-scale: .56;
            --flive-gaming-content-scale: .60;
            --flive-menu-text-scale: .72;
            --flive-menu-gap-scale: 1.35;
            --flive-menu-top-offset: -16px;
            --flive-menu-left-offset: 85px;
            --flive-wealth-extra-top-offset: 20px;
            --flive-ticker-top-scale: 2.12;
            --flive-center-width-scale: 1.35;
            --flive-center-content-scale: .64;
            --flive-tv-width-scale: 1.75;
            --flive-tv-content-scale: .70;
            --flive-info-right-scale: 1.66;
            --flive-info-width-scale: 1.22;
            --flive-info-content-scale: .88;
            --flive-weather-top-scale: 1.75;
            --flive-schedule-right-scale: 1.64;
            --flive-schedule-width-scale: 1.24;
            --flive-schedule-content-scale: .72;
          }
        }
        @media (max-width: 1180px) and (max-height: 760px) {
          :root { --flive-scale: .40; --flive-panel-content-scale: .68; --flive-gaming-scale: .52; --flive-gaming-content-scale: .58; --flive-menu-text-scale: .68; --flive-menu-gap-scale: 1.34; --flive-menu-top-offset: -14px; --flive-menu-left-offset: 78px; --flive-wealth-extra-top-offset: 18px; --flive-ticker-top-scale: 2.12; --flive-center-width-scale: 1.34; --flive-center-content-scale: .62; --flive-tv-width-scale: 1.66; --flive-tv-content-scale: .68; --flive-info-right-scale: 1.60; --flive-info-width-scale: 1.20; --flive-info-content-scale: .86; --flive-weather-top-scale: 1.75; --flive-schedule-right-scale: 1.58; --flive-schedule-width-scale: 1.20; --flive-schedule-content-scale: .70; }
        }
        @media (max-width: 980px) and (max-height: 760px) {
          :root { --flive-scale: .36; --flive-panel-content-scale: .66; --flive-gaming-scale: .48; --flive-gaming-content-scale: .56; --flive-menu-text-scale: .64; --flive-menu-gap-scale: 1.32; --flive-menu-top-offset: -12px; --flive-menu-left-offset: 70px; --flive-wealth-extra-top-offset: 17px; --flive-ticker-top-scale: 2.12; --flive-center-width-scale: 1.32; --flive-center-content-scale: .60; --flive-tv-width-scale: 1.56; --flive-tv-content-scale: .66; --flive-info-right-scale: 1.54; --flive-info-width-scale: 1.18; --flive-info-content-scale: .84; --flive-weather-top-scale: 1.75; --flive-schedule-right-scale: 1.52; --flive-schedule-width-scale: 1.16; --flive-schedule-content-scale: .68; }
        }
        @media (max-width: 820px) and (max-height: 760px) {
          :root { --flive-scale: .30; --flive-panel-content-scale: .64; --flive-gaming-scale: .44; --flive-gaming-content-scale: .54; --flive-menu-text-scale: .58; --flive-menu-gap-scale: 1.30; --flive-menu-top-offset: -10px; --flive-menu-left-offset: 62px; --flive-wealth-extra-top-offset: 16px; --flive-ticker-top-scale: 2.12; --flive-center-width-scale: 1.30; --flive-center-content-scale: .58; --flive-tv-width-scale: 1.46; --flive-tv-content-scale: .64; --flive-info-right-scale: 1.46; --flive-info-width-scale: 1.16; --flive-info-content-scale: .82; --flive-weather-top-scale: 1.75; --flive-schedule-right-scale: 1.44; --flive-schedule-width-scale: 1.12; --flive-schedule-content-scale: .66; }
        }
        @media (hover: hover) and (pointer: fine) and (max-width: 1400px) and (max-height: 790px),
          (hover: hover) and (pointer: fine) and (min-device-width: 900px) and (max-device-height: 820px) {
          :root {
            --flive-gaming-scale: .66;
            --flive-gaming-stack-height-scale: 1;
            --flive-gaming-content-scale: .74;
            --flive-gaming-stage-padding: 8px;
            --flive-gaming-emulator-min-height: 170px;
            --flive-gaming-emulator-message-padding: 12px;
            --flive-gaming-emulator-message-font-size: 14px;
            --flive-gaming-start-margin-top: 6px;
            --flive-gaming-start-padding: 7px 12px;
            --flive-gaming-start-font-size: 12px;
            --flive-gaming-carousel-panel-padding: 6px;
            --flive-gaming-carousel-arrow-size: 30px;
            --flive-gaming-carousel-arrow-font-size: 18px;
            --flive-gaming-carousel-card-width: 82px;
            --flive-gaming-carousel-card-padding: 5px;
            --flive-gaming-carousel-cover-width: 58px;
            --flive-gaming-carousel-cover-height: 76px;
            --flive-gaming-carousel-title-margin: 5px;
            --flive-gaming-carousel-title-font-size: 9px;
            --flive-gaming-carousel-title-height: 28px;
            --flive-gaming-carousel-meta-margin: 3px;
            --flive-gaming-carousel-meta-font-size: 9px;
            --flive-gaming-detail-cover-width: 74px;
            --flive-gaming-detail-cover-height: 100px;
            --flive-gaming-detail-gap: 8px;
            --flive-gaming-detail-padding: 6px;
            --flive-gaming-detail-title-font-size: 11px;
            --flive-gaming-detail-meta-font-size: 10px;
            --flive-gaming-detail-button-gap: 6px;
            --flive-gaming-detail-button-margin: 7px;
            --flive-gaming-detail-button-padding: 5px 8px;
            --flive-gaming-detail-button-font-size: 11px;
            --flive-tv-content-scale: .56;
            --flive-tv-button-padding: 4px 6px;
            --flive-tv-button-radius: 8px;
            --flive-tv-button-font-size: 8px;
            --flive-tv-button-line-height: 1.05;
            --flive-tv-button-letter-spacing: .12px;
            --flive-tv-scroll-gap: 5px;
            --flive-tv-scroll-padding: 4px 1px 4px;
            --flive-tv-heading-font-size: 9px;
            --flive-tv-heading-line-height: 1.14;
            --flive-tv-channel-controls-gap: 4px;
            --flive-tv-channel-select-height: 36px;
            --flive-tv-channel-select-display-padding: 1px 34px 1px 9px;
            --flive-tv-channel-select-font-size: 8px;
            --flive-tv-channel-select-line-height: 1.04;
            --flive-tv-owner-controls-gap: 4px;
            --flive-tv-owner-controls-margin-top: 4px;
            --flive-tv-owner-button-min-height: 22px;
            --flive-tv-owner-button-padding: 5px 4px;
            --flive-tv-owner-button-font-size: 8px;
            --flive-tv-owner-button-line-height: 1.04;
            --flive-tv-video-shell-height: 118px;
            --flive-tv-video-title-min-height: 24px;
            --flive-tv-video-title-max-height: 30px;
            --flive-tv-video-title-padding: 3px 5px;
            --flive-tv-video-title-font-size: 8px;
            --flive-tv-video-title-line-height: 1.08;
            --flive-tv-video-title-overflow: hidden;
            --flive-tv-chat-flex: 0 0 650px;
            --flive-tv-chat-height: 650px;
            --flive-tv-chat-min-height: 650px;
            --flive-tv-chat-max-height: 650px;
            --flive-ticker-top-scale: 1.54;
            --flive-weather-top-scale: 1.64;
            --flive-center-header-padding: 12px 14px 8px;
            --flive-center-header-row-margin-bottom: 4px;
            --flive-project-button-gap: 5px;
            --flive-project-button-padding: 4px 8px;
            --flive-project-button-radius: 8px;
            --flive-project-button-font-size: 10px;
            --flive-project-button-max-width: 142px;
            --flive-project-dot-size: 6px;
            --flive-project-label-max-width: 100px;
            --flive-project-caret-font-size: 8px;
            --flive-center-settings-font-size: 13px;
            --flive-center-soundtrack-margin: -2px 0 5px;
            --flive-center-soundtrack-gap: 4px;
            --flive-center-soundtrack-padding: 4px 9px;
            --flive-center-soundtrack-font-size: 10px;
            --flive-center-logo-margin: -2px 0 5px;
            --flive-center-logo-max-width: 170px;
            --flive-center-logo-max-height: 58px;
            --flive-center-week-margin-bottom: 5px;
            --flive-center-week-arrow-font-size: 14px;
            --flive-center-week-arrow-padding: 1px 5px;
            --flive-center-week-title-font-size: 10px;
            --flive-center-week-date-font-size: 9px;
            --flive-center-stats-margin-top: 5px;
            --flive-center-stats-padding: 8px 9px;
            --flive-center-stats-gap: 6px;
            --flive-center-stat-label-font-size: 8px;
            --flive-center-stat-small-font-size: 8px;
            --flive-center-stat-value-font-size: 15px;
            --flive-center-mini-stat-value-font-size: 12px;
            --flive-center-stat-value-margin-top: 0px;
            --flive-center-stats-detail-margin-top: 5px;
            --flive-center-stats-detail-padding-top: 5px;
            --flive-schedule-width-scale: 1.82;
            --flive-schedule-content-scale: .78;
            --flive-schedule-bottom-scale: .70;
            --flive-schedule-box-scale: .72;
          }
        }
        @media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px) {
          :root {
            --flive-scale: clamp(.32, min(.37, calc(100vw / 2350px), calc(100vh / 1080px)), .37);
            --flive-scale: clamp(.32, min(.37, calc(100vw / 2350px), calc(100dvh / 1080px)), .37);
            --flive-panel-content-scale: .64;
            --flive-gaming-scale: .38;
            --flive-gaming-content-scale: .44;
            --flive-gaming-stage-padding: 7px;
            --flive-gaming-emulator-min-height: 180px;
            --flive-gaming-emulator-message-padding: 12px;
            --flive-gaming-emulator-message-font-size: 11px;
            --flive-gaming-start-margin-top: 8px;
            --flive-gaming-start-padding: 6px 9px;
            --flive-gaming-start-font-size: 10px;
            --flive-menu-text-scale: .49;
            --flive-menu-width-scale: 1.00;
            --flive-menu-white-space: nowrap;
            --flive-menu-gap-scale: 1.16;
            --flive-menu-top-offset: -12px;
            --flive-menu-left-offset: 42px;
            --flive-wealth-extra-top-offset: 10px;
            --flive-ticker-top-scale: 1.44;
            --flive-center-width-scale: 1.06;
            --flive-center-content-scale: .54;
            --flive-center-header-padding: 8px 12px 22px;
            --flive-center-header-row-margin-bottom: 6px;
            --flive-project-button-gap: 5px;
            --flive-project-button-padding: 4px 7px;
            --flive-project-button-radius: 8px;
            --flive-project-button-font-size: 10px;
            --flive-project-button-max-width: 138px;
            --flive-project-dot-size: 6px;
            --flive-project-label-max-width: 96px;
            --flive-project-caret-font-size: 8px;
            --flive-center-settings-font-size: 13px;
            --flive-center-soundtrack-margin: -1px 0 8px;
            --flive-center-soundtrack-gap: 4px;
            --flive-center-soundtrack-padding: 4px 9px;
            --flive-center-soundtrack-font-size: 10px;
            --flive-center-logo-margin: -1px 0 10px;
            --flive-center-logo-max-width: 190px;
            --flive-center-logo-max-height: 78px;
            --flive-center-week-margin-bottom: 8px;
            --flive-center-week-arrow-font-size: 14px;
            --flive-center-week-arrow-padding: 1px 5px;
            --flive-center-week-title-font-size: 10px;
            --flive-center-week-date-font-size: 9px;
            --flive-center-stats-margin-top: 8px;
            --flive-center-stats-padding: 12px 12px;
            --flive-center-stats-gap: 7px;
            --flive-center-stat-label-font-size: 9px;
            --flive-center-stat-small-font-size: 9px;
            --flive-center-stat-value-font-size: 17px;
            --flive-center-mini-stat-value-font-size: 14px;
            --flive-center-stat-value-margin-top: 0px;
            --flive-center-stats-detail-margin-top: 8px;
            --flive-center-stats-detail-padding-top: 8px;
            --flive-tv-width-scale: 1.18;
            --flive-tv-content-scale: .60;
            --flive-info-right-scale: 1.35;
            --flive-info-width-scale: 1.78;
            --flive-info-content-scale: .46;
            --flive-online-top-scale: 1.35;
            --flive-weather-top-scale: 1.40;
            --flive-schedule-right-scale: 1.29;
            --flive-schedule-width-scale: 2.16;
            --flive-schedule-content-scale: .44;
            --flive-schedule-bottom-scale: .75;
            --flive-schedule-box-scale: .58;
          }
          .fuits-online-indicator,
          .fuits-weather-panel {
            transform: scale(.76);
            transform-origin: right top;
          }
          html,
          body,
          #root {
            width: 100vw;
            min-height: 100vh;
            min-height: 100dvh;
            overflow: hidden;
            background: #000;
          }
          .flive-center-shell {
            min-height: 100vh !important;
            min-height: 100dvh !important;
            max-height: 100vh;
            max-height: 100dvh;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            touch-action: pan-y;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }
          .music-library-desktop-sidebar {
            z-index: 7 !important;
          }
          .pokemon-desktop-stack {
            touch-action: pan-y;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }
        }
        @media (min-width: 2100px) {
          :root { --flive-scale: min(calc(100vw / 1892px), calc(100vh / 907px), 2.15); }
        }
        @media (max-width: 360px) { .flive-main-coins-ticker { display: none !important; } }
        @media (max-width: 1350px) and (max-height: 760px) {
          .flive-center-shell {
            min-height: 100vh;
            overflow-y: visible;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .flive-center-shell::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
          }
          .flive-center-shell > :not(style):not(audio) {
            zoom: var(--flive-center-content-scale, 1);
          }
        }
        @keyframes flive-main-coins-ticker-scroll {
          0% { transform: translateX(calc(100vw - (700px * var(--flive-scale, 1)))); }
          100% { transform: translateX(0); }
        }
      `}</style>
      {view === "week" && <PokemonSidebar loggedInUsername={loggedInUsername} />}
      {view === "week" && (
        <div className="flive-main-coins-ticker" style={{
          position: "fixed",
          left: "calc(50% - (240px * var(--flive-scale, 1)))",
          right: "calc(390px * var(--flive-scale, 1))",
          top: "calc(246px * var(--flive-scale, 1) * var(--flive-ticker-top-scale, 1))",
          zIndex: 3,
          height: "calc(34px * var(--flive-scale, 1))",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none"
        }}>
          <div style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            color: "#ffffff",
            fontFamily: "'Arial Black', Impact, 'Trebuchet MS', system-ui, sans-serif",
            fontSize: "calc(18px * var(--flive-scale, 1))",
            fontWeight: 1000,
            letterSpacing: 1,
            textTransform: "uppercase",
            textShadow: "0 0 6px rgba(255,255,255,.82), 0 0 14px rgba(56,189,248,.75), 0 2px 0 rgba(2,6,23,.95)",
            WebkitTextStroke: ".5px rgba(56,189,248,.45)",
            animation: "flive-main-coins-ticker-scroll 20s linear infinite"
          }}>
            FLIVE CASINO / SPORTSBOOK COINS VALUE = 0
          </div>
        </div>
      )}
      {view === "week" && (
        <>
          {[
            { label: "ADMIN", nextView: "admin", top: 12 },
            { label: "GAMBLING", nextView: "gambling", top: 52.6 },
            { label: "CRYPTO + NFTS", nextView: "cryptoNfts", top: 93.2 },
            { label: "NEWS", nextView: "news", top: 133.8 },
            { label: "DISCOUNTS", nextView: "discounts", top: 174.4 },
            { label: "AVAILABLE RESIDENCE", nextView: "availableResidence", top: 215 },
            { label: "EMERGENCY PLANNING!", nextView: "emergencyPlanning", top: 255.6 },
            { label: "FAMILY HUB", nextView: "familyHub", top: 296.2 },
            { label: "PROGRAMMING", nextView: "programming", top: 336.8 },
            { label: "HOUSING + LAND FOR SALE", nextView: "housingLandForSale", top: 377.4 },
            { label: "RADIO + COMMUNICATION", nextView: "radioCommunication", top: 418 },
            { label: "JOBS BOARD", nextView: "jobsBoard", top: 458.6 },
            { label: "SPIRITUALISM", nextView: "spiritualism", top: 499.2 },
            { label: "SCIENCE", nextView: "science", top: 539.8 },
            { label: "USER REQUEST & UPLOADS", nextView: "userRequestsUploads", top: 580.4 },
            { label: "ITEMS / SERVICES FOR SALE", nextView: "itemsServicesForSale", top: 621 },
            { label: "FOOD AND COOKING", nextView: "foodCooking", top: 661.6 },
            { label: "DISPATCHING", nextView: "dispatching", top: 702.2 },
            { label: "SYSTEM UPGRADES", nextView: "systemUpgrades", top: 742.8 },
            { label: "CARD + COIN COLLECTING", nextView: "cardCoinCollecting", top: 783.4 },
            { label: "EXIT THE MATRIX", nextView: "exitMatrix", top: 824 }
          ].map(link => (
            <div key={link.nextView || link.label}>
              <button
                onClick={() => {
                  if (link.nextView) {
                    resetFuitsMobileSafariViewportZoomForNavigation();
                    setView(link.nextView);
                  } else if (link.href) {
                    resetFuitsMobileSafariViewportZoom();
                    window.open(link.href, "_blank", "noopener,noreferrer");
                  }
                }}
                style={{
                  position: "fixed",
                  top: `calc((${link.top}px * var(--flive-scale, 1) * var(--flive-menu-gap-scale, 1)) + (var(--flive-menu-top-offset, 0px) * var(--flive-scale, 1)))`,
                  left: "calc((430px + var(--flive-menu-left-offset, 0px)) * var(--flive-scale, 1))",
                  zIndex: 20,
                  width: "calc(430px * var(--flive-scale, 1) * var(--flive-menu-width-scale, 1))",
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontSize: `calc(${link.label.length > 18 ? 17 : 22}px * var(--flive-menu-text-scale, var(--flive-scale, 1)))`,
                  fontWeight: 1000,
                  lineHeight: 1.05,
                  letterSpacing: .6,
                  textTransform: "uppercase",
                  textShadow: "0 2px 10px rgba(56,189,248,.45)",
                  fontFamily: "system-ui",
                  textAlign: "left",
                  whiteSpace: "var(--flive-menu-white-space, normal)"
                }}
              >
                {link.label}
              </button>
            </div>
          ))}
          <div style={{
            position: "fixed",
            top: "calc((846px * var(--flive-scale, 1) * var(--flive-menu-gap-scale, 1)) + (var(--flive-menu-top-offset, 0px) * var(--flive-scale, 1)) + (var(--flive-wealth-extra-top-offset, 0px) * var(--flive-scale, 1)))",
            left: "calc((470px + var(--flive-menu-left-offset, 0px)) * var(--flive-scale, 1))",
            zIndex: 20,
            width: "calc(430px * var(--flive-scale, 1) * var(--flive-menu-width-scale, 1))",
            color: "#22c55e",
            textShadow: "0 2px 10px rgba(34,197,94,.45)",
            fontFamily: "system-ui",
            textTransform: "uppercase"
          }}>
            <div style={{ fontSize: "calc(22px * var(--flive-menu-text-scale, var(--flive-scale, 1)))", fontWeight: 1000, letterSpacing: .6, lineHeight: 1.05 }}>
              FUITS WEALTH
            </div>
            <div style={{ fontSize: "calc(22px * var(--flive-menu-text-scale, var(--flive-scale, 1)))", fontWeight: 1000, letterSpacing: .6, lineHeight: 1.05, marginTop: "calc(4px * var(--flive-scale, 1))" }}>
              {mainFuitWealth.loading ? "LOADING FUIT COINS" : `${formatFuitCreditAmount(mainFuitWealth.balance)} ${mainFuitWealth.symbol} COINS`}
            </div>
          </div>
        </>
      )}
      {view === "week" && <MusicLibrarySidebar accentColor={accentColor} loggedInUsername={loggedInUsername} approvedUsers={approvedUsers} onLogout={logoutUser} />}
      <div ref={centerShellRef} className="flive-center-shell" style={{ minHeight: "100vh", background: pageBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", fontFamily: theme.font, width: "calc(480px * var(--flive-scale, 1) * var(--flive-center-width-scale, 1))", maxWidth: "100vw", margin: "0 auto", color: appTextColor, transition: "background 0.25s ease, color 0.25s ease", position: "relative", zIndex: 5, overflowX: "hidden" }}>
      {activeMusicSrc && <audio ref={musicRef} src={activeMusicSrc} loop playsInline onPlay={() => setIsMusicPlaying(true)} onPause={() => setIsMusicPlaying(false)} onEnded={() => setIsMusicPlaying(false)} />}
      {inAppBrowserOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.78)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14
          }}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              height: "min(760px, 92vh)",
              background: "#0f172a",
              borderRadius: 18,
              border: "2px solid rgba(255,255,255,.18)",
              overflow: "hidden",
              boxShadow: "0 24px 90px rgba(0,0,0,.75)",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: 10,
              background: "linear-gradient(135deg, #111827, #020617)",
              borderBottom: "1px solid rgba(255,255,255,.12)"
            }}>
              <button
                onClick={() => setInAppBrowserOpen(false)}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 12px",
                  background: "rgba(239,68,68,.18)",
                  color: "#fecaca",
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                X Close
              </button>
              <input
                value={inAppBrowserUrl}
                onChange={e => setInAppBrowserUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    let next = e.currentTarget.value.trim();
                    if (next && !next.startsWith("http://") && !next.startsWith("https://")) {
                      next = `https://${next}`;
                    }
                    setInAppBrowserUrl(next || "https://www.google.com/search?igu=1");
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,.28)",
                  background: "#020617",
                  color: "#f8fafc",
                  padding: "10px 12px",
                  outline: "none",
                  fontSize: 13,
                  fontWeight: 800
                }}
              />
              <button
                onClick={() => {
                  let next = inAppBrowserUrl.trim();
                  if (next && !next.startsWith("http://") && !next.startsWith("https://")) next = `https://${next}`;
                  setInAppBrowserUrl(next || "https://www.google.com/search?igu=1");
                }}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "#38bdf8",
                  color: "#06111f",
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                Go
              </button>
              <button
                onClick={() => window.open(inAppBrowserUrl, "_blank", "noopener,noreferrer")}
                style={{
                  border: "1px solid rgba(255,255,255,.2)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,.08)",
                  color: "#f8fafc",
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                New Tab
              </button>
            </div>
            <iframe
              title="In-App Browser"
              src={inAppBrowserUrl}
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                background: "#fff"
              }}
            />
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ background: theme.headerBg, color: theme.headerText, padding: "var(--flive-center-header-padding, 52px 24px 16px)", position: "sticky", top: 0, zIndex: 10, ...glassStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--flive-center-header-row-margin-bottom, 16px)" }}>
          <ProjectDropdown
            projects={projects}
            activeId={activeProjectId}
            onSelect={setActiveProjectId}
            onManage={() => setView("projects")}
          />
          <button
            onClick={() => setView(view === "settings" ? "week" : "settings")}
            style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: "var(--flive-center-settings-font-size, 22px)", fontWeight: 900, textShadow: readableTextShadow }}
          >
            {view === "settings" ? "X" : "Settings"}
          </button>
        </div>
        {view === "week" && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "var(--flive-center-soundtrack-margin, -4px 0 10px)" }}>
              <button
                onClick={toggleMusic}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--flive-center-soundtrack-gap, 8px)",
                  padding: "var(--flive-center-soundtrack-padding, 9px 16px)",
                  borderRadius: 999,
                  border: `2px solid ${accentColor}`,
                  background: isMusicPlaying ? accentColor : "rgba(0,0,0,0.35)",
                  color: isMusicPlaying ? "#111827" : headerLabelColor,
                  boxShadow: isMusicPlaying ? `0 0 18px ${accentColor}77` : theme.shadow,
                  cursor: "pointer",
                  fontSize: "var(--flive-center-soundtrack-font-size, 13px)",
                  fontFamily: "system-ui",
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  textShadow: isMusicPlaying ? "none" : readableTextShadow
                }}
              >
                {isMusicPlaying ? "Pause Soundtrack" : "Play Soundtrack"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "var(--flive-center-logo-margin, -6px 0 14px)" }}>
              <img
                src={`${process.env.PUBLIC_URL}/fury-dispatch-logo.png`}
                alt="Fuit Music"
                style={{
                  width: "100%",
                  maxWidth: "var(--flive-center-logo-max-width, 370px)",
                  maxHeight: "var(--flive-center-logo-max-height, 150px)",
                  objectFit: "contain",
                  display: "block",
                  filter: isDarkTheme || theme.id === "custom" ? "drop-shadow(0 10px 22px rgba(0,0,0,0.75))" : "drop-shadow(0 8px 18px rgba(0,0,0,0.28))"
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--flive-center-week-margin-bottom, 12px)" }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: "var(--flive-center-week-arrow-font-size, 22px)", fontWeight: 900, padding: "var(--flive-center-week-arrow-padding, 4px 8px)" }}>{"<"}</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--flive-center-week-title-font-size, 13px)", color: headerLabelColor, fontFamily: "system-ui", fontWeight: 900, textShadow: readableTextShadow }}>
                  {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)}w ${weekOffset < 0 ? "ago" : "ahead"}`}
                </div>
                <div style={{ fontSize: "var(--flive-center-week-date-font-size, 12px)", color: headerMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow }}>
                  {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
                </div>
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: "var(--flive-center-week-arrow-font-size, 22px)", fontWeight: 900, padding: "var(--flive-center-week-arrow-padding, 4px 8px)" }}>{">"}</button>
            </div>
            <div style={{ marginTop: "var(--flive-center-stats-margin-top, 14px)", background: theme.statsBg, borderRadius: 12, padding: "var(--flive-center-stats-padding, 14px 16px)", boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--flive-center-stats-gap, 12px)" }}>
                <div>
                  <div style={vibrantLabelStyle}>Total Hours</div>
                  <div style={statValueStyle}>{minutesToHHMM(totalWeekMins)}</div>
                </div>

                <div>
                  <div style={vibrantLabelStyle}>Monthly</div>
                  <div style={statValueStyle}>
                    {minutesToHHMM(monthlyMins)}
                  </div>
                  {monthlyPay && (
                    <div style={{ ...vibrantSmallStyle, marginTop: 2 }}>
                      <AnimatedMoney value={monthlyPay} />
                    </div>
                  )}
                </div>

                {weekPay && (
                  <div style={{ textAlign: "right" }}>
                    <div style={vibrantLabelStyle}>Earnings</div>
                    <div style={{ ...statValueStyle, color: accentColor }}><AnimatedMoney value={weekPay} /></div>
                    {overtimeMins > 0 && (
                      <div style={{ ...vibrantSmallStyle, marginTop: 2 }}>
                        OT: {minutesToHHMM(overtimeMins)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{
                marginTop: "var(--flive-center-stats-detail-margin-top, 14px)",
                paddingTop: "var(--flive-center-stats-detail-padding-top, 12px)",
                borderTop: `2px solid ${theme.line}`,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--flive-center-stats-gap, 12px)",
                alignItems: "center"
              }}>
                <div>
                  <div style={vibrantLabelStyle}>
                    All Time Total
                  </div>
                  <div style={miniStatValueStyle}>
                    {minutesToHHMM(allTimeMins)}
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={vibrantLabelStyle}>
                    Weekly OT Earned
                  </div>
                  <div style={{ ...miniStatValueStyle, color: overtimeMins > 0 ? accentColor : vibrantMutedColor }}>
                    <AnimatedMoney value={overtimePay || "0.00"} />
                  </div>
                </div>

                {allTimePay && (
                  <div style={{ textAlign: "right" }}>
                    <div style={vibrantLabelStyle}>
                      Lifetime Earned
                    </div>
                    <div style={{ ...miniStatValueStyle, color: accentColor }}>
                      <AnimatedMoney value={allTimePay} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings View */}
      {view === "settings" && (
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 22, marginBottom: 24, color: appTextColor }}>Settings</div>
          <div style={{ background: theme.cardBg, borderRadius: 14, padding: 20, boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
              <label style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>
                {activeProject?.name} - Hourly Rate
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 10 }}>
              <span style={{ fontSize: 20, color: "#888" }}>$</span>
              <input
                type="number"
                value={hourlyRate || ""}
                onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                style={{ fontSize: 24, border: "none", outline: "none", width: "100%", fontFamily: "Georgia, serif", color: "#1C1C1E" }}
              />
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 8, fontFamily: "system-ui" }}>Each project has its own rate. Switch projects to set others.</div>
          </div>

          <div style={{ marginTop: 16, background: theme.cardBg, borderRadius: 14, padding: 20, boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
            <div style={{ fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 14 }}>Themes</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {Object.values(THEMES).map(t => (
                <button key={t.id} onClick={() => setThemeId(t.id)}
                  style={{
                    padding: "12px 10px", borderRadius: 12,
                    border: themeId === t.id ? `2px solid ${accentColor}` : `1px solid ${theme.line}`,
                    background: t.id === "custom" && customBackground ? `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)), url(${customBackground})` : t.appBg,
                    backgroundSize: "cover", backgroundPosition: "center",
                    color: ["ice", "classic", "construction"].includes(t.id) ? "#1C1C1E" : "#F7F5F2",
                    cursor: "pointer", fontFamily: "system-ui", textAlign: "left", boxShadow: themeId === t.id ? `0 0 0 2px ${accentColor}33` : "none"
                  }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{t.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                </button>
              ))}
            </div>
            <input ref={backgroundRef} type="file" accept="image/*" onChange={handleCustomBackground} style={{ display: "none" }} />
            <button onClick={() => backgroundRef.current?.click()}
              style={{ width: "100%", padding: "13px", background: theme.buttonBg, color: theme.buttonText, border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", marginTop: 14 }}>
              Image Choose Custom Background
            </button>
            {customBackground && (
              <button onClick={() => setCustomBackground("")}
                style={{ width: "100%", padding: "11px", background: "transparent", color: theme.muted, border: `1px solid ${theme.line}`, borderRadius: 12, fontSize: 13, cursor: "pointer", fontFamily: "system-ui", marginTop: 8 }}>
                Remove Custom Background
              </button>
            )}
            <div style={{ fontSize: 12, color: theme.muted, marginTop: 10, fontFamily: "system-ui" }}>Custom uses your camera roll/photo picker and keeps the image saved on this device.</div>
          </div>

          <div style={{ marginTop: 16, background: theme.cardBg, borderRadius: 14, padding: 20, boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
            <div style={{ fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 14 }}>Background Music - https://yt2mp3.gs/ - copy, new tab, paste</div>
            <button
              onClick={() => setInAppBrowserOpen(true)}
              style={{
                width: "100%",
                padding: "15px",
                background: "linear-gradient(135deg, #38bdf8, #a78bfa)",
                color: "#07111f",
                border: "none",
                borderRadius: 14,
                fontSize: 16,
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                marginBottom: 14,
                fontWeight: 900,
                boxShadow: "0 8px 24px rgba(56,189,248,.25)"
              }}
            >
              Browser Open Google Browser
            </button>
            <button
              onClick={() => {
                setInAppBrowserUrl("https://kick-video.download/");
                setInAppBrowserOpen(true);
              }}
              style={{
                width: "100%",
                padding: "13px",
                background: "transparent",
                color: appTextColor,
                border: `2px solid ${theme.line}`,
                borderRadius: 12,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                marginBottom: 10,
                fontWeight: 900
              }}
            >
              Download Kick Video
            </button>
            <input ref={audioFileRef} type="file" accept="audio/*" onChange={handleMusicFile} style={{ display: "none" }} />
            <button onClick={() => audioFileRef.current?.click()}
              style={{ width: "100%", padding: "13px", background: theme.buttonBg, color: theme.buttonText, border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", marginBottom: 10, fontWeight: 900 }}>
              Music Choose Music File
            </button>
            {musicData && (
              <>
                <div style={{ fontSize: 13, color: appTextColor, fontFamily: "system-ui", fontWeight: 800, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Current: {musicData ? (musicSettings.fileName || "Selected song") : "Built-in Fury soundtrack"}
                </div>
                <button onClick={toggleMusic}
                  style={{ width: "100%", padding: "13px", background: accentColor, color: "#111827", border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", marginBottom: 12, fontWeight: 900 }}>
                  {isMusicPlaying ? "Pause Music" : "Play Music"}
                </button>
                <label style={{ display: "block", fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 8, fontWeight: 800 }}>
                  Volume: {Math.round((musicSettings.volume ?? 0.35) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicSettings.volume ?? 0.35}
                  onChange={e => setMusicSettings(prev => ({ ...prev, volume: Number(e.target.value) }))}
                  style={{ width: "100%", accentColor, marginBottom: 10 }}
                />
                <button onClick={removeMusic}
                  style={{ width: "100%", padding: "11px", background: "transparent", color: theme.muted, border: `1px solid ${theme.line}`, borderRadius: 12, fontSize: 13, cursor: "pointer", fontFamily: "system-ui", fontWeight: 800 }}>
                  Remove Music
                </button>
              </>
            )}
            <div style={{ fontSize: 12, color: theme.muted, marginTop: 10, fontFamily: "system-ui" }}>Music plays only after you tap play. Audio stays on this device when the file is small enough for browser storage.</div>
          </div>

          <div style={{ marginTop: 16, background: theme.cardBg, borderRadius: 14, padding: 20, boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
            <div style={{ fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 14 }}>Backup & Restore</div>
            <button onClick={exportData}
              style={{ width: "100%", padding: "13px", background: theme.buttonBg, color: theme.buttonText, border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", marginBottom: 10 }}>
              Export Export Backup
            </button>
            <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
            <button onClick={() => importRef.current?.click()}
              style={{ width: "100%", padding: "13px", background: "transparent", color: appTextColor, border: `2px solid ${theme.line}`, borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif" }}>
              Import Import Backup
            </button>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 10, fontFamily: "system-ui" }}>Export regularly to keep your data safe. Import restores everything - projects, rates, and all entries.</div>
          </div>
        </div>
      )}

      {/* Projects Management View */}
      {view === "projects" && (
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 22, color: "#1C1C1E" }}>Projects</div>
            <button onClick={() => setView("week")} style={{ background: "none", border: "none", color: vibrantLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, textShadow: readableTextShadow }}>X</button>
          </div>
          <div style={{ marginBottom: 24 }}>
            {projects.map(p => (
              <div key={p.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                {editingProjectId === p.id ? (
                  <>
                    <input autoFocus value={editProjectName} onChange={e => setEditProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveProjectEdit(p.id); if (e.key === "Escape") setEditingProjectId(null); }}
                      style={{ flex: 1, fontSize: 15, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "2px 0" }} />
                    <button onClick={() => saveProjectEdit(p.id)} style={{ background: "none", border: "none", color: "#A8D5A2", cursor: "pointer", fontSize: 14, fontFamily: "system-ui" }}>Save</button>
                    <button onClick={() => setEditingProjectId(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14, fontFamily: "system-ui" }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 15, color: "#1C1C1E", fontFamily: "Georgia, serif" }}>{p.name}</span>
                    <button onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); }}
                      style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 13, fontFamily: "system-ui" }}>Edit</button>
                    {projects.length > 1 && (
                      <button onClick={() => deleteProject(p.id)}
                        style={{ background: "none", border: "none", color: "#e05555", cursor: "pointer", fontSize: 13, fontFamily: "system-ui" }}>Delete</button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 12 }}>New Project</div>
            <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addProject(); }}
              placeholder="Project name..."
              style={{ width: "100%", fontSize: 16, border: "none", borderBottom: "2px solid #e0e0e0", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "6px 0", marginBottom: 16, boxSizing: "border-box" }} />
            <div style={{ fontSize: 12, color: "#888", fontFamily: "system-ui", marginBottom: 10 }}>Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {PROJECT_COLORS.map(c => (
                <button key={c} onClick={() => setNewProjectColor(c)}
                  style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: newProjectColor === c ? "3px solid #1C1C1E" : "3px solid transparent", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
            <button onClick={addProject} disabled={!newProjectName.trim()}
              style={{ width: "100%", padding: "14px", background: newProjectName.trim() ? "#1C1C1E" : "#f0f0f0", color: newProjectName.trim() ? "#F7F5F2" : "#aaa", border: "none", borderRadius: 12, fontSize: 15, cursor: newProjectName.trim() ? "pointer" : "default", fontFamily: "Georgia, serif" }}>
              Add Project
            </button>
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "week" && (
        <div style={{ padding: "12px 16px 18px" }}>
          {weekDates.map((date, i) => {
            const e = getEntry(date, activeProjectId);
            const worked = calcTotalWorked(e);
            const hasEntry = e.start && e.end;
            const today_ = todayKey(date);
            const dayPay = calcExactPay(worked, hourlyRate);
            return (
              <button key={i} onClick={() => openEdit(date)}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  background: today_ ? theme.headerBg : dayCardBg,
                  border: "none", borderRadius: 14, padding: "16px 18px", marginBottom: 8,
                  cursor: "pointer", boxShadow: today_ ? theme.shadow : theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle,
                  textAlign: "left",
                }}
              >
                <div style={{ width: 52, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: today_ ? theme.headerText : dayCardText, fontFamily: "system-ui", textShadow: readableTextShadow }}>{DAYS[i]}</div>
                  <div style={{ fontSize: 11, color: today_ ? headerMutedColor : vibrantMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow }}>{formatDate(date)}</div>
                </div>
                <div style={{ flex: 1, marginLeft: 12 }}>
                  {hasEntry ? (
                    <div>
                      <div style={{ fontSize: 14, color: today_ ? theme.headerText : dayCardText, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow }}>
                        {to12Hour(e.start)} -> {to12Hour(e.end)}
                        {e.breaks && e.breaks.length > 0 && (
                          <span style={{ color: "#aaa", fontSize: 12 }}> - {totalBreakMins(e.breaks)}m break</span>
                        )}
                      </div>
                      {e.splitShift && e.start2 && e.end2 && (
                        <div style={{ fontSize: 12, color: today_ ? "#888" : "#aaa", fontFamily: "system-ui", marginTop: 2 }}>
                          + {to12Hour(e.start2)} -> {to12Hour(e.end2)}
                        </div>
                      )}
                      {e.splitShift && (e.extraShifts || []).map((shift, idx) => (
                        shift.start && shift.end ? (
                          <div key={idx} style={{ fontSize: 12, color: today_ ? "#888" : "#aaa", fontFamily: "system-ui", marginTop: 2 }}>
                            + {to12Hour(shift.start)} -> {to12Hour(shift.end)}
                          </div>
                        ) : null
                      ))}
                      {e.note && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, fontFamily: "system-ui" }}>{e.note}</div>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: today_ ? headerMutedColor : vibrantMutedColor, fontFamily: "system-ui" }}>
                      {today_ ? "Tap to log today" : "No entry"}
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: 12, textAlign: "right", flexShrink: 0 }}>
                  {hasEntry ? (
                    <>
                      <div style={{ fontSize: 17, color: today_ ? accentColor : "#1C1C1E", fontFamily: "Georgia, serif" }}>{minutesToHHMM(worked)}</div>
                      {dayPay && <div style={{ fontSize: 11, color: "#aaa", fontFamily: "system-ui", marginTop: 2 }}><AnimatedMoney value={dayPay} /></div>}
                    </>
                  ) : (
                    <div style={{ fontSize: 20, color: today_ ? "#444" : "#e0e0e0" }}>+</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
          onClick={() => setEditingDay(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.modalBg, width: "100%", borderRadius: "20px 20px 0 0", padding: "24px 20px 48px", maxHeight: "90vh", overflowY: "auto", color: theme.text, ...glassStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 22, color: "#1C1C1E" }}>{FULL_DAYS[weekDates.indexOf(editingDay)]}</div>
                <div style={{ fontSize: 13, color: "#aaa", fontFamily: "system-ui", marginTop: 2 }}>{formatDate(editingDay)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor }} />
                  <span style={{ fontSize: 12, color: "#888", fontFamily: "system-ui" }}>{activeProject?.name}</span>
                </div>
              </div>
              <button onClick={clearEntry} style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: 8, padding: "6px 12px", color: "#e05555", cursor: "pointer", fontSize: 13, fontFamily: "system-ui" }}>Clear</button>
            </div>

            {/* Shift 1 */}
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 8 }}>
              {form.splitShift ? "Shift 1" : "Shift"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>Start</label>
                <input type="time" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>End</label>
                <input type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
              </div>
            </div>

            {/* Split Shift Section */}
            {form.splitShift && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
                  <span style={{ fontSize: 11, color: "#bbb", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 1 }}>Shift 2</span>
                  <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>Start</label>
                    <input type="time" value={form.start2} onChange={e => setForm(f => ({ ...f, start2: e.target.value }))}
                      style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>End</label>
                    <input type="time" value={form.end2} onChange={e => setForm(f => ({ ...f, end2: e.target.value }))}
                      style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
                  </div>
                </div>

                {(form.extraShifts || []).map((shift, idx) => (
                  <div key={idx} style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
                      <span style={{ fontSize: 11, color: "#bbb", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 1 }}>Shift {idx + 3}</span>
                      <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>Start</label>
                        <input type="time" value={shift.start} onChange={e => setForm(f => { const extraShifts = [...(f.extraShifts || [])]; extraShifts[idx] = { ...extraShifts[idx], start: e.target.value }; return { ...f, extraShifts }; })}
                          style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>End</label>
                        <input type="time" value={shift.end} onChange={e => setForm(f => { const extraShifts = [...(f.extraShifts || [])]; extraShifts[idx] = { ...extraShifts[idx], end: e.target.value }; return { ...f, extraShifts }; })}
                          style={{ display: "block", width: "100%", marginTop: 6, fontSize: 22, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0" }} />
                      </div>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, extraShifts: (f.extraShifts || []).filter((_, i) => i !== idx) }))}
                      style={{ marginTop: 8, background: "none", border: "none", color: "#e05555", cursor: "pointer", fontSize: 13, fontFamily: "system-ui", padding: 0 }}>
                      Remove shift
                    </button>
                  </div>
                ))}

                <button onClick={() => setForm(f => ({ ...f, extraShifts: [...(f.extraShifts || []), { start: "", end: "" }] }))}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: "none", border: "1px dashed #d0d0d0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#888", fontSize: 13, fontFamily: "system-ui", width: "100%", justifyContent: "center" }}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add another split shift
                </button>
              </div>
            )}

            {/* Split Shift Toggle */}
            <button
              onClick={() => setForm(f => ({ ...f, splitShift: !f.splitShift, start2: "", end2: "", extraShifts: [] }))}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "none", border: "1px dashed #d0d0d0", borderRadius: 8,
                padding: "8px 14px", cursor: "pointer",
                color: form.splitShift ? "#e05555" : "#888",
                fontSize: 13, fontFamily: "system-ui", marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{form.splitShift ? "-" : "+"}</span>
              {form.splitShift ? "Remove split shift" : "Add split shift"}
            </button>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>Breaks</label>
                {form.breaks && form.breaks.length > 0 && (
                  <span style={{ fontSize: 11, color: "#aaa", fontFamily: "system-ui" }}>{totalBreakMins(form.breaks)}m total</span>
                )}
              </div>
              {form.breaks && form.breaks.map((brk, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="text" value={brk.label}
                    onChange={e => setForm(f => { const breaks = [...f.breaks]; breaks[idx] = { ...breaks[idx], label: e.target.value }; return { ...f, breaks }; })}
                    placeholder="Label (optional)"
                    style={{ flex: 1, fontSize: 14, border: "none", borderBottom: "1px solid #e0e0e0", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "6px 0" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <input type="number" min="1" max="480" value={brk.mins}
                      onChange={e => setForm(f => { const breaks = [...f.breaks]; breaks[idx] = { ...breaks[idx], mins: e.target.value }; return { ...f, breaks }; })}
                      style={{ width: 52, fontSize: 15, border: "none", borderBottom: "2px solid #1C1C1E", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "4px 0", textAlign: "center" }} />
                    <span style={{ fontSize: 12, color: "#888", fontFamily: "system-ui" }}>m</span>
                  </div>
                  <button onClick={() => setForm(f => ({ ...f, breaks: f.breaks.filter((_, i) => i !== idx) }))}
                    style={{ background: "none", border: "none", color: "#e05555", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>X</button>
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, breaks: [...(f.breaks || []), { label: "", mins: "" }] }))}
                style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, background: "none", border: "1px dashed #d0d0d0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#888", fontSize: 13, fontFamily: "system-ui", width: "100%", justifyContent: "center" }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add break
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui" }}>Note</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Add a note..."
                style={{ display: "block", width: "100%", marginTop: 6, fontSize: 15, border: "none", borderBottom: "1px solid #e0e0e0", outline: "none", fontFamily: "Georgia, serif", color: "#1C1C1E", background: "transparent", padding: "6px 0", boxSizing: "border-box" }} />
            </div>
            {totalWorked != null && (
              <div style={{ background: "#1C1C1E", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: "#888", fontSize: 12, fontFamily: "system-ui" }}>Total worked</span>
                <div style={{ textAlign: "right" }}>
                  <span style={{ color: accentColor, fontSize: 20, fontFamily: "Georgia, serif" }}>
                    {minutesToHHMM(totalWorked)}
                  </span>
                  {totalPay && (
                    <div style={{ color: "#666", fontSize: 12, fontFamily: "system-ui", marginTop: 2 }}>
                      <AnimatedMoney value={totalPay} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <button onClick={saveEntry} style={{ width: "100%", padding: "16px", background: theme.buttonBg, color: theme.buttonText, border: "none", borderRadius: 14, fontSize: 17, cursor: "pointer", fontFamily: "Georgia, serif" }}>
              Save Entry
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
