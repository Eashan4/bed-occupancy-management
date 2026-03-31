/*
 * ============================================================
 * NeuroGuard Clinic - ESP8266 (NodeMCU) Patient Monitor
 * ============================================================
 *
 * Sensors: MAX30102 (Pulse + SpO2) + FSR 402 (Bed Pressure)
 * Communication: HTTP POST to FastAPI backend with API key auth
 *
 * Wiring (NodeMCU -> MAX30102):
 *   3V3 -> VIN  (DO NOT USE 5V)
 *   GND -> GND
 *   D2  -> SDA  (GPIO4)
 *   D1  -> SCL  (GPIO5)
 *
 * Libraries required:
 *   - ESP8266WiFi (built-in)
 *   - ESP8266HTTPClient (built-in)
 *   - Wire (built-in, for I2C)
 *   - SparkFun MAX3010x (install via Library Manager)
 *     Search: "SparkFun MAX3010x" by SparkFun Electronics
 * ============================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#ifdef I2C_BUFFER_LENGTH
  #undef I2C_BUFFER_LENGTH
#endif
#include "MAX30105.h"
#include "config.h"

// ============================================
// Global Objects
// ============================================
MAX30105 particleSensor;
WiFiClient wifiClient;

// ============================================
// Sensor Init Flag
// ============================================
bool sensorOk = false;

// ============================================
// Timing Variables
// ============================================
unsigned long lastDataSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastReportTs = 0;
const int REPORT_INTERVAL_MS = 1000;  // 1 DATA line per second over serial

// ============================================
// Sensor Values (shared between processing and sending)
// ============================================// Shared vitals data
float currentHeartRate = 0;
float currentSpO2      = 0;
int   currentBeatDetected = 0;
int   currentBedStatus = 0;

// Hardware Button Debounce State
bool lastButtonReading = HIGH;
unsigned long lastToggleTime = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 5000;

// Connection failure tracking (declared here so connectWiFi can use it)
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;
bool wifiEnabled = true; // Toggle for wired/offline mode
unsigned long lastWifiCheck = 0;

// ============================================
// Beat Detector (raw IR, adaptive min/max)
// — Exact logic from working ESP32 code —
// ============================================
bool detectBeat(long irValue) {
  static long s0 = 0, s1 = 0, s2 = 0;
  static long lastBeatMs = 0;
  static long irMin = 999999, irMax = 0;

  s0 = s1;
  s1 = s2;
  s2 = irValue;

  if (irValue < irMin) irMin = irValue;
  else irMin += (irValue - irMin) / 2000;

  if (irValue > irMax) irMax = irValue;
  else irMax -= (irMax - irValue) / 2000;

  long amplitude = irMax - irMin;
  if (amplitude < 300) return false;

  bool isPeak         = (s1 > s0 && s1 > s2);
  long midpoint       = (irMin + irMax) / 2;
  bool aboveThreshold = (s1 > midpoint);
  bool refractoryOk   = (millis() - lastBeatMs > 260);

  if (isPeak && aboveThreshold && refractoryOk) {
    lastBeatMs = millis();
    return true;
  }
  return false;
}

// ============================================
// HR & SpO2 state variables
// ============================================
// Heart rate
float beatsPerMinute = 0;
float bpmBuffer[6]   = {0};
int   bpmIndex       = 0;
long  lastBeatMs     = 0;
bool  firstBeat      = true;

// SpO2
int    spo2Calc   = 0;
double avered     = 0, aveir = 0;
double sumredrms  = 0, sumirrms = 0;
int    spo2Count  = 0;

// ============================================
// SETUP
// ============================================
void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("====================================");
    Serial.println("NeuroGuard Clinic - ESP8266 Monitor");
    Serial.println("====================================");
    Serial.print("Device ID: ");
    Serial.println(DEVICE_ID);

    // Connect WiFi
    connectWiFi();

    // Initialize MAX30102 via SparkFun MAX30105 library
    Serial.print("Initializing MAX30102...");
    Wire.begin(D2, D1);  // SDA=D2(GPIO4), SCL=D1(GPIO5)

    if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
        Serial.println(" FAILED!");
        Serial.println("Check wiring: SDA->D2, SCL->D1, VIN->3.3V");
        Serial.println("SENSOR FAILURE: Will report 0/0 to trigger server alert.");
        sensorOk = false;
    } else {
        Serial.println(" OK");

        // Same configuration as working ESP32 code
        particleSensor.setup(60, 4, 2, 100, 411, 4096);
        particleSensor.setPulseAmplitudeRed(0x1F);
        particleSensor.setPulseAmplitudeIR(0x1F);

        sensorOk = true;
    }

    // Manual Push Button pin with internal pullup
    pinMode(BUTTON_PIN, INPUT_PULLUP);

    Serial.println("Setup complete. Starting monitoring...");
    Serial.println();
}

// ============================================
// LOOP
// ============================================
void loop() {
    // Read command from Serial
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd == "MODE:OFFLINE") {
            wifiEnabled = false;
            WiFi.disconnect();
            Serial.println("Switched to OFFLINE (Serial only)");
        } else if (cmd == "MODE:ONLINE") {
            wifiEnabled = true;
            Serial.println("Switched to ONLINE (WiFi)");
            connectWiFi();
        }
    }

    if (sensorOk) {
        processSensor();
    }

    // Robust Debounced Push Button Logic (Toggle on press)
    int reading = digitalRead(BUTTON_PIN);

    // Only allow a toggle if:
    // 1. The button is currently PRESSED (LOW because of INPUT_PULLUP)
    // 2. The previous reading was UNPRESSED (HIGH)
    // 3. Enough time has passed since the last toggle to ignore bouncing
    if (reading == LOW && lastButtonReading == HIGH && (millis() - lastToggleTime > BUTTON_DEBOUNCE_MS)) {
        currentBedStatus = !currentBedStatus;
        lastToggleTime = millis();
    }
    
    lastButtonReading = reading;

    // Non-blocking WiFi check
    if (wifiEnabled && WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWifiCheck > 10000) {
            connectWiFi();
            lastWifiCheck = millis();
        }
    } else if (WiFi.status() == WL_CONNECTED && lastWifiCheck > 0) {
        // Connected successfully
        Serial.println();
        Serial.print("WiFi Connected! IP: ");
        Serial.println(WiFi.localIP());
        lastWifiCheck = 0; // stop checking
        consecutiveFailures = 0;
    }

    // Send vitals data every DATA_INTERVAL (WiFi only)
    if (wifiEnabled && (millis() - lastDataSend >= DATA_INTERVAL)) {
        sendVitalsData();
        lastDataSend = millis();
    }

    // Send heartbeat every HEARTBEAT_INTERVAL (WiFi only)
    if (wifiEnabled && (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL)) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }

    delay(50);
}

// ============================================
// Sensor Processing
// — Exact HR & SpO2 logic from working ESP32 code —
// ============================================
void processSensor() {
    long irValue  = particleSensor.getIR();
    long redValue = particleSensor.getRed();
    bool fingerDetected = (irValue > 50000);

    // ── Heart Rate ──────────────────────────────────────────
    currentBeatDetected = 0;

    if (fingerDetected && detectBeat(irValue)) {
        long now   = millis();
        long delta = now - lastBeatMs;
        lastBeatMs = now;

        if (firstBeat) {
            firstBeat = false;
        } else if (delta > 250 && delta < 2000) {
            float instantBPM        = 60000.0f / (float)delta;
            bpmBuffer[bpmIndex % 6] = instantBPM;
            bpmIndex++;

            float sum = 0;
            int   n   = min(bpmIndex, 6);
            for (int i = 0; i < n; i++) sum += bpmBuffer[i];
            beatsPerMinute    = sum / n;
            currentBeatDetected = 1;
        }
    }

    if (!fingerDetected) {
        beatsPerMinute = 0;
        bpmIndex       = 0;
        firstBeat      = true;
        lastBeatMs     = 0;
        for (int i = 0; i < 6; i++) bpmBuffer[i] = 0;
    }

    // ── SpO2 ────────────────────────────────────────────────
    if (fingerDetected) {
        double fred = (double)redValue;
        double fir  = (double)irValue;

        avered = avered * 0.95 + fred * 0.05;
        aveir  = aveir  * 0.95 + fir  * 0.05;

        sumredrms += (fred - avered) * (fred - avered);
        sumirrms  += (fir  - aveir)  * (fir  - aveir);
        spo2Count++;

        if (spo2Count >= 25) {
            double R       = (sqrt(sumredrms) / avered) / (sqrt(sumirrms) / aveir);
            int    newSpo2 = (int)(-45.060 * R * R + 30.354 * R + 94.845);
            spo2Calc       = constrain(newSpo2, 70, 100);
            sumredrms      = sumirrms = 0;
            spo2Count      = 0;
        }
    } else {
        spo2Calc  = 0;
        avered    = aveir = sumredrms = sumirrms = 0;
        spo2Count = 0;
    }

    // Update shared variables for HTTP sending
    currentHeartRate = fingerDetected ? beatsPerMinute : 0;
    currentSpO2      = fingerDetected ? spo2Calc : 0;

    // ── Serial debug output at 10 FPS ───────────────────────
    if (millis() - lastReportTs >= REPORT_INTERVAL_MS) {
        lastReportTs = millis();

        Serial.print("DATA:");
        Serial.print("DEVICE="); Serial.print(DEVICE_ID);
        Serial.print(",KEY=");   Serial.print(API_KEY);
        Serial.print(",IR=");   Serial.print(irValue);
        Serial.print(",RED=");  Serial.print(redValue);
        Serial.print(",HR=");   Serial.print((int)currentHeartRate);
        Serial.print(",SPO2="); Serial.print(currentSpO2);
        Serial.print(",BEAT="); Serial.print(currentBeatDetected);
        Serial.print(",BED=");  Serial.print(currentBedStatus);
        Serial.print(",TS=");   Serial.print(millis());
        Serial.println();
    }
}

// ============================================
// WiFi Connection with Auto-Reconnect
// ============================================
void connectWiFi() {
    if (!wifiEnabled) return;

    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ============================================
// Send Vitals Data to Backend
// ============================================

void sendVitalsData() {
    if (WiFi.status() != WL_CONNECTED) return;

    float hr = currentHeartRate;
    float spo2 = (float)currentSpO2;

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
