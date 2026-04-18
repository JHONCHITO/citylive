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
  dispositivoId?: string;
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
  // 📊 TODOS LOS DISPOSITIVOS
  // ===============================
  const obtenerHistorial = async () => {
    try {
      const res = await axios.get("https://citylive.onrender.com/ubicaciones");
      if (Array.isArray(res.data)) setHistorial(res.data);
    } catch (err) {
      console.log("Error historial", err);
    }
  };

  // ===============================
  // 📱 GPS CELULAR
  // ===============================
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setPos([lat, lng]);

        await axios.post("https://citylive.onrender.com/ubicacion", {
          dispositivoId: "celular_1",
          lat,
          lng
        });
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
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

      {/* HEADER */}
      <div style={{
        background: "#111",
        color: "#fff",
        padding: "10px",
        textAlign: "center"
      }}>
        🚀 CityLive - MULTI GPS
      </div>

      {/* CONTENIDO */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: window.innerWidth < 768 ? "column" : "row"
      }}>

        {/* PANEL */}
        <div style={{
          width: window.innerWidth < 768 ? "100%" : "300px",
          background: "#f5f5f5",
          padding: "10px"
        }}>
          <strong>🌡️ {clima.temperatura}°C</strong><br />
          📍 {pos[0].toFixed(5)}, {pos[1].toFixed(5)}

          <hr />
          <strong>📊 Historial</strong>

          {historial.slice(0, 10).map((item, i) => (
            <div key={i}>
              📍 {item.dispositivoId}
              <br />
              {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
            </div>
          ))}
        </div>

        {/* MAPA */}
        <div style={{ flex: 1 }}>
          <MapContainer center={pos} zoom={15} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            <MapUpdater center={pos} />

            {/* TU UBICACIÓN */}
            <Marker position={pos}>
              <Popup>📍 Tú (celular)</Popup>
            </Marker>

            {/* TODOS LOS DISPOSITIVOS */}
            {historial.map((p, i) => (
              <Marker key={i} position={[p.lat, p.lng]}>
                <Popup>
                  📍 {p.dispositivoId || "Dispositivo"}
                  <br />
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                </Popup>
              </Marker>
            ))}

          </MapContainer>
        </div>

      </div>
    </div>
  );
}

export default App;