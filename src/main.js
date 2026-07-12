const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  Notification,
  powerMonitor,
  ipcMain,
  nativeImage,
} = require("electron");
const path = require("path");
const WebSocket = require("ws");
const { loadConfig, saveConfig } = require("./config");

const RING_INTERVAL_MS = 5 * 60 * 1000;
const RECONNECT_DELAY_MS = 4000;
const APP_USER_MODEL_ID = "com.notifyroom.receiver";

// Windows only shows the corner toast notification reliably when the app
// has a registered AppUserModelID that matches the installed shortcut —
// without this, notifications can silently fail to appear.
if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let tray = null;
let soundWindow = null;
let promptWindow = null;
let ws = null;
let reconnectTimeout = null;
let ringTimer = null;
let connected = false;
let lastFrom = null;

const config = loadConfig();

// Ensure the app launches automatically when Windows starts, and stays
// running in the background (no window) until sleep or shutdown.
function applyAutoLaunch() {
  if (process.platform === "win32" || process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,
      args: [],
    });
  }
}

function normalizeServerUrl(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/^wss?:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "")
    .replace(/\/api.*$/i, "");
}

function wsUrl() {
  const host = normalizeServerUrl(config.serverUrl);
  if (!host) return null;
  return `wss://${host}/api/ws`;
}

function createSoundWindow() {
  soundWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  soundWindow.loadFile(path.join(__dirname, "sound-window.html"));
}

function playSound() {
  if (soundWindow && !soundWindow.isDestroyed()) {
    soundWindow.webContents.send("play-sound");
  }
}

function showNotification(fromName) {
  const notification = new Notification({
    title: `Notification from ${fromName || "Admin"}`,
    body: "Tap to open Notify Receiver.",
    icon: path.join(__dirname, "..", "assets", "tray.png"),
    silent: true, // we play our own repeating sound
  });
  notification.show();
}

function ring() {
  showNotification(lastFrom);
  playSound();
  updateTrayMenu();
}

function stopRinging() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
    updateTrayMenu();
  }
}

function startRinging(fromName) {
  lastFrom = fromName;
  ring();
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = setInterval(ring, RING_INTERVAL_MS);
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(connectWs, RECONNECT_DELAY_MS);
}

function connectWs() {
  const url = wsUrl();
  if (!url) {
    connected = false;
    updateTrayMenu();
    return;
  }

  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    connected = true;
    updateTrayMenu();
    ws.send(
      JSON.stringify({
        type: "join",
        deviceId: config.deviceId,
        role: "receiver",
        name: config.name,
      }),
    );
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "notify") {
      startRinging(msg.from);
    }
  });

  ws.on("close", () => {
    connected = false;
    updateTrayMenu();
    scheduleReconnect();
  });

  ws.on("error", () => {
    try {
      ws.close();
    } catch {}
  });
}

function sendRename() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "rename", name: config.name }));
  }
}

function openPromptWindow(kind) {
  if (promptWindow) {
    promptWindow.focus();
    return;
  }
  promptWindow = new BrowserWindow({
    width: 380,
    height: kind === "server" ? 220 : 150,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: kind === "server" ? "Set server URL" : "Change name",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  promptWindow.setMenuBarVisibility(false);

  const file = kind === "server" ? "server-url-window.html" : "rename-window.html";
  promptWindow.loadFile(path.join(__dirname, file));

  promptWindow.webContents.on("did-finish-load", () => {
    promptWindow.webContents.send(
      "prefill",
      kind === "server" ? config.serverUrl : config.name,
    );
  });

  promptWindow.on("closed", () => {
    promptWindow = null;
  });
}

ipcMain.on("rename-submit", (_e, value) => {
  const trimmed = (value || "").trim().slice(0, 40);
  if (trimmed) {
    config.name = trimmed;
    saveConfig(config);
    sendRename();
    updateTrayMenu();
  }
  if (promptWindow) promptWindow.close();
});

ipcMain.on("rename-cancel", () => {
  if (promptWindow) promptWindow.close();
});

ipcMain.on("server-url-submit", (_e, value) => {
  const host = normalizeServerUrl(value);
  if (host) {
    config.serverUrl = host;
    saveConfig(config);
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    connectWs();
  }
  if (promptWindow) promptWindow.close();
});

ipcMain.on("server-url-cancel", () => {
  if (promptWindow) promptWindow.close();
});

function updateTrayMenu() {
  if (!tray) return;

  const statusLabel = !wsUrl()
    ? "Not configured"
    : connected
      ? "Connected"
      : "Reconnecting…";

  const ringingLabel = ringTimer ? "Ringing every 5 min" : "Idle";

  const menu = Menu.buildFromTemplate([
    { label: `Name: ${config.name}`, enabled: false },
    { label: `Status: ${statusLabel}`, enabled: false },
    { label: ringingLabel, enabled: false },
    { type: "separator" },
    { label: "Change name…", click: () => openPromptWindow("name") },
    { label: "Set server URL…", click: () => openPromptWindow("server") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip(`Notify Receiver — ${statusLabel}`);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new Tray(image);
  updateTrayMenu();
}

app.whenReady().then(() => {
  applyAutoLaunch();
  createSoundWindow();
  createTray();
  connectWs();

  if (!wsUrl()) {
    openPromptWindow("server");
  }
});

app.on("window-all-closed", (event) => {
  // Keep running in the background (tray-only app) — never quit when a
  // prompt window closes.
  event.preventDefault();
});

powerMonitor.on("suspend", stopRinging);
powerMonitor.on("shutdown", stopRinging);

app.on("before-quit", stopRinging);
