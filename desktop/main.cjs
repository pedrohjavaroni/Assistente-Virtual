// Argos — app desktop (Windows, macOS, Linux)
// Roda o servidor localmente, inicia junto com o computador, fica na bandeja do sistema,
// mostra o orbe flutuante por cima das outras janelas e dá ao servidor acesso à tela.
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, session, shell, dialog, desktopCapturer, globalShortcut } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const PREFERRED_PORT = 37615; // porta fixa = os dados da interface (localStorage) continuam entre execuções
const HOTKEY = "CommandOrControl+Shift+J";
// aberto pelo sistema no login: começa escondido, só com o orbe
const startHidden = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAtLogin;

let mainWin = null, orbWin = null, tray = null, port = null, quitting = false;
let config = { apiKey: "", orb: true, autostartAsked: false };

// deixa o Argos falar sozinho ao iniciar, sem precisar de um clique antes
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const cfgFile = () => path.join(app.getPath("userData"), "config.json");
function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) }; } catch {}
  if (config.apiKey && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = config.apiKey;
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(config, null, 2)); } catch {}
}

// ---------- iniciar com o computador ----------
const canAutostart = () => app.isPackaged && process.platform !== "linux";
const autostartOn = () => canAutostart() && app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;
function setAutostart(on) {
  if (!canAutostart()) return false;
  app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, args: ["--hidden"] });
  refreshTray();
  return on;
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showMain());

// ---------- ponte usada pelas ferramentas do servidor ----------
async function captureScreen({ maxSize, format = "png" } = {}) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scale = display.scaleFactor || 1;
  const size = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error("Não consegui capturar a tela (no macOS, libere Gravação de Tela para o Argos nos Ajustes do Sistema).");
  let img = source.thumbnail;
  const { width, height } = img.getSize();
  if (maxSize && Math.max(width, height) > maxSize) {
    const k = maxSize / Math.max(width, height);
    img = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: "best" });
  }
  return format === "jpeg" ? img.toJPEG(82) : img.toPNG();
}
const bridge = {
  captureScreen,
  openExternal: (url) => shell.openExternal(url),
  openPath: (p) => shell.openPath(p),
  showItemInFolder: (p) => shell.showItemInFolder(p),
};

async function boot() {
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  loadConfig();
  process.env.ARGOS_DATA_DIR = app.getPath("userData"); // configurações, memória, voz e tokens ficam aqui
  const dirs = {};
  for (const k of ["desktop", "documents", "downloads", "pictures", "videos", "music"]) { try { dirs[k] = app.getPath(k); } catch {} }
  process.env.ARGOS_HOME_DIRS = JSON.stringify(dirs);

  const server = await import(pathToFileURL(path.join(ROOT, "server", "index.js")).href);
  server.setDesktopBridge(bridge);
  try { port = await server.startServer(PREFERRED_PORT, "127.0.0.1"); }
  catch { port = await server.startServer(0, "127.0.0.1"); }

  // microfone liberado só para o próprio app
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(["media", "notifications", "clipboard-sanitized-write"].includes(permission) && wc.getURL().startsWith(`http://127.0.0.1:${port}`));
  });

  // na primeira vez que roda instalado, já se registra para iniciar com o computador
  if (canAutostart() && !config.autostartAsked) { config.autostartAsked = true; saveConfig(); setAutostart(true); }

  createMain();
  createTray();
  if (config.orb) createOrb();
  globalShortcut.register(HOTKEY, () => mainWin?.webContents.send("hotkey"));
}

const url = (page = "") => `http://127.0.0.1:${port}/${page}`;
const icon = () => nativeImage.createFromPath(path.join(__dirname, "icon.png"));
const preload = path.join(__dirname, "preload.cjs");

function createMain() {
  mainWin = new BrowserWindow({
    width: 460, height: 800, minWidth: 360, minHeight: 560, show: !startHidden,
    title: "Argos", icon: icon(), backgroundColor: "#060a12", autoHideMenuBar: true,
    // a janela escondida continua ouvindo a palavra de ativação e disparando lembretes
    webPreferences: { preload, backgroundThrottling: false },
  });
  mainWin.loadURL(url());
  mainWin.on("close", (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; });
}
function showMain() {
  if (!mainWin) return;
  mainWin.show();
  mainWin.focus();
}

// ---------- orbe flutuante ----------
const W = 260, H = 300;
let dragging = null;
function createOrb() {
  if (orbWin) return;
  const area = screen.getPrimaryDisplay().workArea;
  orbWin = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 12, y: area.y + area.height - H,
    transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: "#00000000", webPreferences: { preload, backgroundThrottling: false },
  });
  orbWin.setAlwaysOnTop(true, "screen-saver");
  orbWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  orbWin.setIgnoreMouseEvents(true, { forward: true });
  orbWin.loadURL(url("companion.html"));
  orbWin.on("closed", () => { orbWin = null; });
}
function setOrb(on) {
  config.orb = on; saveConfig();
  if (on) createOrb(); else { orbWin?.destroy(); orbWin = null; }
  refreshTray();
  return on;
}

ipcMain.on("orb:ignore", (_e, ignore) => orbWin?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.on("orb:bubble", () => {});
ipcMain.on("orb:focus", () => orbWin?.focus());
ipcMain.on("orb:drag-start", () => {
  if (!orbWin || dragging) return;
  const c = screen.getCursorScreenPoint(), b = orbWin.getBounds();
  dragging = { dx: c.x - b.x, dy: c.y - b.y, timer: setInterval(() => {
    const p = screen.getCursorScreenPoint();
    orbWin?.setBounds({ x: p.x - dragging.dx, y: p.y - dragging.dy, width: W, height: H });
  }, 16) };
});
ipcMain.on("orb:drag-end", () => { if (dragging) { clearInterval(dragging.timer); dragging = null; } });
ipcMain.on("orb:menu", () => buildMenu().popup({ window: orbWin }));
ipcMain.on("app:show", () => showMain());
ipcMain.handle("app:set-orb", (_e, on) => setOrb(Boolean(on)));
ipcMain.handle("app:set-autostart", (_e, on) => setAutostart(Boolean(on)));
ipcMain.handle("app:set-api-key", (_e, key) => {
  config.apiKey = String(key || "").trim(); saveConfig();
  process.env.ANTHROPIC_API_KEY = config.apiKey;
  return true;
});
ipcMain.handle("app:pick-folder", async () => {
  const r = await dialog.showOpenDialog(mainWin, { properties: ["openDirectory"], title: "Liberar uma pasta para o Argos" });
  return r.canceled ? "" : r.filePaths[0];
});
ipcMain.handle("app:info", () => ({
  hasKey: Boolean(process.env.ANTHROPIC_API_KEY), orb: Boolean(orbWin),
  autostart: autostartOn(), canAutostart: canAutostart(), hotkey: HOTKEY,
}));

// ---------- bandeja do sistema ----------
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "Abrir o Argos", click: showMain },
    { label: "Falar (Ctrl+Shift+J)", click: () => mainWin?.webContents.send("hotkey") },
    { type: "separator" },
    { label: "Orbe flutuante", type: "checkbox", checked: Boolean(orbWin), click: (i) => setOrb(i.checked) },
    { label: "Iniciar com o computador", type: "checkbox", checked: autostartOn(), enabled: canAutostart(), click: (i) => setAutostart(i.checked) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } },
  ]);
}
function createTray() {
  tray = new Tray(icon().resize({ width: 18, height: 18 }));
  tray.setToolTip("Argos");
  tray.on("click", showMain);
  refreshTray();
}
function refreshTray() { tray?.setContextMenu(buildMenu()); }

app.whenReady().then(boot);
app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { /* continua na bandeja */ });
app.on("activate", showMain);
