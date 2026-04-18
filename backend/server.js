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

// 🔑 API KEY
const API_KEY = "d1bbe40a585a4baa80955926261504";

// ===============================
// 🔐 MIDDLEWARES
// ===============================
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
const IoT = mongoose.model("IoT", new mongoose.Schema({
  temp: Number,
  hum: Number,
  pres: Number,
  desc: String,
  fecha: { type: Date, default: Date.now }
}));

const Ubicacion = mongoose.model("Ubicacion", new mongoose.Schema({
  dispositivoId: String,
  lat: Number,
  lng: Number,
  fecha: { type: Date, default: Date.now }
}));

// ===============================
// 🏠 ROOT
// ===============================
app.get("/", (req, res) => {
  res.send("🚀 API CITYLIVE FUNCIONANDO");
});

// ===============================
// 🧪 TEST
// ===============================
app.get("/test", (req, res) => {
  res.json({ ok: true });
});

// ===============================
// 🌦️ CLIMA
// ===============================
app.get("/api/clima", async (req, res) => {
  try {
    const response = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=Cali&aqi=no`
    );

    const data = response.data;

    res.json({
      temperatura: data.current.temp_c,
      humedad: data.current.humidity,
      presion: data.current.pressure_mb,
      descripcion: data.current.condition.text
    });

  } catch (error) {
    res.status(500).json({ error: "Error clima" });
  }
});

// ===============================
// 📡 IoT
// ===============================
app.post("/api/iot", async (req, res) => {
  try {
    const data = new IoT(req.body);
    await data.save();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error guardando IoT" });
  }
});

app.get("/api/iot", async (req, res) => {
  const datos = await IoT.find().sort({ fecha: -1 }).limit(10);
  res.json(datos);
});

// ===============================
// 📍 UBICACIÓN
// ===============================

// 👉 GUARDAR
app.post("/ubicacion", async (req, res) => {
  try {
    const { dispositivoId, lat, lng } = req.body;

    if (!dispositivoId || !lat || !lng) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const data = new Ubicacion({ dispositivoId, lat, lng });
    await data.save();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error ubicación" });
  }
});

// 👉 ÚLTIMA UBICACIÓN POR DISPOSITIVO
app.get("/ubicacion/:id", async (req, res) => {
  const data = await Ubicacion.findOne({
    dispositivoId: req.params.id
  }).sort({ fecha: -1 });

  res.json(data);
});

// 👉 HISTORIAL POR DISPOSITIVO
app.get("/ubicaciones/:id", async (req, res) => {
  const data = await Ubicacion.find({
    dispositivoId: req.params.id
  }).sort({ fecha: -1 }).limit(50);

  res.json(data);
});

// ===============================
// 🔥 🔥 ENDPOINT PRO 🔥 🔥
// 👉 FILTRAR POR QUERY (IMPORTANTE)
// ===============================
app.get("/ubicaciones", async (req, res) => {
  try {
    const { id } = req.query;

    let filtro = {};

    // 👉 si envías ?id=celular_1 solo muestra ese
    if (id) {
      filtro.dispositivoId = id;
    }

    const data = await Ubicacion.find(filtro)
      .sort({ fecha: -1 })
      .limit(100);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo ubicaciones" });
  }
});

// ===============================
// 🚀 START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`🔥 http://localhost:${PORT}`);
});

// ===============================
// 🔥 SIMULADOR (OPCIONAL)
// ===============================
setInterval(async () => {
  try {
    const lat = 3.45 + (Math.random() * 0.01);
    const lng = -76.53 + (Math.random() * 0.01);

    await new Ubicacion({
      dispositivoId: "esp32_1",
      lat,
      lng
    }).save();

    console.log("📍 Ubicación simulada");
  } catch (err) {
    console.log("Error simulador:", err);
  }
}, 10000);