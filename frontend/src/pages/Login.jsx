import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { LogIn } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/api/auth/login", { username, password });
      sessionStorage.setItem("iot_token", data.token);
      sessionStorage.setItem("iot_username", data.username);
      sessionStorage.setItem("iot_role", data.role);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid credentials");
    }
  };

  return (
    <div id="login-page" className="page active">
      <div className="login-container">
        <div className="login-glow"></div>
        <div className="login-card glass-card">
          <div className="login-icon">
            <LogIn size={48} color="var(--accent)" />
          </div>
          <h1>Hospital IoT</h1>
          <p className="login-subtitle">Patient Vital Monitoring System</p>
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <input
                type="text"
                placeholder="Username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary btn-glow">
              Sign In
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
