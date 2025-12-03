#!/usr/bin/env python3
"""
Script para comprobar si una imagen contiene o no un hipopótamo
utilizando un modelo YOLO (Ultralytics), pensado para usarse tanto
de forma interactiva como desde la Raspi (modo JSON).

Requisitos:
    pip install ultralytics opencv-python

Uso de ejemplo:
    python hippo_inference.py \
        --image /ruta/a/una_imagen.jpg \
        --weights /ruta/al/modelo_hipos.pt \
        --conf 0.4 \
        --show

Modo JSON (útil para automatizar en la Raspi):
    python hippo_inference.py \
        --image /ruta/a/una_imagen.jpg \
        --weights /ruta/al/modelo_hipos.pt \
        --json

Puede usarse tanto con el dataset original de hipopótamos
(['hippopotamus', 'hippos']) como con el dataset unificado, donde
puede aparecer también el nombre 'Hippopotamus' o 'Hippo'.
"""

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import cv2
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Comprobar si una imagen contiene un hipopótamo usando YOLO."
    )
    parser.add_argument(
        "--image",
        type=str,
        required=True,
        help="Ruta a la imagen a evaluar.",
    )
    parser.add_argument(
        "--weights",
        type=str,
        required=True,
        help="Ruta al fichero de pesos (.pt) entrenado para hipopótamos.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.4,
        help="Umbral de confianza mínimo para considerar una detección (por defecto 0.4).",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Mostrar la imagen con las detecciones dibujadas.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Guardar una copia de la imagen con las detecciones dibujadas.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help=(
            "Imprimir la salida en formato JSON (más cómodo para automatizar "
            "desde otros procesos, por ejemplo la Raspi)."
        ),
    )
    return parser.parse_args()


def load_model(weights_path: str) -> YOLO:
    weights = Path(weights_path)
    if not weights.is_file():
        raise FileNotFoundError(f"No se encontró el archivo de pesos: {weights}")
    return YOLO(str(weights))


def get_hippo_class_ids(names_dict) -> List[int]:
    """
    Devuelve los IDs de clase que corresponden a hipopótamos según data.yaml.
    En tu dataset: names = ['hippopotamus', 'hippos'].
    """
    hippo_labels = {"Hippopotamus", "hippopotamus", "hippos", "Hippo"}
    ids: List[int] = []

    # names_dict suele ser {id: "nombre"}
    for cls_id, cls_name in names_dict.items():
        if cls_name in hippo_labels:
            ids.append(int(cls_id))
    return ids


def draw_detections(
    image_path: str,
    detections: List[Tuple[int, float, List[float]]],
    class_names,
    output_path: Path | None,
    show: bool,
) -> None:
    img = cv2.imread(image_path)
    if img is None:
        print(f"Advertencia: no se pudo leer la imagen {image_path} con OpenCV.")
        return

    for cls_id, conf, bbox in detections:
        x1, y1, x2, y2 = map(int, bbox)
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        label = f"{class_names[cls_id]} {conf:.2f}"
        cv2.putText(
            img,
            label,
            (x1, max(0, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

    if output_path is not None:
        cv2.imwrite(str(output_path), img)
        print(f"Imagen con detecciones guardada en: {output_path}")

    if show:
        cv2.imshow("Detecciones hipopótamo", img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()


def main() -> None:
    args = parse_args()

    image_path = Path(args.image)
    if not image_path.is_file():
        raise FileNotFoundError(f"No se encontró la imagen: {image_path}")

    # Carga del modelo YOLO (Ultralytics, versión reciente: v8+)
    model = load_model(args.weights)

    # Inferencia
    results = model(str(image_path), conf=args.conf, verbose=False)
    if not results:
        print("No se recibió ningún resultado de inferencia.")
        return

    result = results[0]
    names = result.names or model.names
    hippo_class_ids = get_hippo_class_ids(names)

    hippo_detections: List[Tuple[int, float, List[float]]] = []

    for box in result.boxes:
        cls_id = int(box.cls)
        conf = float(box.conf)
        bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2]

        if cls_id in hippo_class_ids:
            hippo_detections.append((cls_id, conf, bbox))

    # Estructura de salida común (fácil de parsear)
    result_data = {
        "image": str(image_path),
        "num_hippos": len(hippo_detections),
        "hippos": [
            {
                "class_id": cls_id,
                "class_name": names[cls_id],
                "confidence": conf,
                "bbox_xyxy": bbox,
            }
            for cls_id, conf, bbox in hippo_detections
        ],
    }

    if args.json:
        # Salida limpia en JSON, ideal para integración con otros scripts
        print(json.dumps(result_data, ensure_ascii=False))
    else:
        # Salida amigable por consola
        print(f"Imagen analizada: {image_path}")
        if hippo_detections:
            print(
                f"Resultado: HIPOPÓTAMO DETECTADO "
                f"({len(hippo_detections)} detecciones)"
            )
            for i, det in enumerate(result_data["hippos"], start=1):
                x1, y1, x2, y2 = det["bbox_xyxy"]
                print(
                    f"  #{i}: clase='{det['class_name']}', "
                    f"conf={det['confidence']:.3f}, "
                    f"bbox=[{x1:.1f}, {y1:.1f}, {x2:.1f}, {y2:.1f}]"
                )
        else:
            print("Resultado: NO se detectó hipopótamo con el umbral dado.")

    # Dibujar y opcionalmente mostrar/guardar la imagen con bbox
    if args.show or args.save:
        output_path = None
        if args.save:
            output_path = image_path.with_name(image_path.stem + "_hippo_pred.jpg")
        draw_detections(
            str(image_path),
            hippo_detections,
            names,
            output_path,
            show=args.show,
        )


if __name__ == "__main__":
    main()


