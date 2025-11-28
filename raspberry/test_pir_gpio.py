#!/usr/bin/env python3
"""
Script de prueba simple para verificar la lectura del GPIO4 (BCM 4)
y activar una salida digital cuando detecta 3.3V.

Uso:
  - Conecta GPIO4 (BCM) a 3.3V mediante un pulsador o cable (GND común).
  - Opcional: conecta un LED + resistencia entre GPIO17 (BCM) y GND.
  - Ejecuta: python3 test_pir_gpio.py
"""

import time

import RPi.GPIO as GPIO  # type: ignore[import-not-found]

PIR_PIN = 4   # Entrada (BCM 4)
OUT_PIN = 17  # Salida para LED / prueba


def main() -> None:
  GPIO.setmode(GPIO.BCM)

  # Entrada con pull-down interno
  GPIO.setup(PIR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
  # Salida para verificar (por ejemplo un LED)
  GPIO.setup(OUT_PIN, GPIO.OUT)
  GPIO.output(OUT_PIN, GPIO.LOW)

  print("Probando GPIO4 como entrada (BCM 4).")
  print("Conecta GPIO4 a 3.3V para simular 'presencia'. CTRL+C para salir.")

  try:
    while True:
      value = GPIO.input(PIR_PIN)
      if value == GPIO.HIGH:
        GPIO.output(OUT_PIN, GPIO.HIGH)
        print("GPIO4 = ALTO (3.3V) -> salida ACTIVADA")
      else:
        GPIO.output(OUT_PIN, GPIO.LOW)

      time.sleep(0.1)
  except KeyboardInterrupt:
    print("\nSaliendo...")
  finally:
    GPIO.output(OUT_PIN, GPIO.LOW)
    GPIO.cleanup()


if __name__ == "__main__":
  main()


