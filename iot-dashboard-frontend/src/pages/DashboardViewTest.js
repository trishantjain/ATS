import React, { useEffect, useState, useRef } from "react";
import "../App.css";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import "leaflet/dist/leaflet.css";
import swal from "sweetalert2";
import PDU_STEPS from "./pdu_steps";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  Eye,
  History,
  FileSpreadsheet,
  X,
  ChevronLeft,
  ChevronRight,
  SelectContent,
  SelectTrigger,
  SelectValue,
  Select,
  SelectItem,
} from "@/components/ui/select";

import { FileCheck2, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function DashboardViewTest() {
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
  const [notifications, setNotifications] = useState({});
  const [liveReading, setLiveReading] = useState(null); // Separate state for immediate UI updates

  const [showATSPanel, setShowATSPanel] = useState(true);

  // const notificationTimeoutRef = useRef(null);  // Track notification auto-dismiss timeout
  const notificationTimeoutRefs = useRef({}); // Track notification auto-dismiss timeout

  const [selectedProduct, setSelectedProduct] = useState("");

  const [testLevel, setTestLevel] = useState("full-controller");
  const [unitSerialNo, setUnitSerialNo] = useState("");
  // const [cpuSrNo, setCpuSrNo] = useState("");
  const [cpu, setCpu] = useState("");
  const [base, setBase] = useState("");
  const [camera, setCamera] = useState("");
  const [psu, setPsu] = useState("");
  const [pythonCpu, setPythonCpu] = useState("");
  const [pythonIp, setPythonIp] = useState("");

  // Python Programming Status
  const [pythonStatus, setPythonStatus] = useState(null);
  const [pythonLogs, setPythonLogs] = useState([]);
  const [pythonRunning, setPythonRunning] = useState(false);

  // States for Test Lists
  const [selectedTests, setSelectedTests] = useState([]); // Stores selected tests
  const [fetchedTestList, setFetchedTestList] = useState([]); // Stores Fetched tests from backend

  const [awaitingCommand, setAwaitingCommand] = useState(false); // Waiting for ATS Execution
  const [fanTestStatus, setFanTestStatus] = useState(false); // Waiting for Fan Test Execution
  const [pduTestStatus, setPduTestStatus] = useState(false); // Waiting for PDU Test Execution

  const [testResults, setTestResults] = useState([]);

  // All-Passed report (manual). runId === null -> no completed run to report on.
  // status: idle | generating | success | error
  const [allPassed, setAllPassed] = useState({ runId: null, status: "idle" });
  const allPassedInFlightRef = useRef(new Set()); // runIds being generated (blocks double clicks)

  const [refreshing, setRefreshing] = useState(false);

  const [pendingTestedRun, setPendingTestedRun] = useState(null);
  const [savingTestedController, setSavingTestedController] = useState(false);

  const isTestRunning = awaitingCommand || fanTestStatus || pduTestStatus;

  const TEST_COLORS = {
    "Fan Test": "#3B82F6", // Blue
    "Limit Switch Test": "#F59E0B", // Orange

    // Add exact names from your .srv files later
    "Leakage Test": "#06B6D4", // Cyan
    "Logging Test": "#8B5CF6", // Purple

    "Fan Fail Test": "#EC4899", // Pink
    "Fire Alarm Test": "#EF4444", // Red

    "Humidity Test": "#22C55E", // Green
    "Outside Temperature Test": "#EAB308", // Yellow

    "Camera Test": "#14B8A6", // Teal

    "Lock EMS Test": "#F472B6", // Light Pink
    "Lock Rack Test": "#6366F1", // Indigo
  };

  const getTestColor = (message) => {
    // First try exact test name from .srv
    if (message.name && TEST_COLORS[message.name]) {
      return TEST_COLORS[message.name];
    }

    // Fallback based on test file
    const testFile = message.testFile || "";

    if (testFile.includes("Fans")) {
      return TEST_COLORS["Fan Test"];
    }

    if (testFile.includes("Door")) {
      return TEST_COLORS["Limit Switch Test"];
    }

    if (testFile.includes("Leakage")) {
      return TEST_COLORS["Leakage Test"];
    }

    if (testFile.includes("Logging")) {
      return TEST_COLORS["Logging Test"];
    }

    if (testFile.includes("Fan_Fail") || testFile.includes("Fan Fail")) {
      return TEST_COLORS["Fan Fail Test"];
    }

    if (testFile.includes("Fire")) {
      return TEST_COLORS["Fire Alarm Test"];
    }

    if (testFile.includes("Humidity")) {
      return TEST_COLORS["Humidity Test"];
    }

    if (testFile.includes("Outside") || testFile.includes("Temperature")) {
      return TEST_COLORS["Outside Temperature Test"];
    }

    if (testFile.includes("Camera")) {
      return TEST_COLORS["Camera Test"];
    }

    return "#64748B";
  };

  const getTestBackground = (color) => {
    const backgrounds = {
      "#3B82F6": "#0F2342", // Fan - dark blue
      "#F59E0B": "#3A2A0A", // Door - dark orange
      "#06B6D4": "#0A3038", // Leakage - dark cyan
      "#8B5CF6": "#21163D", // Logging - dark purple
      "#EC4899": "#12050c", // Fan Fail - dark pink
      "#EF4444": "#3A1212", // Fire - dark red
      "#22C55E": "#102F1B", // Humidity - dark green
      "#EAB308": "#352D08", // Outside temp - dark yellow
      "#14B8A6": "#0B302B", // Camera - dark teal
      "#F472B6": "#3A1729", // Lock EMS
      "#6366F1": "#171B3D", // Lock Rack
    };

    return backgrounds[color] || "#1A1F26";
  };

  //Map and marker refs
  // const mapRef = useRef(null);
  const wsRef = useRef(null);

  const pythonLogsRef = useRef(null);

  const manualCloseRef = useRef(false);
  const navigate = useNavigate();
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
  const latestReading =
    liveReading?.mac === selectedMac
      ? liveReading
      : readings.find((r) => r.mac === selectedMac);

  // UseEffect for fetching Data
  // useEffect(() => {
  //   console.log("🚨Starting data fetch interval (5s)🚨");

  //   return () => {
  //     console.log("🛑Clearing data fetch interval");
  //   };
  // }, []);

  useEffect(() => {
    if (pythonLogsRef.current) {
      pythonLogsRef.current.scrollTo({
        top: pythonLogsRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [pythonLogs]);

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
        command,
      );
    } else {
      sendToLog(`LOAD Clicked ${isActive ? "off" : "on "}`, "", command);
    }
    sendCommand(command);

    if (level === 5) {
      setActiveFanBtns((prev) =>
        prev.includes(5) ? prev.filter((l) => l !== 5) : [...prev, 5],
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

    // if (password) {
    // if (password === "admin123") {
    sendCommand(`%L00O${getFormattedDateTime()}$`);
    sendToLog("Password Open Button Clicked");
    setStatus("Lock opened successfully!");
    // } else {
    // setStatus("Wrong password!");
    // }
    // }
  };

  const handleResetLock = () => {
    // const pwd = window.prompt("Enter admin password to reset lock:");
    // if (pwd === "admin123") {
    const newLock = window.prompt("Enter new lock value:");

    if (/^\d{9}$/.test(newLock)) {
      if (newLock && newLock.trim() !== "") {
        sendToLog(`Lock Reset ${newLock} clicked`);
        sendCommand(`%L00R${newLock}${getFormattedDateTime()}$$`);
        setStatus(`New password ${newLock} `);
      } else {
        setStatus("New lock value cannot be empty!");
      }
    } else {
      alert("Enter Numeric Password of 9 Digits");
    }
    // } else {
    //   setStatus("Wrong password for resetting lock!");
    // }
  };

  // Function
  const openPassword = () => {
    // const pwd = window.prompt("Enter admin password to Open Lock:");
    // const today = new Date();
    // if (pwd === "admin123")
    sendCommand(`%L00P${getFormattedDateTime()}$`);
    // else setStatus("Wrong password for opening lock!");
  };

  const testMode = () => {
    // sendCommand(`%T003${getFormattedDateTime()}$`);
    console.log(`%T003${getFormattedDateTime()}$`);
    alert("command sent");
  };

  const runPython = async () => {
    if (!pythonCpu.trim() || !pythonIp.trim()) {
      swal.fire({
        icon: "warning",
        title: "Missing Input",
        text: "Please enter CPU Serial Number and IP.",
      });
      return;
    }

    // Clear previous Python output
    setPythonLogs([]);
    setPythonStatus({
      status: "started",
      stage: "initializing",
      message: `Starting CPU Programming | CPU: ${pythonCpu.trim()} | IP: ${pythonIp.trim()}`,
    });
    setPythonRunning(true);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/run-python`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cpu: pythonCpu.trim(),
            ip: pythonIp.trim(),
          }),
        },
      );

      const data = await response.json();

      if (response.ok && data.success) {
        console.log("✅ Python completed successfully");

        // Add final output to log
        if (data.output) {
          setPythonLogs((prev) => [
            ...prev,
            ...data.output
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean),
          ]);
        }

        setPythonStatus({
          status: "completed",
          stage: "completed",
          message: "CPU Programming completed successfully.",
        });

        setPythonRunning(false);

        // Give user time to see success message
        setTimeout(() => {
          console.log("🔄 Refreshing browser after Python success...");
          window.location.reload();
        }, 1500);

        return;
      }

      setPythonStatus({
        status: "failed",
        stage: "error",
        message: data.error || "CPU Programming failed.",
      });

      setPythonRunning(false);

      if (data.output) {
        setPythonLogs((prev) => [
          ...prev,
          ...data.output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        ]);
      }

      console.log("Python output:", data.output);
    } catch (error) {
      console.error("Error:", error);

      setPythonStatus({
        status: "failed",
        stage: "error",
        message: `Unable to run Python: ${error.message}`,
      });

      setPythonRunning(false);
    }
  };

  const fetchSnapshots = async (selectedMac) => {
    try {
      // setActiveTab("snapshots");
      if (selectedMac) {
        let response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/snapshots/?mac=${selectedMac}`,
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

  // CAMERA TEST DIALOG BOX
  const showCameraDialog = ({ imagePath, message, onConfirm, onCancel }) => {
    swal
      .fire({
        title: "📷 Camera Test",
        html: `
      <div style="text-align: center;">
        <p style="margin-bottom: 15px; font-size: 16px;">${message || "Camera image captured. Please verify."}</p>
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
        confirmButtonText: "✅ Pass",
        cancelButtonText: "❌ Fail",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#dc3545",
        background: "#1a1a2e",
        color: "#fff",
        width: "550px",
        allowOutsideClick: false,
        allowEscapeKey: false,
      })
      .then((result) => {
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
        : process.env.REACT_APP_WS_URL || "ws://localhost:8080";

    const ws = new WebSocket(wsUrl);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected successfully");
    };

    ws.onmessage = (event) => {
      try {
        // console.log("RAW:", event.data);
        const message = JSON.parse(event.data);
        console.log("================================");
        console.log("TYPE:", message.type);
        // console.log("MESSAGE:", message);
        console.log("================================");

        // const message = JSON.parse(event.data);

        // ==========================================
        // CURRENT DEVICES STATUS
        // ==========================================
        if (message.type === "DEVICES_STATUS") {
          const connectedDevices = (message.data?.connectedDevices || []).map(
            (mac) => String(mac).toLowerCase(),
          );

          console.log("📋 CURRENT CONNECTED DEVICES:", connectedDevices);

          setSelectedMac((prev) => {
            const currentMac = String(prev || "").toLowerCase();

            // Keep current selection if it is still connected
            if (currentMac && connectedDevices.includes(currentMac)) {
              return prev;
            }

            // Current selection is no longer connected.
            // Select the currently connected controller.
            const nextMac = connectedDevices[0] || "";

            console.log(
              "🔄 Re-syncing selected device:",
              currentMac,
              "→",
              nextMac,
            );

            if (nextMac) {
              setSelectedDevice(nextMac);
            } else {
              setSelectedDevice("");
              setLiveReading(null);
              setReadings([]);
            }

            return nextMac;
          });

          return;
        }

        // ==========================================
        // DEVICE DISCONNECTED
        // ==========================================
        if (message.type === "DEVICE_DISCONNECTED") {
          const disconnectedMac = String(message.mac).trim().toLowerCase();

          console.log("🔴 DEVICE DISCONNECTED:", disconnectedMac);

          setSelectedMac((prev) => {
            const currentMac = String(prev || "")
              .trim()
              .toLowerCase();

            if (currentMac === disconnectedMac) {
              return "";
            }

            return prev;
          });

          setSelectedDevice((prev) => {
            if (
              String(selectedMac || "")
                .trim()
                .toLowerCase() === disconnectedMac
            ) {
              return "";
            }
            return prev;
          });

          setLiveReading((prev) => {
            if (
              prev &&
              String(prev.mac || "")
                .trim()
                .toLowerCase() === disconnectedMac
            ) {
              return null;
            }

            return prev;
          });

          setReadings((prev) =>
            prev.filter(
              (reading) =>
                String(reading.mac || "")
                  .trim()
                  .toLowerCase() !== disconnectedMac,
            ),
          );

          return;
        }

        // ==========================================
        // DEVICE CONNECTED
        // ==========================================
        if (message.type === "DEVICE_CONNECTED") {
          const connectedMac = String(message.mac).toLowerCase();

          console.log("🟢 DEVICE CONNECTED:", connectedMac);

          setSelectedMac((prev) => {
            const currentMac = String(prev || "").toLowerCase();

            if (!currentMac) {
              console.log(
                "🎯 Automatically selecting newly connected device:",
                connectedMac,
              );

              setSelectedDevice(connectedMac);
              setLiveReading(null);
              setReadings([]);

              return connectedMac;
            }

            return prev;
          });

          return;
        }

        // ==========================================
        // PYTHON PROGRAMMING STATUS
        // ==========================================
        if (message.type === "PYTHON_STATUS") {
          console.log("🐍 PYTHON STATUS:", message);

          setPythonStatus({
            status: message.status,
            stage: message.stage,
            message: message.message,
          });

          // Add live output to Python log
          if (message.message) {
            setPythonLogs((prev) => {
              const newLog = message.message;

              // Prevent duplicate consecutive messages
              if (prev.length > 0 && prev[prev.length - 1] === newLog) {
                return prev;
              }

              return [...prev, newLog];
            });
          }

          // Python started/running
          if (
            message.status === "started" ||
            message.status === "running" ||
            message.status === "warning"
          ) {
            setPythonRunning(true);
          }

          // Python completed
          if (message.status === "completed") {
            setPythonRunning(false);
          }

          // Python failed
          if (message.status === "failed") {
            setPythonRunning(false);
          }

          // Important:
          // Don't let Python messages go through the ATS handlers below.
          return;
        }

        // console.log("PARSED:", JSON.stringify(message, null, 2));

        // Getting New Reading from Socket
        if (message.type === "NEW_READING") {
          const newReading = message.data;
          const newMac = String(newReading.mac).toLowerCase();

          console.log("📡 NEW READING:", newMac);

          // Keep latest reading for this device
          setReadings((prev) => {
            const filtered = prev.filter(
              (r) => String(r.mac).toLowerCase() !== newMac,
            );

            return [...filtered, newReading].slice(-400);
          });

          setSelectedMac((prev) => {
            const currentMac = String(prev || "").toLowerCase();

            // No device selected -> select the device that sent the reading
            if (!currentMac) {
              console.log("🎯 Selecting device from NEW_READING:", newMac);

              setSelectedDevice(newMac);
              setLiveReading(newReading);

              return newMac;
            }

            // Selected device is the one sending the reading
            if (currentMac === newMac) {
              setLiveReading(newReading);
            }

            return prev;
          });

          return;
        }

        if (message.type === "TEST_STARTED") {
          const testId = message.testFile || message.name;

          setTestStatus(
            `🏁 ${message.pre || message.message || "Test started"}`,
          );

          setTestResults((prev) =>
            prev.map((t) =>
              t.id === message.testFile
                ? {
                  ...t,
                  status: "running",
                }
                : t,
            ),
          );

          if (
            message.pre ||
            (message.message && message.message !== "No message")
          ) {
            setNotifications((prev) => ({
              ...prev,
              [testId]: {
                title: `Test: ${message.name}`,
                pre: message.pre || "",
                message: message.message || "",
                type: "info",
                testColor: getTestColor(message),
              },
            }));

            // Give this test its own timeout
            if (notificationTimeoutRefs.current[testId]) {
              clearTimeout(notificationTimeoutRefs.current[testId]);
            }

            notificationTimeoutRefs.current[testId] = setTimeout(() => {
              setNotifications((prev) => {
                const updated = { ...prev };
                delete updated[testId];
                return updated;
              });

              delete notificationTimeoutRefs.current[testId];
            }, 10000);
          }
        }

        if (message.type === "TEST_COMPLETED") {
          setTestStatus(
            `${message.status === "passed" ? "✅" : "❌"} ${message.name}: ${message.output}`,
          );

          console.log("Message: ", message);

          setTestResults((prev) =>
            prev.map((t) =>
              t.id === message.testFile
                ? {
                  ...t,
                  status: message.status === "passed" ? "passed" : "failed",
                  duration: message.duration || "-",
                }
                : t,
            ),
          );
        }

        if (message.type === "STEP_STARTED") {
          const testId = message.testFile || message.name;

          const stepMsg =
            message.message && message.message !== "No message"
              ? message.message
              : `Step ${message.stepNumber}/${message.totalSteps}`;

          setTestStatus(`🔄 ${message.name} - ${stepMsg}`);

          const currentWaitTime = message.waitTime || 20;

          setNotifications((prev) => ({
            ...prev,
            [testId]: {
              title: `${message.name} - Step ${message.stepNumber}/${message.totalSteps}`,
              message: stepMsg,
              type: "info",
              waitTime: currentWaitTime,
              testColor: getTestColor(message),
            },
          }));

          // Clear only THIS test's previous timeout
          if (notificationTimeoutRefs.current[testId]) {
            clearTimeout(notificationTimeoutRefs.current[testId]);
          }

          notificationTimeoutRefs.current[testId] = setTimeout(() => {
            setNotifications((prev) => {
              const updated = { ...prev };
              delete updated[testId];
              return updated;
            });

            delete notificationTimeoutRefs.current[testId];
          }, currentWaitTime * 1000);
        }

        if (message.type === "STEP_COMPLETED") {
          const testId = message.testFile || message.name;

          const isPassed = message.status === "passed";
          const stepResult = isPassed ? "✅" : "❌";

          setTestStatus(
            `${stepResult} ${message.name} - Step ${message.stepNumber}/${message.totalSteps} ${isPassed ? "PASSED" : "FAILED"}`,
          );

          // Clear only this test's previous timeout
          if (notificationTimeoutRefs.current[testId]) {
            clearTimeout(notificationTimeoutRefs.current[testId]);
          }

          setNotifications((prev) => ({
            ...prev,
            [testId]: {
              title: `${message.name} - Step ${message.stepNumber}/${message.totalSteps}`,
              message: `${stepResult} ${message.message || (isPassed ? "Step passed" : "Step failed")
                }`,
              type: isPassed ? "success" : "error",
              testColor: getTestColor(message),
            },
          }));

          // Auto-dismiss only THIS test's notification
          notificationTimeoutRefs.current[testId] = setTimeout(() => {
            setNotifications((prev) => {
              const updated = { ...prev };
              delete updated[testId];
              return updated;
            });

            delete notificationTimeoutRefs.current[testId];
          }, 3000);
        }

        if (message.type === "CAMERA_IMAGE_CAPTURED") {
          console.log("📷 Camera image captured:", message);

          swal
            .fire({
              title: "📷 Camera Test",
              html: `
      <div style="text-align: center;">
        <p style="margin-bottom: 15px; font-size: 16px;">${message.message || "Camera image captured. Please verify."}</p>
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
              confirmButtonText: "✅ Pass",
              cancelButtonText: "❌ Fail",
              confirmButtonColor: "#28a745",
              cancelButtonColor: "#dc3546ff",
              background: "#1a1a2e",
              color: "#fff",
              width: "550px",
              allowOutsideClick: false,
              allowEscapeKey: false,
            })
            .then((result) => {
              // Send the user's response back to the WebSocket
              if (
                wsRef.current &&
                wsRef.current.readyState === WebSocket.OPEN
              ) {
                wsRef.current.send(
                  JSON.stringify({
                    type: "DIALOG_RESPONSE",
                    confirmed: result.isConfirmed, // true for Pass, false for Fail
                  }),
                );
                console.log(
                  `📤 Sent camera dialog response: ${result.isConfirmed ? "PASS" : "FAIL"}`,
                );
              }
            });
        }
      } catch (err) {
        console.error("❌ WebSocket message parse error:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket connection error:", error);
    };

    ws.onclose = (event) => {
      console.log(
        `🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`,
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

  const confirmDialogBox = async ({
    title,
    text,
    cancelBtn,
    confirmBtn,
    cancelText,
  }) => {
    return await swal.fire({
      title: title,
      text: text,
      showCancelButton: cancelBtn,
      confirmButtonText: confirmBtn,
      cancelButtonText: cancelText,
    });
  };

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
  };

  // FETCHING TEST LIST BASED ON SELECTED PRODUCT
  useEffect(() => {
    const fetchTests = async () => {
      try {
        if (selectedProduct !== "pdu") {
          const res = await fetch(
            `${process.env.REACT_APP_API_URL}/api/tests/${selectedProduct}?testLevel=${testLevel}`,
          );
          const tests = await res.json();
          setFetchedTestList(tests);
          setSelectedTests(tests);
        }
        // Auto-select all tests when fetched
      } catch (err) {
        console.error("Error fetching tests:", err);
      }
    };

    if (selectedProduct) {
      fetchTests();
    }
  }, [selectedProduct, testLevel]);

  // Button is usable (and highlighted) only for a completed run, not while generating/done/testing
  const allPassedReady =
    Boolean(allPassed.runId) &&
    (allPassed.status === "idle" || allPassed.status === "error") &&
    !isTestRunning;

  // Enables the All-Passed button for the run the backend just reported
  const markRunCompleted = (data) => {
    if (data?.runId && data.allPassedEligible) {
      setAllPassed({ runId: data.runId, status: "idle" });
    }
  };

  // GENERATE ALL-PASSED REPORT (only on user click, for the latest completed run)
  async function generateAllPassedReport() {
    const runId = allPassed.runId;
    if (!runId || !allPassedReady) return;
    if (allPassedInFlightRef.current.has(runId)) return; // double click before re-render

    allPassedInFlightRef.current.add(runId);
    // Only update UI state if this run is still the current one
    const updateIfCurrent = (status) =>
      setAllPassed((prev) =>
        prev.runId === runId ? { ...prev, status } : prev,
      );

    updateIfCurrent("generating");
    setNotifications((prev) => {
      const updated = { ...prev };
      delete updated.allPassed;
      return updated;
    });

    try {
      const resp = await fetch(
        `${process.env.REACT_APP_API_URL}/api/tests/generate-all-passed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `Request failed (${resp.status})`);
      }
      updateIfCurrent("success");
    } catch (err) {
      updateIfCurrent("error");
      setNotifications((prev) => ({
        ...prev,
        allPassed: {
          title: "All-Passed Report Failed",
          message: `${err.message}. Click the button to retry.`,
          type: "error",
          testColor: "#EF4444",
        },
      }));
    } finally {
      allPassedInFlightRef.current.delete(runId);
    }
  }

  // function escapeRegex(value) {
  //   return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // }

  async function checkTestedControllerDuplicate() {
    const payload = {
      cpu: String(cpu || "").trim(),
      base: String(base || "").trim(),
      camera: String(camera || "").trim(),
      psu: String(psu || "").trim(),
    };

    const identifiers = Object.values(payload).filter(Boolean);

    if (identifiers.length === 0) {
      throw new Error(
        "Enter at least one CPU, Base, Camera, or PSU serial number.",
      );
    }

    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/api/tested-controllers/check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error || `Duplicate check failed (${response.status})`,
      );
    }

    return {
      ...result,
      matches: result.matches || [],
      matchingFields: result.matchingFields || [],
      entered: payload,
    };
  }

  async function showDuplicateWarning(duplicateResult) {
    const { matches = [], matchingFields = [], entered = {} } =
      duplicateResult;

    const fieldMap = {
      cpu: ["cpu", "cpuSr"],
      base: ["base", "basePcbSr"],
      camera: ["camera", "cameraSr"],
      psu: ["psu", "psuSrNo"],
    };

    const labels = {
      cpu: "CPU",
      base: "Base",
      camera: "Camera",
      psu: "PSU",
    };

    const escapeHtml = (value) =>
      String(value ?? "-").replace(/[&<>"']/g, (char) => {
        const entities = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };
        return entities[char];
      });

    const getValue = (record, fields) => {
      for (const field of fields) {
        if (
          record[field] !== undefined &&
          record[field] !== null &&
          record[field] !== ""
        ) {
          return record[field];
        }
      }
      return null;
    };

    const getDuplicates = (record) => {
      const duplicates = [];

      for (const [field, dbFields] of Object.entries(fieldMap)) {
        const enteredValue = String(entered[field] ?? "").trim();
        if (!enteredValue) continue;

        const recordValue = getValue(record, dbFields);

        if (
          recordValue !== null &&
          String(recordValue).trim().toLowerCase() ===
          enteredValue.toLowerCase()
        ) {
          duplicates.push({
            field,
            label: labels[field],
            value: recordValue,
          });
        }
      }

      return duplicates;
    };

    const columns = [
      { label: "Assembly No.", key: "assemblySrNo" },
      { label: "Controller IP", key: "deviceIP" },
      { label: "CPU", key: "cpuSr", aliases: ["cpu"] },
      { label: "Base", key: "basePcbSr", aliases: ["base"] },
      { label: "PSU", key: "psuSrNo", aliases: ["psu"] },
      { label: "Camera", key: "cameraSr", aliases: ["camera"] },
      { label: "Report No.", key: "reportNo" },
      { label: "S. No.", key: "sNo" },
      { label: "Status", key: "status" },
      { label: "Tested By", key: "testedBy" },
      { label: "Tested At", key: "testedAt" },
    ];

    const getColumnValue = (record, column) => {
      return getValue(
        record,
        [column.key, ...(column.aliases || [])]
      );
    };

    const recordRows = matches.map((record, index) => {
      const duplicates = getDuplicates(record);
      const duplicateFields = new Set(
        duplicates.map((item) => item.field)
      );

      const duplicateBadge = duplicates.length
        ? duplicates
          .map(
            (item) => `
              <span style="
                display:inline-block;
                margin:2px 4px 2px 0;
                padding:3px 7px;
                border-radius:4px;
                background:#7f1d1d;
                color:#fecaca;
                font-size:11px;
                font-weight:600;
                white-space:nowrap;
              ">
                ${escapeHtml(item.label)}: ${escapeHtml(item.value)}
              </span>
            `
          )
          .join("")
        : `<span style="color:#fbbf24;font-size:11px;">
           Matching field details unavailable
         </span>`;

      const cells = columns
        .map((column) => {
          const value = getColumnValue(record, column);
          const displayValue =
            value === null || value === undefined || value === ""
              ? "-"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);

          const isDuplicate = duplicates.some((item) =>
            (fieldMap[item.field] || []).includes(column.key) ||
            (column.aliases || []).some((alias) =>
              (fieldMap[item.field] || []).includes(alias)
            )
          );

          return `
          <td style="
            padding:9px 10px;
            border-bottom:1px solid #475569;
            background:${isDuplicate ? "#7f1d1d" : "transparent"};
            color:${isDuplicate ? "#fff" : "#e2e8f0"};
            font-weight:${isDuplicate ? "700" : "400"};
            white-space:nowrap;
          ">
            ${escapeHtml(displayValue)}
            ${isDuplicate
              ? `<div style="
                    margin-top:3px;
                    color:#fecaca;
                    font-size:10px;
                    font-weight:600;
                  ">DUPLICATE</div>`
              : ""
            }
          </td>
        `;
        })
        .join("");

      return `
      <div style="
        border:1px solid #475569;
        border-radius:8px;
        margin-bottom:10px;
        padding:10px;
        background:#1e293b;
        text-align:left;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          margin-bottom:7px;
        ">
          <strong style="font-size:13px;color:#f8fafc;">
            Existing Record ${index + 1}
          </strong>
          <span style="
            padding:3px 7px;
            border-radius:5px;
            background:#7f1d1d;
            color:#fecaca;
            font-size:11px;
          ">
            ${duplicates.length} duplicate field(s)
          </span>
        </div>

        <div style="
          display:flex;
          flex-wrap:wrap;
          gap:3px;
          margin-bottom:8px;
        ">
          ${duplicateBadge}
        </div>

        <div style="
          width:100%;
          overflow-x:auto;
          border:1px solid #475569;
          border-radius:6px;
        ">
          <table style="
            width:100%;
            min-width:950px;
            border-collapse:collapse;
            font-size:11px;
            text-align:left;
          ">
            <thead>
              <tr>
                ${columns
          .map(
            (column) => `
                      <th style="
                        padding:9px 10px;
                        background:#0f172a;
                        color:#94a3b8;
                        font-size:11px;
                        font-weight:600;
                        white-space:nowrap;
                        border-bottom:1px solid #475569;
                      ">
                        ${escapeHtml(column.label)}
                      </th>
                    `
          )
          .join("")}
              </tr>
            </thead>
            <tbody>
              <tr>${cells}</tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    });

    await swal.fire({
      icon: "warning",
      title: "Duplicate component found",
      html: `
      <div style="
        font-size:13px;
        line-height:1.5;
        color:#64748b;
        margin-bottom:12px;
      ">
        Testing has not started. The following existing database
        records match one or more entered component serial numbers.
      </div>

      <div style="
        max-height:430px;
        overflow-y:auto;
        padding:0 4px;
      ">
        ${recordRows.length
          ? recordRows.join("")
          : `<p>No matching record details were returned.</p>`
        }
      </div>
    `,
      width: "1000px",
      confirmButtonText: "Understood",
      confirmButtonColor: "#6366f1",
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
  }

  async function markControllerAsTested() {
    if (!pendingTestedRun || savingTestedController) return;

    setSavingTestedController(true);

    try {
      console.log("✅ Saving controller ✅")
      const result = await registerTestedController(pendingTestedRun);

      console.log("✅ Controller saved:", result.controller);

      // Only clear pending record AFTER successful DB insertion
      setPendingTestedRun(null);

      setTestStatus(
        "Controller successfully saved to Tested Controllers."
      );

      await swal.fire({
        icon: "success",
        title: "Controller marked as tested",
        text: "The controller record has been saved to the database.",
        confirmButtonText: "OK",
      });

    } catch (err) {
      console.error("❌ Failed to save tested controller:", err);

      setTestStatus(
        `Tests completed, but saving failed: ${err.message}`
      );

      await swal.fire({
        icon: "error",
        title: "Could not save controller",
        text: err.message || "Failed to save the controller.",
      });

    } finally {
      setSavingTestedController(false);
    }
  }

  // Register a completed ATS run in the Tested Controllers collection
  async function registerTestedController(data) {
    const payload = {
      controllerIp: String(selectedMac ?? "").trim(),
      unitSerialNo: String(data.unitSerialNo ?? "").trim(),
      cpu: String(data.cpu ?? "").trim(),
      base: String(data.base ?? "").trim(),
      psu: String(data.psu ?? "").trim(),
      camera: String(data.camera ?? "").trim(),
      testedBy: String(data.testedBy ?? "ATS Operator").trim(),

      remark: String(data.remark ?? "").trim(),
      testLevel: String(data.testLevel ?? "full-controller").trim(),
      reportPath: String(data.reportPath ?? "").trim(),
      reportNo: String(data.reportNo ?? "").trim(),

      // Do not override duplicates from the UI.
      // The pre-test duplicate check should already have prevented them.
      duplicateConfirmed: false,
    };

    console.log("📤 Saving tested controller:", payload);

    const response = await fetch(
      `${process.env.REACT_APP_API_URL}/api/tested-controllers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json().catch(() => ({}));

    console.log("📥 Save response:", response.status, result);

    if (!response.ok) {
      // Give the caller useful information if backend rejects it.
      if (response.status === 409) {
        const duplicateError = new Error(
          result.message || "Duplicate controller/component found."
        );

        duplicateError.code = result.code;
        duplicateError.matchingFields = result.matchingFields || [];
        duplicateError.matches = result.matches || [];

        throw duplicateError;
      }

      throw new Error(
        result.error ||
        result.message ||
        "Failed to save tested controller."
      );
    }

    return result;
  }

  // IMONI TEST FUNCTION
  async function iMoni_test() {
    setAwaitingCommand(true);
    setShowATSPanel(false);

    try {
      const initialResults = [];

      // Frontend tests
      initialResults.push({
        name: "Visual Test",
        status: "waiting",
        duration: "-",
      });

      initialResults.push({
        name: "Burn-In Test",
        status: "waiting",
        duration: "-",
      });

      // Backend tests
      selectedTests.forEach((test) => {
        initialResults.push({
          id: test,
          name: test.replace(".srv", ""),
          status: "waiting",
          duration: "-",
        });
      });

      setTestResults(initialResults);

      // 1. Validate required serial number for the test level
      if (testLevel === "green-pcb") {
        if (!base.trim()) {
          await swal.fire({
            icon: "warning",
            title: "Base PCB Serial Number Required",
            text: "Please enter Base PCB Serial Number before starting ATS",
          });
          return;
        }
      } else {
        if (!unitSerialNo.trim()) {
          await swal.fire({
            icon: "warning",
            title: "Unit Serial Number Required",
            text: "Please enter Unit Serial Number before starting ATS",
          });
          return;
        }
      }

      // 2. Check for duplicate component serial numbers
      try {
        const duplicateResult =
          await checkTestedControllerDuplicate();

        if (duplicateResult.exists) {
          await showDuplicateWarning(duplicateResult);
          setShowATSPanel(true);
          return;
        }
      } catch (err) {
        console.error("Duplicate check failed:", err);

        await swal.fire({
          icon: "error",
          title: "Unable to check duplicate records",
          text:
            `${err.message}\n\n` +
            "Testing was not started because the database check " +
            "could not be completed.",
        });

        setShowATSPanel(true);
        return;
      }

      // 3. No duplicate found: clear previous pending run
      setPendingTestedRun(null);

      setAllPassed({
        runId: null,
        status: "idle",
      });

      setNotifications((prev) => {
        const updated = { ...prev };
        delete updated.allPassed;
        return updated;
      });

      const frontendResults = [];

      console.log(
        "Fetched Test List Length: ",
        fetchedTestList.length
      );
      console.log(
        "Selected Tests Length: ",
        selectedTests.length
      );

      // 4. Run all tests if the complete test list is selected
      if (fetchedTestList.length === selectedTests.length) {
        // Visual Test
        const v = await swal.fire({
          title: "Visual Test",
          text: "Is Visual inspection passed?",
          showCancelButton: true,
          confirmButtonText: "Pass",
          cancelButtonText: "Fail",
        });

        const visualPassed = v.isConfirmed;

        setTestResults((prev) =>
          prev.map((t) =>
            t.name === "Visual Test"
              ? {
                ...t,
                status: visualPassed ? "passed" : "failed",
              }
              : t
          )
        );

        frontendResults.push({
          name: "Visual Test",
          status: visualPassed ? "passed" : "failed",
          passed: visualPassed,
          output: visualPassed
            ? "Visual inspection passed successfully"
            : "Visual inspection failed",
        });

        // Burn-In Test
        const b = await swal.fire({
          title: "Burn-In Test",
          text: "Is Burn-In test passed?",
          showCancelButton: true,
          confirmButtonText: "Pass",
          cancelButtonText: "Fail",
        });

        frontendResults.push({
          name: "Burn-In Test",
          status: b.isConfirmed ? "passed" : "failed",
          passed: b.isConfirmed,
          output: b.isConfirmed
            ? "Burn-In test passed successfully"
            : "Burn-In test failed",
        });

        console.log("Frontend Results: ", frontendResults);

        // 5. Run all backend tests
        try {
          const resp = await fetch(
            `${process.env.REACT_APP_API_URL}/api/tests/run-all`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                mac: selectedMac,
                skipFrontendTests: true,
                frontendResults,
                cpu: cpu.trim(),
                base: base.trim(),
                camera: camera.trim(),
                psu: psu.trim(),
                unitSerialNo: unitSerialNo.trim(),
                testLevel,
              }),
            }
          );

          const data = await resp.json().catch(() => ({}));

          if (!resp.ok) {
            throw new Error(
              data.error || `ATS failed (${resp.status})`
            );
          }

          // Preserve entered values even if the API response
          // does not include the serial numbers.
          setPendingTestedRun({
            ...data,
            unitSerialNo: unitSerialNo.trim(),
            cpu: cpu.trim(),
            base: base.trim(),
            camera: camera.trim(),
            psu: psu.trim(),
            testLevel,
          });

          markRunCompleted(data);

          setTestStatus(
            `Done: ${data.summary?.passed ?? 0} passed, ` +
            `${data.summary?.failed ?? 0} failed — ` +
            "Ready to mark as tested"
          );
        } catch (err) {
          console.error("Run-all ATS failed:", err);
          setTestStatus(`Error: ${err.message}`);
        }
      } else {
        // 6. Run selected backend tests
        console.log(
          "Selected Test code runs ...",
          selectedTests
        );

        try {
          const resp = await fetch(
            `${process.env.REACT_APP_API_URL}/api/tests/run`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                mac: selectedMac,
                selectedProduct,
                selectedTests,
                unitSerialNo: unitSerialNo.trim(),
                cpu: cpu.trim(),
                base: base.trim(),
                camera: camera.trim(),
                psu: psu.trim(),
                testLevel,
              }),
            }
          );

          const data = await resp.json().catch(() => ({}));

          if (!resp.ok) {
            throw new Error(
              data.error || `ATS failed (${resp.status})`
            );
          }

          // Preserve entered values even if the API response
          // does not include the serial numbers.
          setPendingTestedRun({
            ...data,
            unitSerialNo: unitSerialNo.trim(),
            cpu: cpu.trim(),
            base: base.trim(),
            camera: camera.trim(),
            psu: psu.trim(),
            testLevel,
          });

          markRunCompleted(data);

          setTestStatus(
            `Done: ${data.summary?.passed ?? 0} passed, ` +
            `${data.summary?.failed ?? 0} failed — ` +
            "Ready to mark as tested"
          );
        } catch (err) {
          console.error("Selected ATS tests failed:", err);
          setTestStatus(`Error: ${err.message}`);
        }
      }
    } catch (err) {
      // Catch unexpected errors outside the individual API calls.
      console.error("Unexpected iMoni test error:", err);

      setTestStatus(
        `Error: ${err.message || "Unexpected ATS error"}`
      );

      await swal.fire({
        icon: "error",
        title: "ATS Test Error",
        text: err.message || "An unexpected error occurred.",
      });
    } finally {
      // Always reset the Running state and restore the panel.
      setAwaitingCommand(false);
      setShowATSPanel(true);
    }
  }


  // FAN TEST FUNCTION
  async function fan_test() {
    setFanTestStatus(true);

    try {
      console.log("Calling /fan-test API...");
      const resp = await fetch(
        `${process.env.REACT_APP_API_URL}/api/tests/fan-test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac: selectedMac }),
        },
      );

      console.log("...API Called");
      const data = await resp.json();
      console.log("Data: ", data);
      setTestStatus(
        `Done: ${data.summary.passed} passed, ${data.summary.failed} failed`,
      );
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
        width: "900px",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "PASS",
        denyButtonText: "FAIL",
        cancelButtonText: "🛑 Cancel Test",
        allowOutsideClick: false,
        allowEscapeKey: false,
        cancelButton: true,
        didOpen: () => {
          const image = document.querySelector(".swal2-image");
          if (image) {
            image.style.width = "800px";
            image.style.height = "300px";
            image.style.objectFit = "contain";
            image.style.maxWidth = "100%";
          }
        },
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
        passed: r.isConfirmed,
      });
    }

    try {
      console.log("Calling /pdu-test API...");
      const resp = await fetch(
        `${process.env.REACT_APP_API_URL}/api/tests/pdu-test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mac: selectedMac,
            frontendPDUResults,
            cancelled: testCancelled,
          }),
        },
      );

      console.log("...API Called");
      const data = await resp.json();
      console.log("Data: ", data);
      setTestStatus(
        `Done: ${data.summary.passed} passed, ${data.summary.failed} failed`,
      );
    } catch (err) {
      setTestStatus(`Error: ${err.message}`);
    }

    setPduTestStatus(false);
  }

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
      {/* ATS PANEL */}
      <div className="border shadow-lg rounded-xl border-slate-700/70 bg-slate-950 text-slate-100">
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 text-blue-400 rounded-lg bg-blue-500/10">
                🧪
              </div>

              <div>
                <h2 className="text-sm font-semibold">ATS Testing</h2>
                <p className="text-[11px] text-slate-500">
                  Automated Test System
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/tested-controllers")}
              className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
              Tested Controllers
            </Button>

            {selectedMac ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
              >
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-slate-700 text-slate-400"
              >
                No Controller
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowATSPanel(!showATSPanel)}
              className="h-8 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              {showATSPanel ? "Hide" : "Show"}
            </Button>
          </div>
        </div>

        {/* TEST SETUP */}
        {showATSPanel && (
          <div className="px-4 py-3 border rounded-xl border-slate-800 bg-slate-950/80">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Controller Details
                </h3>
                <p className="text-[10px] text-slate-500">
                  Enter controller details
                </p>
              </div>
            </div>

            {/* CPU PROGRAMMING */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-[155px]">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  CPU Serial
                </label>

                <Input
                  placeholder="CPU Serial Number"
                  value={pythonCpu}
                  onChange={(e) => setPythonCpu(e.target.value)}
                  disabled={pythonRunning}
                  className="text-xs h-9 border-slate-700 bg-slate-900"
                />
              </div>

              <div className="w-[155px]">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  CPU IP
                </label>

                <Input
                  placeholder="IP Address"
                  value={pythonIp}
                  onChange={(e) => setPythonIp(e.target.value)}
                  disabled={pythonRunning}
                  className="text-xs h-9 border-slate-700 bg-slate-900"
                />
              </div>

              <Button
                onClick={runPython}
                disabled={pythonRunning}
                className="h-9 min-w-[145px] bg-blue-600 px-4 text-xs font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pythonRunning ? "⏳ Programming..." : "⚙ Program CPU"}
              </Button>
            </div>

            {pendingTestedRun && (
              <div className="flex items-center justify-between p-3 mt-4 border rounded-lg border-amber-500/30 bg-amber-500/5">
                <div>
                  <p className="text-sm font-semibold text-amber-400">
                    Testing completed
                  </p>
                  <p className="text-xs text-slate-400">
                    Review the results, then save this controller to the
                    registry.
                  </p>
                </div>

                <Button
                  onClick={markControllerAsTested}
                  disabled={savingTestedController}
                  className="px-4 text-xs font-semibold h-9 bg-emerald-600 hover:bg-emerald-500"
                >
                  {savingTestedController ? "Saving..." : "✓ Mark as Tested"}
                </Button>
              </div>
            )}

            {/* PYTHON PROGRAMMING OUTPUT */}
            {pythonRunning && (
              <div className="mt-3 overflow-hidden border rounded-lg border-slate-800 bg-slate-950">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold tracking-wide uppercase text-slate-300">
                      CPU Programming Console
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-medium text-blue-400">
                      RUNNING
                    </span>
                  </div>
                </div>

                {/* Output */}
                <div
                  ref={pythonLogsRef}
                  className="h-[220px] overflow-y-auto overscroll-contain px-3 py-2 font-mono text-[11px] leading-5"
                >
                  {pythonLogs.length > 0 ? (
                    pythonLogs.map((line, index) => (
                      <div
                        key={index}
                        className="break-words whitespace-pre-wrap text-slate-300"
                      >
                        <span className="mr-2 select-none text-slate-600">
                          {">"}
                        </span>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-slate-600">
                      Waiting for Python output...
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/60 px-3 py-1.5">
                  <span className="text-[10px] text-slate-500">
                    {pythonLogs.length} lines
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Auto-scroll enabled
                  </span>
                </div>
              </div>
            )}

            {/* CONFIG + SERIALS + RUN BUTTON */}
            <div className="flex flex-wrap items-end gap-3">
              {/* PRODUCT */}
              <div className="w-[200px]">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Product
                </label>

                <Select
                  value={selectedProduct}
                  onValueChange={(value) =>
                    handleProductChange({ target: { value } })
                  }
                >
                  <SelectTrigger className="w-full text-xs h-9 border-slate-700 bg-slate-900">
                    <SelectValue placeholder="Select Product" />
                  </SelectTrigger>

                  <SelectContent
                    position="popper"
                    side="bottom"
                    sideOffset={5}
                    className="z-[9999] w-[200px] border-slate-700 bg-slate-950"
                  >
                    <SelectItem value="iMoni">iMoni Tests</SelectItem>
                    <SelectItem value="fan">Fan Tests</SelectItem>
                    <SelectItem value="pdu">PDU Tests</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* TEST LEVEL */}
              {selectedProduct === "iMoni" && (
                <div className="w-[150px]">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Test Level
                  </label>

                  <Select value={testLevel} onValueChange={setTestLevel}>
                    <SelectTrigger className="w-full text-xs h-9 border-slate-700 bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={5}
                      className="z-[9999] w-[150px] border-slate-700 bg-slate-950"
                    >
                      <SelectItem value="full-controller">Assembly</SelectItem>

                      <SelectItem value="green-pcb">Base PCB Level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* SERIAL NUMBERS */}
              {selectedProduct === "iMoni" && testLevel === "green-pcb" && (
                <div className="w-[220px]">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Base PCB
                  </label>

                  <Input
                    placeholder="Base PCB Serial"
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    className="text-xs h-9 border-slate-700 bg-slate-900"
                  />
                </div>
              )}

              {selectedProduct === "iMoni" &&
                testLevel === "full-controller" && (
                  <>
                    <div className="w-[155px]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Assembly
                      </label>

                      <Input
                        placeholder="Assembly Serial"
                        value={unitSerialNo}
                        onChange={(e) => setUnitSerialNo(e.target.value)}
                        className="text-xs h-9 border-slate-700 bg-slate-900"
                      />
                    </div>

                    <div className="w-[155px]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        CPU
                      </label>

                      <Input
                        placeholder="CPU Serial"
                        value={cpu}
                        onChange={(e) => setCpu(e.target.value)}
                        className="text-xs h-9 border-slate-700 bg-slate-900"
                      />
                    </div>

                    <div className="w-[155px]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Base PCB
                      </label>

                      <Input
                        placeholder="Base PCB Serial"
                        value={base}
                        onChange={(e) => setBase(e.target.value)}
                        className="text-xs h-9 border-slate-700 bg-slate-900"
                      />
                    </div>

                    <div className="w-[155px]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Camera
                      </label>

                      <Input
                        placeholder="Camera Serial"
                        value={camera}
                        onChange={(e) => setCamera(e.target.value)}
                        className="text-xs h-9 border-slate-700 bg-slate-900"
                      />
                    </div>

                    <div className="w-[155px]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        PSU
                      </label>

                      <Input
                        placeholder="PSU Serial"
                        value={psu}
                        onChange={(e) => setPsu(e.target.value)}
                        className="text-xs h-9 border-slate-700 bg-slate-900"
                      />
                    </div>
                  </>
                )}

              {/* RUN ATS — RIGHT SIDE */}
              <div className="ml-auto">
                <Button
                  onClick={iMoni_test}
                  disabled={awaitingCommand}
                  className="h-9 min-w-[145px] bg-emerald-600 px-4 text-xs font-semibold hover:bg-emerald-500"
                >
                  {awaitingCommand ? "⏳ Running..." : "▶ Run ATS Tests"}
                </Button>
              </div>
            </div>

            {/* TEST LIST */}
            {testResults.length > 0 && (
              <div className="pt-3 mt-3 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Test Progress
                  </span>

                  <span className="text-[10px] text-slate-500">
                    {
                      testResults.filter((test) => test.status === "passed")
                        .length
                    }
                    {" / "}
                    {testResults.length} passed
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {testResults.map((test, index) => {
                    const statusClass = {
                      passed:
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",

                      failed: "border-red-500/30 bg-red-500/10 text-red-400",

                      running:
                        "border-blue-500/30 bg-blue-500/10 text-blue-400",

                      waiting: "border-slate-700 bg-slate-900 text-slate-500",
                    };

                    const icon = {
                      passed: "✓",
                      failed: "✕",
                      running: "●",
                      waiting: "○",
                    };

                    return (
                      <div
                        key={index}
                        title={`${test.name} - ${test.status}`}
                        className={`rounded-md border px-2.5 py-1 text-[10px] font-medium ${statusClass[test.status] || statusClass.waiting
                          }`}
                      >
                        <span className="mr-1">{icon[test.status] || "○"}</span>

                        {test.name}
                      </div>
                    );
                  })}
                </div>
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
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              setTestStatus("🛑 Tests stopped by user");
              setNotifications((prev) => ({
                ...prev,
                system: {
                  title: "Tests Stopped",
                  message: "Testing process was stopped by user",
                  type: "error",
                },
              })); // Set states to false AFTER the API call completes
              setAwaitingCommand(false);
              setFanTestStatus(false);
              setPduTestStatus(false);
            } catch (err) {
              console.error("Failed to stop tests:", err);
              // Still reset states even on error
              setAwaitingCommand(false);
              setFanTestStatus(false);
              setPduTestStatus(false);
            }
          }}
          style={{
            backgroundColor: "#cc3333",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "5px",
            cursor: "pointer",
            marginLeft: "10px",
            fontWeight: "bold",
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
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              setFanTestStatus(false);
              setTestStatus("🛑 Tests stopped by user");
              setNotifications((prev) => ({
                ...prev,
                system: {
                  title: "Tests Stopped",
                  message: "Testing process was stopped by user",
                  type: "error",
                },
              }));
            } catch (err) {
              console.error("Failed to stop tests:", err);
            }
          }}
          style={{
            backgroundColor: "#cc3333",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "5px",
            cursor: "pointer",
            marginLeft: "10px",
            fontWeight: "bold",
          }}
        >
          🛑 Stop Test
        </button>
      )}

      {Object.entries(notifications).length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {Object.entries(notifications).map(([testId, notification]) => (
            <div
              key={testId}
              style={{
                backgroundColor: getTestBackground(notification.testColor),
                border: `1px solid ${notification.testColor || "#64748B"}`,
                borderLeft: `4px solid ${notification.testColor || "#64748B"}`,

                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                color: "#fff",

                boxShadow: `0 4px 12px ${notification.type === "success"
                  ? "rgba(0, 204, 102, 0.3)"
                  : notification.type === "error"
                    ? "rgba(204, 51, 51, 0.3)"
                    : "rgba(0, 204, 204, 0.3)"
                  }`,

                animation: "slideIn 0.3s ease-out",
              }}
            >
              <div style={{ flex: 1 }}>
                <h4
                  style={{
                    margin: "0 0 5px 0",
                    color: notification.testColor || "#64748B",
                    fontSize: "16px",
                  }}
                >
                  {notification.title}
                </h4>

                {notification.pre && (
                  <p
                    style={{
                      margin: "0 0 5px 0",
                      color: "#ffcc00",
                      fontSize: "13px",
                      fontWeight: "bold",
                    }}
                  >
                    ⚠️ {notification.pre}
                  </p>
                )}

                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    lineHeight: "1.4",
                    fontWeight: "500",
                  }}
                >
                  {notification.message}
                </p>
              </div>

              <button
                onClick={() => {
                  setNotifications((prev) => {
                    const updated = { ...prev };
                    delete updated[testId];
                    return updated;
                  });

                  if (notificationTimeoutRefs.current[testId]) {
                    clearTimeout(notificationTimeoutRefs.current[testId]);
                    delete notificationTimeoutRefs.current[testId];
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: notification.testColor || "#64748B",
                  fontSize: "18px",
                  cursor: "pointer",
                  marginLeft: "12px",
                  padding: "0 5px",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {testProgress.length > 0 && (
        <div className="test-results">
          <h4>ATS Results ({testProgress.length} tests)</h4>
          {testStatus}
          <div className="test-results-list">
            {testProgress.map((result, index) => (
              <div key={index} className={`test-result ${result.status}`}>
                <strong>{result.name || result.test}</strong>:{" "}
                {result.status.toUpperCase()}
                {result.message && (
                  <div className="test-message">📝 {result.message}</div>
                )}
                <div className="test-details">
                  <div>
                    Expected:{" "}
                    {result.expectedOutcome !== null
                      ? result.expectedOutcome
                      : "N/A"}
                  </div>
                  <div>Received: {result.receivedOutcome || "No response"}</div>
                </div>
                {result.output && (
                  <div className="test-output">{result.output}</div>
                )}
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

              <button onClick={() => setSelectedTests([])}>Clear</button>
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
                      setSelectedTests(selectedTests.filter((t) => t !== test));
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

      {pduTestStatus && <img className="pdu-image" src="./pdu/ch1.png"></img>}
      {/* </div>

      {/* DASHBOARD */}
      <div className="dashboard">
        <div className="panel">
          {/* <h2 className="selected-heading"> */}
          {/* 📟 Selected Rack: {selectedMac && <span> {selectedDevice}</span>} */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
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
                    value={latestReading.outsideTemperature.toFixed(2)}
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
                    value={latestReading.inputVoltage.toFixed(2)}
                    max={5}
                    color="#06d6a0"
                    alarm={latestReading.inputVoltageAlarm}
                  />
                  <Gauge
                    label="Output Volt"
                    value={latestReading.outputVoltage.toFixed(2)}
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
                    value={latestReading.hupsBatVolt.toFixed(2)}
                    max={120}
                    color="#ffc107"
                    alarm={latestReading.batteryBackupAlarm}
                  />
                  {latestReading.batteryBackup <= 10 ? (
                    <Gauge
                      label="LockBat(Left Hours)"
                      value={0}
                      max={12}
                      color="#ffc107"
                      alarm={latestReading.batteryBackupAlarm}
                    />
                  ) : (
                    <Gauge
                      label="LockBat(Left Hours)"
                      value={Math.floor((latestReading.batteryBackup - 9) * 4)}
                      // value={6}
                      max={12}
                      color="#ffc107"
                      alarm={latestReading.batteryBackupAlarm}
                    />
                  )}
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
                              <div
                                className={`fan-light-circle ${statusClass}`}
                              />
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
                                  latestReading[`fanLevel${level}Running`] ===
                                  true)
                                ? "active"
                                : ""
                                }`}
                              onClick={() => handleFanClick(level)}
                            />
                            <div className="fan-label">
                              {level >= 1 && level <= 4
                                ? `FG ${level}`
                                : "NON-CRITICAL LOAD"}
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
                          <button
                            className="lock-btn"
                            onClick={handleResetLock}
                          >
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

                  {/* RIGHT */}
                  <div className="status-right">
                    <div className="status-card">
                      <h4>Alarms</h4>

                      <div className="status-grid">
                        {/* Alarm map */}
                        {alarmKeys.map((alarm, i) => (
                          <div key={i} className="status-box">
                            <div
                              className={`alarm-led ${latestReading[alarm.key] === 87
                                ? "wait"
                                : latestReading[alarm.key]
                                  ? "active"
                                  : ""
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
                                  <div className="alarm-label">
                                    {status.Name}
                                  </div>
                                  <div className="alarm-attempt">
                                    {3 - latestReading[status.key]} Attempt Left
                                  </div>
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
                            <div className="status-title">{hups.Name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
                          selectedImage,
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
                              selectedImage,
                          );
                          const prevIndex =
                            (currentIndex - 1 + snapshots.length) %
                            snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[prevIndex]}?mac=${selectedMac}`,
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
                              selectedImage,
                          );
                          const nextIndex =
                            (currentIndex + 1) % snapshots.length;
                          setSelectedImage(
                            `${process.env.REACT_APP_API_URL}/api/snapshots/${snapshots[nextIndex]}?mac=${selectedMac}`,
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
                              `${process.env.REACT_APP_API_URL}/api/snapshots/${filename}?mac=${selectedMac}`,
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

export default DashboardViewTest;
