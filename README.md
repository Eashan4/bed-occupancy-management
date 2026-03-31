# 🏥 Hospital IoT — Bed Occupancy & Patient Vital Monitoring System

A production-grade, real-time IoT-based hospital monitoring system that tracks **bed occupancy** and **patient vitals** (heart rate, SpO₂) using ESP8266 microcontrollers and MAX30100 sensors. Features an AI-powered anomaly detection engine, WebSocket live streaming, and a premium 3D animated dashboard.

> Scalable to **100+ concurrent devices** with clean modular architecture.

---

## 📋 Table of Contents

- [Features](#-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
  - [Running Locally](#running-locally)
- [Hardware Setup (ESP8266)](#-hardware-setup-esp8266)
  - [Components Required](#components-required)
  - [Wiring Diagram](#wiring-diagram)
  - [Flashing Firmware](#flashing-firmware)
- [Dashboard Pages](#-dashboard-pages)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
  - [Vercel (Serverless)](#vercel-serverless)
  - [Docker](#docker)
- [Security](#-security)
- [License](#-license)

---

## ✨ Features

### Core System
- 🔌 **Device Management** — Register, monitor, and manage ESP8266 IoT devices from the dashboard
- 📡 **Real-time Streaming** — WebSocket-based live data broadcast to all connected dashboard clients
- 🤖 **AI Anomaly Detection** — Rule-based engine (LSTM-ready) detects abnormal heart rate, SpO₂ drops, and erratic patterns
- ⚠️ **Smart Alert Engine** — Auto-generated alerts with severity levels (low/medium/high/critical) and escalation tracking
- 🔐 **JWT Authentication** — Secure login with role-based access (admin/nurse)
- 📊 **CSV Export** — Export patient vitals history for any device

### Dashboard
- 🏗️ **3D Hospital Floor Plan** — Interactive bed visualization with color-coded status (green/yellow/red/grey)
- 💓 **Live Heartbeat Waveform** — Animated real-time ECG-style display
- 🎯 **SpO₂ Circular Gauge** — Animated oxygen saturation indicator
- 🌙 **Theme Switcher** — Dark Mode, Medical Blue, Emergency Red
- 🔔 **Toast Notifications** — Real-time alert popups
- 📱 **Responsive Design** — Glassmorphism panels with micro-animations

### Device Layer
- 📶 **Auto WiFi Reconnect** — Automatic retry on connection loss
- 🔑 **API Key Authentication** — Each device has a unique 64-character API key
- 💗 **Heartbeat Monitoring** — Devices marked offline if no heartbeat within 20 seconds
- 🔄 **Failure Recovery** — Auto WiFi reconnect after 5 consecutive HTTP failures

---

## 🏗️ System Architecture

```mermaid
---
config:
  layout: dagre
---
graph LR
  classDef hard fill:#f5f5f5,stroke:#424242,stroke-width:2px,color:#000;
  classDef edge fill:#c5e1a5,stroke:#33691e,stroke-width:2px,color:#000;
  classDef net fill:#b3e5fc,stroke:#0277bd,stroke-width:2px,color:#000;
  classDef back fill:#bbdefb,stroke:#0d47a1,stroke-width:2px,color:#000;
  classDef core fill:#ffe082,stroke:#ff6f00,stroke-width:2px,color:#000;
  classDef auth fill:#ef9a9a,stroke:#b71c1c,stroke-width:2px,color:#000;
  classDef vis fill:#e1bee7,stroke:#4a148c,stroke-width:2px,color:#000;
  classDef db fill:#ffcc80,stroke:#e65100,stroke-width:2px,color:#000;

  subgraph Edge["1. Hardware / Edge Layer"]
    direction TB
    MAX["MAX30102<br/>(HR & SpO2)"]:::hard
    FSR["FSR 402<br/>(Bed Pressure)"]:::hard
    BTN["Push Button<br/>(Manual Toggle)"]:::hard
    ESP["ESP8266 NodeMCU<br/>(Microcontroller)"]:::edge
    
    MAX -- "I2C" --> ESP
    FSR -- "ADC" --> ESP
    BTN -- "GPIO" --> ESP
  end

  subgraph Ingestion["2. Ingestion & Security"]
    direction TB
    WiFi["WiFi Module<br/>(HTTP Client)"]:::net
    SerialRx["Serial COM<br/>(Offline Mode)"]:::net
    Auth{"API Key / JWT<br/>Middleware"}:::auth

    ESP -- "JSON POST" --> WiFi
    ESP -. "115200 Baud" .-> SerialRx
    WiFi ==> Auth
  end

  subgraph Processing["3. Application Layer (FastAPI)"]
    direction TB
    Router["REST API<br/>(/api/device/data)"]:::back
    SerialTh["Background Thread<br/>(_serial_read_thread)"]:::back
    Sched["APScheduler<br/>(Timeouts/Escalation)"]:::back
    AI{"AI Anomaly Engine<br/>(Rule-based Matrices)"}:::core

    Auth --> Router
    SerialRx --> SerialTh
    Router --> AI
    SerialTh --> AI
  end

  subgraph Storage["4. State & Communication"]
    direction TB
    DB[("PostgreSQL DB<br/>(SQLAlchemy ORM)")]:::db
    WS(("WebSocket Server<br/>(ws_manager)")):::net

    Router -- "Throttled Write" --> DB
    SerialTh -- "Throttled Write" --> DB
    Sched -- "Query & Timeout" --> DB
    
    AI -- "Inject Alerts" --> DB
    
    AI -- "Instant Alert Fire" ---> WS
    Router -- "Timeout Broadcast" --> WS
    SerialTh -- "Timeout Broadcast" --> WS
    Sched -- "Timeout Broadcast" --> WS
  end

  subgraph Dashboard["5. Visualization Layer (React)"]
    direction TB
    Client["React App Hook<br/>(useWebSocket)"]:::vis
    Three["3D Floorplan<br/>(Color-coded Status)"]:::vis
    VitalUI["Live Vitals UI<br/>(Waveforms & Gauges)"]:::vis
    AlertUI["Alert Manager<br/>(Toast Notifications)"]:::vis

    WS == "Live Data Sync"==> Client
    Client --> Three
    Client --> VitalUI
    Client --> AlertUI
  end
```

### Data Flow
1. **ESP8266** reads sensors (MAX30100 + pressure) and sends data via `POST /api/device/data`
2. **Backend** stores data in PostgreSQL, runs AI anomaly check
3. If anomaly detected → creates alert → broadcasts via **WebSocket**
4. **Dashboard** receives real-time updates and renders live vitals, floor plan, alerts

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Microcontroller** | ESP8266 (NodeMCU) |
| **Sensors** | MAX30100 (Heart Rate + SpO₂), FSR 402 (Bed Pressure) |
| **Backend** | Python 3.9+, FastAPI, SQLAlchemy, Uvicorn |
| **Database** | PostgreSQL (Supabase hosted) |
| **Frontend** | React 19, Vite, TailwindCSS (optional), Lucide |
| **Charts** | Chart.js & React-Chartjs-2 |
| **3D Visuals** | Three.js (if applicable) |
| **Real-time** | WebSocket via Socket.io-client / Native WebSockets |
| **AI** | NumPy (rule-based, LSTM-ready) |
| **Auth** | JWT (python-jose), bcrypt |
| **Deployment** | Vercel (serverless), Docker |

---

## 📁 Project Structure

```
hospital-iot/
│
├── backend/                    # FastAPI backend application
│   ├── main.py                 # All routes, WebSocket, scheduler, AI engine
│   ├── config.py               # Environment-based configuration
│   ├── database.py             # SQLAlchemy engine & session factory
│   ├── models.py               # ORM models
│   ├── migrate.py              # Database migration & admin seeding script
│   └── requirements.txt        # Python dependencies
│
├── frontend/                   # React + Vite Frontend
│   ├── src/                    # React components, pages, context
│   ├── public/                 # Static assets
│   ├── package.json            # Node dependencies
│   └── vite.config.js          # Vite configuration
│
├── firmware/                   # ESP8266 Arduino firmware
│   └── esp8266_monitor/
│       ├── esp8266_monitor.ino  # Main firmware (WiFi, sensors, HTTP POST)
│       └── config.h             # Device-specific configuration (WiFi, API key, server URL)
│
├── api/                        # Vercel serverless entry point
│   └── index.py                # Imports FastAPI app for Vercel
│
├── schema.sql                  # PostgreSQL database schema (6 tables)
├── requirements.txt            # Root-level dependencies (for Vercel build)
├── vercel.json                 # Vercel deployment configuration
├── docker-compose.yml          # Docker setup (PostgreSQL + Backend + Nginx)
├── .env                        # Environment variables (not in git)
└── .gitignore                  # Git ignore rules
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.9+**
- **pip** (Python package manager)
- **PostgreSQL** database (local or [Supabase](https://supabase.com) free tier)
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/Eashan4/hospital-iot.git
cd hospital-iot

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt
```

### Database Setup

1. **Create a PostgreSQL database** (or use [Supabase](https://supabase.com) free tier)

2. **Configure environment variables** — create a `.env` file in the project root:

```env
# Database (PostgreSQL connection URL)
DATABASE_URL=postgresql://username:password@host:5432/dbname

# JWT secret (use a random string)
JWT_SECRET=your-super-secret-key

# Device timing
HEARTBEAT_TIMEOUT=20
OFFLINE_CHECK_INTERVAL=10
```

3. **Run the migration** to create tables and seed the admin user:

```bash
cd backend
python3 migrate.py
```

This creates 6 tables: `devices`, `sensor_data`, `alerts`, `patients`, `users`, `audit_logs` and seeds a default admin user.

### Running Locally

1. **Start the Backend:**
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

2. **Start the Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open your browser: **http://localhost:5173**

**Default login credentials:**
| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Admin |

---

## 🔧 Hardware Setup (ESP8266)

### Components Required

| Component | Quantity | Purpose |
|-----------|----------|---------|
| ESP8266 (NodeMCU) | 1 per bed | Microcontroller |
| MAX30100 | 1 per bed | Heart rate + SpO₂ sensor |
| FSR 402 | 1 per bed | Bed pressure (occupancy) sensor |
| 10kΩ Resistor | 1 per bed | Voltage divider for FSR |
| Breadboard + Jumper wires | — | Prototyping |

### Wiring Diagram

```
ESP8266 (NodeMCU)          MAX30100
─────────────────          ────────
D1 (GPIO5)  ───────────── SCL
D2 (GPIO4)  ───────────── SDA
3.3V        ───────────── VIN
GND         ───────────── GND

ESP8266 (NodeMCU)          FSR 402
─────────────────          ───────
A0          ───── ┤ Voltage Divider (FSR + 10kΩ) ├── 3.3V / GND
```

### Flashing Firmware

1. Open `firmware/esp8266_monitor/config.h` in Arduino IDE
2. Update the configuration:

```cpp
#define WIFI_SSID     "YourWiFiName"
#define WIFI_PASSWORD "YourWiFiPassword"
#define SERVER_URL    "http://YOUR_SERVER_IP:8000"
#define API_KEY       "YOUR_64_CHAR_API_KEY"
#define DEVICE_ID     "BED_BLOCK_A_01"
```

3. Install the required Arduino library: **MAX30100lib** by OXullo Intersecans
4. Select board: **NodeMCU 1.0 (ESP-12E Module)**
5. Upload the firmware

> **Note:** Get the API key by registering a device from the dashboard's **Devices** page.

---

## 📊 Dashboard Pages

### 1. Overview
- Real-time stats cards (Total Devices, Online, Bed Occupancy %, Active Alerts)
- Interactive 3D hospital floor plan with color-coded beds
- Device status grid

### 2. Device Management
- Register new devices (auto-assigns ward/bed)
- View all devices with status, last seen, patient info
- Delete devices (admin only)
- Regenerate API keys

### 3. Device Detail
- Live heart rate with animated ECG waveform
- SpO₂ circular gauge with real-time updates
- Bed occupancy indicator
- Heart rate & SpO₂ history charts
- Device alert history

### 4. Alerts
- Filterable alert list by severity
- Acknowledge alerts
- Alert types: `low_spo2`, `high_heart_rate`, `low_heart_rate`, `anomaly`, `device_offline`

### 5. AI Analytics
- Risk distribution chart
- Anomaly trends (24h)
- Alert timeline visualization

---

## 📡 API Reference

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/login` | Login, returns JWT token | None |
| `POST` | `/api/auth/register` | Register new user | Admin JWT |

### Device APIs (ESP8266 → Backend)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/device/data` | Send sensor readings | API Key |
| `POST` | `/api/device/heartbeat` | Send heartbeat ping | API Key |

### Dashboard APIs
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/device/register` | Register new device | JWT |
| `GET` | `/api/dashboard/devices` | List all devices | JWT |
| `GET` | `/api/dashboard/device/{id}` | Device detail + vitals | JWT |
| `GET` | `/api/dashboard/stats` | Overview statistics | JWT |
| `GET` | `/api/dashboard/alerts` | List alerts (filterable) | JWT |
| `PUT` | `/api/dashboard/alerts/{id}/acknowledge` | Acknowledge alert | JWT |
| `GET` | `/api/dashboard/export/{id}` | Export vitals as CSV | JWT |
| `POST` | `/api/device/{id}/regenerate-key` | Regenerate API key | JWT |
| `DELETE` | `/api/device/{id}` | Delete device | Admin JWT |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `ws://host:8000/ws/live` | Real-time sensor data & alert stream |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/init_db` | Initialize database tables (for serverless) |

---

## 🌐 Deployment

### Vercel (Serverless)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import `hospital-iot`
3. Set **Framework Preset** to `Other`
4. Add **Environment Variables**:
   - `DATABASE_URL` = your PostgreSQL connection URL
   - `JWT_SECRET` = your secret key
5. Click **Deploy**
6. Visit `https://your-app.vercel.app/api/init_db` once to initialize the database
7. Access dashboard at `https://your-app.vercel.app/`

> **Note:** WebSocket is not supported on Vercel serverless. The dashboard automatically falls back to HTTP polling (every 3 seconds).

### Docker

```bash
# Set environment variables in .env file, then:
docker-compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432
- **FastAPI backend** on port 8000
- **Nginx** serving the dashboard on port 80

---

## 🔒 Security

- **API Key Authentication** — Each ESP8266 device uses a unique 64-character API key
- **JWT Tokens** — Dashboard users authenticate with JWT (24-hour expiry)
- **Password Hashing** — bcrypt with automatic salting
- **CORS** — Configurable cross-origin policy
- **SQL Injection Protection** — SQLAlchemy ORM parameterized queries
- **Audit Logging** — All admin actions logged with timestamps
- **Environment Config** — Secrets stored in `.env` (excluded from git)

---

## 📈 Alert Thresholds

| Metric | Threshold | Severity |
|--------|-----------|----------|
| SpO₂ < 90% | Critical SpO₂ | 🔴 Critical |
| SpO₂ < 94% | Warning SpO₂ | 🟠 High |
| Heart Rate > 120 BPM | Tachycardia | 🟠 High |
| Heart Rate < 50 BPM | Bradycardia | 🟠 High |
| SpO₂ drop > 8% in 5 readings | Sudden drop | 🔴 Critical |
| HR std dev > 25 in 5 readings | Erratic pattern | 🟠 High |
| No heartbeat > 20 seconds | Device offline | 🟠 High |

---

## 🗄️ Database Schema

```
┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│   devices    │    │  sensor_data  │    │    alerts    │
├──────────────┤    ├───────────────┤    ├──────────────┤
│ id           │    │ id            │    │ id           │
│ device_id    │◄───│ device_id     │    │ device_id    │
│ api_key      │    │ heart_rate    │    │ alert_type   │
│ bed_number   │    │ spo2          │    │ severity     │
│ ward         │    │ bed_status    │    │ message      │
│ patient_name │    │ timestamp     │    │ escalation   │
│ status       │    └───────────────┘    │ timestamp    │
│ last_seen    │                         └──────────────┘
└──────────────┘
┌──────────────┐    ┌───────────────┐
│   patients   │    │  audit_logs   │
├──────────────┤    ├───────────────┤
│ id           │    │ id            │
│ name         │    │ user_id       │
│ device_id    │    │ action        │
│ admission    │    │ details       │
│ discharge    │    │ timestamp     │
└──────────────┘    └───────────────┘
┌──────────────┐
│    users     │
├──────────────┤
│ id           │
│ username     │
│ password_hash│
│ role         │
│ created_at   │
└──────────────┘
```

---

## 👥 Authors

- **Eashan Jain** — [GitHub](https://github.com/Eashan4)

---

## 📄 License

This project is for educational and demonstration purposes.
