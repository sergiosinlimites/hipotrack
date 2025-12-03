#!/usr/bin/env python3
"""
Prepara un único dataset YOLO con:
- animales de `animals/archive/{train,test}` (con sus bboxes en txt)
- hipopótamos de `hipos/train/{images,labels}` (YOLO ya preparado)
- (opcionalmente) imágenes de fondo en `general/` sin bboxes

Salida: `yolo/unified_yolo_dataset/` con la estructura:
  unified_yolo_dataset/
    images/{train,val,test}
    labels/{train,val,test}
    data.yaml
    classes.txt

Se hace un único split 80/10/10 global para todas las imágenes.
Las clases de hipopótamo se unifican (Hippopotamus / hippopotamus / hippos / Hippo)
en una sola clase con un único id.
"""

from __future__ import annotations

import random
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image


# Rutas base (ajusta si cambias el proyecto de sitio)
YOLO_ROOT = Path("/media/sergio/DATOS/TPI2/yolo")
ANIMALS_ROOT = YOLO_ROOT / "animals" / "archive"
HIPOS_TRAIN_ROOT = YOLO_ROOT / "hipos" / "train"
GENERAL_ROOT = YOLO_ROOT / "general"
OUT_ROOT = YOLO_ROOT / "unified_yolo_dataset"

RANDOM_SEED = 42
TRAIN_RATIO, VAL_RATIO, TEST_RATIO = 0.8, 0.1, 0.1


def ensure_clean_dirs() -> None:
    """
    Crea (o limpia) la carpeta de salida con la estructura estándar de YOLO.
    NO borra manualmente nada fuera de OUT_ROOT.
    """
    if OUT_ROOT.exists():
        # Borramos para evitar mezclar ejecuciones anteriores.
        shutil.rmtree(OUT_ROOT)

    for split in ("train", "val", "test"):
        (OUT_ROOT / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUT_ROOT / "labels" / split).mkdir(parents=True, exist_ok=True)


def parse_animals_label_line(line: str) -> Optional[Tuple[str, float, float, float, float]]:
    """
    Formato esperado en animals:
        'Brown bear 700.16 149.9 1023.36 495.91'

    -> (class_name, xmin, ymin, xmax, ymax)
    """
    tokens = line.strip().split()
    if len(tokens) < 5:
        return None
    try:
        x_min, y_min, x_max, y_max = map(float, tokens[-4:])
    except ValueError:
        return None
    class_name = " ".join(tokens[:-4])
    return class_name, x_min, y_min, x_max, y_max


def load_animals_samples() -> Tuple[List[Dict], Dict[str, int]]:
    """
    Recorre animals/archive/{train,test} y devuelve:
      - samples: lista de dicts con info de cada imagen
      - class_to_id: mapping nombre_clase -> id entero provisional
    """
    samples: List[Dict] = []
    class_to_id: Dict[str, int] = {}
    next_id = 0

    for split in ("train", "test"):
        split_dir = ANIMALS_ROOT / split
        if not split_dir.is_dir():
            continue

        for class_dir in sorted(d for d in split_dir.iterdir() if d.is_dir()):
            if class_dir.name == "Label":
                continue

            label_subdir = class_dir / "Label"

            # Buscamos un txt de ejemplo para determinar el nombre de clase
            example_label: Optional[Path] = None
            if label_subdir.is_dir():
                for lf in label_subdir.glob("*.txt"):
                    example_label = lf
                    break
            else:
                for lf in class_dir.glob("*.txt"):
                    example_label = lf
                    break

            if example_label is None:
                # Puede haber clases sin labels, las ignoramos
                continue

            with example_label.open("r") as f:
                first_line = f.readline()

            parsed = parse_animals_label_line(first_line)
            if parsed is None:
                continue
            class_name, *_ = parsed

            if class_name not in class_to_id:
                class_to_id[class_name] = next_id
                next_id += 1

            # Ahora añadimos todas las imágenes de esa clase
            for img_path in class_dir.glob("*.jpg"):
                stem = img_path.stem
                if label_subdir.is_dir():
                    label_path = label_subdir / f"{stem}.txt"
                else:
                    label_path = class_dir / f"{stem}.txt"

                if not label_path.is_file():
                    continue

                samples.append(
                    {
                        "src_type": "animals",
                        "img_path": img_path,
                        "label_path": label_path,
                    }
                )

    return samples, class_to_id


def normalize_xyxy_to_yolo(
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
    img_w: int,
    img_h: int,
) -> Tuple[float, float, float, float]:
    x_c = ((x_min + x_max) / 2.0) / img_w
    y_c = ((y_min + y_max) / 2.0) / img_h
    w = (x_max - x_min) / img_w
    h = (y_max - y_min) / img_h
    return x_c, y_c, w, h


def load_hipos_samples() -> List[Dict]:
    """
    Lee las imágenes y labels preparados por Roboflow en hipos/train.
    """
    img_dir = HIPOS_TRAIN_ROOT / "images"
    label_dir = HIPOS_TRAIN_ROOT / "labels"

    samples: List[Dict] = []
    if not img_dir.is_dir() or not label_dir.is_dir():
        return samples

    for img_path in img_dir.glob("*.jpg"):
        stem = img_path.stem
        label_path = label_dir / f"{stem}.txt"
        if not label_path.is_file():
            continue
        samples.append(
            {
                "src_type": "hipos",
                "img_path": img_path,
                "label_path": label_path,
            }
        )
    return samples


def load_general_samples() -> List[Dict]:
    """
    (Opcional) Lee imágenes en yolo/general como negativos (sin objetos).
    """
    samples: List[Dict] = []
    if not GENERAL_ROOT.is_dir():
        return samples

    for img_path in GENERAL_ROOT.rglob("*.jpg"):
        samples.append(
            {
                "src_type": "general",
                "img_path": img_path,
                "label_path": None,
            }
        )
    return samples


def main() -> None:
    random.seed(RANDOM_SEED)

    # 1) Cargamos animals
    animals_samples, class_to_id = load_animals_samples()

    # 2) Definimos alias de hipopótamo y su id unificado
    hippo_aliases = {"Hippopotamus", "hippopotamus", "hippos", "Hippo"}
    hippo_class_name: Optional[str] = None
    for name in ("Hippopotamus", "hippopotamus", "hippos", "Hippo"):
        if name in class_to_id:
            hippo_class_name = name
            break

    if hippo_class_name is None:
        # Si por algún motivo no existe en animals, creamos la clase.
        hippo_class_name = "Hippopotamus"
        class_to_id[hippo_class_name] = max(class_to_id.values(), default=-1) + 1

    hippo_class_id = class_to_id[hippo_class_name]

    # 3) Cargamos hipos de Roboflow
    hipos_samples = load_hipos_samples()

    # 4) (Opcional) Cargamos negativos de 'general'
    #    De momento NO los usamos; si en el futuro quieres añadir
    #    imágenes de fondo sin objetos, descomenta la línea siguiente
    #    y súmalas a all_samples.
    # general_samples = load_general_samples()

    all_samples = animals_samples + hipos_samples
    if not all_samples:
        raise RuntimeError("No se encontraron imágenes en animals/hipos/general.")

    # 5) Preparamos carpeta de salida
    ensure_clean_dirs()

    # 6) Split 80/10/10
    random.shuffle(all_samples)
    n = len(all_samples)
    n_train = int(TRAIN_RATIO * n)
    n_val = int(VAL_RATIO * n)

    splits: List[str] = []
    for idx in range(n):
        if idx < n_train:
            splits.append("train")
        elif idx < n_train + n_val:
            splits.append("val")
        else:
            splits.append("test")

    # 7) Copiamos imágenes y convertimos labels
    for sample, split in zip(all_samples, splits):
        img_path: Path = sample["img_path"]
        label_path: Optional[Path] = sample["label_path"]
        src_type: str = sample["src_type"]

        dest_img_dir = OUT_ROOT / "images" / split
        dest_lbl_dir = OUT_ROOT / "labels" / split

        dest_img = dest_img_dir / img_path.name
        dest_lbl = dest_lbl_dir / f"{img_path.stem}.txt"

        dest_img_dir.mkdir(parents=True, exist_ok=True)
        dest_lbl_dir.mkdir(parents=True, exist_ok=True)

        shutil.copy2(img_path, dest_img)

        if src_type == "general":
            # Imagen de fondo sin objetos
            dest_lbl.write_text("")
            continue

        if not label_path or not label_path.is_file():
            # Por seguridad, si falta el label lo consideramos sin objetos
            dest_lbl.write_text("")
            continue

        if src_type == "animals":
            # Formato propio del dataset de animals: Clase xmin ymin xmax ymax
            with Image.open(img_path) as im:
                img_w, img_h = im.size

            yolo_lines: List[str] = []
            with label_path.open("r") as f:
                for line in f:
                    parsed = parse_animals_label_line(line)
                    if parsed is None:
                        continue
                    class_name, x_min, y_min, x_max, y_max = parsed

                    # Unificamos alias de hipopótamo
                    if class_name in hippo_aliases:
                        class_name = hippo_class_name

                    if class_name not in class_to_id:
                        class_to_id[class_name] = max(class_to_id.values()) + 1

                    class_id = class_to_id[class_name]
                    x_c, y_c, w, h = normalize_xyxy_to_yolo(
                        x_min, y_min, x_max, y_max, img_w, img_h
                    )
                    yolo_lines.append(
                        f"{class_id} {x_c:.6f} {y_c:.6f} {w:.6f} {h:.6f}"
                    )

            dest_lbl.write_text("\n".join(yolo_lines) + ("\n" if yolo_lines else ""))

        elif src_type == "hipos":
            # Labels ya están en formato YOLO; solo remapeamos a la clase de hipopótamo unificada
            yolo_lines: List[str] = []
            with label_path.open("r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue
                    # ignoramos el id de clase original (0/1) y usamos hippo_class_id
                    _, x_c, y_c, w, h = parts
                    yolo_lines.append(
                        f"{hippo_class_id} {float(x_c):.6f} "
                        f"{float(y_c):.6f} {float(w):.6f} {float(h):.6f}"
                    )
            dest_lbl.write_text("\n".join(yolo_lines) + ("\n" if yolo_lines else ""))

    # 8) Guardamos classes.txt y data.yaml
    num_classes = len(class_to_id)
    id_to_class: List[str] = [""] * num_classes
    for name, cid in class_to_id.items():
        if 0 <= cid < len(id_to_class):
            id_to_class[cid] = name

    # classes.txt
    with (OUT_ROOT / "classes.txt").open("w") as f:
        for cid, name in enumerate(id_to_class):
            f.write(f"{cid} {name}\n")

    # data.yaml para Ultralytics
    with (OUT_ROOT / "data.yaml").open("w") as f:
        f.write(f"path: {OUT_ROOT}\n")
        f.write("train: images/train\n")
        f.write("val: images/val\n")
        f.write("test: images/test\n\n")
        f.write(f"nc: {num_classes}\n")
        f.write("names:\n")
        for cid, name in enumerate(id_to_class):
            f.write(f"  {cid}: {name}\n")

    print(f"Dataset YOLO unificado creado en: {OUT_ROOT}")
    print(f"Número total de imágenes: {len(all_samples)}")
    print(f"Número de clases: {num_classes}")
    print("Algunas clases (id -> nombre):")
    for cid, name in enumerate(id_to_class[:10]):
        print(f"  {cid}: {name}")
    if num_classes > 10:
        print("  ...")


if __name__ == "__main__":
    main()


