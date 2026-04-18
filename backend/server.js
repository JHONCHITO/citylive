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

// 🔑 API KEY (MEJOR DESDE .env)
const API_KEY = process.env.WEATHER_API_KEY || "TU_API_KEY_AQUI";

app.use(cors());
app.use(express.json());

// ===============================
// 🔥 MONGODB
// ===============================
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/citylive", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.log("❌ Error Mongo:", err));

// ===============================
// 📦 MODELO
// ===============================
const Ubicacion = mongoose.model("Ubicacion", new mongoose.Schema({
  dispositivoId: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  fecha: { type: Date, default: Date.now }
}));

// ===============================
// 🧪 HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.send("🚀 CITYLIVE API OK");
});

// ===============================
// 🌦️ CLIMA DINÁMICO
// ===============================
app.get("/api/clima", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "Faltan coordenadas" });
    }

    const url = `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${lat},${lng}&aqi=no`;

    const r = await axios.get(url);

    res.json({
      temperatura: r.data.current.temp_c,
      humedad: r.data.current.humidity,
      presion: r.data.current.pressure_mb,
      descripcion: r.data.current.condition.text
    });

  } catch (err) {
    console.log("❌ ERROR CLIMA:", err.message);
    res.status(500).json({ error: "Error obteniendo clima" });
  }
});

// ===============================
// 📍 GUARDAR UBICACIÓN (ANTI-SPAM)
// ===============================
app.post("/ubicacion", async (req, res) => {
  try {
    const { dispositivoId, lat, lng } = req.body;

    if (!dispositivoId || lat == null || lng == null) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    // 🔥 evitar duplicados seguidos
    const ultima = await Ubicacion.findOne({ dispositivoId }).sort({ fecha: -1 });

    if (ultima) {
      const mismaPos =
        Math.abs(ultima.lat - lat) < 0.00001 &&
        Math.abs(ultima.lng - lng) < 0.00001;

      if (mismaPos) {
        return res.json({ ok: true, msg: "Sin cambios" });
      }
    }

    await new Ubicacion({ dispositivoId, lat, lng }).save();

    res.json({ ok: true });

  } catch (err) {
    console.log("❌ ERROR GUARDANDO:", err.message);
    res.status(500).json({ error: "Error guardando ubicación" });
  }
});

// ===============================
// 🔥 ACTIVOS (ÚLTIMOS 15 SEGUNDOS)
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
          fecha: { $first: "$fecha" },
          dispositivoId: { $first: "$dispositivoId" }
        }
      }
    ]);

    res.json(data);

  } catch (err) {
    console.log("❌ ERROR ACTIVOS:", err.message);
    res.status(500).json({ error: "Error obteniendo activos" });
  }
});

// ===============================
// 📊 HISTORIAL POR DISPOSITIVO
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
    res.status(500).json({ error: "Error historial" });
  }
});

// ===============================
// 🧠 INFO ACTIVOS
// ===============================
app.get("/activos", async (req, res) => {
  try {
    const hace15s = new Date(Date.now() - 15000);

    const count = await Ubicacion.countDocuments({
      fecha: { $gte: hace15s }
    });

    res.json({ activos: count });

  } catch {
    res.status(500).json({ error: "Error activos count" });
  }
});

// ===============================
// 🧹 LIMPIAR (SOLO DEV)
// ===============================
app.get("/limpiar", async (req, res) => {
  await Ubicacion.deleteMany({});
  res.send("🧹 Base limpiada");
});

// ===============================
app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING http://localhost:${PORT}`);
});