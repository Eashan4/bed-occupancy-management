# Comprehensive Technical Analysis: NeuroGuard Clinic AIoT System

This document provides a deep, code-level analysis of the NeuroGuard Clinic AIoT project, detailing its internal mechanics, architectural choices, and algorithms across the firmware, backend, and frontend layers.

---

## 1. Executive Codebase Summary

The project is structured as a full-stack, distributed IoT application containing three main components:
- `backend/`: A highly concurrent Python **FastAPI** application managing REST endpoints, WebSocket streaming, serial ingestion, background timing loops, and a rule-based AI engine.
- `firmware/esp8266_monitor/`: C++ Arduino code running on an **ESP8266** (NodeMCU), responsible for I2C data acquisition from a MAX30102 sensor, physical button debouncing, and robust Wi-Fi failover handling.
- `frontend/`: A modern **React** application (packaged with Vite) rendering a real-time dashboard with dynamic 2D/3D visualizations and state-managed alert tracking.

---

## 2. Firmware Diagnostics (`esp8266_monitor.ino`)

The firmware operates as the edge data acquisition node. It uses the `MAX30105.h` (SparkFun) library to query the MAX30102 over I2C hardware pins D1 (SCL) and D2 (SDA).

### 2.1 Heart Rate (IR Peak) Detection Algorithm
Instead of relying solely on built-in library calculations, the firmware implements a custom adaptive peak detection algorithm:
- It maintains a sliding minimum (`irMin`) and maximum (`irMax`) over the incoming IR signal, decaying these bounds gradually to track the AC component of the blood flow.
- A true heartbeat is recorded only if a peak is detected above the dynamic mid-point and the refractory period (`lastBeatMs > 260` ms) is respected (preventing double-counting).
- A 6-slot rolling buffer `bpmBuffer[6]` averages the instant BPMs to smooth the output before transmission.

### 2.2 SpO₂ Calculation (Ratio of Ratios)
- It separates the DC and AC components of the Red and IR LEDs using an exponential moving average (`0.95 * old + 0.05 * new`).
- After 25 valid samples, it calculates the RMS components to derive the 'R' ratio, applying a calibrated quadratic curve: `(-45.060 * R^2) + (30.354 * R) + 94.845` to determine the blood oxygen saturation percentage.

### 2.3 Resiliency and Failover (State Machine)
- **Debounced Occupancy Button:** Uses a 5-second lockout (`BUTTON_DEBOUNCE_MS = 5000`) on `INPUT_PULLUP` to toggle `currentBedStatus`, guaranteeing no bouncing when a physical button is pressed.
- **Auto-Fallover:** If 5 consecutive HTTP POST submissions fail (`consecutiveFailures >= MAX_FAILURES`), the device purposefully drops the Wi-Fi connection and forces a complete stack re-initiation. It also gracefully handles Serial (Offline) fallback commands.

---

## 3. Backend Architecture (`main.py`)

The backend is built around `FastAPI`, using `uvicorn` as the ASGI server. It employs highly aggressive concurrent handling to deal with live streams and database locks.

### 3.1 Concurrent Serial Ingestion & Websocket Broadcasting
- **Background Serial Threading:** The application offloads direct serial `.readline()` calls to a background POSIX thread (`_serial_read_thread`) so the main event loop isn't blocked.
- **Throttling SQLite/PostgreSQL:** To prevent locking the database during rapid sensor streaming (10 FPS), the firmware persists data to the SQL DB only once every 2 seconds (`now - last_db_save < 2.0`), while simultaneously pushing *every* tick to the WebSocket `ConnectionManager` asynchronously (`ws_manager.broadcast()`).

### 3.2 Scheduled Background Jobs (`apscheduler`)
Two critical `AsyncIOScheduler` background jobs ensure system state accuracy:
1. `check_offline_devices()`: Runs every 10s. Iterates over devices. If `last_seen` is older than 20 seconds (`HEARTBEAT_TIMEOUT`), it marks the device offline and automatically generates an alert entity.
2. `auto_escalate_alerts()`: Runs every 60 seconds to find 'new' alerts and escalates them if nurses haven't acknowledged them in a timely manner.

### 3.3 Database ORM Layer
Implemented via SQLAlchemy `SessionLocal`, utilizing 6 interconnected tables:
- `devices` tied by Foreign Keys to `sensor_data` (storing time-series vital stats) and `alerts`. Patient tracking is linked via `device_id` constraints.

---

## 4. Deep Dive: AI Anomaly Detection Engine

The `AnomalyDetector` operates on the backend using NumPy to provide real-time stream analysis. It maintains a sliding buffer (`self.data_buffer`) truncated by `PREDICTION_WINDOW`.

The engine operates via a **6-Layer Waterfall Matrix:**
1. **Critical Base Test:** Immediate trap if SpO₂ drops strictly below critical bounds (<90%).
2. **Warning Base Test:** Trap if SpO₂ is between 90-94%.
3. **Tachycardia Trap:** Heart rate exceeds bounds (> `HEART_RATE_HIGH`).
4. **Bradycardia Trap:** Heart rate drops below bounds (< `HEART_RATE_LOW`).
5. **Erratic Sliding Window Matrix:** 
   * Reads the last 5 buffer ticks. If SpO₂ drops by more than > 8% instantly, flags an `anomaly`.
   * Evaluates standard deviation (`np.std`) of HR over 5 ticks. If variance > 25, flags erratic heartbeat `anomaly`.
6. **Continuous Decline Routine:** Requires 10 consecutive ticks inside the buffer. Checks if $SpO_{2}(t) \geq SpO_{2}(t+1)$ uniformly. If the total unmitigated drop exceeds 5%, an early-warning decline alert is raised.

---

## 5. Frontend Visual Layout (`FloorPlan.jsx`)

The dashboard features physical facility mapping through component-based rendering:
- **`FloorPlan` Logic:** Dynamically groups `devices` into "Blocks" (e.g., Ward A, B) mapped by `ward`. It automatically fills missing beds with empty placeholder visuals (up to 6 per block).
- **Status Computation:** The `getBedStatus` resolver acts as a lightweight client-side twin. It pulls `latestVitals` from the WebSocket hook context, returning `critical`, `warning`, `stable`, or `offline/empty`.
- **Dynamic Tooltips:** Calculating tooltip render positions directly utilizing `HandleMouseMove` (`e.clientX` offset mapping) for real-time hover cards displaying patient name, BPM, and SpO₂ floating natively above the React shapes.

---

## 6. Security and Authentication Implementations

- **JSON Web Tokens (JWT):** The frontend relies on HTTP `Authorization: Bearer <T>` tokens hashed using `passlib(bcrypt)` over the `JWT_SECRET`. It inherently checks `sub` and `role`. 
- **Header API Keys:** Devices strictly authenticate via the custom mapped `x-api-key` header intercept dependency (`verify_api_key`) in FastAPI. Using Python `uuid`, each device securely receives a 64-character token during registration.
- **Audit Logging Framework:** High-level nurse/admin actions (e.g., Device Registration, User creation) do a `db.flush()` on an `AuditLog` model referencing the user's explicit token `sub` for complete trace compliance.
