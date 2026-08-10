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
import PDU_STEPS from "./pdu_steps";
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

  const [showATSPanel, setShowATSPanel] = useState(true);

  const notificationTimeoutRef = useRef(null);  // Track notification auto-dismiss timeout

  const [selectedProduct, setSelectedProduct] = useState("");

  const [testLevel, setTestLevel] = useState("full-controller");
  const [unitSerialNo, setUnitSerialNo] = useState("");
  const [cpuSrNo, setCpuSrNo] = useState("");
  const [basePcbSrNo, setBasePcbSrNo] = useState("");
  const [cameraSrNo, setCameraSrNo] = useState("");
  const [psuSrNo, setPsuSrNo] = useState("");
  // const [controllerId, setControllerId] = useState("");

  // States for Test Lists
  const [selectedTests, setSelectedTests] = useState([]);  // Stores selected tests
  const [fetchedTestList, setFetchedTestList] = useState([]); // Stores Fetched tests from backend

  const [awaitingCommand, setAwaitingCommand] = useState(false); // Waiting for ATS Execution
  const [fanTestStatus, setFanTestStatus] = useState(false); // Waiting for Fan Test Execution
  const [pduTestStatus, setPduTestStatus] = useState(false); // Waiting for PDU Test Execution

  const [testResults, setTestResults] = useState([]);

  const [generateReport, setGenerateReport] = useState(true);

  const [refreshing, setRefreshing] = useState(false);


  const isTestRunning = awaitingCommand || fanTestStatus || pduTestStatus;

  //Map and marker refs
  // const mapRef = useRef(null);
  const wsRef = useRef(null);

  const manualCloseRef = useRef(false);
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
    // const isActive = activeFanBtns.includes(level);

    const isActive =
      level === 5
        ? activeFanBtns.includes(5)
        : latestReading?.[`fanLevel${level}Running`] === true;

    const command = isActive
      ? `%R0${level}F${getFormattedDateTime()}$`
      : `%R0${level}N${getFormattedDateTime()}$`;

    console.log(command);

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
    // setActiveFanBtns(
    //   isActive
    //     ? activeFanBtns.filter((l) => l !== level)
    //     : [...activeFanBtns, level]
    // );
    // setActiveFanBtns((prev) =>
    //   isActive
    //     ? prev.filter((l) => l !== level)
    //     : [...prev, level]
    // );
    if (level === 5) {
      setActiveFanBtns((prev) =>
        prev.includes(5)
          ? prev.filter((l) => l !== 5)
          : [...prev, 5]
      );
    }
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
  //     const fetchedTestList = await listResponse.json();

  //     for (const testFile of fetchedTestList.availableTests) {
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

  const connectWebSocket = () => {
    console.log("🔄 Attempting WebSocket connection...");

    const wsUrl =
      process.env.NODE_ENV === "production"
        ? `wss://${window.location.host}`
        : (process.env.REACT_APP_WS_URL || "ws://localhost:8080");

    const ws = new WebSocket(wsUrl);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected successfully");
    };

    ws.onmessage = (event) => {
      try {
        console.log("RAW:", event.data);
        const message = JSON.parse(event.data);
        console.log("================================");
        console.log("TYPE:", message.type);
        console.log("MESSAGE:", message);
        console.log("================================");

        // const message = JSON.parse(event.data);

        console.log("PARSED:", JSON.stringify(message, null, 2));

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

            console.log("Stored names:", testResults);
            console.log("Incoming:", message.name);

            setTestResults(prev =>
              prev.map(t =>
                t.id === message.testFile
                  ? { ...t, status: "running" }
                  : t
              )
            );

            // Auto-close after 10 seconds
            setTimeout(() => {
              setNotification(null);
            }, 10000);
          }
        }

        if (message.type === 'TEST_COMPLETED') {
          setTestStatus(`${message.status === 'passed' ? '✅' : '❌'} ${message.name}: ${message.output}`);

          console.log("Message: ", message);

          setTestResults(prev =>
            prev.map(t =>
              t.id === message.testFile
                ? {
                  ...t,
                  status:
                    message.status === "passed"
                      ? "passed"
                      : "failed",
                  duration: message.duration || "-"
                }
                : t
            )
          );
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
      console.log(
        `🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`
      );

      // Don't reconnect if this was a manual refresh/unmount
      if (manualCloseRef.current) {
        console.log("⏹️ Manual WebSocket close - skipping auto reconnect");
        manualCloseRef.current = false;
        return;
      }

      setTimeout(() => {
        console.log("🔄 Attempting to reconnect WebSocket...");
        connectWebSocket();
      }, 3000);
    };
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        console.log("🛑 Closing WebSocket connection");

        manualCloseRef.current = true;

        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
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

  // FETCHING TEST LIST BASED ON SELECTED PRODUCT
  useEffect(() => {
    const fetchTests = async () => {
      try {
        if (selectedProduct !== "pdu") {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/${selectedProduct}?testLevel=${testLevel}`);
          const tests = await res.json();
          setFetchedTestList(tests);
          setSelectedTests(tests);
        }
        // Auto-select all tests when fetched
      } catch (err) {
        console.error('Error fetching tests:', err);
      }
    };

    if (selectedProduct) {
      fetchTests();
    }
  }, [selectedProduct, testLevel]);

  // IMONI TEST FUNCTION
  async function iMoni_test() {
    setAwaitingCommand(true); // Shows 'Running...' state
    setShowATSPanel(false);

    const initialResults = [];

    // Frontend tests
    initialResults.push({
      name: "Visual Test",
      status: "waiting",
      duration: "-"
    });

    initialResults.push({
      name: "Burn-In Test",
      status: "waiting",
      duration: "-"
    });

    // Backend tests
    selectedTests.forEach(test => {
      initialResults.push({
        id: test,
        name: test.replace(".srv", ""),
        status: "waiting",
        duration: "-"
      });
    });

    setTestResults(initialResults);

    if (testLevel === "green-pcb") {
      if (!basePcbSrNo.trim()) {
        swal.fire({
          icon: "warning",
          title: "Base PCB Serial Number Required",
          text: "Please enter Base PCB Serial Number before starting ATS"
        });
        setAwaitingCommand(false);
        return;
      }
    } else {
      if (!unitSerialNo.trim()) {
        swal.fire({
          icon: "warning",
          title: "Unit Serial Number Required",
          text: "Please enter Unit Serial Number before starting ATS"
        });
        setAwaitingCommand(false);
        setShowATSPanel(true);
        return;
      }
    }

    const frontendResults = []; // Stores Visual & Burn-in results
    console.log("Fetched Test List Length: ", fetchedTestList.length);
    console.log("Selected Tests Length: ", selectedTests.length);

    if (fetchedTestList.length === selectedTests.length) {

      // 1. Visual Test (frontend dialog)
      const v = await swal.fire({
        title: 'Visual Test',
        text: 'Is Visual inspection passed?',
        showCancelButton: true,
        confirmButtonText: 'Pass',
        cancelButtonText: 'Fail'
      });

      // const v = await confirmDialogBox({
      //   title: 'Visual Test',
      //   text: 'Is Visual inspection passed?',
      //   showCancelButton: true,
      //   confirmButtonText: 'Pass',

      const visualPassed = v.isConfirmed;

      setTestResults(prev =>
        prev.map(t =>
          t.name === "Visual Test"
            ? {
              ...t,
              status: visualPassed ? "passed" : "failed"
            }
            : t
        )
      );

      frontendResults.push({
        name: 'Visual Test',
        status: v.isConfirmed ? 'passed' : 'failed',
        passed: v.isConfirmed,
        output: v.isConfirmed ? 'Visual inspection passed successfully' : 'Visual inspection failed'
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
        passed: b.isConfirmed,
        output: b.isConfirmed ? 'Burn-In test passed successfully' : 'Burn-In test failed'
      });

      console.log("Frontend Results: ", frontendResults);
      // 3. Runs API '/tests/run-all/'
      try {
        // if()

        const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/run-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mac: selectedMac,
            skipFrontendTests: true,
            frontendResults,
            cpuSrNo: cpuSrNo.trim(),
            basePcbSrNo: basePcbSrNo.trim(),
            cameraSrNo: cameraSrNo.trim(),
            psuSrNo: psuSrNo.trim(),
            unitSerialNo: unitSerialNo.trim(),
            generateReport,
            testLevel
          })
        });
        const data = await resp.json();
        setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
      } catch (err) {
        setTestStatus(`Error: ${err.message}`);
      }
    } else {
      console.log("Selected Test code runs ...", selectedTests);


      try {
        const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mac: selectedMac,
            selectedProduct,
            selectedTests,
            unitSerialNo: unitSerialNo.trim(),
            cpuSrNo: cpuSrNo.trim(),
            basePcbSrNo: basePcbSrNo.trim(),
            cameraSrNo: cameraSrNo.trim(),
            psuSrNo: psuSrNo.trim(),
            generateReport,
            testLevel
          })
        });
        const data = await resp.json();
        setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
      } catch (err) {
        setTestStatus(`Error: ${err.message}`);
      }
    }
    setAwaitingCommand(false);
    setShowATSPanel(true);
  }

  // FAN TEST FUNCTION
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

  // PDU TEST FUNCTION
  async function pdu_test() {
    setPduTestStatus(true);

    const frontendPDUResults = [];
    let testCancelled = false;

    for (const step of PDU_STEPS) {
      const r = await swal.fire({
        title: `Step ${step.step}`,
        text: step.msg,
        imageUrl: step.image,
        imageWidth: 800,
        imageHeight: 300,
        width: '900px',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'PASS',
        denyButtonText: 'FAIL',
        cancelButtonText: '🛑 Cancel Test',
        allowOutsideClick: false,
        allowEscapeKey: false,
        cancelButton: true,
        didOpen: () => {
          const image = document.querySelector('.swal2-image');
          if (image) {
            image.style.width = '800px';
            image.style.height = '300px';
            image.style.objectFit = 'contain';
            image.style.maxWidth = '100%';
          }
        }
      });

      // 🛑 Cancel test completely
      if (r.isDismissed) {
        testCancelled = true;
        break;
      }

      frontendPDUResults.push({
        step: step.step,
        message: step.msg,
        image: step.image,
        passed: r.isConfirmed
      });
    }

    try {
      console.log("Calling /pdu-test API...");
      const resp = await fetch(`${process.env.REACT_APP_API_URL}/api/tests/pdu-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mac: selectedMac, frontendPDUResults,
          cancelled: testCancelled
        })
      });

      console.log("...API Called")
      const data = await resp.json();
      console.log("Data: ", data);
      setTestStatus(`Done: ${data.summary.passed} passed, ${data.summary.failed} failed`);
    } catch (err) {
      setTestStatus(`Error: ${err.message}`);
    }

    setPduTestStatus(false);
  };

  const refreshDashboard = () => {
    console.log("🔄 ===== RECONNECTING WEBSOCKET =====");

    if (wsRef.current) {
      manualCloseRef.current = true;

      console.log("🛑 Closing existing WebSocket...");

      wsRef.current.close(1000, "Manual dashboard refresh");
      wsRef.current = null;
    }

    // Clear current UI data, just like a fresh page load
    setLiveReading(null);
    setReadings([]);
    setSnapshots([]);

    // Reconnect after the old socket is fully closed
    setTimeout(() => {
      console.log("🔌 Creating new WebSocket connection...");
      manualCloseRef.current = false;
      connectWebSocket();
    }, 300);
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
      {/* <div className="logo-panel">

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
      </div> */}

      {/* TEST PANEL */}
      {/* <div className="test-controls-panel">
        <h2>🧪 ATS Test Controls</h2>
        <div className="test-buttons">

          <div className="test-select">
            <select value={selectedProduct} onChange={handleProductChange}>
              <option defaultChecked>Select</option>
              <option value="iMoni">iMoni Tests</option>
              <option value="fan">Fan Tests</option>
              <option value="pdu">PDU Tests</option>
            </select>
          </div> */}

      {/* {selectedProduct === "iMoni" && (
            <select
              value={testLevel}
              onChange={(e) => setTestLevel(e.target.value)}
            >
              <option value="full-controller">Full Controller</option>
              <option value="green-pcb">Green PCB / Card Level</option>
            </select>
          )} */}

      {/* {selectedProduct === "iMoni" ?
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
                disabled={fanTestStatus}
              >
                {fanTestStatus ? "Running Fan Test..." : "Run Fan Test"}
              </button> : selectedProduct === "pdu" ?
                <button
                  className="btn-test"
                  onClick={pdu_test}
                  disabled={pduTestStatus}
                >
                  {pduTestStatus ? "Running PDU Test..." : "Run PDU Test"}
                </button> :
                <h4>Select a product to run tests</h4>
          } */}


      {/* <div className="grid grid-cols-5 gap-3 mt-4">
            <input
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
              placeholder="Unit Serial Number"
              value={unitSerialNo}
              onChange={(e) => setUnitSerialNo(e.target.value)}
            />

            <input
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
              placeholder="CPU Sr. No."
              value={cpuSrNo}
              onChange={(e) => setCpuSrNo(e.target.value)}
            />

            <input
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
              placeholder="Base PCB Sr. No."
              value={basePcbSrNo}
              onChange={(e) => setBasePcbSrNo(e.target.value)}
            />

            <input
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
              placeholder="Camera Sr. No."
              value={cameraSrNo}
              onChange={(e) => setCameraSrNo(e.target.value)}
            />

            <input
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
              placeholder="PSU Sr. No."
              value={psuSrNo}
              onChange={(e) => setPsuSrNo(e.target.value)}
            />
          </div> */}

      {/* <div style={{ marginBottom: "15px" }}> */}
      {/* <input
              type="text"
              placeholder="Enter Unit Serial Number"
              value={unitSerialNo}
              onChange={(e) => setUnitSerialNo(e.target.value)}
              style={{
                marginRight: "10px",
                padding: "8px",
                width: "220px"
              }}
            /> */}

      {/* <input
              type="text"
              placeholder="Enter CPU Sr. No."
              value={cpuSrNo}
              onChange={(e) => setCpuSrNo(e.target.value)}
            />

            <input
              type="text"
              placeholder="Enter Base PCB Sr. No."
              value={basePcbSrNo}
              onChange={(e) => setBasePcbSrNo(e.target.value)}
            />

            <input
              type="text"
              placeholder="Enter Camera Sr. No."
              value={cameraSrNo}
              onChange={(e) => setCameraSrNo(e.target.value)}
            />

            <input
              type="text"
              placeholder="Enter PSU Sr. No."
              value={psuSrNo}
              onChange={(e) => setPsuSrNo(e.target.value)}
            /> */}


      {/* <input
              type="text"
              placeholder="Enter Controller ID"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
              style={{
                padding: "8px",
                width: "220px"
              }}
            /> */}
      {/* </div> */}



      {/* STOP TEST BUTTON */}
      {/* {(awaitingCommand || fanTestStatus || pduTestStatus) && (
            <button
              className="btn-test-stop"
              onClick={async () => {
                try {
                  await fetch(`${process.env.REACT_APP_API_URL}/api/tests/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  setTestStatus('🛑 Tests stopped by user');
                  setNotification({
                    title: 'Tests Stopped',
                    message: 'Testing process was stopped by user',
                    type: 'error'
                  });
                  // Set states to false AFTER the API call completes
                  setAwaitingCommand(false);
                  setFanTestStatus(false);
                  setPduTestStatus(false);
                } catch (err) {
                  console.error('Failed to stop tests:', err);
                  // Still reset states even on error
                  setAwaitingCommand(false);
                  setFanTestStatus(false);
                  setPduTestStatus(false);
                }
              }
              }
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
          )} */}

      {/* CANCEL FAN TEST BUTTON */}
      {/* {fanTestStatus && (
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
          )} */}

      {/* <button
            className="btn-test-secondary"
            onClick={runTestsStepByStep}
          >
            Run Step-by-Step
          </button> */}
      {/* </div> */}

      {/* TEST NOTIFICATION BANNER */}
      {/* {notification && (
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
        )} */}

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

      {/* {testProgress.length > 0 && (
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

        {!isTestRunning && fetchedTestList.length > 0 ? fetchedTestList.map((test) => (
          <label key={test} style={{ display: "block" }}>
            <input
              type="checkbox"
              value={test}
              checked={selectedTests.includes(test)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedTests([...selectedTests, test]);
                } else {
                  setSelectedTests(selectedTests.filter(t => t !== test));
                }
              }}
            />
            {test}
          </label>
        )) : <p>No Tests found</p>} */}


      {/* {pduTestStatus && (
          <img className="pdu-image" src="./pdu/ch1.png">
          </img>
        )} */}
      {/* </div> */}

      <div className="ats-panel">

        {/* HEADER */}
        <div className="ats-header">
          <h2>🧪 ATS Test Controls</h2>

          <button
            className="ats-toggle-btn"
            onClick={() => setShowATSPanel(!showATSPanel)}
          >
            {showATSPanel ? "Hide Details" : "Show Details"}
          </button>
        </div>

        {/* TEST STATUS - ONLY SHOW WHEN TESTS EXIST */}
        {testResults.length > 0 && (
          <div className="live-test-status">

            <div className="test-status-title">
              Test Status
            </div>

            <div className="test-status-row">
              {testResults.map((test, index) => (
                <div
                  key={index}
                  className={`test-status-name ${test.status}`}
                  title={`${test.name} - ${test.status}`}
                >
                  {test.status === "passed" && "✓ "}
                  {test.status === "failed" && "✕ "}
                  {test.status === "running" && "● "}
                  {test.status === "waiting" && "○ "}

                  {test.name}
                </div>
              ))}
            </div>

          </div>
        )}

        {showATSPanel && (
          <div className="ats-running-panel">

            {/* TOP CONTROLS */}
            <div className="ats-top-row">

              <select
                value={selectedProduct}
                onChange={handleProductChange}
                className="ats-select"
              >
                <option value="">Select Product</option>
                <option value="iMoni">iMoni Tests</option>
                <option value="fan">Fan Tests</option>
                <option value="pdu">PDU Tests</option>
              </select>

              {selectedProduct === "iMoni" && (
                <select
                  value={testLevel}
                  onChange={(e) => setTestLevel(e.target.value)}
                  className="ats-select"
                >
                  <option value="full-controller">Assembly</option>
                  <option value="green-pcb">Base PCB Level</option>
                </select>
              )}

              <label className="ats-checkbox compact">
                <input
                  type="checkbox"
                  checked={generateReport}
                  onChange={(e) => setGenerateReport(e.target.checked)}
                />
                Generate Report
              </label>

              <button
                className="ats-run-btn"
                onClick={iMoni_test}
                disabled={awaitingCommand}
              >
                {awaitingCommand ? "⏳ Running..." : "▶ Run ATS Tests"}
              </button>

            </div>

            {/* SERIAL NUMBERS */}
            {selectedProduct === "iMoni" && (
              <div className="ats-serial-row">

                {testLevel === "green-pcb" ? (
                  <input
                    className="ats-input"
                    placeholder="Base PCB Serial Number"
                    value={basePcbSrNo}
                    onChange={(e) => setBasePcbSrNo(e.target.value)}
                  />
                ) : (
                  <>
                    <input
                      className="ats-input"
                      placeholder="iMoni Ass. Serial"
                      value={unitSerialNo}
                      onChange={(e) => setUnitSerialNo(e.target.value)}
                    />

                    <input
                      className="ats-input"
                      placeholder="CPU Serial"
                      value={cpuSrNo}
                      onChange={(e) => setCpuSrNo(e.target.value)}
                    />

                    <input
                      className="ats-input"
                      placeholder="Base PCB Serial"
                      value={basePcbSrNo}
                      onChange={(e) => setBasePcbSrNo(e.target.value)}
                    />

                    <input
                      className="ats-input"
                      placeholder="Camera Serial"
                      value={cameraSrNo}
                      onChange={(e) => setCameraSrNo(e.target.value)}
                    />

                    <input
                      className="ats-input"
                      placeholder="PSU Serial"
                      value={psuSrNo}
                      onChange={(e) => setPsuSrNo(e.target.value)}
                    />
                  </>
                )}

              </div>
            )}

          </div>
        )}

      </div>

      {/* STOP TEST BUTTON */}
      {(awaitingCommand || fanTestStatus || pduTestStatus) && (
        <button
          className="btn-test-stop"
          onClick={async () => {
            try {
              await fetch(`${process.env.REACT_APP_API_URL}/api/tests/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              setTestStatus('🛑 Tests stopped by user');
              setNotification({
                title: 'Tests Stopped',
                message: 'Testing process was stopped by user',
                type: 'error'
              });
              // Set states to false AFTER the API call completes
              setAwaitingCommand(false);
              setFanTestStatus(false);
              setPduTestStatus(false);
            } catch (err) {
              console.error('Failed to stop tests:', err);
              // Still reset states even on error
              setAwaitingCommand(false);
              setFanTestStatus(false);
              setPduTestStatus(false);
            }
          }
          }
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
      {/* </div> */}

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

      {!isTestRunning && fetchedTestList.length > 0 ? (
        <div className="test-list-panel">

          <div className="test-list-header">
            <h4>Selected Tests ({selectedTests.length})</h4>

            <div className="test-actions">
              <button onClick={() => setSelectedTests(fetchedTestList)}>
                Select All
              </button>

              <button onClick={() => setSelectedTests([])}>
                Clear
              </button>
            </div>
          </div>

          <div className="test-list">

            {fetchedTestList.map((test) => (
              <label key={test} className="test-item">

                <input
                  type="checkbox"
                  checked={selectedTests.includes(test)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTests([...selectedTests, test]);
                    } else {
                      setSelectedTests(
                        selectedTests.filter(t => t !== test)
                      );
                    }
                  }}
                />

                <span>{test.replace(".srv", "")}</span>

              </label>
            ))}

          </div>

        </div>
      ) : (
        <p>No Tests found</p>
      )}

      {pduTestStatus && (
        <img className="pdu-image" src="./pdu/ch1.png">
        </img>
      )}
      {/* </div>

      {/* DASHBOARD */}
      <div className="dashboard" >
        <div className="panel">
          {/* <h2 className="selected-heading"> */}
          {/* 📟 Selected Rack: {selectedMac && <span> {selectedDevice}</span>} */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px"
            }}
          >
            <h2 className="selected-heading">
              📟 Selected Rack:
              {selectedMac && <span> {selectedDevice}</span>}
            </h2>

            <button
              onClick={refreshDashboard}
              disabled={refreshing}
              className="refresh-btn"
            >
              {refreshing ? "Refreshing..." : "🔄 Refresh Dashboard"}
            </button>
          </div>
          {/* </h2> */}
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
                    value={latestReading.hupsDVC}
                    max={12}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  <Gauge
                    label="Battery %"
                    value={(latestReading.hupsBatVolt * 1.5).toFixed(2)}
                    max={120}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  <Gauge
                    label="Battery(Hours)"
                    value={(latestReading.hupsBatVolt).toFixed(2)}
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
              <span>SysId: {selectedMac.slice(8)}</span>
              {"status" && (

                <div className="status-layout">

                  {/* LEFT */}
                  <div className="status-left">

                    {/* Fan Running code */}
                    <div className="status-card">
                      <h4>Fan Running Status</h4>

                      <div className="status-grid">
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
                    </div>

                    <div className="status-card">
                      {/* Command buttons */}
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

                    </div>

                  </div>


                  {/* RIGHT */}
                  <div className="status-right">

                    <div className="status-card">
                      <h4>Alarms</h4>

                      <div className="status-grid">
                        {/* Alarm map */}
                        {alarmKeys.map((alarm, i) => (

                          <div key={i} className="status-box">
                            <div
                              className={`alarm-led ${latestReading[alarm.key] === 87 ? "wait" : latestReading[alarm.key] ? "active" : ""
                                }`}
                            />
                            <div className="status-title">{alarm.Name}</div>
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
                    </div>

                    <div className="status-card">
                      <h4>HUPS</h4>

                      <div className="status-grid">
                        {/* HUPS map */}
                        {hupsKeys.map((hups, i) => (
                          <div key={i} className="status-box">
                            <div
                              className={`alarm-led ${latestReading[hups.key] ? "" : "active"
                                }`}
                            />
                            <div className="status-title">
                              {hups.Name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>

                </div>

                // <div className="alarm-group">
                //   <div className="fan-status">
                //     <div className="fan-status-line">
                //     </div>
                //     <div className="alarm-line">
                //       <h4 style={{ marginRight: 10 }}>Alarms</h4>

                //       <h4 style={{ marginLeft: 35, marginRight: 10 }}>HUPS</h4>
                //     </div>
                //     <div className="alarm-line">
                //       <h4>HUPS</h4>
                //       {/* {["O.Load", "MPT", "MOSFET"].map((key, i) => (
                //         <div key={i} className="alarm-indicator">
                //           <div
                //             className={`alarm-led ${latestReading[key] === "OPEN" ? "active" : ""
                //               }`}
                //           />
                //           <div className="alarm-label">
                //             {key.replace("Status", "")}
                //           </div>
                //         </div>
                //       ))} */}
                //     </div>
                //     {status && <p>{status}</p>}
                //   </div>
                // </div>
              )}

              {/* ============================== TAB : SNAPSHOTS ============================== */}
              <button
                className="tabs-button"
                onClick={() => setActiveTab("snapshots")}
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
                          `${process.env.REACT_APP_API_URL}/api/snapshots/${img}?mac=${selectedMac}` ===
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
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${img}?mac=${selectedMac}` ===
                              selectedImage
                          );
                          const prevIndex =
                            (currentIndex - 1 + snapshots.length) %
                            snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[prevIndex]}?mac=${selectedMac}`
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
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${img}?mac=${selectedMac}` ===
                              selectedImage
                          );
                          const nextIndex =
                            (currentIndex + 1) % snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[nextIndex]}?mac=${selectedMac}`
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

              {"snapshots" && (
                <div className="camera-tab">
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
