#!/usr/bin/env python3
"""
Entrena un modelo YOLO (Ultralytics) usando el dataset unificado creado por
`prepare_unified_dataset.py`, y ejecuta validación y test.

Requisitos:
    pip install ultralytics

Uso de ejemplo:
    python train_unified_yolo.py --model yolov8n.pt --epochs 100 --imgsz 640
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


DEFAULT_DATA_YAML = Path(
    "/media/sergio/DATOS/TPI2/yolo/unified_yolo_dataset/data.yaml"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Entrenar un modelo YOLO usando el dataset unificado "
            "y ejecutar validación/test."
        )
    )
    parser.add_argument(
        "--data",
        type=str,
        default=str(DEFAULT_DATA_YAML),
        help="Ruta a data.yaml del dataset unificado.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="Modelo base de Ultralytics (por ejemplo yolov8n.pt, yolov8s.pt...).",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=10,
        help=(
            "Número de épocas de entrenamiento (por defecto 10 para que sea "
            "asumible en CPU; súbelo si tienes más tiempo/GPU)."
        ),
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=8,
        help="Tamaño de batch (por defecto 8, razonable para CPU).",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=320,
        help=(
            "Tamaño de imagen para entrenamiento/validación "
            "(por defecto 320 para acelerar en CPU)."
        ),
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help=(
            'Dispositivo para entrenar: "cpu" (por defecto) o índice de GPU '
            '(por ejemplo "0" para GPU 0 si tienes NVIDIA/ROCm configurado).'
        ),
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help=(
            "Número de workers del dataloader (0 = sin multiproceso). "
            "En Linux suele ir bien 4 en CPU."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    data_yaml = Path(args.data)
    if not data_yaml.is_file():
        raise FileNotFoundError(f"No se encontró data.yaml en: {data_yaml}")

    dataset_dir = data_yaml.parent

    # Entrenamiento
    model = YOLO(args.model)
    results = model.train(
        data=str(data_yaml),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        project=str(dataset_dir),
        name="hippo_all_animals",
    )

    # Ruta al mejor modelo entrenado
    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    if not best_weights.is_file():
        raise FileNotFoundError(
            f"No se encontró el fichero de pesos entrenado: {best_weights}"
        )

    print(f"Entrenamiento terminado. Pesos guardados en: {best_weights}")

    # Validación en split 'val'
    model = YOLO(str(best_weights))
    print("\n=== Validación (split=val) ===")
    model.val(data=str(data_yaml), split="val")

    # Evaluación en split 'test'
    print("\n=== Evaluación (split=test) ===")
    model.val(data=str(data_yaml), split="test")


if __name__ == "__main__":
    main()


