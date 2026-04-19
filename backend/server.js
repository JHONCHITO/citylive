// ===============================
// 🚀 CITYLIVE BACKEND PRO FINAL++
// ===============================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 API KEY (OBLIGATORIO)
const API_KEY = process.env.WEATHER_API_KEY;

// ===============================
// 🔐 MIDDLEWARES
// ===============================
app.use(cors());
app.use(express.json());

// ===============================
// 🔥 VALIDAR API KEY
// ===============================
if (!API_KEY) {
  console.log("❌ ERROR: WEATHER_API_KEY NO DEFINIDA");
  console.log("👉 agrega tu API key en el .env");
}

// ===============================
// 🔥 MONGODB
// ===============================
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/citylive";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.log("❌ Error Mongo:", err.message);
  });

// ===============================
// 📦 MODELO
// ===============================
const Ubicacion = mongoose.model("Ubicacion", new mongoose.Schema({
  dispositivoId: String,
  lat: Number,
  lng: Number,
  fecha: { type: Date, default: Date.now }
}));

// ===============================
// 🧪 ROOT
// ===============================
app.get("/", (req, res) => {
  res.send("🚀 CITYLIVE API FUNCIONANDO");
});

// ===============================
// 🌦️ CLIMA (ARREGLADO)
// ===============================
app.get("/api/clima", async (req, res) => {
  try {
    let { lat, lng } = req.query;

    lat = parseFloat(lat);
    lng = parseFloat(lng);

    console.log("📍 REQUEST CLIMA:", lat, lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Coordenadas inválidas" });
    }

    if (!API_KEY) {
      return res.status(500).json({ error: "API KEY no configurada" });
    }

    const url = `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${lat},${lng}&aqi=no`;

    const r = await axios.get(url);

    console.log("🌦️ RESPUESTA:", r.data.current);

    res.json({
      temperatura: r.data.current.temp_c,
      humedad: r.data.current.humidity,
      presion: r.data.current.pressure_mb,
      descripcion: r.data.current.condition.text
    });

  } catch (err) {
    console.log("❌ ERROR CLIMA:", err.response?.data || err.message);

    res.status(500).json({
      error: "Error clima",
      detalle: err.response?.data || err.message
    });
  }
});

// ===============================
// 📍 GUARDAR UBICACIÓN
// ===============================
app.post("/ubicacion", async (req, res) => {
  try {
    const { dispositivoId, lat, lng } = req.body;

    if (!dispositivoId || lat == null || lng == null) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    await new Ubicacion({ dispositivoId, lat, lng }).save();

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ ERROR GUARDAR:", err.message);
    res.status(500).json({ error: "Error guardando" });
  }
});

// ===============================
// 🔥 ACTIVOS
// ===============================
app.get("/ubicaciones", async (req, res) => {
  try {
    const hace15s = new Date(Date.now() - 15000);

    const data = await Ubicacion.aggregate([
      { $match: { fecha: { $gte: hace15s } } },
      { $sort: { fecha: -1 } },
      {
        $group: {
          _id: "$dispositivoId",
          lat: { $first: "$lat" },
          lng: { $first: "$lng" },
          dispositivoId: { $first: "$dispositivoId" }
        }
      }
    ]);

    res.json(data);

  } catch (err) {
    console.log("❌ ERROR ACTIVOS:", err.message);
    res.json([]);
  }
});

// ===============================
// 📊 HISTORIAL
// ===============================
app.get("/historial/:id", async (req, res) => {
  try {
    const data = await Ubicacion.find({
      dispositivoId: req.params.id
    })
      .sort({ fecha: -1 })
      .limit(50);

    res.json(data);

  } catch (err) {
    console.log("❌ ERROR HISTORIAL:", err.message);
    res.json([]);
  }
});

// ===============================
app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING http://localhost:${PORT}`);
});