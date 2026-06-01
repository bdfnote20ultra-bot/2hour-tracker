const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync, spawn } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.FUITS_TV_PORT || 8099);
const ROOT = "T:\\FattysLiveTV";
const CHANNEL_PLAYLIST_DIR = path.join(ROOT, "Playlists", "FuitsLiveTV");
const DEFAULT_CHANNEL_PLAYLISTS = ["ChannelA.m3u", "ChannelB.m3u"];
const PASSWORD_PATH = path.join(__dirname, "admin-password.txt");
const SHUFFLE_PASSWORD = "FOOLIO";
const SITE_BLANK_PATH = path.join(__dirname, "site-blank.json");
const FALLBACK_DURATION_SECONDS = 30 * 60;
const OWNCAST_LOCAL_URL = "http://localhost:8080";
const START_ALL_SERVICES_BAT = "C:\\Users\\newer\\Desktop\\START-ALL-SERVICES-UPDATE-URLS.bat";
const START_ALL_SERVICES_PS1 = "T:\\FattysLiveTV\\Tools\\Start-AllServicesAndUpdateUrls.ps1";
const CHAT_LOG_PATH = path.join(__dirname, "chat-log.json");
const CHAT_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const CHAT_GIFS_DIR = path.join(ROOT, "ChatGifs");
const DONATION_QR_DIR = path.join(ROOT, "DonationQrs");
const GAMES_ROOT = path.join(ROOT, "Games");
const GAME_ROMS_DIR = path.join(GAMES_ROOT, "Roms");
const GAME_IMAGES_DIR = path.join(GAMES_ROOT, "Images");
const MUSIC_LIBRARY_DIR = path.join(ROOT, "MusicLibrary");
const MUSIC_LIBRARY_MUSIC_DIR = path.join(MUSIC_LIBRARY_DIR, "Music");
const MUSIC_LIBRARY_VIDEOS_DIR = path.join(MUSIC_LIBRARY_DIR, "Videos");
const MUSIC_LIBRARY_CHANNELS_DIR = path.join(MUSIC_LIBRARY_DIR, "Channels");
const RADIO_ROOT = path.join(ROOT, "Radio");
const RADIO_MUSIC_DIR = path.join(RADIO_ROOT, "Music");
const RADIO_PLAYLIST_DIR = path.join(RADIO_ROOT, "Playlists");
const DEFAULT_RADIO_PLAYLISTS = ["ChannelA.m3u", "ChannelB.m3u"];
let owncastBaseUrlCache = null;
let owncastBaseUrlCacheExpiresAt = 0;
const GAME_SYSTEMS = {
  GB: { folder: "GB", core: "gb", extensions: [".gb"] },
  GBC: { folder: "GBC", core: "gb", extensions: [".gbc"] },
  GBA: { folder: "GBA", core: "gba", extensions: [".gba"] },
  PS1: { folder: "PS1", core: "psx", extensions: [".cue", ".chd", ".pbp", ".m3u"] }
};

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
    const protocol = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").includes("trycloudflare.com") ? "https" : "http");
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

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
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
  const maxVideoChunkSize = 1024 * 1024;

  if (!range) {
    if (isVideo && req.method !== "HEAD") {
      const start = 0;
      const end = Math.min(stat.size - 1, maxVideoChunkSize - 1);
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": isVideo ? "public, max-age=3600" : "no-store"
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": isVideo ? "public, max-age=3600" : "no-store"
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
      "Cache-Control": isVideo ? "public, max-age=3600" : "no-store"
    });
    res.end();
    return;
  }

  const end = isVideo ? Math.min(requestedEnd, start + maxVideoChunkSize - 1, stat.size - 1) : Math.min(requestedEnd, stat.size - 1);
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": isVideo ? "public, max-age=3600" : "no-store"
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

    function applySoundPreference() {
      radioPlayer.muted = !soundUnlocked;
      livePlayer.muted = !soundUnlocked;
      radioPlayer.volume = 1;
      livePlayer.volume = 1;
      unmuteButton.hidden = soundUnlocked;
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

    function applyChannel(channel) {
      const item = channel.playlist[channel.currentIndex];
      if (!item) {
        now.textContent = "No MP3s found in this radio playlist yet.";
        status.textContent = "";
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
      else radioPlayer.addEventListener("loadedmetadata", syncTime, { once: true });

      radioPlayer.play().catch(() => {
        if (!soundUnlocked) radioPlayer.muted = true;
        radioPlayer.play().catch(() => {});
      });
      now.textContent = channel.channel.label + " now playing: " + item.title;
      status.textContent = "";
    }

    function startLiveDj() {
      const liveSrc = "/owncast-hls/stream.m3u8";
      radioPlayer.pause();
      radioPlayer.hidden = true;
      livePlayer.hidden = false;
      liveBadge.hidden = false;
      now.textContent = "Live DJ / announcement is on air.";
      status.textContent = "Radio playlist will continue when the live stream ends.";

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
      liveBadge.hidden = true;
      if (liveHls) {
        liveHls.destroy();
        liveHls = null;
      }
    }

    async function checkLiveDj() {
      try {
        const res = await fetch("/owncast-status?cache=" + Date.now());
        const data = await res.json();
        if (data.online && !liveOnline) {
          liveOnline = true;
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
    setInterval(checkLiveDj, 5000);
    setInterval(syncRadio, 15000);
  </script>
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
  </style>
</head>
<body>
  <main>
    <h1>you are banned</h1>
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

    document.getElementById("ownerRestoreButton").addEventListener("click", async () => {
      const password = window.prompt("Owner password");
      if (!password) return;

      const res = await fetch("/admin/site-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, blank: false })
      });

      if (!res.ok) {
        window.alert("Wrong password.");
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
      width: min(92vw, 420px);
      display: grid;
      gap: 12px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0;
    }
    input, button {
      width: 100%;
      box-sizing: border-box;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid rgba(248, 250, 252, .22);
      font-size: 16px;
    }
    input {
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
  </style>
</head>
<body>
  <main>
    <h1>FUITS Owner</h1>
    <div id="status" class="status">Site is ${state.blank ? "blank" : "visible"}.</div>
    <input id="password" type="password" placeholder="Owner password" autocomplete="current-password" />
    <button id="showButton" type="button">Show Site</button>
    <button id="blankButton" type="button">Blank Site</button>
  </main>
  <script>
    const status = document.getElementById("status");
    const password = document.getElementById("password");
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
    document.getElementById("showButton").addEventListener("click", () => setBlank(false));
    document.getElementById("blankButton").addEventListener("click", () => setBlank(true));
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
    .stretch-video {
      object-fit: fill;
    }
    .now {
      margin-top: 10px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.35;
    }
    .controls {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 10px;
      flex-wrap: wrap;
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
    .chat:fullscreen {
      width: 100vw;
      height: 100vh;
      margin: 0;
      border-radius: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: #050816;
    }
    .chat:fullscreen .chat-log {
      height: auto;
      font-size: 16px;
      padding: 12px;
    }
    .chat:fullscreen .chat-form {
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
    <video id="player" controls muted playsinline preload="auto"></video>
    <video id="livePlayer" class="live-video" controls muted playsinline hidden></video>
    <div class="now" id="now">Loading channel...</div>
    <div class="controls">
      <button id="unmuteButton" class="sound-button" type="button">Unmute</button>
      <button id="nextButton" type="button">Next</button>
      <button id="stretchButton" type="button">Stretch</button>
      <button id="ownerUnlockButton" type="button">Owner</button>
      <button id="shuffleButton" type="button">Shuffle Playlist</button>
      <button id="blankSiteButton" type="button" hidden>Blank Site</button>
    </div>
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
    const stretchButton = document.getElementById("stretchButton");
    const ownerUnlockButton = document.getElementById("ownerUnlockButton");
    const shuffleButton = document.getElementById("shuffleButton");
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
    let activeChannelId = new URLSearchParams(window.location.search).get("channel") || localStorage.getItem("fuitsLiveTvChannel") || "channel-a";
    let stretchVideo = localStorage.getItem("fuitsLiveTvStretch") === "1";
    let soundUnlocked = localStorage.getItem("fuitsLiveTvSoundUnlocked") === "1";
    chatName.value = localStorage.getItem("fuitsLiveTvChatName") || "";

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
      player.classList.toggle("stretch-video", stretchVideo);
      livePlayer.classList.toggle("stretch-video", stretchVideo);
      stretchButton.textContent = stretchVideo ? "Normal" : "Stretch";
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
      const startupBufferSeconds = getStartupBufferSeconds();
      const enoughBuffered = getBufferedAheadSeconds(player) >= startupBufferSeconds;
      if (player.readyState >= 3 && (enoughBuffered || player.duration - player.currentTime < startupBufferSeconds)) {
        playMainPlayerWithBrowserFallback();
      }
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

    function applyChannel(channel) {
      playlist = channel.playlist;
      currentIndex = channel.currentIndex;
      const item = playlist[currentIndex];
      if (!item) return;

      const isNewItem = item.id !== currentItemId || item.src !== currentItemSrc;
      if (isNewItem) {
        rememberSoundUnlocked();
        currentItemId = item.id;
        currentItemSrc = item.src;
        player.src = item.src;
        player.preload = "auto";
        player.load();
        applySoundPreference();
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
          player.currentTime = liveOffset;
          player.playbackRate = 1;
        } else {
          player.playbackRate = driftSeconds < -0.35 ? 1.08 : 1;
        }
      };
      syncMainPlayerToLive = syncTime;

      if (isNewItem && player.readyState >= 1) {
        syncTime();
        playMainPlayerWhenBuffered();
      } else if (isNewItem) {
        player.addEventListener("loadedmetadata", () => {
          syncTime();
          playMainPlayerWhenBuffered();
        }, { once: true });
      }

      now.textContent = channel.channel.label + " now playing: " + item.title;
    }

    function unmutePlayer() {
      soundUnlocked = true;
      localStorage.setItem("fuitsLiveTvSoundUnlocked", "1");
      applySoundPreference();
      player.play().catch(() => {});
      livePlayer.play().catch(() => {});
    }

    function toggleStretchMode() {
      stretchVideo = !stretchVideo;
      localStorage.setItem("fuitsLiveTvStretch", stretchVideo ? "1" : "0");
      updateStretchMode();
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

    async function syncChannel() {
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
      applyChannel(channel);
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
        liveActiveIndicator.hidden = false;
        startLiveAnnouncementPlayer();
        now.textContent = "Live Announcement On Air";
        return;
      }

      liveActiveIndicator.hidden = true;
      livePlayer.hidden = true;
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
      updateChannelSelect();
      syncChannel();
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
    unmuteButton.addEventListener("click", unmutePlayer);
    nextButton.addEventListener("click", nextVideo);
    stretchButton.addEventListener("click", toggleStretchMode);
    ownerUnlockButton.addEventListener("click", unlockOwnerControls);
    shuffleButton.addEventListener("click", shufflePlaylist);
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
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        return;
      }
      if (chatSection.requestFullscreen) {
        await chatSection.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener("fullscreenchange", () => {
      chatFullscreenButton.textContent = document.fullscreenElement === chatSection ? "Exit" : "Full";
    });
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
        setInterval(safeSyncChannel, 15000);
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

function chatOnlyHtml() {
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
    @media (max-width: 520px) {
      .chat-form {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
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
    chatName.value = localStorage.getItem("fuitsLiveTvChatName") || "";

    function updateChatNameUi() {
      const savedName = localStorage.getItem("fuitsLiveTvChatName") || "";
      chatName.hidden = Boolean(savedName);
      chatForm.classList.toggle("needs-name", !savedName);
      chatSavedName.textContent = savedName ? savedName : "Clears after 4 hours";
      changeNameButton.hidden = !savedName;
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
    chatFullscreenButton.addEventListener("click", async () => {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        return;
      }
      if (chatSection.requestFullscreen) {
        await chatSection.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener("fullscreenchange", () => {
      chatFullscreenButton.textContent = document.fullscreenElement === chatSection ? "Exit" : "Full";
    });
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
  const requestProtocol = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").includes("trycloudflare.com") ? "https" : url.protocol.replace(":", ""));
  const requestOrigin = `${requestProtocol}://${req.headers.host}`;

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

  if (url.pathname === "/fuits-radio") {
    send(res, 200, radioPageHtml(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/chat-only") {
    send(res, 200, chatOnlyHtml(), "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/playlist.json") {
    sendJson(res, 200, playlist.map(item => ({
      id: item.id,
      title: item.title,
      duration: item.duration,
      src: `/video/${requestedChannel.id}/${item.id}/${encodeURIComponent(path.basename(item.file))}`
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
        src: `/video/${channel.channel.id}/${item.id}/${encodeURIComponent(path.basename(item.file))}`
      }))
    });
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

  if (url.pathname === "/games.json" && req.method === "GET") {
    sendJson(res, 200, listGames().map(game => ({
      ...game,
      gameUrl: `${requestOrigin}${game.gameUrl}`,
      assetBaseUrl: `${requestOrigin}${game.assetBaseUrl}`,
      discUrls: Array.isArray(game.discUrls) ? game.discUrls.map(discUrl => `${requestOrigin}${discUrl}`) : undefined
    })));
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

  const gameMatch = url.pathname.match(/^\/games\/(GB|GBC|GBA|PS1)\/(.+)$/);
  if (gameMatch && (req.method === "GET" || req.method === "HEAD")) {
    serveGameFile(req, res, gameMatch[1], gameMatch[2]);
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

  if (url.pathname === "/admin/shuffle" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (payload.password !== SHUFFLE_PASSWORD) {
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
        if (payload.password !== SHUFFLE_PASSWORD) {
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


  if (url.pathname === "/admin/restart-services" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (payload.password !== SHUFFLE_PASSWORD) {
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
  if (url.pathname === "/admin/site-blank" && req.method === "POST") {
    readRequestBody(req)
      .then(body => {
        const payload = JSON.parse(body || "{}");
        if (payload.password !== getAdminPassword()) {
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
