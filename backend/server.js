require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const MONGO_URI = process.env.MONGO_URI;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_API_TIMEOUT_MS = Number.parseInt(process.env.WEATHER_API_TIMEOUT_MS || "8000", 10);
const ACTIVE_WINDOW_MINUTES = Number.parseInt(process.env.ACTIVE_WINDOW_MINUTES || "10", 10);
const UBICACIONES_TTL_SECONDS = Number.parseInt(process.env.UBICACIONES_TTL_SECONDS || "86400", 10);
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || "";
const WEATHER_API_RETRIES = Number.parseInt(process.env.WEATHER_API_RETRIES || "2", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const APP_NAME = "citylive-backend";

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: APP_NAME,
    message,
    ...meta,
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

function buildStartupConfig() {
  const issues = [];

  if (!Number.isFinite(PORT) || PORT <= 0) {
    issues.push("PORT invalido");
  }

  if (!MONGO_URI) {
    issues.push("MONGO_URI no definida");
  }

  if (!WEATHER_API_KEY) {
    issues.push("WEATHER_API_KEY no definida");
  }

  if (!Number.isFinite(WEATHER_API_TIMEOUT_MS) || WEATHER_API_TIMEOUT_MS < 1000) {
    issues.push("WEATHER_API_TIMEOUT_MS invalido");
  }

  if (!Number.isFinite(ACTIVE_WINDOW_MINUTES) || ACTIVE_WINDOW_MINUTES <= 0) {
    issues.push("ACTIVE_WINDOW_MINUTES invalido");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

const startupConfig = buildStartupConfig();

if (!startupConfig.ok) {
  log("error", "Configuracion invalida", { issues: startupConfig.issues });
  process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", true);

const allowedOrigins =
  CORS_ORIGIN === "*"
    ? "*"
    : CORS_ORIGIN.split(",")
        .map((value) => value.trim())
        .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (allowedOrigins === "*" || !origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
  })
);

app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  log("info", "Request entrante", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  res.on("finish", () => {
    log("info", "Request finalizado", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    log("error", "JSON invalido recibido", { detail: error.message });
    res.status(400).json({
      ok: false,
      error: "JSON invalido",
    });
    return;
  }

  next(error);
});

const ubicacionSchema = new mongoose.Schema(
  {
    dispositivoId: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 64,
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    temperatura: {
      type: Number,
      required: true,
    },
    humedad: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    collection: "ubicaciones",
    versionKey: false,
  }
);

ubicacionSchema.index({ dispositivoId: 1, timestamp: -1 });
if (UBICACIONES_TTL_SECONDS > 0) {
  ubicacionSchema.index({ timestamp: 1 }, { expireAfterSeconds: UBICACIONES_TTL_SECONDS });
}

const Ubicacion = mongoose.model("Ubicacion", ubicacionSchema);

const weatherClient = axios.create({
  baseURL: "https://api.weatherapi.com/v1",
  timeout: WEATHER_API_TIMEOUT_MS,
  validateStatus(status) {
    return status >= 200 && status < 500;
  },
});

const openMeteoClient = axios.create({
  baseURL: "https://api.open-meteo.com/v1",
  timeout: WEATHER_API_TIMEOUT_MS,
  validateStatus(status) {
    return status >= 200 && status < 500;
  },
});

mongoose.connection.on("connected", () => {
  log("info", "MongoDB conectado");
});

mongoose.connection.on("disconnected", () => {
  log("error", "MongoDB desconectado");
});

mongoose.connection.on("error", (error) => {
  log("error", "MongoDB emitio un error", {
    detail: error.message,
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDeviceId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseCoordinate(value, min, max) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return Number(parsed.toFixed(6));
}

function validateUbicacionPayload(body) {
  const dispositivoId = parseDeviceId(body?.dispositivoId);
  const lat = parseCoordinate(body?.lat, -90, 90);
  const lng = parseCoordinate(body?.lng, -180, 180);

  if (!dispositivoId) {
    return {
      ok: false,
      error: "dispositivoId invalido",
      fields: {
        dispositivoId: "Debe tener entre 3 y 64 caracteres y solo usar letras, numeros, guion y guion bajo",
      },
    };
  }

  if (lat === null || lng === null) {
    return {
      ok: false,
      error: "lat/lng invalidos",
      fields: {
        lat: "Debe ser un numero entre -90 y 90",
        lng: "Debe ser un numero entre -180 y 180",
      },
    };
  }

  return {
    ok: true,
    dispositivoId,
    lat,
    lng,
  };
}

function requireDeviceKey(req, res, next) {
  if (!DEVICE_API_KEY) {
    next();
    return;
  }

  const providedKey = req.get("x-device-key");

  if (providedKey !== DEVICE_API_KEY) {
    log("error", "Intento de acceso de dispositivo no autorizado", {
      path: req.originalUrl,
      ip: req.ip,
    });
    res.status(401).json({
      ok: false,
      error: "Dispositivo no autorizado",
    });
    return;
  }

  next();
}

function isRetryableWeatherError(error, status) {
  if (status && [408, 425, 429].includes(status)) {
    return true;
  }

  if (status && status >= 500) {
    return true;
  }

  if (!axios.isAxiosError(error)) {
    return false;
  }

  return ["ECONNABORTED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(error.code || "");
}

function mapOpenMeteoCodeToDescription(code) {
  const descriptions = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna moderada",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia moderada",
    65: "Lluvia intensa",
    71: "Nieve ligera",
    73: "Nieve moderada",
    75: "Nieve intensa",
    80: "Chubascos ligeros",
    81: "Chubascos moderados",
    82: "Chubascos intensos",
    95: "Tormenta",
    96: "Tormenta con granizo ligero",
    99: "Tormenta con granizo fuerte",
  };

  return descriptions[code] || "Condicion no disponible";
}

async function obtenerClimaFallback(lat, lng, cause) {
  const response = await openMeteoClient.get("/forecast", {
    params: {
      latitude: lat,
      longitude: lng,
      current: "temperature_2m,relative_humidity_2m,weather_code",
      timezone: "auto",
    },
  });

  if (response.status >= 400) {
    const apiError = new Error(`Open-Meteo respondio con estado ${response.status}`);
    apiError.status = response.status;
    apiError.payload = response.data;
    throw apiError;
  }

  const current = response.data?.current;
  const temperatura = Number(current?.temperature_2m);
  const humedad = Number(current?.relative_humidity_2m);
  const weatherCode = Number(current?.weather_code);

  if (!Number.isFinite(temperatura) || !Number.isFinite(humedad)) {
    throw new Error("Respuesta invalida de Open-Meteo");
  }

  log("info", "Usando fallback de clima con Open-Meteo", {
    lat,
    lng,
    cause,
  });

  return {
    temperatura: Number(temperatura.toFixed(1)),
    humedad: Math.max(0, Math.min(100, Math.round(humedad))),
    descripcion: mapOpenMeteoCodeToDescription(weatherCode),
  };
}

async function obtenerClima(lat, lng) {
  const maxAttempts = Math.max(1, WEATHER_API_RETRIES + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await weatherClient.get("/current.json", {
        params: {
          key: WEATHER_API_KEY,
          q: `${lat},${lng}`,
          aqi: "no",
        },
      });

      if (response.status >= 400) {
        const apiError = new Error(`WeatherAPI respondio con estado ${response.status}`);
        apiError.status = response.status;
        apiError.payload = response.data;
        throw apiError;
      }

      const current = response.data?.current;
      const temperatura = Number(current?.temp_c);
      const humedad = Number(current?.humidity);
      const descripcion =
        typeof current?.condition?.text === "string" && current.condition.text.trim()
          ? current.condition.text.trim()
          : "Sin descripcion";

      if (!Number.isFinite(temperatura) || !Number.isFinite(humedad)) {
        throw new Error("Respuesta de clima invalida");
      }

      return {
        temperatura: Number(temperatura.toFixed(1)),
        humedad: Math.max(0, Math.min(100, Math.round(humedad))),
        descripcion,
      };
    } catch (error) {
      const status = error.response?.status || error.status;

      log("error", "Error consultando WeatherAPI", {
        attempt,
        maxAttempts,
        status,
        code: error.code,
        detail: error.response?.data || error.payload || error.message,
      });

      lastError = error;

      if (!isRetryableWeatherError(error, status) || attempt === maxAttempts) {
        break;
      }

      await sleep(500 * attempt);
    }
  }

  return obtenerClimaFallback(lat, lng, lastError?.message || "WeatherAPI no disponible");
}

function normalizeUbicacion(doc) {
  const raw = typeof doc?.toObject === "function" ? doc.toObject() : doc;

  return {
    dispositivoId: raw.dispositivoId,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    temperatura: Number(raw.temperatura),
    humedad: Number(raw.humedad),
    descripcion: raw.descripcion,
    timestamp: raw.timestamp,
    stale: Boolean(raw.stale),
  };
}

function buildDashboardHtml() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CityLive Dashboard</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #eef6fb 0%, #dbe7ef 100%);
        color: #102a43;
      }
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
      }
      header {
        padding: 18px 22px;
        background: rgba(255,255,255,0.92);
        border-bottom: 1px solid rgba(16,42,67,0.12);
      }
      header h1 {
        margin: 4px 0 0;
        font-size: 28px;
      }
      .layout {
        display: grid;
        grid-template-columns: 340px 1fr;
        gap: 18px;
        padding: 18px;
      }
      .panel {
        display: grid;
        gap: 14px;
        align-content: start;
      }
      .card {
        background: rgba(255,255,255,0.94);
        border-radius: 18px;
        padding: 16px;
        box-shadow: 0 18px 40px rgba(16,42,67,0.08);
      }
      .big {
        font-size: 38px;
        font-weight: 700;
      }
      #map {
        min-height: 72vh;
        border-radius: 22px;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(16,42,67,0.12);
        border: 1px solid rgba(16,42,67,0.08);
      }
      .list {
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 320px);
        overflow: auto;
      }
      .item {
        padding: 12px;
        border-radius: 14px;
        background: #f6fbff;
        border: 1px solid rgba(72,101,129,0.18);
      }
      .muted {
        color: #486581;
        font-size: 14px;
      }
      .warn {
        color: #9a6700;
      }
      .error {
        color: #b42318;
      }
      @media (max-width: 960px) {
        .layout { grid-template-columns: 1fr; }
        #map { min-height: 60vh; }
        .list { max-height: none; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <div class="muted">CITYLIVE</div>
        <h1>Mapa IoT en tiempo real</h1>
        <div class="muted">Backend integrado en la misma URL</div>
      </header>
      <main class="layout">
        <section class="panel">
          <div class="card">
            <div class="muted">Dispositivos visibles</div>
            <div id="count" class="big">0</div>
            <div class="muted">Refresco automático cada 15 segundos</div>
          </div>
          <div class="card">
            <div class="muted">Estado</div>
            <div id="status">Cargando datos...</div>
            <div id="sync" class="muted">Sin sincronización</div>
          </div>
          <div class="card">
            <div class="muted">Resumen</div>
            <div id="list" class="list"></div>
          </div>
        </section>
        <section id="map"></section>
      </main>
    </div>

    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const defaultCenter = [3.451, -76.5322];
      const map = L.map("map").setView(defaultCenter, 13);
      const markers = new Map();
      const countEl = document.getElementById("count");
      const statusEl = document.getElementById("status");
      const syncEl = document.getElementById("sync");
      const listEl = document.getElementById("list");

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      function formatNumber(value, digits) {
        return Number.isFinite(value) ? value.toFixed(digits) : "--";
      }

      function formatTimestamp(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Sin fecha";
        return date.toLocaleString("es-CO");
      }

      function clearMarkers() {
        for (const marker of markers.values()) {
          map.removeLayer(marker);
        }
        markers.clear();
      }

      function renderList(items) {
        listEl.innerHTML = "";
        if (items.length === 0) {
          listEl.innerHTML = '<div class="muted">No hay datos para mostrar.</div>';
          return;
        }

        for (const item of items) {
          const div = document.createElement("div");
          div.className = "item";
          div.innerHTML =
            "<strong>" + item.dispositivoId + "</strong><br>" +
            '<span class="muted">' + formatNumber(item.lat, 4) + ", " + formatNumber(item.lng, 4) + "</span><br>" +
            "Temperatura: " + formatNumber(item.temperatura, 1) + " °C<br>" +
            "Clima: " + item.descripcion + "<br>" +
            '<span class="muted">' + formatTimestamp(item.timestamp) + (item.stale ? " · último dato conocido" : "") + "</span>";
          listEl.appendChild(div);
        }
      }

      function renderMap(items) {
        clearMarkers();

        if (items.length === 0) {
          map.setView(defaultCenter, 13);
          return;
        }

        const bounds = [];

        for (const item of items) {
          const position = [item.lat, item.lng];
          bounds.push(position);
          const marker = L.marker(position).addTo(map);
          marker.bindPopup(
            "<strong>" + item.dispositivoId + "</strong><br>" +
            "Temperatura: " + formatNumber(item.temperatura, 1) + " °C<br>" +
            "Ubicación: " + formatNumber(item.lat, 5) + ", " + formatNumber(item.lng, 5) + "<br>" +
            "Clima: " + item.descripcion + "<br>" +
            "Actualizado: " + formatTimestamp(item.timestamp) +
            (item.stale ? "<br>Estado: último dato conocido" : "")
          );
          markers.set(item.dispositivoId, marker);
        }

        if (bounds.length === 1) {
          map.setView(bounds[0], 14);
        } else {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        }
      }

      async function loadData() {
        try {
          const response = await fetch("/ubicaciones", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }

          const data = await response.json();
          const items = Array.isArray(data) ? data : [];

          countEl.textContent = String(items.length);
          statusEl.textContent = items.length > 0 ? "Datos cargados correctamente" : "Sin dispositivos visibles";
          statusEl.className = items.length > 0 ? "" : "warn";
          syncEl.textContent = "Última sincronización: " + new Date().toLocaleTimeString("es-CO");

          renderList(items);
          renderMap(items);
        } catch (error) {
          statusEl.textContent = "Error cargando el mapa: " + error.message;
          statusEl.className = "error";
        }
      }

      loadData();
      setInterval(loadData, 15000);
    </script>
  </body>
</html>`;
}

async function getMongoHealth() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return {
      ok: false,
      state: mongoose.connection.readyState,
    };
  }

  await mongoose.connection.db.admin().ping();

  return {
    ok: true,
    state: mongoose.connection.readyState,
    name: mongoose.connection.name,
  };
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: APP_NAME,
    version: "1.1.0",
    endpoints: ["/health", "/ubicacion", "/ubicaciones", "/historial/:id"],
  });
});

app.get("/health", async (_req, res) => {
  try {
    const mongo = await getMongoHealth();
    const statusCode = mongo.ok ? 200 : 503;

    res.status(statusCode).json({
      ok: mongo.ok,
      service: APP_NAME,
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      mongo,
      weatherApiConfigured: Boolean(WEATHER_API_KEY),
      activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
    });
  } catch (error) {
    log("error", "Healthcheck fallo", { detail: error.message });
    res.status(503).json({
      ok: false,
      service: APP_NAME,
      error: "Healthcheck fallido",
      detail: error.message,
    });
  }
});

app.get("/dashboard", (_req, res) => {
  res.type("html").send(buildDashboardHtml());
});

app.post("/ubicacion", requireDeviceKey, async (req, res) => {
  const payload = validateUbicacionPayload(req.body);

  if (!payload.ok) {
    res.status(400).json({
      ok: false,
      error: payload.error,
      fields: payload.fields,
    });
    return;
  }

  try {
    const clima = await obtenerClima(payload.lat, payload.lng);

    const ubicacion = await Ubicacion.create({
      dispositivoId: payload.dispositivoId,
      lat: payload.lat,
      lng: payload.lng,
      temperatura: clima.temperatura,
      humedad: clima.humedad,
      descripcion: clima.descripcion,
      timestamp: new Date(),
    });

    const data = normalizeUbicacion(ubicacion);

    res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    if (axios.isAxiosError(error) || error.status) {
      res.status(502).json({
        ok: false,
        error: "No fue posible obtener el clima desde WeatherAPI",
        detail: error.response?.data || error.payload || error.message,
      });
      return;
    }

    log("error", "Error guardando ubicacion en MongoDB", {
      detail: error.message,
    });

    res.status(500).json({
      ok: false,
      error: "Error interno guardando ubicacion",
    });
  }
});

app.get("/ubicaciones", async (_req, res) => {
  try {
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000);
    const latestPerDevicePipeline = [
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$dispositivoId",
          dispositivoId: { $first: "$dispositivoId" },
          lat: { $first: "$lat" },
          lng: { $first: "$lng" },
          temperatura: { $first: "$temperatura" },
          humedad: { $first: "$humedad" },
          descripcion: { $first: "$descripcion" },
          timestamp: { $first: "$timestamp" },
        },
      },
      { $project: { _id: 0 } },
      { $sort: { timestamp: -1 } },
    ];

    const ubicacionesActivas = await Ubicacion.aggregate([
      { $match: { timestamp: { $gte: activeSince } } },
      ...latestPerDevicePipeline,
    ]);

    const sanitizedActivas = ubicacionesActivas
      .map((item) => normalizeUbicacion({ ...item, stale: false }))
      .filter(
        (item) =>
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng) &&
          Number.isFinite(item.temperatura) &&
          Number.isFinite(item.humedad)
      );

    if (sanitizedActivas.length > 0) {
      res.json(sanitizedActivas);
      return;
    }

    const ultimasUbicaciones = await Ubicacion.aggregate(latestPerDevicePipeline);

    res.json(
      ultimasUbicaciones
        .map((item) => normalizeUbicacion({ ...item, stale: true }))
        .filter(
          (item) =>
            Number.isFinite(item.lat) &&
            Number.isFinite(item.lng) &&
            Number.isFinite(item.temperatura) &&
            Number.isFinite(item.humedad)
        )
    );
  } catch (error) {
    log("error", "Error consultando ubicaciones activas", {
      detail: error.message,
    });
    res.status(500).json({
      ok: false,
      error: "Error consultando ubicaciones",
    });
  }
});

app.get("/historial/:id", async (req, res) => {
  const dispositivoId = parseDeviceId(req.params.id);

  if (!dispositivoId) {
    res.status(400).json({
      ok: false,
      error: "dispositivoId invalido",
    });
    return;
  }

  try {
    const historial = await Ubicacion.find({ dispositivoId }).sort({ timestamp: -1 }).limit(50).lean();

    res.json({
      ok: true,
      dispositivoId,
      total: historial.length,
      data: historial.map(normalizeUbicacion),
    });
  } catch (error) {
    log("error", "Error consultando historial", {
      dispositivoId,
      detail: error.message,
    });
    res.status(500).json({
      ok: false,
      error: "Error consultando historial",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: "Ruta no encontrada",
  });
});

app.use((error, _req, res, _next) => {
  log("error", "Error no controlado en Express", {
    detail: error.message,
  });
  res.status(500).json({
    ok: false,
    error: "Error interno no controlado",
  });
});

let httpServer = null;

async function connectMongo() {
  log("info", "Conectando a MongoDB", {
    timeoutMs: 8000,
  });

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  await mongoose.connection.db.admin().ping();
}

async function startServer() {
  try {
    await connectMongo();

    httpServer = app.listen(PORT, () => {
      log("info", "Servidor iniciado", {
        port: PORT,
      });
    });
  } catch (error) {
    log("error", "No fue posible iniciar el backend", {
      detail: error.message,
    });
    process.exit(1);
  }
}

async function shutdown(signal) {
  log("info", "Cerrando servicio", { signal });

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await mongoose.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    log("error", "Fallo el cierre controlado", { detail: error.message });
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    log("error", "Fallo el cierre controlado", { detail: error.message });
    process.exit(1);
  });
});

startServer();
