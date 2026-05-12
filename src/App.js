import { useState, useEffect, useRef } from "react";

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
    id: "midnight", name: "Midnight", emoji: "🌙",
    appBg: "linear-gradient(180deg, #0F1117 0%, #1A1D29 100%)", headerBg: "rgba(12,14,20,0.96)", statsBg: "rgba(34,38,52,0.92)", cardBg: "rgba(255,255,255,0.08)", modalBg: "#151822", text: "#F7F5F2", headerText: "#F7F5F2", muted: "#9CA3AF", line: "rgba(255,255,255,0.12)", buttonBg: "#F7F5F2", buttonText: "#111827", shadow: "0 8px 30px rgba(0,0,0,0.25)", font: "Georgia, serif"
  },
  ice: {
    id: "ice", name: "Ice", emoji: "❄️",
    appBg: "linear-gradient(180deg, #EFF7FF 0%, #FFFFFF 100%)", headerBg: "#EAF4FF", statsBg: "rgba(255,255,255,0.9)", cardBg: "rgba(255,255,255,0.95)", modalBg: "#F7FBFF", text: "#172033", headerText: "#172033", muted: "#6B7280", line: "rgba(23,32,51,0.12)", buttonBg: "#172033", buttonText: "#FFFFFF", shadow: "0 8px 24px rgba(50,85,120,0.12)", font: "Georgia, serif"
  },
  construction: {
    id: "construction", name: "Construction", emoji: "🚧",
    appBg: "linear-gradient(180deg, #2A241D 0%, #403323 100%)", headerBg: "#1F1A14", statsBg: "#2E261B", cardBg: "#FFF4D6", modalBg: "#FFF4D6", text: "#251A0D", headerText: "#FFE4A3", muted: "#9B7A47", line: "rgba(255,196,84,0.35)", buttonBg: "#FFC145", buttonText: "#1F1A14", shadow: "0 8px 24px rgba(0,0,0,0.25)", font: "Georgia, serif"
  },
  cyber: {
    id: "cyber", name: "Cyber", emoji: "⚡",
    appBg: "radial-gradient(circle at top, #22234B 0%, #090A12 58%, #050509 100%)", headerBg: "rgba(5,5,12,0.96)", statsBg: "rgba(22,20,45,0.94)", cardBg: "rgba(15,16,35,0.92)", modalBg: "#0B0C1A", text: "#ECFEFF", headerText: "#ECFEFF", muted: "#8B9BB4", line: "rgba(103,232,249,0.2)", buttonBg: "#67E8F9", buttonText: "#060712", shadow: "0 0 28px rgba(103,232,249,0.12)", font: "Georgia, serif"
  },
  classic: {
    id: "classic", name: "Classic", emoji: "📓",
    appBg: "#F7F5F2", headerBg: "#1C1C1E", statsBg: "#FFFFFF", cardBg: "#FFFFFF", modalBg: "#F7F5F2", text: "#1C1C1E", headerText: "#F7F5F2", muted: "#4B5563", line: "rgba(0,0,0,0.12)", buttonBg: "#1C1C1E", buttonText: "#F7F5F2", shadow: "0 2px 10px rgba(0,0,0,0.10)", font: "Georgia, serif"
  },
  oled: {
    id: "oled", name: "OLED Black", emoji: "⬛",
    appBg: "#000000", headerBg: "#000000", statsBg: "#0A0A0A", cardBg: "#111111", modalBg: "#050505", text: "#FFFFFF", headerText: "#FFFFFF", muted: "#8A8A8A", line: "rgba(255,255,255,0.12)", buttonBg: "#FFFFFF", buttonText: "#000000", shadow: "0 0 0 1px rgba(255,255,255,0.08)", font: "Georgia, serif"
  },
  custom: {
    id: "custom", name: "Custom", emoji: "🖼️",
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


const POKEMON_SYSTEMS = {
  gb: {
    label: "Game Boy",
    shortLabel: "GB",
    core: "gb",
    background: `${process.env.PUBLIC_URL}/sidequest-gb.png`,
    accent: "#9ca66b",
  },
  gbc: {
    label: "Game Boy Color",
    shortLabel: "GBC",
    core: "gb",
    background: `${process.env.PUBLIC_URL}/sidequest-gbc.png`,
    accent: "#facc15",
  },
  gba: {
    label: "Game Boy Advance",
    shortLabel: "GBA",
    core: "gba",
    background: `${process.env.PUBLIC_URL}/sidequest-gba.png`,
    accent: "#a78bfa",
  },
};

const POKEMON_ROMS = [
  { label: "Red", system: "gb", year: 1998, image: "pokemon-red-card.png", file: "Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb" },
  { label: "Blue", system: "gb", year: 1998, image: "pokemon-blue-card.png", file: "Pokemon - Blue Version (USA, Europe) (SGB Enhanced).gb" },
  { label: "Yellow", system: "gb", year: 1999, image: "pokemon-yellow-card.png", file: "Pokemon - Yellow Version - Special Pikachu Edition (USA, Europe) (CGB+SGB Enhanced).gb" },
  { label: "Gold", system: "gbc", year: 2000, image: "pokemon-gold-card.png", file: "Pokemon - Gold Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Silver", system: "gbc", year: 2000, image: "pokemon-silver-card.png", file: "Pokemon - Silver Version (USA, Europe) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Crystal", system: "gbc", year: 2001, image: "pokemon-crystal-card.png", file: "Pokemon - Crystal Version (USA, Europe) (Rev 1).gbc" },
  { label: "TCG", system: "gbc", year: 2000, image: "pokemon-tcg-card.png", file: "Pokemon Trading Card Game (USA, Australia) (SGB Enhanced) (GB Compatible).gbc" },
  { label: "Puzzle", system: "gbc", year: 2000, image: "pokemon-puzzle-card.png", file: "Pokemon Puzzle Challenge (USA, Australia).gbc" },
  { label: "FireRed", system: "gba", year: 2004, image: "pokemon-firered-card.png", file: "Pokemon - FireRed Version (USA, Europe) (Rev 1).gba" },
  { label: "LeafGreen", system: "gba", year: 2004, image: "pokemon-leafgreen-card.png", file: "Pokemon - LeafGreen Version (USA, Europe) (Rev 1).gba" },
  { label: "Emerald", system: "gba", year: 2005, image: "pokemon-emerald-card.png", file: "Pokemon - Emerald Version (USA, Europe).gba" },
  { label: "Ruby", system: "gba", year: 2003, image: "pokemon-ruby-card.png", file: "Pokemon - Ruby Version (USA, Europe) (Rev 2).gba" },
  { label: "Sapphire", system: "gba", year: 2003, image: "pokemon-sapphire-card.png", file: "Pokemon - Sapphire Version (USA, Europe) (Rev 2).gba" },
  { label: "Pinball", system: "gba", year: 2003, image: "pokemon-pinball-card.png", file: "Pokemon Pinball - Ruby & Sapphire (USA).gba" },
  { label: "Red Rescue", system: "gba", year: 2006, image: "pokemon-red-rescue-card.png", file: "Pokemon Mystery Dungeon - Red Rescue Team (USA, Australia).gba" },
];


function GameImageDropdown({ games, activeGame, onSelect, systemTheme }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: "relative", marginTop: 12, zIndex: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 10,
          borderRadius: 16,
          border: `2px solid ${systemTheme.accent}99`,
          background: "rgba(2,6,23,.94)",
          color: "#f8fafc",
          cursor: "pointer",
          boxShadow: `0 8px 24px rgba(0,0,0,.42), 0 0 16px ${systemTheme.accent}44`,
        }}
      >
        <img
          src={`${process.env.PUBLIC_URL}/rom-images/${activeGame.image}`}
          alt=""
          style={{
            width: 58,
            height: 42,
            objectFit: "cover",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.24)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Pokémon {activeGame.label}
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 850, marginTop: 2 }}>
            {activeGame.year} • {systemTheme.shortLabel}
          </div>
        </div>
        <span style={{
          color: "#111827",
          background: systemTheme.accent,
          borderRadius: 999,
          padding: "5px 9px",
          fontWeight: 950,
          fontSize: 12,
          flexShrink: 0,
        }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "calc(100% + 8px)",
          maxHeight: 300,
          overflowY: "auto",
          borderRadius: 18,
          border: `2px solid ${systemTheme.accent}99`,
          background: "rgba(2,6,23,.98)",
          boxShadow: "0 18px 42px rgba(0,0,0,.70)",
          padding: 8,
        }}>
          {games.map(game => {
            const selected = game.file === activeGame.file;
            return (
              <button
                key={game.file}
                onClick={() => { onSelect(game); setOpen(false); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 8,
                  marginBottom: 6,
                  borderRadius: 14,
                  border: selected ? `2px solid ${systemTheme.accent}` : "1px solid rgba(255,255,255,.12)",
                  background: selected ? `linear-gradient(135deg, ${systemTheme.accent}55, rgba(15,23,42,.96))` : "rgba(15,23,42,.78)",
                  color: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: selected ? `0 0 14px ${systemTheme.accent}44` : "none",
                }}
              >
                <img
                  src={`${process.env.PUBLIC_URL}/rom-images/${game.image}`}
                  alt=""
                  style={{
                    width: 60,
                    height: 44,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.22)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Pokémon {game.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 850, marginTop: 2 }}>
                    {game.year}
                  </div>
                </div>
                {selected && <span style={{ color: systemTheme.accent, fontWeight: 950 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function PokemonSidebar() {
  const [selectedSystem, setSelectedSystem] = useState("gb");
  const [activeGame, setActiveGame] = useState(POKEMON_ROMS[0]);
  const [collapsed, setCollapsed] = useState(false);
  const playerRef = useRef(null);

  const systemTheme = POKEMON_SYSTEMS[selectedSystem] || POKEMON_SYSTEMS.gb;
  const gamesForSystem = POKEMON_ROMS.filter(game => game.system === selectedSystem);

  const chooseSystem = (systemId) => {
    const firstGame = POKEMON_ROMS.find(game => game.system === systemId) || POKEMON_ROMS[0];
    setSelectedSystem(systemId);
    setActiveGame(firstGame);
  };

  useEffect(() => {
    if (collapsed || !playerRef.current) return;

    playerRef.current.innerHTML = "";
    const mount = document.createElement("div");
    mount.id = "pokemon-game-player";
    mount.style.width = "100%";
    mount.style.height = "100%";
    playerRef.current.appendChild(mount);

    const activeSystem = POKEMON_SYSTEMS[activeGame.system] || POKEMON_SYSTEMS.gb;
    window.EJS_player = "#pokemon-game-player";
    window.EJS_core = activeSystem.core;
    window.EJS_gameName = activeGame.label;
    window.EJS_gameUrl = `${process.env.PUBLIC_URL}/roms/${encodeURIComponent(activeGame.file)}`;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = false;
    window.EJS_backgroundColor = "#020617";
    window.EJS_color = activeSystem.accent;

    const script = document.createElement("script");
    script.src = `https://cdn.emulatorjs.org/stable/data/loader.js?v=${Date.now()}`;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      if (playerRef.current) playerRef.current.innerHTML = "";
    };
  }, [activeGame, collapsed]);

  return (
    <aside className="pokemon-desktop-sidebar" style={{
      position: "fixed",
      left: 18,
      top: 18,
      bottom: 18,
      width: collapsed ? 72 : 380,
      zIndex: 4,
      borderRadius: 26,
      border: "2px solid rgba(255,255,255,0.22)",
      background: `linear-gradient(rgba(2,6,23,0.38), rgba(2,6,23,0.82)), url(${systemTheme.background})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      boxShadow: `0 18px 60px rgba(0,0,0,0.60), 0 0 26px ${systemTheme.accent}55`,
      padding: collapsed ? 12 : 16,
      color: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
      transition: "width .25s ease, padding .25s ease, box-shadow .25s ease, background .25s ease",
      overflow: "hidden"
    }}>
      <style>{`
        @media (max-width: 1180px) { .pokemon-desktop-sidebar { display: none !important; } }
        .pokemon-desktop-sidebar button:hover { transform: translateY(-1px); }
      `}</style>
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(circle at top, rgba(255,255,255,0.10), transparent 36%), linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,.08), rgba(0,0,0,.35))",
        pointerEvents: "none"
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <button onClick={() => setCollapsed(c => !c)} style={{
          width: "100%",
          border: "none",
          borderRadius: 18,
          padding: collapsed ? "12px 0" : "11px 12px",
          background: `linear-gradient(135deg, ${systemTheme.accent}, #111827)`,
          color: "white",
          fontWeight: 950,
          letterSpacing: 1,
          cursor: "pointer",
          boxShadow: `0 8px 24px ${systemTheme.accent}55`,
          marginBottom: 12,
          textShadow: "0 2px 5px rgba(0,0,0,.55)",
        }}>
          {collapsed ? "🎮" : `🎮 ${systemTheme.label} Side Quest`}
        </button>

        {!collapsed && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 12,
            }}>
              {Object.entries(POKEMON_SYSTEMS).map(([systemId, system]) => (
                <button key={systemId} onClick={() => chooseSystem(systemId)} style={{
                  border: selectedSystem === systemId ? `2px solid ${system.accent}` : "1px solid rgba(255,255,255,.22)",
                  background: selectedSystem === systemId ? `linear-gradient(135deg, ${system.accent}, rgba(15,23,42,.92))` : "rgba(15,23,42,.74)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "9px 6px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 950,
                  boxShadow: selectedSystem === systemId ? `0 0 18px ${system.accent}66` : "none",
                }}>
                  {system.shortLabel}
                </button>
              ))}
            </div>

            <div style={{
              borderRadius: 24,
              background: "linear-gradient(180deg, rgba(15,23,42,.94), rgba(2,6,23,.96))",
              padding: 12,
              border: `2px solid ${systemTheme.accent}88`,
              boxShadow: `inset 0 0 30px rgba(0,0,0,.6), 0 0 28px ${systemTheme.accent}44`,
              backdropFilter: "blur(6px)",
            }}>
              <div ref={playerRef} style={{
                width: "100%",
                aspectRatio: "4 / 3",
                minHeight: 245,
                borderRadius: 16,
                overflow: "hidden",
                background: "#020617",
                border: "5px solid #020617",
                boxShadow: "0 10px 28px rgba(0,0,0,.65)"
              }} />
            </div>

            <div style={{
              marginTop: 12,
              borderRadius: 18,
              overflow: "hidden",
              border: `2px solid ${systemTheme.accent}99`,
              background: "rgba(2,6,23,.88)",
              boxShadow: `0 12px 28px rgba(0,0,0,.46), 0 0 18px ${systemTheme.accent}44`,
            }}>
              <img
                src={`${process.env.PUBLIC_URL}/rom-images/${activeGame.image}`}
                alt={`${activeGame.label} ${activeGame.year}`}
                style={{
                  width: "100%",
                  height: 112,
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
              }}>
                <div style={{
                  color: "#ffffff",
                  fontWeight: 950,
                  fontSize: 14,
                  letterSpacing: .4,
                  textShadow: "0 2px 6px rgba(0,0,0,.9)",
                }}>
                  Pokémon {activeGame.label}
                </div>
                <div style={{
                  color: "#111827",
                  background: systemTheme.accent,
                  borderRadius: 999,
                  padding: "5px 10px",
                  fontWeight: 950,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  boxShadow: `0 0 14px ${systemTheme.accent}77`,
                }}>
                  {activeGame.year}
                </div>
              </div>
            </div>

            <GameImageDropdown
              games={gamesForSystem}
              activeGame={activeGame}
              onSelect={setActiveGame}
              systemTheme={systemTheme}
            />

            <div style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              background: "rgba(2,6,23,.78)",
              border: "1px solid rgba(255,255,255,.16)",
              color: "#e5e7eb",
              fontSize: 12,
              lineHeight: 1.45,
              fontWeight: 800,
              textShadow: "0 2px 4px rgba(0,0,0,.9)",
            }}>
              Pick GB, GBC, or GBA. The trim background changes to match the selected system.
            </div>
          </>
        )}
      </div>
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

    const tryPlay = async () => {
      try {
        audio.muted = false;
        await audio.play();
        setIsMusicPlaying(true);
        setMusicNeedsTap(false);
        setMusicNeedsTap(false);
        return true;
      } catch {
        setIsMusicPlaying(false);
        setMusicNeedsTap(true);
        return false;
      }
    };

    tryPlay();

    const unlockAudio = async () => {
      if (!audio.paused) return;
      const didPlay = await tryPlay();
      if (didPlay) {
        window.removeEventListener("pointerdown", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
      }
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
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
      alert("Tap anywhere on the app once to start the background song.");
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
      <div style={{ minHeight: "100vh", background: pageBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", fontFamily: theme.font, maxWidth: 480, margin: "0 auto", color: appTextColor, transition: "background 0.25s ease, color 0.25s ease", position: "relative", zIndex: 5 }}>
      <audio ref={musicRef} src={activeMusicSrc} loop playsInline onPlay={() => setIsMusicPlaying(true)} onPause={() => setIsMusicPlaying(false)} onEnded={() => setIsMusicPlaying(false)} />
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
                {isMusicPlaying ? "⏸ Pause Soundtrack" : musicNeedsTap ? "▶ Tap Anywhere To Start" : "▶ Play Soundtrack"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "-6px 0 14px" }}>
              <img
                src={`${process.env.PUBLIC_URL}/fury-dispatch-logo.png`}
                alt="Fury Dispatch"
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
              🖼️ Choose Custom Background
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
            <div style={{ fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "system-ui", marginBottom: 14 }}>Background Music</div>
            <input ref={audioFileRef} type="file" accept="audio/*" onChange={handleMusicFile} style={{ display: "none" }} />
            <button onClick={() => audioFileRef.current?.click()}
              style={{ width: "100%", padding: "13px", background: theme.buttonBg, color: theme.buttonText, border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif", marginBottom: 10, fontWeight: 900 }}>
              🎵 Choose Music File
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
                    style={{ background: "none", border: "none", color: "#e05555", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>×</button>
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
