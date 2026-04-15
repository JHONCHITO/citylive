import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ===============================
// 🔧 FIX ICONOS DE LEAFLET
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
  timestamp?: string;
}

// ===============================
// 🗺️ COMPONENTE PARA CENTRAR MAPA
// ===============================
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
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
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // ===============================
  // 🌦️ CLIMA
  // ===============================
  const obtenerClima = async () => {
    try {
      const res = await axios.get("http://localhost:3000/api/clima");
      if (res.data) setClima(res.data);
    } catch {
      setClima({
        temperatura: 25,
        humedad: 60,
        presion: 1012,
        descripcion: "Simulado"
      });
    }
  };

  // ===============================
  // 📍 UBICACIÓN
  // ===============================
  const obtenerUbicacion = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:3000/ubicacion/esp32_1");

      if (res.data?.lat && res.data?.lng) {
        const nuevaPos: [number, number] = [Number(res.data.lat), Number(res.data.lng)];
        setPos(nuevaPos);
        setUltimaActualizacion(new Date().toLocaleTimeString());
      }
    } catch {
      // movimiento simulado si no hay datos
      setPos(prev => {
        const nuevaPos: [number, number] = [
          prev[0] + (Math.random() * 0.001 - 0.0005),
          prev[1] + (Math.random() * 0.001 - 0.0005)
        ];
        setUltimaActualizacion(new Date().toLocaleTimeString() + " (Simulado)");
        return nuevaPos;
      });
    }
    setLoading(false);
  };

  // ===============================
  // 📊 HISTORIAL
  // ===============================
  const obtenerHistorial = async () => {
    try {
      const res = await axios.get("http://localhost:3000/ubicaciones/esp32_1");
      if (Array.isArray(res.data)) setHistorial(res.data);
    } catch {}
  };

  // ===============================
  // 🔁 LOOP - CADA 10 SEGUNDOS
  // ===============================
  useEffect(() => {
    obtenerClima();
    obtenerUbicacion();
    obtenerHistorial();

    const interval = setInterval(() => {
      obtenerUbicacion();
      obtenerHistorial();
      obtenerClima();
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      height: "100vh", 
      width: "100vw", 
      margin: 0, 
      padding: 0,
      overflow: "hidden",
      fontFamily: "Arial, sans-serif"
    }}>

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        color: "#fff",
        padding: "12px 20px",
        textAlign: "center",
        fontSize: "22px",
        fontWeight: "bold",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <span>🚀 CityLive Dashboard</span>
        <div style={{ fontSize: "14px", fontWeight: "normal" }}>
          {loading && <span>🔄 Actualizando...</span>}
          {!loading && ultimaActualizacion && (
            <span>✅ Última actualización: {ultimaActualizacion}</span>
          )}
        </div>
      </div>

      <div style={{ 
        display: "flex", 
        height: "calc(100vh - 50px)",
        width: "100%"
      }}>

        {/* PANEL LATERAL */}
        <div style={{
          width: "320px",
          background: "#f8f9fa",
          padding: "20px",
          overflowY: "auto",
          boxShadow: "2px 0 10px rgba(0,0,0,0.1)"
        }}>
          
          {/* CLIMA */}
          <h2 style={{ 
            marginTop: 0, 
            color: "#333",
            fontSize: "20px",
            borderBottom: "2px solid #667eea",
            paddingBottom: "10px"
          }}>
            🌦️ Clima
          </h2>
          <div style={{ 
            background: "white", 
            padding: "15px", 
            borderRadius: "10px",
            marginBottom: "20px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
          }}>
            <p style={{ margin: "8px 0", fontSize: "15px" }}>
              <strong>🌡️ Temperatura:</strong> {clima.temperatura}°C
            </p>
            <p style={{ margin: "8px 0", fontSize: "15px" }}>
              <strong>💧 Humedad:</strong> {clima.humedad}%
            </p>
            <p style={{ margin: "8px 0", fontSize: "15px" }}>
              <strong>📊 Presión:</strong> {clima.presion} hPa
            </p>
            <p style={{ margin: "8px 0", fontSize: "15px" }}>
              <strong>☁️ Estado:</strong> {clima.descripcion}
            </p>
          </div>

          {/* POSICIÓN ACTUAL */}
          <h3 style={{ 
            color: "#333",
            fontSize: "18px",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px"
          }}>
            📍 Posición Actual
          </h3>
          <div style={{ 
            background: "white", 
            padding: "15px", 
            borderRadius: "10px",
            marginBottom: "20px",
            fontSize: "14px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
          }}>
            <p style={{ margin: "5px 0" }}>
              <strong>Latitud:</strong> {pos[0].toFixed(6)}
            </p>
            <p style={{ margin: "5px 0" }}>
              <strong>Longitud:</strong> {pos[1].toFixed(6)}
            </p>
            {ultimaActualizacion && (
              <p style={{ 
                margin: "10px 0 0 0", 
                fontSize: "12px", 
                color: "#666",
                fontStyle: "italic"
              }}>
                Última actualización: {ultimaActualizacion}
              </p>
            )}
          </div>

          {/* HISTORIAL */}
          <h3 style={{ 
            color: "#333",
            fontSize: "18px",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px"
          }}>
            📊 Historial ({historial.length})
          </h3>
          <div style={{ 
            background: "white", 
            padding: "10px", 
            borderRadius: "10px",
            maxHeight: "400px",
            overflowY: "auto",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
          }}>
            {historial.length > 0 ? (
              historial.slice().reverse().map((item, i) => (
                <div key={i} style={{ 
                  padding: "10px", 
                  borderBottom: i < historial.length - 1 ? "1px solid #eee" : "none",
                  fontSize: "13px",
                  transition: "background 0.2s"
                }}>
                  <div style={{ fontWeight: "bold", color: "#667eea" }}>
                    #{historial.length - i}
                  </div>
                  <div>📍 Lat: {item.lat.toFixed(6)}</div>
                  <div>📍 Lng: {item.lng.toFixed(6)}</div>
                  {item.timestamp && (
                    <div style={{ fontSize: "11px", color: "#999", marginTop: "3px" }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p style={{ textAlign: "center", color: "#999", padding: "20px" }}>
                No hay datos en el historial
              </p>
            )}
          </div>
        </div>

        {/* MAPA - OCUPA TODO EL ESPACIO RESTANTE */}
        <div style={{ 
          flex: 1,
          height: "100%",
          position: "relative"
        }}>
          <MapContainer
            center={pos}
            zoom={15}
            style={{ 
              height: "100%", 
              width: "100%",
              zIndex: 1
            }}
            scrollWheelZoom={true}
          >
            <TileLayer 
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Componente para actualizar el centro del mapa */}
            <MapUpdater center={pos} />

            {/* Marcador de posición actual */}
            <Marker position={pos}>
              <Popup>
                <div style={{ textAlign: "center" }}>
                  <strong>📍 Dispositivo ESP32</strong><br/>
                  <small>Lat: {pos[0].toFixed(6)}</small><br/>
                  <small>Lng: {pos[1].toFixed(6)}</small><br/>
                  {ultimaActualizacion && (
                    <small style={{ color: "#666" }}>
                      {ultimaActualizacion}
                    </small>
                  )}
                </div>
              </Popup>
            </Marker>

            {/* Marcadores del historial con menor opacidad */}
            {historial.slice(0, 50).map((item, i) => (
              <Marker 
                key={i} 
                position={[item.lat, item.lng]}
                opacity={0.4}
              >
                <Popup>
                  <div>
                    <strong>📌 Historial #{i + 1}</strong><br/>
                    <small>Lat: {item.lat.toFixed(6)}</small><br/>
                    <small>Lng: {item.lng.toFixed(6)}</small>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Indicador de carga flotante */}
          {loading && (
            <div style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "rgba(102, 126, 234, 0.95)",
              color: "white",
              padding: "10px 20px",
              borderRadius: "20px",
              zIndex: 1000,
              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              fontWeight: "bold"
            }}>
              🔄 Actualizando datos...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;