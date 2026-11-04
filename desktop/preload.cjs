// Ponte segura entre as páginas e o app desktop
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("raccoonDesktop", {
  // janela do guaxinim
  setIgnoreMouse: (ignore) => ipcRenderer.send("buddy:ignore", Boolean(ignore)),
  bubble: (on) => ipcRenderer.send("buddy:bubble", Boolean(on)),
  focus: () => ipcRenderer.send("buddy:focus"),
  dragStart: () => ipcRenderer.send("buddy:drag-start"),
  dragEnd: () => ipcRenderer.send("buddy:drag-end"),
  openApp: () => ipcRenderer.send("buddy:open-app"),
  menu: () => ipcRenderer.send("buddy:menu"),
  onWalk: (cb) => ipcRenderer.on("walk", (_e, data) => cb(data)),
  // janela principal
  toggleCompanion: () => ipcRenderer.invoke("app:toggle-companion"),
  setApiKey: (key) => ipcRenderer.invoke("app:set-api-key", key),
  info: () => ipcRenderer.invoke("app:info"),
});
