import axios from "axios";


// Define base URL based on environment
export const API_BASE = "http://localhost:8000";

// Axios instance
export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("iot_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem("iot_token");
      sessionStorage.removeItem("iot_username");
      sessionStorage.removeItem("iot_role");
      window.location.href = "/"; // Force to login
    }
    return Promise.reject(error);
  }
);

// Native WebSocket mock to match socket.io interface
class SocketMock {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.listeners = {};
        this.connected = false;
    }
    
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
            this.connected = true;
            this.emitLocal("connect");
        };
        
        this.ws.onclose = () => {
            this.connected = false;
            this.emitLocal("disconnect");
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data && data.type) {
                    this.emitLocal(data.type, data);
                }
            } catch(e) {}
        };
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.onclose = null; // disable auto-reconnect or onclose trigger
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
    
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    
    off(event, callback) {
        if (!this.listeners[event]) return;
        if (!callback) {
            this.listeners[event] = [];
        } else {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }
    
    emitLocal(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

let socketInstance = null;

export const getSocket = () => {
    if (!socketInstance) {
        const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/live';
        socketInstance = new SocketMock(wsUrl);
    }
    return socketInstance;
};

export const connectSocket = () => {
    const s = getSocket();
    if (!s.connected) {
        s.connect();
    }
    return s;
};

export const disconnectSocket = () => {
    const s = getSocket();
    if (s.connected) {
        s.disconnect();
    }
};
