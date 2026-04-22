import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://citylive.onrender.com";
const POLL_INTERVAL_MS = 15000;
const DEFAULT_CENTER: [number, number] = [3.451, -76.5322];

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface UbicacionActiva {
  dispositivoId: string;
  lat: number;
  lng: number;
  temperatura: number;
  humedad: number;
  descripcion: string;
  timestamp: string;
}

function MapViewport({ dispositivos }: { dispositivos: UbicacionActiva[] }) {
  const map = useMap();

  useEffect(() => {
    if (dispositivos.length === 0) {
      map.setView(DEFAULT_CENTER, 13);
      return;
    }

    if (dispositivos.length === 1) {
      map.setView([dispositivos[0].lat, dispositivos[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(
      dispositivos.map((item) => [item.lat, item.lng] as [number, number])
    );

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [dispositivos, map]);

  return null;
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function App() {
  const [dispositivos, setDispositivos] = useState<UbicacionActiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 980);

  useEffect(() => {
    let isMounted = true;

    const loadDispositivos = async () => {
      try {
        const response = await axios.get<UbicacionActiva[]>(`${API_BASE_URL}/ubicaciones`, {
          timeout: 8000,
        });

        if (!isMounted) {
          return;
        }

        setDispositivos(response.data);
        setError("");
        setLastSync(new Date().toLocaleTimeString("es-CO"));
      } catch (err) {
        if (!isMounted) {
          return;
        }

        const message = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : "No fue posible cargar las ubicaciones";

        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDispositivos();
    const intervalId = window.setInterval(loadDispositivos, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 980);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ubicacionesUnicas = useMemo(() => {
    const unique = new Map<string, UbicacionActiva>();

    for (const item of dispositivos) {
      if (!unique.has(item.dispositivoId)) {
        unique.set(item.dispositivoId, item);
      }
    }

    return Array.from(unique.values());
  }, [dispositivos]);

  const hottest = useMemo(() => {
    if (ubicacionesUnicas.length === 0) {
      return null;
    }

    return [...ubicacionesUnicas].sort((a, b) => b.temperatura - a.temperatura)[0];
  }, [ubicacionesUnicas]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        background:
          "radial-gradient(circle at top left, rgba(19, 117, 162, 0.2), transparent 35%), linear-gradient(180deg, #eef6fb 0%, #dbe7ef 100%)",
      }}
    >
      <header
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid rgba(16, 42, 67, 0.12)",
          background: "rgba(255, 255, 255, 0.86)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", letterSpacing: "0.14em", color: "#486581" }}>
              CITYLIVE
            </div>
            <h1 style={{ margin: 0, fontSize: "28px", color: "#102a43" }}>Monitoreo IoT en tiempo real</h1>
          </div>
          <div style={{ color: "#486581", fontSize: "14px" }}>
            Última sincronización: <strong>{lastSync || "pendiente"}</strong>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: "1400px",
          width: "100%",
          margin: "0 auto",
          padding: "20px 24px 24px",
          display: "grid",
          gap: "20px",
          gridTemplateColumns: isCompact ? "1fr" : "minmax(280px, 360px) minmax(0, 1fr)",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: "16px",
            alignContent: "start",
          }}
        >
          <div
            style={{
              padding: "18px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.92)",
              boxShadow: "0 18px 40px rgba(16, 42, 67, 0.08)",
            }}
          >
            <div style={{ color: "#486581", fontSize: "14px", marginBottom: "8px" }}>Dispositivos activos</div>
            <div style={{ fontSize: "40px", fontWeight: 700, color: "#102a43" }}>{ubicacionesUnicas.length}</div>
            <div style={{ color: "#486581", fontSize: "14px" }}>Ventana activa: últimos 10 minutos</div>
          </div>

          <div
            style={{
              padding: "18px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.92)",
              boxShadow: "0 18px 40px rgba(16, 42, 67, 0.08)",
            }}
          >
            <div style={{ color: "#486581", fontSize: "14px", marginBottom: "8px" }}>Temperatura más alta</div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#d64545" }}>
              {hottest ? `${hottest.temperatura.toFixed(1)} °C` : "--"}
            </div>
            <div style={{ color: "#486581", fontSize: "14px" }}>
              {hottest ? hottest.dispositivoId : "Sin datos"}
            </div>
          </div>

          <div
            style={{
              padding: "18px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.92)",
              boxShadow: "0 18px 40px rgba(16, 42, 67, 0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#102a43" }}>Estado del sistema</div>
            <div style={{ color: error ? "#b42318" : "#0f766e", fontSize: "14px" }}>
              {error ? `Error de red: ${error}` : loading ? "Cargando datos..." : "Conectado al backend"}
            </div>
            {ubicacionesUnicas.length === 0 && !loading ? (
              <div style={{ color: "#486581", fontSize: "14px" }}>
                No hay dispositivos reportando en este momento.
              </div>
            ) : null}
          </div>

          <div
            style={{
              padding: "18px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.92)",
              boxShadow: "0 18px 40px rgba(16, 42, 67, 0.08)",
              display: "grid",
              gap: "12px",
              maxHeight: isCompact ? "unset" : "calc(100vh - 360px)",
              overflow: "auto",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#102a43" }}>Resumen por dispositivo</div>
            {ubicacionesUnicas.map((item) => (
              <article
                key={item.dispositivoId}
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "#f6fbff",
                  border: "1px solid rgba(72, 101, 129, 0.18)",
                }}
              >
                <div style={{ fontWeight: 700, color: "#102a43" }}>{item.dispositivoId}</div>
                <div style={{ color: "#486581", fontSize: "14px" }}>
                  {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                </div>
                <div style={{ marginTop: "6px", color: "#102a43" }}>
                  {item.temperatura.toFixed(1)} °C · {item.descripcion}
                </div>
                <div style={{ color: "#486581", fontSize: "13px", marginTop: "4px" }}>
                  Humedad {item.humedad}% · {formatTimestamp(item.timestamp)}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            minHeight: isCompact ? "60vh" : "70vh",
            borderRadius: "24px",
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(16, 42, 67, 0.12)",
            border: "1px solid rgba(16, 42, 67, 0.08)",
          }}
        >
          <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewport dispositivos={ubicacionesUnicas} />

            {ubicacionesUnicas.map((item) => (
              <Marker key={item.dispositivoId} position={[item.lat, item.lng]}>
                <Popup>
                  <div style={{ minWidth: "180px" }}>
                    <strong>{item.dispositivoId}</strong>
                    <br />
                    🌡️ {item.temperatura.toFixed(1)} °C
                    <br />
                    📍 {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                    <br />
                    💧 {item.humedad}%
                    <br />
                    ☁️ {item.descripcion}
                    <br />
                    🕒 {formatTimestamp(item.timestamp)}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>
      </main>
    </div>
  );
}

export default App;
