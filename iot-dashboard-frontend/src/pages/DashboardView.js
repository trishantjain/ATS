import React, { useEffect, useState, useRef } from "react";
import "../App.css";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
// import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
// import L from "leaflet";
// import {
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   Legend,
//   ResponsiveContainer,
// } from "recharts";
import swal from "sweetalert2";
// import thresholds from "../../../server/thresholds";
// import GaugeComponent from 'react-gauge-component';

// const defaultLocation = [28.6139, 77.209];

function DashboardView() {
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceMeta, setDeviceMeta] = useState([]);
  const [selectedMac, setSelectedMac] = useState("");
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("gauges");
  const [activeFanBtns, setActiveFanBtns] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [snapshots, setSnapshots] = useState([]);
  // const [videosCaptured, setVideosCaptured] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [currentTest, setCurrentTest] = useState(null);
  const [awaitingCommand, setAwaitingCommand] = useState(false);
  const [testProgress, setTestProgress] = useState([]);
  const [currentTestStep, setCurrentTestStep] = useState(0);
  const [testCommandInput, setTestCommandInput] = useState("");
  const [notification, setNotification] = useState(null);


  //Map and marker refs
  const mapRef = useRef(null);
  const wsRef = useRef(null);
  // const markerRefs = useRef({});

  const latestReadingsByMac = {};
  readings.forEach((r) => {
    const existing = latestReadingsByMac[r.mac];
    if (!existing || new Date(r.timestamp) > new Date(existing.timestamp)) {
      latestReadingsByMac[r.mac] = r;
    }
  });

  const selectedDeviceMeta = deviceMeta.find((d) => d.mac === selectedMac);
  const latestReading = readings.find((r) => r.mac === selectedMac);

  // WEBSOCKET CONNECTION
  useEffect(() => {
    const connectWebSocket = () => {
      console.log('🔄 Attempting WebSocket connection...');

      // Use wss:// if in production, ws:// for development
      const wsUrl = process.env.NODE_ENV === 'production'
        ? `wss://${window.location.host}`
        : (process.env.REACT_APP_WS_URL || 'ws://localhost:8080');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message:', message.type);

          if (message.type === 'NEW_READING') {
            const newReading = message.data;

            setSelectedMac(prev => prev || newReading.mac);
            setSelectedDevice(prev => prev || newReading.locationId || newReading.mac);
            setReadings(prev => {
              const filtered = prev.filter(r => r.mac !== newReading.mac);
              return [...filtered, newReading].slice(-400);
            });
          }
        } catch (err) {
          console.error('❌ WebSocket message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket connection error:', error);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);

        // Auto-reconnect after 3 seconds
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      };
    };

    // Initial connection
    connectWebSocket();

    // Cleanup
    return () => {
      if (wsRef.current) {
        console.log('🛑 Closing WebSocket connection');
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // UseEffect for fetching Data
  useEffect(() => {
    console.log('🚨Starting data fetch interval (5s)🚨');
    // const interval = setInterval(fetchData, 2000);

    // fetchData();

    // console.log('🚨Fetching Data🚨')
    // return () => clearInterval(interval);
    return () => {
      console.log('🛑Clearing data fetch interval');
      // clearInterval(interval);
    };

  }, []);

  // 🔄 Auto-focus map on selected device
  useEffect(() => {
    if (mapRef.current && selectedMac) {
      const selectedDevice = deviceMeta.find((d) => d.mac === selectedMac);
      const lat = parseFloat(selectedDevice?.latitude);
      const lon = parseFloat(selectedDevice?.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        mapRef.current.flyTo([lat, lon], 15, { duration: 1.5 });
        console.log(`🔍 Flying to ${selectedMac} at [${lat}, ${lon}]`);
      }
    }
  }, [selectedMac, deviceMeta]);

  // map
  useEffect(() => {
    const iframe = document.querySelector(".camera-iframe");
    if (iframe) {
      iframe.style.transform = `scale(${zoom}) rotate(${rotation}deg)`;
    }
  }, [zoom, rotation]);

  // const fetchData = async () => {
  //   try {
  //     const [devicesRes, deviceMetaRes] = await Promise.all([
  //       fetch(`${process.env.REACT_APP_API_URL}/api/all-devices`),
  //       fetch(`${process.env.REACT_APP_API_URL}/api/devices-info`),
  //     ]);

  //     // Fallback to [] if any response fails
  //     let devicesData = [],
  //       metadata = [];

  //     if (devicesRes.ok) devicesData = await devicesRes.json();
  //     if (deviceMetaRes.ok) metadata = await deviceMetaRes.json();

  //     setDevices(Array.isArray(devicesData) ? devicesData : []);
  //     setDeviceMeta(Array.isArray(metadata) ? metadata : []);
  //     // console.log("deviceMetadata", metadata);
  //   } catch (err) {
  //     console.error("❌Error fetching data:", err);
  //   }
  // };

  // added by vats
  // A synchronous function to format the date and time.
  function getFormattedDateTime() {
    const today = new Date();
    const addLeadingZero = (num) => String(num).padStart(2, "0");

    const dd = addLeadingZero(today.getDate());
    const mm = addLeadingZero(today.getMonth() + 1);
    const yy = String(today.getFullYear()).slice(-2);
    const HH = addLeadingZero(today.getHours());
    const MM = addLeadingZero(today.getMinutes());
    const SS = addLeadingZero(today.getSeconds());

    return `${dd}/${mm}/${yy} ${HH}:${MM}:${SS}`;
  }

  // Function to log-commands in system
  const sendToLog = async (status, message, command = "") => {
    const logData = {
      date: new Date().toLocaleString(),
      mac: selectedMac,
      command: command,
      status: status,
      message: message,
    };

    try {
      await fetch(`${process.env.REACT_APP_API_URL}/api/log-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });
    } catch (err) {
      console.error("Failed to log ", err);
    }
  };

  const sendCommand = async (cmdToSend) => {
    if (!selectedMac || !cmdToSend) {
      setStatus("Please select a device and enter a command.");
      return;
    }
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mac: selectedMac, command: cmdToSend }),
      });
      const data = await res.json();
      setStatus(data.message);
    } catch (error) {
      console.error("Command error:", error);
      setStatus("Error sending command");
    }
  };

  const handleFanClick = (level) => {
    const isActive = activeFanBtns.includes(level);
    const command = isActive
      ? `%R0${level}F${getFormattedDateTime()}$`
      : `%R0${level}N${getFormattedDateTime()}$`;

    if (level !== 5) {
      sendToLog(
        `Fan Group ${level} clicked ${isActive ? "off" : "on "}`,
        "",
        command
      );
    } else {
      sendToLog(
        `LOAD Clicked ${isActive ? "off" : "on "}`,
        "",
        command
      );
    }
    sendCommand(command);

    // Update UI immediately (optional, for instant feedback)
    setActiveFanBtns(
      isActive
        ? activeFanBtns.filter((l) => l !== level)
        : [...activeFanBtns, level]
    );
  };

  //! New code for Open Lock (using Sweetalert2)
  const handleOpenLock = async () => {
    const { value: password } = await swal.fire({
      title: "Enter Admin password",
      input: "password",
      inputLabel: "Password",
      inputPlaceholder: "Enter admin password",
      showCancelButton: true,
      confirmButtonText: "Open Lock",
      cancelButtonText: "Cancel",
      background: "#292929",
      color: "#fff",
      confirmButtonColor: "#2f2f2fff",
      width: "20em",
    });

    if (password) {
      if (password === "admin123") {
        sendCommand(`%L00O${getFormattedDateTime()}$`);
        sendToLog("Password Open Button Clicked");
        setStatus("Lock opened successfully!");
      } else {
        setStatus("Wrong password!");
      }
    }
  };

  const handleResetLock = () => {
    const pwd = window.prompt("Enter admin password to reset lock:");
    if (pwd === "admin123") {
      const newLock = window.prompt("Enter new lock value:");

      if (/^\d{9}$/.test(newLock)) {
        if (newLock && newLock.trim() !== "") {
          sendToLog(`Lock Reset ${newLock} clicked`);
          sendCommand(`%L00R${newLock}${getFormattedDateTime()}$$`);
          setStatus(`New password ${newLock} `)
        } else {
          setStatus("New lock value cannot be empty!");
        }
      } else {
        alert("Enter Numeric Password of 9 Digits")
      }
    } else {
      setStatus("Wrong password for resetting lock!");
    }
  };

  // Function
  const openPassword = () => {
    const pwd = window.prompt("Enter admin password to Open Lock:");
    // const today = new Date();
    if (pwd === "admin123") sendCommand(`%L00P${getFormattedDateTime()}$`);
    else setStatus("Wrong password for opening lock!");
  };

  // const toggleFullscreen = () => {
  //   const iframe = document.querySelector(".camera-iframe");
  //   if (iframe.requestFullscreen) iframe.requestFullscreen();
  //   else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
  //   else if (iframe.msRequestFullscreen) iframe.msRequestFullscreen();
  // };

  // const isAlarmActive = (reading) =>
  //   reading.fireAlarm || reading.waterLeakage || reading.waterLogging || reading.lockStatus === "OPEN" || reading.doorStatus === "OPEN" || [1, 2, 3].includes(reading.password);


  const fetchSnapshots = async (selectedMac) => {
    try {
      // setActiveTab("snapshots");
      if (selectedMac) {
        let response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/snapshots/?mac=${selectedMac}`
        );
        const snapshotFiles = await response.json();
        setSnapshots(snapshotFiles);
      } else {
        setSnapshots([]);
      }
    } catch (err) {
      console.error("Error fetching snapshots:", err);
    }
  };

  // Modified iMoni_test function with better error handling
  async function iMoni_test() {
    setTestStatus("Starting tests...");
    setAwaitingCommand(true);
    setTestProgress([]);

    try {
      const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/run-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        // body: ({mac})
      });

      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      const data = await resp.json();
      console.log("Test response:", data);

      // data.results is the array of tests parsed/run on the server
      if (Array.isArray(data.results) && data.results.length) {
        const first = data.results[0];
        setCurrentTest(first.name || first.testFile);
        setTestStatus(first.message || "Running...");

        // Update test progress
        setTestProgress(data.results.map(result => ({
          test: result.testFile || result.name,
          status: result.status,
          output: result.output || "No output",
          duration: result.duration || 0
        })));
      }

      setAwaitingCommand(false);
      setTestStatus(data.summary ? `Completed: ${data.summary.passed} passed, ${data.summary.failed} failed` : "All tests done");
      setCurrentTest(null);
    } catch (err) {
      console.error("Test error:", err);
      setAwaitingCommand(false);
      setTestStatus(`Test run failed: ${err.message}`);
    }
  }


  // New test function with step-by-step execution
  // async function runTestsStepByStep() {
  //   setTestStatus("Initializing tests...");
  //   setTestProgress([]);

  //   try {
  //     // First, get the list of tests
  //     const listResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/list`);
  //     const testList = await listResponse.json();

  //     for (const testFile of testList.availableTests) {
  //       setCurrentTest(testFile);
  //       setTestStatus(`Running: ${testFile}`);

  //       // Run the test
  //       const runResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/test/run`, {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify({ testFile }),
  //       });

  //       const result = await runResponse.json();

  //       // Add to progress
  //       setTestProgress(prev => [...prev, {
  //         test: testFile,
  //         status: result.status,
  //         output: result.output
  //       }]);

  //       // If test has commands, send them
  //       if (result.commands && result.commands.length > 0) {
  //         for (const command of result.commands) {
  //           await sendDeviceCommand(command);
  //           await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between commands
  //         }
  //       }
  //     }

  //     setTestStatus("All tests completed");
  //   } catch (err) {
  //     console.error("Test execution error:", err);
  //     setTestStatus(`Error: ${err.message}`);
  //   }
  // }

  useEffect(() => {
    const connectWebSocket = () => {
      console.log('🔄 Attempting WebSocket connection...');

      const wsUrl = process.env.NODE_ENV === 'production'
        ? `wss://${window.location.host}`
        : (process.env.REACT_APP_WS_URL || 'ws://localhost:8080');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message type:', message.type);

          if (message.type === 'NEW_READING') {
            const newReading = message.data;
            setSelectedMac(prev => prev || newReading.mac);
            setSelectedDevice(prev => prev || newReading.locationId || newReading.mac);
            setReadings(prev => {
              const filtered = prev.filter(r => r.mac !== newReading.mac);
              return [...filtered, newReading].slice(-400);
            });
          }

          // Handle test status messages
          if (message.type === 'TEST_STARTED') {
            setCurrentTest(message.name || message.testFile);
            setTestStatus(`🏁 ${message.message}`);

            // Show notification banner instead of modal popup
            if (message.message && message.message !== "No message") {
              setNotification({
                title: `Test: ${message.name}`,
                message: message.message,
                type: 'info'
              });

              // Auto-close after 10 seconds
              setTimeout(() => {
                setNotification(null);
              }, 10000);
            }
          }

          if (message.type === 'TEST_COMPLETED') {
            setTestStatus(`${message.status === 'passed' ? '✅' : '❌'} ${message.name}: ${message.output}`);
          }

          if (message.type === 'ALL_TESTS_COMPLETED') {
            setTestStatus(`📊 All tests completed: ${message.summary.passed} passed, ${message.summary.failed} failed`);
            setAwaitingCommand(false);
            setCurrentTest(null);
          }

        } catch (err) {
          console.error('❌ WebSocket message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket connection error:', error);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        console.log('🛑 Closing WebSocket connection');
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // const simulateDeviceResponse = async (responseValue) => {
  //   try {
  //     const result = await sendDeviceCommand(`TEST_RESPONSE_${responseValue}`);
  //     setTestStatus(`Simulated device response: ${responseValue}`);
  //     return result;
  //   } catch (err) {
  //     console.error('Failed to simulate device response:', err);
  //     return { error: err.message };
  //   }
  // };

  // Fetch snapshots on component mount
  useEffect(() => {
    fetchSnapshots(selectedMac);

    const snapshotInterval = setInterval(() => {
      fetchSnapshots(selectedMac);
    }, 240000); // ✅ Set up timer

    return () => clearInterval(snapshotInterval); // ✅ Cleanup
  }, [selectedMac]);

  const alarmKeys = [
    {
      key: "fireAlarm",
      Name: "Fire Alarm",
    },
    {
      key: "waterLogging",
      Name: "Logging",
    },
    {
      key: "waterLeakage",
      Name: "Leakage",
    },
  ];

  const statusKeys = [
    {
      key: "lockStatus",
      Name: "Lock",
    },
    {
      key: "doorStatus",
      Name: "Door",
    },
    {
      key: "pwsFailCount",
      Name: "Password",
    },
  ];

  const hupsKeys = [
    {
      key: "mainStatus",
      Name: "Main",
    },
    {
      key: "rectStatus",
      Name: "Rectfier",
    },
    {
      key: "inveStatus",
      Name: "Inverter",
    },
    {
      key: "overStatus",
      Name: "O.Load",
    },
    {
      key: "mptStatus",
      Name: "MPT",
    },
    {
      key: "mosfStatus",
      Name: "MOSFET",
    },
  ];

  return (
    <>
      {/* Logo */}
      <div className="logo-panel">

        <div
          style={{
            display: "flex"
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 60,
              display: "flex",
              alignItems: "center",
              gap: 10,
              zIndex: 99
            }}

          >
            <img
              src="/technotrendz.png"
              alt="Technotrendz Logo"
              style={{ height: "100px", width: "200px" }}
            />
          </div>
        </div>
      </div>

      <div className="test-controls-panel">
        <h2>🧪 ATS Test Controls</h2>
        <div className="test-buttons">
          <button
            className="btn-test"
            onClick={iMoni_test}
            disabled={awaitingCommand}
          >
            {awaitingCommand ? "Running ATS..." : "Run ATS Tests"}
          </button>
          {/* <button
            className="btn-test-secondary"
            onClick={runTestsStepByStep}
          >
            Run Step-by-Step
          </button> */}
        </div>

        {/* Notification Banner */}
        {notification && (
          <div style={{
            backgroundColor: '#1a3a3a',
            border: '2px solid #00cccc',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0, 204, 204, 0.3)'
          }}>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#00cccc' }}>
                {notification.title}
              </h4>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#00cccc',
                fontSize: '20px',
                cursor: 'pointer',
                marginLeft: '12px',
                padding: '0 8px'
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* <div className="test-status-display">
          <h4>Test Status: {testStatus}</h4>
          {currentTest && <p>Current Test: {currentTest}</p>}

          <div className="simulation-buttons">
            <h5>Simulate Device Response (for testing):</h5>
            <button onClick={() => simulateDeviceResponse(1)}>Response: 1</button>
            <button onClick={() => simulateDeviceResponse(2)}>Response: 2</button>
            <button onClick={() => simulateDeviceResponse(3)}>Response: 3</button>
            <button onClick={() => simulateDeviceResponse(0)}>Response: 0</button>
          </div>

          <div className="manual-command">
            <input
              type="text"
              placeholder="Enter device command/response"
              value={testCommandInput}
              onChange={(e) => setTestCommandInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendManualTestCommand()}
            />
            <button onClick={sendManualTestCommand}>Send to Device</button>
          </div>
        </div> */}

        {testProgress.length > 0 && (
          <div className="test-results">
            <h4>ATS Results ({testProgress.length} tests)</h4>
            {testStatus}
            <div className="test-results-list">
              {testProgress.map((result, index) => (
                <div key={index} className={`test-result ${result.status}`}>
                  <strong>{result.name || result.test}</strong>: {result.status.toUpperCase()}
                  {result.message && <div className="test-message">📝 {result.message}</div>}
                  <div className="test-details">
                    <div>Expected: {result.expectedOutcome !== null ? result.expectedOutcome : 'N/A'}</div>
                    <div>Received: {result.receivedOutcome || 'No response'}</div>
                  </div>
                  {result.output && <div className="test-output">{result.output}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="dashboard">
        <div className="panel">
          <h2 className="selected-heading">
            📟 Selected Rack: {selectedMac && <span> {selectedDevice}</span>}
          </h2>
          {latestReading && (
            <div>
              <div className="tabs">
                <button
                  className={activeTab === "gauges" ? "active" : ""}
                  onClick={() => setActiveTab("gauges")}
                >
                  Gauges
                </button>
                <button
                  className={activeTab === "status" ? "active" : ""}
                  onClick={() => setActiveTab("status")}
                >
                  Status
                </button>
                <button
                  className={activeTab === "snapshots" ? "active" : ""}
                  onClick={() => fetchSnapshots(selectedMac)}
                >
                  Snapshots
                </button>
              </div>

              {activeTab === "gauges" && (
                <div className="gauges grid-3x3">
                  <Gauge
                    label="Inside Temp"
                    value={latestReading.insideTemperature}
                    max={100}
                    color="#e63946"
                    alarm={latestReading.insideTemperatureAlarm}
                  />
                  <Gauge
                    label="Outside Temp"
                    value={(latestReading.outsideTemperature).toFixed(2)}
                    max={100}
                    color="#fca311"
                    alarm={latestReading.outsideTemperatureAlarm}
                  />
                  <Gauge
                    label="Humidity"
                    value={latestReading.humidity}
                    max={100}
                    color="#1d3557"
                    alarm={latestReading.humidityAlarm}
                  />
                  <Gauge
                    label="Input Volt"
                    value={(latestReading.inputVoltage).toFixed(2)}
                    max={5}
                    color="#06d6a0"
                    alarm={latestReading.inputVoltageAlarm}
                  />
                  <Gauge
                    label="Output Volt"
                    value={(latestReading.outputVoltage).toFixed(2)}
                    max={5}
                    color="#118ab2"
                    alarm={latestReading.outputVoltageAlarm}
                  />
                  <Gauge
                    label="DV Current"
                    value={latestReading.batteryBackup}
                    max={12}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  <Gauge
                    label="Battery %"
                    value={(latestReading.batteryBackup * 1.5).toFixed(2)}
                    max={120}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  <Gauge
                    label="Battery(Hours)"
                    value={(latestReading.batteryBackup).toFixed(2)}
                    max={120}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  {latestReading.batteryBackup <= 10 ?
                    <Gauge
                      label="LockBat(Left Hours)"
                      value={0}
                      max={12}
                      color="#ffc107"
                      alarm={latestReading.batteryBackupAlarm}
                    /> :
                    <Gauge
                      label="LockBat(Left Hours)"
                      value={Math.floor(((latestReading.batteryBackup - 9) * 4))}
                      // value={6}
                      max={12}
                      color="#ffc107"
                      alarm={latestReading.batteryBackupAlarm}
                    />
                  }
                </div>
              )}

              {activeTab === "status" && (
                <div className="alarm-group">
                  <div className="fan-status">
                    <div className="fan-status-line">
                      <h4>Fan Running Status</h4>
                      {[...Array(6)].map((_, i) => {
                        const statusVal = latestReading[`fan${i + 1}Status`]; // 0=off, 1=healthy, 2=faulty
                        // console.log('statusVal', statusVal);
                        // console.log("statusC");
                        let statusClass = "off";
                        if (statusVal === 1) {
                          statusClass = "running"; // green
                        } else if (statusVal === 2) {
                          statusClass = "faulty"; // red
                        }
                        // console.log(statusClass);
                        return (
                          <div key={i} className="fan-light">
                            <div className={`fan-light-circle ${statusClass}`} />
                            <div className="fan-label">F{i + 1}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="alarm-line">
                      <h4>Alarms</h4>
                      {alarmKeys.map((alarm, i) => (
                        <div key={i} className="alarm-indicator">
                          <div
                            className={`alarm-led ${latestReading[alarm.key] ? "active" : ""
                              }`}
                          />
                          <div className="alarm-label">{alarm.Name}</div>
                        </div>
                      ))}
                      {statusKeys.map((status, i) => {
                        if (status.key !== "pwsFailCount") {
                          return (
                            <div key={i} className="alarm-indicator">
                              <div
                                className={`alarm-led ${latestReading[status.key] === "OPEN"
                                  ? "active"
                                  : ""
                                  }`}
                              />
                              <div className="alarm-label">{status.Name}</div>
                            </div>
                          );
                        } else {
                          return (
                            <>
                              <div key={i} className="alarm-indicator">
                                {/* <div className={`alarm-led ${latestReading[status.key] === 1 ? 'active' : ''}`} /> */}
                                <div
                                  className={`alarm-led
                              ${latestReading[status.key] === 1
                                      ? "pass-danger"
                                      : latestReading[status.key] === 2
                                        ? "pass-warn"
                                        : latestReading[status.key] === 3
                                          ? "pass-active"
                                          : ""
                                    }`}
                                />
                                <div className="alarm-label">{status.Name}</div>
                                <div className="alarm-attempt">{3 - latestReading[status.key]} Attempt Left</div>
                              </div>
                            </>
                          );
                        }
                      })}
                    </div>
                    <div className="alarm-line">
                      <h4>HUPS</h4>
                      {hupsKeys.map((hups, i) => (
                        <div key={i} className="alarm-indicator">
                          <div
                            className={`alarm-led ${latestReading[hups.key] ? "active" : ""
                              }`}
                          />
                          <div className="alarm-label">
                            {hups.Name}
                          </div>
                        </div>
                      ))}
                      {/* {["O.Load", "MPT", "MOSFET"].map((key, i) => (
                        <div key={i} className="alarm-indicator">
                          <div
                            className={`alarm-led ${latestReading[key] === "OPEN" ? "active" : ""
                              }`}
                          />
                          <div className="alarm-label">
                            {key.replace("Status", "")}
                          </div>
                        </div>
                      ))} */}
                    </div>
                    <h4>🛠 Commands</h4>
                    <div className="fan-power-buttons aligned">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div key={level} className="fan-light">
                          <button
                            className={`power-btn ${activeFanBtns.includes(level) ||
                              (latestReading &&
                                latestReading[`fanLevel${level}Running`] === true)
                              ? "active"
                              : ""
                              }`}
                            onClick={() => handleFanClick(level)}
                          />
                          <div className="fan-label">
                            {level >= 1 && level <= 4 ? `FG ${level}` : "NON-CRITICAL LOAD"}
                          </div>
                        </div>
                      ))}
                      <div className="fan-light">
                        <button className="lock-btn" onClick={handleOpenLock}>
                          🔓
                        </button>
                        <div className="fan-label">Lock</div>
                      </div>
                      <div className="fan-light">
                        <button className="lock-btn" onClick={handleResetLock}>
                          🔐
                        </button>
                        <div className="fan-label">Reset</div>
                      </div>
                      <div className="fan-light">
                        <button className="lock-btn" onClick={openPassword}>
                          🔐
                        </button>
                        <div className="fan-label">Open PWD</div>
                      </div>
                    </div>
                    <span>SysId: {selectedMac.slice(9, 17)}</span>
                    {status && <p>{status}</p>}
                  </div>
                </div>
              )}


              {/* Full Screen Image Modal with Navigation */}
              {selectedImage && (
                <div
                  className="fullscreen-modal"
                  onClick={() => setSelectedImage(null)}
                >
                  <div className="modal-header">
                    <button
                      className="close-btn-fullscreen"
                      onClick={() => setSelectedImage(null)}
                    >
                      ✕
                    </button>
                    <div className="image-title">
                      {selectedImage.split("/").pop()} (
                      {snapshots.findIndex(
                        (img) =>
                          `${process.env.REACT_APP_API_URL}/api/snapshots/${img}` ===
                          selectedImage
                      ) + 1}{" "}
                      of {snapshots.length})
                    </div>
                  </div>

                  {/* Navigation Arrows */}
                  {snapshots.length > 1 && (
                    <>
                      <button
                        className="nav-arrow left-arrow"
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentIndex = snapshots.findIndex(
                            (img) =>
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${img}` ===
                              selectedImage
                          );
                          const prevIndex =
                            (currentIndex - 1 + snapshots.length) %
                            snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[prevIndex]}`
                          );
                        }}
                      >
                        ‹
                      </button>
                      <button
                        className="nav-arrow right-arrow"
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentIndex = snapshots.findIndex(
                            (img) =>
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${img}` ===
                              selectedImage
                          );
                          const nextIndex =
                            (currentIndex + 1) % snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[nextIndex]}`
                          );
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}

                  <div className="modal-body">
                    <img
                      src={selectedImage}
                      alt="Enlarged view"
                      className="fullscreen-image"
                    />
                  </div>
                </div>
              )}

              {/* Snapshots */}
              {activeTab === "snapshots" && (
                <div className="camera-tab">
                  <h4>🖼️ Snapshots</h4>
                  <div className="snapshots-grid">
                    {snapshots.length > 0 ? (
                      snapshots.map((filename, i) => (
                        <div
                          key={i}
                          className="snapshot-item"
                          onClick={() =>
                            setSelectedImage(
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${filename}?mac=${selectedMac}`
                            )
                          }
                        >
                          <img
                            key={i}
                            src={`${process.env.REACT_APP_API_URL}/api/snapshots/${filename}?mac=${selectedMac}`}
                            alt={`snapshot-${i + 1}`}
                            onError={(e) => {
                              e.target.src =
                                "https://via.placeholder.com/120x90?text=Error";
                            }}
                          />
                          <div className="snapshot-label">{filename}</div>
                        </div>
                      ))
                    ) : (
                      <p>No snapshots available</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel 2: Chart */}
        {/* <div className="panel">
          <h2>📈 Historical Data</h2>
          {selectedMac && historicalData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 10, fill: "#ccc" }}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="insideTemperature"
                  stroke="#ff4d4f"
                  dot={false}
                  isAnimationActive={true}
                  name="insideTemp"
                />
                <Line
                  type="monotone"
                  dataKey="humidity"
                  stroke="#1d3557"
                  dot={false}
                  isAnimationActive={true}
                />
                <Line
                  type="monotone"
                  dataKey="inputVoltage"
                  stroke="#00b894"
                  dot={false}
                  isAnimationActive={true}
                  name="I/P volt"
                />
                <Line
                  type="monotone"
                  dataKey="outputVoltage"
                  stroke="#0984e3"
                  dot={false}
                  isAnimationActive={true}
                  name="O/P volt"
                />
                <Line
                  type="monotone"
                  dataKey="batteryBackup"
                  stroke="#2205ffff"
                  dot={false}
                  isAnimationActive={true}
                  name="Battery"
                />
                <Line
                  type="monotone"
                  dataKey="outsideTemperature"
                  stroke="#0b6517ff"
                  dot={false}
                  isAnimationActive={true}
                  name="outsideTemp"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p>Select a device to see its historical chart</p>
          )}
        </div> */}

        {/* Panel 3: Device Tiles */}
        {/* <div className="panel device-list">
          <h2>🟢 Devices</h2>
          <div className="grid">
            {(() => {
              const latestReadingsByMac = {};
              readings.forEach((r) => {
                const existing = latestReadingsByMac[r.mac];
                if (
                  !existing ||
                  new Date(r.timestamp) > new Date(existing.timestamp)
                ) {
                  latestReadingsByMac[r.mac] = r;
                }
              });

              return deviceMeta.map((device) => {
                const mac = device.mac;
                const reading = latestReadingsByMac[mac];
                let colorClass = "disconnected"; // default

                if (reading && reading.timestamp) {
                  const age =
                    Date.now() - new Date(reading.timestamp).getTime();
                  const staleThreshold = 30000; // 30 seconds

                  if (age <= staleThreshold) {
                    // Use status from latest valid reading
                    const hasStatusAlarm = isAlarmActive(reading);
                    const hasGaugeAlarm =
                      reading.insideTemperatureAlarm ||
                      reading.outsideTemperatureAlarm ||
                      reading.humidityAlarm ||
                      reading.inputVoltageAlarm ||
                      reading.outputVoltageAlarm ||
                      reading.batteryBackupAlarm;

                    colorClass = hasStatusAlarm
                      ? "status-alarm"
                      : hasGaugeAlarm
                        ? "gauge-alarm"
                        : "connected";
                  } else {
                    // Reading is stale — treat as disconnected
                    colorClass = "disconnected";
                  }
                }

                return (
                  <div
                    key={mac}
                    // className={`device-tile ${colorClass} ${selectedMac === mac ? "selected" : ""
                    //   }`}
                    className={`device-tile selected`}
                  // onClick={() => { setSelectedMac(mac); setSelectedDevice(device.locationId) }}
                  >
                    {selectedDevice}
                  </div>
                );
              });
            })()}
          </div>
        </div> */}

        {/* Panel 4: Map */}
        {/* <div className="panel device-map">
          <h2>🗺️ Device Map</h2>

          {(() => {
            const selectedDevice = deviceMeta.find(
              (d) => d.mac === selectedMac
            );
            const lat = parseFloat(selectedDevice?.latitude);
            const lon = parseFloat(selectedDevice?.longitude);
            const selectedCenter =
              !isNaN(lat) && !isNaN(lon) ? [lat, lon] : defaultLocation;

            return (
              <MapContainer
                key={selectedMac || "default-map"}
                center={selectedCenter}
                zoom={15}
                scrollWheelZoom={true}
                style={{ height: "315px", width: "100%" }}
                whenCreated={handleMapCreated}
              >
                <TileLayer
                  url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
                />

                {deviceMeta.map((device) => {
                  const mac = device.mac;
                  const reading = latestReadingsByMac[mac];

                  let dotClass = "disconnected"; // Default state

                  if (reading) {
                    const timeDiff =
                      Date.now() - new Date(reading.timestamp).getTime();
                    const isStale = timeDiff > 30000;

                    if (!isStale) {
                      const hasStatusAlarm = isAlarmActive(reading);
                      const hasGaugeAlarm =
                        reading.insideTemperatureAlarm ||
                        reading.outsideTemperatureAlarm ||
                        reading.humidityAlarm ||
                        reading.inputVoltageAlarm ||
                        reading.outputVoltageAlarm ||
                        reading.batteryBackupAlarm;

                      dotClass = hasStatusAlarm
                        ? "status-alarm"
                        : hasGaugeAlarm
                          ? "gauge-alarm"
                          : "connected";
                    }
                  }

                  const icon = L.divIcon({
                    className: "custom-marker",
                    html: `<div class="marker-dot ${dotClass}"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                  });

                  const lat = parseFloat(device.latitude);
                  const lon = parseFloat(device.longitude);
                  if (isNaN(lat) || isNaN(lon)) return null;

                  return (
                    <Marker
                      key={mac}
                      position={[lat, lon]}
                      icon={icon}
                      ref={(ref) => {
                        markerRefs.current[mac] = ref;
                      }}
                      eventHandlers={{
                        click: () => setSelectedMac(mac),
                      }}
                    >
                      <Popup>
                        {device.locationId || mac}
                        <br />
                        {device.address || ""}
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            );
          })()}

          <div
            style={{
              marginTop: "8px",
              fontSize: "0.8rem",
              color: "#aaa",
              textAlign: "right",
            }}
          >
            Best viewed on{" "}
            {navigator.userAgent.includes("Chrome")
              ? "Chrome"
              : navigator.userAgent.includes("Firefox")
                ? "Firefox"
                : "your browser"}{" "}
            @ {window.innerWidth}x{window.innerHeight}
          </div>
        </div> */}
      </div>
    </>
  );
}

function Gauge({ label, value, max, color, alarm = false }) {
  return (
    <div className={`gauge-box small ${alarm ? "alarm" : ""}`}>
      <CircularProgressbar
        value={value}
        maxValue={max}
        text={`${value}`}
        styles={buildStyles({
          pathColor: color,
          textColor: "#fff",
          trailColor: "#333",
        })}
      />
      <div className="gauge-label">{label}</div>
    </div>
  );
}



export default DashboardView;
