const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      deviceId: parsed.deviceId || randomId(),
      name: parsed.name || "Receiver",
      serverUrl: parsed.serverUrl || "",
    };
  } catch {
    return {
      deviceId: randomId(),
      name: "Receiver",
      serverUrl: "",
    };
  }
}

function saveConfig(config) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save config", err);
  }
}

module.exports = { loadConfig, saveConfig };
