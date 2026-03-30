/*
 * Hospital Bed Occupancy & Patient Vital Monitoring System
 * ESP8266 (NodeMCU) Firmware
 * 
 * Sensors: MAX30100 (Pulse + SpO2) + FSR 402 (Bed Pressure)
 * Communication: HTTP POST to FastAPI backend with API key auth
 * 
 * Libraries required:
 *   - ESP8266WiFi (built-in)
 *   - ESP8266HTTPClient (built-in)
 *   - Wire (built-in, for I2C)
 *   - MAX30100_PulseOximeter (install via Library Manager)
 *     Search: "MAX30100lib" by OXullo Intersecans
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include "MAX30100_PulseOximeter.h"
#include "config.h"

// ============================================
// Global Objects
// ============================================
PulseOximeter pox;
WiFiClient wifiClient;

// ============================================
// Timing Variables
// ============================================
unsigned long lastDataSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastPoxReport = 0;

// ============================================
// Sensor Values
// ============================================
float currentHeartRate = 0;
float currentSpO2 = 0;
int   currentBedStatus = 0;

// ============================================
// Sensor Init Flag
// ============================================
bool sensorOk = false;

// ============================================
// Callback for MAX30100 beat detection
// ============================================
void onBeatDetected() {
    Serial.println("♥ Beat detected!");
}

// ============================================
// SETUP
// ============================================
void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("====================================");
    Serial.println("Hospital IoT - ESP8266 Monitor");
    Serial.println("====================================");
    Serial.print("Device ID: ");
    Serial.println(DEVICE_ID);

    // Connect WiFi
    connectWiFi();

    // Initialize MAX30100
    Serial.print("Initializing MAX30100...");
    if (!pox.begin()) {
        Serial.println(" FAILED!");
        Serial.println("Check wiring: SDA->D2, SCL->D1, VIN->3.3V");
        Serial.println("SENSOR FAILURE: Will report 0/0 to trigger server alert.");
        sensorOk = false;
    } else {
        Serial.println(" OK");
        pox.setIRLedCurrent(MAX30100_LED_CURR_7_6MA);
        pox.setOnBeatDetectedCallback(onBeatDetected);
        sensorOk = true;
    }

    // Pressure sensor pin
    pinMode(PRESSURE_PIN, INPUT);

    Serial.println("Setup complete. Starting monitoring...");
    Serial.println();
}

// ============================================
// LOOP
// ============================================
void loop() {
    // Always update pulse oximeter
    pox.update();

    // Read MAX30100 values periodically
    if (millis() - lastPoxReport > REPORTING_PERIOD_MS) {
        currentHeartRate = pox.getHeartRate();
        currentSpO2 = pox.getSpO2();
        lastPoxReport = millis();
    }

    // Read pressure sensor
    int pressureRaw = analogRead(PRESSURE_PIN);
    currentBedStatus = (pressureRaw > PRESSURE_THRESHOLD) ? 1 : 0;

    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi lost! Reconnecting...");
        connectWiFi();
    }

    // Send vitals data every DATA_INTERVAL
    if (millis() - lastDataSend >= DATA_INTERVAL) {
        sendVitalsData();
        lastDataSend = millis();
    }

    // Send heartbeat every HEARTBEAT_INTERVAL
    if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
}

// ============================================
// WiFi Connection with Auto-Reconnect
// ============================================
void connectWiFi() {
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print("Connected! IP: ");
        Serial.println(WiFi.localIP());
        consecutiveFailures = 0;
    } else {
        Serial.println();
        Serial.println("WiFi connection failed. Will retry...");
    }
}

// ============================================
// Send Vitals Data to Backend
// ============================================
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;

void sendVitalsData() {
    if (WiFi.status() != WL_CONNECTED) return;

    float hr = currentHeartRate;
    float spo2 = currentSpO2;

    // If sensor not initialized or not giving readings, send 0/0
    // The backend will detect this as a sensor failure and create an alert
    if (!sensorOk || hr < 1 || spo2 < 1) {
        hr = 0;
        spo2 = 0;
        Serial.println("[DATA] WARNING: Sensor not reading. Sending 0/0 for failure alert.");
    }

    // Build JSON payload
    String json = "{";
    json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
    json += "\"heart_rate\":" + String(hr, 1) + ",";
    json += "\"spo2\":" + String(spo2, 1) + ",";
    json += "\"bed_status\":" + String(currentBedStatus);
    json += "}";

    // Send HTTP POST
    HTTPClient http;
    String url = String(SERVER_URL) + "/api/device/data";

    http.begin(wifiClient, url);
    http.setTimeout(HTTP_TIMEOUT);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", API_KEY);

    int httpCode = http.POST(json);

    if (httpCode == 200) {
        Serial.print("[DATA] HR:");
        Serial.print(hr, 1);
        Serial.print(" SpO2:");
        Serial.print(spo2, 1);
        Serial.print(" Bed:");
        Serial.print(currentBedStatus);
        Serial.println(" -> OK");
        consecutiveFailures = 0;
    } else {
        Serial.print("[DATA] FAILED! HTTP ");
        Serial.print(httpCode);
        Serial.print(" -> ");
        Serial.println(http.getString());
        consecutiveFailures++;
    }

    http.end();

    // If too many failures, try reconnecting WiFi
    if (consecutiveFailures >= MAX_FAILURES) {
        Serial.println("Too many failures. Reconnecting WiFi...");
        WiFi.disconnect();
        delay(1000);
        connectWiFi();
        consecutiveFailures = 0;
    }
}

// ============================================
// Send Heartbeat to Backend
// ============================================
void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) return;

    String json = "{\"device_id\":\"" + String(DEVICE_ID) + "\"}";

    HTTPClient http;
    String url = String(SERVER_URL) + "/api/device/heartbeat";

    http.begin(wifiClient, url);
    http.setTimeout(HTTP_TIMEOUT);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", API_KEY);

    int httpCode = http.POST(json);

    if (httpCode == 200) {
        Serial.println("[HEARTBEAT] OK");
    } else {
        Serial.print("[HEARTBEAT] FAILED! HTTP ");
        Serial.println(httpCode);
    }

    http.end();
}
