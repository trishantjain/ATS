const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // SEND MESSAGE TO START FAN TEST
    startFanTest: (fanId, comPort, connectionType) => {
        ipcRenderer.send('start-fan-test', {
            fanId,
            comPort,
            connectionType
        });
    },

    onEspLog: (callback) => {
        ipcRenderer.on('esp-log', (event, line) => callback(line));
    },

    // LISTEN FOR TEST RESULTS
    onTestResult: (callback) => {
        ipcRenderer.on('test-result', (event, data) => callback(data));
    },

    // GET AVAILABLE COM PORTS
    getComPorts: () => ipcRenderer.invoke('get-com-ports'),

    // REMOVE LISTENER
    removeTestResultListener: () => {
        ipcRenderer.removeAllListeners('test-result');
    }
});