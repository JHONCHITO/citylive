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

  throw lastError;
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
