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
// 🧩 TIPOS
// ===============================
interface Ubicacion {
  lat: number;
  lng: number;
  dispositivoId: string;
}

// ===============================
// 🗺️ CENTRAR MAPA
// ===============================
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center]);
  return null;
}

// ===============================
// 🚀 APP
// ===============================
function App() {
  const [pos, setPos] = useState<[number, number]>([3.45, -76.53]);
  const [dispositivos, setDispositivos] = useState<Ubicacion[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [clima, setClima] = useState<any>({});
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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
  // 📱 RESPONSIVE
  // ===============================
  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ===============================
  // 📡 GPS + ENVÍO
  // ===============================
  useEffect(() => {
    const watch = navigator.geolocation.watchPosition(async (p) => {
      const lat = p.coords.latitude;
      const lng = p.coords.longitude;

      setPos([lat, lng]);

      // 🔥 enviar ubicación
      await axios.post("https://citylive.onrender.com/ubicacion", {
        dispositivoId: deviceId,
        lat,
        lng
      });

      // 🔥 pedir clima de TU ubicación
      const res = await axios.get(
        `https://citylive.onrender.com/api/clima?lat=${lat}&lng=${lng}`
      );

      setClima(res.data);

    });

    return () => navigator.geolocation.clearWatch(watch);
  }, [deviceId]);

  // ===============================
  // 🔄 CARGAR DISPOSITIVOS
  // ===============================
  useEffect(() => {
    const load = async () => {
      const res = await axios.get("https://citylive.onrender.com/ubicaciones");

      setDispositivos(res.data);
    };

    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

      {/* HEADER */}
      <div style={{
        background: "#000",
        color: "#fff",
        padding: 10,
        textAlign: "center"
      }}>
        🚀 CityLive PRO
      </div>

      {/* CONTENIDO */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isMobile ? "column" : "row"
      }}>

        {/* PANEL IZQUIERDO */}
        <div style={{
          width: isMobile ? "100%" : "280px",
          background: "#f0f0f0",
          padding: 10
        }}>

          <strong>📍 TU ID:</strong>
          <br /> {deviceId}

          <hr />

          <strong>🌦️ Clima actual</strong>
          <br />
          🌡️ {clima?.temperatura ?? "--"}°C
          <br />
          💧 {clima?.humedad ?? "--"}%
          <br />
          ☁️ {clima?.descripcion ?? "--"}

        </div>

        {/* MAPA */}
        <div style={{
          flex: 1,
          height: isMobile ? "60vh" : "100%"
        }}>
          <MapContainer center={pos} zoom={15} style={{ height: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            <MapUpdater center={pos} />

            {/* 🔵 TU UBICACIÓN */}
            <Marker position={pos}>
              <Popup>📱 Tú</Popup>
            </Marker>

            {/* 🔴 OTROS DISPOSITIVOS (INCLUYE ESP32) */}
            {dispositivos.map((d, i) => (
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