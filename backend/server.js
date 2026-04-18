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

const API_KEY = process.env.WEATHER_API_KEY || "TU_API_KEY_AQUI";

app.use(cors());
app.use(express.json());

// ===============================
// 🔥 MONGODB
// ===============================
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/citylive")
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.log("❌ Error Mongo:", err));

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
  res.send("🚀 CITYLIVE API OK");
});

// ===============================
// 🌦️ CLIMA (CORREGIDO)
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
// 📍 GUARDAR UBICACIÓN (MEJORADO)
// ===============================
app.post("/ubicacion", async (req, res) => {
  try {
    const { dispositivoId, lat, lng } = req.body;

    if (!dispositivoId || lat == null || lng == null) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    // 🔥 validar números
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Coordenadas inválidas" });
    }

    // 🔥 evitar duplicados
    const ultima = await Ubicacion.findOne({ dispositivoId }).sort({ fecha: -1 });

    if (ultima) {
      const igual =
        Math.abs(ultima.lat - lat) < 0.00001 &&
        Math.abs(ultima.lng - lng) < 0.00001;

      if (igual) return res.json({ ok: true, msg: "Sin cambios" });
    }

    await new Ubicacion({ dispositivoId, lat, lng }).save();

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ ERROR GUARDAR:", err.message);
    res.status(500).json({ error: "Error guardando" });
  }
});

// ===============================
// 🔥 ACTIVOS (MEJORADO)
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
    res.status(500).json({ error: "Error activos" });
  }
});

// ===============================
// 📊 HISTORIAL (MEJORADO)
// ===============================
app.get("/historial/:id", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const data = await Ubicacion.find({
      dispositivoId: req.params.id
    })
      .sort({ fecha: -1 })
      .limit(limit);

    res.json(data);

  } catch {
    res.status(500).json({ error: "Error historial" });
  }
});

// ===============================
// 🧠 INFO ACTIVOS
// ===============================
app.get("/activos", async (req, res) => {
  const hace15s = new Date(Date.now() - 15000);

  const count = await Ubicacion.countDocuments({
    fecha: { $gte: hace15s }
  });

  res.json({ activos: count });
});

// ===============================
// 🧹 LIMPIAR
// ===============================
app.get("/limpiar", async (req, res) => {
  await Ubicacion.deleteMany({});
  res.send("🧹 Base limpia");
});

// ===============================
// 🔥 OPCIONAL ESP32 (COMPATIBLE)
// ===============================
app.post("/api/iot", async (req, res) => {
  console.log("📡 ESP32:", req.body);
  res.json({ ok: true });
});

// ===============================
app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING http://localhost:${PORT}`);
});