#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

const int LED_OK = 2;
const int LED_FAIL = 4;

const char* WIFI_SSID = "TU_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD";

const char* DEVICE_ID = "device_31849";
const float LATITUDE = 3.4510f;
const float LONGITUDE = -76.5322f;

const char* BACKEND_URL = "https://citylive.onrender.com/ubicacion";
const char* DEVICE_API_KEY = "";

const unsigned long WIFI_RETRY_DELAY_MS = 10000UL;
const unsigned long SEND_INTERVAL_MS = 60000UL;
const uint8_t POST_MAX_RETRIES = 3;

const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAwTzELMAkGA1UE
BhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQD
EwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQG
EwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMT
DElTUkcgUm9vdCBYMTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54r
Vygch77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+0TM8ukj1
3Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6UA5/TR5d8mUgjU+g4rk8K
b4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sWT8KOEUt+zwvo/7V3LvSye0rgTBIlDHCN
Aymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyHB5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ
4Q7e2RCOFvu396j3x+UCB5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf
1b0SHzUvKBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWnOlFu
hjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTnjh8BCNAw1FtxNrQH
usEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbwqHyGO0aoSCqI3Haadr8faqU9GY/r
OPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CIrU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4G
A1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY
9umbbjANBgkqhkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ3BebYhtF8GaV
0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KKNFtY2PwByVS5uCbMiogziUwt
hDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJw
TdwJx4nLCgdNbOhdjsnvzqvHu7UrTkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nx
e5AW0wdeRlN8NwdCjNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZA
JzVcoyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq4RgqsahD
YVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPAmRGunUHBcnWEvgJBQl9n
JEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57demyPxgcYxn/eR44/KJ4EBs+lVDR3veyJ
m+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

unsigned long lastWifiAttempt = 0;
unsigned long lastSend = 0;

void updateLeds() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  digitalWrite(LED_OK, connected ? HIGH : LOW);
  digitalWrite(LED_FAIL, connected ? LOW : HIGH);
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    updateLeds();
    return true;
  }

  const unsigned long now = millis();
  if (now - lastWifiAttempt < WIFI_RETRY_DELAY_MS) {
    updateLeds();
    return false;
  }

  lastWifiAttempt = now;
  Serial.printf("\n[WiFi] Conectando a %s\n", WIFI_SSID);

  WiFi.disconnect(true, false);
  delay(250);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print(".");
    updateLeds();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Conectado");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());
    updateLeds();
    return true;
  }

  Serial.println("\n[WiFi] No fue posible conectar");
  updateLeds();
  return false;
}

String buildPayload() {
  StaticJsonDocument<128> payload;
  payload["dispositivoId"] = DEVICE_ID;
  payload["lat"] = LATITUDE;
  payload["lng"] = LONGITUDE;

  String json;
  serializeJson(payload, json);
  return json;
}

bool postUbicacion() {
  if (WiFi.status() != WL_CONNECTED && !connectWiFi()) {
    Serial.println("[HTTP] Sin WiFi, se cancela el envio");
    return false;
  }

  WiFiClientSecure client;
  client.setCACert(ROOT_CA);

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(10000);

  if (!http.begin(client, BACKEND_URL)) {
    Serial.println("[HTTP] No fue posible iniciar la conexion HTTPS");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_API_KEY) > 0) {
    http.addHeader("x-device-key", DEVICE_API_KEY);
  }

  const String payload = buildPayload();
  Serial.print("[HTTP] Enviando payload: ");
  Serial.println(payload);

  const int httpCode = http.POST(payload);

  if (httpCode <= 0) {
    Serial.print("[HTTP] Error de transporte: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }

  const String response = http.getString();
  Serial.printf("[HTTP] Codigo: %d\n", httpCode);
  Serial.print("[HTTP] Respuesta: ");
  Serial.println(response);

  http.end();

  return httpCode >= 200 && httpCode < 300;
}

bool sendWithRetry() {
  for (uint8_t attempt = 1; attempt <= POST_MAX_RETRIES; ++attempt) {
    Serial.printf("[SEND] Intento %u de %u\n", attempt, POST_MAX_RETRIES);

    if (postUbicacion()) {
      Serial.println("[SEND] Ubicacion enviada correctamente");
      return true;
    }

    if (attempt < POST_MAX_RETRIES) {
      Serial.println("[SEND] Reintentando en 3 segundos...");
      delay(3000);
    }
  }

  Serial.println("[SEND] No fue posible enviar la ubicacion");
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_OK, OUTPUT);
  pinMode(LED_FAIL, OUTPUT);
  updateLeds();

  connectWiFi();
  sendWithRetry();
  lastSend = millis();
}

void loop() {
  updateLeds();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    sendWithRetry();
    lastSend = millis();
  }

  delay(250);
}
