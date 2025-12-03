/**
 * Archivo de Configuración para ESP32-CAM (proyecto TPI2)
 *
 * IMPORTANTE: Modifica estos valores según tu configuración de red y servidor.
 * Este archivo actúa como el "ambiente" equivalente a un .env en la Raspberry.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// CONFIGURACIÓN DE WIFI
// ============================================================================

// Reemplaza con tus credenciales de WiFi
#define WIFI_SSID "LUGARPEN"
#define WIFI_PASSWORD "Chelu2025"

// Tiempo máximo de espera para conectar a WiFi (milisegundos)
#define WIFI_TIMEOUT 60000

// ============================================================================
// CONFIGURACIÓN DEL SERVIDOR FLASK (RASPBERRY / BACKEND)
// ============================================================================

// IP del servidor Flask (reemplaza con la IP de tu computadora o Raspberry en la red local)
// Para obtener tu IP:
// - Linux: ip addr show o hostname -I
// - Windows: ipconfig
// - Mac: ifconfig
#define SERVER_IP "192.168.1.6"

// Puerto del servidor Flask
#define SERVER_PORT 3001

// Macro auxiliar para convertir número a string
#define STR_HELPER(x) #x
#define STR(x) STR_HELPER(x)

// ID de la cámara en el backend (debe coincidir con el ID que ves en el frontend)
// EJEMPLO: "cam-01", "esp32-01", etc.
// TODO: REEMPLAZAR por el ID real de tu cámara
#define CAMERA_ID "1764782851247"

// ¿Usar HTTPS? (normalmente false en entorno local/LAN)
#define USE_HTTPS false

#if USE_HTTPS
  #define PROTOCOL_HTTP "https"
#else
  #define PROTOCOL_HTTP "http"
#endif

// URL base de la API (ej: http://10.x.x.x:3001)
#define BASE_HTTP_URL PROTOCOL_HTTP "://" SERVER_IP ":" STR(SERVER_PORT)

// Token de autenticación compartido con el backend (opcional).
// Debe coincidir con la variable de entorno CAMERA_API_TOKEN que uses al arrancar server.js.
// Si no usas autenticación, deja la cadena vacía "".
#define CAMERA_API_TOKEN "tu_token_secreto_compartido"

// URLs completas de endpoints que espera server.js (API TPI2, mismo esquema que Raspberry)
// Control de acciones (foto / streaming)
// GET /api/camera/:cameraId/take-photo-or-video
#define SERVER_URL_CAPTURE           BASE_HTTP_URL "/api/camera/"  CAMERA_ID "/take-photo-or-video"

// Subida de fotos puntuales (snapshots)
// POST /api/cameras/:cameraId/photo  (multipart/form-data, campo "image")
#define SERVER_URL_UPLOAD            BASE_HTTP_URL "/api/cameras/" CAMERA_ID "/photo"

// Frames en vivo para streaming y generación de vídeo
// POST /api/cameras/:cameraId/live-frame (multipart/form-data, campo "image")
#define SERVER_URL_STREAM            BASE_HTTP_URL "/api/cameras/" CAMERA_ID "/live-frame"

// No hay un endpoint equivalente a STREAMING_STATUS en la API TPI2; esta macro queda sin uso.
#define SERVER_URL_STREAMING_STATUS  BASE_HTTP_URL "/api/streaming-status"

// ============================================================================
// CONFIGURACIÓN DE LA CÁMARA
// ============================================================================

// Modelo de cámara (AI-Thinker ESP32-CAM)
#define CAMERA_MODEL_AI_THINKER

// Resolución de imagen
// Opciones disponibles:
// FRAMESIZE_QVGA    (320x240)
// FRAMESIZE_VGA     (640x480)   <- Recomendado para captura
// FRAMESIZE_SVGA    (800x600)
// FRAMESIZE_XGA     (1024x768)
// FRAMESIZE_UXGA    (1600x1200)
#define FRAME_SIZE_CAPTURE FRAMESIZE_VGA     // Para fotos capturadas
#define FRAME_SIZE_STREAM  FRAMESIZE_QVGA    // Para streaming (menor resolución = más FPS)

// Calidad JPEG (0-63, menor número = mejor calidad, mayor tamaño)
#define JPEG_QUALITY_CAPTURE 10   // Alta calidad para fotos
#define JPEG_QUALITY_STREAM  20   // Calidad media para streaming

// ============================================================================
// CONFIGURACIÓN DE TEMPORIZACIÓN
// ============================================================================

// Intervalo para verificar si debe capturar foto (milisegundos)
#define CAPTURE_CHECK_INTERVAL 1000  // 1 segundo

// Intervalo para verificar si debe hacer streaming (milisegundos)
#define STREAMING_CHECK_INTERVAL 5000  // 5 segundos

// Delay entre frames de streaming (milisegundos)
// Valores más bajos = más FPS pero más carga de red
#define STREAMING_FRAME_DELAY 100  // ~10 FPS

// Timeout para peticiones HTTP (milisegundos)
#define HTTP_TIMEOUT 5000

// ============================================================================
// CONFIGURACIÓN DE DEBUG
// ============================================================================

// Habilitar mensajes de debug en Serial Monitor
#define DEBUG_MODE true

// Macros para imprimir mensajes de debug
#if DEBUG_MODE
  #define DEBUG_PRINT(x) Serial.print(x)
  #define DEBUG_PRINTLN(x) Serial.println(x)
  #define DEBUG_PRINTF(x, ...) Serial.printf(x, __VA_ARGS__)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINTF(x, ...)
#endif

// ============================================================================
// CONFIGURACIÓN DE LED / FLASH
// ============================================================================

// Pin del LED flash (en AI-Thinker ESP32-CAM suele ser GPIO 4)
#define LED_FLASH_PIN 4

// Usar flash al capturar foto
#define USE_FLASH false

#endif // CONFIG_H


