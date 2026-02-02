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
  const [testProgress, setTestProgress] = useState([]);
  const [currentTestStep, setCurrentTestStep] = useState(0);
  const [testCommandInput, setTestCommandInput] = useState("");
  const [notification, setNotification] = useState(null);
  const [liveReading, setLiveReading] = useState(null);  // Separate state for immediate UI updates
  const notificationTimeoutRef = useRef(null);  // Track notification auto-dismiss timeout

  const [selectedTests, setSelectedTests] = useState([]);
  const [testList, setTestList] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");

  const [awaitingCommand, setAwaitingCommand] = useState(false);
  const [fanTestStatus, setFanTestStatus] = useState(false);

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
  // Use liveReading if available, otherwise fall back to readings array
  const latestReading = liveReading?.mac === selectedMac ? liveReading : readings.find((r) => r.mac === selectedMac);

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

  // CAMERA TEST DIALOG BOX
  const showCameraDialog = ({ imagePath, message, onConfirm, onCancel }) => {
    swal.fire({
      title: '📷 Camera Test',
      html: `
      <div style="text-align: center;">
        <p style="margin-bottom: 15px; font-size: 16px;">${message || 'Camera image captured. Please verify.'}</p>
        <div style="background: #2a2a3a; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #00cccc; font-size: 14px; margin: 0;">📁 Image saved at:</p>
          <p style="color: #ffcc00; font-size: 18px; font-family: monospace; margin: 10px 0; word-break: break-all;">
            ${imagePath}
          </p>
        </div>
        <p style="color: #aaa; font-size: 14px;">Please open the file to verify the image and confirm the result.</p>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: '✅ Pass',
      cancelButtonText: '❌ Fail',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#dc3545',
      background: '#1a1a2e',
      color: '#fff',
      width: '550px',
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then((result) => {
      if (result.isConfirmed) {
        onConfirm();
      } else {
        onCancel();
      }
    });
  };

  useEffect(() => {
    const connectWebSocket = () => {
      console.log('🔄 Attempting WebSocket connection...');

      const wsUrl = process.env.NODE_ENV === 'production'
        ? `wss://${window.location.host}`
        : (process.env.REACT_APP_WS_URL || 'ws://localhost:8080');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Connecting WebSocket
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message type:', message.type);

          // Getting New Reading from Socket
          if (message.type === 'NEW_READING') {
            const newReading = message.data;
            setSelectedMac(prev => prev || newReading.mac);
            setSelectedDevice(prev => prev || newReading.locationId || newReading.mac);
            // Update live reading immediately for current device
            setLiveReading(prev => {
              if (!prev || prev.mac === newReading.mac) return newReading;
              return prev;
            });
            //! Also update readings array for history
            setReadings(prev => {
              const filtered = prev.filter(r => r.mac !== newReading.mac);
              return [...filtered, newReading].slice(-400);
            });
          }

          // Handle test status messages
          if (message.type === 'TEST_STARTED') {
            setCurrentTest(message.name || message.testFile);
            setTestStatus(`🏁 ${message.pre || message.message || 'Test started'}`);

            // Show notification banner - check for pre (multi-step) or message (single-step)
            if (message.pre || (message.message && message.message !== "No message")) {
              setNotification({
                title: `Test: ${message.name}`,
                pre: message.pre || '',
                message: message.message || '',
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

          // Handle multi-step test messages
          if (message.type === 'STEP_STARTED') {
            setCurrentTestStep(message.stepNumber);
            // Server sends 'message' field for step message
            const stepMsg = message.message && message.message !== "No message" ? message.message : `Step ${message.stepNumber}/${message.totalSteps}`;
            setTestStatus(`🔄 ${message.name} - ${stepMsg}`);

            // Handle dialog confirmation steps
            // if (message.waitFor === "dialog") {
            //   swal.fire({
            //     title: message.name,
            //     text: message.msg || `Is Step ${message.stepNumber} completed?`,
            //     icon: 'question',
            //     showCancelButton: true,
            //     confirmButtonText: 'Yes, Passed ✅',
            //     cancelButtonText: 'No, Failed ❌',
            //     confirmButtonColor: '#28a745',
            //     cancelButtonColor: '#dc3545',
            //     allowOutsideClick: false,
            //     allowEscapeKey: false
            //   }).then((result) => {
            //     // Send response back to server via WebSocket
            //     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            //       wsRef.current.send(JSON.stringify({
            //         type: 'DIALOG_RESPONSE',
            //         confirmed: result.isConfirmed,
            //         stepNumber: message.stepNumber,
            //         testName: message.name
            //       }));
            //       console.log(`📤 Sent dialog response: ${result.isConfirmed ? 'OK' : 'Cancel'}`);
            //     }
            //   });
            //   return;  // Don't show notification for dialog steps
            // }

            // Show notification immediately - cancel any pending timeout
            if (message.message && message.message !== "No message") {
              // Clear previous auto-dismiss timeout
              if (notificationTimeoutRef.current) {
                clearTimeout(notificationTimeoutRef.current);
              }

              const currentWaitTime = message.waitTime || 20;

              setNotification({
                title: `${message.name} - Step ${message.stepNumber}/${message.totalSteps}`,
                message: message.message,
                type: 'info',
                waitTime: currentWaitTime
              });

              // Auto-dismiss after waitTime (but will be replaced by STEP_COMPLETED anyway)
              notificationTimeoutRef.current = setTimeout(() => {
                setNotification(null);
              }, currentWaitTime * 1000);
            }
          }

          if (message.type === 'STEP_COMPLETED') {
            // Server sends 'status' field: 'passed' or 'failed'
            const isPassed = message.status === 'passed';
            const stepResult = isPassed ? '✅' : '❌';
            setTestStatus(`${stepResult} ${message.name} - Step ${message.stepNumber}/${message.totalSteps} ${isPassed ? 'PASSED' : 'FAILED'}`);

            // Clear previous auto-dismiss timeout
            if (notificationTimeoutRef.current) {
              clearTimeout(notificationTimeoutRef.current);
            }

            // Show completion notification immediately
            setNotification({
              title: `${message.name} - Step ${message.stepNumber}/${message.totalSteps}`,
              message: `${stepResult} ${message.message || (isPassed ? 'Step passed' : 'Step failed')}`,
              type: isPassed ? 'success' : 'error'
            });

            // Auto-dismiss after 3 seconds (or will be replaced by next STEP_STARTED)
            notificationTimeoutRef.current = setTimeout(() => {
              setNotification(null);
            }, 3000);
          }

          if (message.type === 'CAMERA_IMAGE_CAPTURED') {
            console.log('📷 Camera image captured:', message);

            swal.fire({
              title: '📷 Camera Test',
              html: `
      <div style="text-align: center;">
        <p style="margin-bottom: 15px; font-size: 16px;">${message.message || 'Camera image captured. Please verify.'}</p>
        <div style="background: #2a2a3a; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #00cccc; font-size: 14px; margin: 0;">📁 Image saved at:</p>
          <p style="color: #ffcc00; font-size: 18px; font-family: monospace; margin: 10px 0; word-break: break-all;">
            ${message.imagePath}
          </p>
        </div>
        <p style="color: #aaa; font-size: 14px;">Please open the file to verify and confirm the result.</p>
      </div>
    `,
              showCancelButton: true,
              confirmButtonText: '✅ Pass',
              cancelButtonText: '❌ Fail',
              confirmButtonColor: '#28a745',
              cancelButtonColor: '#dc3546ff',
              background: '#1a1a2e',
              color: '#fff',
              width: '550px',
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then((result) => {
              // Send the user's response back to the WebSocket
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'DIALOG_RESPONSE',
                  confirmed: result.isConfirmed // true for Pass, false for Fail
                }));
                console.log(`📤 Sent camera dialog response: ${result.isConfirmed ? 'PASS' : 'FAIL'}`);
              }
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

  const confirmDialogBox = async ({ title, text, cancelBtn, confirmBtn, cancelText }) => {
    return await swal.fire({
      title: title,
      text: text,
      showCancelButton: cancelBtn,
      confirmButtonText: confirmBtn,
      cancelButtonText: cancelText,
    })
  }

  // SNAPSHOT FETCHING USEEFFECT
  useEffect(() => {
    fetchSnapshots(selectedMac);

    const snapshotInterval = setInterval(() => {
      fetchSnapshots(selectedMac);
    }, 240000); // ✅ Set up timer

    return () => clearInterval(snapshotInterval); // ✅ Cleanup
  }, [selectedMac]);
  // Run ATS: Frontend dialogs first, then server tests


  const handleProductChange = async (e) => {
    setSelectedProduct(e.target.value);
  }

  useEffect(() => {
    const fetchTests = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/${selectedProduct}`);
        const tests = await res.json();
        setTestList(tests);
      } catch (err) {
        console.error('Error fetching tests:', err);
      }
    };

    if (selectedProduct) {
      fetchTests();
    }
  }, [selectedProduct]);

  async function iMoni_test() {
    setAwaitingCommand(true); // Shows 'Running...' state
    const frontendResults = []; // Stores Visual & Burn-in results

    if (selectedTests.length === testList.length) {

      // 1. Visual Test (frontend dialog)
      // const v = await swal.fire({
      //   title: 'Visual Test',
      //   text: 'Is Visual inspection passed?',
      //   showCancelButton: true,
      //   confirmButtonText: 'Pass',
      //   cancelButtonText: 'Fail'
      // });

      const v = confirmDialogBox({
        title: 'Visual Test',
        text: 'Is Visual inspection passed?',
        showCancelButton: true,
        confirmButtonText: 'Pass',
        cancelButtonText: "Fail"
      })

      frontendResults.push({
        name: 'Visual Test',
        status: v.isConfirmed ? 'passed' : 'failed',
        passed: v.isConfirmed
      });

      // 2. Burn-In Test (frontend dialog)  
      const b = await swal.fire({
        title: 'Burn-In Test',
        text: 'Is Burn-In test passed?',
        showCancelButton: true,
        confirmButtonText: 'Pass',
        cancelButtonText: 'Fail'
      });
      frontendResults.push({
        name: 'Burn-In Test',
        status: b.isConfirmed ? 'passed' : 'failed',
        passed: b.isConfirmed
      });

      // 3. Runs API '/tests/run-all/'
      try {
        const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/run-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac: selectedMac, skipFrontendTests: true, frontendResults })
        });
        const data = await resp.json();
        setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
      } catch (err) {
        setTestStatus(`Error: ${err.message}`);
      }
    } else {
      console.log("Selected Test code runs ...");

      try {
        const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac: selectedMac, selectedProduct, selectedTests })
        });
        const data = await resp.json();
        setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
      } catch (err) {
        setTestStatus(`Error: ${err.message}`);
      }
    }
    setAwaitingCommand(false);
  }

  async function fan_test() {
    setFanTestStatus(true);

    try {
      console.log("Calling /fan-test API...");
      const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/fan-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mac: selectedMac })
      });

      console.log("...API Called")
      const data = await resp.json();
      console.log("Data: ", data);
      setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
    } catch (err) {
      setTestStatus(`Error: ${err.message}`);
    }
    setFanTestStatus(false);
  }

  async function pdu_test() {
    console.log("PDU Test function called");
  };



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

      {/* TEST PANEL */}
      <div className="test-controls-panel">
        <h2>🧪 ATS Test Controls</h2>
        <div className="test-buttons">

          <div>
            <select value={selectedProduct} onChange={handleProductChange}>
              <option defaultChecked>Select</option>
              <option value="iMoni">iMoni Tests</option>
              <option value="fan">Fan Tests</option>
              <option value="pdu">PDU Tests</option>
            </select>
          </div>


          {selectedProduct === "iMoni" ?
            <button
              className="btn-test"
              onClick={iMoni_test}
              disabled={awaitingCommand}
            >
              {awaitingCommand ? "Running ATS..." : "Run ATS Tests"}
            </button> : selectedProduct === "fan" ?
              <button
                className="btn-test"
                onClick={fan_test}
                disabled={awaitingCommand}
              >
                {fanTestStatus ? "Running Fan Test..." : "Run Fan Test"}
              </button> : selectedProduct === "pdu" ?
                <button
                  className="btn-test"
                  onClick={pdu_test}
                  disabled={awaitingCommand}
                >
                  {awaitingCommand ? "Running PDU Test..." : "Run PDU Test"}
                </button> :
                <h4>Select a product to run tests</h4>
          }




          {/* CANCEL ATS TEST BUTTON */}
          {awaitingCommand && (
            <button
              className="btn-test-stop"
              onClick={async () => {
                try {
                  await fetch(`${process.env.REACT_APP_API_URL}/api/tests/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  setAwaitingCommand(false);
                  setTestStatus('🛑 Tests stopped by user');
                  setNotification({
                    title: 'Tests Stopped',
                    message: 'Testing process was stopped by user',
                    type: 'error'
                  });
                } catch (err) {
                  console.error('Failed to stop tests:', err);
                }
              }}
              style={{
                backgroundColor: '#cc3333',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                marginLeft: '10px',
                fontWeight: 'bold'
              }}
            >
              🛑 Stop Test
            </button>
          )}

          {/* CANCEL FAN TEST BUTTON */}
          {fanTestStatus && (
            <button
              className="btn-test-stop"
              onClick={async () => {
                try {
                  await fetch(`${process.env.REACT_APP_API_URL}/api/tests/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  setFanTestStatus(false);
                  setTestStatus('🛑 Tests stopped by user');
                  setNotification({
                    title: 'Tests Stopped',
                    message: 'Testing process was stopped by user',
                    type: 'error'
                  });
                } catch (err) {
                  console.error('Failed to stop tests:', err);
                }
              }}
              style={{
                backgroundColor: '#cc3333',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                marginLeft: '10px',
                fontWeight: 'bold'
              }}
            >
              🛑 Stop Test
            </button>
          )}

          {/* <button
            className="btn-test-secondary"
            onClick={runTestsStepByStep}
          >
            Run Step-by-Step
          </button> */}
        </div>

        {/* TEST NOTIFICATION BANNER */}
        {notification && (
          <div style={{
            backgroundColor: notification.type === 'success' ? '#1a3a2a' : notification.type === 'error' ? '#3a1a1a' : '#1a3a3a',
            border: `2px solid ${notification.type === 'success' ? '#00cc66' : notification.type === 'error' ? '#cc3333' : '#00cccc'}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            color: '#fff',
            boxShadow: `0 4px 12px ${notification.type === 'success' ? 'rgba(0, 204, 102, 0.3)' : notification.type === 'error' ? 'rgba(204, 51, 51, 0.3)' : 'rgba(0, 204, 204, 0.3)'}`,
            animation: 'slideIn 0.3s ease-out',
            transition: 'all 0.3s ease'
          }}>
            <style>{`
              @keyframes slideIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 8px 0', color: notification.type === 'success' ? '#00cc66' : notification.type === 'error' ? '#cc3333' : '#00cccc', fontSize: '18px' }}>
                {notification.title}
              </h4>
              {notification.pre && (
                <p style={{ margin: '0 0 8px 0', color: '#ffcc00', fontSize: '14px', fontWeight: 'bold' }}>
                  ⚠️ {notification.pre}
                </p>
              )}
              <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.6', fontWeight: '500' }}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: notification.type === 'success' ? '#00cc66' : notification.type === 'error' ? '#cc3333' : '#00cccc',
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

        {testList.length > 0 ? testList.map((test) => (
          <label style={{ display: "block" }}>
            <input type="checkbox" defaultChecked />
            {test}
          </label>
        )) : <p>No Tests found</p>}
      </div>

      {/* DASHBOARD */}
      <div className="dashboard">
        <div className="panel">
          <h2 className="selected-heading">
            📟 Selected Rack: {selectedMac && <span> {selectedDevice}</span>}
          </h2>
          {latestReading && (
            <div>
              <div className="tabs">
                {/* <button
                  className={activeTab === "gauges" ? "active" : ""}
                  onClick={() => setActiveTab("gauges")}
                >
                  Gauges
                </button>
                <button
                  className={activeTab === "snapshots" ? "active" : ""}
                  onClick={() => fetchSnapshots(selectedMac)}
                >
                  Snapshots
                </button> */}
              </div>

              {/* ============================== TAB : GAUGES ============================== */}
              <button
                className="tabs-button"
                onClick={() => setActiveTab("gauges")}
              >
                Gauges
              </button>

              {"gauges" && (
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

              {/* ============================== TAB : STATUS ============================== */}
              <button
                className="tabs-button"
                onClick={() => setActiveTab("status")}
              >
                Status
              </button>
              <span>SysId: {selectedMac.slice(9, 17)}</span>
              <span>SysId: {selectedMac.slice(8)}</span>
              {"status" && (
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
                            className={`alarm-led ${latestReading[alarm.key] === 87 ? "wait" : latestReading[alarm.key] ? "active" : ""
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
                    {status && <p>{status}</p>}
                  </div>
                </div>
              )}

              {/* ============================== TAB : SNAPSHOTS ============================== */}
              <button
                className="tabs-button"
                onClick={() => setActiveTab("gauges")}
              >
                Snapshots
              </button>

              {/* FULL SCREEN IMAGE MODAL */}
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
      </div>
    </>
  );
}

// GAUGE COMPONENT
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
