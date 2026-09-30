# Low-Level System Design Documentation

## Automated Testing System (ATS) - Backend

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Technology Stack & Dependencies](#technology-stack--dependencies)
3. [Project Structure](#project-structure)
4. [Data Models & Database Schema](#data-models--database-schema)
5. [API Endpoints & Routes](#api-endpoints--routes)
6. [Core Modules & Functions](#core-modules--functions)
7. [Communication Protocols](#communication-protocols)
8. [Business Logic & Workflows](#business-logic--workflows)
9. [Error Handling & Debugging](#error-handling--debugging)
10. [Configuration & Environment Setup](#configuration--environment-setup)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

The ATS backend is built using a **three-tier architecture**:

```
┌─────────────────────────────────────┐
│       Frontend (React Dashboard)    │
│   (WebSocket + REST API Client)     │
└──────────────┬──────────────────────┘
               │
        ┌──────▼───────────┐
        │   WebSocket      │  (Port 8080)
        │   Server (WS)    │
        └──────┬───────────┘
               │
        ┌──────▼───────────────────────┐
        │  Express.js REST API Server  │  (Port 5000)
        │  - Authentication (JWT)      │
        │  - Device Management         │
        │  - Test Execution            │
        │  - Data Aggregation          │
        └──────┬──────────────────────┘
               │
    ┌──────────┼──────────────┐
    │          │              │
    ▼          ▼              ▼
┌────────┐ ┌────────┐   ┌──────────────┐
│ Local  │ │MongoDB │   │ tcp/IP       │
│  TCP   │ │ Atlas  │   │ Devices      │
│Socket  │ │ (Cloud)│   │ (PDU, iMoni, │
│Listener│ └────────┘   │  Fan Systems)│
└────────┘              └──────────────┘
(Port 9999)
```

### 1.2 System Components

| Component            | Purpose                   | Technology             |
| -------------------- | ------------------------- | ---------------------- |
| **Express Server**   | REST API & Business Logic | Node.js + Express.js   |
| **WebSocket Server** | Real-time Communication   | ws library             |
| **Database**         | Data Persistence          | MongoDB (Mongoose ODM) |
| **TCP Listener**     | Device Connection Handler | Node.js net module     |
| **Authentication**   | User & Session Management | JWT + bcrypt           |
| **Test Engine**      | ATS Test Execution        | Custom test runner     |
| **Report Writer**    | Test Result Reporting     | Excel export (exceljs) |

### 1.3 Data Flow

```
Device (PDU/iMoni/Fan)
    ↓ (TCP connection)
TCP Listener (port 9999)
    ↓ (Parse sensor data)
SensorReading Model
    ↓ (MongoDB storage + cache)
Express API / WebSocket
    ↓
Frontend Dashboard / Test Interface
    ↓ (User triggers test)
ATS Runner
    ↓
Report Writer
    ↓
Test Results (Excel reports)
```

---

## 2. Technology Stack & Dependencies

### 2.1 Core Dependencies

```json
{
  "express": "^5.1.0", // Web framework
  "mongoose": "^8.15.2", // MongoDB ODM
  "ws": "^8.18.3", // WebSocket library
  "jsonwebtoken": "^9.0.2", // JWT authentication
  "bcrypt": "^6.0.0", // Password hashing
  "cors": "^2.8.5", // Cross-Origin Resource Sharing
  "body-parser": "^2.2.0", // Body parsing middleware
  "dotenv": "^17.2.3", // Environment configuration
  "axios": "^1.13.2", // HTTP client
  "exceljs": "^4.4.0", // Excel file generation
  "nodemon": "^3.1.10" // Development auto-reload
}
```

### 2.2 Node.js Built-in Modules Used

- `net` - TCP socket server for device connections
- `fs` - File system operations (test files, reports)
- `path` - File path manipulation
- `child_process` - Spawning ATS test processes
- `util` - Utility functions
- `require('dotenv')` - Environment variable management

### 2.3 Version Requirements

- **Node.js**: >= 14.0.0
- **MongoDB**: 4.4+ (Atlas cloud or local)
- **npm**: >= 6.0.0

---

## 3. Project Structure

### 3.1 Directory Layout

```
server/
├── package.json                 # Dependencies & scripts
├── server.js                    # Main server (user data APIs)
├── server_ats.js               # ATS-specific server (test execution)
├── thresholds.js               # Sensor threshold configurations
├── .env                        # Environment variables
│
├── models/                     # MongoDB Schemas
│   ├── User.js                # User authentication model
│   ├── Device.js              # Device metadata model
│   └── SensorReading.js        # Sensor data model
│
├── ATS/                        # Automated Testing System
│   ├── atsRuntime.js          # Runtime state management
│   ├── atsRunner.js           # Test execution engine
│   └── reportWriter.js        # Report generation
│
├── auth/                       # Authentication modules
│   └── debug.js               # Debug utilities
│
├── tests/                      # Test definitions
│   ├── iMoni/                 # iMoni device tests
│   ├── fan/                   # Fan system tests
│   └── pdu/                   # PDU device tests
│
├── dummy/                      # Sample test files
│   ├── 1_Visual.srv           # Sample visual test
│   └── 2_Burn_In.srv          # Sample burn-in test
│
├── testResult/                # Generated test reports
│   ├── *.rpt                  # Report files
│   ├── fan/                   # Fan test reports
│   ├── iMoni/                 # iMoni test reports
│   └── pdu/                   # PDU test reports
│
└── utils/                      # Utility functions
    └── time.js                # Date/time formatting
```

### 3.2 File Relationships

```
Express Server (server_ats.js)
    ├─ Models (User, Device, SensorReading)
    ├─ ATS Runtime (atsRuntime.js)
    ├─ ATS Runner (atsRunner.js)
    ├─ Report Writer (reportWriter.js)
    ├─ Thresholds configuration
    └─ Utils (time formatting)

WebSocket Server
    └─ ATS Runtime (state management)

TCP Listener
    ├─ Device Management
    ├─ Sensor Data Processing
    └─ SensorReading Model (persistence)
```

---

## 4. Data Models & Database Schema

### 4.1 User Model

**File**: `models/User.js`

```javascript
UserSchema {
  username: String          // Unique, lowercase username
  password: String          // bcrypt-hashed password
  role: String             // Enum: ['admin', 'block', 'gp', 'user']
  createdAt: Date          // Auto-generated timestamp (default)
}
```

**Roles**:

- `admin` - Full system access
- `block` - Block manager
- `gp` - Group manager
- `user` - Standard user with read-access

**Indexes**: `username` (unique)

---

### 4.2 Device Model

**File**: `models/Device.js`

```javascript
DeviceSchema {
  mac: String              // Device MAC address (lowercase)
  locationId: String       // Location/site identifier
  address: String          // Physical address
  latitude: Number         // GPS latitude
  longitude: Number        // GPS longitude
  ipCamera: {              // IP camera configuration
    type: String           // Camera type/brand
    ip: String            // Camera IP address
  }
  createdAt: Date         // Auto-generated timestamp
}
```

**Unique Fields**: `mac` (case-insensitive normalization)

**Use Cases**:

- Store device metadata
- IP camera integration for visual tests
- Location-based queries
- Device inventory management

---

### 4.3 SensorReading Model

**File**: `models/SensorReading.js`

```javascript
SensorReadingSchema {
  // Device Reference
  mac: String              // Connected device MAC address

  // Environmental Sensors
  humidity: Number         // Percentage (0-100)
  insideTemperature: Number    // Celsius
  outsideTemperature: Number   // Celsius

  // Security & Access
  lockStatus: String       // 'locked' | 'unlocked'
  doorStatus: String       // 'open' | 'closed'

  // Water Management
  waterLogging: Boolean    // Water accumulation detected
  waterLeakage: Boolean    // Water leak detected

  // Power Supply (UPS/HUPS)
  outputVoltage: Number    // Volts
  hupsDVC: Number         // HUPS DVC voltage
  inputVoltage: Number    // Input voltage
  hupsBatVolt: Number     // HUPS battery voltage
  batteryBackup: Number   // Backup hours (6-13)

  // Alarms
  alarmActive: Boolean    // General alarm state
  fireAlarm: Number       // Fire alarm level

  // Fan Systems (running states)
  fanLevel1Running: Boolean
  fanLevel2Running: Boolean
  fanLevel3Running: Boolean
  fanLevel4Running: Boolean
  pwsFailCount: Number

  // Fan Status (0=off, 1=healthy, 2=faulty)
  fan1Status: Number
  fan2Status: Number
  fan3Status: Number
  fan4Status: Number
  fan5Status: Number
  fan6Status: Number

  // Threshold-based Alarms
  insideTemperatureAlarm: Boolean   // Triggered if > 55°C
  outsideTemperatureAlarm: Boolean   // Triggered if > 65°C
  humidityAlarm: Boolean             // Triggered if > 80%
  inputVoltageAlarm: Boolean         // Triggered if < 40V or > 65V
  outputVoltageAlarm: Boolean        // Triggered if < 45V or > 55V
  batteryBackupAlarm: Boolean        // Triggered if < 6hrs

  // System Status (0=off, 1=healthy, 2=faulty)
  mainStatus: Number
  rectStatus: Number
  inveStatus: Number
  overStatus: Number
  mptStatus: Number
  mosfStatus: Number
  hupsRes: Number

  // Metadata
  timestamp: Date         // Reading timestamp (default: now)
}
```

**Threshold Configuration** (`thresholds.js`):

```javascript
{
  insideTemperature: { min: 0, max: 55 },
  outsideTemperature: { min: -20, max: 65 },
  humidity: { min: 20, max: 80 },
  inputVoltage: { min: 40.0, max: 65.0 },
  outputVoltage: { min: 45.0, max: 55.0 },
  batteryBackup: { min: 6, max: 13 }
}
```

**Indexes**: `mac`, `timestamp`

---

## 5. API Endpoints & Routes

### 5.1 Authentication Endpoints

#### 5.1.1 User Login

```
POST /api/login
Authorization: None

Request Body:
{
  "username": "string",
  "password": "string"
}

Response (Success):
{
  "role": "admin|block|gp|user",
  "token": "jwt_token_string"
}

Response (Error):
{
  "error": "Invalid credentials"
}

Status Codes:
- 200: Login successful
- 401: Invalid credentials
- 500: Server error

Notes:
- Admin login via .env (ADMIN_USERNAME, ADMIN_PASSWORD)
- User login via MongoDB User collection
- Token expires in 2 hours
```

---

### 5.2 User Management Endpoints

#### 5.2.1 Register New User

```
POST /api/register-user
Authorization: Admin only (implicit)

Request Body:
{
  "username": "string",
  "password": "string",
  "role": "admin|block|gp|user"
}

Response (Success):
{
  "message": "User registered successfully"
}

Response (Error):
{
  "error": "Error creating user"
}

Status Codes:
- 200: User created
- 400: Invalid role
- 500: Database error

Notes:
- Username converted to lowercase
- Password bcrypt-hashed (salt rounds: 10)
- Role validation required
```

#### 5.2.2 Get All Users

```
GET /api/users
Authorization: None (should add token verification)

Response (Success):
[
  {
    "_id": "mongo_id",
    "username": "string",
    "role": "admin|block|gp|user",
    "password": "bcrypt_hash"
  },
  ...
]

Response (Error):
{
  "error": "Failed to fetch users"
}

Status Codes:
- 200: Users retrieved
- 500: Database error

Returns: Array of all users with hashed passwords
```

#### 5.2.3 Update User

```
PUT /api/user/:id
Authorization: Admin password required

Request Body:
{
  "username": "string",
  "password": "string|null",
  "adminPassword": "string"
}

Response (Success):
{
  "_id": "mongo_id",
  "username": "string",
  "password": "bcrypt_hash",
  "role": "admin|block|gp|user"
}

Response (Error):
{
  "error": "Unauthorized: Invalid admin password" | "User not found" | "Server error"
}

Status Codes:
- 200: User updated
- 403: Invalid admin password
- 404: User not found
- 500: Server error

Notes:
- Admin password verification required
- Password updated only if provided and non-empty
```

#### 5.2.4 Delete User

```
DELETE /api/user/:username
Authorization: Admin password required

Request Body:
{
  "adminPassword": "string"
}

Response (Success):
{
  "message": "User deleted successfully"
}

Response (Error):
{
  "error": "Unauthorized: Invalid admin password" | "User not found" | "Server error"
}

Status Codes:
- 200: User deleted
- 403: Invalid admin password
- 404: User not found
- 500: Server error
```

---

### 5.3 Device Management Endpoints

#### 5.3.1 Register New Device

```
POST /api/register-device
Authorization: None (should add token verification)

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "locationId": "string",
  "address": "string",
  "latitude": number,
  "longitude": number,
  "ipCamera": "type,ip_address"  // Optional, comma-separated
}

Response (Success):
{
  "message": "Device registered successfully"
}

Response (Error):
{
  "error": "Error registering device"
}

Status Codes:
- 200: Device registered
- 500: Database error

Notes:
- MAC address normalized to lowercase
- IP camera parsed from "type,ip" format
- Creates Device document in MongoDB
```

#### 5.3.2 Get Device Information

```
GET /api/devices-info
Authorization: None

Response (Success):
[
  {
    "_id": "mongo_id",
    "mac": "00:11:22:33:44:55",
    "locationId": "string",
    "address": "string",
    "latitude": number,
    "longitude": number,
    "ipCamera": {
      "type": "string",
      "ip": "string"
    }
  },
  ...
]

Status Codes:
- 200: Success
- 500: Database error

Sorting: By locationId (descending)
Notes: MAC addresses normalized to lowercase
```

#### 5.3.3 Get Connected Devices

```
GET /api/devices
Authorization: None

Response:
[
  "00:11:22:33:44:55",
  "aa:bb:cc:dd:ee:ff",
  ...
]

Status Codes:
- 200: Success

Returns: Array of currently connected device MACs
Source: atsRuntime.connectedDevices (in-memory map)
```

#### 5.3.4 Get All Devices

```
GET /api/all-devices
Authorization: None

Response:
[
  {
    "mac": "00:11:22:33:44:55",
    "models": [
      {
        "modelName": "string",
        "modelType": "iMoni|PDU|FAN",
        "sensorData": { ... }
      }
    ]
  },
  ...
]

Status Codes:
- 200: Success
- 500: Error

Notes: Combines Device metadata with latest SensorReading data
```

#### 5.3.5 Update Device

```
PUT /api/device/:mac
Authorization: None (should add token verification)

Request Body:
{
  "locationId": "string",
  "address": "string",
  "latitude": number,
  "longitude": number,
  "ipCamera": "type,ip_address",
  "password": "string" // Optional
}

Response (Success):
{
  "_id": "mongo_id",
  "mac": "string",
  "locationId": "string",
  ... (updated fields)
}

Response (Error):
{
  "error": "Device not found" | "Server error"
}

Status Codes:
- 200: Device updated
- 404: Device not found
- 500: Server error
```

#### 5.3.6 Delete Device

```
POST /api/device/delete/:mac
Authorization: None (should add token verification)

Response (Success):
{
  "message": "Device deleted successfully"
}

Response (Error):
{
  "error": "Device not found" | "Server error"
}

Status Codes:
- 200: Device deleted
- 404: Device not found
- 500: Server error

Method: POST (should be DELETE in REST standard)
```

---

### 5.4 Sensor Data Endpoints

#### 5.4.1 Get Sensor Readings

```
GET /api/readings
Authorization: None

Query Parameters:
- mac: string (Optional) - Filter by device MAC
- limit: number (Optional) - Number of records

Response (Success):
[
  {
    "_id": "mongo_id",
    "mac": "00:11:22:33:44:55",
    "humidity": number,
    "insideTemperature": number,
    "outsideTemperature": number,
    "lockStatus": "locked|unlocked",
    "doorStatus": "open|closed",
    "waterLogging": boolean,
    "waterLeakage": boolean,
    "outputVoltage": number,
    "inputVoltage": number,
    "batteryBackup": number,
    "alarmActive": boolean,
    "fireAlarm": number,
    "fan1Status": number,
    ... (all sensor fields)
    "timestamp": "ISO_datetime"
  },
  ...
]

Status Codes:
- 200: Success
- 500: Database error

Sorting: By timestamp (descending - latest first)
Cache: Cached in latestReadings variable for performance
```

#### 5.4.2 Get Alarms Test (Simulated)

```
GET /api/alarms-test
Authorization: None

Response (Success):
[
  {
    "mac": "00:11:22:33:44:55",
    "alarmName": "string",
    "status": "active|inactive",
    "severity": "low|medium|high",
    "timestamp": "ISO_datetime"
  },
  ...
]

Status Codes:
- 200: Success
- 500: Database error

Notes: Returns filtered sensor readings with alarmActive = true
```

#### 5.4.3 Get Historical Data

```
GET /api/historical-data
Authorization: None

Query Parameters:
- mac: string (Required) - Device MAC address
- from: ISO_datetime (Optional) - Start date
- to: ISO_datetime (Optional) - End date
- limit: number (Optional, default: 100) - Records to return

Response (Success):
[
  {
    "_id": "mongo_id",
    "mac": "00:11:22:33:44:55",
    ... (all sensor fields)
    "timestamp": "ISO_datetime"
  },
  ...
]

Status Codes:
- 200: Success
- 500: Database error

Sorting: By timestamp (ascending - oldest first)
```

---

### 5.5 Command & Logging Endpoints

#### 5.5.1 Send Command to Device

```
POST /command
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "command": "string"
}

Response (Success):
{
  "status": "pending|sent|success",
  "command": "string",
  "mac": "string"
}

Response (Error):
{
  "error": "Device not connected" | "Server error"
}

Status Codes:
- 200: Command sent
- 400: Device not connected
- 500: Server error

Notes:
- Queues command to connected device via TCP
- Uses deviceCommandWaiters for acknowledgment
```

#### 5.5.2 Log Command

```
POST /api/log-command
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "command": "string",
  "status": "sent|received|executed|failed",
  "timestamp": "ISO_datetime"
}

Response (Success):
{
  "message": "Command logged successfully"
}

Status Codes:
- 200: Logged
- 500: Error

Notes: Logs command execution history for audit trail
```

---

### 5.6 Snapshot Endpoints

#### 5.6.1 Get Snapshot (Image)

```
GET /api/snapshots/:imageName
Authorization: None

Response:
- Binary image file (JPEG/PNG)

Status Codes:
- 200: Image returned
- 404: Image not found
- 500: Server error

File Location: testResult/ directory
```

#### 5.6.2 Get Snapshots List

```
GET /api/snapshots
Authorization: None

Response (Success):
[
  {
    "name": "image_filename.jpg",
    "path": "relative/path/image_filename.jpg",
    "size": number,
    "modified": "ISO_datetime"
  },
  ...
]

Status Codes:
- 200: Success
- 500: Server error

Recursively lists all image files in testResult/ directory
```

---

### 5.7 Test Execution Endpoints

#### 5.7.1 Get Available Tests List

```
GET /api/tests/list
Authorization: None

Query Parameters:
- type: "iMoni|fan|pdu" (Optional)

Response (Success):
{
  "iMoni": [
    {
      "name": "test_filename.srv",
      "path": "tests/iMoni/test_filename.srv",
      "type": "iMoni"
    },
    ...
  ],
  "fan": [ ... ],
  "pdu": [ ... ]
}

Status Codes:
- 200: Success
- 500: Server error

Notes:
- Reads .srv files from tests/{type}/ directories
- Parses test name from file header
```

#### 5.7.2 Run Test

```
POST /api/tests/run
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "testFiles": [
    "test_name_1.srv",
    "test_name_2.srv"
  ]
}

Response (Success):
{
  "status": "running|completed|failed",
  "testId": "string",
  "mac": "string",
  "results": [
    {
      "testFile": "test_name.srv",
      "status": "passed|failed|pending",
      "duration": number,
      "stepResults": [
        {
          "stepNumber": number,
          "status": "passed|failed",
          "expectedValue": string,
          "receivedValue": string
        }
      ],
      "reportPath": "testResult/timestamp_mac.rpt"
    }
  ]
}

Response (Error):
{
  "error": "Device not connected" | "Invalid test files" | "Server error"
}

Status Codes:
- 200: Tests started/completed
- 400: Invalid request
- 500: Server error

WebSocket Updates:
- Progress updates via WebSocket with type: 'TEST_STATUS'
- Real-time step results
- Device dialog prompts

Notes:
- Uses atsRunner.js for test execution
- Generates .rpt reports in testResult/
- Can be stopped via /api/tests/stop
```

#### 5.7.3 Stop Test Execution

```
POST /api/tests/stop
Authorization: None

Response (Success):
{
  "status": "stopped",
  "message": "Test execution halted"
}

Status Codes:
- 200: Stop signal sent
- 500: Server error

Mechanism: Sets atsRuntime.testStopRequested flag
Current tests complete current step then halt
```

#### 5.7.4 Run All Tests

```
POST /api/tests/run-all
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "categories": ["iMoni", "fan", "pdu"] (Optional)
}

Response (Success):
{
  "status": "running",
  "totalTests": number,
  "results": [ ... ]
}

Status Codes:
- 200: All tests started
- 500: Server error

Notes:
- Sequentially runs all tests of specified categories
- Same result format as /api/tests/run
```

#### 5.7.5 Fan System Test

```
POST /api/tests/fan-test
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "fanLevel": 1|2|3|4,
  "duration": number,
  "expectedPower": number
}

Response (Success):
{
  "status": "completed|failed",
  "fanLevel": number,
  "actualPower": number,
  "powerDifference": number,
  "passed": boolean,
  "reportPath": "testResult/fan/timestamp_mac.rpt"
}

Status Codes:
- 200: Test completed
- 400: Invalid parameters
- 500: Server error

Notes:
- Specific test for fan subsystems
- Verifies power consumption within tolerance
- Generates fan-specific reports
```

#### 5.7.6 PDU System Test

```
POST /api/tests/pdu-test
Authorization: None

Request Body:
{
  "mac": "00:11:22:33:44:55",
  "testType": "voltage|current|capacity",
  "duration": number
}

Response (Success):
{
  "status": "completed|failed",
  "testType": "string",
  "measurements": [
    {
      "parameter": "voltage|current",
      "value": number,
      "minExpected": number,
      "maxExpected": number,
      "passed": boolean
    }
  ],
  "reportPath": "testResult/pdu/timestamp_mac.rpt"
}

Status Codes:
- 200: Test completed
- 500: Server error

Notes:
- Tests PDU (Power Distribution Unit) functionality
- Validates electrical parameters
```

#### 5.7.7 Get Tests by Type

```
GET /api/tests/:testType
Authorization: None

URL Parameters:
- testType: "iMoni|fan|pdu"

Response (Success):
[
  {
    "name": "test_filename.srv",
    "path": "tests/{testType}/test_filename.srv",
    "parsed": {
      "name": "Test Name",
      "message": "Test Description",
      "steps": number
    }
  },
  ...
]

Status Codes:
- 200: Success
- 500: Server error

Notes:
- Returns tests for specific device type
- Includes parsed test metadata
```

---

### 5.8 Configuration Endpoints

#### 5.8.1 Get Thresholds

```
GET /api/thresholds
Authorization: None

Response (Success):
{
  "insideTemperature": { "min": 0, "max": 55 },
  "outsideTemperature": { "min": -20, "max": 65 },
  "humidity": { "min": 20, "max": 80 },
  "inputVoltage": { "min": 40.0, "max": 65.0 },
  "outputVoltage": { "min": 45.0, "max": 55.0 },
  "batteryBackup": { "min": 6, "max": 13 }
}

Status Codes:
- 200: Success

Source: thresholds.js configuration file
```

---

### 5.9 Utility Endpoints

#### 5.9.1 Health Check (Ping)

```
GET /ping
Authorization: None

Response (Success):
"pong"

Status Codes:
- 200: Server and MongoDB are healthy
- 500: MongoDB connection error

Notes:
- Pings MongoDB database for connection verification
- Also available on WebSocket server for connection test
```

#### 5.9.2 WebSocket Test

```
GET /api/websocket-test
Authorization: None

Response (Success):
{
  "status": "WebSocket server is running",
  "port": 8080,
  "clients": number,
  "features": ["real-time updates", "test status", "dialog prompts"]
}

Status Codes:
- 200: Success
```

---

## 6. Core Modules & Functions

### 6.1 ATS Runtime Module (`atsRuntime.js`)

**Purpose**: Central state management for test execution

**Exports**:

```javascript
module.exports = {
  // Test Execution State
  testStopRequested: Boolean,           // Read-only flag
  requestStop(): void,                  // Set stop flag
  resetStop(): void,                    // Clear stop and related states

  // MAC Waiting State
  testWaitingForMAC: String|null,       // Current awaiting MAC
  setTestWaitForMAC(mac): void,
  clearTestWaitForMAC(): void,

  // Dialog Management
  setDialogResolver(fn): void,          // Set Promise resolver
  resolveDialog(value): void,           // Resolve with true/false

  // Device Management
  connectedDevices: Map,                // Map<MAC, DeviceData>
  deviceCommandWaiters: Array           // Pending command acknowledgments
}
```

**Key State Variables**:

- `testStopRequested` - Allows graceful test termination
- `testWaitingForMAC` - Tracks which device test is waiting for
- `pendingDialogResolver` - Resolves user dialog responses
- `connectedDevices` - Maintains connected device registry
- `deviceCommandWaiters` - Queue for command acknowledgments

**Usage Pattern**:

```javascript
// In test execution
atsRuntime.setTestWaitForMAC("00:11:22:33:44:55");

// Device connects
atsRuntime.connectedDevices.set("00:11:22:33:44:55", deviceData);

// Check for stop request
if (atsRuntime.testStopRequested) {
  atsRuntime.resetStop();
  // Clean up test
}

// Dialog interaction
const response = await new Promise((resolve) => {
  atsRuntime.setDialogResolver(resolve);
  // Frontend responds via WebSocket
});
```

---

### 6.2 ATS Runner Module (`atsRunner.js`)

**Purpose**: Executes test workflows and step-by-step validation

**Main Export**: `runTests({ testFiles, mac, onStatus, frontendResults })`

**Test File Format** (`.srv` files):

```
name="Test Name"
msg="Test Description"
pre="Pre-test message"
type="iMoni|fan|pdu"
continueOnFail=0
retryCount=1

[step:1]
msg="Step 1 description"
action="COMMAND_TO_SEND$TIMESTAMP$"
waitFor="expected_response_pattern"
waitTime=20
expectedValue="expected_value"
onPass="Success message"
onFail="Failure message"
cameraUrl="http://camera_ip:port/snapshot"

[step:2]
msg="Step 2 description"
...
```

**Execution Flow**:

```
Parse .srv file
    ↓
Extract test metadata (name, message, steps)
    ↓
For each step:
    ├─ Display step message (WebSocket modal)
    ├─ Send command to device (if defined)
    ├─ Wait for expected response (with timeout)
    ├─ Validate received value
    ├─ Capture camera snapshot (if cameraUrl provided)
    ├─ Record pass/fail status
    └─ Execute onPass/onFail callback
        ↓
Generate Report (.rpt file)
    ↓
Return results to frontend
```

**Key Functions**:

1. **runTests()** - Main test execution orchestrator
   - Iterates through test files
   - Handles test stopping
   - Aggregates results

2. **File Parsing** - Extracts test configuration from .srv file
   - Reads and splits lines
   - Parses key=value properties
   - Builds step configurations

3. **Step Execution** - Runs individual test steps
   - Sends commands via TCP
   - Waits for device responses
   - Captures camera snapshots

4. **Validation** - Compares expected vs received values
   - Exact match comparison
   - Numeric range validation
   - Timeout handling

5. **Result Aggregation** - Combines step results
   - Determines overall test pass/fail
   - Calculates execution duration
   - Formats for frontend

**WebSocket Updates** during execution:

```javascript
// Progress update
{
  type: 'TEST_STATUS',
  data: {
    testFile: 'test_name.srv',
    currentStep: 1,
    totalSteps: 5,
    status: 'running'
  }
}

// Step result
{
  type: 'STEP_RESULT',
  data: {
    stepNumber: 1,
    passed: true,
    message: 'Step passed'
  }
}

// Dialog prompt
{
  type: 'DIALOG_PROMPT',
  data: {
    title: 'Confirm Action',
    message: 'Please perform manual check'
  }
}
```

---

### 6.3 Report Writer Module (`reportWriter.js`)

**Purpose**: Generates Excel and text reports from test results

**Main Export**: `reportWriter(testResults, mac, timestamp)`

**Report Formats**:

1. **Excel Report** (.xlsx)
   - Workbook with multiple sheets
   - Sheet 1: Test Summary
   - Sheet 2: Step Details
   - Sheet 3: Measurements/Values

2. **Text Report** (.rpt)
   - Plain text format
   - Timestamp: ISO format
   - MAC: Device identifier
   - Test Name: From test configuration
   - Status: PASSED | FAILED | INCOMPLETE
   - Steps:
     ```
     Step 1: [PASS|FAIL]
       Expected: value
       Received: value
       Duration: 2.5s
     ```

**Report Location**:

- `server/testResult/{timestamp}_{mac}.rpt` - main report
- `server/testResult/{type}/{timestamp}_{mac}.rpt` - typed reports (fan/, iMoni/, pdu/)

**Report Content Structure**:

```
ATS Test Report
===============
Timestamp: 2025-02-06T18:05:55+00:00
Device MAC: 00:11:22:33:44:55
Device Type: iMoni
Test Name: Environmental Sensors Test
Test Status: PASSED
Total Duration: 45.2 seconds

Test Configuration:
  Type: iMoni
  Message: Testing temperature, humidity, and water sensors
  Steps: 5
  Retry Count: 1
  Continue on Fail: 0

Step Results:
=============

Step 1: Read Temperature Sensor
  Command: GET_TEMP$2025-02-06T18:05:55$
  Wait For: TEMP_RESPONSE
  Status: PASSED
  Expected Value: 23-28
  Received Value: 25.5
  Duration: 2.1s
  Message: Temperature reading within acceptable range

Step 2: Read Humidity Sensor
  Status: PASSED
  Expected Value: 40-60
  Received Value: 52.3
  Duration: 1.8s

Step 3: Check Water Sensors
  Status: PASSED
  Water Logging: No
  Water Leakage: No
  Duration: 1.5s

Step 4: Read Voltage
  Status: PASSED
  Input Voltage: 48.5V (Expected: 40-65V)
  Output Voltage: 50.2V (Expected: 45-55V)
  Duration: 2.0s

Step 5: Check Alarms
  Status: PASSED
  Fire Alarm: Inactive
  General Alarm: Inactive
  Duration: 0.8s

Summary:
========
Total Steps: 5
Passed: 5
Failed: 0
Skipped: 0
Success Rate: 100%
Total Duration: 45.2 seconds
Test Result: PASSED ✓
```

---

### 6.4 TCP Socket Listener (server_ats.js)

**Purpose**: Receives and processes data from IoT devices

**Connection Handler** (Port 9999):

```javascript
// Basic structure
net
  .createServer((socket) => {
    let deviceMAC = null;
    let dataBuffer = "";

    socket.on("data", (chunk) => {
      // 1. Decode data (UTF-8)
      dataBuffer += chunk.toString("utf-8");

      // 2. Parse packets (device-specific format)
      // 3. Extract sensor readings
      // 4. Update SensorReading model
      // 5. Broadcast via WebSocket
      // 6. Check thresholds
      // 7. Trigger alarms if needed
    });

    socket.on("end", () => {
      // Remove from connectedDevices
    });

    socket.on("error", (err) => {
      // Log error
      // Clean up connection
    });
  })
  .listen(9999);
```

**Packet Processing Pipeline**:

```
TCP Data Received
    ↓
Decode & Validate packet
    ↓
Extract device MAC
    ↓
Parse Sensor Fields
    (humidity, temp, voltages, etc.)
    ↓
Compare against Thresholds (thresholds.js)
    ↓
Generate Alarms (if threshold exceeded)
    ↓
Save to MongoDB (SensorReading)
    ↓
Update latestReadings cache
    ↓
Broadcast to WebSocket clients (NEW_READING)
```

**Broadcast Message Format**:

```javascript
{
  type: 'NEW_READING',
  data: {
    mac: '00:11:22:33:44:55',
    humidity: 65.2,
    insideTemperature: 28.5,
    // ... all sensor fields
    timestamp: '2025-02-06T18:05:55Z'
  },
  timestamp: '2025-02-06T18:05:55Z'
}
```

---

### 6.5 WebSocket Server (ws module)

**Purpose**: Real-time bidirectional communication with frontend

**Server Setup**:

```javascript
const wss = new WebSocket.Server({ port: 8080 });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  wsClients.add(ws);

  // Send welcome + device status
  ws.send({...});

  ws.on('message', (data) => {
    // Handle frontend messages
    // e.g., DIALOG_RESPONSE
  });

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});
```

**Message Types**:

| Type                | Direction       | Purpose                        |
| ------------------- | --------------- | ------------------------------ |
| **CONNECTED**       | Server → Client | Client connection confirmation |
| **DEVICES_STATUS**  | Server → Client | Current connected devices list |
| **NEW_READING**     | Server → Client | New sensor data from device    |
| **TEST_STATUS**     | Server → Client | Test execution progress        |
| **STEP_RESULT**     | Server → Client | Individual step completion     |
| **DIALOG_PROMPT**   | Server → Client | Request user confirmation      |
| **DIALOG_RESPONSE** | Client → Server | User's dialog response         |
| **ALARM_TRIGGERED** | Server → Client | Threshold alarm event          |

---

### 6.6 Authentication System

**JWT Token Flow**:

```
1. User Login (POST /api/login)
   ├─ Username + Password
   └─ Verify (admin or DB)

2. Token Generation
   ├─ Claims: { username, role }
   ├─ Secret: process.env.JWT_SECRET
   └─ Expire: 2 hours

3. Token Storage (Frontend)
   └─ localStorage as 'authToken'

4. API Requests (with token)
   ├─ Authorization: Bearer {token}
   └─ Server verifies signature

5. Token Validation
   ├─ Check expiration
   ├─ Verify signature
   └─ Allow or deny request
```

**Password Security**:

```javascript
// Registration
const hashedPassword = await bcrypt.hash(password, 10);
user.password = hashedPassword;

// Login
const isMatch = await bcrypt.compare(password, user.password);
```

---

### 6.7 Utility Functions (`utils/time.js`)

**Main Export**: `getFormattedDateTime()`

**Returns**: `String` - ISO datetime format with timezone

**Usage**:

```javascript
const { getFormattedDateTime } = require("../utils/time");

// Timestamp for logs
console.log(`Log at: ${getFormattedDateTime()}`);

// Timestamp in sensor readings
const timestamp = getFormattedDateTime();

// Filename generation
const reportFile = `${getFormattedDateTime().replace(/:/g, "_")}_${mac}.rpt`;
```

---

## 7. Communication Protocols

### 7.1 TCP Device Communication

**Protocol**: Custom binary/ASCII format

**Connection**:

- **Server Port**: 9999
- **Device Initiates**: Connection from PDU/iMoni/Fan to server
- **Keep-Alive**: Continuous data stream

**Packet Structure** (Device → Server):

```
Header: [Device Type Code][MAC Address]
Data: [Sensor1]=value1 [Sensor2]=value2 ...
Terminator: \n or specific end-of-frame marker

Example:
TYPE:IMONI,MAC:00:11:22:33:44:55,TEMP:25.5,HUMID:65.2,VOLT:48.5,LOCK:locked
```

**Data Flow**:

```
1. Device connects to server:9999
2. Sends identification packet (MAC, device type)
3. Server records in atsRuntime.connectedDevices
4. Device streams sensor data periodically
5. Server parses each packet
6. Updates SensorReading model
7. Broadcasts on WebSocket
8. Device maintains connection until disconnect/error
```

**Error Handling**:

- Malformed packets → Logged, discarded
- Connection drop → Device re-connects automatically
- Timeout → Mark device as offline

---

### 7.2 REST API Communication

**Protocol**: HTTP/JSON

**Base URL**: `http://localhost:5000`

**Headers**:

```
GET /api/endpoint
Content-Type: application/json
Authorization: Bearer {jwt_token}
```

**Status Codes**:

| Code | Meaning      | Common Causes            |
| ---- | ------------ | ------------------------ |
| 200  | OK           | Success                  |
| 201  | Created      | Resource created         |
| 400  | Bad Request  | Invalid parameters       |
| 401  | Unauthorized | Missing/invalid token    |
| 403  | Forbidden    | Admin password required  |
| 404  | Not Found    | Resource doesn't exist   |
| 500  | Server Error | Database or server error |

**Error Response Format**:

```json
{
  "error": "Human readable error message"
}
```

---

### 7.3 WebSocket Communication

**Protocol**: WebSocket (ws://)

**Server**: `ws://localhost:8080`

**Message Format**:

```json
{
  "type": "MESSAGE_TYPE",
  "data": { /* payload */ },
  "timestamp": "ISO_datetime",
  "clientsCount": number
}
```

**Connection Lifecycle**:

```
1. Frontend connects: ws = new WebSocket('ws://localhost:8080')
2. Server broadcasts CONNECTED message
3. Server sends DEVICES_STATUS
4. Client subscribes to events
5. Server sends NEW_READING for each sensor packet
6. Client sends DIALOG_RESPONSE when needed
7. Connection maintained until close
8. Auto-reconnect on disconnect (frontend responsibility)
```

**Real-time Event Examples**:

```javascript
// Sensor reading
{
  "type": "NEW_READING",
  "data": {
    "mac": "00:11:22:33:44:55",
    "humidity": 65.2,
    "insideTemperature": 28.5,
    "alarmTriggered": false
  }
}

// Test progress
{
  "type": "TEST_STATUS",
  "data": {
    "testId": "test123",
    "currentStep": 2,
    "totalSteps": 5,
    "stepName": "Check Voltage",
    "status": "running",
    "progress": 40
  }
}

// Alarm event
{
  "type": "ALARM_TRIGGERED",
  "data": {
    "mac": "00:11:22:33:44:55",
    "alarmType": "insideTemperatureAlarm",
    "threshold": { "max": 55 },
    "currentValue": 58.3
  }
}
```

---

## 8. Business Logic & Workflows

### 8.1 Device Connection Workflow

```
┌─────────────────────────────────────────────────┐
│ Device Powering Up                              │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Device Initiates TCP Connection to Server:9999  │
│ Sends: MAC:00:11:22:33:44:55, DeviceType:iMoni │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Server TCP Handler Receives Connection          │
│ (socket.on('connection', ...))                  │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Server Extracts Device MAC from Handshake       │
│ Stores in: atsRuntime.connectedDevices.set()    │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Broadcast "DEVICES_STATUS" via WebSocket        │
│ Update frontend: Connected devices list         │
│ to: wsClients                                   │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Device Ready for Test/Data Acquisition          │
│ Maintains TCP connection for:                   │
│ - Sending sensor data                           │
│ - Receiving commands                            │
│ - Test execution                                │
└─────────────────────────────────────────────────┘
```

### 8.2 Sensor Data Collection & Alarm Workflow

```
Device TCP Connection Active
    ▼
Device Sends Sensor Packet (periodically)
    │ Format: temp=25.5,humid=65.2,volt=48.5,...
    │
    ▼
Server Parses Packet
    │ Extract: humidity, temperature, voltage, etc.
    │
    ▼
Check Each Field Against Thresholds
    ▼
    ├─ insideTemperature: 25.5°C (OK: 0-55°C) ✓
    ├─ humidity: 65.2% (OK: 20-80%) ✓
    ├─ inputVoltage: 48.5V (OK: 40-65V) ✓
    └─ outputVoltage: 54.2V (ALERT: 45-55V) ✗
    │        └─ Set: outputVoltageAlarm = true
    │
    ▼
Save SensorReading to MongoDB
    └─ Document includes alarm flags
    │
    ▼
Update latestReadings Cache (in-memory)
    │
    ▼
Broadcast to All WebSocket Clients
    │ Message Type: NEW_READING
    │ Includes: all sensor values + alarm flags
    │
    ▼
Frontend Receives & Updates Dashboard
    ├─ Displays readings
    └─ Highlights triggered alarms (red)
    │
    ▼
Frontend May Trigger Alert Notification
    └─ Audio/visual alarm for operator
    │
    ▼
Repeat (Next Sensor Packet)
```

### 8.3 Test Execution Workflow

```
┌─────────────────────────────────────────────────┐
│ 1. Frontend Requests: POST /api/tests/run       │
│    Payload:                                      │
│    {                                             │
│      mac: "00:11:22:33:44:55",                 │
│      testFiles: ["test1.srv", "test2.srv"]     │
│    }                                             │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 2. Server Validates                             │
│    - Device connected? (check atsRuntime)       │
│    - Test files exist?                          │
│    - No other test running?                     │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 3. ATS Runner Starts                            │
│    - Set waiting MAC: atsRuntime.setTestWait    │
│    - Reset stop flag: atsRuntime.resetStop()    │
│    - Begin test iteration                       │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 4. For Each Test File                           │
│    a) Read .srv file                            │
│    b) Parse configuration                       │
│    c) Extract steps                             │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 5. For Each Step in Test                        │
│    a) Send DIALOG_PROMPT to frontend            │
│       (WebSocket: "Step 1: Read Temperature")   │
│    b) Send command to device via TCP            │
│       (e.g., "GET_TEMP$2025-02-06T18:05:55$")  │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 6. Wait for Device Response                     │
│    Timeout: waitTime (default 20s)              │
│    Check received value:                         │
│    - Match expected pattern?                     │
│    - Within expected range?                      │
│    - Value increased by expected amount?         │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 7. Step Result Determination                    │
│    ├─ Response received in time?                │
│    │  Yes: Compare value
│    │   ├─ Match: Step PASSED ✓
│    │   └─ Mismatch: Step FAILED ✗
│    │
│    └─ No response (timeout):                    │
│       └─ Step FAILED ✗
│
│    Capture screenshot (if cameraUrl)            │
│    Send STEP_RESULT via WebSocket               │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 8. Handle Step Failure (if applicable)          │
│    Check continueOnFail flag:                   │
│    ├─ If 0: Stop test, fail entire test         │
│    └─ If 1: Continue to next step               │
│
│    Check retryCount:                            │
│    ├─ If > 0: Retry this step                   │
│    └─ Otherwise: Continue                       │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 9. Aggregate Results                            │
│    - Determine test Pass/Fail                   │
│    - Calculate total duration                   │
│    - Compile all step results                   │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 10. Generate Report                             │
│     - Write .rpt file (testResult/)             │
│     - Create .xlsx if requested                 │
│     - Include all step details                  │
│     - Include screenshots                       │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 11. Send Test Complete Message to Frontend      │
│     WebSocket Type: TEST_COMPLETE              │
│     Include: results[], reportPath, duration   │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 12. Cleanup                                      │
│     - Clear waiting MAC: atsRuntime.clearTest   │
│     - Reset stop flag: atsRuntime.resetStop()   │
│     - Close device command channel              │
│     - Wait for next test or user action         │
└─────────────────────────────────────────────────┘
```

### 8.4 User Authentication Workflow

```
┌─────────────────────────────────────────────────┐
│ Frontend: Login Form                            │
│ User enters: username, password                 │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ POST /api/login                                 │
│ Payload: { username, password }                │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Server Checks: Is Admin?                        │
│ Compare vs process.env.ADMIN_USERNAME/PASSWORD │
└──────────────┬──────────────────────────────────┘
        ┌──────┴──────┐
        │             │
        YES            NO
        │              │
        ▼              ▼
    ┌───────┐     ┌──────────────────┐
    │ Admin │     │ Query MongoDB    │
    │ Login │     │ User collection  │
    └───┬───┘     └────────┬─────────┘
        │                  │
        └──────────┬───────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ User Found?          │
        └┬─────────────────────┘
        │
        ├─ YES: ▼
        │   ┌──────────────────────┐
        │   │ Verify Password      │
        │   │ bcrypt.compare()     │
        │   └┬─────────────────────┘
        │    │
        │    ├─ MATCH: ▼
        │    │   ┌─────────────────────────────┐
        │    │   │ Generate JWT Token          │
        │    │   │ Claims: {username, role}    │
        │    │   │ Secret: JWT_SECRET          │
        │    │   │ Expire: 2 hours             │
        │    │   └────────────┬────────────────┘
        │    │                │
        │    │                ▼
        │    │   ┌──────────────────────────────┐
        │    │   │ Return Token to Frontend     │
        │    │   │ Response: {role, token}      │
        │    │   └┬─────────────────────────────┘
        │    │    │
        │    │    └─▶ Frontend saves token
        │    │        localStorage.token
        │    │
        │    └─ MISMATCH: ▼
        │        Return 401 Unauthorized
        │
        └─ NO: ▼
            Return 401 Unauthorized

┌─────────────────────────────────────────────────┐
│ Frontend: Use Token for API Calls              │
│ Header: Auth: Bearer {token}                    │
│ Server validates token on each request          │
│ If expired/invalid → 401 → Trigger new login   │
└─────────────────────────────────────────────────┘
```

---

## 9. Error Handling & Debugging

### 9.1 Debug System

**Location**: Integrated in `server_ats.js`

**Debug Features**:

```javascript
const debug = {
  enabled: true,              // Global toggle

  log(message, context),      // Info logging
  error(message, error),      // Error logging

  stats: {
    serverTime,               // Current server time
    upTime,                   // Process uptime
    packetReceived,           // Total packets
    errors,                   // Error count
    lastPacket,              // Time since last packet
    bufferStats: {
      totalBytes,            // Total bytes received
      discardedBytes,        // Malformed packets
      malformedPackets       // Count of bad packets
    },
    connectedDevices,        // Active device count
    latestReadingsCount,     // Cached readings
    websocketClients         // Active WS connections
  },

  healthCheck(): {
    status: "HEALTHY|ISSUES",
    issues: []               // Array of problems
  }
}
```

**Logging Examples**:

```javascript
// Info log
debug.log("Test started", `MAC: ${mac}`);
// Output: 🔍 [2025-02-06T18:05:55Z] Test started | MAC: 00:11:22:33:44:55

// Error log
debug.error("Connection failed", error);
// Output: ❌ [2025-02-06T18:05:55Z] Connection failed | Error: ECONNREFUSED

// Stats
debug.stats();
// Output: 📊 DEBUG STATS: { serverTime, upTime, packetReceived, ... }

// Health check
debug.healthCheck();
// Output: { status: "HEALTHY|ISSUES", issues: [...] }
```

### 9.2 Common Errors & Solutions

| Error                             | Cause                  | Solution                                                |
| --------------------------------- | ---------------------- | ------------------------------------------------------- |
| **ECONNREFUSED** (port 5000/8080) | Server not running     | Check if `npm start` or `node server_ats.js` is running |
| **MongoDB connection error**      | Database unreachable   | Check MONGO_URI in .env, verify MongoDB is running      |
| **JWT verification failed**       | Token expired/invalid  | User needs to login again                               |
| **Device not connected**          | TCP socket error       | Device must connect to server:9999 first                |
| **No packets received**           | Device offline         | Check device network connection, verify IP settings     |
| **Malformed packet**              | Data parsing error     | Check device data format, verify TCP protocol           |
| **Test timeout**                  | Device slow to respond | Increase waitTime in .srv file                          |
| **File not found**                | Invalid test path      | Verify test file exists in tests/{type}/ directory      |

### 9.3 Monitoring & Troubleshooting

**Health Check Endpoint**:

```bash
curl http://localhost:5000/ping
# Response: pong (if healthy)
# or: MongoDB unreachable (if DB error)
```

**WebSocket Status Check**:

```bash
curl http://localhost:5000/api/websocket-test
# Response: { status, port, clients, features }
```

**Debug Output Monitoring**:

```bash
# Watch server logs
tail -f server.log

# Key indicators to watch:
🔌 WebSocket client connected
✅ WebSocket server running
📊 DEBUG STATS
❌ Errors logged
🚀 Test started
✓ Test completed
```

---

## 10. Configuration & Environment Setup

### 10.1 Environment Variables

**File**: `.env`

```bash
# MongoDB Connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# JWT Authentication
JWT_SECRET=your_jwt_secret_key_min_32_chars

# Admin Credentials (hardcoded for admin login)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin_password_123

# Server Ports
HTTP_PORT=5000
WS_PORT=8080
TCP_PORT=9999

# Node Environment
NODE_ENV=production  # or development

# Optional: Database name
DB_NAME=ats_system

# Optional: Timezone
TZ=Asia/Kolkata
```

### 10.2 Server Startup

**Start Main Server**:

```bash
cd server
npm install                    # Install dependencies
node server.js               # Start user data server (port 5000)
```

**Start ATS Server**:

```bash
cd server
npm install
node server_ats.js          # Start ATS + WebSocket + TCP (ports 5000, 8080, 9999)
```

**Development (with auto-reload)**:

```bash
npm install -g nodemon
nodemon server_ats.js
```

### 10.3 Port Configuration

| Port     | Service             | Purpose                                         |
| -------- | ------------------- | ----------------------------------------------- |
| **5000** | Express REST API    | HTTP endpoints for all operations               |
| **8080** | WebSocket Server    | Real-time communication with frontend           |
| **9999** | TCP Device Listener | Incoming connections from PDU/iMoni/Fan devices |

### 10.4 Database Setup

**MongoDB Atlas (Cloud)**:

1. Create cluster on mongodb.com
2. Create database user
3. Whitelist IP address
4. Get connection string
5. Set in `.env` as MONGO_URI

**MongoDB Local**:

```bash
# Install MongoDB Community Edition
mongod --dbpath /data/db

# Connection string:
# MONGO_URI=mongodb://localhost:27017/ats_system
```

**Collections Created Automatically**:

- `users` - User authentication
- `devices` - Device metadata
- `sensorreadings` - Sensor data history

### 10.5 File Structure for Deployment

```
/var/www/ats/
├── server/
│   ├── .env                  # Secrets (not in git)
│   ├── server_ats.js         # Main entry point
│   ├── package.json
│   ├── node_modules/
│   ├── models/
│   ├── ATS/
│   ├── tests/
│   ├── testResult/           # Generated reports
│   └── public/               # Static files (if any)
└── logs/
    ├── server.log            # Application logs
    └── errors.log            # Error logs
```

### 10.6 Performance Tuning

**Recommendations**:

1. **Database Indexing**:

   ```javascript
   // Add indexes in MongoDB:
   db.devices.createIndex({ mac: 1 });
   db.sensorreadings.createIndex({ mac: 1, timestamp: -1 });
   ```

2. **WebSocket Optimization**:
   - Use `perMessageDeflate: false` for bandwidth
   - Limit broadcast frequency (e.g., max 10/sec)
   - Remove inactive clients after timeout

3. **In-Memory Cache**:
   - Keep only latest 1000 readings in latestReadings
   - Implement LRU eviction policy

4. **TCP Connection Management**:
   - Use connection pooling
   - Implement graceful disconnect handling
   - Monitor for hanging connections

### 10.7 Security Best Practices

1. **Environment Variables**:
   - Never commit `.env` to version control
   - Use minimum permission secretes
   - Rotate JWT secrets periodically

2. **Authentication**:
   - Enforce strong password policy
   - Implement rate limiting on login
   - Log all authentication attempts

3. **API Security**:
   - Enable CORS only for known origins
   - Validate all input parameters
   - Implement request rate limiting
   - Use HTTPS in production

4. **Database Security**:
   - Use MongoDB Atlas IP whitelisting
   - Enable authentication on local MongoDB
   - Regular backups
   - Encryption at rest

---

## Appendix A: Development Workflow

### A.1 Adding New API Endpoint

```javascript
// 1. Define in server_ats.js
app.post("/api/new-endpoint", async (req, res) => {
  try {
    const { param1, param2 } = req.body;

    // Validation
    if (!param1) {
      return res.status(400).json({ error: "param1 required" });
    }

    // Business logic
    const result = await SomeModel.find({ /* ... */ });

    // Response
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Test endpoint
curl -X POST http://localhost:5000/api/new-endpoint \
  -H "Content-Type: application/json" \
  -d '{"param1": "value1", "param2": "value2"}'
```

### A.2 Adding New Test Type

```
1. Create test file: tests/{type}/new_test.srv

2. Update atsRunner.js to handle new test type

3. Create step handlers for device-specific logic

4. Test with: POST /api/tests/run
   {
     "mac": "00:11:22:33:44:55",
     "testFiles": ["new_test.srv"]
   }
```

### A.3 Debugging Test Execution

```javascript
// Add detailed logging in atsRunner
console.log(`Step ${stepNumber}:`);
console.log(`  Command: ${command}`);
console.log(`  Waiting for: ${waitFor}`);
console.log(`  Expected: ${expectedValue}`);
console.log(`  Received: ${receivedValue}`);
console.log(`  Result: ${passed ? "PASS" : "FAIL"}`);
```

---

## Appendix B: API Quick Reference

```bash
# Health Check
curl http://localhost:5000/ping

# Login
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"pass"}'

# Get connected devices
curl http://localhost:5000/api/devices

# Get sensors readings
curl "http://localhost:5000/api/readings?mac=00:11:22:33:44:55"

# Run test
curl -X POST http://localhost:5000/api/tests/run \
  -H "Content-Type: application/json" \
  -d '{"mac":"00:11:22:33:44:55","testFiles":["test1.srv"]}'

# Stop test
curl -X POST http://localhost:5000/api/tests/stop

# Get available tests
curl http://localhost:5000/api/tests/list
```

---

**Document Version**: 1.0  
**Last Updated**: February 6, 2025  
**Author**: Backend Architecture Team  
**Status**: Complete & Ready for Review
