import axios from "axios";
import { io } from "socket.io-client";

// Define base URL based on environment
export const API_BASE = "http://localhost:5001";

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

// Socket instance definition
let socketInstance = null;

export const getSocket = () => {
    if (!socketInstance) {
        socketInstance = io(API_BASE, {
            autoConnect: false,
            transports: ['polling', 'websocket'], // Force polling first, then websocket upgrade
        });
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
