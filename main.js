const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
require("dotenv").config();
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const b2 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY
  }
});

let songsCache = null;

const getCacheRoot = () => {
  const userData = app.getPath("userData");
  return path.join(userData, "blusic-cache");
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const getContentType = (contentType, key) => {
  if (contentType) return contentType;
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
};

const normalizeKey = (key) => {
  if (!key) return "";
  return key.startsWith("/") ? key.slice(1) : key;
};

const fetchObjectBuffer = async (key) => {
  const normalizedKey = normalizeKey(key);
  const cmd = new GetObjectCommand({
    Bucket: process.env.B2_BUCKET,
    Key: normalizedKey
  });
  const data = await b2.send(cmd);
  const buffer = await streamToBuffer(data.Body);
  const contentType = getContentType(data.ContentType, normalizedKey);
  return { buffer, contentType };
};

const ensureCachedFile = async (key) => {
  const cacheRoot = getCacheRoot();
  const normalizedKey = normalizeKey(key);
  const localPath = path.join(cacheRoot, normalizedKey);
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  if (!fs.existsSync(localPath)) {
    const data = await fetchObjectBuffer(normalizedKey);
    await fsp.writeFile(localPath, data.buffer);
  }
  return localPath;
};

const toFileUrl = (filePath) => {
  let normalized = path.resolve(filePath);
  if (process.platform === "win32") {
    normalized = normalized.replace(/\\/g, "/");
  }
  return `file:///${encodeURI(normalized)}`;
};

const fetchSongsList = async () => {
  if (songsCache) return songsCache;
  const listObject = await fetchObjectBuffer("json/songs_list.json");
  const rawJson = listObject.buffer.toString("utf-8");
  const list = JSON.parse(rawJson);

  const songs = await Promise.all(
    list.map(async (song) => {
      const audioPath = await ensureCachedFile(song.audio);
      const audioUrl = toFileUrl(audioPath);
      const thumb = await fetchObjectBuffer(song.thumbnail);
      const thumbnailDataUrl = `data:${thumb.contentType};base64,${thumb.buffer.toString("base64")}`;
      return {
        title: song.title,
        artist: song.artist,
        audio: audioUrl,
        thumbnail: thumbnailDataUrl
      };
    })
  );

  songsCache = songs;
  return songs;
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: "#141414",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("songs:list", async () => {
    return fetchSongsList();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
