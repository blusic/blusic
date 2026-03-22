const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("blusic", {
  getSongs: () => ipcRenderer.invoke("songs:list"),
  getSongsIndex: () => ipcRenderer.invoke("songs:index"),
  getCreators: () => ipcRenderer.invoke("creators:list")
});
