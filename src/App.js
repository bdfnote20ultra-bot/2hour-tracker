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
  PS1: "sidequest-gba.png",
};
const GAME_SYSTEMS = ["GB", "GBC", "GBA", "PS1"];
const POKEMON_SYSTEM_ASPECTS = {
  GB: 160 / 144,
  GBC: 160 / 144,
  GBA: 240 / 160,
  PS1: 4 / 3
};
const POKEMON_STRETCH_DEFAULT_OPTIONS = {
  aspect_ratio_index: "1",
  video_force_aspect: "false",
  video_scale_integer: "false",
  video_aspect_ratio_auto: "false"
};
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
    "EJS_disableLocalStorage"
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
          width: compact ? 70 : 92,
          height: compact ? 92 : 126,
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
        width: compact ? 70 : 92,
        height: compact ? 92 : 126,
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

function PokemonSidebar() {
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
  const [selectedArt, setSelectedArt] = useState("cover");
  const [zoomedCover, setZoomedCover] = useState(null);
  const [activeGameAssets, setActiveGameAssets] = useState({ manualUrl: "", backUrl: "" });
  const [gameLaunch, setGameLaunch] = useState(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState(0);
  const [stretchGame, setStretchGame] = useState(false);
  const [gameFullscreen, setGameFullscreen] = useState(false);
  const emulatorFrameRef = useRef(null);
  const emulatorHostRef = useRef(null);
  const gameCarouselRef = useRef(null);
  const gameCardRefs = useRef({});
  const gamepadKeysRef = useRef(new Set());

  const focusPokemonEmulator = () => {
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
    try { target?.click?.(); } catch {}
    try { window.EJS_emulator?.gameManager?.resume?.(); } catch {}
    try { window.EJS_emulator?.resume?.(); } catch {}
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

  const applyPokemonStretch = (shouldStretch) => {
    const host = emulatorHostRef.current;
    if (!host) return;

    try {
      window.EJS_emulator?.resize?.();
      window.EJS_emulator?.gameManager?.resize?.();
    } catch {}

    const systemAspect = POKEMON_SYSTEM_ASPECTS[activeGame?.system];
    const scaleX = shouldStretch && systemAspect ? POKEMON_FULLSCREEN_ASPECT / systemAspect : 1;
    host.style.setProperty("--pokemon-stretch-scale-x", String(scaleX));
    host.classList.toggle("pokemon-emulator-stretch", shouldStretch);
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
  const backgroundImage = SYSTEM_BACKGROUNDS[activeSystem] || SYSTEM_BACKGROUNDS.GB;
  const kickGamingChannel = normalizeKickChannel(kickGamingChannelInput) || "flivetv";
  const kickGamingEmbedUrl = `https://player.kick.com/${encodeURIComponent(kickGamingChannel)}?autoplay=true&muted=true`;

  useEffect(() => {
    try { localStorage.setItem(KICK_GAMING_CHANNEL_KEY, kickGamingChannel); } catch {}
  }, [kickGamingChannel]);

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
    window.EJS_defaultOptions = stretchGame ? POKEMON_STRETCH_DEFAULT_OPTIONS : {};
    window.EJS_disableLocalStorage = stretchGame;
    window.EJS_defaultControls = {
      0: {
        0: { value: "x", value2: "BUTTON_2" },
        1: { value: "s", value2: "BUTTON_4" },
        2: { value: "v", value2: "SELECT" },
        3: { value: "enter", value2: "START" },
        4: { value: "up arrow", value2: "DPAD_UP" },
        5: { value: "down arrow", value2: "DPAD_DOWN" },
        6: { value: "left arrow", value2: "DPAD_LEFT" },
        7: { value: "right arrow", value2: "DPAD_RIGHT" },
        8: { value: "z", value2: "BUTTON_1" },
        9: { value: "a", value2: "BUTTON_3" },
        10: { value: "q", value2: "LEFT_TOP_SHOULDER" },
        11: { value: "e", value2: "RIGHT_TOP_SHOULDER" },
        12: { value: "tab", value2: "LEFT_BOTTOM_SHOULDER" },
        13: { value: "r", value2: "RIGHT_BOTTOM_SHOULDER" },
        14: { value: "", value2: "LEFT_STICK" },
        15: { value: "", value2: "RIGHT_STICK" },
        16: { value: "h", value2: "LEFT_STICK_X:+1" },
        17: { value: "f", value2: "LEFT_STICK_X:-1" },
        18: { value: "g", value2: "LEFT_STICK_Y:+1" },
        19: { value: "t", value2: "LEFT_STICK_Y:-1" },
        20: { value: "l", value2: "RIGHT_STICK_X:+1" },
        21: { value: "j", value2: "RIGHT_STICK_X:-1" },
        22: { value: "k", value2: "RIGHT_STICK_Y:+1" },
        23: { value: "i", value2: "RIGHT_STICK_Y:-1" },
        24: { value: "1" },
        25: { value: "2" },
        26: { value: "3" },
        27: { value: "add" },
        28: { value: "space" },
        29: { value: "subtract" }
      },
      1: {},
      2: {},
      3: {}
    };

    const script = document.createElement("script");
    script.src = `https://cdn.emulatorjs.org/stable/data/loader.js?v=${Date.now()}`;
    script.async = true;
    script.dataset.pokemonEmulatorLoader = "true";
    document.body.appendChild(script);
    focusPokemonEmulator();

    const focusTimers = [150, 400, 900, 1600, 2600].map(delay =>
      window.setTimeout(focusPokemonEmulator, delay)
    );

    return () => {
      focusTimers.forEach(timer => window.clearTimeout(timer));
      resetPokemonEmulator(emulatorHostRef.current);
    };
  }, [gameLaunch?.core, gameLaunch?.discUrls?.join("|"), gameLaunch?.file, gameLaunch?.gameUrl, gameLaunch?.label, selectedDiscIndex, collapsed, stretchGame]);

  useEffect(() => {
    if (!gameLaunch || collapsed) return;

    const keyMap = {
      z: { key: "z", code: "KeyZ", keyCode: 90 },
      x: { key: "x", code: "KeyX", keyCode: 88 },
      a: { key: "a", code: "KeyA", keyCode: 65 },
      s: { key: "s", code: "KeyS", keyCode: 83 },
      q: { key: "q", code: "KeyQ", keyCode: 81 },
      e: { key: "e", code: "KeyE", keyCode: 69 },
      v: { key: "v", code: "KeyV", keyCode: 86 },
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
      8: "v",
      9: "enter",
      12: "up",
      13: "down",
      14: "left",
      15: "right"
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

    let raf = 0;
    let lastGamepadFocus = 0;
    const pollGamepads = () => {
      const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      const pad = pads[0];

      if (!pad) {
        releaseAllKeys();
        raf = window.requestAnimationFrame(pollGamepads);
        return;
      }

      const now = performance.now();
      if (now - lastGamepadFocus > 1000) {
        lastGamepadFocus = now;
        focusPokemonEmulator();
      }
      Object.entries(buttonToKey).forEach(([index, keyName]) => {
        setGameKey(keyName, Boolean(pad.buttons[Number(index)]?.pressed));
      });

      const xAxis = pad.axes[0] || 0;
      const yAxis = pad.axes[1] || 0;
      setGameKey("left", xAxis < -0.45);
      setGameKey("right", xAxis > 0.45);
      setGameKey("up", yAxis < -0.45);
      setGameKey("down", yAxis > 0.45);

      raf = window.requestAnimationFrame(pollGamepads);
    };

    raf = window.requestAnimationFrame(pollGamepads);
    window.addEventListener("gamepadconnected", focusPokemonEmulator);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", focusPokemonEmulator);
      releaseAllKeys();
    };
  }, [gameLaunch, collapsed]);

  useEffect(() => {
    if (!gameLaunch) return;

    applyPokemonStretch(stretchGame);
    const interval = window.setInterval(() => applyPokemonStretch(stretchGame), 500);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 5000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [gameLaunch, stretchGame]);

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
    <div className="pokemon-desktop-stack" style={{
      position: "fixed",
      left: 18,
      top: 4,
      bottom: 8,
      width: collapsed ? 72 : 390,
      zIndex: 4,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      paddingBottom: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
      overflowY: collapsed ? "hidden" : "auto",
      pointerEvents: "none",
      transition: "width .25s ease"
    }}>
    <aside className="pokemon-desktop-sidebar" style={{
      width: "100%",
      flex: "0 0 auto",
      borderRadius: 24,
      border: "2px solid rgba(255,255,255,0.22)",
      background: `linear-gradient(rgba(2,6,23,0.62), rgba(2,6,23,0.82)), url(${process.env.PUBLIC_URL}/${backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
      padding: collapsed ? 12 : 12,
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      transition: "width .25s ease, padding .25s ease",
      overflow: "hidden",
      pointerEvents: "auto"
    }}>
      <style>{`
        @media (max-width: 1180px) { .pokemon-desktop-stack { display: none !important; } }
        @media (max-width: 1180px) { .pokemon-desktop-sidebar { display: none !important; } }
        .pokemon-desktop-stack { scrollbar-width: none; -ms-overflow-style: none; }
        .pokemon-desktop-stack::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .pokemon-desktop-sidebar button:hover { transform: translateY(-1px); }
        .game-cover-carousel { scrollbar-width: none; -ms-overflow-style: none; }
        .game-cover-carousel::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .pokemon-emulator-host,
        .pokemon-emulator-host > div {
          width: 100% !important;
          height: 100% !important;
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
        .pokemon-emulator-host.pokemon-emulator-stretch {
          overflow: hidden !important;
        }
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_parent,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_game,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas_parent,
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas {
          width: 100% !important;
          height: 100% !important;
        }
        .pokemon-emulator-host.pokemon-emulator-stretch .ejs_canvas {
          transform: scaleX(var(--pokemon-stretch-scale-x, 1)) !important;
          transform-origin: center center !important;
          image-rendering: pixelated;
        }
      `}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 6, marginBottom: 8 }}>
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
                : activeGamingApp === "multiplayer"
                  ? "FUIT MULTIPLAYER"
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
              { value: "multiplayer", label: "FUIT MULTIPLAYER" },
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
        </div>
      ) : activeGamingApp === "live-gaming-youtube" ? (
        <div style={{
          width: "100%",
          aspectRatio: "4 / 3",
          minHeight: 245,
          borderRadius: 22,
          background: "#020617",
          border: "2px solid rgba(56,189,248,.28)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
        }} />
      ) : activeGamingApp === "multiplayer" ? (
        <div style={{
          width: "100%",
          minHeight: 245,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(20,83,45,.92), rgba(15,23,42,.96))",
          border: "2px solid rgba(34,197,94,.42)",
          boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)",
          display: "grid",
          placeItems: "center",
          padding: 18,
          color: "#dcfce7",
          textAlign: "center",
          fontWeight: 1000
        }}>
          <div>
            <div style={{ fontSize: 18, color: "#bbf7d0", marginBottom: 8 }}>FUIT MULTIPLAYER</div>
            <div style={{ fontSize: 12, color: "#86efac", lineHeight: 1.35 }}>Multiplayer lobby coming online here.</div>
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
            padding: 10,
            border: "2px solid rgba(248,250,252,.38)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
          }}>
            <div ref={emulatorFrameRef} className="pokemon-emulator-frame" tabIndex={0} style={{
              width: "100%",
              aspectRatio: "4 / 3",
              minHeight: 220,
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
                  fontSize: 13,
                  fontWeight: 900,
                  textAlign: "center",
                  padding: 18
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
                  fontSize: 13,
                  fontWeight: 900,
                  textAlign: "center",
                  padding: 18
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
                      onClick={() => {
                        resetPokemonEmulator(emulatorHostRef.current);
                        setGameLaunch(activeGame);
                      }}
                      style={{
                        marginTop: 14,
                        border: "none",
                        borderRadius: 999,
                        padding: "10px 14px",
                        background: "#22c55e",
                        color: "#052e16",
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
            padding: 8,
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
                width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: 22, fontWeight: 900
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
                width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: 22, fontWeight: 900
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
                    minWidth: 94,
                    maxWidth: 94,
                    scrollSnapAlign: "center",
                    border: selected ? "2px solid #facc15" : "1px solid rgba(255,255,255,.18)",
                    borderRadius: 13,
                    padding: 6,
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
                      marginTop: 6, fontSize: 10, fontWeight: 900, lineHeight: 1.12,
                      height: 34, overflow: "hidden", color: selected ? "#fff" : "#cbd5e1"
                    }}>
                      {game.label}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, fontWeight: 900, color: selected ? "#facc15" : "#94a3b8" }}>
                      {game.system} - {game.year}
                    </div>
                    {discCount > 1 && (
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 1000, color: "#38bdf8" }}>
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
            gridTemplateColumns: "92px 1fr",
            gap: 10,
            alignItems: "center",
            padding: 8,
            borderRadius: 16,
            background: "rgba(15,23,42,.88)",
            border: "1px solid rgba(255,255,255,.14)"
          }}>
            <PokemonCoverImage game={activeGame} imageType={selectedArt} onZoom={setZoomedCover} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.25, color: "#fff" }}>{activeGame.label}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", marginTop: 4 }}>{activeGame.system} - {activeGame.year}</div>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => setSelectedArt("cover")} style={{
                  border: "none", borderRadius: 999, padding: "7px 10px", cursor: "pointer",
                  background: selectedArt === "cover" ? "#22c55e" : "rgba(255,255,255,.14)", color: selectedArt === "cover" ? "#052e16" : "#fff", fontWeight: 900
                }}>Cover</button>
                {activeGameAssets.backUrl && (
                  <button onClick={() => setSelectedArt("back")} style={{
                    border: "none", borderRadius: 999, padding: "7px 10px", cursor: "pointer",
                    background: selectedArt === "back" ? "#a855f7" : "rgba(255,255,255,.14)", color: "#fff", fontWeight: 900
                  }}>Back</button>
                )}
                {activeGameAssets.manualUrl && (
                  <a href={activeGameAssets.manualUrl} target="_blank" rel="noreferrer" style={{
                    borderRadius: 999, padding: "7px 10px", textDecoration: "none", background: "rgba(59,130,246,.9)", color: "#fff", fontWeight: 900, fontSize: 13
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
  return (
    <iframe
      title={title}
      src={src}
      allow="fullscreen"
      allowFullScreen
      style={{
        width: "100%",
        height,
        minHeight,
        border: "1px solid rgba(148,163,184,.22)",
        borderRadius: 14,
        background: "#020617"
      }}
    />
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
            minHeight: 260,
            maxHeight: 420,
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

const FuitsLiveTvPlayer = forwardRef(function FuitsLiveTvPlayer({ baseUrl, channelId = "channel-a", startupBufferSeconds = 0, liveAnnouncementOnline = false, restartSignal = 0, onPlaybackAnchor }, ref) {
  const videoRef = useRef(null);
  const videoShellRef = useRef(null);
  const syncedVideoSrcRef = useRef("");
  const refreshQueuedRef = useRef(false);
  const transitionBufferPendingRef = useRef(false);
  const pendingTransitionStartRef = useRef(false);
  const anchoredPlaybackKeyRef = useRef("");
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
  const [restartAnchor, setRestartAnchor] = useState(null);
  const currentItem = channel?.playlist?.[channel.currentIndex] || null;
  const videoSrc = currentItem?.src
    ? `${baseUrl}${currentItem.src.startsWith("/") ? "" : "/"}${currentItem.src}${currentItem.src.includes("?") ? "&" : "?"}stream=${encodeURIComponent(`${channelId}-${currentItem.id}-${currentItem.sizeBytes || currentItem.duration || ""}`)}`
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

  const syncVideoToLiveOffset = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !channel || !currentItem || !Number.isFinite(video.duration)) return;
    if (pendingTransitionStartRef.current && syncedVideoSrcRef.current !== videoSrc) return;

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
    if (force || Math.abs(driftSeconds) > 1.75) {
      try {
        video.currentTime = liveOffset;
        video.playbackRate = 1;
      } catch {
        setVideoError("Video loaded, but the stream could not seek. Try Next or restart the tunnel.");
      }
      return;
    }

    video.playbackRate = driftSeconds < -0.35 ? 1.08 : 1;
  }, [channel, currentItem, getLiveOffsetSeconds, videoSrc]);

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
    const video = videoRef.current;
    if (!video || !channel || !currentItem || !videoSrc || syncedVideoSrcRef.current === videoSrc) return;

    const syncTime = () => {
      if (!Number.isFinite(video.duration)) return;
      if (pendingTransitionStartRef.current) return;
      syncVideoToLiveOffset(true);
      syncedVideoSrcRef.current = videoSrc;
    };

    if (video.readyState >= 1) syncTime();
    else {
      video.addEventListener("loadedmetadata", syncTime, { once: true });
      return () => video.removeEventListener("loadedmetadata", syncTime);
    }
  }, [channel, currentItem, currentOffsetSeconds, videoSrc, syncVideoToLiveOffset]);

  useEffect(() => {
    if (!videoSrc) return undefined;
    const timer = window.setInterval(() => syncVideoToLiveOffset(false), 2000);
    return () => window.clearInterval(timer);
  }, [videoSrc, syncVideoToLiveOffset]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveAnnouncementOnline) return;
    video.pause();
  }, [liveAnnouncementOnline]);

  const playCurrentVideo = () => {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

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

  const playWhenBuffered = () => {
    const video = videoRef.current;
    if (!video) return;
    const bufferSeconds = transitionBufferPendingRef.current
      ? FUITS_TRANSITION_BUFFER_SECONDS
      : startupBufferSeconds;
    const enoughBuffered = bufferSeconds <= 0 || getBufferedAheadSeconds(video) >= bufferSeconds;
    const nearEnd = Number.isFinite(video.duration) && video.duration - video.currentTime < bufferSeconds;
    if (video.readyState >= 1 && (enoughBuffered || nearEnd)) {
      transitionBufferPendingRef.current = false;
      setVideoLoading(false);
      playCurrentVideo();
    }
  };

  const showBufferingIfNeeded = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) return;
    if (video.readyState < 1 && getBufferedAheadSeconds(video) < 0.35) setVideoLoading(true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    setVideoLoading(true);
    setVideoError("");
    setLargePreloadProgress(0);
    if (syncedVideoSrcRef.current && syncedVideoSrcRef.current !== videoSrc) {
      transitionBufferPendingRef.current = true;
      pendingTransitionStartRef.current = true;
    }
    syncedVideoSrcRef.current = "";
    anchoredPlaybackKeyRef.current = "";
    video.muted = playerMuted;
    video.volume = playerVolume;
    video.preload = "auto";
    video.load();
    if (pendingTransitionStartRef.current) {
      try { video.currentTime = 0; } catch {}
    }
    if (video.readyState >= 1) playWhenBuffered();
  }, [videoSrc]);

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
    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;

      if (fullscreenElement !== videoShellRef.current) setStretchVideoFullscreen(false);
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
    const unmuteOnFirstPageClick = () => {
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

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoLoading(true);
    setVideoError("");
    video.load();
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };

  const stretchVideoToFullscreen = useCallback(() => {
    const shell = videoShellRef.current;
    const video = videoRef.current;
    if (!shell) return;

    setStretchVideoFullscreen(true);
    if (video) {
      video.muted = false;
      video.volume = 1;
      setPlayerMuted(false);
      setPlayerVolume(1);
      const playPromise = video.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    }

    const requestFullscreen =
      shell.requestFullscreen ||
      shell.webkitRequestFullscreen ||
      shell.msRequestFullscreen;
    try { requestFullscreen?.call(shell); } catch {}
  }, []);

  useImperativeHandle(ref, () => ({
    stretchVideoToFullscreen
  }), [stretchVideoToFullscreen]);

  const confirmRestartPassword = () => {
    const password = window.prompt("Restart password");
    return password === FUITS_RESTART_PASSWORD;
  };

  const restartCurrentVideo = (requirePassword = true) => {
    if (requirePassword && !confirmRestartPassword()) {
      setVideoError("Restart blocked. Password required.");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
      syncedVideoSrcRef.current = videoSrc;
      if (currentItem) {
        setRestartAnchor({
          channelId,
          itemId: currentItem.id,
          startedAtMs: Date.now()
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
            className={stretchVideoFullscreen ? "fuits-video-shell-stretch" : "fuits-video-shell"}
            style={{ position: "relative", background: "#000" }}
          >
            <style>{`
              .fuits-video-shell:fullscreen,
              .fuits-video-shell-stretch:fullscreen,
              .fuits-video-shell:-webkit-full-screen,
              .fuits-video-shell-stretch:-webkit-full-screen {
                width: 100vw !important;
                height: 100vh !important;
                background: #000 !important;
              }
              .fuits-video-shell-stretch:fullscreen video,
              .fuits-video-shell-stretch:-webkit-full-screen video {
                width: 100vw !important;
                height: 100vh !important;
                max-height: none !important;
                object-fit: fill !important;
              }
            `}</style>
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              playsInline
              muted={playerMuted}
              autoPlay={!needsLargeVideoPreload}
              preload="auto"
              onLoadedMetadata={() => {
                setVideoLoading(false);
                if (needsLargeVideoPreload) {
                  videoRef.current?.pause();
                  return;
                }
                if (pendingTransitionStartRef.current) {
                  try { videoRef.current.currentTime = 0; } catch {}
                }
                playWhenBuffered();
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
                playWhenBuffered();
              }}
              onLoadedData={() => {
                setVideoLoading(false);
                setVideoError("");
              }}
              onPlaying={() => {
                const video = videoRef.current;
                const playbackKey = `${channelId}:${currentItem?.id || ""}:${videoSrc}`;
                if (video && currentItem && anchoredPlaybackKeyRef.current !== playbackKey) {
                  const startedAtMs = Date.now() - Math.max(0, Number(video.currentTime) || 0) * 1000;
                  anchoredPlaybackKeyRef.current = playbackKey;
                  pendingTransitionStartRef.current = false;
                  syncedVideoSrcRef.current = videoSrc;
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
              }}
              onEnded={handleVideoEnded}
              onWaiting={showBufferingIfNeeded}
              onStalled={() => setVideoError("Stream stalled. The tunnel or source video is not sending data fast enough.")}
              onError={() => setVideoError("This video did not load. Try Next, Shuffle, or Retry.")}
              onVolumeChange={event => {
                setPlayerMuted(event.currentTarget.muted);
                setPlayerVolume(event.currentTarget.volume);
              }}
              style={{
                width: "100%",
                minHeight: 260,
                maxHeight: 420,
                background: "#000",
                display: "block",
                objectFit: stretchVideoFullscreen ? "fill" : "contain"
              }}
            />
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
      <div style={{
        padding: "8px 10px",
        color: "#cbd5e1",
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1.3,
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

function MusicLibrarySidebar({ accentColor }) {
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
  const [openMusicSections, setOpenMusicSections] = useState({ videos: false, music: false });
  const [zoomedDonationQr, setZoomedDonationQr] = useState(null);
  const jellyfinFrameRef = useRef(null);
  const adultSwimFrameRef = useRef(null);
  const fuitsLiveTvPlayerRef = useRef(null);
  const fuitsScheduleDataRef = useRef(null);
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
    const deviceId = getFuitsLiveDeviceId();

    const loadOnlineStats = async () => {
      try {
        const statsUrls = [
          `${window.location.origin.replace(/\/+$/, "")}/online-stats?device=${encodeURIComponent(deviceId)}&cache=${Date.now()}`,
          `${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/online-stats?device=${encodeURIComponent(deviceId)}&cache=${Date.now()}`
        ];
        let stats = null;
        for (const statsUrl of statsUrls) {
          try {
            const response = await fetch(statsUrl, { cache: "no-store" });
            if (!response.ok) continue;
            stats = await response.json();
            break;
          } catch {}
        }
        if (!stats) throw new Error("online stats unavailable");
        if (!cancelled) {
          setOnlineStats({
            devices: Number(stats.devices) || 0,
            households: Number(stats.households) || 0
          });
        }
      } catch {
        if (!cancelled) setOnlineStats(current => current.devices === null ? { devices: null, households: null } : current);
      }
    };

    loadOnlineStats();
    const timer = setInterval(loadOnlineStats, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fuitsLiveTvChannelUrl]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocalForecast({ status: "unsupported", days: [] });
      return undefined;
    }

    let cancelled = false;
    let weatherStarted = false;
    setLocalForecast({ status: "waiting", days: [] });
    const reportWeatherLocation = async (status, coords = null, timezone = "") => {
      if (!fuitsLiveTvChannelUrl) return;
      const params = new URLSearchParams({
        device: getFuitsLiveDeviceId(),
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

    const loadForecastOnce = () => {
      if (cancelled || weatherStarted) return;
      weatherStarted = true;
      setLocalForecast({ status: "asking", days: [] });

      navigator.geolocation.getCurrentPosition(
        async position => {
          if (cancelled) return;
          const { latitude, longitude } = position.coords || {};
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
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

    const idleId = window.setTimeout(loadForecastOnce, 9000);

    return () => {
      cancelled = true;
      window.clearTimeout(idleId);
    };
  }, []);

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
  const liveTvOptions = [
    { id: "fattys", label: "FUITS LIVE TV WORLD", heading: "FUITS LIVE TV WORLD", custom: true },
    { id: "adultRelax", label: "ADULT RELAX TIME", heading: "ADULT RELAX TIME", custom: true, defaultChannel: "channel-adult-relax-time" },
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
    { id: "channel-adult-relax-time", label: "ADULT RELAX TIME" },
    { id: "channel-movie-night", label: "MOVIE NIGHT" },
    { id: "channel-new-releases", label: "NEW RELEASES" },
    { id: "channel-sleep-chill", label: "SLEEP CHILL" }
  ]), []);
  const [liveFuitsLiveTvChannels, setLiveFuitsLiveTvChannels] = useState(fuitsLiveTvChannels);
  const activeLiveTvOption = liveTvOptions.find(option => option.id === activeLiveTv) || liveTvOptions[0];
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
        const response = await fetch(`${fuitsLiveTvChannelUrl.replace(/\/+$/, "")}/fuits-live-tv?cache=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const parsedChannels = Array.from(doc.querySelectorAll("#channelSelect option"))
          .map(option => ({
            id: option.getAttribute("value") || "",
            label: option.textContent.trim()
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

        setLiveFuitsLiveTvChannels(mergedChannels);
        if (!seen.has(activeFuitsLiveTvChannel)) {
          setActiveFuitsLiveTvChannel(mergedChannels[0].id);
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
  }, [activeFuitsLiveTvChannel, fuitsLiveTvChannelUrl, fuitsLiveTvChannels]);

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

  const restartFuitsChannelWithPassword = () => {
    const password = window.prompt("Restart password");
    if (password !== FUITS_RESTART_PASSWORD) {
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
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 8,
      width: "100%"
    }}>
      {fuitsOwnerCommands.map(command => (
        <button
          key={command.label}
          onClick={() => command.localAction ? command.localAction() : runFuitsOwnerCommand(command)}
          style={{
            border: "1px solid rgba(34,211,238,.4)",
            borderRadius: 12,
            background: "linear-gradient(135deg, rgba(187,247,208,.95), rgba(56,189,248,.95))",
            color: "#020617",
            padding: "10px 8px",
            fontWeight: 1000,
            cursor: "pointer",
            boxShadow: "0 12px 26px rgba(34,211,238,.18)"
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

  const openFrameFullscreen = (frame) => {
    if (!frame) return;
    const requestFullscreen =
      frame.requestFullscreen ||
      frame.webkitRequestFullscreen ||
      frame.msRequestFullscreen;
    if (requestFullscreen) {
      requestFullscreen.call(frame);
    }
  };

  const openJellyfinFullscreen = () => {
    openFrameFullscreen(jellyfinFrameRef.current);
  };

  const openAdultSwimFullscreen = () => {
    openFrameFullscreen(adultSwimFrameRef.current);
  };

  return (
    <aside className="music-library-desktop-sidebar" style={{
      position: "fixed",
      right: 18,
      top: 18,
      bottom: 18,
      width: 360,
      zIndex: 4,
      borderRadius: 20,
      border: "1px solid rgba(148,163,184,0.2)",
      background: "linear-gradient(180deg, rgba(15,23,42,.94), rgba(2,6,23,.96))",
      boxShadow: "0 18px 48px rgba(0,0,0,0.46)",
      padding: 14,
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }}>
      <style>{`
        @media (max-width: 1180px) { .music-library-desktop-sidebar { display: none !important; } }
        @media (max-width: 1180px) {
          .fuits-online-indicator,
          .fuits-weather-panel,
          .fuits-schedule-panel { display: none !important; }
        }
        .music-library-desktop-sidebar button:hover { transform: translateY(-1px); }
        @keyframes fuits-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,.62); }
          50% { opacity: .42; transform: scale(.82); box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>

      <div className="fuits-online-indicator" style={{
        position: "fixed",
        right: 430,
        top: 18,
        zIndex: 8,
        width: 220,
        border: "1px solid rgba(239,68,68,.28)",
        borderRadius: 14,
        background: "rgba(2,6,23,.88)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
        padding: "10px 12px",
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
        right: 430,
        top: 110,
        zIndex: 8,
        width: 220,
        border: "1px solid rgba(56,189,248,.28)",
        borderRadius: 14,
        background: "rgba(2,6,23,.88)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
        padding: "10px 12px",
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
        right: 390,
        bottom: 26,
        zIndex: 8,
        width: 300,
        border: "1px solid rgba(250,204,21,.32)",
        borderRadius: 14,
        background: "rgba(2,6,23,.9)",
        boxShadow: "0 16px 38px rgba(0,0,0,.48)",
        padding: "12px 14px",
        color: "#f8fafc",
        display: "grid",
        gap: 8
      }}>
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
        <div style={{
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
          <div style={{
            flex: 1,
            padding: "4px 2px 0",
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
            <div style={{
              color: "#cbd5e1",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.45
            }}>
              {activeLiveTvOption.heading}
            </div>
            <div style={{ position: "relative", width: "100%" }}>
              <button onClick={() => setLiveTvMenuOpen(open => !open)} style={{
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
                  {liveTvOptions.map(option => (
                    <button key={option.id} onClick={() => {
                      setActiveLiveTv(option.id);
                      if (option.defaultChannel) setActiveFuitsLiveTvChannel(option.defaultChannel);
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
                <select
                  value={activeFuitsLiveTvChannel}
                  onChange={event => setActiveFuitsLiveTvChannel(event.target.value)}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(148,163,184,.28)",
                    borderRadius: 12,
                    background: "#020617",
                    color: "#f8fafc",
                    padding: "11px 12px",
                    outline: "none",
                    fontSize: 13,
                    fontWeight: 1000,
                    textTransform: "uppercase",
                    letterSpacing: .7
                  }}
                >
                  {liveFuitsLiveTvChannels.map(channel => (
                    <option key={channel.id} value={channel.id}>{channel.label}</option>
                  ))}
                </select>
                <div style={{ width: "100%", display: "flex", justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={backFuitsChannelWithPassword}
                    style={{
                      border: "1px solid rgba(255,255,255,.26)",
                      borderRadius: 999,
                      padding: "7px 10px",
                      background: "rgba(15,23,42,.88)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 1000,
                      cursor: "pointer",
                      boxShadow: "0 8px 18px rgba(0,0,0,.32)",
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
                      padding: "7px 10px",
                      background: "rgba(15,23,42,.88)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 1000,
                      cursor: "pointer",
                      boxShadow: "0 8px 18px rgba(0,0,0,.32)",
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
                />
                {renderFuitsOwnerControls()}
                <LiveChatBox
                  title="FUITS Live TV Chat"
                  src={fuitsLiveTvChatUrl || `${fuitsLiveTvChannelUrl}/chat-only`}
                  height={260}
                  minHeight={260}
                />
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
                    FULLSCREEN JELLYFIN
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
                {(activeLiveTvOption.id === "jellyfin" || activeLiveTvOption.id === "athf") && (
                  <LiveChatBox
                    title={`${activeLiveTvOption.label} Chat`}
                    src={`${fuitsLiveTvChannelUrl}/chat-only`}
                    height={activeLiveTvOption.id === "jellyfin" ? 260 : 250}
                    minHeight={activeLiveTvOption.id === "jellyfin" ? 260 : 250}
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
                    src={`${fuitsLiveTvChannelUrl}/chat-only`}
                    height={250}
                    minHeight={250}
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
            src={`${fuitsLiveTvChannelUrl}/chat-only`}
            height={250}
            minHeight={250}
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

function CreditHubPage({ onClose }) {
  const ADMIN_PASSWORD = "FUCKNUTZ22!";
  const FEE_RATE = 0.0005;
  const SUPPORTED_COINS = ["USDC", "USDT", "POL", "SOL"];
  const demoEvents = [
    { id: "esp-001", league: "Esports", event: "CS2 - Falcons vs Liquid", market: "Prematch ML", odds: "+120", starts: "Tonight" },
    { id: "esp-002", league: "Esports", event: "LoL - T1 vs Gen.G", market: "Prematch ML", odds: "-145", starts: "Tomorrow" },
    { id: "spr-001", league: "Sports", event: "NBA Demo - Home vs Away", market: "Prematch spread", odds: "-110", starts: "Upcoming" }
  ];

  const loadCreditState = () => {
    try {
      return JSON.parse(localStorage.getItem("fuitCreditHubState_v1")) || null;
    } catch {
      return null;
    }
  };

  const [walletAddress, setWalletAddress] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [selectedCoin, setSelectedCoin] = useState("USDC");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTx, setDepositTx] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawCoin, setWithdrawCoin] = useState("USDC");
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(demoEvents[0]);
  const [casinoAmount, setCasinoAmount] = useState("");
  const [fuitMintAmount, setFuitMintAmount] = useState("");
  const [state, setState] = useState(() => loadCreditState() || {
    users: {},
    deposits: [],
    withdrawals: [],
    bets: [],
    casinoRounds: [],
    fees: [],
    fuitCoin: { supply: 0, backing: 0 },
    house: { USDC: 0, USDT: 0, POL: 0, SOL: 0 }
  });

  useEffect(() => {
    try { localStorage.setItem("fuitCreditHubState_v1", JSON.stringify(state)); } catch {}
  }, [state]);

  const shortWallet = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Guest";
  const user = state.users[walletAddress] || { credits: 0, online: !!walletAddress, wallet: walletAddress };
  const feeOf = (amount) => Number((Number(amount || 0) * FEE_RATE).toFixed(6));
  const netOf = (amount) => Number((Number(amount || 0) - feeOf(amount)).toFixed(6));
  const totalFees = state.fees.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalActiveCredits = Object.values(state.users).reduce((sum, item) => sum + Number(item.credits || 0), 0);
  const potentialLiability = state.bets.filter(b => b.status === "open").reduce((sum, b) => sum + Number(b.potentialPayout || 0), 0);

  const updateUserCredits = (address, creditDelta) => {
    if (!address) return;
    setState(prev => {
      const existing = prev.users[address] || { wallet: address, credits: 0, online: true };
      return {
        ...prev,
        users: {
          ...prev.users,
          [address]: {
            ...existing,
            wallet: address,
            online: true,
            credits: Math.max(0, Number(((Number(existing.credits || 0) + Number(creditDelta || 0))).toFixed(6)))
          }
        }
      };
    });
  };

  const addFee = (source, amount, coin = "CREDITS") => {
    const fee = feeOf(amount);
    if (fee <= 0) return fee;
    setState(prev => ({
      ...prev,
      fees: [{ id: `fee_${Date.now()}`, source, amount: fee, coin, time: new Date().toLocaleString() }, ...prev.fees]
    }));
    return fee;
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("No browser wallet found. Install MetaMask or open this app inside Trust Wallet browser.");
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0] || "";
      if (!address) return;
      setWalletAddress(address);
      setWithdrawWallet(address);
      setState(prev => ({
        ...prev,
        users: {
          ...prev.users,
          [address]: { ...(prev.users[address] || { credits: 0 }), wallet: address, online: true, username: `${address.slice(0, 6)}...${address.slice(-4)}` }
        }
      }));
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
    } catch (err) {
      alert(`Wallet connection failed: ${err?.message || err}`);
    }
  };

  const openTrustWallet = () => {
    window.open(`https://link.trustwallet.com/open_url?coin_id=966&url=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer");
  };

  const submitDeposit = () => {
    const amount = Number(depositAmount);
    if (!walletAddress) return alert("Connect a wallet first.");
    if (!amount || amount <= 0) return alert("Enter deposit amount.");
    const fee = feeOf(amount);
    setState(prev => ({
      ...prev,
      deposits: [{ id: `dep_${Date.now()}`, wallet: walletAddress, coin: selectedCoin, amount, tx: depositTx.trim(), fee, creditsToAward: netOf(amount), status: "pending", time: new Date().toLocaleString() }, ...prev.deposits]
    }));
    setDepositAmount("");
    setDepositTx("");
  };

  const submitWithdrawal = () => {
    const amount = Number(withdrawAmount);
    if (!walletAddress) return alert("Connect a wallet first.");
    if (!amount || amount <= 0) return alert("Enter withdrawal amount.");
    if (amount > user.credits) return alert("Not enough credits.");
    const fee = feeOf(amount);
    updateUserCredits(walletAddress, -amount);
    addFee("withdrawal_request", amount);
    setState(prev => ({
      ...prev,
      withdrawals: [{ id: `wd_${Date.now()}`, wallet: walletAddress, coin: withdrawCoin, amount, fee, userReceives: netOf(amount), sendTo: withdrawWallet || walletAddress, status: "pending", time: new Date().toLocaleString() }, ...prev.withdrawals]
    }));
    setWithdrawAmount("");
  };

  const approveDeposit = (id) => {
    const dep = state.deposits.find(d => d.id === id);
    if (!dep || dep.status !== "pending") return;
    updateUserCredits(dep.wallet, dep.creditsToAward);
    addFee("deposit", dep.amount, dep.coin);
    setState(prev => ({
      ...prev,
      house: { ...prev.house, [dep.coin]: Number(((prev.house[dep.coin] || 0) + Number(dep.amount || 0)).toFixed(6)) },
      deposits: prev.deposits.map(d => d.id === id ? { ...d, status: "approved" } : d)
    }));
  };

  const rejectDeposit = (id) => setState(prev => ({ ...prev, deposits: prev.deposits.map(d => d.id === id ? { ...d, status: "rejected" } : d) }));
  const completeWithdrawal = (id) => setState(prev => ({ ...prev, withdrawals: prev.withdrawals.map(w => w.id === id ? { ...w, status: "paid" } : w) }));
  const rejectWithdrawal = (id) => {
    const wd = state.withdrawals.find(w => w.id === id);
    if (wd && wd.status === "pending") updateUserCredits(wd.wallet, wd.amount);
    setState(prev => ({ ...prev, withdrawals: prev.withdrawals.map(w => w.id === id ? { ...w, status: "rejected/refunded" } : w) }));
  };

  const placeBet = () => {
    const amount = Number(betAmount);
    if (!walletAddress) return alert("Connect wallet first.");
    if (!amount || amount <= 0) return alert("Enter bet amount.");
    if (amount > user.credits) return alert("Not enough credits.");
    const fee = addFee("sportsbook_bet", amount);
    updateUserCredits(walletAddress, -amount);
    const stake = Number((amount - fee).toFixed(6));
    const potentialPayout = Number((stake * 1.9).toFixed(6));
    setState(prev => ({
      ...prev,
      bets: [{ id: `bet_${Date.now()}`, wallet: walletAddress, event: selectedEvent.event, market: selectedEvent.market, odds: selectedEvent.odds, stake, fee, potentialPayout, status: "open", time: new Date().toLocaleString() }, ...prev.bets]
    }));
    setBetAmount("");
  };

  const settleBet = (id, result) => {
    const bet = state.bets.find(b => b.id === id);
    if (!bet || bet.status !== "open") return;
    if (result === "win") updateUserCredits(bet.wallet, bet.potentialPayout);
    if (result === "push") updateUserCredits(bet.wallet, bet.stake);
    setState(prev => ({ ...prev, bets: prev.bets.map(b => b.id === id ? { ...b, status: result } : b) }));
  };

  const playCasinoDemo = (result) => {
    const amount = Number(casinoAmount);
    if (!walletAddress) return alert("Connect wallet first.");
    if (!amount || amount <= 0) return alert("Enter casino wager amount.");
    if (amount > user.credits) return alert("Not enough credits.");
    const fee = addFee("casino_wager", amount);
    const stake = Number((amount - fee).toFixed(6));
    updateUserCredits(walletAddress, -amount);
    if (result === "win") updateUserCredits(walletAddress, Number((stake * 2).toFixed(6)));
    setState(prev => ({
      ...prev,
      casinoRounds: [{ id: `cas_${Date.now()}`, wallet: walletAddress, wager: stake, fee, result, payout: result === "win" ? stake * 2 : 0, time: new Date().toLocaleString() }, ...prev.casinoRounds]
    }));
    setCasinoAmount("");
  };

  const mintFuit = () => {
    const amount = Number(fuitMintAmount);
    if (!amount || amount <= 0) return alert("Enter FUIT amount.");
    addFee("fuit_coin_mint", amount, "USDC");
    setState(prev => ({
      ...prev,
      fuitCoin: { supply: Number((prev.fuitCoin.supply + amount).toFixed(6)), backing: Number((prev.fuitCoin.backing + amount).toFixed(6)) }
    }));
    setFuitMintAmount("");
  };

  const burnFuit = () => {
    const amount = Number(fuitMintAmount);
    if (!amount || amount <= 0) return alert("Enter FUIT amount.");
    addFee("fuit_coin_burn", amount, "USDC");
    setState(prev => ({
      ...prev,
      fuitCoin: { supply: Math.max(0, Number((prev.fuitCoin.supply - amount).toFixed(6))), backing: Math.max(0, Number((prev.fuitCoin.backing - amount).toFixed(6))) }
    }));
    setFuitMintAmount("");
  };

  const card = { background: "rgba(15,23,42,.92)", border: "1px solid rgba(148,163,184,.28)", borderRadius: 18, padding: 16, boxShadow: "0 12px 34px rgba(0,0,0,.35)", marginBottom: 14 };
  const input = { width: "100%", boxSizing: "border-box", background: "#020617", color: "#f8fafc", border: "1px solid rgba(148,163,184,.35)", borderRadius: 12, padding: "11px 12px", marginTop: 8, marginBottom: 8, fontWeight: 800 };
  const button = { border: "none", borderRadius: 12, padding: "11px 13px", fontWeight: 900, cursor: "pointer", background: "linear-gradient(135deg,#22c55e,#38bdf8)", color: "#04111d" };
  const darkButton = { ...button, background: "rgba(255,255,255,.1)", color: "#f8fafc", border: "1px solid rgba(255,255,255,.18)" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#020617,#111827,#3b0764)", color: "#f8fafc", fontFamily: "system-ui", padding: 16, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 1000, letterSpacing: .4 }}>FUIT Credit Hub</div>
            <div style={{ color: "#cbd5e1", fontWeight: 800 }}>Credits sportsbook/casino + separate admin-only FUIT Coin vault</div>
          </div>
          <button onClick={onClose} style={darkButton}>Back to Hours</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 1000 }}>Wallet / Username</div>
            <div style={{ color: "#94a3b8", marginTop: 4 }}>Username is based on connected wallet.</div>
            <div style={{ marginTop: 12, fontSize: 24, fontWeight: 1000 }}>{shortWallet}</div>
            <div style={{ color: "#86efac", marginTop: 4, fontWeight: 900 }}>{Number(user.credits || 0).toFixed(4)} Credits</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={connectWallet} style={button}>Connect Polygon Wallet</button>
              <button onClick={openTrustWallet} style={darkButton}>Trust Wallet</button>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 1000 }}>0.05% Fee Rule</div>
            <div style={{ color: "#cbd5e1", marginTop: 8, lineHeight: 1.5 }}>Fee applies to deposits, withdrawals, sportsbook wagers, casino wagers, and admin FUIT mint/burn actions.</div>
            <div style={{ marginTop: 10, color: "#facc15", fontWeight: 1000 }}>Total fees: {totalFees.toFixed(6)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>Deposit Request</div>
            <select value={selectedCoin} onChange={e => setSelectedCoin(e.target.value)} style={input}>{SUPPORTED_COINS.map(c => <option key={c}>{c}</option>)}</select>
            <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount deposited" style={input} />
            <input value={depositTx} onChange={e => setDepositTx(e.target.value)} placeholder="TX hash / note" style={input} />
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>Credits after fee: {netOf(depositAmount).toFixed(6)}</div>
            <button onClick={submitDeposit} style={button}>Submit Deposit For Admin Approval</button>
          </div>

          <div style={card}>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>Withdrawal Request</div>
            <select value={withdrawCoin} onChange={e => setWithdrawCoin(e.target.value)} style={input}>{SUPPORTED_COINS.map(c => <option key={c}>{c}</option>)}</select>
            <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Credits to withdraw" style={input} />
            <input value={withdrawWallet} onChange={e => setWithdrawWallet(e.target.value)} placeholder="Wallet to send to" style={input} />
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>User receives after fee: {netOf(withdrawAmount).toFixed(6)}</div>
            <button onClick={submitWithdrawal} style={button}>Request Withdrawal</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>Sportsbook Demo</div>
            <div style={{ color: "#94a3b8", marginBottom: 8 }}>Prematch/esports layout. Odds API can replace these demo events later and should be cached every 20 minutes.</div>
            <select value={selectedEvent.id} onChange={e => setSelectedEvent(demoEvents.find(x => x.id === e.target.value) || demoEvents[0])} style={input}>
              {demoEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.event} - {ev.odds}</option>)}
            </select>
            <input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)} placeholder="Bet credits" style={input} />
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>Stake after fee: {netOf(betAmount).toFixed(6)}</div>
            <button onClick={placeBet} style={button}>Place Credit Bet</button>
          </div>

          <div style={card}>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>Casino Credits Demo</div>
            <div style={{ color: "#94a3b8", marginBottom: 8 }}>Simple test controls so fee logic works on casino actions too.</div>
            <input type="number" value={casinoAmount} onChange={e => setCasinoAmount(e.target.value)} placeholder="Casino wager credits" style={input} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => playCasinoDemo("win")} style={button}>Test Win</button>
              <button onClick={() => playCasinoDemo("loss")} style={darkButton}>Test Loss</button>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 1000 }}>Admin Area</div>
              <div style={{ color: "#94a3b8" }}>Password protected admin controls. Password: saved in included TXT file.</div>
            </div>
            {!adminUnlocked ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Admin password" style={{ ...input, margin: 0, minWidth: 190 }} />
                <button onClick={() => adminPass === ADMIN_PASSWORD ? setAdminUnlocked(true) : alert("Wrong password")} style={button}>Unlock</button>
              </div>
            ) : <button onClick={() => setAdminUnlocked(false)} style={darkButton}>Lock Admin</button>}
          </div>

          {adminUnlocked && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 14 }}>
                <div style={card}><b>House USDC</b><br />{state.house.USDC.toFixed(4)}</div>
                <div style={card}><b>House USDT</b><br />{state.house.USDT.toFixed(4)}</div>
                <div style={card}><b>House POL</b><br />{state.house.POL.toFixed(4)}</div>
                <div style={card}><b>House SOL</b><br />{state.house.SOL.toFixed(4)}</div>
                <div style={card}><b>Active Credits</b><br />{totalActiveCredits.toFixed(4)}</div>
                <div style={card}><b>Open Liability</b><br />{potentialLiability.toFixed(4)}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
                <div style={card}>
                  <div style={{ fontSize: 19, fontWeight: 1000 }}>Pending Deposits</div>
                  {state.deposits.length === 0 && <div style={{ color: "#94a3b8" }}>No deposits yet.</div>}
                  {state.deposits.map(d => <div key={d.id} style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 10, marginTop: 10 }}>
                    <b>{d.coin} {d.amount}</b> -> award {d.creditsToAward} credits<br />
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{d.wallet} - {d.status} - {d.tx || "no tx"}</span>
                    {d.status === "pending" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={() => approveDeposit(d.id)} style={button}>Approve</button><button onClick={() => rejectDeposit(d.id)} style={darkButton}>Reject</button></div>}
                  </div>)}
                </div>

                <div style={card}>
                  <div style={{ fontSize: 19, fontWeight: 1000 }}>Pending Withdrawals</div>
                  {state.withdrawals.length === 0 && <div style={{ color: "#94a3b8" }}>No withdrawals yet.</div>}
                  {state.withdrawals.map(w => <div key={w.id} style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 10, marginTop: 10 }}>
                    <b>{w.coin} {w.userReceives}</b> after fee from {w.amount} credits<br />
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{w.sendTo} - {w.status}</span>
                    {w.status === "pending" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={() => completeWithdrawal(w.id)} style={button}>Mark Paid</button><button onClick={() => rejectWithdrawal(w.id)} style={darkButton}>Reject/Refund</button></div>}
                  </div>)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
                <div style={card}>
                  <div style={{ fontSize: 19, fontWeight: 1000 }}>Open Bets</div>
                  {state.bets.length === 0 && <div style={{ color: "#94a3b8" }}>No bets yet.</div>}
                  {state.bets.map(b => <div key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 10, marginTop: 10 }}>
                    <b>{b.event}</b><br />Stake {b.stake} - payout {b.potentialPayout} - {b.status}
                    {b.status === "open" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={() => settleBet(b.id, "win")} style={button}>Win</button><button onClick={() => settleBet(b.id, "loss")} style={darkButton}>Loss</button><button onClick={() => settleBet(b.id, "push")} style={darkButton}>Push</button></div>}
                  </div>)}
                </div>

                <div style={card}>
                  <div style={{ fontSize: 19, fontWeight: 1000 }}>Users Online / Credits</div>
                  {Object.values(state.users).length === 0 && <div style={{ color: "#94a3b8" }}>No wallet users yet.</div>}
                  {Object.values(state.users).map(u => <div key={u.wallet} style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 10, marginTop: 10 }}>
                    <b>{u.username || `${u.wallet.slice(0, 6)}...${u.wallet.slice(-4)}`}</b> <span style={{ color: "#22c55e" }}>- online</span><br />
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{u.wallet}</span><br />
                    Credits: {Number(u.credits || 0).toFixed(4)}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={() => updateUserCredits(u.wallet, 100)} style={button}>+100</button><button onClick={() => updateUserCredits(u.wallet, -100)} style={darkButton}>-100</button></div>
                  </div>)}
                </div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 22, fontWeight: 1000 }}>Admin-Only FUIT Coin Vault</div>
                <div style={{ color: "#94a3b8", marginTop: 5 }}>Separate from casino/sportsbook credits. 1 FUIT = 1 stablecoin backing. This is a local admin tracker until you deploy the real Polygon token contract.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
                  <div style={card}><b>FUIT Supply</b><br />{state.fuitCoin.supply.toFixed(6)}</div>
                  <div style={card}><b>Stable Backing</b><br />{state.fuitCoin.backing.toFixed(6)}</div>
                  <div style={card}><b>Backing Ratio</b><br />{state.fuitCoin.supply > 0 ? `${((state.fuitCoin.backing / state.fuitCoin.supply) * 100).toFixed(2)}%` : "100%"}</div>
                </div>
                <input type="number" value={fuitMintAmount} onChange={e => setFuitMintAmount(e.target.value)} placeholder="FUIT amount" style={input} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={mintFuit} style={button}>Mint FUIT / Add Backing</button><button onClick={burnFuit} style={darkButton}>Burn FUIT / Remove Backing</button></div>
              </div>
            </div>
          )}
        </div>
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

function AdminPage({ onClose }) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [videoChunkMb, setVideoChunkMb] = useState(4);
  const [videoChunkStatus, setVideoChunkStatus] = useState("Loading video stream controls...");
  const [onlineUserInfo, setOnlineUserInfo] = useState({ loading: true, devices: 0, households: 0, householdDetails: [] });
  const fuitsAdminBaseUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const sectionStyle = {
    background: "rgba(15,23,42,.92)",
    border: "2px solid rgba(96,165,250,.7)",
    borderRadius: 0,
    padding: 18,
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

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const loadOnlineUserInfo = async () => {
      try {
        const params = new URLSearchParams({ password, cache: String(Date.now()) });
        const response = await fetch(`${fuitsAdminBaseUrl}/admin/online-users?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Online users unavailable");
        const info = await response.json();
        if (cancelled) return;
        setOnlineUserInfo({
          loading: false,
          devices: Number(info.devices) || 0,
          households: Number(info.households) || 0,
          householdDetails: Array.isArray(info.householdDetails) ? info.householdDetails : []
        });
      } catch {
        if (!cancelled) setOnlineUserInfo(current => ({ ...current, loading: false, error: "Could not load online user information yet." }));
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

  const unlockAdmin = event => {
    event.preventDefault();
    if (password === "FOOLIO") {
      setOnlineUserInfo({ loading: true, devices: 0, households: 0, householdDetails: [] });
      setUnlocked(true);
      setError("");
      return;
    }
    setError("Wrong password");
  };

  const formatWeatherLocation = location => {
    if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return "NULL";
    const lat = Number(location.latitude).toFixed(4);
    const lon = Number(location.longitude).toFixed(4);
    return `${lat}, ${lon}${location.timezone ? ` (${location.timezone})` : ""}`;
  };

  if (unlocked) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "system-ui, sans-serif", padding: 24, boxSizing: "border-box" }}>
        <button onClick={onClose} style={{ border: "1px solid rgba(148,163,184,.3)", borderRadius: 999, background: "rgba(15,23,42,.9)", color: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 900, padding: "9px 14px" }}>
          Back
        </button>
        <div style={{ maxWidth: 820, marginTop: 28, display: "grid", gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 1000, letterSpacing: .4 }}>ADMIN</h1>
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
                style={{ border: "1px solid #67e8f9", borderRadius: 8, background: "#67e8f9", color: "#020617", cursor: "pointer", fontSize: 14, fontWeight: 1000, padding: "11px 14px", width: "fit-content" }}
              >
                Save Video Control
              </button>
              <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 800 }}>{videoChunkStatus}</div>
            </div>
          </section>
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>USER INFORMATION</h2>
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
            {!onlineUserInfo.loading && !onlineUserInfo.householdDetails.length && (
              <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 14, fontWeight: 900 }}>No users are currently connected.</div>
            )}
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {onlineUserInfo.householdDetails.map(household => (
                <div key={household.ip} style={{ border: "1px solid rgba(96,165,250,.35)", background: "rgba(2,6,23,.7)", padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={controlLabelStyle}>HOUSEHOLD IP</div>
                      <div style={{ fontSize: 16, fontWeight: 1000, color: "#f8fafc" }}>{household.ip || "unknown"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={controlLabelStyle}>USER DEVICES CONNECTED</div>
                      <div style={{ fontSize: 18, fontWeight: 1000, color: "#67e8f9" }}>{household.deviceCount || 0}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {(household.devices || []).map(device => (
                      <div key={device.deviceId} style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 8, display: "grid", gap: 4 }}>
                        <div style={{ color: "#dbeafe", fontSize: 13, fontWeight: 1000, overflowWrap: "anywhere" }}>Device ID: {device.deviceId || "unknown"}</div>
                        <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>Location From Weather Check: {formatWeatherLocation(device.weatherLocation)}</div>
                        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800, overflowWrap: "anywhere" }}>Weather Permission: {device.weatherStatus || "unknown"}</div>
                        <div style={{ color: "#64748b", fontSize: 10, fontWeight: 800, overflowWrap: "anywhere" }}>Device Browser: {device.userAgent || "unknown"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
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
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, padding: "7px 12px",
          color: "#F7F5F2", cursor: "pointer", fontSize: 13,
          fontFamily: "system-ui", transition: "background 0.15s",
          maxWidth: 200,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: active?.color || "#A8D5A2", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
          {active?.name || "Select project"}
        </span>
        <span style={{ color: "#888", fontSize: 10, marginLeft: 2 }}>{open ? "^" : "v"}</span>
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

export default function App() {
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
  const weekDates = getWeekDates(weekOffset);

  useEffect(() => { saveData(entries); }, [entries]);
  useEffect(() => { saveRates(projectRates); }, [projectRates]);
  useEffect(() => { saveMonthlyTrackerMonths(monthlyTrackerMonths); }, [monthlyTrackerMonths]);
  useEffect(() => { saveProjects(projects); }, [projects]);
  useEffect(() => { saveThemeId(themeId); }, [themeId]);
  useEffect(() => { saveCustomBackground(customBackground); }, [customBackground]);
  useEffect(() => { saveMusicSettings(musicSettings); }, [musicSettings]);
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
    fontSize: 11, color: vibrantLabelColor, letterSpacing: 1.1, textTransform: "uppercase",
    fontFamily: "system-ui", fontWeight: 900, textShadow: readableTextShadow
  };
  const vibrantSmallStyle = {
    fontSize: 11, color: vibrantMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow
  };
  const statValueStyle = {
    fontSize: 24, fontWeight: 900, color: statValueColor, marginTop: 2, fontFamily: "Georgia, serif", textShadow: readableTextShadow
  };
  const miniStatValueStyle = {
    fontSize: 18, fontWeight: 900, color: statValueColor, marginTop: 2, fontFamily: "Georgia, serif", textShadow: readableTextShadow
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

  if (view === "creditHub") {
    return <CreditHubPage onClose={() => setView("week")} />;
  }

  
  if (view === "admin") {
    return <AdminPage onClose={() => setView("week")} />;
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
    cryptoNfts: "CRYPTO + NFTS",
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

          <button
            onClick={() => setView("creditHub")}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 16,
              padding: "10px 12px",
              marginBottom: 12,
              background: "linear-gradient(135deg,#22c55e,#38bdf8)",
              color: "#04111d",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 1000,
              letterSpacing: 1,
              textTransform: "uppercase",
              boxShadow: "0 8px 22px rgba(34,197,94,.3)"
            }}
          >
            CREDIT HUB
          </button>
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
    <div style={{ minHeight: "100vh", background: "#000", position: "relative" }}>
      <style>{`
        @media (max-width: 1180px) { .flive-main-coins-ticker { display: none !important; } }
        @keyframes flive-main-coins-ticker-scroll {
          0% { transform: translateX(calc(100vw - 700px)); }
          100% { transform: translateX(0); }
        }
      `}</style>
      {view === "week" && <PokemonSidebar />}
      {view === "week" && (
        <div className="flive-main-coins-ticker" style={{
          position: "fixed",
          left: "calc(50% - 240px)",
          right: 390,
          top: 246,
          zIndex: 3,
          height: 34,
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
            fontSize: 18,
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
            { label: "ADMIN", nextView: "admin", top: 24 },
            { label: "GAMBLING", nextView: "gambling", top: 64 },
            { label: "CRYPTO + NFTS", nextView: "cryptoNfts", top: 104 },
            { label: "NEWS", nextView: "news", top: 144 },
            { label: "DISCOUNTS", nextView: "discounts", top: 184 },
            { label: "AVAILABLE RESIDENCE", nextView: "availableResidence", top: 224 },
            { label: "EMERGENCY PLANNING!", nextView: "emergencyPlanning", top: 264 },
            { label: "FAMILY HUB", nextView: "familyHub", top: 304 },
            { label: "PROGRAMMING", nextView: "programming", top: 344 },
            { label: "HOUSING + LAND FOR SALE", nextView: "housingLandForSale", top: 384 },
            { label: "RADIO + COMMUNICATION", nextView: "radioCommunication", top: 424 },
            { label: "JOBS BOARD", nextView: "jobsBoard", top: 464 },
            { label: "SPIRITUALISM", nextView: "spiritualism", top: 504 },
            { label: "SCIENCE", nextView: "science", top: 544 },
            { label: "USER REQUEST & UPLOADS", nextView: "userRequestsUploads", top: 584 },
            { label: "ITEMS / SERVICES FOR SALE", nextView: "itemsServicesForSale", top: 624 },
            { label: "FOOD AND COOKING", nextView: "foodCooking", top: 664 },
            { label: "DISPATCHING", nextView: "dispatching", top: 704 },
            { label: "SYSTEM UPGRADES", nextView: "systemUpgrades", top: 744 },
            { label: "CARD + COIN COLLECTING", nextView: "cardCoinCollecting", top: 784 },
            { label: "EXIT THE MATRIX", nextView: "exitMatrix", top: 814 }
          ].map(link => (
            <div key={link.nextView || link.label}>
              <button
                onClick={() => link.nextView ? setView(link.nextView) : window.open(link.href, "_blank", "noopener,noreferrer")}
                style={{
                  position: "fixed",
                  top: link.top,
                  left: 430,
                  zIndex: 20,
                  width: 430,
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontSize: link.label.length > 18 ? 17 : 22,
                  fontWeight: 1000,
                  lineHeight: 1.05,
                  letterSpacing: .6,
                  textTransform: "uppercase",
                  textShadow: "0 2px 10px rgba(56,189,248,.45)",
                  fontFamily: "system-ui",
                  textAlign: "left"
                }}
              >
                {link.label}
              </button>
            </div>
          ))}
          <div style={{
            position: "fixed",
            top: 846,
            left: 470,
            zIndex: 20,
            width: 430,
            color: "#22c55e",
            textShadow: "0 2px 10px rgba(34,197,94,.45)",
            fontFamily: "system-ui",
            textTransform: "uppercase"
          }}>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: .6, lineHeight: 1.05 }}>
              FUITS WEALTH
            </div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: .6, lineHeight: 1.05, marginTop: 4 }}>
              0 FUIT COINS
            </div>
          </div>
        </>
      )}
      {view === "week" && <MusicLibrarySidebar accentColor={accentColor} />}
      <div style={{ minHeight: "100vh", background: pageBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", fontFamily: theme.font, maxWidth: 480, margin: "0 auto", color: appTextColor, transition: "background 0.25s ease, color 0.25s ease", position: "relative", zIndex: 5 }}>
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
      <div style={{ background: theme.headerBg, color: theme.headerText, padding: "52px 24px 16px", position: "sticky", top: 0, zIndex: 10, ...glassStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <ProjectDropdown
            projects={projects}
            activeId={activeProjectId}
            onSelect={setActiveProjectId}
            onManage={() => setView("projects")}
          />
          <button
            onClick={() => setView(view === "settings" ? "week" : "settings")}
            style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, textShadow: readableTextShadow }}
          >
            {view === "settings" ? "X" : "Settings"}
          </button>
        </div>
        {view === "week" && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "-4px 0 10px" }}>
              <button
                onClick={toggleMusic}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "9px 16px",
                  borderRadius: 999,
                  border: `2px solid ${accentColor}`,
                  background: isMusicPlaying ? accentColor : "rgba(0,0,0,0.35)",
                  color: isMusicPlaying ? "#111827" : headerLabelColor,
                  boxShadow: isMusicPlaying ? `0 0 18px ${accentColor}77` : theme.shadow,
                  cursor: "pointer",
                  fontSize: 13,
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
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "-6px 0 14px" }}>
              <img
                src={`${process.env.PUBLIC_URL}/fury-dispatch-logo.png`}
                alt="Fuit Music"
                style={{
                  width: "100%",
                  maxWidth: 370,
                  maxHeight: 150,
                  objectFit: "contain",
                  display: "block",
                  filter: isDarkTheme || theme.id === "custom" ? "drop-shadow(0 10px 22px rgba(0,0,0,0.75))" : "drop-shadow(0 8px 18px rgba(0,0,0,0.28))"
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, padding: "4px 8px" }}>{"<"}</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, color: headerLabelColor, fontFamily: "system-ui", fontWeight: 900, textShadow: readableTextShadow }}>
                  {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)}w ${weekOffset < 0 ? "ago" : "ahead"}`}
                </div>
                <div style={{ fontSize: 12, color: headerMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow }}>
                  {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
                </div>
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, padding: "4px 8px" }}>{">"}</button>
            </div>
            <div style={{ marginTop: 14, background: theme.statsBg, borderRadius: 12, padding: "14px 16px", boxShadow: theme.shadow, border: `1px solid ${theme.line}`, ...glassStyle }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
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
                marginTop: 14,
                paddingTop: 12,
                borderTop: `2px solid ${theme.line}`,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
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
