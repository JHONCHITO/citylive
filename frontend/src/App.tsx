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
interface Clima {
  temperatura: number;
  humedad: number;
  presion: number;
  descripcion: string;
}

interface Ubicacion {
  lat: number;
  lng: number;
  fecha?: string;
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
  const [clima, setClima] = useState<Clima>({
    temperatura: 0,
    humedad: 0,
    presion: 0,
    descripcion: "Cargando..."
  });

  const [pos, setPos] = useState<[number, number]>([3.4516, -76.5320]);
  const [historial, setHistorial] = useState<Ubicacion[]>([]);

  // ===============================
  // 🌦️ CLIMA
  // ===============================
  const obtenerClima = async () => {
    try {
      const res = await axios.get("https://citylive.onrender.com/api/clima");
      setClima(res.data);
    } catch {}
  };

  // ===============================
  // 📊 HISTORIAL
  // ===============================
  const obtenerHistorial = async () => {
    try {
      const res = await axios.get("https://citylive.onrender.com/ubicaciones/celular_1");
      if (Array.isArray(res.data)) setHistorial(res.data);
    } catch {}
  };

  // ===============================
  // 📱 GPS REAL DEL CELULAR
  // ===============================
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("GPS no disponible");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // 🔥 actualizar mapa
        setPos([lat, lng]);

        // 🔥 enviar al backend
        try {
          await axios.post("https://citylive.onrender.com/ubicacion", {
            dispositivoId: "celular_1",
            lat,
            lng
          });
        } catch (err) {
          console.log("Error enviando GPS", err);
        }
      },
      (err) => console.log(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ===============================
  // 🔁 LOOP
  // ===============================
  useEffect(() => {
    obtenerClima();
    obtenerHistorial();

    const interval = setInterval(() => {
      obtenerClima();
      obtenerHistorial();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>

      {/* HEADER */}
      <div style={{
        background: "#111",
        color: "#fff",
        padding: "10px",
        textAlign: "center",
        fontSize: "18px"
      }}>
        🚀 CityLive - GPS en tiempo real
      </div>

      {/* CONTENIDO */}
      <div style={{
  flex: 1,
  display: "flex",
  flexDirection: window.innerWidth < 768 ? "column" : "row"
}}>

        <div style={{
  width: window.innerWidth < 768 ? "100%" : "300px",
  background: "#f5f5f5",
  padding: "10px"
}}>
          <strong>🌡️ {clima.temperatura}°C</strong> | 💧 {clima.humedad}%
          <br />
          📍 {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
        </div>

        {/* MAPA */}
        <div style={{
  flex: 1,
  height: window.innerWidth < 768 ? "60vh" : "100%"
}}>
          <MapContainer
            center={pos}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            <MapUpdater center={pos} />

            <Marker position={pos}>
              <Popup>📍 Tu ubicación</Popup>
            </Marker>

            <div style={{
  background: "#fff",
  padding: "10px",
  fontSize: "12px",
  maxHeight: "150px",
  overflowY: "auto"
}}>
  <strong>📊 Historial</strong>

  {historial.length > 0 ? (
    historial.slice().reverse().map((item, i) => (
      <div key={i}>
        📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
        <br />
        {item.fecha && (
          <span style={{ color: "#666" }}>
            {new Date(item.fecha).toLocaleString()}
          </span>
        )}
        <hr />
      </div>
    ))
  ) : (
    <p>No hay datos</p>
  )}
</div>
          </MapContainer>
        </div>

      </div>
    </div>
  );
}

export default App;