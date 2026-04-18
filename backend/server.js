// ===============================
// 🚀 CITYLIVE BACKEND PRO FINAL
// ===============================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = "d1bbe40a585a4baa80955926261504";

app.use(cors());
app.use(express.json());

// ===============================
// 🔥 MONGODB
// ===============================
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/citylive")
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.log("❌ Error Mongo:", err));

// ===============================
// 📦 MODELOS
// ===============================
const Ubicacion = mongoose.model("Ubicacion", new mongoose.Schema({
  dispositivoId: String,
  lat: Number,
  lng: Number,
  fecha: { type: Date, default: Date.now }
}));

// ===============================
// 🌦️ CLIMA
// ===============================
app.get("/api/clima", async (req, res) => {
  try {
    const r = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=Cali&aqi=no`
    );

    res.json({
      temperatura: r.data.current.temp_c,
      humedad: r.data.current.humidity,
      presion: r.data.current.pressure_mb,
      descripcion: r.data.current.condition.text
    });
  } catch {
    res.status(500).json({ error: "Error clima" });
  }
});

// ===============================
// 📍 GUARDAR UBICACIÓN
// ===============================
app.post("/ubicacion", async (req, res) => {
  const { dispositivoId, lat, lng } = req.body;

  if (!dispositivoId || !lat || !lng) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  await new Ubicacion({ dispositivoId, lat, lng }).save();
  res.json({ ok: true });
});

// ===============================
// 🔥 🔥 MULTI DISPOSITIVOS PRO 🔥
// ===============================
app.get("/ubicaciones", async (req, res) => {
  const data = await Ubicacion.aggregate([
    { $sort: { fecha: -1 } },
    {
      $group: {
        _id: "$dispositivoId",
        lat: { $first: "$lat" },
        lng: { $first: "$lng" },
        fecha: { $first: "$fecha" },
        dispositivoId: { $first: "$dispositivoId" }
      }
    }
  ]);

  res.json(data);
});

// ===============================
app.listen(PORT, () => {
  console.log("🔥 Server corriendo");
});