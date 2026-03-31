# NeuroGuard Clinic AIoT — System Architecture Diagram

This layered architecture diagram outlines the precise data flow from the physical edge sensors up to the React 3D Dashboard. 

```mermaid
graph LR
  %% Define styles
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
    WiFi ===> Auth
  end

  subgraph Processing["3. Application & Processing Layer (FastAPI)"]
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
    WS((("WebSocket Server<br/>(ws_manager)"))):::net

    Router -- "Throttled Write" --> DB
    SerialTh -- "Throttled Write" --> DB
    Sched -- "Query & Timeout" --> DB
    
    AI -- "Inject Alerts" --> DB
    
    AI -- "Instant Alert Fire" ----> WS
    Router -- "Frame Broadcast" --> WS
    SerialTh -- "Frame Broadcast" --> WS
    Sched -- "Timeout Broadcast" --> WS
  end

  subgraph Dashboard["5. Visualization Layer (React)"]
    direction TB
    Client["React Application<br/>(WebSocket Hook Context)"]:::vis
    Three["3D Floorplan<br/>(Color-coded Status)"]:::vis
    VitalUI["Live Vitals UI<br/>(Waveforms & Gauges)"]:::vis
    AlertUI["Alert Notification<br/>(Toast Manager)"]:::vis

    WS === "Live Data Sync" ===> Client
    Client --> Three
    Client --> VitalUI
    Client --> AlertUI
  end
```

### Legend & Highlights
- **Layer 1 (Green):** Physical Edge devices mounted per hospital bed.
- **Layer 2 (Red/Blue):** Network transport ensuring data delivery either via Wi-Fi arrays or manual offline serial fallback. Security is injected early.
- **Layer 3 (Blue/Orange):** High concurrency asynchronous processors, featuring a specialized AI Engine filtering buffers for heartbeat and SpO₂ anomalies.
- **Layer 4 (Orange/Blue):** Data permanence throttling (preventing SQLite/PostgreSQL locks) and splitting the stream instantly into the WebSocket nexus.
- **Layer 5 (Purple):** Client rendering system unpacking the WebSocket payloads into complex spatial visuals and waveform states natively.
