let testStopRequested = false;
let testWaitingForMAC = null;
let pendingDialogResolver = null;


const deviceCommandWaiters = [];

const connectedDevices = new Map();

module.exports = {
    // state
    /**
     * Indicates whether a test stop has been requested.
     * Provides read-only access to the current stop request flag for external callers.
     *
     * Returns:
     *   Boolean value indicating whether a stop has been requested.
     */
    get testStopRequested() {
        return testStopRequested;
    },

    requestStop() {
        testStopRequested = true;
    },

    resetStop() {
        testStopRequested = false;
        testWaitingForMAC = null;
        deviceCommandWaiters.length = 0;
    },

    // MAC handling
    setTestWaitForMAC(mac) {
        testWaitingForMAC = mac;
    },

    clearTestWaitForMAC() {
        testWaitingForMAC = null;
    },

    get testWaitingForMAC() {
        return testWaitingForMAC;
    },

    // dialog
    setDialogResolver(fn) {
        pendingDialogResolver = fn;
    },

    resolveDialog(value) {
        if (pendingDialogResolver) {
            pendingDialogResolver(value);
            pendingDialogResolver = null;
        }
    },

    // device
    connectedDevices,
    deviceCommandWaiters
};