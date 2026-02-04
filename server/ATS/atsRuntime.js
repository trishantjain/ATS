let testStopRequested = false;
let waitForMAC = null;
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
    },

    // MAC handling
    setTestWaitForMAC(mac) {
        waitForMAC = mac;
    },

    clearTestWaitForMAC() {
        waitForMAC = null;
    },

    get waitForMAC() {
        return waitForMAC;
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