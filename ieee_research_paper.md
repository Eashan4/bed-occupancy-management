# NeuroGuard Clinic AIoT: A Real-Time Bed Occupancy & Patient Vital Monitoring System

**Author:** Eashan Jain  
**Keywords:** Internet of Things (IoT), Healthcare Monitoring, Bed Occupancy, ESP8266, Oximetry, Anomaly Detection, FastAPI, WebSockets.

---

## Abstract
Continuous patient monitoring and efficient bed management are critical challenges in modern healthcare facilities. This paper presents the architecture, design, and implementation of the **NeuroGuard Clinic AIoT system**, a production-grade, real-time IoT-based hospital monitoring framework. The system integrates low-cost microcontrollers (ESP8266) with physiological (MAX30100) and physical (FSR 402) sensors to track patient vitals (heart rate, SpO₂) and bed occupancy simultaneously. Data is transmitted securely to a centralized Python FastAPI backend, processed via an AI-ready anomaly detection engine, and streamed instantly via WebSockets to a premium 3D animated dashboard. The proposed framework is scalable to over 100 concurrent devices, ensuring high availability, rapid failure recovery, and real-time critical alerts, thereby reducing nurse fatigue and improving patient outcomes.

---

## 1. Introduction
The advent of the Internet of Things (IoT) has significantly transformed the healthcare sector, facilitating the transition from periodic manual check-ups to continuous, automated remote patient monitoring. Overcrowded hospitals face the dual challenge of tracking available beds dynamically and ensuring vulnerable patients are continuously monitored for sudden physiological deterioration. 

Traditional monitoring systems are often bulky, expensive, and isolated to single rooms, lacking centralized, real-time analytics. To address these limitations, this project proposes the NeuroGuard Clinic AIoT system. By leveraging scalable edge microcontrollers and modern web technologies, the system provides an end-to-end pipeline—from sensory data acquisition at the patient’s bed to an interactive 3D visualization dashboard at the nursing station.

---

## 2. System Architecture
The architecture is divided into three primary tiers: the Device/Edge Layer, the Backend Processing Layer, and the Dashboard/Visualization Layer.

### 2.1 Hardware and Edge Layer
The physical data collection is handled by modular sensor nodes deployed at each patient's bed. 
*   **Microcontroller:** ESP8266 (NodeMCU) serves as the core processing and WiFi transmission unit.
*   **Vital Sensor:** MAX30100 pulse oximeter module captures photoplethysmography (PPG) signals to calculate Heart Rate (BPM) and Blood Oxygen Saturation (SpO₂).
*   **Occupancy Sensor:** A Force Sensitive Resistor (FSR 402) configured with a 10kΩ voltage divider acts as a pressure sensor to detect if the patient is occupying the bed.

### 2.2 Backend Processing Layer
The central server is built on **Python 3.9+** utilizing the **FastAPI** framework due to its high performance and native support for asynchronous operations.
*   **Database:** PostgreSQL (hosted via Supabase), managed using SQLAlchemy ORM. The relational schema maintains 6 primary tables: `devices`, `sensor_data`, `alerts`, `patients`, `users`, and `audit_logs`.
*   **Data Ingestion:** Devices push data via `HTTP POST /api/device/data` using unique 64-character API keys.
*   **Anomaly Engine:** A structured analytics engine evaluates incoming streams against predefined medical thresholds. It includes statistical analysis (e.g., standard deviation over a rolling window) to detect erratic patterns and sudden drops, laying the groundwork for future Long Short-Term Memory (LSTM) deep learning models.

### 2.3 Visualization and Dashboard Layer
Deployed using **React 19** and **Vite**, the frontend consumes data via native WebSockets to provide sub-second latency updates.
*   **3D Floor Plan:** Implemented using Three.js, it offers spatial awareness of the ward, utilizing color-coded bed models (Green/Yellow/Red) based on occupancy and alert states.
*   **Live Vitals:** Renders animated ECG-style waveforms and circular SpO₂ gauges.

---

## 3. Methodology and Implementation

### 3.1 Data Flow Pipeline
1.  **Acquisition:** The ESP8266 samples the MAX30100 and FSR 402.
2.  **Transmission:** An HTTP POST request containing JSON-formatted vitals is transmitted to the local or cloud backend.
3.  **Storage & Analysis:** The backend inserts the data into PostgreSQL and immediately queues it for the AI Anomaly Detection engine.
4.  **Broadcast:** If an anomaly is detected, an alert entity is generated. Regardless of anomaly status, the raw data is formatted and broadcast out on the `/ws/live` WebSocket channel.
5.  **Rendering:** Connected client dashboards intercept the payload, updating the React state to redraw waveforms and 3D objects seamlessly.

### 3.2 Resilience and Failover
In high-stakes medical environments, lost connections can be fatal. The firmware implements an **Auto WiFi Reconnect** algorithm that triggers robust recovery after connection loss. Furthermore, the firmware incorporates a failure recovery fallback that restarts the WiFi stack after five consecutive HTTP transmission failures. The backend monitors device health by requiring a dedicated Heartbeat Ping every 20 seconds; failure to report marks the device as "Offline" on the dashboard.

### 3.3 Clinical Threshold Algorithms
The system classifies anomalies based on universally recognized clinical thresholds:
*   **Critical Alerts (🔴):** SpO₂ dropping below 90%, or a rapid SpO₂ drop of >8% within 5 consecutive readings.
*   **High/Warning Alerts (🟠):** SpO₂ between 90-94%, Tachycardia (HR > 120 BPM), Bradycardia (HR < 50 BPM), or erratic heart rate patterns (standard deviation > 25 across a brief window).

---

## 4. Security Framework
Given the sensitive nature of PHI (Protected Health Information), the system adheres to strict security protocols:
*   **Edge Authentication:** Embedded devices do not possess user credentials. Instead, they utilize cryptographically random 64-character API keys specific to each bed unit.
*   **Client Authentication:** The web dashboard is secured using JSON Web Tokens (JWT) with bcrypt password hashing and Role-Based Access Control (Admin vs. Nurse permissions).
*   **Auditing:** A dedicated `audit_logs` table timestamps every administrative action (e.g., registering a device, deleting a patient record).

---

## 5. Deployment Topology
The system supports deployment across both cloud-native and local virtualized servers:
*   **Vercel Serverless Build:** Provides lightweight, accessible hosting leveraging `api/index.py` as an entry point. Note: Serverless environments trigger HTTP polling fallback mechanisms in lieu of stateful WebSockets.
*   **Docker Containerization:** A provided `docker-compose.yml` orchestrates PostgreSQL 16, the FastAPI Uvicorn ASGI server, and an Nginx reverse proxy serving the React frontend. This setup is strongly recommended for isolated hospital intranets to guarantee WebSocket stability and minimum latency.

---

## 6. Conclusion and Future Scope
The NeuroGuard Clinic AIoT system successfully demonstrates a robust, end-to-end framework for modern hospital ward automation. By uniting cheap hardware edge sensors with advanced web-rendering and scalable python backends, it achieves real-time observability of patient states. 

**Future Scope:** 
1. The immediate next step involves upgrading the rule-based anomaly engine to a fully operational LSTM continuous machine-learning model, trained on extensive clinical datasets to reduce false-positive alarms.
2. Implementing Edge IoT logic—allowing the ESP8266 or a more powerful ESP32 processor to perform rudimentary abnormality calculations prior to transmission, saving bandwidth.
3. Integration with centralized Electronic Health Record (EHR) APIs such as Epic or Cerner via HL7/FHIR standard protocols.

---

## References

1.  M. S. Al-Khasawneh, et al., "Internet of Things in Healthcare: A comprehensive Review," *IEEE Access*, vol. 9, 2021.
2.  Espressif Systems, *ESP8266 NodeMCU Technical Specification*.
3.  Maxim Integrated, *MAX30100 Pulse Oximeter and Heart-Rate Sensor IC Datasheet*.
4.  Sebastián Ramírez, *FastAPI Documentation*, tiangolo.com.
5.  Supabase, *PostgreSQL Row Level Security and Realtime Architecture*.
