const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.FUITS_TV_PORT || 8099);
const ROOT = "T:\\FattysLiveTV";
const CHANNEL_PLAYLIST_DIR = path.join(ROOT, "Playlists", "FuitsLiveTV");
const DEFAULT_CHANNEL_PLAYLISTS = ["ChannelA.m3u", "ChannelB.m3u", "SMOKING-CHANNEL.m3u"];
const PASSWORD_PATH = path.join(__dirname, "admin-password.txt");
const ACCESS_CONTROL_PATH = path.join(__dirname, "access-control.json");
const FUIT_CREDIT_LEDGER_PATH = path.join(__dirname, "fuit-credit-ledger.json");
const SHUFFLE_PASSWORD = "FOOLIO";
const SITE_BLANK_PATH = path.join(__dirname, "site-blank.json");
const VIDEO_STREAM_SETTINGS_PATH = path.join(__dirname, "video-stream-settings.json");
const DEFAULT_VIDEO_CHUNK_MB = 4;
const MOBILE_SAFARI_VIDEO_CHUNK_MB = 16;
const MIN_VIDEO_CHUNK_MB = 1;
const MAX_VIDEO_CHUNK_MB = 16;
const FALLBACK_DURATION_SECONDS = 30 * 60;
const OWNCAST_LOCAL_URL = "http://localhost:8080";
const START_ALL_SERVICES_BAT = "C:\\Users\\newer\\Desktop\\START-ALL-SERVICES-UPDATE-URLS.bat";
const START_ALL_SERVICES_PS1 = "T:\\FattysLiveTV\\Tools\\Start-AllServicesAndUpdateUrls.ps1";
const CHAT_LOG_PATH = path.join(__dirname, "chat-log.json");
const CHAT_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const CHAT_GIFS_DIR = path.join(ROOT, "ChatGifs");
const DONATION_QR_DIR = path.join(ROOT, "DonationQrs");
const DISCOUNTS_DIR = path.join(__dirname, "discounts");
const GAMES_ROOT = path.join(ROOT, "Games");
const GAME_ROMS_DIR = path.join(GAMES_ROOT, "Roms");
const GAME_IMAGES_DIR = path.join(GAMES_ROOT, "Images");
const GAME_SAVES_DIR = path.join(GAMES_ROOT, "SavedGames");
const GAME_SAVES_INDEX_PATH = path.join(GAME_SAVES_DIR, "saved-games.json");
const MAX_GAME_SAVE_UPLOAD_BYTES = 64 * 1024 * 1024;
const MUSIC_LIBRARY_DIR = path.join(ROOT, "MusicLibrary");
const MUSIC_LIBRARY_MUSIC_DIR = path.join(MUSIC_LIBRARY_DIR, "Music");
const MUSIC_LIBRARY_VIDEOS_DIR = path.join(MUSIC_LIBRARY_DIR, "Videos");
const MUSIC_LIBRARY_CHANNELS_DIR = path.join(MUSIC_LIBRARY_DIR, "Channels");
const VIDEOS_DIR = path.join(ROOT, "Videos");
const DOCS_DIR = path.join(ROOT, "Docs");
const VIDEO_REPAIR_BACKUP_DIR = path.join(ROOT, "RepairBackups", "VideoAudioSync");
const VIDEO_REPAIR_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".mkv", ".avi"]);
const VIDEO_REPAIR_DURATION_THRESHOLD_SECONDS = 1.5;
const VIDEO_REPAIR_START_THRESHOLD_SECONDS = 0.35;
const FFPROBE_CANDIDATES = [
  "C:\\Program Files\\Jellyfin\\Server\\ffprobe.exe",
  "T:\\1MY CODES+PTOGRAMS\\MONEY MAKING\\SOCIAL MEDIA\\yt-dlp\\ffmpeg\\bin\\ffprobe.exe"
];
const FFMPEG_CANDIDATES = [
  "C:\\Program Files\\Jellyfin\\Server\\ffmpeg.exe",
  "T:\\1MY CODES+PTOGRAMS\\MONEY MAKING\\SOCIAL MEDIA\\yt-dlp\\ffmpeg\\bin\\ffmpeg.exe"
];
const RADIO_ROOT = path.join(ROOT, "Radio");
const RADIO_MUSIC_DIR = path.join(RADIO_ROOT, "Music");
const RADIO_PLAYLIST_DIR = path.join(RADIO_ROOT, "Playlists");
const DEFAULT_RADIO_PLAYLISTS = ["ChannelA.m3u", "ChannelB.m3u"];
const ONLINE_STATS_TTL_MS = 15 * 60 * 1000;
const ADULT_RELAX_MAX_PARTICIPANTS = 8;
let owncastBaseUrlCache = null;
let owncastBaseUrlCacheExpiresAt = 0;
const onlineDevices = new Map();
const adultRelaxSignalRooms = new Map();
let latestVideoRepairScan = null;
let activeVideoRepairProcess = null;
let activeVideoRepairDetails = null;
let activeVideoRepairBatch = null;
let videoRepairCancelRequested = false;
const GAME_SYSTEMS = {
  GB: { folder: "GB", core: "gb", extensions: [".gb"] },
  GBC: { folder: "GBC", core: "gb", extensions: [".gbc"] },
  GBA: { folder: "GBA", core: "gba", extensions: [".gba"] },
  N64: { folder: "N64", core: "n64", extensions: [".n64", ".z64", ".v64"] },
  PS1: { folder: "PS1", core: "psx", extensions: [".cue", ".chd", ".pbp", ".m3u"] }
};

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)[0];
  return String(
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    forwardedFor ||
    req.socket.remoteAddress ||
    "unknown"
  ).replace(/^::ffff:/, "");
}

function normalizeAccessValue(type, value) {
  const text = String(value || "").trim();
  if (type === "ip") {
    const ip = text.replace(/^::ffff:/, "");
    if (!net.isIP(ip)) throw new Error("Enter a valid IP address.");
    return ip;
  }
  const device = text.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120);
  if (!device) throw new Error("Enter a valid device ID.");
  return device;
}

function readAccessControl() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ACCESS_CONTROL_PATH, "utf8"));
    return {
      whitelistIps: Array.isArray(parsed.whitelistIps) ? parsed.whitelistIps : [],
      blacklistIps: Array.isArray(parsed.blacklistIps) ? parsed.blacklistIps : [],
      whitelistDevices: Array.isArray(parsed.whitelistDevices) ? parsed.whitelistDevices : [],
      blacklistDevices: Array.isArray(parsed.blacklistDevices) ? parsed.blacklistDevices : []
    };
  } catch {
    return {
      whitelistIps: [],
      blacklistIps: [],
      whitelistDevices: [],
      blacklistDevices: []
    };
  }
}

function writeAccessControl(access) {
  const next = {
    whitelistIps: Array.isArray(access.whitelistIps) ? access.whitelistIps : [],
    blacklistIps: Array.isArray(access.blacklistIps) ? access.blacklistIps : [],
    whitelistDevices: Array.isArray(access.whitelistDevices) ? access.whitelistDevices : [],
    blacklistDevices: Array.isArray(access.blacklistDevices) ? access.blacklistDevices : []
  };
  fs.writeFileSync(ACCESS_CONTROL_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function normalizeFuitCreditUsername(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w .@-]/g, "")
    .slice(0, 80);
}

function getFuitCreditUserKey(username) {
  return normalizeFuitCreditUsername(username).toLowerCase();
}

function normalizeFuitWallet(value) {
  const text = String(value || "").trim();
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  if (!match) throw new Error("Enter a valid 0x wallet address.");
  return match[0];
}

function normalizeFuitTxHash(value) {
  const text = String(value || "").trim();
  const match = text.match(/0x[a-fA-F0-9]{64}/);
  return match ? match[0] : "";
}

function normalizeFuitDepositReference(value) {
  return String(value || "").trim().slice(0, 180);
}

function normalizeFuitAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than 0.");
  }
  return Number(amount.toFixed(6));
}

function createDefaultFuitCreditState() {
  return {
    settings: {
      creditSymbol: "FUIT",
      depositToken: "USDT",
      depositNetwork: "Polygon",
      treasuryWallet: "",
      instructions: "Send USDT on Polygon to the admin wallet. Keep enough POL for the network fee before sending. FUIT Coin is issued only after admin approval."
    },
    wallets: {},
    balances: {},
    deposits: [],
    withdrawalRequests: [],
    ledger: [],
    blacklistedWallets: []
  };
}

function readFuitCreditState() {
  const defaults = createDefaultFuitCreditState();
  try {
    const parsed = JSON.parse(fs.readFileSync(FUIT_CREDIT_LEDGER_PATH, "utf8"));
    return {
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      wallets: parsed.wallets && typeof parsed.wallets === "object" ? parsed.wallets : {},
      balances: parsed.balances && typeof parsed.balances === "object" ? parsed.balances : {},
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
      withdrawalRequests: Array.isArray(parsed.withdrawalRequests) ? parsed.withdrawalRequests : [],
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
      blacklistedWallets: Array.isArray(parsed.blacklistedWallets) ? parsed.blacklistedWallets : []
    };
  } catch {
    return defaults;
  }
}

function writeFuitCreditState(state) {
  const next = {
    ...createDefaultFuitCreditState(),
    ...state,
    settings: { ...createDefaultFuitCreditState().settings, ...(state.settings || {}) },
    deposits: Array.isArray(state.deposits) ? state.deposits : [],
    withdrawalRequests: Array.isArray(state.withdrawalRequests) ? state.withdrawalRequests : [],
    ledger: Array.isArray(state.ledger) ? state.ledger : [],
    blacklistedWallets: Array.isArray(state.blacklistedWallets) ? state.blacklistedWallets : []
  };
  fs.writeFileSync(FUIT_CREDIT_LEDGER_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function isFuitWalletBlacklisted(state, wallet) {
  const normalized = String(wallet || "").toLowerCase();
  return (state.blacklistedWallets || []).some(item => String(item.wallet || "").toLowerCase() === normalized);
}

function getFuitBalanceRecord(state, username, wallet = "") {
  const cleanUsername = normalizeFuitCreditUsername(username);
  const key = getFuitCreditUserKey(cleanUsername);
  if (!key) throw new Error("Username required.");
  const existing = state.balances[key] || {};
  const record = {
    username: existing.username || cleanUsername,
    wallet: wallet || existing.wallet || state.wallets[key]?.wallet || "",
    balance: Number(existing.balance) || 0,
    issuedTotal: Number(existing.issuedTotal) || 0,
    withdrawnTotal: Number(existing.withdrawnTotal) || 0,
    updatedAt: existing.updatedAt || new Date().toISOString()
  };
  state.balances[key] = record;
  return record;
}

function getPublicFuitCreditSummary(payload = {}) {
  const state = readFuitCreditState();
  const username = normalizeFuitCreditUsername(payload.username);
  const key = getFuitCreditUserKey(username);
  const wallet = payload.wallet ? normalizeFuitWallet(payload.wallet) : (state.wallets[key]?.wallet || state.balances[key]?.wallet || "");
  const balance = key ? getFuitBalanceRecord(state, username, wallet) : null;
  const walletLower = String(wallet || "").toLowerCase();
  const deposits = (state.deposits || [])
    .filter(item => (
      (key && getFuitCreditUserKey(item.username) === key) ||
      (walletLower && String(item.wallet || "").toLowerCase() === walletLower)
    ))
    .slice(0, 60);
  const withdrawalRequests = (state.withdrawalRequests || [])
    .filter(item => (
      (key && getFuitCreditUserKey(item.username) === key) ||
      (walletLower && String(item.wallet || "").toLowerCase() === walletLower)
    ))
    .slice(0, 60);
  return {
    ok: true,
    settings: state.settings,
    user: {
      username,
      wallet,
      walletBlacklisted: wallet ? isFuitWalletBlacklisted(state, wallet) : false,
      balance: Number(balance?.balance) || 0,
      issuedTotal: Number(balance?.issuedTotal) || 0,
      withdrawnTotal: Number(balance?.withdrawnTotal) || 0,
      deposits,
      withdrawalRequests
    }
  };
}

function saveFuitCreditWallet(payload = {}) {
  const username = normalizeFuitCreditUsername(payload.username);
  const key = getFuitCreditUserKey(username);
  const wallet = normalizeFuitWallet(payload.wallet);
  if (!key) throw new Error("Username required.");
  const state = readFuitCreditState();
  const now = new Date().toISOString();
  state.wallets[key] = {
    username,
    wallet,
    createdAt: state.wallets[key]?.createdAt || now,
    updatedAt: now
  };
  getFuitBalanceRecord(state, username, wallet).wallet = wallet;
  writeFuitCreditState(state);
  return getPublicFuitCreditSummary({ username, wallet });
}

function submitFuitCreditDeposit(payload = {}) {
  const username = normalizeFuitCreditUsername(payload.username);
  const key = getFuitCreditUserKey(username);
  const wallet = normalizeFuitWallet(payload.wallet);
  const amount = normalizeFuitAmount(payload.amount);
  const txHash = normalizeFuitDepositReference(payload.txHash);
  const duplicateTxHash = normalizeFuitTxHash(txHash);
  if (!key) throw new Error("Username required.");

  const state = readFuitCreditState();
  if (isFuitWalletBlacklisted(state, wallet)) {
    throw new Error("This wallet is blacklisted.");
  }
  if (duplicateTxHash && (state.deposits || []).some(item => normalizeFuitTxHash(item.txHash).toLowerCase() === duplicateTxHash.toLowerCase())) {
    throw new Error("That transaction hash is already submitted.");
  }

  const now = new Date().toISOString();
  state.wallets[key] = {
    username,
    wallet,
    createdAt: state.wallets[key]?.createdAt || now,
    updatedAt: now
  };
  getFuitBalanceRecord(state, username, wallet).wallet = wallet;
  const deposit = {
    id: `deposit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    username,
    wallet,
    amount,
    txHash,
    token: state.settings.depositToken || "USDT",
    network: state.settings.depositNetwork || "Polygon",
    status: "pending",
    note: String(payload.note || "").trim().slice(0, 240),
    createdAt: now
  };
  state.deposits.unshift(deposit);
  writeFuitCreditState(state);
  return { ...getPublicFuitCreditSummary({ username, wallet }), deposit };
}

function submitFuitCreditWithdrawal(payload = {}) {
  const username = normalizeFuitCreditUsername(payload.username);
  const key = getFuitCreditUserKey(username);
  const amount = normalizeFuitAmount(payload.amount);
  if (!key) throw new Error("Username required.");

  const state = readFuitCreditState();
  const wallet = state.wallets[key]?.wallet || state.balances[key]?.wallet || "";
  const balance = getFuitBalanceRecord(state, username, wallet);
  if (amount > Number(balance.balance || 0)) {
    throw new Error("Withdrawal request is more than the available FUIT balance.");
  }

  const now = new Date().toISOString();
  const withdrawalRequest = {
    id: `withdrawal_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    username,
    wallet: balance.wallet || wallet || "",
    amount,
    status: "pending",
    note: String(payload.note || "").trim().slice(0, 240),
    createdAt: now
  };
  state.withdrawalRequests.unshift(withdrawalRequest);
  writeFuitCreditState(state);
  return { ...getPublicFuitCreditSummary({ username, wallet: balance.wallet || wallet || undefined }), withdrawalRequest };
}

function getAdminFuitCreditState() {
  const state = readFuitCreditState();
  const totals = Object.values(state.balances || {}).reduce((acc, item) => ({
    issued: acc.issued + (Number(item.issuedTotal) || 0),
    balance: acc.balance + (Number(item.balance) || 0),
    withdrawn: acc.withdrawn + (Number(item.withdrawnTotal) || 0)
  }), { issued: 0, balance: 0, withdrawn: 0 });
  return {
    ok: true,
    settings: state.settings,
    wallets: state.wallets || {},
    balances: state.balances || {},
    deposits: state.deposits || [],
    withdrawalRequests: state.withdrawalRequests || [],
    ledger: (state.ledger || []).slice(0, 200),
    blacklistedWallets: state.blacklistedWallets || [],
    totals,
    pendingCount: (state.deposits || []).filter(item => item.status === "pending").length,
    pendingWithdrawalCount: (state.withdrawalRequests || []).filter(item => item.status === "pending").length
  };
}

function updateAdminFuitCredits(payload = {}) {
  const state = readFuitCreditState();
  const now = new Date().toISOString();
  const action = String(payload.action || "load");

  if (action === "settings") {
    const treasuryWallet = String(payload.treasuryWallet || "").trim()
      ? normalizeFuitWallet(payload.treasuryWallet)
      : "";
    state.settings = {
      ...state.settings,
      treasuryWallet,
      depositToken: "USDT",
      depositNetwork: "Polygon",
      instructions: String(payload.instructions || state.settings.instructions || "").trim().slice(0, 420)
    };
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "issueDeposit") {
    const deposit = state.deposits.find(item => item.id === payload.depositId);
    if (!deposit) throw new Error("Deposit not found.");
    if (deposit.status === "issued") throw new Error("Deposit already issued.");
    if (isFuitWalletBlacklisted(state, deposit.wallet)) throw new Error("Wallet is blacklisted.");
    const issueAmount = payload.amount ? normalizeFuitAmount(payload.amount) : normalizeFuitAmount(deposit.amount);
    const balance = getFuitBalanceRecord(state, deposit.username, deposit.wallet);
    balance.balance = Number((Number(balance.balance || 0) + issueAmount).toFixed(6));
    balance.issuedTotal = Number((Number(balance.issuedTotal || 0) + issueAmount).toFixed(6));
    balance.updatedAt = now;
    deposit.status = "issued";
    deposit.issuedAmount = issueAmount;
    deposit.reviewedAt = now;
    deposit.adminNote = String(payload.adminNote || "").trim().slice(0, 240);
    state.ledger.unshift({
      id: `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "issue",
      username: deposit.username,
      wallet: deposit.wallet,
      amount: issueAmount,
      depositId: deposit.id,
      txHash: deposit.txHash,
      createdAt: now,
      note: deposit.adminNote
    });
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "rejectDeposit") {
    const deposit = state.deposits.find(item => item.id === payload.depositId);
    if (!deposit) throw new Error("Deposit not found.");
    deposit.status = "rejected";
    deposit.reviewedAt = now;
    deposit.adminNote = String(payload.adminNote || "").trim().slice(0, 240);
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "manualIssue") {
    const username = normalizeFuitCreditUsername(payload.username);
    const wallet = normalizeFuitWallet(payload.wallet);
    const amount = normalizeFuitAmount(payload.amount);
    if (isFuitWalletBlacklisted(state, wallet)) throw new Error("Wallet is blacklisted.");
    const balance = getFuitBalanceRecord(state, username, wallet);
    balance.wallet = wallet;
    balance.balance = Number((Number(balance.balance || 0) + amount).toFixed(6));
    balance.issuedTotal = Number((Number(balance.issuedTotal || 0) + amount).toFixed(6));
    balance.updatedAt = now;
    state.wallets[getFuitCreditUserKey(username)] = {
      username,
      wallet,
      createdAt: state.wallets[getFuitCreditUserKey(username)]?.createdAt || now,
      updatedAt: now
    };
    state.ledger.unshift({
      id: `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "manual_issue",
      username,
      wallet,
      amount,
      createdAt: now,
      note: String(payload.note || "").trim().slice(0, 240)
    });
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "withdrawCredits") {
    const username = normalizeFuitCreditUsername(payload.username);
    const amount = normalizeFuitAmount(payload.amount);
    const balance = getFuitBalanceRecord(state, username, payload.wallet || "");
    balance.balance = Math.max(0, Number((Number(balance.balance || 0) - amount).toFixed(6)));
    balance.withdrawnTotal = Number((Number(balance.withdrawnTotal || 0) + amount).toFixed(6));
    balance.updatedAt = now;
    state.ledger.unshift({
      id: `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "withdraw",
      username,
      wallet: balance.wallet || "",
      amount,
      createdAt: now,
      note: String(payload.note || "").trim().slice(0, 240)
    });
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "approveWithdrawalRequest") {
    const request = (state.withdrawalRequests || []).find(item => item.id === payload.withdrawalRequestId);
    if (!request) throw new Error("Withdrawal request not found.");
    if (request.status !== "pending") throw new Error("Withdrawal request is already reviewed.");
    const amount = payload.amount ? normalizeFuitAmount(payload.amount) : normalizeFuitAmount(request.amount);
    const balance = getFuitBalanceRecord(state, request.username, request.wallet || "");
    if (amount > Number(balance.balance || 0)) {
      throw new Error("User does not have enough FUIT balance for this withdrawal.");
    }
    balance.balance = Number((Number(balance.balance || 0) - amount).toFixed(6));
    balance.withdrawnTotal = Number((Number(balance.withdrawnTotal || 0) + amount).toFixed(6));
    balance.updatedAt = now;
    request.status = "paid";
    request.paidAmount = amount;
    request.reviewedAt = now;
    request.adminNote = String(payload.adminNote || "").trim().slice(0, 240);
    state.ledger.unshift({
      id: `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "withdraw_request_paid",
      username: request.username,
      wallet: balance.wallet || request.wallet || "",
      amount,
      withdrawalRequestId: request.id,
      createdAt: now,
      note: request.adminNote || request.note || ""
    });
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "rejectWithdrawalRequest") {
    const request = (state.withdrawalRequests || []).find(item => item.id === payload.withdrawalRequestId);
    if (!request) throw new Error("Withdrawal request not found.");
    if (request.status !== "pending") throw new Error("Withdrawal request is already reviewed.");
    request.status = "rejected";
    request.reviewedAt = now;
    request.adminNote = String(payload.adminNote || "").trim().slice(0, 240);
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "blacklistWallet") {
    const wallet = normalizeFuitWallet(payload.wallet);
    if (!isFuitWalletBlacklisted(state, wallet)) {
      state.blacklistedWallets.unshift({
        wallet,
        note: String(payload.note || "").trim().slice(0, 180),
        createdAt: now
      });
    }
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  if (action === "unblacklistWallet") {
    const wallet = normalizeFuitWallet(payload.wallet);
    state.blacklistedWallets = state.blacklistedWallets.filter(item => String(item.wallet || "").toLowerCase() !== wallet.toLowerCase());
    writeFuitCreditState(state);
    return getAdminFuitCreditState();
  }

  return getAdminFuitCreditState();
}

function hasAccessEntry(entries, value) {
  return entries.some(entry => entry.value === value);
}

function upsertAccessEntry(entries, value, note = "") {
  const existing = entries.find(entry => entry.value === value);
  if (existing) {
    existing.note = String(note || existing.note || "").slice(0, 160);
    existing.updatedAt = new Date().toISOString();
    return entries;
  }
  entries.push({
    value,
    note: String(note || "").slice(0, 160),
    createdAt: new Date().toISOString()
  });
  return entries;
}

function removeAccessEntry(entries, value) {
  return entries.filter(entry => entry.value !== value);
}

function getAccessStatus(ip, deviceId = "") {
  const access = readAccessControl();
  const safeIp = String(ip || "").replace(/^::ffff:/, "");
  const safeDevice = String(deviceId || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120);
  const ipWhitelisted = hasAccessEntry(access.whitelistIps, safeIp);
  const deviceWhitelisted = safeDevice ? hasAccessEntry(access.whitelistDevices, safeDevice) : false;
  const ipBlacklisted = hasAccessEntry(access.blacklistIps, safeIp);
  const deviceBlacklisted = safeDevice ? hasAccessEntry(access.blacklistDevices, safeDevice) : false;
  const whitelisted = ipWhitelisted || deviceWhitelisted;
  const blacklisted = !whitelisted && (ipBlacklisted || deviceBlacklisted);

  return {
    whitelisted,
    blacklisted,
    ipWhitelisted,
    deviceWhitelisted,
    ipBlacklisted,
    deviceBlacklisted
  };
}

function isRequestBlocked(req, url) {
  if (url.pathname.startsWith("/admin/")) return false;
  const deviceId = url.searchParams.get("device") || req.headers["x-fuits-device-id"] || "";
  return getAccessStatus(getClientIp(req), deviceId).blacklisted;
}

function updateAccessControl(payload, req = null) {
  const access = readAccessControl();
  const action = payload.action || "load";
  if (action === "load") return { ok: true, accessControl: access };
  if (action === "unblockCurrent") {
    const currentIp = req ? getClientIp(req) : "";
    if (!currentIp || !net.isIP(currentIp)) throw new Error("Could not detect the current IP.");
    access.blacklistIps = removeAccessEntry(access.blacklistIps, currentIp);
    return { ok: true, accessControl: writeAccessControl(access), unblockedIp: currentIp };
  }

  const listKey = {
    whitelistIp: "whitelistIps",
    blacklistIp: "blacklistIps",
    whitelistDevice: "whitelistDevices",
    blacklistDevice: "blacklistDevices"
  }[payload.list];
  if (!listKey) throw new Error("Choose whitelist or blacklist for an IP or device.");

  const type = listKey.toLowerCase().includes("ip") ? "ip" : "device";
  const value = normalizeAccessValue(type, payload.value);

  if (action === "add") {
    upsertAccessEntry(access[listKey], value, payload.note);
  } else if (action === "remove") {
    access[listKey] = removeAccessEntry(access[listKey], value);
  } else if (action !== "load") {
    throw new Error("Choose a valid access-control action.");
  }

  return { ok: true, accessControl: writeAccessControl(access) };
}

function pruneOnlineDevices(now = Date.now()) {
  for (const [key, value] of onlineDevices) {
    if (!value || now - value.lastSeen > ONLINE_STATS_TTL_MS) {
      onlineDevices.delete(key);
    }
  }
}

function buildOnlineStats() {
  pruneOnlineDevices();
  const accessControl = readAccessControl();
  const householdMap = new Map();
  for (const [key, value] of onlineDevices) {
    const deviceAccessStatus = getAccessStatus(value.ip, value.deviceId || key);
    const household = householdMap.get(value.ip) || {
      ip: value.ip,
      accessStatus: getAccessStatus(value.ip),
      deviceCount: 0,
      devices: []
    };
    household.deviceCount += 1;
    household.devices.push({
      deviceId: value.deviceId || key,
      userAgent: value.userAgent || "unknown",
      lastSeen: value.lastSeen,
      deviceProfile: value.deviceProfile || null,
      weatherStatus: value.weatherStatus || "unknown",
      weatherLocation: value.weatherLocation || null,
      accessStatus: deviceAccessStatus
    });
    householdMap.set(value.ip, household);
  }

  const households = Array.from(householdMap.values())
    .map(household => ({
      ...household,
      devices: household.devices.sort((a, b) => b.lastSeen - a.lastSeen)
    }))
    .sort((a, b) => b.deviceCount - a.deviceCount || a.ip.localeCompare(b.ip));

  return {
    devices: onlineDevices.size,
    households: households.length,
    householdDetails: households,
    accessControl
  };
}

function getOnlineStats(req, deviceId, details = {}) {
  const now = Date.now();
  const ip = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "browser").slice(0, 180);
  const safeDeviceId = String(deviceId || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120);
  const deviceKey = safeDeviceId || `${ip}:${userAgent}`;
  const previous = onlineDevices.get(deviceKey) || {};
  const weatherStatus = details.weatherStatus || previous.weatherStatus || "unknown";
  const weatherLocation =
    Object.prototype.hasOwnProperty.call(details, "weatherLocation")
      ? details.weatherLocation
      : previous.weatherLocation || null;
  const deviceProfile =
    details.deviceProfile && typeof details.deviceProfile === "object"
      ? details.deviceProfile
      : previous.deviceProfile || null;

  onlineDevices.set(deviceKey, {
    ip,
    deviceId: safeDeviceId || deviceKey,
    userAgent,
    lastSeen: now,
    deviceProfile,
    weatherStatus,
    weatherLocation
  });

  return buildOnlineStats();
}

function getRadioChannel(channelId) {
  const channels = getRadioChannels();
  return channels.find(channel => channel.id === channelId) || channels[0];
}

function getStatePath(channelId) {
  return path.join(__dirname, `channel-state-${getChannel(channelId).id}.json`);
}

function getRadioStatePath(channelId) {
  return path.join(__dirname, `radio-state-${getRadioChannel(channelId).id}.json`);
}

function makeRadioChannelFromPlaylist(file) {
  const baseName = path.basename(file, ".m3u");
  const normalizedBase = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const id = `radio-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const label = normalizedBase === "fuitslivetvworld"
    ? "FUITS LIVE TV WORLD"
    : baseName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return {
    id: id || "radio-channel",
    label: label || "Radio Channel",
    playlistPath: path.join(RADIO_PLAYLIST_DIR, file)
  };
}

function ensureChannelFolders() {
  fs.mkdirSync(CHANNEL_PLAYLIST_DIR, { recursive: true });

  for (const name of DEFAULT_CHANNEL_PLAYLISTS) {
    const playlistPath = path.join(CHANNEL_PLAYLIST_DIR, name);
    if (!fs.existsSync(playlistPath)) {
      fs.writeFileSync(playlistPath, "#EXTM3U\r\n", "utf8");
    }
  }
}

function makeChannelFromPlaylist(file) {
  const baseName = path.basename(file, ".m3u");
  const normalizedBase = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const id = normalizedBase === "channela"
    ? "channel-a"
    : normalizedBase === "channelb"
      ? "channel-b"
      : `channel-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const label = normalizedBase === "fuitslivetvworld"
    ? "FUITS LIVE TV WORLD"
    : baseName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return {
    id: id || "channel",
    label: label || "Channel",
    playlistPath: path.join(CHANNEL_PLAYLIST_DIR, file)
  };
}

function getChannels() {
  ensureChannelFolders();
  return fs.readdirSync(CHANNEL_PLAYLIST_DIR)
    .filter(file => file.toLowerCase().endsWith(".m3u"))
    .sort((a, b) => a.localeCompare(b))
    .map(makeChannelFromPlaylist);
}

function getChannel(channelId) {
  const channels = getChannels();
  return channels.find(channel => channel.id === channelId) || channels[0];
}

function findChannel(channelId) {
  return getChannels().find(channel => channel.id === channelId);
}

function assertChannel(channelId) {
  const channel = findChannel(channelId);
  if (!channel) throw new Error("Choose a valid playlist channel.");
  return channel;
}

function sanitizePlaylistName(value) {
  const safe = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) throw new Error("Enter a playlist channel name.");
  return safe.slice(0, 80);
}

function getPlaylistFileNameFromLabel(label) {
  return `${sanitizePlaylistName(label).replace(/\s+/g, "-")}.m3u`;
}

function assertPlaylistVideoPath(file) {
  const resolvedRoot = path.resolve(VIDEOS_DIR);
  const resolvedFile = path.resolve(String(file || ""));
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
    throw new Error("Video path is outside the videos folder.");
  }
  if (!fs.existsSync(resolvedFile)) {
    throw new Error("Video file was not found.");
  }
  if (path.extname(resolvedFile).toLowerCase() !== ".mp4") {
    throw new Error("FUITS Live TV playlists currently support MP4 files.");
  }
  return resolvedFile;
}

function normalizePlaylistVideoPath(file) {
  const resolvedRoot = path.resolve(VIDEOS_DIR);
  const resolvedFile = path.resolve(String(file || ""));
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
    throw new Error("Video path is outside the videos folder.");
  }
  if (path.extname(resolvedFile).toLowerCase() !== ".mp4") {
    throw new Error("FUITS Live TV playlists currently support MP4 files.");
  }
  return resolvedFile;
}

function readPlaylistEntries(channelId) {
  const channel = assertChannel(channelId);
  if (!fs.existsSync(channel.playlistPath)) return [];

  const lines = fs.readFileSync(channel.playlistPath, "utf8").split(/\r?\n/);
  const entries = [];
  let title = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#EXTM3U") continue;

    if (line.startsWith("#EXTINF:")) {
      title = line.includes(",") ? line.slice(line.indexOf(",") + 1).trim() : "";
      continue;
    }

    if (line.toLowerCase().endsWith(".mp4")) {
      entries.push({
        title: title || path.basename(line, path.extname(line)),
        file: line
      });
      title = "";
    }
  }

  return entries;
}

function writePlaylistEntries(channelId, entries) {
  const channel = assertChannel(channelId);
  const lines = ["#EXTM3U"];
  for (const entry of entries) {
    const file = normalizePlaylistVideoPath(entry.file);
    const title = String(entry.title || path.basename(file, path.extname(file))).trim() || path.basename(file, path.extname(file));
    lines.push(`#EXTINF:-1,${title}`);
    lines.push(file);
  }
  fs.writeFileSync(channel.playlistPath, `${lines.join("\r\n")}\r\n`, "utf8");
}

function summarizePlaylistEntry(entry, index) {
  const resolvedFile = path.resolve(entry.file);
  const exists = fs.existsSync(resolvedFile);
  const stat = exists ? fs.statSync(resolvedFile) : null;
  return {
    index,
    title: entry.title,
    file: entry.file,
    fileName: path.basename(entry.file),
    relativePath: exists ? path.relative(VIDEOS_DIR, resolvedFile) : entry.file,
    exists,
    sizeBytes: stat ? stat.size : 0,
    modifiedAt: stat ? stat.mtime.toISOString() : ""
  };
}

function listPlaylistVideos() {
  if (!fs.existsSync(VIDEOS_DIR)) return [];
  return walkFiles(VIDEOS_DIR)
    .filter(file => path.extname(file).toLowerCase() === ".mp4")
    .sort((a, b) => path.relative(VIDEOS_DIR, a).localeCompare(path.relative(VIDEOS_DIR, b)))
    .map(file => {
      const stat = fs.statSync(file);
      return {
        path: file,
        fileName: path.basename(file),
        relativePath: path.relative(VIDEOS_DIR, file),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    });
}

function getPlaylistManagement(payload = {}) {
  const channels = getChannels().map(channel => {
    let itemCount = 0;
    try {
      itemCount = readPlaylistEntries(channel.id).length;
    } catch {}
    return {
      id: channel.id,
      label: channel.label,
      fileName: path.basename(channel.playlistPath),
      itemCount
    };
  });
  const selectedChannel = channels.find(channel => channel.id === payload.channelId) || channels[0] || null;
  const entries = selectedChannel ? readPlaylistEntries(selectedChannel.id) : [];

  return {
    ok: true,
    videosRoot: VIDEOS_DIR,
    playlistRoot: CHANNEL_PLAYLIST_DIR,
    channels,
    selectedChannel,
    items: entries.map(summarizePlaylistEntry),
    availableVideos: listPlaylistVideos()
  };
}

function createPlaylistChannel(payload) {
  ensureChannelFolders();
  const fileName = getPlaylistFileNameFromLabel(payload.name);
  const playlistPath = path.join(CHANNEL_PLAYLIST_DIR, fileName);
  if (fs.existsSync(playlistPath)) throw new Error("A playlist channel with that name already exists.");
  fs.writeFileSync(playlistPath, "#EXTM3U\r\n", "utf8");
  return getPlaylistManagement({ channelId: makeChannelFromPlaylist(fileName).id });
}

function renamePlaylistChannel(payload) {
  const channel = assertChannel(payload.channelId);
  const fileName = getPlaylistFileNameFromLabel(payload.name);
  const nextPath = path.join(CHANNEL_PLAYLIST_DIR, fileName);
  if (path.resolve(nextPath) !== path.resolve(channel.playlistPath) && fs.existsSync(nextPath)) {
    throw new Error("A playlist channel with that name already exists.");
  }
  fs.renameSync(channel.playlistPath, nextPath);
  return getPlaylistManagement({ channelId: makeChannelFromPlaylist(fileName).id });
}

function deletePlaylistChannel(payload) {
  const channel = assertChannel(payload.channelId);
  fs.rmSync(channel.playlistPath, { force: true });
  return getPlaylistManagement();
}

function updatePlaylistItem(payload) {
  const entries = readPlaylistEntries(payload.channelId);
  const index = Number(payload.index);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    throw new Error("Choose a valid playlist item.");
  }
  entries[index] = {
    ...entries[index],
    title: String(payload.title || "").trim() || path.basename(entries[index].file, path.extname(entries[index].file))
  };
  writePlaylistEntries(payload.channelId, entries);
  return getPlaylistManagement({ channelId: payload.channelId });
}

function removeFileFromAllPlaylists(file) {
  const target = path.resolve(file);
  for (const channel of getChannels()) {
    const entries = readPlaylistEntries(channel.id).filter(entry => path.resolve(entry.file) !== target);
    writePlaylistEntries(channel.id, entries);
  }
}

function removePlaylistItem(payload) {
  const entries = readPlaylistEntries(payload.channelId);
  const index = Number(payload.index);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    throw new Error("Choose a valid playlist item.");
  }
  const [removed] = entries.splice(index, 1);
  if (payload.deleteFile) {
    const file = assertPlaylistVideoPath(removed.file);
    fs.rmSync(file, { force: true });
    removeFileFromAllPlaylists(file);
  } else {
    writePlaylistEntries(payload.channelId, entries);
  }
  return getPlaylistManagement({ channelId: payload.channelId });
}

function addPlaylistItems(payload) {
  const entries = readPlaylistEntries(payload.channelId);
  const existing = new Set(entries.map(entry => path.resolve(entry.file).toLowerCase()));
  const paths = Array.isArray(payload.paths) ? payload.paths : payload.path ? [payload.path] : [];
  for (const requestedPath of paths) {
    const file = assertPlaylistVideoPath(requestedPath);
    const key = path.resolve(file).toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    entries.push({
      title: path.basename(file, path.extname(file)),
      file
    });
  }
  writePlaylistEntries(payload.channelId, entries);
  return getPlaylistManagement({ channelId: payload.channelId });
}

function renamePlaylistVideoFile(payload) {
  const oldPath = assertPlaylistVideoPath(payload.path);
  const extension = path.extname(oldPath);
  const baseName = String(payload.name || payload.fileName || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!baseName) throw new Error("Enter a new video file name.");
  const nextName = baseName.toLowerCase().endsWith(extension.toLowerCase()) ? baseName : `${baseName}${extension}`;
  const nextPath = path.join(path.dirname(oldPath), nextName);
  if (path.resolve(nextPath) !== path.resolve(oldPath) && fs.existsSync(nextPath)) {
    throw new Error("A video with that file name already exists in this folder.");
  }
  fs.renameSync(oldPath, nextPath);

  for (const channel of getChannels()) {
    const entries = readPlaylistEntries(channel.id).map(entry => (
      path.resolve(entry.file) === path.resolve(oldPath)
        ? { ...entry, file: nextPath, title: entry.title === path.basename(oldPath, extension) ? path.basename(nextPath, extension) : entry.title }
        : entry
    ));
    writePlaylistEntries(channel.id, entries);
  }

  return getPlaylistManagement({ channelId: payload.channelId });
}

function getRadioChannels() {
  ensureRadioFolders();
  return fs.readdirSync(RADIO_PLAYLIST_DIR)
    .filter(file => file.toLowerCase().endsWith(".m3u"))
    .sort((a, b) => a.localeCompare(b))
    .map(makeRadioChannelFromPlaylist);
}

function getAdminPassword() {
  if (!fs.existsSync(PASSWORD_PATH)) {
    fs.writeFileSync(PASSWORD_PATH, "FOOLIO", "utf8");
  }

  return fs.readFileSync(PASSWORD_PATH, "utf8").trim();
}

function setAdminPassword(nextPassword) {
  const cleanPassword = String(nextPassword || "").trim();
  if (!cleanPassword) throw new Error("New password required");
  fs.writeFileSync(PASSWORD_PATH, cleanPassword, "utf8");
  return cleanPassword;
}

function isAdminPassword(password) {
  return password === getAdminPassword() || password === SHUFFLE_PASSWORD;
}

function readSiteBlankState() {
  if (!fs.existsSync(SITE_BLANK_PATH)) return { blank: false };

  try {
    const state = JSON.parse(fs.readFileSync(SITE_BLANK_PATH, "utf8"));
    return { blank: Boolean(state.blank), updatedAt: state.updatedAt || "" };
  } catch {
    return { blank: false };
  }
}

function writeSiteBlankState(blank) {
  const state = {
    blank: Boolean(blank),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(SITE_BLANK_PATH, JSON.stringify(state, null, 2), "utf8");
  return state;
}

function clampVideoChunkMb(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VIDEO_CHUNK_MB;
  return Math.min(MAX_VIDEO_CHUNK_MB, Math.max(MIN_VIDEO_CHUNK_MB, Math.round(number)));
}

function normalizeVideoStreamSettings(settings = {}) {
  const chunkMb = clampVideoChunkMb(settings.chunkMb);
  return {
    chunkMb,
    chunkBytes: chunkMb * 1024 * 1024,
    minChunkMb: MIN_VIDEO_CHUNK_MB,
    maxChunkMb: MAX_VIDEO_CHUNK_MB,
    defaultChunkMb: DEFAULT_VIDEO_CHUNK_MB
  };
}

function readVideoStreamSettings() {
  try {
    if (!fs.existsSync(VIDEO_STREAM_SETTINGS_PATH)) return normalizeVideoStreamSettings();
    return normalizeVideoStreamSettings(JSON.parse(fs.readFileSync(VIDEO_STREAM_SETTINGS_PATH, "utf8") || "{}"));
  } catch {
    return normalizeVideoStreamSettings();
  }
}

function writeVideoStreamSettings(settings = {}) {
  const next = normalizeVideoStreamSettings(settings);
  fs.writeFileSync(VIDEO_STREAM_SETTINGS_PATH, JSON.stringify({ chunkMb: next.chunkMb }, null, 2), "utf8");
  return next;
}

function readState(channelId) {
  const statePath = getStatePath(channelId);
  if (!fs.existsSync(statePath)) return {};

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function readRadioState(channelId) {
  const statePath = getRadioStatePath(channelId);
  if (!fs.existsSync(statePath)) return {};

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(channelId, state) {
  fs.writeFileSync(getStatePath(channelId), JSON.stringify(state, null, 2), "utf8");
}

function writeRadioState(channelId, state) {
  fs.writeFileSync(getRadioStatePath(channelId), JSON.stringify(state, null, 2), "utf8");
}

function readChatMessages() {
  if (!fs.existsSync(CHAT_LOG_PATH)) return [];

  try {
    const messages = JSON.parse(fs.readFileSync(CHAT_LOG_PATH, "utf8"));
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

function pruneChatMessages(messages) {
  const cutoff = Date.now() - CHAT_MAX_AGE_MS;
  return messages.filter(message => typeof message.createdAt === "number" && message.createdAt >= cutoff);
}

function writeChatMessages(messages) {
  fs.writeFileSync(CHAT_LOG_PATH, JSON.stringify(pruneChatMessages(messages), null, 2), "utf8");
}

function sanitizeChatText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function listChatGifs() {
  if (!fs.existsSync(CHAT_GIFS_DIR)) {
    fs.mkdirSync(CHAT_GIFS_DIR, { recursive: true });
  }

  return fs.readdirSync(CHAT_GIFS_DIR)
    .filter(file => file.toLowerCase().endsWith(".gif"))
    .sort((a, b) => a.localeCompare(b))
    .map(file => ({
      file,
      label: path.basename(file, path.extname(file)),
      src: `/chat-gifs/${encodeURIComponent(file)}`
    }));
}

function walkFiles(folder) {
  if (!fs.existsSync(folder)) return [];

  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

function resolveVideoRepairTool(candidates, fallbackName) {
  const candidate = candidates.find(file => fs.existsSync(file));
  return candidate || fallbackName;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

function runVideoRepairProcess(command, args, outputPath, details) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    activeVideoRepairProcess = child;
    activeVideoRepairDetails = {
      ...(details || {}),
      outputPath,
      pid: child.pid || null,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now()
    };
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (activeVideoRepairProcess === child) activeVideoRepairProcess = null;
      if (activeVideoRepairDetails && activeVideoRepairDetails.pid === child.pid) activeVideoRepairDetails = null;
      if (videoRepairCancelRequested) {
        fs.rmSync(outputPath, { force: true });
        resolve({ code, stdout, stderr, cancelled: true });
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function countVideoRepairResults(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
}

function summarizeVideoRepairBatch(batch) {
  if (!batch) return null;
  return {
    id: batch.id,
    active: batch.status === "running" || batch.status === "cancelling",
    status: batch.status,
    action: batch.action,
    finish: batch.finish,
    overwriteExisting: batch.overwriteExisting,
    total: batch.total,
    done: batch.done,
    failed: batch.failed,
    current: batch.current,
    results: batch.results,
    counts: batch.counts,
    startedAt: batch.startedAt,
    startedAtMs: batch.startedAtMs,
    completedAt: batch.completedAt,
    completedAtMs: batch.completedAtMs,
    error: batch.error || ""
  };
}

function getVideoRepairStatus() {
  const processActive = Boolean(activeVideoRepairProcess && activeVideoRepairProcess.pid);
  const batch = summarizeVideoRepairBatch(activeVideoRepairBatch);
  const batchActive = Boolean(batch && batch.active);
  const currentDetails = activeVideoRepairDetails || (batchActive && activeVideoRepairBatch ? activeVideoRepairBatch.current : null);
  const elapsedSeconds = currentDetails && currentDetails.startedAtMs
    ? Math.max(0, Math.round((Date.now() - currentDetails.startedAtMs) / 1000))
    : 0;

  return {
    ok: true,
    active: processActive || batchActive,
    processActive,
    cancelling: Boolean(videoRepairCancelRequested && (processActive || batchActive)),
    batch,
    ...(currentDetails ? {
      ...currentDetails,
      elapsedSeconds
    } : {})
  };
}

function cancelVideoRepairs() {
  videoRepairCancelRequested = true;
  if (activeVideoRepairBatch && activeVideoRepairBatch.status === "running") {
    activeVideoRepairBatch.status = "cancelling";
  }
  const child = activeVideoRepairProcess;
  if (child && child.pid) {
    try {
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }

  return {
    ok: true,
    cancelled: true,
    stoppedCurrent: Boolean(child && child.pid),
    message: child && child.pid ? "Stopping the current repair and the queue." : "Stopping the repair queue."
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "N/A") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(values) {
  for (const value of values) {
    const number = toNumberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function roundRepairNumber(value) {
  return value === null || value === undefined ? "" : Math.round(value * 1000) / 1000;
}

function assertVideoRepairPath(file) {
  const resolvedRoot = path.resolve(VIDEOS_DIR);
  const resolvedFile = path.resolve(String(file || ""));
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
    throw new Error("Video path is outside the videos folder.");
  }
  if (!fs.existsSync(resolvedFile)) {
    throw new Error("Video file was not found.");
  }
  if (!VIDEO_REPAIR_EXTENSIONS.has(path.extname(resolvedFile).toLowerCase())) {
    throw new Error("File is not a supported video type.");
  }
  return resolvedFile;
}

function getVideoRepairFixedPath(file, mode) {
  const folder = path.dirname(file);
  const name = path.basename(file, path.extname(file));
  const originalExtension = path.extname(file).toLowerCase();
  const extension = [".mp4", ".m4v"].includes(originalExtension) ? originalExtension : ".mp4";
  return path.join(folder, `${name}.${mode}${extension}`);
}

function deleteVideoRepairFile(file) {
  const inputPath = assertVideoRepairPath(file);
  const relativePath = path.relative(VIDEOS_DIR, inputPath);
  const fileName = path.basename(inputPath);
  fs.rmSync(inputPath, { force: true });
  return {
    ok: true,
    status: "deleted",
    fileName,
    relativePath,
    message: "Deleted from the videos folder."
  };
}

function backupAndReplaceVideo(originalPath, fixedPath) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const relative = path.relative(VIDEOS_DIR, originalPath);
  const backupPath = path.join(VIDEO_REPAIR_BACKUP_DIR, timestamp, relative);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(originalPath, backupPath);
  fs.renameSync(fixedPath, originalPath);
  return backupPath;
}

function assertVideoRepairBackupPath(file) {
  const resolvedRoot = path.resolve(VIDEO_REPAIR_BACKUP_DIR);
  const resolvedFile = path.resolve(String(file || ""));
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Backup path is outside the repair backup folder.");
  }
  if (!fs.existsSync(resolvedFile)) {
    throw new Error("Old backup file was not found.");
  }
  if (!VIDEO_REPAIR_EXTENSIONS.has(path.extname(resolvedFile).toLowerCase())) {
    throw new Error("Backup is not a supported video type.");
  }
  return resolvedFile;
}

function getVideoRepairRestoreTarget(backupPath) {
  const parts = path.relative(VIDEO_REPAIR_BACKUP_DIR, backupPath).split(path.sep).filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Backup is missing its original video path.");
  }

  const targetPath = path.resolve(VIDEOS_DIR, parts.slice(1).join(path.sep));
  const resolvedRoot = path.resolve(VIDEOS_DIR);
  if (!targetPath.startsWith(resolvedRoot + path.sep) && targetPath !== resolvedRoot) {
    throw new Error("Restore target is outside the videos folder.");
  }
  return targetPath;
}

function cleanupEmptyVideoRepairBackupDirs(startDir) {
  const resolvedRoot = path.resolve(VIDEO_REPAIR_BACKUP_DIR);
  let currentDir = path.resolve(startDir);
  while (currentDir.startsWith(resolvedRoot + path.sep) && currentDir !== resolvedRoot) {
    try {
      if (fs.readdirSync(currentDir).length) return;
      fs.rmdirSync(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      return;
    }
  }
}

function listVideoRepairBackups() {
  if (!fs.existsSync(VIDEO_REPAIR_BACKUP_DIR)) {
    return { ok: true, backups: [] };
  }

  const backups = walkFiles(VIDEO_REPAIR_BACKUP_DIR)
    .filter(file => VIDEO_REPAIR_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map(file => {
      const stat = fs.statSync(file);
      const targetPath = getVideoRepairRestoreTarget(file);
      return {
        path: file,
        relativePath: path.relative(VIDEO_REPAIR_BACKUP_DIR, file),
        targetPath,
        targetRelativePath: path.relative(VIDEOS_DIR, targetPath),
        fileName: path.basename(targetPath),
        currentExists: fs.existsSync(targetPath),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .map((backup, index) => ({ ...backup, id: index }));

  return { ok: true, backups };
}

function restoreVideoRepairBackup(payload) {
  const backupPath = assertVideoRepairBackupPath(payload.backupPath || payload.path);
  const targetPath = getVideoRepairRestoreTarget(backupPath);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const tempNewPath = `${targetPath}.new-version-delete-${timestamp}`;
  const hadNewVersion = fs.existsSync(targetPath);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (hadNewVersion) {
    fs.renameSync(targetPath, tempNewPath);
  }

  try {
    fs.renameSync(backupPath, targetPath);
  } catch (error) {
    if (hadNewVersion && fs.existsSync(tempNewPath) && !fs.existsSync(targetPath)) {
      fs.renameSync(tempNewPath, targetPath);
    }
    throw error;
  }

  if (hadNewVersion) {
    fs.rmSync(tempNewPath, { force: true });
  }
  cleanupEmptyVideoRepairBackupDirs(path.dirname(backupPath));

  return {
    ok: true,
    status: "restored",
    fileName: path.basename(targetPath),
    relativePath: path.relative(VIDEOS_DIR, targetPath),
    restoredPath: targetPath,
    deletedNewVersion: hadNewVersion,
    message: hadNewVersion
      ? "Restored the old backup and deleted the newer copy."
      : "Restored the old backup."
  };
}

function finishVideoRepairCopy(originalPath, fixedPath, finishChoice) {
  if (finishChoice === "overwrite") {
    fs.rmSync(originalPath, { force: true });
    fs.renameSync(fixedPath, originalPath);
    return { finish: "overwritten", outputPath: originalPath };
  }

  if (finishChoice === "replace") {
    const backupPath = backupAndReplaceVideo(originalPath, fixedPath);
    return { finish: "replaced", backupPath };
  }

  if (finishChoice === "delete") {
    fs.rmSync(fixedPath, { force: true });
    return { finish: "deleted" };
  }

  return { finish: "kept", outputPath: fixedPath };
}

async function getVideoRepairTiming(file) {
  const ffprobePath = resolveVideoRepairTool(FFPROBE_CANDIDATES, "ffprobe.exe");
  const result = await runProcess(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,start_time,duration",
    "-of", "json",
    file
  ]);
  if (result.code !== 0 || !result.stdout.trim()) return null;

  let info;
  try {
    info = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  const streams = Array.isArray(info.streams) ? info.streams : [];
  const video = streams.find(stream => stream.codec_type === "video");
  const audio = streams.find(stream => stream.codec_type === "audio");
  if (!video) return null;

  const formatDuration = firstNumber([info.format && info.format.duration]);
  const videoSeconds = firstNumber([video.duration, formatDuration]);
  const audioSeconds = audio ? firstNumber([audio.duration, formatDuration]) : null;
  const videoStartSeconds = firstNumber([video.start_time, 0]);
  const audioStartSeconds = audio ? firstNumber([audio.start_time, 0]) : null;
  if (videoSeconds === null) return null;

  return {
    path: file,
    relativePath: path.relative(VIDEOS_DIR, file),
    fileName: path.basename(file),
    extension: path.extname(file),
    videoCodec: video.codec_name || "",
    audioCodec: audio ? audio.codec_name || "" : "",
    hasAudio: Boolean(audio),
    videoSeconds,
    audioSeconds,
    durationDiffSeconds: audioSeconds !== null ? videoSeconds - audioSeconds : null,
    videoStartSeconds,
    audioStartSeconds,
    startDiffSeconds: audioStartSeconds !== null ? videoStartSeconds - audioStartSeconds : null
  };
}

function makeVideoRepairReportRow(file, status, timing = null) {
  return {
    File: file,
    Status: status,
    VideoSeconds: timing ? roundRepairNumber(timing.videoSeconds) : "",
    AudioSeconds: timing ? roundRepairNumber(timing.audioSeconds) : "",
    DurationDiffSeconds: timing ? roundRepairNumber(timing.durationDiffSeconds) : "",
    StartDiffSeconds: timing ? roundRepairNumber(timing.startDiffSeconds) : ""
  };
}

function csvEscape(value) {
  const text = String(value === null || value === undefined ? "" : value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeVideoRepairReport(rows) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const reportPath = path.join(DOCS_DIR, `video-audio-sync-report-${timestamp}.csv`);
  const headers = ["File", "Status", "VideoSeconds", "AudioSeconds", "DurationDiffSeconds", "StartDiffSeconds"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(reportPath, lines.join("\r\n"), "utf8");
  return reportPath;
}

function summarizeVideoRepairTiming(timing, index) {
  return {
    id: index,
    path: timing.path,
    relativePath: timing.relativePath,
    fileName: timing.fileName,
    videoSeconds: roundRepairNumber(timing.videoSeconds),
    audioSeconds: roundRepairNumber(timing.audioSeconds),
    durationDiffSeconds: roundRepairNumber(timing.durationDiffSeconds),
    videoStartSeconds: roundRepairNumber(timing.videoStartSeconds),
    audioStartSeconds: roundRepairNumber(timing.audioStartSeconds),
    startDiffSeconds: roundRepairNumber(timing.startDiffSeconds),
    videoCodec: timing.videoCodec,
    audioCodec: timing.audioCodec
  };
}

async function scanVideoRepairs() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    throw new Error(`Videos folder not found: ${VIDEOS_DIR}`);
  }

  const files = walkFiles(VIDEOS_DIR)
    .filter(file => VIDEO_REPAIR_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const rows = [];
  const flagged = [];

  for (const file of files) {
    const timing = await getVideoRepairTiming(file);
    if (!timing) {
      rows.push(makeVideoRepairReportRow(file, "Could not read timing"));
      continue;
    }

    const durationBad =
      timing.hasAudio &&
      timing.durationDiffSeconds !== null &&
      Math.abs(timing.durationDiffSeconds) > VIDEO_REPAIR_DURATION_THRESHOLD_SECONDS;
    const startBad =
      timing.hasAudio &&
      timing.startDiffSeconds !== null &&
      Math.abs(timing.startDiffSeconds) > VIDEO_REPAIR_START_THRESHOLD_SECONDS;
    const status = !timing.hasAudio ? "No audio track" : durationBad || startBad ? "Flagged" : "OK";
    rows.push(makeVideoRepairReportRow(file, status, timing));
    if (status === "Flagged") flagged.push(timing);
  }

  const reportPath = writeVideoRepairReport(rows);
  latestVideoRepairScan = {
    createdAt: new Date().toISOString(),
    checked: files.length,
    reportPath,
    flagged
  };

  return {
    ok: true,
    checked: files.length,
    flaggedCount: flagged.length,
    reportPath,
    flagged: flagged.map(summarizeVideoRepairTiming)
  };
}

function normalizeVideoRepairAction(value) {
  if (value === "remux") return "remux";
  if (value === "syncfix" || value === "audio-fix") return "syncfix";
  throw new Error("Choose remux or audio timing fix.");
}

function normalizeVideoRepairFinish(value) {
  if (value === "keep" || value === "overwrite" || value === "replace" || value === "delete") return value;
  throw new Error("Choose keep, overwrite, replace, or delete.");
}

async function repairOneVideo(file, action, finish, overwriteExisting) {
  if (videoRepairCancelRequested) {
    return {
      ok: false,
      status: "cancelled",
      fileName: path.basename(String(file || "")),
      message: "Repair was cancelled."
    };
  }

  const inputPath = assertVideoRepairPath(file);
  const timing = await getVideoRepairTiming(inputPath);
  if (!timing) throw new Error("Could not read timing for this video.");

  const mode = action === "remux" ? "remux" : "syncfix";
  const outputPath = getVideoRepairFixedPath(inputPath, mode);
  if (fs.existsSync(outputPath)) {
    if (!overwriteExisting) {
      return {
        ok: true,
        status: "skipped",
        fileName: path.basename(inputPath),
        message: "A fixed copy already exists."
      };
    }
    fs.rmSync(outputPath, { force: true });
  }

  const ffmpegPath = resolveVideoRepairTool(FFMPEG_CANDIDATES, "ffmpeg.exe");
  const args = action === "remux"
    ? [
      "-y", "-hide_banner",
      "-i", inputPath,
      "-map", "0",
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart",
      outputPath
    ]
    : [
      "-y", "-hide_banner",
      "-fflags", "+genpts",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-map", "0:s?",
      "-c:v", "copy",
      "-c:a", "aac",
      "-profile:a", "aac_low",
      "-b:a", "160k",
      "-ac", "2",
      "-ar", "48000",
      "-af", "aresample=async=1:first_pts=0,apad",
      "-t", Number(timing.videoSeconds).toFixed(3),
      "-avoid_negative_ts", "make_zero",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "9999",
      outputPath
    ];

  const result = await runVideoRepairProcess(ffmpegPath, args, outputPath, {
    action,
    finish,
    fileName: path.basename(inputPath),
    relativePath: path.relative(VIDEOS_DIR, inputPath),
    inputPath
  });
  if (result.cancelled) {
    fs.rmSync(outputPath, { force: true });
    return {
      ok: false,
      status: "cancelled",
      fileName: path.basename(inputPath),
      relativePath: path.relative(VIDEOS_DIR, inputPath),
      message: "Repair was cancelled."
    };
  }

  if (result.code !== 0 || !fs.existsSync(outputPath)) {
    fs.rmSync(outputPath, { force: true });
    return {
      ok: false,
      status: "failed",
      fileName: path.basename(inputPath),
      message: result.stderr.trim().slice(-1200) || "Repair failed."
    };
  }

  const newTiming = await getVideoRepairTiming(outputPath);
  const finishResult = finishVideoRepairCopy(inputPath, outputPath, finish);
  return {
    ok: true,
    status: finishResult.finish,
    fileName: path.basename(inputPath),
    relativePath: path.relative(VIDEOS_DIR, inputPath),
    outputPath: finishResult.outputPath || "",
    backupPath: finishResult.backupPath || "",
    newTiming: newTiming ? summarizeVideoRepairTiming(newTiming, 0) : null
  };
}

function buildVideoRepairRequest(payload) {
  const action = normalizeVideoRepairAction(payload.action);
  const finish = normalizeVideoRepairFinish(payload.finish);
  const overwriteExisting = Boolean(payload.overwriteExisting);
  const requestedFiles = payload.all
    ? (latestVideoRepairScan && latestVideoRepairScan.flagged ? latestVideoRepairScan.flagged.map(timing => timing.path) : [])
    : Array.isArray(payload.paths)
      ? payload.paths
      : payload.path
        ? [payload.path]
        : [];

  if (!requestedFiles.length) {
    throw new Error("Run the check first or choose at least one video.");
  }

  return {
    action,
    finish,
    overwriteExisting,
    requestedFiles
  };
}

async function runVideoRepairs(payload) {
  if (!payload.continueExistingCancel) {
    videoRepairCancelRequested = false;
  }
  const { action, finish, overwriteExisting, requestedFiles } = buildVideoRepairRequest(payload);
  const results = [];
  for (const file of requestedFiles) {
    if (videoRepairCancelRequested) {
      break;
    }
    try {
      results.push(await repairOneVideo(file, action, finish, overwriteExisting));
    } catch (error) {
      results.push({
        ok: false,
        status: "failed",
        fileName: path.basename(String(file || "")),
        message: error.message || "Repair failed."
      });
    }
  }

  return {
    ok: !videoRepairCancelRequested && results.every(result => result.ok),
    cancelled: videoRepairCancelRequested,
    action,
    finish,
    results,
    counts: countVideoRepairResults(results)
  };
}

function startVideoRepairBatch(payload) {
  if (activeVideoRepairBatch && (activeVideoRepairBatch.status === "running" || activeVideoRepairBatch.status === "cancelling")) {
    throw new Error("A video repair queue is already running.");
  }

  videoRepairCancelRequested = false;
  const { action, finish, overwriteExisting, requestedFiles } = buildVideoRepairRequest(payload);
  const now = new Date();
  const batch = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    action,
    finish,
    overwriteExisting,
    total: requestedFiles.length,
    done: 0,
    failed: 0,
    current: null,
    results: [],
    counts: {},
    startedAt: now.toISOString(),
    startedAtMs: now.getTime(),
    completedAt: null,
    completedAtMs: null,
    error: ""
  };
  activeVideoRepairBatch = batch;

  (async () => {
    for (const file of requestedFiles) {
      if (videoRepairCancelRequested) break;
      const inputPath = assertVideoRepairPath(file);
      batch.current = {
        action,
        finish,
        fileName: path.basename(inputPath),
        relativePath: path.relative(VIDEOS_DIR, inputPath),
        inputPath,
        startedAt: new Date().toISOString(),
        startedAtMs: Date.now()
      };

      try {
        batch.results.push(await repairOneVideo(file, action, finish, overwriteExisting));
      } catch (error) {
        batch.results.push({
          ok: false,
          status: "failed",
          fileName: path.basename(String(file || "")),
          message: error.message || "Repair failed."
        });
      }

      batch.done = batch.results.length;
      batch.failed = batch.results.filter(result => result.ok === false || result.status === "failed").length;
      batch.counts = countVideoRepairResults(batch.results);
    }

    batch.current = null;
    batch.status = videoRepairCancelRequested ? "cancelled" : "completed";
    batch.completedAt = new Date().toISOString();
    batch.completedAtMs = Date.now();
  })().catch(error => {
    batch.status = "failed";
    batch.error = error.message || "Video repair queue failed.";
    batch.current = null;
    batch.completedAt = new Date().toISOString();
    batch.completedAtMs = Date.now();
  });

  return {
    ok: true,
    queued: true,
    batch: summarizeVideoRepairBatch(batch)
  };
}

function makeMediaItem(file, baseDir, type) {
  const relativePath = path.relative(baseDir, file);
  const parts = relativePath.split(path.sep);
  const fileName = path.basename(file);
  const title = path.basename(fileName, path.extname(fileName));
  const genre = parts.length > 1 ? parts[0] : "Other";
  const encodedPath = relativePath.split(path.sep).map(part => encodeURIComponent(part)).join("/");

  return {
    id: `${type}-${relativePath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title,
    artist: genre,
    genre,
    type,
    src: `/music-library/${type === "video" ? "Videos" : "Music"}/${encodedPath}`
  };
}

function ensureGameFolders() {
  fs.mkdirSync(GAME_ROMS_DIR, { recursive: true });
  fs.mkdirSync(GAME_IMAGES_DIR, { recursive: true });
  for (const config of Object.values(GAME_SYSTEMS)) {
    fs.mkdirSync(path.join(GAME_ROMS_DIR, config.folder), { recursive: true });
  }
}

function makeGameItem(file, system, config) {
  const relativePath = path.relative(path.join(GAME_ROMS_DIR, config.folder), file);
  const fileName = path.basename(file);
  const label = path.basename(fileName, path.extname(fileName));
  const encodedPath = relativePath.split(path.sep).map(part => encodeURIComponent(part)).join("/");
  const yearMatch = label.match(/\b(19\d{2}|20\d{2})\b/);
  const item = {
    label,
    system,
    core: config.core,
    year: yearMatch ? yearMatch[1] : "",
    file: fileName,
    gameUrl: `/games/${system}/${encodedPath}`,
    assetBaseUrl: `/game-images/${encodeURIComponent(label)}`
  };

  if (system === "PS1" && path.extname(file).toLowerCase() === ".m3u") {
    const playlistDir = path.dirname(file);
    const baseDir = path.resolve(path.join(GAME_ROMS_DIR, config.folder));
    item.discUrls = fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => path.resolve(playlistDir, line))
      .filter(discPath => discPath.startsWith(baseDir) && fs.existsSync(discPath))
      .map(discPath => {
        const discRelativePath = path.relative(baseDir, discPath);
        const discEncodedPath = discRelativePath.split(path.sep).map(part => encodeURIComponent(part)).join("/");
        return `/games/${system}/${discEncodedPath}`;
      });
  }

  return item;
}

function listGames() {
  ensureGameFolders();
  const games = [];

  for (const [system, config] of Object.entries(GAME_SYSTEMS)) {
    const systemFolder = path.join(GAME_ROMS_DIR, config.folder);
    const allowed = new Set(config.extensions);
    const files = walkFiles(systemFolder);
    const foldersWithM3u = new Set(
      files
        .filter(file => path.extname(file).toLowerCase() === ".m3u")
        .map(file => path.dirname(file))
    );

    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!allowed.has(extension)) continue;
      if (system === "PS1" && extension !== ".m3u" && foldersWithM3u.has(path.dirname(file))) continue;
      games.push(makeGameItem(file, system, config));
    }
  }

  return games.sort((a, b) => {
    const systemCompare = a.system.localeCompare(b.system);
    if (systemCompare) return systemCompare;
    return a.label.localeCompare(b.label);
  });
}

function ensureGameSaveFolders() {
  ensureGameFolders();
  fs.mkdirSync(GAME_SAVES_DIR, { recursive: true });
}

function cleanGameSaveText(value, maxLength = 80) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeGameSaveSegment(value, fallback = "save") {
  const cleaned = cleanGameSaveText(value, 110)
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 110);
}

function makeGameSaveId() {
  return `save_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readGameSaves() {
  ensureGameSaveFolders();
  try {
    const parsed = JSON.parse(fs.readFileSync(GAME_SAVES_INDEX_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGameSaves(saves) {
  ensureGameSaveFolders();
  fs.writeFileSync(GAME_SAVES_INDEX_PATH, JSON.stringify(saves, null, 2));
}

function isGameSavePathInside(filePath) {
  const baseDir = path.resolve(GAME_SAVES_DIR);
  const relativePath = path.relative(baseDir, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function getSavedGameFilePath(save) {
  const relativePath = String(save?.relativePath || "");
  const filePath = path.resolve(GAME_SAVES_DIR, relativePath);
  if (!isGameSavePathInside(filePath)) return "";
  return filePath;
}

function listGameSaves(origin = "") {
  const games = listGames();
  const gameMap = new Map(games.map(game => [`${game.system}::${game.file}`, game]));
  const saves = readGameSaves()
    .filter(save => {
      const filePath = getSavedGameFilePath(save);
      return filePath && fs.existsSync(filePath);
    })
    .map(save => {
      const game = gameMap.get(`${save.system}::${save.gameFile}`) || null;
      const fileName = save.fileName || path.basename(save.relativePath || "save-file");
      return {
        ...save,
        gameLabel: save.gameLabel || game?.label || save.gameFile || "Unknown Game",
        fileName,
        sizeBytes: Number(save.sizeBytes || 0),
        downloadUrl: `${origin}/saved-games/download/${encodeURIComponent(save.id)}/${encodeURIComponent(fileName)}`
      };
    });

  return saves.sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
}

function parseMultipartDisposition(value = "") {
  const result = {};
  String(value || "").split(";").forEach(part => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = rawKey.trim().toLowerCase();
    if (!key) return;
    const joined = rawValue.join("=").trim();
    result[key] = joined.replace(/^"|"$/g, "");
  });
  return result;
}

function parseMultipartUpload(req, body) {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundaryText = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2] || "").trim() : "";
  if (!boundaryText) throw new Error("Upload form boundary missing.");

  const boundary = Buffer.from(`--${boundaryText}`);
  const fields = {};
  const files = {};
  let offset = body.indexOf(boundary);

  while (offset >= 0) {
    offset += boundary.length;
    if (body.slice(offset, offset + 2).toString() === "--") break;
    if (body.slice(offset, offset + 2).toString() === "\r\n") offset += 2;

    const nextBoundary = body.indexOf(boundary, offset);
    if (nextBoundary < 0) break;

    let part = body.slice(offset, nextBoundary);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const headerText = part.slice(0, headerEnd).toString("latin1");
      const data = part.slice(headerEnd + 4);
      const headers = {};
      headerText.split(/\r\n/).forEach(line => {
        const colon = line.indexOf(":");
        if (colon < 0) return;
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      });
      const disposition = parseMultipartDisposition(headers["content-disposition"]);
      const name = disposition.name || "";
      if (name) {
        if (disposition.filename) {
          files[name] = {
            fileName: path.basename(disposition.filename),
            contentType: headers["content-type"] || "application/octet-stream",
            data
          };
        } else {
          fields[name] = data.toString("utf8");
        }
      }
    }

    offset = nextBoundary;
  }

  return { fields, files };
}

function readRequestBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", chunk => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Save file is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function saveUploadedGameSave(req, origin) {
  return readRequestBuffer(req, MAX_GAME_SAVE_UPLOAD_BYTES).then(body => {
    const form = parseMultipartUpload(req, body);
    const username = cleanGameSaveText(form.fields.username, 32);
    const system = cleanGameSaveText(form.fields.system, 12).toUpperCase();
    const gameFile = cleanGameSaveText(form.fields.gameFile, 180);
    const saveFile = form.files.saveFile || form.files.file;

    if (!username) throw new Error("Sign in before uploading a save.");
    if (!GAME_SYSTEMS[system]) throw new Error("Choose a valid system.");
    if (!saveFile?.data?.length) throw new Error("Choose a save file to upload.");

    const game = listGames().find(item => item.system === system && item.file === gameFile);
    if (!game) throw new Error("Choose a valid game.");

    const originalFileName = safeGameSaveSegment(saveFile.fileName || "save-file", "save-file");
    const saveName = cleanGameSaveText(form.fields.saveName, 80) || path.basename(originalFileName, path.extname(originalFileName)) || "Saved Game";
    const id = makeGameSaveId();
    const extension = path.extname(originalFileName).slice(0, 20);
    const storedName = safeGameSaveSegment(`${id}-${saveName}${extension}`, `${id}${extension || ".sav"}`);
    const relativePath = path.join(system, safeGameSaveSegment(game.label, "game"), storedName);
    const targetPath = path.resolve(GAME_SAVES_DIR, relativePath);

    if (!isGameSavePathInside(targetPath)) throw new Error("Invalid save path.");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, saveFile.data);

    const item = {
      id,
      saveName,
      username,
      system,
      gameFile: game.file,
      gameLabel: game.label,
      fileName: originalFileName,
      relativePath,
      sizeBytes: saveFile.data.length,
      uploadedAt: new Date().toISOString()
    };
    const saves = readGameSaves();
    saves.unshift(item);
    writeGameSaves(saves);

    return {
      ...item,
      downloadUrl: `${origin}/saved-games/download/${encodeURIComponent(item.id)}/${encodeURIComponent(item.fileName)}`
    };
  });
}

function serveGameSaveDownload(res, saveId) {
  const save = readGameSaves().find(item => item.id === saveId);
  const filePath = getSavedGameFilePath(save);
  if (!save || !filePath || !fs.existsSync(filePath)) {
    send(res, 404, "Saved game not found");
    return;
  }

  const fileName = safeGameSaveSegment(save.fileName || path.basename(filePath), "save-file");
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": fs.statSync(filePath).size,
    "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "private, max-age=0"
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveGameFile(req, res, system, encodedPath) {
  const config = GAME_SYSTEMS[system];
  if (!config) {
    send(res, 404, "Game not found");
    return;
  }

  const baseDir = path.resolve(path.join(GAME_ROMS_DIR, config.folder));
  const relativePath = decodeURIComponent(encodedPath || "").replace(/\//g, path.sep);
  const filePath = path.resolve(baseDir, relativePath);
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath)) {
    send(res, 404, "Game not found");
    return;
  }

  const allowed = new Set([...config.extensions, ".bin"]);
  if (!allowed.has(extension)) {
    send(res, 404, "Game not found");
    return;
  }

  if (extension === ".m3u") {
    const host = String(req.headers.host || "");
    const protocol = req.headers["x-forwarded-proto"] || (host.includes("trycloudflare.com") || host.includes("flivetv.qzz.io") ? "https" : "http");
    const origin = `${protocol}://${req.headers.host}`;
    const playlistDir = path.dirname(filePath);
    const body = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || /^https?:\/\//i.test(trimmed)) return line;
        const discPath = path.resolve(playlistDir, trimmed);
        if (!discPath.startsWith(baseDir) || !fs.existsSync(discPath)) return line;
        const discRelativePath = path.relative(baseDir, discPath);
        const discEncodedPath = discRelativePath.split(path.sep).map(part => encodeURIComponent(part)).join("/");
        return `${origin}/games/${system}/${discEncodedPath}`;
      })
      .join("\r\n");
    res.writeHead(200, {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return;
  }

  serveMediaFile(req, res, filePath, "application/octet-stream");
}

function serveGameImage(req, res, label, requestedFile) {
  const safeLabel = path.basename(decodeURIComponent(label || ""));
  const safeFile = path.basename(decodeURIComponent(requestedFile || ""));
  const imagePath = path.join(GAME_IMAGES_DIR, safeLabel, safeFile);
  const extension = path.extname(safeFile).toLowerCase();

  if (![".jpg", ".jpeg", ".png", ".webp", ".avif", ".pdf"].includes(extension) || !fs.existsSync(imagePath)) {
    send(res, 404, "Game image not found");
    return;
  }

  const contentType = extension === ".pdf"
    ? "application/pdf"
    : extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".avif"
          ? "image/avif"
          : "image/jpeg";
  serveMediaFile(req, res, imagePath, contentType);
}

function makeMusicChannelFromFolder(folder) {
  const folderName = path.basename(folder);
  const id = folderName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "music-channel";
  const label = folderName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Music Channel";

  return { id, label, folder };
}

function getMusicChannels() {
  if (!fs.existsSync(MUSIC_LIBRARY_CHANNELS_DIR)) {
    fs.mkdirSync(MUSIC_LIBRARY_CHANNELS_DIR, { recursive: true });
  }

  const podcastFolder = path.join(MUSIC_LIBRARY_CHANNELS_DIR, "Podcast");
  fs.mkdirSync(path.join(podcastFolder, "Music"), { recursive: true });
  fs.mkdirSync(path.join(podcastFolder, "Videos"), { recursive: true });

  return fs.readdirSync(MUSIC_LIBRARY_CHANNELS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => makeMusicChannelFromFolder(path.join(MUSIC_LIBRARY_CHANNELS_DIR, entry.name)))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getMusicChannel(channelId) {
  const channels = getMusicChannels();
  return channels.find(channel => channel.id === channelId) || channels[0];
}

function makeMusicChannelMediaItem(file, baseDir, type, channel) {
  const relativePath = path.relative(baseDir, file);
  const parts = relativePath.split(path.sep);
  const fileName = path.basename(file);
  const title = path.basename(fileName, path.extname(fileName));
  const genre = parts.length > 1 ? parts[0] : "Other";
  const encodedPath = relativePath.split(path.sep).map(part => encodeURIComponent(part)).join("/");

  return {
    id: `${channel.id}-${type}-${relativePath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title,
    artist: genre,
    genre,
    type,
    src: `/music-channel/${channel.id}/${type === "video" ? "Videos" : "Music"}/${encodedPath}`
  };
}

function listMusicLibrary() {
  if (!fs.existsSync(MUSIC_LIBRARY_MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_LIBRARY_MUSIC_DIR, { recursive: true });
  }
  if (!fs.existsSync(MUSIC_LIBRARY_VIDEOS_DIR)) {
    fs.mkdirSync(MUSIC_LIBRARY_VIDEOS_DIR, { recursive: true });
  }

  const music = walkFiles(MUSIC_LIBRARY_MUSIC_DIR)
    .filter(file => file.toLowerCase().endsWith(".mp3"))
    .map(file => makeMediaItem(file, MUSIC_LIBRARY_MUSIC_DIR, "audio"));

  const videos = walkFiles(MUSIC_LIBRARY_VIDEOS_DIR)
    .filter(file => file.toLowerCase().endsWith(".mp4"))
    .map(file => makeMediaItem(file, MUSIC_LIBRARY_VIDEOS_DIR, "video"));

  return [...videos, ...music].sort((a, b) => {
    const genreCompare = (a.genre || "").localeCompare(b.genre || "");
    if (genreCompare) return genreCompare;
    return (a.title || "").localeCompare(b.title || "");
  });
}

function listMusicChannel(channelId) {
  const channel = getMusicChannel(channelId);
  if (!channel) return [];

  const musicDir = path.join(channel.folder, "Music");
  const videosDir = path.join(channel.folder, "Videos");
  fs.mkdirSync(musicDir, { recursive: true });
  fs.mkdirSync(videosDir, { recursive: true });

  const music = walkFiles(musicDir)
    .filter(file => file.toLowerCase().endsWith(".mp3"))
    .map(file => makeMusicChannelMediaItem(file, musicDir, "audio", channel));

  const videos = walkFiles(videosDir)
    .filter(file => file.toLowerCase().endsWith(".mp4"))
    .map(file => makeMusicChannelMediaItem(file, videosDir, "video", channel));

  return [...videos, ...music].sort((a, b) => {
    const genreCompare = (a.genre || "").localeCompare(b.genre || "");
    if (genreCompare) return genreCompare;
    return (a.title || "").localeCompare(b.title || "");
  });
}

function serveMusicLibraryFile(req, res, libraryType, encodedPath) {
  const baseDir = libraryType === "Videos" ? MUSIC_LIBRARY_VIDEOS_DIR : MUSIC_LIBRARY_MUSIC_DIR;
  const relativePath = decodeURIComponent(encodedPath || "").replace(/\//g, path.sep);
  const filePath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(resolvedBase) || !fs.existsSync(filePath)) {
    send(res, 404, "Media not found");
    return;
  }

  if ((libraryType === "Videos" && extension !== ".mp4") || (libraryType === "Music" && extension !== ".mp3")) {
    send(res, 404, "Media not found");
    return;
  }

  serveMediaFile(req, res, filePath, extension === ".mp4" ? "video/mp4" : "audio/mpeg");
}

function serveMusicChannelFile(req, res, channelId, libraryType, encodedPath) {
  const channel = getMusicChannel(channelId);
  if (!channel) {
    send(res, 404, "Media not found");
    return;
  }

  const baseDir = path.join(channel.folder, libraryType);
  const relativePath = decodeURIComponent(encodedPath || "").replace(/\//g, path.sep);
  const filePath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(resolvedBase) || !fs.existsSync(filePath)) {
    send(res, 404, "Media not found");
    return;
  }

  if ((libraryType === "Videos" && extension !== ".mp4") || (libraryType === "Music" && extension !== ".mp3")) {
    send(res, 404, "Media not found");
    return;
  }

  serveMediaFile(req, res, filePath, extension === ".mp4" ? "video/mp4" : "audio/mpeg");
}

function readAtomHeader(fd, position, fileSize) {
  if (position + 8 > fileSize) return null;

  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, position);
  let size = header.readUInt32BE(0);
  const type = header.toString("ascii", 4, 8);
  let headerSize = 8;

  if (size === 1) {
    size = Number(header.readBigUInt64BE(8));
    headerSize = 16;
  } else if (size === 0) {
    size = fileSize - position;
  }

  if (!size || size < headerSize) return null;

  return { type, size, headerSize, start: position, end: position + size };
}

function findAtom(fd, start, end, wantedType, fileSize) {
  let position = start;

  while (position < end) {
    const atom = readAtomHeader(fd, position, fileSize);
    if (!atom || atom.end > end) return null;
    if (atom.type === wantedType) return atom;
    position = atom.end;
  }

  return null;
}

function getMp4DurationSeconds(file) {
  const fallback = FALLBACK_DURATION_SECONDS;
  let fd;

  try {
    const stat = fs.statSync(file);
    fd = fs.openSync(file, "r");
    const moov = findAtom(fd, 0, stat.size, "moov", stat.size);
    if (!moov) return fallback;

    const mvhd = findAtom(fd, moov.start + moov.headerSize, moov.end, "mvhd", stat.size);
    if (!mvhd) return fallback;

    const payload = Buffer.alloc(Math.min(Number(mvhd.size - mvhd.headerSize), 40));
    fs.readSync(fd, payload, 0, payload.length, mvhd.start + mvhd.headerSize);

    const version = payload.readUInt8(0);
    const timescaleOffset = version === 1 ? 20 : 12;
    const durationOffset = version === 1 ? 24 : 16;
    const timescale = payload.readUInt32BE(timescaleOffset);
    const duration = version === 1
      ? Number(payload.readBigUInt64BE(durationOffset))
      : payload.readUInt32BE(durationOffset);

    if (!timescale || !duration) return fallback;
    return Math.max(1, Math.round(duration / timescale));
  } catch {
    return fallback;
  } finally {
    if (fd) fs.closeSync(fd);
  }
}

function getMp3DurationSeconds(file) {
  try {
    const stat = fs.statSync(file);
    const buffer = Buffer.alloc(Math.min(stat.size, 128 * 1024));
    const fd = fs.openSync(file, "r");
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    let offset = 0;
    if (buffer.slice(0, 3).toString("ascii") === "ID3" && buffer.length >= 10) {
      const size =
        ((buffer[6] & 0x7f) << 21) |
        ((buffer[7] & 0x7f) << 14) |
        ((buffer[8] & 0x7f) << 7) |
        (buffer[9] & 0x7f);
      offset = 10 + size;
    }

    const bitrates = {
      "1-1": [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],
      "1-2": [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0],
      "1-3": [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],
      "2-1": [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0],
      "2-2": [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
      "2-3": [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0]
    };

    for (let i = offset; i < buffer.length - 4; i += 1) {
      if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
      const versionBits = (buffer[i + 1] >> 3) & 0x03;
      const layerBits = (buffer[i + 1] >> 1) & 0x03;
      const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f;
      const version = versionBits === 3 ? "1" : "2";
      const layer = layerBits === 3 ? "1" : layerBits === 2 ? "2" : layerBits === 1 ? "3" : "";
      const bitrate = bitrates[`${version}-${layer}`]?.[bitrateIndex];
      if (!bitrate) continue;

      const audioBytes = Math.max(1, stat.size - i);
      return Math.max(1, Math.round((audioBytes * 8) / (bitrate * 1000)));
    }
  } catch {}

  return 180;
}

function ensureRadioFolders() {
  fs.mkdirSync(RADIO_MUSIC_DIR, { recursive: true });
  fs.mkdirSync(RADIO_PLAYLIST_DIR, { recursive: true });

  for (const name of DEFAULT_RADIO_PLAYLISTS) {
    const playlistPath = path.join(RADIO_PLAYLIST_DIR, name);
    if (!fs.existsSync(playlistPath)) {
      fs.writeFileSync(playlistPath, "#EXTM3U\r\n", "utf8");
    }
  }
}

function readRadioPlaylist(channelId) {
  ensureRadioFolders();
  const channel = getRadioChannel(channelId);
  const lines = fs.readFileSync(channel.playlistPath, "utf8").split(/\r?\n/);
  const items = [];
  let title = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#EXTM3U") continue;

    if (line.startsWith("#EXTINF:")) {
      title = line.includes(",") ? line.slice(line.indexOf(",") + 1).trim() : "";
      continue;
    }

    if (line.toLowerCase().endsWith(".mp3")) {
      items.push({
        id: String(items.length),
        title: title || path.basename(line, path.extname(line)),
        file: line,
        duration: getMp3DurationSeconds(line)
      });
      title = "";
    }
  }

  const existingItems = items.filter(item => fs.existsSync(item.file));
  const state = readRadioState(channel.id);

  if (!Array.isArray(state.order)) return existingItems;

  const byFile = new Map(existingItems.map(item => [item.file, item]));
  const ordered = state.order.map(file => byFile.get(file)).filter(Boolean);
  const missing = existingItems.filter(item => !state.order.includes(item.file));

  return [...ordered, ...missing].map((item, index) => ({ ...item, id: String(index) }));
}

function ensureRadioStartedAt(channelId, state) {
  if (typeof state.startedAt === "number") return state;

  const nextState = {
    ...state,
    startedAt: Math.floor(Date.now() / 1000)
  };
  writeRadioState(channelId, nextState);
  return nextState;
}

function getRadioSnapshot(channelId) {
  const channel = getRadioChannel(channelId);
  const playlist = readRadioPlaylist(channel.id);
  if (!playlist.length) {
    return { channel, playlist: [], currentIndex: 0, offsetSeconds: 0, totalDuration: 0 };
  }

  const state = ensureRadioStartedAt(channel.id, readRadioState(channel.id));
      const totalDuration = playlist.reduce((sum, item) => sum + item.duration, 0);
      let elapsed = Math.floor(Date.now() / 1000) - state.startedAt;
      elapsed = ((elapsed % totalDuration) + totalDuration) % totalDuration;

  let cursor = 0;
  let currentIndex = 0;

  for (let index = 0; index < playlist.length; index += 1) {
    const duration = playlist[index].duration;
    if (elapsed < cursor + duration) {
      currentIndex = index;
      break;
    }
    cursor += duration;
  }

  return {
    channel,
    playlist,
    currentIndex,
    offsetSeconds: Math.max(0, elapsed - cursor),
    totalDuration,
    generatedAtMs: Date.now()
  };
}

function readPlaylist(channelId) {
  const channel = getChannel(channelId);
  if (!fs.existsSync(channel.playlistPath)) return [];

  const lines = fs.readFileSync(channel.playlistPath, "utf8").split(/\r?\n/);
  const items = [];
  let title = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#EXTM3U") continue;

    if (line.startsWith("#EXTINF:")) {
      title = line.includes(",") ? line.slice(line.indexOf(",") + 1).trim() : "";
      continue;
    }

    if (line.toLowerCase().endsWith(".mp4")) {
      items.push({
        id: String(items.length),
        title: title || path.basename(line, path.extname(line)),
        file: line,
        duration: getMp4DurationSeconds(line)
      });
      title = "";
    }
  }

  const existingItems = items.filter(item => fs.existsSync(item.file));
  const state = readState(channel.id);

  if (!Array.isArray(state.order)) return existingItems;

  const byFile = new Map(existingItems.map(item => [item.file, item]));
  const ordered = state.order.map(file => byFile.get(file)).filter(Boolean);
  const missing = existingItems.filter(item => !state.order.includes(item.file));

  return [...ordered, ...missing].map((item, index) => ({ ...item, id: String(index) }));
}

function ensureChannelStartedAt(channelId, state) {
  if (typeof state.startedAt === "number") return state;

  const nextState = {
    ...state,
    startedAt: Math.floor(Date.now() / 1000)
  };
  writeState(channelId, nextState);
  return nextState;
}

function getChannelSnapshot(channelId) {
  const channel = getChannel(channelId);
  const playlist = readPlaylist(channel.id);
  if (!playlist.length) {
    return {
      channel,
      playlist: [],
      currentIndex: 0,
      offsetSeconds: 0,
      totalDuration: 0
    };
  }

  const state = ensureChannelStartedAt(channel.id, readState(channel.id));
  const totalDuration = playlist.reduce((sum, item) => sum + item.duration, 0);
  if (totalDuration <= 0) {
    return {
      channel,
      playlist,
      currentIndex: 0,
      offsetSeconds: 0,
      totalDuration: 0
    };
  }

  let elapsed = Math.floor(Date.now() / 1000) - state.startedAt;
  elapsed = ((elapsed % totalDuration) + totalDuration) % totalDuration;

  let cursor = 0;
  let currentIndex = 0;

  for (let index = 0; index < playlist.length; index += 1) {
    const duration = playlist[index].duration;
    if (elapsed < cursor + duration) {
      currentIndex = index;
      break;
    }
    cursor += duration;
  }

  return {
    channel,
    playlist,
    currentIndex,
    offsetSeconds: Math.max(0, elapsed - cursor),
    totalDuration,
    generatedAtMs: Date.now()
  };
}

function advanceChannelToNextItem(channelId) {
  const channel = getChannel(channelId);
  const playlist = readPlaylist(channel.id);
  if (!playlist.length) {
    return { ok: false, reason: "No playlist items" };
  }

  const snapshot = getChannelSnapshot(channel.id);
  const nextIndex = (snapshot.currentIndex + 1) % playlist.length;
  const offsetToNext = playlist
    .slice(0, nextIndex)
    .reduce((sum, item) => sum + item.duration, 0);
  const previousState = readState(channel.id);

  writeState(channel.id, {
    ...previousState,
    updatedAt: new Date().toISOString(),
    startedAt: Math.floor(Date.now() / 1000) - offsetToNext
  });

  return { ok: true, channel: channel.id, currentIndex: nextIndex };
}

function advanceChannelToPreviousItem(channelId) {
  const channel = getChannel(channelId);
  const playlist = readPlaylist(channel.id);
  if (!playlist.length) {
    return { ok: false, reason: "No playlist items" };
  }

  const snapshot = getChannelSnapshot(channel.id);
  const previousIndex = (snapshot.currentIndex - 1 + playlist.length) % playlist.length;
  const offsetToPrevious = playlist
    .slice(0, previousIndex)
    .reduce((sum, item) => sum + item.duration, 0);
  const previousState = readState(channel.id);

  writeState(channel.id, {
    ...previousState,
    updatedAt: new Date().toISOString(),
    startedAt: Math.floor(Date.now() / 1000) - offsetToPrevious
  });

  return { ok: true, channel: channel.id, currentIndex: previousIndex };
}

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function getAdultRelaxRoom(roomId) {
  const safeRoomId = String(roomId || "adult-relax-time")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "adult-relax-time";
  const now = Date.now();
  let room = adultRelaxSignalRooms.get(safeRoomId);
  if (!room) {
    room = { nextSeq: 1, participants: new Map(), messages: [] };
    adultRelaxSignalRooms.set(safeRoomId, room);
  }

  for (const [clientId, participant] of room.participants) {
    if (now - participant.lastSeen > 45000) {
      room.participants.delete(clientId);
    }
  }
  if (!room.participants.size) {
    room.nextSeq = 1;
    room.messages = [];
  } else {
    room.messages = room.messages.filter(message => now - message.createdAt < 120000);
  }
  return room;
}

function purgeStaleAdultRelaxParticipants(room, maxAge = 45000) {
  const now = Date.now();
  for (const [clientId, participant] of room.participants) {
    if (now - participant.lastSeen > maxAge) {
      room.participants.delete(clientId);
    }
  }
}

function touchAdultRelaxParticipant(room, clientId, options = {}) {
  const now = Date.now();
  const safeClientId = String(clientId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  if (!safeClientId) return null;

  let participant = room.participants.get(safeClientId);
  if (!participant) {
    if (options.join) {
      purgeStaleAdultRelaxParticipants(room, 15000);
    }
    const usedSlots = new Set([...room.participants.values()].map(value => value.slot));
    let slot = 0;
    if (options.join && usedSlots.size === 0) {
      slot = 1;
    } else {
      for (let index = 1; index <= ADULT_RELAX_MAX_PARTICIPANTS; index += 1) {
        if (!usedSlots.has(index)) {
          slot = index;
          break;
        }
      }
    }
    if (!slot) {
      return {
        clientId: safeClientId,
        slot: 0,
        joinedAt: now,
        lastSeen: now
      };
    }
    participant = {
      slot,
      joinedAt: now,
      lastSeen: now
    };
    room.participants.set(safeClientId, participant);
  } else {
    participant.lastSeen = now;
  }
  return { clientId: safeClientId, ...participant };
}

function getAdultRelaxParticipants(room) {
  return [...room.participants.entries()]
    .map(([clientId, participant]) => ({ clientId, slot: participant.slot, joinedAt: participant.joinedAt, lastSeen: participant.lastSeen }))
    .sort((a, b) => a.slot - b.slot || a.lastSeen - b.lastSeen);
}

function handleAdultRelaxSignal(req, res, url) {
  const room = getAdultRelaxRoom(url.searchParams.get("room"));
  const clientId = String(url.searchParams.get("client") || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);

  if (req.method === "GET") {
    const existing = room.participants.get(clientId);
    const participant = existing
      ? touchAdultRelaxParticipant(room, clientId)
      : null;
    const since = Number(url.searchParams.get("since")) || 0;
    sendJson(res, 200, {
      ok: true,
      participant,
      participants: getAdultRelaxParticipants(room),
      seq: room.nextSeq - 1,
      messages: room.messages.filter(message =>
        message.seq > since &&
        message.from !== clientId &&
        (!message.to || message.to === clientId)
      )
    });
    return;
  }

  if (req.method !== "POST") {
    send(res, 405, "Method not allowed");
    return;
  }

  readRequestBody(req)
    .then(body => {
      const payload = JSON.parse(body || "{}");
      const participant = touchAdultRelaxParticipant(
        room,
        payload.clientId || clientId,
        { join: payload.action === "join" }
      );
      if (!participant) throw new Error("Missing caller ID.");

      if (payload.action === "leave") {
        room.participants.delete(participant.clientId);
        sendJson(res, 200, { ok: true, participants: getAdultRelaxParticipants(room) });
        return;
      }

      if (payload.action === "signal") {
        room.messages.push({
          seq: room.nextSeq++,
          createdAt: Date.now(),
          from: participant.clientId,
          to: String(payload.to || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
          type: String(payload.type || "").slice(0, 40),
          data: payload.data || null
        });
      }

      sendJson(res, 200, {
        ok: true,
        participant,
        participants: getAdultRelaxParticipants(room),
        seq: room.nextSeq - 1
      });
    })
    .catch(error => sendJson(res, 400, { ok: false, error: error.message || "Signal failed" }));
}

function getOwncastContentType(pathname, fallback) {
  const extension = path.extname(pathname).toLowerCase();
  if (extension === ".m3u8") return "application/vnd.apple.mpegurl; charset=utf-8";
  if (extension === ".ts") return "video/mp2t";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".png") return "image/png";
  return fallback || "application/octet-stream";
}

function getOwncastBaseUrls() {
  if (owncastBaseUrlCache && Date.now() < owncastBaseUrlCacheExpiresAt) {
    return owncastBaseUrlCache;
  }

  const urls = [];
  try {
    const wslIps = execSync("wsl hostname -I", {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true
    }).trim().split(/\s+/).filter(Boolean);
    wslIps.forEach(ip => urls.push(`http://${ip}:8080`));
  } catch {}
  urls.push(OWNCAST_LOCAL_URL, "http://127.0.0.1:8080");
  owncastBaseUrlCache = [...new Set(urls)];
  owncastBaseUrlCacheExpiresAt = Date.now() + 60 * 1000;
  return owncastBaseUrlCache;
}

async function fetchOwncastPath(owncastPath, options) {
  let lastError;
  for (const baseUrl of getOwncastBaseUrls()) {
    const target = new URL(owncastPath, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const upstream = await fetch(target, { ...options, signal: controller.signal });
      return { upstream, target };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function rewriteOwncastPlaylist(body) {
  return body
    .replaceAll(`${OWNCAST_LOCAL_URL}/hls/`, "/owncast-hls/")
    .replaceAll("http://localhost:8080/hls/", "/owncast-hls/")
    .replaceAll("http://127.0.0.1:8080/hls/", "/owncast-hls/")
    .replace(/http:\/\/[^/\s]+:8080\/hls\//g, "/owncast-hls/")
    .replaceAll("/hls/", "/owncast-hls/");
}

async function proxyOwncastHls(req, res, owncastPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  try {
    const { upstream, target } = await fetchOwncastPath(owncastPath, {
      headers: req.headers.range ? { Range: req.headers.range } : undefined
    });
    const contentType = getOwncastContentType(target.pathname, upstream.headers.get("content-type"));
    const headers = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes"
    };

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    if (!upstream.ok && upstream.status !== 206) {
      send(res, upstream.status, "Owncast stream not available");
      return;
    }

    if (target.pathname.endsWith(".m3u8")) {
      const body = rewriteOwncastPlaylist(await upstream.text());
      res.writeHead(upstream.status, {
        ...headers,
        "Content-Length": Buffer.byteLength(body)
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    res.writeHead(upstream.status, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value), pump);
    });
    pump().catch(() => res.end());
  } catch {
    send(res, 502, "Owncast is not running");
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 10000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function serveMediaFile(req, res, file, contentType) {
  const stat = fs.statSync(file);
  const range = req.headers.range;
  const isVideo = contentType.startsWith("video/");
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const mobileSafariLandscapeStream = requestUrl.searchParams.get("profile") === "mobile-safari-landscape";
  const videoChunkSize = (isVideo && mobileSafariLandscapeStream)
    ? MOBILE_SAFARI_VIDEO_CHUNK_MB * 1024 * 1024
    : readVideoStreamSettings().chunkBytes;
  const logVideoRange = (status, start, end) => {
    if (!isVideo) return;
    console.log(`[video-range] ${status} ${path.basename(file)} requested=${range || "none"} served=${start}-${end} size=${stat.size}`);
  };

  if (!range) {
    if (isVideo && req.method !== "HEAD") {
      const start = 0;
      const end = Math.min(stat.size - 1, videoChunkSize - 1);
      const chunkSize = end - start + 1;
      logVideoRange(206, start, end);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Cloudflare-CDN-Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
        "Vary": "Range"
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Range"
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
    return;
  }

  const [startText, endText] = range.replace(/bytes=/, "").split("-");
  const suffixLength = startText === "" ? Number(endText) : 0;
  const start = startText === ""
    ? Math.max(0, stat.size - suffixLength)
    : Number(startText);
  const requestedEnd = startText === ""
    ? stat.size - 1
    : endText
      ? Number(endText)
      : stat.size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start > requestedEnd || start >= stat.size) {
    res.writeHead(416, {
      "Content-Range": `bytes */${stat.size}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Range"
    });
    res.end();
    return;
  }

  const end = isVideo ? Math.min(requestedEnd, start + videoChunkSize - 1, stat.size - 1) : Math.min(requestedEnd, stat.size - 1);
  const chunkSize = end - start + 1;
  logVideoRange(206, start, end);

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
    "Vary": "Range"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file, { start, end }).pipe(res);
}

function serveVideo(req, res, item) {
  serveMediaFile(req, res, item.file, "video/mp4");
}

function radioPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FUITS RADIO WORLD</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
  <style>
    * { box-sizing: border-box; }
    html {
      overflow-x: hidden;
    }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      background: #050816;
      color: #f8fafc;
      font-family: Arial, sans-serif;
      display: grid;
      place-items: start center;
    }
    main {
      width: min(100vw, 980px);
      padding: 8px 12px 10px;
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #fecaca;
      background: rgba(127,29,29,.72);
      border: 1px solid rgba(248,113,113,.5);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 900;
      margin-bottom: 8px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      letter-spacing: .5px;
    }
    .tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 6px 0 10px;
    }
    .channel-select {
      flex: 1 1 170px;
      min-width: 0;
      border: 1px solid rgba(148,163,184,.35);
      border-radius: 10px;
      background: rgba(15,23,42,.92);
      color: #f8fafc;
      font-weight: 900;
      padding: 8px 10px;
      font-size: 12px;
    }
    button {
      border: 1px solid rgba(148,163,184,.35);
      border-radius: 10px;
      background: rgba(15,23,42,.92);
      color: #f8fafc;
      font-weight: 900;
      padding: 8px 12px;
      cursor: pointer;
    }
    button.active {
      background: #f8fafc;
      color: #06111f;
    }
    .panel {
      border: 1px solid rgba(148,163,184,.24);
      border-radius: 14px;
      background: rgba(2,6,23,.86);
      padding: 14px;
    }
    .art {
      height: 110px;
      border-radius: 12px;
      background:
        radial-gradient(circle at 30% 30%, rgba(56,189,248,.28), transparent 32%),
        radial-gradient(circle at 72% 38%, rgba(250,204,21,.22), transparent 28%),
        linear-gradient(135deg, rgba(15,23,42,.96), rgba(88,28,135,.56));
      border: 1px solid rgba(148,163,184,.2);
      display: grid;
      place-items: center;
      font-weight: 1000;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    audio {
      width: 100%;
      margin-top: 10px;
    }
    .now {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.35;
      margin-top: 8px;
    }
    .now.live-now {
      color: #ef4444;
      font-size: 12px;
      font-weight: 1000;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .status {
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 700;
      margin-top: 4px;
    }
    .chat {
      width: 100%;
      height: 250px;
      border: 1px solid rgba(148,163,184,.22);
      border-radius: 14px;
      background: #020617;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <main>
    <div id="liveBadge" class="live" hidden>LIVE DJ / ANNOUNCEMENT ACTIVE</div>
    <h1>FUITS RADIO WORLD</h1>
    <div class="tabs">
      <select id="radioChannelSelect" class="channel-select" aria-label="Choose radio channel">
        ${getRadioChannels().map(channel => `<option value="${channel.id}">${channel.label}</option>`).join("")}
      </select>
      <button id="unmuteButton" type="button">Unmute</button>
    </div>
    <section class="panel">
      <div class="art">FUITS RADIO</div>
      <audio id="radioPlayer" controls autoplay muted playsinline></audio>
      <audio id="livePlayer" controls autoplay muted playsinline hidden></audio>
      <div id="now" class="now">Loading radio...</div>
      <div id="status" class="status"></div>
      <iframe class="chat" title="FUITS Radio Chat" src="/chat-only"></iframe>
    </section>
  </main>
  <script>
    const radioPlayer = document.getElementById("radioPlayer");
    const livePlayer = document.getElementById("livePlayer");
    const now = document.getElementById("now");
    const status = document.getElementById("status");
    const liveBadge = document.getElementById("liveBadge");
    const unmuteButton = document.getElementById("unmuteButton");
    const radioChannelSelect = document.getElementById("radioChannelSelect");
    const urlChannelId = new URLSearchParams(window.location.search).get("channel");
    let activeChannelId = urlChannelId || localStorage.getItem("fuitsRadioChannel") || "${getRadioChannels()[0]?.id || "radio-channel"}";
    let currentItemId = "";
    let currentItemSrc = "";
    let liveHls = null;
    let liveOnline = false;
    let soundUnlocked = localStorage.getItem("fuitsRadioSoundUnlocked") === "1";

    function silenceRadioForLive() {
      radioPlayer.pause();
      radioPlayer.muted = true;
    }

    function applySoundPreference() {
      radioPlayer.muted = !soundUnlocked;
      livePlayer.muted = !soundUnlocked;
      radioPlayer.volume = 1;
      livePlayer.volume = 1;
      unmuteButton.hidden = soundUnlocked;
    }

    function rememberSoundUnlocked() {
      const radioAudible = !radioPlayer.muted && radioPlayer.volume > 0;
      const liveAudible = !livePlayer.muted && livePlayer.volume > 0;
      if (radioAudible || liveAudible) {
        soundUnlocked = true;
        localStorage.setItem("fuitsRadioSoundUnlocked", "1");
        unmuteButton.hidden = true;
      }
    }

    function updateChannelSelect() {
      if (radioChannelSelect.value !== activeChannelId) {
        radioChannelSelect.value = activeChannelId;
      }
    }

    async function loadChannel() {
      const res = await fetch("/radio-channel.json?channel=" + encodeURIComponent(activeChannelId) + "&cache=" + Date.now());
      return res.json();
    }

    function applyChannel(channel, options = {}) {
      const shouldPlay = options.autoplay !== false;
      const shouldUpdateNow = options.updateNow !== false;
      const item = channel.playlist[channel.currentIndex];
      if (!item) {
        if (shouldUpdateNow) {
          now.textContent = "No MP3s found in this radio playlist yet.";
          status.textContent = "";
        }
        radioPlayer.removeAttribute("src");
        radioPlayer.load();
        return;
      }

      if (item.id !== currentItemId || item.src !== currentItemSrc) {
        currentItemId = item.id;
        currentItemSrc = item.src;
        radioPlayer.src = item.src;
        radioPlayer.load();
        applySoundPreference();
      }

      const offset = Math.max(0, Math.min(channel.offsetSeconds || 0, Math.max(0, item.duration - 1)));
      const syncTime = () => {
        if (Number.isFinite(radioPlayer.duration) && Math.abs(radioPlayer.currentTime - offset) > 3) {
          radioPlayer.currentTime = offset;
        }
      };

      if (radioPlayer.readyState >= 1) syncTime();
      else radioPlayer.addEventListener("loadedmetadata", () => {
        syncTime();
        if (shouldPlay && !liveOnline) playRadioWithLiveGuard();
      }, { once: true });

      if (shouldPlay) playRadioWithLiveGuard();

      if (shouldUpdateNow) {
        now.classList.remove("live-now");
        now.textContent = channel.channel.label + " now playing: " + item.title;
        status.textContent = "";
      }
    }

    function playRadioWithLiveGuard() {
      if (liveOnline) {
        silenceRadioForLive();
        return;
      }
      radioPlayer.play().catch(() => {
        if (liveOnline) {
          silenceRadioForLive();
          return;
        }
        if (!soundUnlocked) radioPlayer.muted = true;
        radioPlayer.play().catch(() => {
          if (liveOnline) silenceRadioForLive();
        });
      });
    }

    function startLiveDj() {
      const liveSrc = "/owncast-hls/stream.m3u8";
      silenceRadioForLive();
      radioPlayer.hidden = true;
      livePlayer.hidden = false;
      liveBadge.hidden = false;
      now.classList.add("live-now");
      now.textContent = "LIVE";
      status.textContent = "Radio playlist is warmed up and will resume when live ends.";

      if (livePlayer.canPlayType("application/vnd.apple.mpegurl")) {
        if (livePlayer.getAttribute("src") !== liveSrc) {
          livePlayer.src = liveSrc;
          livePlayer.load();
        }
      } else if (window.Hls && window.Hls.isSupported()) {
        if (!liveHls) {
          liveHls = new window.Hls({ liveSyncDurationCount: 2 });
          liveHls.loadSource(liveSrc);
          liveHls.attachMedia(livePlayer);
        }
      }

      if (livePlayer.paused) {
        livePlayer.play().catch(() => {
          silenceRadioForLive();
          if (!soundUnlocked) livePlayer.muted = true;
          livePlayer.play().catch(() => {});
        });
      }
    }

    function stopLiveDj() {
      livePlayer.pause();
      livePlayer.removeAttribute("src");
      livePlayer.load();
      livePlayer.hidden = true;
      radioPlayer.hidden = false;
      radioPlayer.muted = !soundUnlocked;
      liveBadge.hidden = true;
      now.classList.remove("live-now");
      if (liveHls) {
        liveHls.destroy();
        liveHls = null;
      }
    }

    async function warmRadioWhileLive() {
      try {
        const channel = await loadChannel();
        applyChannel(channel, { autoplay: false, updateNow: false });
        silenceRadioForLive();
      } catch {}
    }

    async function checkLiveDj() {
      try {
        const res = await fetch("/owncast-status?cache=" + Date.now());
        const data = await res.json();
        if (data.online) {
          liveOnline = true;
          await warmRadioWhileLive();
          startLiveDj();
        } else if (!data.online && liveOnline) {
          liveOnline = false;
          stopLiveDj();
          syncRadio();
        }
      } catch {}
    }

    async function syncRadio() {
      if (liveOnline) return;
      const channel = await loadChannel();
      applyChannel(channel);
    }

    unmuteButton.addEventListener("click", () => {
      soundUnlocked = true;
      localStorage.setItem("fuitsRadioSoundUnlocked", "1");
      applySoundPreference();
      radioPlayer.play().catch(() => {});
      livePlayer.play().catch(() => {});
    });

    radioPlayer.addEventListener("play", rememberSoundUnlocked);
    radioPlayer.addEventListener("volumechange", rememberSoundUnlocked);
    livePlayer.addEventListener("play", rememberSoundUnlocked);
    livePlayer.addEventListener("volumechange", rememberSoundUnlocked);

    radioChannelSelect.addEventListener("change", () => {
      activeChannelId = radioChannelSelect.value;
      localStorage.setItem("fuitsRadioChannel", activeChannelId);
      currentItemId = "";
      currentItemSrc = "";
      updateChannelSelect();
      syncRadio().catch(() => {});
    });

    updateChannelSelect();
    applySoundPreference();
    checkLiveDj();
    syncRadio().catch(() => {
      now.textContent = "The radio server is running, but the playlist could not be loaded.";
    });
    setInterval(checkLiveDj, 3000);
    setInterval(syncRadio, 15000);
  </script>
</body>
</html>`;
}

function discountsPageHtml() {
  const links = [
    { label: "AVAILABLE RESIDENCE", href: "/discounts/available-residence.html" },
    { label: "EMERGENCY PLANNING!", href: "/discounts/emergency-planning.html" },
    { label: "FAMILY HUB", href: "/discounts/family-hub.html" },
    { label: "PROGRAMMING", href: "/discounts/programming.html" },
    { label: "HOUSING + LAND FOR SALE", href: "/discounts/housing-land-for-sale.html" },
    { label: "RADIO + COMMUNICATION", href: "/discounts/radio-communication.html" },
    { label: "JOBS BOARD", href: "/discounts/jobs-board.html" }
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Discounts</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 24px;
      background: linear-gradient(180deg, #020617 0%, #0f172a 52%, #111827 100%);
      color: #f8fafc;
      font-family: Arial, sans-serif;
    }
    main {
      width: min(100%, 760px);
      margin: 0 auto;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 1000;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #facc15;
    }
    h1 {
      margin: 6px 0 0;
      font-size: 34px;
      line-height: 1.05;
      font-weight: 1000;
    }
    a.back {
      border: 1px solid rgba(148, 163, 184, .3);
      border-radius: 999px;
      background: rgba(15, 23, 42, .9);
      color: #f8fafc;
      text-decoration: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 900;
      padding: 9px 14px;
    }
    .links {
      display: grid;
      gap: 10px;
    }
    .links a {
      display: block;
      padding: 14px 16px;
      border-radius: 14px;
      background: rgba(15, 23, 42, .86);
      border: 1px solid rgba(148, 163, 184, .22);
      color: #f8fafc;
      text-decoration: none;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: .3px;
      box-shadow: 0 10px 30px rgba(0,0,0,.22);
    }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <div class="eyebrow">Discounts</div>
        <h1>Quick links stacked one under another</h1>
      </div>
      <a class="back" href="/">Back</a>
    </div>
    <div class="links">
      ${links.map(link => `<a href="${link.href}">${link.label}</a>`).join("")}
    </div>
  </main>
</body>
</html>`;
}

function discountItemPageHtml(title, description) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #020617;
      color: #f8fafc;
      font-family: Arial, sans-serif;
      padding: 24px;
      text-align: center;
    }
    main {
      width: min(100%, 720px);
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 1000;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #facc15;
    }
    h1 {
      margin: 8px 0 12px;
      font-size: 34px;
      line-height: 1.05;
      font-weight: 1000;
    }
    p {
      margin: 0 0 18px;
      color: #cbd5e1;
      font-size: 16px;
      line-height: 1.5;
    }
    a {
      display: inline-block;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(15, 23, 42, .9);
      color: #f8fafc;
      text-decoration: none;
      border: 1px solid rgba(148, 163, 184, .3);
      font-weight: 900;
    }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Discounts</div>
    <h1>${title}</h1>
    <p>${description}</p>
    <a href="/discounts">Back to Discounts</a>
  </main>
</body>
</html>`;
}

function blankPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You are banned</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100vh;
      background: #000;
      color: #fff;
      font-family: Arial, sans-serif;
    }
    body {
      display: grid;
      place-items: center;
    }
    main {
      width: min(90vw, 420px);
      display: grid;
      gap: 14px;
      justify-items: center;
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: 0;
      text-transform: lowercase;
    }
    .unban {
      display: grid;
      gap: 10px;
      width: min(100%, 320px);
    }
    input {
      border: 1px solid rgba(255, 255, 255, .28);
      background: #111;
      color: #fff;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 16px;
      font-weight: 800;
      text-align: center;
    }
    button {
      border: 1px solid rgba(255, 255, 255, .28);
      background: #111;
      color: #fff;
      border-radius: 8px;
      padding: 12px 18px;
      font-size: 16px;
      font-weight: 900;
      cursor: pointer;
    }
    button:hover {
      border-color: rgba(255, 255, 255, .72);
    }
    .status {
      min-height: 18px;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main>
    <h1>you are banned</h1>
    <form id="blankUnbanForm" class="unban">
      <input id="blankUnbanPassword" type="password" placeholder="Enter password to unban" autocomplete="current-password" />
      <button type="submit">Unban</button>
      <div id="blankUnbanStatus" class="status"></div>
    </form>
    <button id="ownerRestoreButton" type="button">Owner</button>
  </main>
  <script>
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "FUITS_SITE_BLANKED", url: window.location.href }, "*");
      }
      if (window.top && window.top !== window) {
        window.top.location.href = window.location.href;
      }
    } catch {}

    async function restoreSite(password, statusElement) {
      const res = await fetch("/admin/site-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, blank: false })
      });

      if (!res.ok) {
        if (statusElement) statusElement.textContent = "Wrong password.";
        else window.alert("Wrong password.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const returnUrl = params.get("returnUrl");
      if (returnUrl) {
        try {
          const next = new URL(returnUrl);
          const allowed =
            next.hostname === window.location.hostname ||
            next.hostname === "localhost" ||
            next.hostname === "127.0.0.1" ||
            next.hostname.endsWith(".trycloudflare.com") ||
            next.hostname === "flivetv.qzz.io" ||
            next.hostname.endsWith(".flivetv.qzz.io") ||
            next.hostname.endsWith(".vercel.app");

          if (allowed) {
            next.searchParams.set("fuitsRestored", Date.now().toString());
            window.location.replace(next.href);
            return;
          }
        } catch {}
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = "/";
    }

    document.getElementById("blankUnbanForm").addEventListener("submit", async event => {
      event.preventDefault();
      const password = document.getElementById("blankUnbanPassword").value;
      const status = document.getElementById("blankUnbanStatus");
      if (!password) {
        status.textContent = "Enter password.";
        return;
      }
      status.textContent = "Checking...";
      await restoreSite(password, status);
    });

    document.getElementById("ownerRestoreButton").addEventListener("click", async () => {
      const password = window.prompt("Owner password");
      if (!password) return;
      await restoreSite(password);
    });
  </script>
</body>
</html>`;
}

function bannedPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You are banned</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100vh;
      background: #000;
      color: #fff;
      font-family: Arial, sans-serif;
    }
    body {
      display: grid;
      place-items: center;
    }
    main {
      width: min(90vw, 460px);
      display: grid;
      gap: 14px;
      justify-items: center;
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: 0;
      text-transform: lowercase;
    }
    .unban {
      display: grid;
      gap: 10px;
      width: min(100%, 320px);
      margin-top: 4px;
    }
    input {
      border: 1px solid rgba(255, 255, 255, .28);
      background: #111;
      color: #fff;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 16px;
      font-weight: 800;
      text-align: center;
    }
    button {
      border: 1px solid rgba(255, 255, 255, .28);
      background: #111;
      color: #fff;
      border-radius: 8px;
      padding: 12px 18px;
      font-size: 16px;
      font-weight: 900;
      cursor: pointer;
    }
    button:hover {
      border-color: rgba(255, 255, 255, .72);
    }
    .status {
      min-height: 18px;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main>
    <h1>you are banned</h1>
    <form id="unbanForm" class="unban">
      <input id="unbanPassword" type="password" placeholder="Enter password to unban" autocomplete="current-password" />
      <button type="submit">Unban</button>
      <div id="unbanStatus" class="status"></div>
    </form>
  </main>
  <script>
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "FUITS_SITE_BLANKED", url: window.location.href }, "*");
      }
      if (window.top && window.top !== window) {
        window.top.location.href = window.location.href;
      }
    } catch {}

    document.getElementById("unbanForm").addEventListener("submit", async event => {
      event.preventDefault();
      const password = document.getElementById("unbanPassword").value;
      const status = document.getElementById("unbanStatus");
      if (!password) {
        status.textContent = "Enter password.";
        return;
      }

      status.textContent = "Checking...";
      const res = await fetch("/admin/access-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action: "unblockCurrent" })
      });

      if (!res.ok) {
        status.textContent = "Wrong password.";
        return;
      }

      status.textContent = "Unbanned. Reloading...";
      window.location.href = "/?unbanned=" + Date.now();
    });
  </script>
</body>
</html>`;
}

function ownerPageHtml() {
  const state = readSiteBlankState();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FUITS Owner</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #020617;
      color: #f8fafc;
      font-family: Arial, sans-serif;
    }
    main {
      width: min(92vw, 760px);
      display: grid;
      gap: 12px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0;
    }
    input, button, select {
      width: 100%;
      box-sizing: border-box;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid rgba(248, 250, 252, .22);
      font-size: 16px;
    }
    input, select {
      background: #0f172a;
      color: #f8fafc;
    }
    button {
      background: #67e8f9;
      color: #020617;
      font-weight: 900;
      cursor: pointer;
    }
    .status {
      min-height: 22px;
      color: #cbd5e1;
      font-weight: 700;
    }
    .panel {
      display: grid;
      gap: 10px;
      border: 1px solid rgba(148, 163, 184, .24);
      border-radius: 8px;
      padding: 12px;
      background: rgba(15, 23, 42, .62);
    }
    h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #cbd5e1;
      font-weight: 800;
    }
    .check input {
      width: auto;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      min-height: 42px;
      color: #cbd5e1;
      font: 13px/1.45 Consolas, monospace;
    }
    @media (max-width: 620px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>FUITS Owner</h1>
    <div id="status" class="status">Site is ${state.blank ? "blank" : "visible"}.</div>
    <input id="password" type="password" placeholder="Owner password" autocomplete="current-password" />
    <button id="showButton" type="button">Show Site</button>
    <button id="blankButton" type="button">Blank Site</button>
    <section class="panel" aria-label="Video Repair">
      <h2>Video Repair</h2>
      <div class="row">
        <button id="repairScanButton" type="button">Check Videos</button>
        <button id="repairRunButton" type="button">Repair Flagged</button>
      </div>
      <select id="repairAction" aria-label="Repair action">
        <option value="syncfix">Fix Audio Timing</option>
        <option value="remux">Remux Only</option>
      </select>
      <select id="repairFinish" aria-label="After repair">
        <option value="keep">Keep Fixed Copy</option>
        <option value="overwrite">Fix Original And Overwrite</option>
        <option value="replace">Replace Original With Fixed Copy</option>
        <option value="delete">Delete Fixed Copy After Test</option>
      </select>
      <label class="check">
        <input id="repairOverwrite" type="checkbox" />
        Overwrite existing fixed copy
      </label>
      <div class="row">
        <button id="repairBackupsButton" type="button">Load Old Backups</button>
        <button id="repairRestoreButton" type="button">Restore Old Backup</button>
      </div>
      <select id="repairBackupSelect" aria-label="Choose old backup">
        <option value="">No old backups loaded</option>
      </select>
      <pre id="repairResults">Run a check or load old backups.</pre>
    </section>
  </main>
  <script>
    const status = document.getElementById("status");
    const password = document.getElementById("password");
    const repairResults = document.getElementById("repairResults");
    const repairAction = document.getElementById("repairAction");
    const repairFinish = document.getElementById("repairFinish");
    const repairOverwrite = document.getElementById("repairOverwrite");
    const repairBackupSelect = document.getElementById("repairBackupSelect");

    function setRepairResults(message) {
      repairResults.textContent = message;
    }

    async function postAdminJson(url, payload) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ password: password.value }, payload || {}))
      });
      if (!res.ok) {
        throw new Error(await res.text() || "Request failed.");
      }
      return res.json();
    }

    async function setBlank(blank) {
      const res = await fetch("/admin/site-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value, blank })
      });
      if (!res.ok) {
        status.textContent = "Wrong password.";
        return;
      }
      const state = await res.json();
      status.textContent = state.blank ? "Site is blank." : "Site is visible.";
    }

    async function checkVideoRepairs() {
      try {
        setRepairResults("Checking videos...");
        const result = await postAdminJson("/admin/video-repair-scan");
        const flagged = result.flagged || [];
        setRepairResults(
          "Checked " + result.checked + " videos. Flagged " + result.flaggedCount + ".\\n" +
          (flagged.length ? flagged.map(item => "- " + item.relativePath + " diff " + item.durationDiffSeconds + "s").join("\\n") : "No timing problems found.")
        );
      } catch (error) {
        setRepairResults(error.message || "Video check failed.");
      }
    }

    async function runVideoRepairs() {
      try {
        if (!window.confirm("Repair every flagged video from the last check?")) return;
        setRepairResults("Repairing flagged videos...");
        const result = await postAdminJson("/admin/video-repair-run", {
          all: true,
          action: repairAction.value,
          finish: repairFinish.value,
          overwriteExisting: repairOverwrite.checked
        });
        setRepairResults(
          "Repair finished.\\n" +
          result.results.map(item => "- " + item.fileName + ": " + item.status + (item.message ? " - " + item.message : "")).join("\\n")
        );
      } catch (error) {
        setRepairResults(error.message || "Video repair failed.");
      }
    }

    async function loadVideoRepairBackups() {
      try {
        setRepairResults("Loading old backups...");
        const result = await postAdminJson("/admin/video-repair-backups");
        repairBackupSelect.innerHTML = "";
        if (!result.backups.length) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "No old backups found";
          repairBackupSelect.appendChild(option);
          setRepairResults("No old backups found.");
          return;
        }
        result.backups.forEach(backup => {
          const option = document.createElement("option");
          option.value = backup.path;
          option.textContent = backup.targetRelativePath + " - " + new Date(backup.modifiedAt).toLocaleString();
          repairBackupSelect.appendChild(option);
        });
        setRepairResults("Loaded " + result.backups.length + " old backup" + (result.backups.length === 1 ? "." : "s."));
      } catch (error) {
        setRepairResults(error.message || "Could not load old backups.");
      }
    }

    async function restoreVideoRepairBackup() {
      try {
        if (!repairBackupSelect.value) {
          setRepairResults("Load and choose an old backup first.");
          return;
        }
        if (!window.confirm("Restore the old backup over the current video? The current newer copy will be deleted.")) return;
        setRepairResults("Restoring old backup...");
        const result = await postAdminJson("/admin/video-repair-restore", {
          backupPath: repairBackupSelect.value
        });
        setRepairResults(result.message + "\\n" + result.relativePath);
        await loadVideoRepairBackups();
      } catch (error) {
        setRepairResults(error.message || "Restore failed.");
      }
    }

    document.getElementById("showButton").addEventListener("click", () => setBlank(false));
    document.getElementById("blankButton").addEventListener("click", () => setBlank(true));
    document.getElementById("repairScanButton").addEventListener("click", checkVideoRepairs);
    document.getElementById("repairRunButton").addEventListener("click", runVideoRepairs);
    document.getElementById("repairBackupsButton").addEventListener("click", loadVideoRepairBackups);
    document.getElementById("repairRestoreButton").addEventListener("click", restoreVideoRepairBackup);
  </script>
</body>
</html>`;
}
function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FUITS LIVE TV WORLD</title>
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #050816;
      color: #f8fafc;
      font-family: Arial, sans-serif;
      display: grid;
      justify-items: center;
      align-items: start;
    }
    main {
      width: 100%;
      max-width: 980px;
      padding: 0 12px 10px;
      overflow-x: hidden;
    }
    .channel-select {
      border: 1px solid rgba(148, 163, 184, .28);
      background: rgba(15, 23, 42, .9);
      color: #f8fafc;
      border-radius: 8px;
      padding: 6px 8px;
      font-weight: 900;
      font-size: 12px;
      width: min(100%, 220px);
      margin-top: 4px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 6px;
    }
    .title-stack {
      display: grid;
      gap: 4px;
    }
    .livestream-active {
      color: #f87171;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }
    .live {
      border: 1px solid rgba(248, 113, 113, .6);
      background: rgba(127, 29, 29, .72);
      color: #fff;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    video {
      width: 100%;
      max-height: 72vh;
      aspect-ratio: 16 / 9;
      background: #000;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 8px;
      display: block;
      object-fit: contain;
    }
    video::-webkit-media-controls-timeline {
      pointer-events: none !important;
    }
    .live-video {
      width: 100%;
      max-height: 72vh;
      aspect-ratio: 16 / 9;
      border: 1px solid rgba(248, 113, 113, .42);
      border-radius: 8px;
      background: #020617;
      display: block;
      object-fit: contain;
    }
    video:fullscreen,
    .live-video:fullscreen {
      width: 100vw;
      height: 100vh;
      max-height: none;
      aspect-ratio: auto;
      border: 0;
      border-radius: 0;
      object-fit: contain;
    }
    .stretch-video:fullscreen {
      object-fit: fill;
    }
    .now {
      margin-top: 10px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.35;
    }
    .now.live-now {
      color: #ef4444;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .controls {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .discounts-section {
      margin-top: 10px;
      border-radius: 10px;
    }
    .discounts-header {
      width: 100%;
      border: none;
      border-bottom: 1px solid rgba(148,163,184,.12);
      background: rgba(2,6,23,.46);
      color: #f8fafc;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .discounts-label {
      font-size: 12px;
      font-weight: 1000;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: .9px;
    }
    .discounts-count {
      color: #94a3b8;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .discounts-links {
      display: grid;
      gap: 6px;
    }
    .discounts-links button {
      display: block;
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(15,23,42,.42);
      color: #f8fafc;
      border: 1px solid transparent;
      text-align: left;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: .2px;
      cursor: pointer;
    }
    .chat {
      margin-top: 6px;
      border: 1px solid rgba(148, 163, 184, .24);
      border-radius: 8px;
      background: rgba(15, 23, 42, .72);
      overflow: hidden;
      max-width: 100%;
    }
    .chat-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(148, 163, 184, .18);
      font-size: 12px;
      font-weight: 900;
      min-width: 0;
      overflow: hidden;
    }
    .chat-log {
      height: 72px;
      overflow-y: auto;
      padding: 6px 8px;
      display: grid;
      align-content: start;
      gap: 4px;
      font-size: 12px;
    }
    .chat-message {
      color: #e2e8f0;
      overflow-wrap: anywhere;
    }
    body.adult-relax-grid .chat:fullscreen .chat-log {
      padding: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-rows: minmax(0, 1fr);
      align-content: stretch;
      gap: 10px;
      overflow: hidden;
    }
    body.adult-relax-grid .chat:fullscreen .chat-message {
      min-height: 0;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 10px;
      background: rgba(2, 6, 23, .72);
      padding: 10px;
      overflow: auto;
    }
    body.adult-relax-grid .chat:fullscreen .chat-message.empty-slot {
      border-style: dashed;
      color: #64748b;
      display: grid;
      place-items: center;
      text-align: center;
      font-weight: 900;
    }
    .chat-name {
      color: #93c5fd;
      font-weight: 900;
    }
    .chat-form {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, .75fr) auto;
      gap: 6px;
      padding: 6px;
      border-top: 1px solid rgba(148, 163, 184, .18);
      max-width: 100%;
    }
    .chat-form.needs-name {
      grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr) minmax(0, .75fr) auto;
    }
    .chat-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 58%;
      overflow: hidden;
    }
    #chatSavedName {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name-change {
      padding: 0;
      border: none;
      background: transparent;
      color: #93c5fd;
      font-size: 12px;
      font-weight: 900;
    }
    .chat-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
      max-width: 68%;
      overflow: hidden;
    }
    .chat-full-button {
      padding: 3px 6px;
      border-radius: 6px;
      font-size: 10px;
      line-height: 1;
      flex: 0 0 auto;
    }
    body.chat-soft-fullscreen-active {
      overflow: hidden;
    }
    .chat:fullscreen,
    .chat:-webkit-full-screen,
    .chat.chat-soft-fullscreen-active {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      margin: 0;
      border-radius: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: #050816;
    }
    .chat:fullscreen .chat-log,
    .chat:-webkit-full-screen .chat-log,
    .chat.chat-soft-fullscreen-active .chat-log {
      height: auto;
      font-size: 16px;
      padding: 12px;
    }
    .chat:fullscreen .chat-form,
    .chat:-webkit-full-screen .chat-form,
    .chat.chat-soft-fullscreen-active .chat-form {
      padding: 10px;
    }
    .chat-gif {
      display: block;
      max-width: 96px;
      max-height: 64px;
      border-radius: 8px;
      margin-top: 4px;
    }
    .gif-field {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      position: relative;
    }
    .gif-field select {
      flex: 1;
    }
    .gif-preview {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, .28);
      background: #020617;
      object-fit: cover;
      display: none;
      flex: 0 0 auto;
      z-index: 2;
      transition: transform .12s ease, width .12s ease, height .12s ease;
    }
    .gif-preview.visible {
      display: block;
    }
    .gif-preview.visible:hover,
    .gif-preview.visible:focus {
      width: 118px;
      height: 88px;
      object-fit: contain;
      transform: translateY(-28px);
      background: #020617;
      box-shadow: 0 12px 30px rgba(0, 0, 0, .45);
    }
    input,
    select {
      min-width: 0;
      border: 1px solid rgba(148, 163, 184, .28);
      background: #020617;
      color: #f8fafc;
      border-radius: 8px;
      padding: 8px 9px;
      font-weight: 700;
    }
    button {
      border: 1px solid rgba(148, 163, 184, .28);
      background: rgba(15, 23, 42, .9);
      color: #f8fafc;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      font-weight: 700;
    }
    button:hover {
      border-color: rgba(248, 250, 252, .55);
    }
    .sound-button {
      background: #f8fafc;
      color: #020617;
      border-color: #f8fafc;
      font-size: 15px;
      padding: 10px 14px;
    }
    .empty {
      border: 1px solid rgba(148, 163, 184, .24);
      border-radius: 8px;
      padding: 20px;
      color: #cbd5e1;
      background: rgba(15, 23, 42, .75);
    }
    .donate-strip {
      margin-top: 6px;
      border: 1px solid rgba(56, 189, 248, .28);
      border-radius: 8px;
      padding: 6px 8px;
      background: rgba(15, 23, 42, .82);
      color: #e0f2fe;
      font-size: 9px;
      font-weight: 900;
      line-height: 1.25;
      overflow-wrap: anywhere;
      max-width: 100%;
      overflow: hidden;
      text-align: center;
    }
    .donate-strip span {
      color: #67e8f9;
    }
    .donate-qrs {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 5px;
    }
    .donate-qr {
      display: grid;
      gap: 3px;
      justify-items: center;
      color: #cbd5e1;
      font-size: 8px;
      letter-spacing: 0;
    }
    .donate-qr-button {
      display: block;
      padding: 0;
      border: 0;
      background: transparent;
      border-radius: 6px;
      line-height: 0;
    }
    .donate-qr-button:focus-visible {
      outline: 2px solid #67e8f9;
      outline-offset: 2px;
    }
    .donate-qr img {
      width: 46px;
      height: 46px;
      object-fit: cover;
      border-radius: 6px;
      background: #fff;
      border: 1px solid rgba(248, 250, 252, .25);
    }
    .qr-modal {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(2, 6, 23, .86);
    }
    .qr-modal-inner {
      display: grid;
      gap: 10px;
      justify-items: center;
      max-width: min(92vw, 420px);
      color: #f8fafc;
      font-size: 14px;
      font-weight: 900;
    }
    .qr-modal img {
      width: min(82vw, 360px);
      max-height: 72vh;
      object-fit: contain;
      border-radius: 12px;
      background: #fff;
      border: 1px solid rgba(248, 250, 252, .35);
      box-shadow: 0 20px 60px rgba(0, 0, 0, .55);
    }
    .qr-modal button {
      background: #f8fafc;
      color: #020617;
      border-color: #f8fafc;
    }
    @media (max-width: 520px) {
      .chat-form {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div class="title-stack">
        <div id="liveActiveIndicator" class="livestream-active" hidden>LIVESTREAM ACTIVE</div>
        <h1>FUITS LIVE TV WORLD</h1>
        <select id="channelSelect" class="channel-select" aria-label="Choose channel">
          ${getChannels().map(channel => `<option value="${channel.id}">${channel.label}</option>`).join("")}
        </select>
      </div>
      <div class="live">LIVE</div>
    </div>
    <div id="empty" class="empty" hidden>No MP4s found in the playlist yet.</div>
    <video id="player" controls controlsList="noplaybackrate nodownload noremoteplayback" disablePictureInPicture autoplay muted playsinline preload="auto"></video>
    <video id="livePlayer" class="live-video" controls controlsList="noplaybackrate nodownload noremoteplayback" disablePictureInPicture muted playsinline hidden></video>
    <div class="now" id="now">Loading channel...</div>
    <div class="controls">
      <button id="unmuteButton" class="sound-button" type="button">Unmute</button>
      <button id="nextButton" type="button">Next</button>
      <button id="previousButton" type="button">Back</button>
      <button id="stretchButton" type="button">Stretch Fullscreen</button>
      <button id="ownerUnlockButton" type="button">Owner</button>
      <button id="shuffleButton" type="button">Shuffle Playlist</button>
      <button id="discountsButton" type="button">Discounts</button>
      <button id="blankSiteButton" type="button" hidden>Blank Site</button>
    </div>
    <section class="discounts-section" aria-label="Discounts">
      <button id="discountsHeader" class="discounts-header" type="button">
        <span class="discounts-label">Discounts</span>
        <span class="discounts-count">7 links</span>
      </button>
      <div id="discountsLinks" class="discounts-links">
        <button type="button" data-discount-link="/discounts/available-residence.html">AVAILABLE RESIDENCE</button>
        <button type="button" data-discount-link="/discounts/emergency-planning.html">EMERGENCY PLANNING!</button>
        <button type="button" data-discount-link="/discounts/family-hub.html">FAMILY HUB</button>
        <button type="button" data-discount-link="/discounts/programming.html">PROGRAMMING</button>
        <button type="button" data-discount-link="/discounts/housing-land-for-sale.html">HOUSING + LAND FOR SALE</button>
        <button type="button" data-discount-link="/discounts/radio-communication.html">RADIO + COMMUNICATION</button>
        <button type="button" data-discount-link="/discounts/jobs-board.html">JOBS BOARD</button>
      </div>
    </section>
    <section class="chat" aria-label="Live chat">
      <div class="chat-head">
        <span>Live Chat</span>
        <span class="chat-actions">
          <span class="chat-name-row"><span id="chatSavedName"></span><button id="changeNameButton" class="name-change" type="button" hidden>Change</button></span>
          <button id="chatFullscreenButton" class="chat-full-button" type="button">Full</button>
        </span>
      </div>
      <div id="chatLog" class="chat-log"></div>
      <form id="chatForm" class="chat-form">
        <input id="chatName" maxlength="24" placeholder="Name" autocomplete="nickname" />
        <input id="chatMessage" maxlength="220" placeholder="Message" autocomplete="off" />
        <div class="gif-field">
          <select id="chatGif" aria-label="Choose GIF">
            <option value="">GIF</option>
          </select>
          <img id="gifPreview" class="gif-preview" alt="GIF preview" tabindex="0" />
        </div>
        <button type="submit">Send</button>
      </form>
    </section>
    <div class="donate-strip">
      <div class="donate-qrs">
        <div class="donate-qr">
          <button class="donate-qr-button" type="button" data-qr-src="/donation-qrs/paypal.jpeg" data-qr-label="PayPal">
            <img src="/donation-qrs/paypal.jpeg" alt="PayPal QR" />
          </button>
          <strong>PayPal</strong>
        </div>
        <div class="donate-qr">
          <button class="donate-qr-button" type="button" data-qr-src="/donation-qrs/cashapp.jpg" data-qr-label="Cash App">
            <img src="/donation-qrs/cashapp.jpg" alt="Cash App QR" />
          </button>
          <strong>Cash App</strong>
        </div>
      </div>
      DONATE VIA SOLONA <span>8BEogzpRAUM92NCYAhhFdf4gmoV3gNyDmQHZYoEfVbKB</span>
    </div>
    <div id="qrModal" class="qr-modal" hidden>
      <div class="qr-modal-inner">
        <div id="qrModalTitle"></div>
        <img id="qrModalImage" alt="Donation QR zoom" />
        <button id="qrModalClose" type="button">Close</button>
      </div>
    </div>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
  <script>
    const player = document.getElementById("player");
    const livePlayer = document.getElementById("livePlayer");
    const now = document.getElementById("now");
    const empty = document.getElementById("empty");
    const liveActiveIndicator = document.getElementById("liveActiveIndicator");
    const unmuteButton = document.getElementById("unmuteButton");
    const nextButton = document.getElementById("nextButton");
    const previousButton = document.getElementById("previousButton");
    const stretchButton = document.getElementById("stretchButton");
    const ownerUnlockButton = document.getElementById("ownerUnlockButton");
    const shuffleButton = document.getElementById("shuffleButton");
    const discountsButton = document.getElementById("discountsButton");
    const discountsHeader = document.getElementById("discountsHeader");
    const discountsLinks = document.getElementById("discountsLinks");
    const blankSiteButton = document.getElementById("blankSiteButton");
    const chatSection = document.querySelector(".chat");
    const chatLog = document.getElementById("chatLog");
    const chatForm = document.getElementById("chatForm");
    const chatName = document.getElementById("chatName");
    const chatMessage = document.getElementById("chatMessage");
    const chatGif = document.getElementById("chatGif");
    const gifPreview = document.getElementById("gifPreview");
    const chatSavedName = document.getElementById("chatSavedName");
    const changeNameButton = document.getElementById("changeNameButton");
    const qrModal = document.getElementById("qrModal");
    const qrModalImage = document.getElementById("qrModalImage");
    const qrModalTitle = document.getElementById("qrModalTitle");
    const qrModalClose = document.getElementById("qrModalClose");
    const channelSelect = document.getElementById("channelSelect");
    const chatFullscreenButton = document.getElementById("chatFullscreenButton");
    let playlist = [];
    let currentIndex = 0;
    let currentItemId = null;
    let currentItemSrc = null;
    let syncMainPlayerToLive = () => {};
    let ownerPassword = "";
    let liveAnnouncementOnline = false;
    let liveHls = null;
    let lastAllowedPlayerTime = 0;
    let lastAllowedLiveTime = 0;
    let seekingLock = false;
    let playerStarted = false;
    let livePlayerStarted = false;
    let activeChannelId = new URLSearchParams(window.location.search).get("channel") || localStorage.getItem("fuitsLiveTvChannel") || "channel-a";
    let stretchFullscreenTarget = null;
    let chatSoftFullscreenActive = false;
    let soundUnlocked = localStorage.getItem("fuitsLiveTvSoundUnlocked") === "1";
    chatName.value = localStorage.getItem("fuitsLiveTvChatName") || "";

    function getPageFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || document.webkitFullScreenElement || document.msFullscreenElement || null;
    }

    async function requestPageElementFullscreen(element) {
      const requestFullscreen =
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.webkitRequestFullScreen ||
        element.msRequestFullscreen;
      if (!requestFullscreen) return false;
      try {
        const result = requestFullscreen.call(element);
        if (result?.then) await result;
        return true;
      } catch {
        return false;
      }
    }

    async function exitPageFullscreen() {
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
    }

    function setChatSoftFullscreenActive(active) {
      chatSoftFullscreenActive = Boolean(active);
      document.body.classList.toggle("chat-soft-fullscreen-active", chatSoftFullscreenActive);
      chatSection.classList.toggle("chat-soft-fullscreen-active", chatSoftFullscreenActive);
      chatFullscreenButton.textContent = chatSoftFullscreenActive ? "Exit" : "Full";
    }

    function isChatFullscreenActive() {
      return chatSoftFullscreenActive || getPageFullscreenElement() === chatSection;
    }

    function updateChatFullscreenUi() {
      chatFullscreenButton.textContent = isChatFullscreenActive() ? "Exit" : "Full";
    }

    function updateChatNameUi() {
      const savedName = localStorage.getItem("fuitsLiveTvChatName") || "";
      chatName.hidden = Boolean(savedName);
      chatForm.classList.toggle("needs-name", !savedName);
      chatSavedName.textContent = savedName ? savedName : "Clears after 4 hours";
      changeNameButton.hidden = !savedName;
    }

    function updateChannelSelect() {
      if (channelSelect.value !== activeChannelId) {
        channelSelect.value = activeChannelId;
      }
    }

    function updateStretchMode() {
      const stretchActive = document.fullscreenElement && document.fullscreenElement === stretchFullscreenTarget;
      player.classList.toggle("stretch-video", stretchActive && stretchFullscreenTarget === player);
      livePlayer.classList.toggle("stretch-video", stretchActive && stretchFullscreenTarget === livePlayer);
      stretchButton.textContent = "Stretch Fullscreen";
    }

    function applySoundPreference() {
      player.muted = !soundUnlocked;
      livePlayer.muted = !soundUnlocked;
      player.volume = 1;
      livePlayer.volume = 1;
      unmuteButton.hidden = soundUnlocked;
    }

    function rememberSoundUnlocked() {
      if (!player.muted && player.volume > 0) {
        soundUnlocked = true;
        localStorage.setItem("fuitsLiveTvSoundUnlocked", "1");
        unmuteButton.hidden = true;
      }
    }

    function playMainPlayerWithBrowserFallback() {
      player.play().catch(() => {
        if (!soundUnlocked) {
          player.muted = true;
          unmuteButton.hidden = false;
          player.play().catch(() => {});
        }
      });
    }

    function getBufferedAheadSeconds(video) {
      if (!video || !video.buffered || !video.buffered.length) return 0;
      for (let i = 0; i < video.buffered.length; i += 1) {
        if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
          return video.buffered.end(i) - video.currentTime;
        }
      }
      return 0;
    }

    function getStartupBufferSeconds() {
      return 0.2;
    }

    function playMainPlayerWhenBuffered() {
      playMainPlayerWithBrowserFallback();
    }

    function rememberAllowedPlaybackTime(video) {
      if (video === livePlayer) {
        lastAllowedLiveTime = Number(video.currentTime) || 0;
      } else {
        lastAllowedPlayerTime = Number(video.currentTime) || 0;
      }
    }

    function setProgrammaticVideoTime(video, time) {
      if (!video || !Number.isFinite(time)) return;
      seekingLock = true;
      try { video.currentTime = time; } catch {}
      setTimeout(() => {
        seekingLock = false;
        rememberAllowedPlaybackTime(video);
      }, 0);
    }

    function blockSeekWhilePlaying(video) {
      const started = video === livePlayer ? livePlayerStarted : playerStarted;
      if (!video || !started || video.ended || seekingLock) return;
      const allowedTime = video === livePlayer ? lastAllowedLiveTime : lastAllowedPlayerTime;
      seekingLock = true;
      try { video.currentTime = allowedTime; } catch {}
      setTimeout(() => { seekingLock = false; }, 0);
    }

    function blockSeekedWhilePlaying(video) {
      const started = video === livePlayer ? livePlayerStarted : playerStarted;
      if (!video || !started || video.ended || seekingLock) return;
      const allowedTime = video === livePlayer ? lastAllowedLiveTime : lastAllowedPlayerTime;
      if (Math.abs((Number(video.currentTime) || 0) - allowedTime) <= 0.35) return;
      seekingLock = true;
      try { video.currentTime = allowedTime; } catch {}
      setTimeout(() => { seekingLock = false; }, 0);
    }

    function renderChat(messages) {
      chatLog.innerHTML = "";
      if (!messages.length) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "chat-message";
        emptyMessage.textContent = "No messages yet.";
        chatLog.appendChild(emptyMessage);
        return;
      }

      messages.forEach(message => {
        const row = document.createElement("div");
        row.className = "chat-message";
        const name = document.createElement("span");
        name.className = "chat-name";
        name.textContent = message.name + ": ";
        row.appendChild(name);
        if (message.text) {
          row.appendChild(document.createTextNode(message.text));
        }
        if (message.gif) {
          const gif = document.createElement("img");
          gif.className = "chat-gif";
          gif.src = message.gif;
          gif.alt = "Chat GIF";
          row.appendChild(gif);
        }
        chatLog.appendChild(row);
      });
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function updateGifPreview() {
      if (!chatGif.value) {
        gifPreview.classList.remove("visible");
        gifPreview.removeAttribute("src");
        return;
      }

      gifPreview.src = chatGif.value;
      gifPreview.classList.add("visible");
    }

    async function loadChatGifs() {
      const res = await fetch("/chat/gifs?cache=" + Date.now(), { cache: "no-store" });
      const gifs = await res.json();
      chatGif.innerHTML = '<option value="">GIF</option>';
      gifs.forEach(gif => {
        const option = document.createElement("option");
        option.value = gif.src;
        option.textContent = gif.label;
        chatGif.appendChild(option);
      });
    }

    async function loadChat() {
      const res = await fetch("/chat/messages?cache=" + Date.now(), { cache: "no-store" });
      const messages = await res.json();
      renderChat(messages);
    }

    async function sendChat(event) {
      event.preventDefault();
      const name = chatName.value.trim() || "Viewer";
      const text = chatMessage.value.trim();
      const gif = chatGif.value;
      if (!text && !gif) return;

      localStorage.setItem("fuitsLiveTvChatName", name);
      updateChatNameUi();
      chatMessage.value = "";
      chatGif.value = "";
      updateGifPreview();

      const res = await fetch("/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, gif })
      });

      if (res.ok) {
        renderChat(await res.json());
      }
    }

    async function loadChannel() {
      const res = await fetch("/channel.json?channel=" + encodeURIComponent(activeChannelId) + "&cache=" + Date.now());
      return res.json();
    }

    function applyChannel(channel, options = {}) {
      const shouldPlay = options.autoplay !== false;
      const shouldUpdateNow = options.updateNow !== false;
      playlist = channel.playlist;
      currentIndex = channel.currentIndex;
      const item = playlist[currentIndex];
      if (!item) return;

      const isNewItem = item.id !== currentItemId || item.src !== currentItemSrc;
      if (isNewItem) {
        rememberSoundUnlocked();
        currentItemId = item.id;
        currentItemSrc = item.src;
        player.autoplay = true;
        const streamKey = encodeURIComponent(activeChannelId + "-" + item.id + "-" + (item.sizeBytes || item.duration || ""));
        player.src = item.src + (item.src.includes("?") ? "&" : "?") + "stream=" + streamKey;
        player.preload = "auto";
        player.load();
        applySoundPreference();
        playMainPlayerWithBrowserFallback();
      }

      const offset = Math.max(0, Math.min(channel.offsetSeconds || 0, Math.max(0, item.duration - 1)));
      const getLiveOffset = () => {
        const generatedAtMs = Number(channel.generatedAtMs);
        const elapsedSinceSnapshot = Number.isFinite(generatedAtMs) ? Math.max(0, (Date.now() - generatedAtMs) / 1000) : 0;
        return Math.max(0, offset + elapsedSinceSnapshot);
      };
      const syncTime = () => {
        if (!Number.isFinite(player.duration)) return;
        const rawLiveOffset = getLiveOffset();
        if (rawLiveOffset >= item.duration - 0.5) {
          syncChannel();
          return;
        }
        const liveOffset = Math.max(0, Math.min(rawLiveOffset, Math.max(0, item.duration - 1.5)));
        const driftSeconds = player.currentTime - liveOffset;
        if (Math.abs(driftSeconds) > 1.75) {
          setProgrammaticVideoTime(player, liveOffset);
          player.playbackRate = 1;
        } else {
          player.playbackRate = driftSeconds < -0.35 ? 1.08 : 1;
        }
      };
      syncMainPlayerToLive = syncTime;

      if (isNewItem && player.readyState >= 1) {
        syncTime();
        if (shouldPlay) playMainPlayerWhenBuffered();
      } else if (isNewItem) {
        player.addEventListener("loadedmetadata", () => {
          syncTime();
          if (shouldPlay) playMainPlayerWhenBuffered();
        }, { once: true });
      } else {
        syncTime();
        if (shouldPlay) playMainPlayerWhenBuffered();
      }

      if (shouldUpdateNow) {
        now.classList.remove("live-now");
        now.textContent = channel.channel.label + " now playing: " + item.title;
      }
    }

    function unmutePlayer() {
      soundUnlocked = true;
      localStorage.setItem("fuitsLiveTvSoundUnlocked", "1");
      applySoundPreference();
      player.play().catch(() => {});
      livePlayer.play().catch(() => {});
    }

    function activeVideoPlayer() {
      return livePlayer.hidden ? player : livePlayer;
    }

    async function toggleStretchMode() {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        return;
      }

      const video = activeVideoPlayer();
      if (!video || video.hidden || !video.requestFullscreen) return;
      stretchFullscreenTarget = video;
      updateStretchMode();
      await video.requestFullscreen().then(updateStretchMode).catch(() => {
        stretchFullscreenTarget = null;
        updateStretchMode();
      });
    }

    function playLiveWithBrowserFallback() {
      livePlayer.play().catch(() => {
        livePlayer.muted = true;
        unmuteButton.hidden = false;
        livePlayer.play().catch(() => {});
      });
    }

    function restartLiveAnnouncementPlayer() {
      stopLiveAnnouncementPlayer();
      setTimeout(() => {
        if (liveAnnouncementOnline) startLiveAnnouncementPlayer();
      }, 1000);
    }

    function startLiveAnnouncementPlayer() {
      const liveSrc = "/owncast-hls/stream.m3u8";
      applySoundPreference();

      if (livePlayer.canPlayType("application/vnd.apple.mpegurl")) {
        if (livePlayer.getAttribute("src") !== liveSrc) {
          livePlayer.src = liveSrc;
          livePlayer.load();
        }
        playLiveWithBrowserFallback();
      } else if (window.Hls && window.Hls.isSupported()) {
        if (!liveHls) {
          liveHls = new window.Hls({ liveSyncDurationCount: 2 });
          liveHls.on(window.Hls.Events.MANIFEST_PARSED, playLiveWithBrowserFallback);
          liveHls.on(window.Hls.Events.ERROR, (event, data) => {
            if (data && data.fatal) {
              if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                liveHls.recoverMediaError();
              } else {
                restartLiveAnnouncementPlayer();
              }
            }
          });
          liveHls.loadSource(liveSrc);
          liveHls.attachMedia(livePlayer);
        } else {
          playLiveWithBrowserFallback();
        }
      }

    }

    function stopLiveAnnouncementPlayer() {
      livePlayer.pause();
      livePlayer.removeAttribute("src");
      livePlayer.load();
      if (liveHls) {
        liveHls.destroy();
        liveHls = null;
      }
    }

    async function syncChannel(options = {}) {
      if (liveAnnouncementOnline) return;

      const channel = await loadChannel();
      activeChannelId = channel.channel.id;
      updateChannelSelect();
      playlist = channel.playlist;
      if (!playlist.length) {
        player.hidden = true;
        empty.hidden = false;
        now.textContent = "Add MP4s to T:\\\\FattysLiveTV\\\\Videos, then update the playlist.";
        return;
      }

      empty.hidden = true;
      player.hidden = false;
      applyChannel(channel, options);
    }

    async function warmMainPlayerWhileLive() {
      try {
        const channel = await loadChannel();
        activeChannelId = channel.channel.id;
        updateChannelSelect();
        playlist = channel.playlist;
        if (!playlist.length) return;
        applyChannel(channel, { autoplay: false, updateNow: false });
        player.pause();
      } catch {}
    }

    async function checkLiveAnnouncement() {
      try {
        const res = await fetch("/owncast-status?cache=" + Date.now(), { cache: "no-store" });
        const status = await res.json();
        liveAnnouncementOnline = Boolean(status.online);
      } catch {
        liveAnnouncementOnline = false;
      }

      if (liveAnnouncementOnline) {
        player.pause();
        player.hidden = true;
        livePlayer.hidden = false;
        empty.hidden = true;
        liveActiveIndicator.hidden = true;
        await warmMainPlayerWhileLive();
        startLiveAnnouncementPlayer();
        now.classList.add("live-now");
        now.textContent = "LIVE";
        return;
      }

      liveActiveIndicator.hidden = true;
      livePlayer.hidden = true;
      now.classList.remove("live-now");
      stopLiveAnnouncementPlayer();
      await syncChannel();
    }

    async function unlockOwnerControls() {
      const password = window.prompt("Owner password");
      if (!password) return;

      const res = await fetch("/admin/site-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, blank: true })
      });

      if (!res.ok) {
        window.alert("Wrong password or blank mode failed.");
        return;
      }

      window.location.href = "/";
    }

    async function shufflePlaylist() {
      const password = window.prompt("Shuffle password");
      if (!password) return;

      const res = await fetch("/admin/shuffle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channel: activeChannelId })
      });

      if (!res.ok) {
        window.alert("Wrong password or shuffle failed.");
        return;
      }

      await syncChannel();
    }

    async function nextVideo() {
      const password = window.prompt("Next password");
      if (!password) return;

      const res = await fetch("/admin/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channel: activeChannelId })
      });

      if (!res.ok) {
        window.alert("Wrong password or next failed.");
        return;
      }

      currentItemId = null;
      currentItemSrc = null;
      await syncChannel();
    }

    async function previousVideo() {
      const password = window.prompt("Back password");
      if (!password) return;

      const res = await fetch("/admin/previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channel: activeChannelId })
      });

      if (!res.ok) {
        window.alert("Wrong password or back failed.");
        return;
      }

      currentItemId = null;
      currentItemSrc = null;
      await syncChannel();
    }

    async function blankSite() {
      if (!ownerPassword) return;
      if (!window.confirm("Blank the FUITS site for everyone? You can restore it at /owner.")) return;

      const res = await fetch("/admin/site-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: ownerPassword, blank: true })
      });

      if (!res.ok) {
        window.alert("Wrong password or blank mode failed.");
        return;
      }

      window.location.href = "/owner";
    }

    function switchChannel(channelId) {
      activeChannelId = channelId;
      localStorage.setItem("fuitsLiveTvChannel", channelId);
      currentItemId = null;
      currentItemSrc = null;
      playerStarted = false;
      lastAllowedPlayerTime = 0;
      updateChannelSelect();
      syncChannel({ autoplay: true });
    }

    async function handleMainPlayerEnded() {
      let attempts = 0;
      async function pollForNextItem() {
        attempts += 1;
        currentItemId = null;
        currentItemSrc = null;
        await syncChannel();
        if (player.ended && attempts < 8) {
          setTimeout(pollForNextItem, 1000);
        }
      }
      pollForNextItem();
    }

    player.addEventListener("ended", handleMainPlayerEnded);
    player.addEventListener("progress", playMainPlayerWhenBuffered);
    player.addEventListener("canplay", playMainPlayerWithBrowserFallback);
    player.addEventListener("play", rememberSoundUnlocked);
    player.addEventListener("volumechange", rememberSoundUnlocked);
    player.addEventListener("playing", () => {
      playerStarted = true;
      rememberAllowedPlaybackTime(player);
    });
    player.addEventListener("timeupdate", () => { if (!seekingLock) rememberAllowedPlaybackTime(player); });
    player.addEventListener("seeking", () => blockSeekWhilePlaying(player));
    player.addEventListener("seeked", () => blockSeekedWhilePlaying(player));
    livePlayer.addEventListener("playing", () => {
      livePlayerStarted = true;
      rememberAllowedPlaybackTime(livePlayer);
    });
    livePlayer.addEventListener("timeupdate", () => { if (!seekingLock) rememberAllowedPlaybackTime(livePlayer); });
    livePlayer.addEventListener("seeking", () => blockSeekWhilePlaying(livePlayer));
    livePlayer.addEventListener("seeked", () => blockSeekedWhilePlaying(livePlayer));
    unmuteButton.addEventListener("click", unmutePlayer);
    nextButton.addEventListener("click", nextVideo);
    previousButton.addEventListener("click", previousVideo);
    stretchButton.addEventListener("click", toggleStretchMode);
    ownerUnlockButton.addEventListener("click", unlockOwnerControls);
    shuffleButton.addEventListener("click", shufflePlaylist);
    discountsButton.addEventListener("click", () => {
      window.location.href = "/discounts";
    });
    discountsHeader.addEventListener("click", () => {
      discountsLinks.hidden = !discountsLinks.hidden;
    });
    document.querySelectorAll("[data-discount-link]").forEach(button => {
      button.addEventListener("click", () => {
        window.location.href = button.getAttribute("data-discount-link");
      });
    });
    blankSiteButton.addEventListener("click", blankSite);
    chatForm.addEventListener("submit", sendChat);
    chatGif.addEventListener("change", updateGifPreview);
    chatGif.addEventListener("focus", updateGifPreview);
    changeNameButton.addEventListener("click", () => {
      localStorage.removeItem("fuitsLiveTvChatName");
      chatName.hidden = false;
      chatName.focus();
      updateChatNameUi();
    });
    channelSelect.addEventListener("change", () => {
      switchChannel(channelSelect.value);
    });
    chatFullscreenButton.addEventListener("click", async () => {
      if (chatSoftFullscreenActive) {
        setChatSoftFullscreenActive(false);
        return;
      }
      if (getPageFullscreenElement()) {
        await exitPageFullscreen();
        updateChatFullscreenUi();
        return;
      }
      const nativeStarted = await requestPageElementFullscreen(chatSection);
      window.setTimeout(() => {
        if (getPageFullscreenElement() !== chatSection) {
          setChatSoftFullscreenActive(true);
          return;
        }
        updateChatFullscreenUi();
      }, nativeStarted ? 120 : 0);
    });
    function handleFullscreenChange() {
      if (getPageFullscreenElement() === chatSection) setChatSoftFullscreenActive(false);
      updateChatFullscreenUi();
      if (getPageFullscreenElement() !== stretchFullscreenTarget) {
        stretchFullscreenTarget = null;
      }
      updateStretchMode();
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.querySelectorAll(".donate-qr-button").forEach(button => {
      button.addEventListener("click", () => {
        qrModalImage.src = button.dataset.qrSrc;
        qrModalTitle.textContent = button.dataset.qrLabel + " QR";
        qrModal.hidden = false;
      });
    });
    qrModalClose.addEventListener("click", () => {
      qrModal.hidden = true;
      qrModalImage.removeAttribute("src");
    });
    qrModal.addEventListener("click", event => {
      if (event.target === qrModal) {
        qrModal.hidden = true;
        qrModalImage.removeAttribute("src");
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !qrModal.hidden) {
        qrModal.hidden = true;
        qrModalImage.removeAttribute("src");
      }
    });
    updateChannelSelect();
    updateStretchMode();
    applySoundPreference();
    updateChatNameUi();
    loadChatGifs().catch(() => {});
    loadChat().catch(() => {});
    setInterval(() => loadChat().catch(() => {}), 5000);
    setInterval(() => syncMainPlayerToLive(), 2000);

    async function safeSyncChannel() {
      try {
        await checkLiveAnnouncement();
      } catch {
        if (!playlist.length) {
          player.hidden = true;
          empty.hidden = false;
        }
        now.textContent = "Trying to reconnect to FUITS LIVE TV WORLD...";
      }
    }

    checkLiveAnnouncement()
      .then(() => {
        setInterval(safeSyncChannel, 3000);
      })
      .catch(() => {
        player.hidden = true;
        empty.hidden = false;
        now.textContent = "The channel server is running, but the playlist could not be loaded.";
        setInterval(safeSyncChannel, 5000);
      });
  </script>
</body>
</html>`;
}

function chatOnlyHtml(initialLayout = "") {
  const initialBodyClass = initialLayout === "music-mobile-safari-landscape" ? ' class="mobile-landscape-chat music-mobile-safari-landscape-chat"' : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FUIT Chat</title>
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: #020617;
      color: #f8fafc;
      font-family: Arial, sans-serif;
    }
    .chat {
      height: 100vh;
      border: 1px solid rgba(148, 163, 184, .24);
      border-radius: 10px;
      background: rgba(15, 23, 42, .92);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr auto;
    }
    .chat-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(148, 163, 184, .18);
      font-size: 12px;
      font-weight: 900;
    }
    .chat-log {
      overflow-y: auto;
      padding: 6px 8px;
      display: grid;
      align-content: start;
      gap: 4px;
      font-size: 12px;
    }
    .chat-message {
      color: #e2e8f0;
      overflow-wrap: anywhere;
    }
    body.adult-relax-mobile-landscape-chat.chat-fullscreen-active .chat-log {
      padding: 10px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-rows: minmax(0, 1fr);
      align-content: stretch;
      gap: 8px;
      overflow: hidden;
    }
    body.adult-relax-mobile-landscape-chat.chat-fullscreen-active .chat-message {
      min-height: 0;
      border: 1px solid rgba(148, 163, 184, .22);
      border-radius: 9px;
      background: rgba(2, 6, 23, .72);
      padding: 8px;
      overflow: auto;
    }
    body.adult-relax-mobile-landscape-chat.chat-fullscreen-active .chat-message.empty-slot {
      border-style: dashed;
      color: #64748b;
      display: grid;
      place-items: center;
      text-align: center;
      font-weight: 900;
    }
    .chat-name {
      color: #93c5fd;
      font-weight: 900;
    }
    .chat-form {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, .75fr) auto;
      gap: 6px;
      padding: 6px;
      border-top: 1px solid rgba(148, 163, 184, .18);
    }
    .chat-form.needs-name {
      grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr) minmax(0, .75fr) auto;
    }
    .chat-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      overflow: hidden;
    }
    #chatSavedName {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name-change {
      padding: 0;
      border: none;
      background: transparent;
      color: #93c5fd;
      font-size: 12px;
      font-weight: 900;
    }
    .chat-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 70%;
      overflow: hidden;
    }
    .chat-full-button {
      padding: 3px 6px;
      border-radius: 6px;
      font-size: 10px;
      line-height: 1;
      flex: 0 0 auto;
    }
    .chat-gif {
      display: block;
      max-width: 96px;
      max-height: 64px;
      border-radius: 8px;
      margin-top: 4px;
    }
    .gif-field {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .gif-field select {
      flex: 1;
    }
    .gif-preview {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, .28);
      background: #020617;
      object-fit: cover;
      display: none;
      flex: 0 0 auto;
    }
    .gif-preview.visible {
      display: block;
    }
    .gif-preview.visible:hover,
    .gif-preview.visible:focus {
      width: 110px;
      height: 78px;
      object-fit: contain;
    }
    input,
    select,
    button {
      min-width: 0;
      border: 1px solid rgba(148, 163, 184, .28);
      background: #020617;
      color: #f8fafc;
      border-radius: 8px;
      padding: 7px 8px;
      font-weight: 800;
      font-size: 12px;
    }
    button {
      cursor: pointer;
    }
    body.chat-soft-fullscreen-active {
      overflow: hidden;
    }
    .chat.chat-soft-fullscreen-active {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-height: none;
      margin: 0;
      border-radius: 0;
      grid-template-rows: auto 1fr auto;
      background: #020617;
    }
    @media (max-width: 520px) {
      .chat-form {
        grid-template-columns: 1fr;
      }
    }
    body.mobile-landscape-chat .chat-head {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 6px;
      padding: 5px 6px;
    }
    body.mobile-landscape-chat {
      overflow: hidden;
    }
    body.mobile-landscape-chat .chat {
      height: var(--mobile-landscape-chat-height, 100vh);
      max-height: var(--mobile-landscape-chat-height, 100vh);
      min-height: 0;
      grid-template-rows: auto minmax(46px, 105px) auto;
      align-content: start;
    }
    body.mobile-landscape-chat .chat:fullscreen,
    body.mobile-landscape-chat .chat:-webkit-full-screen,
    body.mobile-landscape-chat .chat.chat-soft-fullscreen-active {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      margin: 0;
      border-radius: 0;
      max-height: none;
      grid-template-rows: auto 1fr auto;
    }
    body.mobile-landscape-chat .chat-log {
      min-height: 46px;
      max-height: 105px;
      padding: 5px 6px;
      gap: 3px;
      font-size: 11px;
    }
    body.mobile-landscape-chat .chat-message {
      min-width: 0;
      line-height: 1.25;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    body.mobile-landscape-chat .chat-form {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "message message"
        "gif send";
      gap: 4px;
      padding: 5px;
    }
    body.mobile-landscape-chat .chat-form.needs-name {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "name gif"
        "message message"
        "send send";
    }
    body.mobile-landscape-chat .chat-name-row {
      overflow: visible;
    }
    body.mobile-landscape-chat #chatSavedName {
      overflow: visible;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    body.mobile-landscape-chat .chat-actions {
      flex-wrap: wrap;
      gap: 6px;
      max-width: 100%;
      overflow: visible;
    }
    body.mobile-landscape-chat input,
    body.mobile-landscape-chat select,
    body.mobile-landscape-chat button {
      min-height: 34px;
      padding: 5px 4px;
      font-size: 10px;
      line-height: 1.2;
    }
    body.mobile-landscape-chat button {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    body.mobile-landscape-chat #chatName {
      grid-area: name;
      text-align: center;
      width: 100%;
      min-width: 0;
    }
    body.mobile-landscape-chat #chatMessage {
      grid-area: message;
    }
    body.mobile-landscape-chat .gif-field {
      grid-area: gif;
      display: block;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    body.mobile-landscape-chat #chatGif {
      width: 100%;
      min-width: 0;
      text-align: center;
      text-align-last: center;
    }
    body.mobile-landscape-chat .gif-preview {
      display: none !important;
    }
    body.mobile-landscape-chat .chat-form > button[type="submit"] {
      grid-area: send;
    }
    html.music-mobile-safari-landscape-chat-root,
    html.music-mobile-safari-landscape-chat-root body {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: #020617;
    }
    body.music-mobile-safari-landscape-chat .chat {
      height: 100%;
      max-height: 100%;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-content: stretch;
    }
    body.music-mobile-safari-landscape-chat .chat-log {
      min-height: 0;
      max-height: none;
      align-content: start;
    }
    body.adult-relax-mobile-landscape-chat .chat {
      grid-template-rows: auto minmax(30px, 70px) auto;
    }
    body.adult-relax-mobile-landscape-chat .chat-head {
      gap: 4px;
      padding: 4px 5px;
      font-size: 10px;
      line-height: 1.12;
    }
    body.adult-relax-mobile-landscape-chat .chat-actions {
      gap: 4px;
      flex: 1 1 auto;
      justify-content: flex-end;
    }
    body.adult-relax-mobile-landscape-chat .chat-name-row {
      gap: 4px;
      max-width: calc(100% - 48px);
      font-size: 9px;
      line-height: 1.15;
    }
    body.adult-relax-mobile-landscape-chat .chat-full-button {
      width: 42px;
      min-height: 28px;
      padding: 3px 4px;
      font-size: 9px;
      line-height: 1;
    }
    body.adult-relax-mobile-landscape-chat .chat-log {
      min-height: 30px;
      max-height: 70px;
      font-size: 10px;
    }
    body.adult-relax-mobile-landscape-chat.chat-fullscreen-active .chat-log {
      padding: 5px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 5px;
      font-size: 9px;
    }
    body.adult-relax-mobile-landscape-chat.chat-fullscreen-active .chat-message {
      padding: 5px;
      border-radius: 7px;
      line-height: 1.15;
    }
    body.adult-relax-mobile-landscape-chat .chat-form {
      gap: 3px;
      padding: 4px;
    }
    body.adult-relax-mobile-landscape-chat input,
    body.adult-relax-mobile-landscape-chat select,
    body.adult-relax-mobile-landscape-chat button {
      min-height: 30px;
      padding: 4px;
      font-size: 9px;
      line-height: 1.15;
    }
  </style>
</head>
<body${initialBodyClass}>
  <section class="chat" aria-label="Live chat">
    <div class="chat-head">
      <span>Live Chat</span>
      <span class="chat-actions">
        <span class="chat-name-row"><span id="chatSavedName"></span><button id="changeNameButton" class="name-change" type="button" hidden>Change</button></span>
        <button id="chatFullscreenButton" class="chat-full-button" type="button">Full</button>
      </span>
    </div>
    <div id="chatLog" class="chat-log"></div>
    <form id="chatForm" class="chat-form">
      <input id="chatName" maxlength="24" placeholder="Name" autocomplete="nickname" />
      <input id="chatMessage" maxlength="220" placeholder="Message" autocomplete="off" />
      <div class="gif-field">
        <select id="chatGif" aria-label="Choose GIF">
          <option value="">GIF</option>
        </select>
        <img id="gifPreview" class="gif-preview" alt="GIF preview" tabindex="0" />
      </div>
      <button type="submit">Send</button>
    </form>
  </section>
  <script>
    const chatSection = document.querySelector(".chat");
    const chatLog = document.getElementById("chatLog");
    const chatForm = document.getElementById("chatForm");
    const chatName = document.getElementById("chatName");
    const chatMessage = document.getElementById("chatMessage");
    const chatGif = document.getElementById("chatGif");
    const gifPreview = document.getElementById("gifPreview");
    const chatSavedName = document.getElementById("chatSavedName");
    const changeNameButton = document.getElementById("changeNameButton");
    const chatFullscreenButton = document.getElementById("chatFullscreenButton");
    const chatLayout = new URLSearchParams(window.location.search).get("layout");
    const phoneLandscapeQuery = "(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-width: 1100px) and (max-height: 560px)";
    const phoneLandscapeMedia = typeof window.matchMedia === "function" ? window.matchMedia(phoneLandscapeQuery) : null;
    const phoneLandscapeFallback = window.innerWidth > window.innerHeight && window.innerWidth <= 1100 && window.innerHeight <= 560;
    const phoneLandscapeActive = Boolean(phoneLandscapeMedia?.matches || (!phoneLandscapeMedia && phoneLandscapeFallback));
    const adultRelaxGrid = chatLayout === "adult-relax" || chatLayout === "adult-relax-mobile-landscape";
    const musicMobileSafariLandscape = chatLayout === "music-mobile-safari-landscape";
    const mobileLandscapeChat = chatLayout === "mobile-landscape" || musicMobileSafariLandscape || (chatLayout === "adult-relax-mobile-landscape" && phoneLandscapeActive);
    const adultRelaxMobileLandscape = adultRelaxGrid && mobileLandscapeChat;
    let latestChatMessages = [];
    let parentFullscreenActive = false;
    let localFullscreenActive = false;
    let parentFullscreenRequestTimer = null;
    document.body.classList.toggle("adult-relax-grid", adultRelaxGrid);
    document.body.classList.toggle("mobile-landscape-chat", mobileLandscapeChat);
    document.body.classList.toggle("music-mobile-safari-landscape-chat", musicMobileSafariLandscape);
    document.documentElement.classList.toggle("music-mobile-safari-landscape-chat-root", musicMobileSafariLandscape);
    document.body.classList.toggle("adult-relax-mobile-landscape-chat", adultRelaxMobileLandscape);
    function syncMobileLandscapeChatHeight() {
      if (!mobileLandscapeChat) return;
      if (musicMobileSafariLandscape) {
        document.documentElement.style.removeProperty("--mobile-landscape-chat-height");
        return;
      }
      const height = Math.max(0, Math.floor(window.innerHeight || document.documentElement.clientHeight || 0));
      if (height) document.documentElement.style.setProperty("--mobile-landscape-chat-height", height + "px");
    }
    syncMobileLandscapeChatHeight();
    window.addEventListener("resize", syncMobileLandscapeChatHeight);
    window.addEventListener("orientationchange", syncMobileLandscapeChatHeight);
    window.visualViewport?.addEventListener?.("resize", syncMobileLandscapeChatHeight);
    chatName.value = localStorage.getItem("fuitsLiveTvChatName") || "";

    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || document.webkitFullScreenElement || document.msFullscreenElement || null;
    }

    function hasParentFrame() {
      return window.parent && window.parent !== window;
    }

    function requestParentFullscreenToggle() {
      if (!hasParentFrame()) return false;
      try {
        window.parent.postMessage({ type: "FUITS_CHAT_FULLSCREEN_TOGGLE" }, "*");
        return true;
      } catch {
        return false;
      }
    }

    function clearParentFullscreenRequestTimer() {
      if (!parentFullscreenRequestTimer) return;
      window.clearTimeout(parentFullscreenRequestTimer);
      parentFullscreenRequestTimer = null;
    }

    function setLocalFullscreenActive(active) {
      localFullscreenActive = Boolean(active);
      document.body.classList.toggle("chat-soft-fullscreen-active", localFullscreenActive);
      chatSection.classList.toggle("chat-soft-fullscreen-active", localFullscreenActive);
      updateFullscreenUi();
    }

    function isChatFullscreenActive() {
      return parentFullscreenActive || localFullscreenActive || getFullscreenElement() === chatSection;
    }

    async function requestElementFullscreen(element) {
      const requestFullscreen =
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.webkitRequestFullScreen ||
        element.msRequestFullscreen;
      if (!requestFullscreen) return false;
      try {
        const result = requestFullscreen.call(element);
        if (result?.then) await result;
        return true;
      } catch {
        return false;
      }
    }

    async function exitFullscreen() {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.webkitCancelFullScreen ||
        document.msExitFullscreen;
      if (!exit) return false;
      try {
        const result = exit.call(document);
        if (result?.then) await result;
        return true;
      } catch {
        return false;
      }
    }

    function updateFullscreenUi() {
      const fullscreenActive = isChatFullscreenActive();
      document.body.classList.toggle("chat-fullscreen-active", fullscreenActive);
      chatFullscreenButton.textContent = fullscreenActive ? "Exit" : "Full";
      if (mobileLandscapeChat) syncMobileLandscapeChatHeight();
      renderChat(latestChatMessages);
    }

    function updateChatNameUi() {
      const savedName = localStorage.getItem("fuitsLiveTvChatName") || "";
      chatName.hidden = Boolean(savedName);
      chatForm.classList.toggle("needs-name", !savedName);
      chatSavedName.textContent = savedName ? savedName : "Clears after 4 hours";
      changeNameButton.hidden = !savedName;
    }

    function renderChat(messages) {
      latestChatMessages = Array.isArray(messages) ? messages : [];
      chatLog.innerHTML = "";
      if (!latestChatMessages.length && (!adultRelaxGrid || !isChatFullscreenActive())) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "chat-message";
        emptyMessage.textContent = "No messages yet.";
        chatLog.appendChild(emptyMessage);
        return;
      }

      latestChatMessages.forEach(message => {
        const row = document.createElement("div");
        row.className = "chat-message";
        const name = document.createElement("span");
        name.className = "chat-name";
        name.textContent = message.name + ": ";
        row.appendChild(name);
        if (message.text) row.appendChild(document.createTextNode(message.text));
        if (message.gif) {
          const gif = document.createElement("img");
          gif.className = "chat-gif";
          gif.src = message.gif;
          gif.alt = "Chat GIF";
          row.appendChild(gif);
        }
        chatLog.appendChild(row);
      });
      if (adultRelaxGrid && isChatFullscreenActive()) {
        for (let slot = latestChatMessages.length; slot < 8; slot += 1) {
          const emptySlot = document.createElement("div");
          emptySlot.className = "chat-message empty-slot";
          emptySlot.textContent = "Open spot";
          chatLog.appendChild(emptySlot);
        }
      }
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function updateGifPreview() {
      if (!chatGif.value) {
        gifPreview.classList.remove("visible");
        gifPreview.removeAttribute("src");
        return;
      }
      gifPreview.src = chatGif.value;
      gifPreview.classList.add("visible");
    }

    async function loadChatGifs() {
      const res = await fetch("/chat/gifs?cache=" + Date.now(), { cache: "no-store" });
      const gifs = await res.json();
      chatGif.innerHTML = '<option value="">GIF</option>';
      gifs.forEach(gif => {
        const option = document.createElement("option");
        option.value = gif.src;
        option.textContent = gif.label;
        chatGif.appendChild(option);
      });
    }

    async function loadChat() {
      const res = await fetch("/chat/messages?cache=" + Date.now(), { cache: "no-store" });
      renderChat(await res.json());
    }

    async function sendChat(event) {
      event.preventDefault();
      const name = chatName.value.trim() || "Viewer";
      const text = chatMessage.value.trim();
      const gif = chatGif.value;
      if (!text && !gif) return;
      localStorage.setItem("fuitsLiveTvChatName", name);
      updateChatNameUi();
      chatMessage.value = "";
      chatGif.value = "";
      updateGifPreview();
      const res = await fetch("/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, gif })
      });
      if (res.ok) renderChat(await res.json());
    }

    chatForm.addEventListener("submit", sendChat);
    chatGif.addEventListener("change", updateGifPreview);
    chatGif.addEventListener("focus", updateGifPreview);
    changeNameButton.addEventListener("click", () => {
      localStorage.removeItem("fuitsLiveTvChatName");
      chatName.hidden = false;
      chatName.focus();
      updateChatNameUi();
    });
    window.addEventListener("message", event => {
      if (event.data?.type !== "FUITS_CHAT_FULLSCREEN_STATE") return;
      clearParentFullscreenRequestTimer();
      parentFullscreenActive = Boolean(event.data.active);
      if (parentFullscreenActive) setLocalFullscreenActive(false);
      updateFullscreenUi();
    });
    chatFullscreenButton.addEventListener("click", async () => {
      if (parentFullscreenActive) {
        requestParentFullscreenToggle();
        return;
      }
      if (localFullscreenActive) {
        setLocalFullscreenActive(false);
        return;
      }
      if (getFullscreenElement()) {
        await exitFullscreen();
        updateFullscreenUi();
        return;
      }
      if (requestParentFullscreenToggle()) {
        chatFullscreenButton.textContent = "Exit";
        clearParentFullscreenRequestTimer();
        parentFullscreenRequestTimer = window.setTimeout(() => {
          parentFullscreenRequestTimer = null;
          if (!parentFullscreenActive && getFullscreenElement() !== chatSection) setLocalFullscreenActive(true);
        }, 300);
        return;
      }
      const nativeStarted = await requestElementFullscreen(chatSection);
      window.setTimeout(() => {
        if (getFullscreenElement() !== chatSection) {
          setLocalFullscreenActive(true);
          return;
        }
        updateFullscreenUi();
      }, nativeStarted ? 120 : 0);
    });
    document.addEventListener("fullscreenchange", updateFullscreenUi);
    document.addEventListener("webkitfullscreenchange", updateFullscreenUi);
    updateChatNameUi();
    loadChatGifs().catch(() => {});
    loadChat().catch(() => {});
    setInterval(() => loadChat().catch(() => {}), 5000);
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestHost = String(req.headers.host || "");
  const requestProtocol = req.headers["x-forwarded-proto"] || (requestHost.includes("trycloudflare.com") || requestHost.includes("flivetv.qzz.io") ? "https" : url.protocol.replace(":", ""));
  const requestOrigin = `${requestProtocol}://${req.headers.host}`;

  if (req.method === "GET" && url.pathname !== "/online-stats") {
    getOnlineStats(req, url.searchParams.get("device"));
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }

  if (isRequestBlocked(req, url)) {
    send(res, 403, bannedPageHtml(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/owner") {
    send(res, 200, ownerPageHtml(), "text/html; charset=utf-8");
    return;
  }

  if (readSiteBlankState().blank && url.pathname !== "/admin/site-blank") {
    send(res, 200, blankPageHtml(), "text/html; charset=utf-8");
    return;
  }

  const requestedChannel = getChannel(url.searchParams.get("channel"));
  const playlist = readPlaylist(requestedChannel.id);

  if (url.pathname === "/" || url.pathname === "/fuits-live-tv") {
    send(res, 200, pageHtml(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/discounts" || url.pathname === "/discounts/index.html") {
    send(res, 200, discountsPageHtml(), "text/html; charset=utf-8");
    return;
  }

  const discountMatch = url.pathname.match(/^\/discounts\/([^/]+\.html)$/);
  if (discountMatch) {
    const requestedFile = path.basename(discountMatch[1]);
    const discountPath = path.join(DISCOUNTS_DIR, requestedFile);

    if (!fs.existsSync(discountPath)) {
      send(res, 404, "Discount page not found");
      return;
    }

    send(res, 200, fs.readFileSync(discountPath, "utf8"), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/fuits-radio") {
    send(res, 200, radioPageHtml(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/chat-only") {
    send(res, 200, chatOnlyHtml(url.searchParams.get("layout") || ""), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/adult-relax-signal") {
    handleAdultRelaxSignal(req, res, url);
    return;
  }

  if (url.pathname === "/playlist.json") {
    sendJson(res, 200, playlist.map(item => ({
      id: item.id,
      title: item.title,
      duration: item.duration,
        src: `/stream/${requestedChannel.id}/${item.id}`
    })));
    return;
  }

  if (url.pathname === "/channel.json") {
    const channel = getChannelSnapshot(requestedChannel.id);
    sendJson(res, 200, {
      channel: {
        id: channel.channel.id,
        label: channel.channel.label
      },
      currentIndex: channel.currentIndex,
      offsetSeconds: channel.offsetSeconds,
      totalDuration: channel.totalDuration,
      generatedAtMs: channel.generatedAtMs,
      playlist: channel.playlist.map(item => ({
        id: item.id,
        title: item.title,
        duration: item.duration,
        sizeBytes: fs.statSync(item.file).size,
        src: `/stream/${channel.channel.id}/${item.id}`
      }))
    });
    return;
  }

  if (url.pathname === "/channels.json") {
    sendJson(res, 200, getChannels().map(channel => ({
      id: channel.id,
      label: channel.label
    })));
    return;
  }

  if (url.pathname === "/radio-channel.json") {
    const radioChannel = getRadioSnapshot(url.searchParams.get("channel"));
    sendJson(res, 200, {
      channel: {
        id: radioChannel.channel.id,
        label: radioChannel.channel.label
      },
      currentIndex: radioChannel.currentIndex,
      offsetSeconds: radioChannel.offsetSeconds,
      totalDuration: radioChannel.totalDuration,
      playlist: radioChannel.playlist.map(item => ({
        id: item.id,
        title: item.title,
        duration: item.duration,
        src: `/radio-audio/${radioChannel.channel.id}/${item.id}/${encodeURIComponent(path.basename(item.file))}`
      }))
    });
    return;
  }

  if (url.pathname === "/radio-channels.json") {
    sendJson(res, 200, getRadioChannels().map(channel => ({
      id: channel.id,
      label: channel.label
    })));
    return;
  }

  if (url.pathname === "/owncast-status") {
    fetchOwncastPath("/api/status")
      .then(({ upstream }) => upstream.json())
      .then(status => {
        sendJson(res, 200, { online: Boolean(status.online) });
      })
      .catch(() => {
        sendJson(res, 200, { online: false });
      });
    return;
  }

  if (url.pathname === "/owncast-hls" || url.pathname.startsWith("/owncast-hls/")) {
    const hlsPath = `/hls${url.pathname.slice("/owncast-hls".length)}${url.search}`;
    proxyOwncastHls(req, res, hlsPath);
    return;
  }

  if (url.pathname === "/chat/messages" && req.method === "GET") {
    const messages = pruneChatMessages(readChatMessages());
    writeChatMessages(messages);
    sendJson(res, 200, messages);
    return;
  }

  if (url.pathname === "/chat/gifs" && req.method === "GET") {
    sendJson(res, 200, listChatGifs());
    return;
  }

  if (url.pathname === "/music-library.json" && req.method === "GET") {
    const origin = `${url.protocol}//${url.host}`;
    sendJson(res, 200, listMusicLibrary().map(item => ({
      ...item,
      src: `${origin}${item.src}`
    })));
    return;
  }

  if (url.pathname === "/music-channels.json" && req.method === "GET") {
    const origin = `${url.protocol}//${url.host}`;
    sendJson(res, 200, getMusicChannels().map(channel => ({
      id: channel.id,
      label: channel.label,
      items: listMusicChannel(channel.id).map(item => ({
        ...item,
        src: `${origin}${item.src}`
      }))
    })));
    return;
  }

  if (url.pathname === "/online-stats" && req.method === "GET") {
    const weatherStatus = String(url.searchParams.get("weatherStatus") || "").slice(0, 40);
    let deviceProfile = null;
    try {
      deviceProfile = JSON.parse(String(url.searchParams.get("deviceProfile") || "null"));
    } catch {}
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    const weatherLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? {
        latitude,
        longitude,
        timezone: String(url.searchParams.get("timezone") || "").slice(0, 80),
        updatedAtMs: Date.now()
      }
      : null;
    sendJson(res, 200, getOnlineStats(req, url.searchParams.get("device"), {
      weatherStatus,
      deviceProfile,
      ...(weatherStatus === "ready" ? { weatherLocation } : {})
    }));
    return;
  }

  if (url.pathname === "/fuit-credits" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        const action = String(payload.action || "summary");
        if (action === "saveWallet") {
          sendJson(res, 200, saveFuitCreditWallet(payload));
          return;
        }
        if (action === "submitDeposit") {
          sendJson(res, 200, submitFuitCreditDeposit(payload));
          return;
        }
        if (action === "submitWithdrawal") {
          sendJson(res, 200, submitFuitCreditWithdrawal(payload));
          return;
        }
        sendJson(res, 200, getPublicFuitCreditSummary(payload));
      })
      .catch(error => {
        send(res, 400, error.message || "FUIT credits request failed");
      });
    return;
  }

  if (url.pathname === "/admin/online-users" && req.method === "GET") {
    if (url.searchParams.get("password") !== getAdminPassword()) {
      sendJson(res, 403, { ok: false, error: "Wrong password" });
      return;
    }
    sendJson(res, 200, buildOnlineStats());
    return;
  }

  if (url.pathname === "/admin/fuit-credits" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, updateAdminFuitCredits(payload));
      })
      .catch(error => {
        send(res, 400, error.message || "FUIT credits admin failed");
      });
    return;
  }

  if (url.pathname === "/admin/access-control" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, updateAccessControl(payload, req));
      })
      .catch(error => {
        send(res, 400, error.message || "Access control failed");
      });
    return;
  }

  if (url.pathname === "/admin/playlist-management" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        const action = payload.action || "load";
        const handlers = {
          load: getPlaylistManagement,
          createChannel: createPlaylistChannel,
          renameChannel: renamePlaylistChannel,
          deleteChannel: deletePlaylistChannel,
          addItems: addPlaylistItems,
          renameItem: updatePlaylistItem,
          removeItem: removePlaylistItem,
          renameFile: renamePlaylistVideoFile
        };
        const handler = handlers[action];
        if (!handler) throw new Error("Choose a valid playlist action.");
        sendJson(res, 200, handler(payload));
      })
      .catch(error => {
        send(res, 400, error.message || "Playlist management failed");
      });
    return;
  }

  if (url.pathname === "/games.json" && req.method === "GET") {
    sendJson(res, 200, listGames().map(game => ({
      ...game,
      gameUrl: `${requestOrigin}${game.gameUrl}`,
      assetBaseUrl: `${requestOrigin}${game.assetBaseUrl}`,
      discUrls: Array.isArray(game.discUrls) ? game.discUrls.map(discUrl => `${requestOrigin}${discUrl}`) : undefined
    })));
    return;
  }

  if (url.pathname === "/saved-games.json" && req.method === "GET") {
    sendJson(res, 200, listGameSaves(requestOrigin));
    return;
  }

  if (url.pathname === "/saved-games/upload" && req.method === "POST") {
    saveUploadedGameSave(req, requestOrigin)
      .then(item => sendJson(res, 200, { ok: true, item }))
      .catch(error => send(res, 400, error.message || "Saved game upload failed"));
    return;
  }

  const gifMatch = url.pathname.match(/^\/chat-gifs\/(.+)$/);
  if (gifMatch && req.method === "GET") {
    const requestedFile = path.basename(decodeURIComponent(gifMatch[1]));
    const gifPath = path.join(CHAT_GIFS_DIR, requestedFile);

    if (!requestedFile.toLowerCase().endsWith(".gif") || !fs.existsSync(gifPath)) {
      send(res, 404, "GIF not found");
      return;
    }

    const stat = fs.statSync(gifPath);
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=60"
    });
    fs.createReadStream(gifPath).pipe(res);
    return;
  }

  const donationQrMatch = url.pathname.match(/^\/donation-qrs\/(.+)$/);
  if (donationQrMatch && req.method === "GET") {
    const requestedFile = path.basename(decodeURIComponent(donationQrMatch[1]));
    const qrPath = path.join(DONATION_QR_DIR, requestedFile);
    const ext = path.extname(requestedFile).toLowerCase();

    if (![".jpg", ".jpeg", ".png"].includes(ext) || !fs.existsSync(qrPath)) {
      send(res, 404, "QR not found");
      return;
    }

    const stat = fs.statSync(qrPath);
    res.writeHead(200, {
      "Content-Type": ext === ".png" ? "image/png" : "image/jpeg",
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=300"
    });
    fs.createReadStream(qrPath).pipe(res);
    return;
  }

  const musicLibraryMatch = url.pathname.match(/^\/music-library\/(Music|Videos)\/(.+)$/);
  if (musicLibraryMatch && req.method === "GET") {
    serveMusicLibraryFile(req, res, musicLibraryMatch[1], musicLibraryMatch[2]);
    return;
  }

  const musicChannelMatch = url.pathname.match(/^\/music-channel\/([^/]+)\/(Music|Videos)\/(.+)$/);
  if (musicChannelMatch && req.method === "GET") {
    serveMusicChannelFile(req, res, musicChannelMatch[1], musicChannelMatch[2], musicChannelMatch[3]);
    return;
  }

  const gameMatch = url.pathname.match(/^\/games\/(GB|GBC|GBA|N64|PS1)\/(.+)$/);
  if (gameMatch && (req.method === "GET" || req.method === "HEAD")) {
    serveGameFile(req, res, gameMatch[1], gameMatch[2]);
    return;
  }

  const savedGameDownloadMatch = url.pathname.match(/^\/saved-games\/download\/([^/]+)/);
  if (savedGameDownloadMatch && req.method === "GET") {
    serveGameSaveDownload(res, decodeURIComponent(savedGameDownloadMatch[1]));
    return;
  }

  const gameImageMatch = url.pathname.match(/^\/game-images\/([^/]+)\/(.+)$/);
  if (gameImageMatch && req.method === "GET") {
    serveGameImage(req, res, gameImageMatch[1], gameImageMatch[2]);
    return;
  }

  if (url.pathname === "/chat/messages" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        const name = sanitizeChatText(payload.name, 24) || "Viewer";
        const text = sanitizeChatText(payload.text, 220);
        const allowedGifs = new Set(listChatGifs().map(gif => gif.src));
        const gif = allowedGifs.has(payload.gif) ? payload.gif : "";

        if (!text && !gif) {
          send(res, 400, "Message required");
          return;
        }

        const messages = pruneChatMessages(readChatMessages());
        messages.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name,
          text,
          gif,
          createdAt: Date.now()
        });
        const keptMessages = pruneChatMessages(messages).slice(-200);
        writeChatMessages(keptMessages);
        sendJson(res, 200, keptMessages);
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/unlock" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (payload.password !== getAdminPassword()) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, { ok: true });
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/password" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (payload.password !== getAdminPassword()) {
          send(res, 401, "Unauthorized");
          return;
        }

        setAdminPassword(payload.newPassword);
        sendJson(res, 200, { ok: true });
      })
      .catch(error => {
        send(res, 400, error.message || "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/shuffle" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        const shuffleChannel = getChannel(payload.channel);
        const shuffled = shuffleItems(readPlaylist(shuffleChannel.id));
        writeState(shuffleChannel.id, {
          updatedAt: new Date().toISOString(),
          startedAt: Math.floor(Date.now() / 1000),
          order: shuffled.map(item => item.file)
        });
        sendJson(res, 200, { ok: true });
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/next" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        const result = advanceChannelToNextItem(payload.channel);
        if (!result.ok) {
          send(res, 400, result.reason || "Next failed");
          return;
        }

        sendJson(res, 200, result);
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/previous" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        const result = advanceChannelToPreviousItem(payload.channel);
        if (!result.ok) {
          send(res, 400, result.reason || "Back failed");
          return;
        }

        sendJson(res, 200, result);
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }


  if (url.pathname === "/admin/restart-services" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        const restartTarget = fs.existsSync(START_ALL_SERVICES_BAT)
          ? { command: "cmd.exe", args: ["/c", "start", "", START_ALL_SERVICES_BAT] }
          : fs.existsSync(START_ALL_SERVICES_PS1)
            ? { command: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", START_ALL_SERVICES_PS1] }
            : null;

        if (!restartTarget) {
          send(res, 404, "Restart script not found");
          return;
        }

        sendJson(res, 200, { ok: true, message: "FUITS services restart started." });
        setTimeout(() => {
          const child = spawn(restartTarget.command, restartTarget.args, {
            detached: true,
            windowsHide: false,
            stdio: "ignore"
          });
          child.unref();
        }, 250);
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/video-stream-settings" && req.method === "GET") {
    sendJson(res, 200, readVideoStreamSettings());
    return;
  }

  if (url.pathname === "/admin/video-stream-settings" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, writeVideoStreamSettings({ chunkMb: payload.chunkMb }));
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-scan" && req.method === "POST") {
    readRequestBody(req)
      .then(async body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, await scanVideoRepairs());
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair check failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-run" && req.method === "POST") {
    readRequestBody(req)
      .then(async body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, payload.background ? startVideoRepairBatch(payload) : await runVideoRepairs(payload));
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-status" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, getVideoRepairStatus());
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair status failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-delete" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, deleteVideoRepairFile(payload.path));
      })
      .catch(error => {
        send(res, 400, error.message || "Video delete failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-cancel" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, cancelVideoRepairs());
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair cancel failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-backups" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, listVideoRepairBackups());
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair backups failed");
      });
    return;
  }

  if (url.pathname === "/admin/video-repair-restore" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, restoreVideoRepairBackup(payload));
      })
      .catch(error => {
        send(res, 400, error.message || "Video repair restore failed");
      });
    return;
  }

  if (url.pathname === "/admin/site-blank" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (!isAdminPassword(payload.password)) {
          send(res, 401, "Unauthorized");
          return;
        }

        sendJson(res, 200, writeSiteBlankState(Boolean(payload.blank)));
      })
      .catch(() => {
        send(res, 400, "Bad request");
      });
    return;
  }

  const streamMatch = url.pathname.match(/^\/stream\/([^/]+)\/(\d+)$/);
  if (streamMatch) {
    const videoChannel = getChannel(streamMatch[1]);
    const channelPlaylist = readPlaylist(videoChannel.id);
    const item = channelPlaylist[Number(streamMatch[2])];
    if (!item) {
      send(res, 404, "Video not found");
      return;
    }
    serveVideo(req, res, item);
    return;
  }

  const videoMatch = url.pathname.match(/^\/video\/([^/]+)\/(\d+)\//);
  if (videoMatch) {
    const videoChannel = getChannel(videoMatch[1]);
    const channelPlaylist = readPlaylist(videoChannel.id);
    const item = channelPlaylist[Number(videoMatch[2])];
    if (!item) {
      send(res, 404, "Video not found");
      return;
    }
    serveVideo(req, res, item);
    return;
  }

  const radioAudioMatch = url.pathname.match(/^\/radio-audio\/([^/]+)\/(\d+)\//);
  if (radioAudioMatch) {
    const radioChannel = getRadioChannel(radioAudioMatch[1]);
    const radioPlaylist = readRadioPlaylist(radioChannel.id);
    const item = radioPlaylist[Number(radioAudioMatch[2])];
    if (!item) {
      send(res, 404, "Audio not found");
      return;
    }
    serveMediaFile(req, res, item.file, "audio/mpeg");
    return;
  }

  send(res, 404, "Not found");
});

server.listen(PORT, () => {
  console.log(`FUITS Live TV server running at http://localhost:${PORT}`);
});
