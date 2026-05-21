import { useState, useEffect, useRef, useMemo } from "react";
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
    id: "ice", name: "Ice", emoji: "❄️",
    appBg: "linear-gradient(180deg, #EFF7FF 0%, #FFFFFF 100%)", headerBg: "#EAF4FF", statsBg: "rgba(255,255,255,0.9)", cardBg: "rgba(255,255,255,0.95)", modalBg: "#F7FBFF", text: "#172033", headerText: "#172033", muted: "#6B7280", line: "rgba(23,32,51,0.12)", buttonBg: "#172033", buttonText: "#FFFFFF", shadow: "0 8px 24px rgba(50,85,120,0.12)", font: "Georgia, serif"
  },
  construction: {
    id: "construction", name: "Construction", emoji: "Work",
    appBg: "linear-gradient(180deg, #2A241D 0%, #403323 100%)", headerBg: "#1F1A14", statsBg: "#2E261B", cardBg: "#FFF4D6", modalBg: "#FFF4D6", text: "#251A0D", headerText: "#FFE4A3", muted: "#9B7A47", line: "rgba(255,196,84,0.35)", buttonBg: "#FFC145", buttonText: "#1F1A14", shadow: "0 8px 24px rgba(0,0,0,0.25)", font: "Georgia, serif"
  },
  cyber: {
    id: "cyber", name: "Cyber", emoji: "⚡",
    appBg: "radial-gradient(circle at top, #22234B 0%, #090A12 58%, #050509 100%)", headerBg: "rgba(5,5,12,0.96)", statsBg: "rgba(22,20,45,0.94)", cardBg: "rgba(15,16,35,0.92)", modalBg: "#0B0C1A", text: "#ECFEFF", headerText: "#ECFEFF", muted: "#8B9BB4", line: "rgba(103,232,249,0.2)", buttonBg: "#67E8F9", buttonText: "#060712", shadow: "0 0 28px rgba(103,232,249,0.12)", font: "Georgia, serif"
  },
  classic: {
    id: "classic", name: "Classic", emoji: "Book",
    appBg: "#F7F5F2", headerBg: "#1C1C1E", statsBg: "#FFFFFF", cardBg: "#FFFFFF", modalBg: "#F7F5F2", text: "#1C1C1E", headerText: "#F7F5F2", muted: "#4B5563", line: "rgba(0,0,0,0.12)", buttonBg: "#1C1C1E", buttonText: "#F7F5F2", shadow: "0 2px 10px rgba(0,0,0,0.10)", font: "Georgia, serif"
  },
  oled: {
    id: "oled", name: "OLED Black", emoji: "⬛",
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
          width: compact ? 74 : 92,
          height: compact ? 98 : 126,
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
        width: compact ? 66 : 92,
        height: compact ? 88 : 126,
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

function PokemonSidebar() {
  const fuitsLiveTvChannelUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const [games, setGames] = useState([]);
  const [activeSystem, setActiveSystem] = useState("GB");
  const [activeGame, setActiveGame] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedArt, setSelectedArt] = useState("cover");
  const [zoomedCover, setZoomedCover] = useState(null);
  const [activeGameAssets, setActiveGameAssets] = useState({ manualUrl: "", backUrl: "" });
  const [gameLaunch, setGameLaunch] = useState(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState(0);
  const [stretchGame, setStretchGame] = useState(false);
  const [gameFullscreen, setGameFullscreen] = useState(false);
  const emulatorFrameRef = useRef(null);
  const emulatorHostRef = useRef(null);
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
  const activeGameIndex = activeGame ? Math.max(0, systemGames.findIndex(game => game.file === activeGame.file)) : 0;
  const backgroundImage = SYSTEM_BACKGROUNDS[activeSystem] || SYSTEM_BACKGROUNDS.GB;

  useEffect(() => {
    let cancelled = false;
    const loadGames = async () => {
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
          setGames(merged);
          setActiveGame(current => {
            const currentStillExists = current && merged.find(game => game.file === current.file && game.system === current.system);
            if (currentStillExists) return currentStillExists;
            return merged.find(game => game.system === activeSystem) || merged[0] || current;
          });
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
    if (!systemGames.length) return;
    const nextIndex = (activeGameIndex + direction + systemGames.length) % systemGames.length;
    stopRunningGame();
    setActiveGame(systemGames[nextIndex]);
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
    <aside className="pokemon-desktop-sidebar" style={{
      position: "fixed",
      left: 18,
      top: 18,
      bottom: 18,
      width: collapsed ? 72 : 390,
      zIndex: 4,
      borderRadius: 24,
      border: "2px solid rgba(255,255,255,0.22)",
      background: `linear-gradient(rgba(2,6,23,0.62), rgba(2,6,23,0.82)), url(${process.env.PUBLIC_URL}/${backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
      padding: collapsed ? 12 : 16,
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      transition: "width .25s ease, padding .25s ease",
      overflow: "hidden"
    }}>
      <style>{`
        @media (max-width: 1180px) { .pokemon-desktop-sidebar { display: none !important; } }
        .pokemon-desktop-sidebar button:hover { transform: translateY(-1px); }
        .game-cover-carousel::-webkit-scrollbar { height: 6px; }
        .game-cover-carousel::-webkit-scrollbar-thumb { background: rgba(250,204,21,.55); border-radius: 999px; }
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
      <button onClick={() => setCollapsed(false)} style={{
        width: "100%",
        border: "none",
        borderRadius: 16,
        padding: collapsed ? "12px 0" : "10px 12px",
        background: "linear-gradient(135deg, #ef4444, #f97316)",
        color: "white",
        fontWeight: 900,
        letterSpacing: 1,
        cursor: "pointer",
        boxShadow: "0 8px 22px rgba(239,68,68,.35)",
        marginBottom: 12
      }}>
        {collapsed ? "Game" : "FUIT GAMING CENTER"}
      </button>

      {!collapsed && (
        <>
          <div style={{
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(51,65,85,.92), rgba(15,23,42,.96))",
            padding: 12,
            border: "2px solid rgba(248,250,252,.38)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.38)"
          }}>
            <div ref={emulatorFrameRef} className="pokemon-emulator-frame" tabIndex={0} style={{
              width: "100%",
              aspectRatio: "4 / 3",
              minHeight: 245,
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

          <div style={{ marginTop: 12 }}>
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
            marginTop: 12,
            padding: 10,
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
              marginBottom: 10
            }}>
              <button onClick={() => moveCarousel(-1)} style={{
                width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: 22, fontWeight: 900
              }}>‹</button>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: "#facc15", textTransform: "uppercase" }}>
                  {activeSystem} Game Carousel
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {activeGameIndex + 1} / {systemGames.length}
                </div>
              </div>
              <button onClick={() => moveCarousel(1)} style={{
                width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(2,6,23,.9)", color: "#fff", cursor: "pointer", fontSize: 22, fontWeight: 900
              }}>›</button>
            </div>

            <div className="game-cover-carousel" style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              paddingBottom: 4
            }}>
              {systemGames.length === 0 && (
                <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 900, padding: 12 }}>
                  No {activeSystem} games found yet.
                </div>
              )}
              {systemGames.map(game => {
                const selected = activeGame && game.file === activeGame.file;
                const discCount = game.discUrls?.length || 0;
                return (
                  <button key={game.file} onClick={() => chooseCarouselGame(game)} style={{
                    minWidth: 96,
                    maxWidth: 96,
                    scrollSnapAlign: "center",
                    border: selected ? "2px solid #facc15" : "1px solid rgba(255,255,255,.18)",
                    borderRadius: 14,
                    padding: 7,
                    background: selected ? "rgba(250,204,21,.18)" : "rgba(2,6,23,.72)",
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: selected ? "0 0 18px rgba(250,204,21,.32)" : "0 8px 18px rgba(0,0,0,.22)",
                    transform: selected ? "translateY(-1px) scale(1.01)" : "none",
                    transition: "transform .18s ease, box-shadow .18s ease, border .18s ease",
                    textAlign: "center"
                  }}>
                    <div style={{ pointerEvents: "none", display: "flex", justifyContent: "center" }}>
                      <PokemonCoverImage game={game} onZoom={() => {}} compact />
                    </div>
                    <div style={{
                      marginTop: 6, fontSize: 9, fontWeight: 900, lineHeight: 1.12,
                      height: 31, overflow: "hidden", color: selected ? "#fff" : "#cbd5e1"
                    }}>
                      {game.label}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 9, fontWeight: 900, color: selected ? "#facc15" : "#94a3b8" }}>
                      {game.system} • {game.year}
                    </div>
                    {discCount > 1 && (
                      <div style={{ marginTop: 4, fontSize: 9, fontWeight: 1000, color: "#38bdf8" }}>
                        {discCount} discs
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{
              marginTop: 10,
              color: "#cbd5e1",
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.3,
              textAlign: "center"
            }}>
              For multi disc games, export save, then start next disc and import.
            </div>
          </div>

          {activeGame && (
          <div style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "92px 1fr",
            gap: 12,
            alignItems: "center",
            padding: 10,
            borderRadius: 16,
            background: "rgba(15,23,42,.88)",
            border: "1px solid rgba(255,255,255,.14)"
          }}>
            <PokemonCoverImage game={activeGame} imageType={selectedArt} onZoom={setZoomedCover} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.25, color: "#fff" }}>{activeGame.label}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", marginTop: 4 }}>{activeGame.system} • {activeGame.year}</div>
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
                  ✕ Close
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
      )}
    </aside>
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

function MusicLibrarySidebar({ accentColor }) {
  const fuitsLiveTvChannelUrl = FUITS_LIVE_TV_PLAYLIST.publicChannelUrl;
  const [musicLibrary, setMusicLibrary] = useState(MUSIC_LIBRARY);
  const [activeGenre, setActiveGenre] = useState("Other");
  const [selectedId, setSelectedId] = useState(musicLibrary[0]?.id || null);
  const [ratings, setRatings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hoursTrackerStaticMusicRatings_v1")) || {}; } catch { return {}; }
  });
  const [musicSearch, setMusicSearch] = useState("");
  const [activeMediaMenu, setActiveMediaMenu] = useState("music");
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [activeMusicView, setActiveMusicView] = useState("library");
  const [musicChannels, setMusicChannels] = useState([]);
  const [liveTvMenuOpen, setLiveTvMenuOpen] = useState(false);
  const [activeLiveTv, setActiveLiveTv] = useState("fuit");
  const [customTvItems, setCustomTvItems] = useState([]);
  const [selectedCustomTvId, setSelectedCustomTvId] = useState(null);
  const [customTvUrl, setCustomTvUrl] = useState("");
  const [owncastOnline, setOwncastOnline] = useState(false);
  const [openMusicSections, setOpenMusicSections] = useState({ videos: false, music: false });
  const [zoomedDonationQr, setZoomedDonationQr] = useState(null);
  const jellyfinFrameRef = useRef(null);
  const adultSwimFrameRef = useRef(null);
  const fuitsLiveTvEmbedUrl = useMemo(() => {
    if (!fuitsLiveTvChannelUrl) return "";
    const separator = fuitsLiveTvChannelUrl.includes("?") ? "&" : "?";
    return `${fuitsLiveTvChannelUrl}${separator}embedReload=${Date.now()}`;
  }, [fuitsLiveTvChannelUrl]);

  useEffect(() => {
    const handleFuitsBlankPage = event => {
      if (event.data?.type !== "FUITS_SITE_BLANKED") return;

      try {
        const bannedUrl = new URL(event.data.url);
        const allowedHost =
          bannedUrl.hostname === "localhost" ||
          bannedUrl.hostname === "127.0.0.1" ||
          bannedUrl.hostname.endsWith(".trycloudflare.com");

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
        const response = await fetch("https://style-infinite-beauty-symantec.trycloudflare.com/api/status", { cache: "no-store" });
        const status = await response.json();
        if (!cancelled) setOwncastOnline(Boolean(status.online));
      } catch {
        if (!cancelled) setOwncastOnline(false);
      }
    };
    checkOwncastStatus();
    const timer = setInterval(checkOwncastStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const filteredVideos = filteredLibrary.filter(item =>
    item.type === "video" || (item.src || "").toLowerCase().endsWith(".mp4")
  );
  const filteredMusic = filteredLibrary.filter(item =>
    item.type === "audio" || (item.src || "").toLowerCase().endsWith(".mp3")
  );
  const liveTvOptions = [
    { id: "fuit", label: "Open Fuit LIVE TV", heading: "SPORTS + CABLE TV", url: "https://thetvapp.to/", embed: false },
    { id: "athf", label: "ADULT SWIM ZONE", heading: "ADULT SWIM ZONE", url: "https://www.adultswim.com/streams/aqua-teen-hunger-force", embed: true },
    { id: "youtube", label: "YOUTUBE", heading: "YOUTUBE", url: "https://www.youtube.com/", embed: false },
    { id: "southpark", label: "SOUTH PARK WORLD", heading: "SOUTH PARK WORLD", url: "https://southpark.cc.com/seasons/south-park", embed: false },
    { id: "jellyfin", label: "FUIT JELLYFIN", heading: "FUIT JELLYFIN", url: "https://leon-intelligence-hostels-copyrighted.trycloudflare.com/web/", embed: true },
    { id: "fattys", label: "FUITS LIVE TV WORLD", heading: "FUITS LIVE TV WORLD", custom: true }
  ];
  const activeLiveTvOption = liveTvOptions.find(option => option.id === activeLiveTv) || liveTvOptions[0];
  const musicViewOptions = [
    { id: "library", label: "Music Library" },
    ...musicChannels.map(channel => ({ id: `music-channel:${channel.id}`, label: channel.label })),
    { id: "radio", label: "FUITS Radio World" }
  ];
  const activeRadioChannelId = activeMusicView.startsWith("radio:") ? activeMusicView.slice("radio:".length) : "";
  const radioIframeSrc = activeRadioChannelId
    ? `${fuitsLiveTvChannelUrl}/fuits-radio?channel=${encodeURIComponent(activeRadioChannelId)}`
    : `${fuitsLiveTvChannelUrl}/fuits-radio`;

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
        .music-library-desktop-sidebar button:hover { transform: translateY(-1px); }
      `}</style>

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
          <span style={{ fontSize: 12, fontWeight: 1000 }}>{mediaMenuOpen ? "▲" : "▼"}</span>
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
          flexDirection: "column"
        }}>
          <div style={{
            padding: "2px 2px 8px",
            borderBottom: "1px solid rgba(148,163,184,.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}>
            <div style={{
              color: "#f8fafc",
              fontSize: 12,
              fontWeight: 1000,
              textTransform: "uppercase",
              letterSpacing: .8
            }}>
              Fuit LIVE TV
            </div>
            {activeLiveTvOption.url && (
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
            )}
          </div>
          <div style={{
            flex: 1,
            padding: "10px 2px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            textAlign: "center",
            gap: 14
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
                <span>{liveTvMenuOpen ? "▲" : "▼"}</span>
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
            {activeLiveTvOption.custom && owncastOnline && (
              <div style={{
                width: "100%",
                borderRadius: 14,
                border: "1px solid rgba(248,113,113,.42)",
                background: "rgba(127,29,29,.22)",
                overflow: "hidden"
              }}>
                <div style={{
                  padding: "9px 11px",
                  color: "#fecaca",
                  fontSize: 12,
                  fontWeight: 1000,
                  textTransform: "uppercase",
                  letterSpacing: .8,
                  borderBottom: "1px solid rgba(248,113,113,.24)"
                }}>
                  Live Announcement On Air
                </div>
                <iframe
                  title="Live Announcement"
                  src="https://exhibits-jimmy-referred-spotlight.trycloudflare.com"
                  allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{
                    width: "100%",
                    minHeight: 360,
                    border: "none",
                    background: "#020617"
                  }}
                />
              </div>
            )}
            {activeLiveTvOption.custom && !owncastOnline && fuitsLiveTvChannelUrl && (
              <iframe
                title={FUITS_LIVE_TV_PLAYLIST.title}
                src={fuitsLiveTvEmbedUrl}
                allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{
                  width: "100%",
                  flex: 1,
                  minHeight: 360,
                  border: "1px solid rgba(148,163,184,.22)",
                  borderRadius: 14,
                  background: "#020617"
                }}
              />
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
                    src="https://wallet-eco-albany-material.trycloudflare.com/chat-only"
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
                    src="https://wallet-eco-albany-material.trycloudflare.com/chat-only"
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
            {openMusicSections.liveTv ? "▲" : "▼"}
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

      <select
        value={activeMusicView}
        onChange={event => setActiveMusicView(event.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,.18)",
          background: "rgba(15,23,42,.72)",
          color: "#f8fafc",
          padding: "9px 11px",
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 1000,
          textTransform: "uppercase"
        }}
      >
        {musicViewOptions.map(option => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>

      {activeMusicView === "radio" || activeMusicView.startsWith("radio:") ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <iframe
            title="FUITS RADIO WORLD"
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
            {selectedTrack.artist || "Unknown Artist"} • {selectedTrack.genre || "Other"}
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
                  ★
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
                {section.items.length} {openMusicSections[section.key] ? "▲" : "▼"}
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
                    {"★".repeat(ratings[item.id] || 0)}{"☆".repeat(5 - (ratings[item.id] || 0))}
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
        <span style={{ color: "#888", fontSize: 10, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
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
              {p.id === activeId && <span style={{ color: "#A8D5A2", fontSize: 11 }}>✓</span>}
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
  const builtInMusicSrc = `${process.env.PUBLIC_URL}/rickroll.mp3`;
  const activeMusicSrc = musicData || builtInMusicSrc;

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
    if (!audio) return;
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

  return (
    <div style={{ minHeight: "100vh", background: "#000", position: "relative" }}>
      {view === "week" && <PokemonSidebar />}
      {view === "week" && <MusicLibrarySidebar accentColor={accentColor} />}
      <div style={{ minHeight: "100vh", background: pageBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", fontFamily: theme.font, maxWidth: 480, margin: "0 auto", color: appTextColor, transition: "background 0.25s ease, color 0.25s ease", position: "relative", zIndex: 5 }}>
      <audio ref={musicRef} src={activeMusicSrc} loop playsInline onPlay={() => setIsMusicPlaying(true)} onPause={() => setIsMusicPlaying(false)} onEnded={() => setIsMusicPlaying(false)} />
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
                ✕ Close
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
            {view === "settings" ? "✕" : "⚙"}
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
                {isMusicPlaying ? "⏸ Pause Soundtrack" : "▶ Play Soundtrack"}
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
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, padding: "4px 8px" }}>‹</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, color: headerLabelColor, fontFamily: "system-ui", fontWeight: 900, textShadow: readableTextShadow }}>
                  {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)}w ${weekOffset < 0 ? "ago" : "ahead"}`}
                </div>
                <div style={{ fontSize: 12, color: headerMutedColor, fontFamily: "system-ui", fontWeight: 800, textShadow: readableTextShadow }}>
                  {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
                </div>
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "none", border: "none", color: headerLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, padding: "4px 8px" }}>›</button>
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
                {activeProject?.name} — Hourly Rate
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
                  {isMusicPlaying ? "⏸ Pause Music" : "▶ Play Music"}
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
              ↓ Export Backup
            </button>
            <input ref={importRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
            <button onClick={() => importRef.current?.click()}
              style={{ width: "100%", padding: "13px", background: "transparent", color: appTextColor, border: `2px solid ${theme.line}`, borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif" }}>
              ↑ Import Backup
            </button>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 10, fontFamily: "system-ui" }}>Export regularly to keep your data safe. Import restores everything — projects, rates, and all entries.</div>
          </div>
        </div>
      )}

      {/* Projects Management View */}
      {view === "projects" && (
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 22, color: "#1C1C1E" }}>Projects</div>
            <button onClick={() => setView("week")} style={{ background: "none", border: "none", color: vibrantLabelColor, cursor: "pointer", fontSize: 22, fontWeight: 900, textShadow: readableTextShadow }}>✕</button>
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
        <div style={{ padding: "12px 16px 100px" }}>
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
                        {to12Hour(e.start)} → {to12Hour(e.end)}
                        {e.breaks && e.breaks.length > 0 && (
                          <span style={{ color: "#aaa", fontSize: 12 }}> − {totalBreakMins(e.breaks)}m break</span>
                        )}
                      </div>
                      {e.splitShift && e.start2 && e.end2 && (
                        <div style={{ fontSize: 12, color: today_ ? "#888" : "#aaa", fontFamily: "system-ui", marginTop: 2 }}>
                          + {to12Hour(e.start2)} → {to12Hour(e.end2)}
                        </div>
                      )}
                      {e.splitShift && (e.extraShifts || []).map((shift, idx) => (
                        shift.start && shift.end ? (
                          <div key={idx} style={{ fontSize: 12, color: today_ ? "#888" : "#aaa", fontFamily: "system-ui", marginTop: 2 }}>
                            + {to12Hour(shift.start)} → {to12Hour(shift.end)}
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
              <span style={{ fontSize: 16, lineHeight: 1 }}>{form.splitShift ? "−" : "+"}</span>
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
