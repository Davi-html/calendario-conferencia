
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    fullscreen: true,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#f3f1ec",
    icon: path.join(__dirname, "../assets/calendar.ico"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));

  win.webContents.once("did-start-loading", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.webContents.once("dom-ready", () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.calendario.desktop");
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
