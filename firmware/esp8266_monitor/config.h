/*
 * NeuroGuard Clinic - ESP8266 Configuration
 * Flash these values for each device
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// WiFi Configuration
// ============================================
#define WIFI_SSID "ABCDE"
#define WIFI_PASSWORD "23456789"

// ============================================
// Server Configuration
// ============================================
#define SERVER_URL "http://192.168.29.88:8000"
#define API_KEY "1a92c932afb64485b7f943f73d1cd1a072f1d176e9594c238bd0b769b7497448"
#define DEVICE_ID "BED_A_2"

// ============================================
// Timing (milliseconds)
// ============================================
#define DATA_INTERVAL 5000       // Send vitals every 5 seconds
#define HEARTBEAT_INTERVAL 10000 // Send heartbeat every 10 seconds
#define WIFI_RETRY_DELAY 5000    // WiFi reconnect delay
#define HTTP_TIMEOUT 5000        // HTTP request timeout

// ============================================
// Sensor Pins
// ============================================
#define BUTTON_PIN D5 // Manual Push Button for Bed Status

// ============================================
// MAX30102 Configuration (via SparkFun MAX30105 library)
// I2C Pins: SDA = D2 (GPIO4), SCL = D1 (GPIO5)
// ============================================
// Sensor processing runs in loop() at ~50ms intervals
// Serial debug output at 10 FPS (100ms)
// Finger detection threshold: IR > 50000

#endif
