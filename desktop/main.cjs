// Raccoon IA — app desktop (Windows, macOS, Linux)
// Roda o servidor localmente, abre o app numa janela e coloca o guaxinim
// numa janela transparente, sempre por cima, andando pela parte de baixo da tela.
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const PREFERRED_PORT = 37615; // porta fixa = os dados (localStorage) continuam entre execuções

let mainWin = null, buddy = null, tray = null, port = null, quitting = false;
let config = { apiKey: "", companion: true, walk: true };

const cfgFile = () => path.join(app.getPath("userData"), "config.json");
function loadConfig() {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(cfgFile(), "utf8")) }; } catch {}
  if (config.apiKey && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = config.apiKey;
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(config, null, 2)); } catch {}
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showMain());

async function boot() {
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  loadConfig();
  process.env.RACCOON_DATA_DIR = app.getPath("userData"); // token do Google Agenda fica aqui
  const { startServer } = await import(pathToFileURL(path.join(ROOT, "server", "index.js")).href);
  try { port = await startServer(PREFERRED_PORT, "127.0.0.1"); }
  catch { port = await startServer(0, "127.0.0.1"); }

  // microfone liberado só para o próprio app
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(["media", "notifications"].includes(permission) && wc.getURL().startsWith(`http://127.0.0.1:${port}`));
  });

  createMain();
  createTray();
  if (config.companion) createBuddy();
}

const url = (page = "") => `http://127.0.0.1:${port}/${page}`;
const icon = () => nativeImage.createFromPath(path.join(__dirname, "icon.png"));
const preload = path.join(__dirname, "preload.cjs");

function createMain() {
  mainWin = new BrowserWindow({
    width: 440, height: 800, minWidth: 360, minHeight: 560,
    title: "Raccoon IA", icon: icon(), backgroundColor: "#0d0e17", autoHideMenuBar: true,
    webPreferences: { preload },
  });
  mainWin.loadURL(url());
  // fechar a janela só esconde: o guaxinim continua na tela e os lembretes funcionando
  mainWin.on("close", (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; });
}

function showMain() {
  if (!mainWin) return;
  mainWin.show();
  mainWin.focus();
}

// ---------- o guaxinim na tela ----------
const W = 240, H = 330;
let walk = { walking: false, dir: -1, until: 0 }, dragging = null, hovered = false, talkingBubble = false;

function createBuddy() {
  if (buddy) return;
  const area = screen.getPrimaryDisplay().workArea;
  buddy = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 40, y: area.y + area.height - H,
    transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: "#00000000", webPreferences: { preload },
  });
  buddy.setAlwaysOnTop(true, "screen-saver");
  buddy.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  buddy.setIgnoreMouseEvents(true, { forward: true });
  buddy.loadURL(url("companion.html"));
  buddy.on("closed", () => { buddy = null; });
}

function destroyBuddy() { buddy?.destroy(); buddy = null; }

function setCompanion(on) {
  config.companion = on; saveConfig();
  on ? createBuddy() : destroyBuddy();
  refreshTray();
  return on;
}

// passeio: alterna entre ficar parado e andar de um lado para o outro
setInterval(() => {
  if (!buddy || dragging) return;
  const now = Date.now();
  const paused = hovered || talkingBubble || !config.walk;
  if (now > walk.until) {
    walk.walking = !walk.walking && !paused && Math.random() < 0.7;
    if (walk.walking && Math.random() < 0.5) walk.dir *= -1;
    walk.until = now + (walk.walking ? 2500 + Math.random() * 5000 : 4000 + Math.random() * 9000);
    send("walk", walk);
  }
  if (paused && walk.walking) { walk.walking = false; walk.until = now + 3000; send("walk", walk); }
  if (!walk.walking) return;
  const b = buddy.getBounds();
  const d = screen.getDisplayMatching(b).workArea;
  let x = b.x + walk.dir * 2;
  if (x < d.x - 30 || x + W > d.x + d.width + 30) { walk.dir *= -1; x = b.x + walk.dir * 2; send("walk", walk); }
  buddy.setPosition(Math.round(x), b.y);
}, 33);

function send(ch, data) { buddy?.webContents.send(ch, data); }

ipcMain.on("buddy:ignore", (_e, ignore) => {
  hovered = !ignore;
  buddy?.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on("buddy:bubble", (_e, on) => { talkingBubble = on; });
ipcMain.on("buddy:focus", () => { buddy?.focus(); });
ipcMain.on("buddy:drag-start", () => {
  if (!buddy) return;
  const c = screen.getCursorScreenPoint(), b = buddy.getBounds();
  dragging = { dx: c.x - b.x, dy: c.y - b.y, timer: setInterval(() => {
    const p = screen.getCursorScreenPoint();
    buddy?.setPosition(p.x - dragging.dx, p.y - dragging.dy);
  }, 16) };
  walk.walking = false; send("walk", walk);
});
ipcMain.on("buddy:drag-end", () => {
  if (!dragging) return;
  clearInterval(dragging.timer); dragging = null;
  // perto do chão? encaixa em cima da barra de tarefas
  const b = buddy.getBounds(), d = screen.getDisplayMatching(b).workArea;
  if (d.y + d.height - (b.y + H) < 120) buddy.setPosition(b.x, d.y + d.height - H);
  walk.until = Date.now() + 5000;
});
ipcMain.on("buddy:open-app", () => showMain());
ipcMain.on("buddy:menu", () => buildMenu().popup({ window: buddy }));
ipcMain.handle("app:toggle-companion", () => setCompanion(!buddy));
ipcMain.handle("app:set-api-key", (_e, key) => {
  config.apiKey = String(key || "").trim(); saveConfig();
  process.env.ANTHROPIC_API_KEY = config.apiKey;
  return true;
});
ipcMain.handle("app:info", () => ({ hasKey: Boolean(process.env.ANTHROPIC_API_KEY), companion: Boolean(buddy) }));

// ---------- bandeja do sistema ----------
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "Abrir Raccoon IA", click: showMain },
    { label: "Guaxinim na tela", type: "checkbox", checked: Boolean(buddy), click: (i) => setCompanion(i.checked) },
    { label: "Andar pela tela", type: "checkbox", checked: config.walk, click: (i) => { config.walk = i.checked; saveConfig(); } },
    { label: "Iniciar com o computador", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } },
  ]);
}
function createTray() {
  tray = new Tray(icon().resize({ width: 18, height: 18 }));
  tray.setToolTip("Raccoon IA");
  tray.on("click", showMain);
  refreshTray();
}
function refreshTray() { tray?.setContextMenu(buildMenu()); }

app.whenReady().then(boot);
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { /* continua na bandeja */ });
app.on("activate", showMain);
