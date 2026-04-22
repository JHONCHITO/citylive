require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/citylive";
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_API_TIMEOUT_MS = Number(process.env.WEATHER_API_TIMEOUT_MS || 8000);
const ACTIVE_WINDOW_MINUTES = Number(process.env.ACTIVE_WINDOW_MINUTES || 10);
const UBICACIONES_TTL_SECONDS = Number(process.env.UBICACIONES_TTL_SECONDS || 86400);
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || "";

if (!WEATHER_API_KEY) {
  console.error("❌ WEATHER_API_KEY no definida");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "32kb" }));

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
});

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
    return { error: "dispositivoId inválido" };
  }

  if (lat === null || lng === null) {
    return { error: "lat/lng inválidos" };
  }

  return { dispositivoId, lat, lng };
}

function requireDeviceKey(req, res, next) {
  if (!DEVICE_API_KEY) {
    next();
    return;
  }

  const providedKey = req.get("x-device-key");

  if (providedKey !== DEVICE_API_KEY) {
    res.status(401).json({ error: "Dispositivo no autorizado" });
    return;
  }

  next();
}

async function obtenerClima(lat, lng) {
  const response = await weatherClient.get("/current.json", {
    params: {
      key: WEATHER_API_KEY,
      q: `${lat},${lng}`,
      aqi: "no",
    },
  });

  const current = response.data?.current;

  if (!current || typeof current.temp_c !== "number") {
    throw new Error("Respuesta de clima inválida");
  }

  return {
    temperatura: current.temp_c,
    humedad: current.humidity,
    descripcion: current.condition?.text || "Sin descripción",
  };
}

function normalizeUbicacion(doc) {
  return {
    dispositivoId: doc.dispositivoId,
    lat: doc.lat,
    lng: doc.lng,
    temperatura: doc.temperatura,
    humedad: doc.humedad,
    descripcion: doc.descripcion,
    timestamp: doc.timestamp,
  };
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "citylive-backend",
    activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
  });
});

app.post("/ubicacion", requireDeviceKey, async (req, res) => {
  const payload = validateUbicacionPayload(req.body);

  if (payload.error) {
    res.status(400).json({ error: payload.error });
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

    res.status(201).json(normalizeUbicacion(ubicacion));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("❌ Error consultando WeatherAPI:", error.response?.data || error.message);
      res.status(502).json({
        error: "No fue posible obtener el clima",
        detalle: error.response?.data || error.message,
      });
      return;
    }

    console.error("❌ Error guardando ubicación:", error.message);
    res.status(500).json({ error: "Error interno guardando ubicación" });
  }
});

app.get("/ubicaciones", async (_req, res) => {
  try {
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000);

    const ubicaciones = await Ubicacion.aggregate([
      { $match: { timestamp: { $gte: activeSince } } },
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
    ]);

    res.json(ubicaciones);
  } catch (error) {
    console.error("❌ Error consultando ubicaciones activas:", error.message);
    res.status(500).json({ error: "Error consultando ubicaciones" });
  }
});

app.get("/historial/:id", async (req, res) => {
  const dispositivoId = parseDeviceId(req.params.id);

  if (!dispositivoId) {
    res.status(400).json({ error: "dispositivoId inválido" });
    return;
  }

  try {
    const historial = await Ubicacion.find({ dispositivoId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json(historial.map(normalizeUbicacion));
  } catch (error) {
    console.error("❌ Error consultando historial:", error.message);
    res.status(500).json({ error: "Error consultando historial" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log("✅ MongoDB conectado");

    app.listen(PORT, () => {
      console.log(`🚀 CITYLIVE backend escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ No fue posible iniciar el backend:", error.message);
    process.exit(1);
  }
}

startServer();
