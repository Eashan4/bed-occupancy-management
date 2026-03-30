import { useState, useEffect } from "react";
import { api } from "../api";
import { Bar, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get("/api/analytics/summary");
        setData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAnalytics();
  }, []);

  if (!data) return <div className="page-content active">Loading Analytics...</div>;

  const barData = {
    labels: data.hourly_alerts.map(h => h.hour),
    datasets: [{
      label: 'Alerts per Hour',
      data: data.hourly_alerts.map(h => h.count),
      backgroundColor: 'rgba(255, 171, 0, 0.6)',
      borderColor: 'rgba(255, 171, 0, 1)',
      borderWidth: 1
    }]
  };

  const pieData = {
    labels: Object.keys(data.severity_distribution),
    datasets: [{
      data: Object.values(data.severity_distribution),
      backgroundColor: ['#ff1744', '#ff9100', '#2979ff', '#00e676'],
      hoverOffset: 4
    }]
  };

  const donutData = {
    labels: Object.keys(data.alert_types),
    datasets: [{
      data: Object.values(data.alert_types),
      backgroundColor: ['#d50000', '#c51162', '#aa00ff', '#6200ea', '#304ffe'],
      hoverOffset: 4
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#e0e0e0' },
        position: 'bottom'
      }
    }
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1>AI Analytics</h1>
        <div className="header-actions">
           <span className="live-indicator"><span className="live-dot"></span> UPDATED</span>
        </div>
      </div>

      <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="chart-wrapper glass-card" style={{ padding: '1.5rem', height: '350px' }}>
          <h3>Alerts Trend (24h)</h3>
          <Bar data={barData} options={{...chartOptions, scales: {y: {grid: {color: 'rgba(255, 255, 255, 0.1)'}}}} } />
        </div>
        <div className="chart-wrapper glass-card" style={{ padding: '1.5rem', height: '350px' }}>
          <h3>Severity Distribution</h3>
          <div style={{ height: 'calc(100% - 30px)', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Pie data={pieData} options={chartOptions} />
          </div>
        </div>
        <div className="chart-wrapper glass-card" style={{ padding: '1.5rem', height: '350px' }}>
          <h3>Alert Types</h3>
          <div style={{ height: 'calc(100% - 30px)', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Doughnut data={donutData} options={chartOptions} />
          </div>
        </div>
        <div className="summary-card glass-card" style={{ padding: '1.5rem' }}>
          <h3>AI Engine Status</h3>
          <p><strong>Anomaly Detection Model:</strong> Active (Rule-Based Ensemble)</p>
          <p><strong>Rules Loaded:</strong> SpO2 Drops, Tachycardia, Bradycardia, Sensor Failures</p>
          <p><strong>Total Monitored Devices:</strong> {data.device_health.total}</p>
          <p><strong>Online Ratio:</strong> {data.device_health.total ? Math.round(data.device_health.online / data.device_health.total * 100) : 0}%</p>
        </div>
      </div>
    </div>
  );
}
