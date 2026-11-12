// Ponte segura entre as páginas e o app desktop
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvisDesktop", {
  // orbe flutuante
  setIgnoreMouse: (ignore) => ipcRenderer.send("orb:ignore", Boolean(ignore)),
  bubble: (on) => ipcRenderer.send("orb:bubble", Boolean(on)),
  focus: () => ipcRenderer.send("orb:focus"),
  dragStart: () => ipcRenderer.send("orb:drag-start"),
  dragEnd: () => ipcRenderer.send("orb:drag-end"),
  menu: () => ipcRenderer.send("orb:menu"),
  // janela principal
  showMain: () => ipcRenderer.send("app:show"),
  setOrb: (on) => ipcRenderer.invoke("app:set-orb", on),
  setAutostart: (on) => ipcRenderer.invoke("app:set-autostart", on),
  setApiKey: (key) => ipcRenderer.invoke("app:set-api-key", key),
  pickFolder: () => ipcRenderer.invoke("app:pick-folder"),
  info: () => ipcRenderer.invoke("app:info"),
  onHotkey: (cb) => ipcRenderer.on("hotkey", () => cb()),
});
