let testStopRequested = false;
let testWaitingForMAC = null;
let pendingDialogResolver = null;


const deviceCommandWaiters = [];
const stopResolvers = new Set();

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

        console.log("🛑 STOP REQUESTED - resolving active test waiters");

        for (const resolve of stopResolvers) {
            try {
                resolve({
                    success: false,
                    reason: "STOP_REQUESTED"
                });
            } catch (err) {
                console.error("❌ Error resolving stopped test:", err);
            }
        }

        stopResolvers.clear();
    },

    registerStopResolver(resolve) {
        stopResolvers.add(resolve);
    },

    unregisterStopResolver(resolve) {
        stopResolvers.delete(resolve);
    },

    resetStop() {
        testStopRequested = false;
        testWaitingForMAC = null;
        deviceCommandWaiters.length = 0;
        stopResolvers.clear();
        console.log("🔄 ATS stop state reset");
    },

    // MAC handling
    setTestWaitForMAC(mac) {
        testWaitingForMAC = mac;
    },

    clearTestWaitForMAC() {
        // Keep the MAC active while other tests are waiting
        if (deviceCommandWaiters.length > 0) {
            return;
        }

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