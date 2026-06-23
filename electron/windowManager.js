const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

/**
 * Create and return the fan test window
 * @returns {BrowserWindow} - The test window instance
 */
function createFanTestWindow() {
    // TEST WINDOW UI
    const testWindow = new BrowserWindow({
        width: 700,
        height: 600,
        minWidth: 500,
        minHeight: 400,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // LOADS HTML FILE
    testWindow.loadFile(path.join(__dirname, 'fan-test-window.html'));

    // Open DevTools in development (comment out for production)
    // testWindow.webContents.openDevTools();

    return testWindow;
}

module.exports = { createFanTestWindow };