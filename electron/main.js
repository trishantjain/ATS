const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const { SerialPort } = require('serialport');
const { createFanTestWindow } = require('./windowManager');
// const { startFanTestWifi } = require('../server');
const net = require('net');
// const { startFanTest } = require('../server/Testing/fanTest');

let startFanTest;
let startFanTestWifi;
let espSocket = null;

const tcpServer = net.createServer((socket) => {

  console.log("ESP32 Connected");

  espSocket = socket;

  socket.on('data', (data) => {
    const line = data.toString();

    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('esp-log', line);
    });
  });

  socket.on('close', () => {
    espSocket = null;
  });
});


try {
  const fanTestPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'Testing', 'fanTest.js')
    : path.join(__dirname, '..', 'server', 'Testing', 'fanTest.js');

  ({ startFanTest } = require(fanTestPath));

  console.log('✓ fanTest loaded');

  const wifiTestFilePath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'Testing', 'fanTestWifi.js')
    : path.join(__dirname, '..', 'server', 'Testing', 'fanTestWifi.js');

  ({ startFanTestWifi } = require(wifiTestFilePath));

  console.log('✓ fanTestWifi loaded');
} catch (err) {
  console.error('❌ fanTest load failed');
  console.error(err);
}

const HTTP_PORT = process.env.HTTP_PORT || "5000";
const APP_URL = `http://localhost:${HTTP_PORT}`;

let mainWindow;
let backendProcess;

function resourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }

  return path.join(__dirname, "..", ...segments);
}

function startBackend() {
  const serverPath = resourcePath("server", "server_ats.js");
  const serverDir = path.dirname(serverPath);
  const frontendBuildDir = resourcePath("iot-dashboard-frontend", "build");

  backendProcess = fork(serverPath, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HTTP_PORT,
      FRONTEND_BUILD_DIR: frontendBuildDir
    },
    stdio: ["inherit", "inherit", "inherit", "ipc"]
  });

  backendProcess.on("error", (err) => {
    console.error("Backend process error:", err);
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0 && !app.isQuitting) {
      console.error("Backend exited with code:", code);

      dialog.showErrorBox(
        "ATS backend stopped",
        `The ATS backend stopped unexpectedly. Exit code: ${code ?? "unknown"}`
      );
    }
  });
}

async function waitForBackend(timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${APP_URL}/api/websocket-test`);
      if (response.ok) return;
    } catch (error) {
      // Backend is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`ATS backend did not start within ${timeoutMs / 1000}s`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadURL(APP_URL);
}

// ==================== IPC HANDLERS ====================

// IPC: GET AVAILABLE COM PORTS
ipcMain.handle('get-com-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (err) {
    console.error('Error getting COM ports:', err);
    return [];
  }
});

// IPC: START FAN TEST
ipcMain.on('start-fan-test', async (event, { fanId, comPort, connectionType }) => {
  try {
    let result;

    if (connectionType === "wifi") {
      result = await startFanTestWifi(
        fanId,
        espSocket,
        (line) => {
          event.reply('esp-log', line);
        }
      );
    }
    else {
      result = await startFanTest(
        fanId,
        comPort,
        (line) => {
          event.reply('esp-log', line);
        }
      );
    }

    // let result = await startFanTest(
    //   // const result = await startFanTest(
    //   fanId,
    //   comPort,
    //   (line) => {
    //     event.reply('esp-log', line);
    //   });
    event.reply('test-result', {
      success: true,
      message: result.message,
      data: result.result
    });
  } catch (err) {
    event.reply('test-result', {
      success: false,
      error: err.message
    });
  }
});

ipcMain.on('esp-log', (event, line) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('esp-log', line);
  });
});

// =====================================================

app.whenReady().then(async () => {
  try {
    tcpServer.listen(5001, () => {
      console.log("TCP Server Started");
    });


    startBackend();
    await waitForBackend();
    await createWindow();

    // OPENS FAN TEST WINDOW
    const menu = Menu.buildFromTemplate([
      {
        label: 'Tools',
        submenu: [
          {
            label: 'Fan Testing',
            click: () => createFanTestWindow()
          }
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);


  } catch (error) {
    dialog.showErrorBox("ATS failed to start", error.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;

  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
