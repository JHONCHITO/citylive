import { useEffect, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ===============================
// 🔧 FIX ICONOS
// ===============================
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ===============================
interface Ubicacion {
  lat: number;
  lng: number;
  dispositivoId?: string;
}

// ===============================
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center]);
  return null;
}

// ===============================
function App() {
  const [pos, setPos] = useState<[number, number]>([3.45, -76.53]);
  const [historial, setHistorial] = useState<Ubicacion[]>([]);
  const [activos, setActivos] = useState<Ubicacion[]>([]);
  const [deviceId, setDeviceId] = useState("");

  const [clima, setClima] = useState({
    temperatura: 0,
    humedad: 0,
    descripcion: ""
  });

  // ===============================
  // 🔥 ID ÚNICO
  // ===============================
  useEffect(() => {
    let id = localStorage.getItem("device_id");

    if (!id) {
      id = "device_" + Math.floor(Math.random() * 100000);
      localStorage.setItem("device_id", id);
    }

    setDeviceId(id);
  }, []);

  // ===============================
  // 🌦️ CLIMA
  // ===============================
  const obtenerClima = async (lat: number, lng: number) => {
    try {
      const res = await axios.get(
        `https://citylive.onrender.com/api/clima?lat=${lat}&lng=${lng}`
      );
      setClima(res.data);
    } catch {
      console.log("Error clima");
    }
  };

  // ===============================
  // 📡 GPS
  // ===============================
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watch = navigator.geolocation.watchPosition(
      async (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;

        setPos([lat, lng]);
        obtenerClima(lat, lng);

        if (deviceId) {
          await axios.post("https://citylive.onrender.com/ubicacion", {
            dispositivoId: deviceId,
            lat,
            lng
          });
        }
      },
      (err) => console.log(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [deviceId]);

  // ===============================
  // 📊 HISTORIAL REAL
  // ===============================
  useEffect(() => {
    if (!deviceId) return;

    const loadHistorial = async () => {
      try {
        const res = await axios.get(
          `https://citylive.onrender.com/historial/${deviceId}`
        );
        setHistorial(res.data);
      } catch {
        console.log("Error historial");
      }
    };

    loadHistorial();

    const i = setInterval(loadHistorial, 10000);
    return () => clearInterval(i);
  }, [deviceId]);

  // ===============================
  // 🔥 ACTIVOS
  // ===============================
  useEffect(() => {
    const loadActivos = async () => {
      try {
        const res = await axios.get(
          "https://citylive.onrender.com/ubicaciones"
        );

        const filtrado = res.data.filter(
          (d: Ubicacion) => d.dispositivoId !== "esp32_1"
        );

        setActivos(filtrado);
      } catch {
        console.log("Error activos");
      }
    };

    loadActivos();
    const i = setInterval(loadActivos, 10000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

      <div style={{ background: "#000", color: "#fff", padding: 10 }}>
        🚀 CityLive PRO
      </div>

      <div style={{ flex: 1, display: "flex" }}>

        {/* PANEL */}
        <div style={{ width: "280px", background: "#f0f0f0", padding: 10 }}>
          <strong>📍 TU ID:</strong>
          <br /> {deviceId}

          <hr />

          <strong>🌦️ Clima</strong>
          <br />
          🌡️ {clima.temperatura}°C
          <br />
          💧 {clima.humedad}%
          <br />
          ☁️ {clima.descripcion}

          <hr />

          <strong>📊 Historial REAL</strong>

          {historial.map((h, i) => (
            <div key={i}>
              {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
            </div>
          ))}
        </div>

        {/* MAPA */}
        <div style={{ flex: 1 }}>
          <MapContainer center={pos} zoom={15} style={{ height: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapUpdater center={pos} />

            <Marker position={pos}>
              <Popup>Tú</Popup>
            </Marker>

            {activos.map((d, i) => (
              <Marker key={i} position={[d.lat, d.lng]}>
                <Popup>{d.dispositivoId}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

      </div>
    </div>
  );
}

export default App;