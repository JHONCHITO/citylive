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

// 🔑 API KEY
const API_KEY = process.env.WEATHER_API_KEY || "TU_API_KEY";

// ===============================
// 🔐 MIDDLEWARES
// ===============================
app.use(cors());
app.use(express.json());

// ===============================
// 🔥 CONEXIÓN SEGURA A MONGO
// ===============================
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/citylive"; // fallback local

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.log("❌ Error Mongo:", err.message);
    console.log("⚠️ Usando modo sin base de datos (solo pruebas)");
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
// 🌦️ CLIMA
// ===============================
app.get("/api/clima", async (req, res) => {
  try {
    let { lat, lng } = req.query;

    lat = parseFloat(lat);
    lng = parseFloat(lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Coordenadas inválidas" });
    }

    const r = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${lat},${lng}&aqi=no`
    );

    res.json({
      temperatura: r.data.current.temp_c,
      humedad: r.data.current.humidity,
      presion: r.data.current.pressure_mb,
      descripcion: r.data.current.condition.text
    });

  } catch (err) {
    console.log("❌ ERROR CLIMA:", err.message);
    res.status(500).json({ error: "Error clima" });
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

    // 🔥 si Mongo falla, igual responde OK
    try {
      await new Ubicacion({ dispositivoId, lat, lng }).save();
    } catch {
      console.log("⚠️ No se guardó en DB (modo offline)");
    }

    res.json({ ok: true });

  } catch (err) {
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

  } catch {
    res.json([]); // 👈 evita que el frontend falle
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

  } catch {
    res.json([]);
  }
});

// ===============================
app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING http://localhost:${PORT}`);
});