const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("blusic", {
  getSongs: () => ipcRenderer.invoke("songs:list")
});
