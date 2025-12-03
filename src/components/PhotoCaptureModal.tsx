import React, { useEffect, useState } from 'react';
import { Camera } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface PhotoCaptureModalProps {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
}

type Status = 'waiting' | 'received' | 'error';

export function PhotoCaptureModal({ camera, isOpen, onClose }: PhotoCaptureModalProps) {
  const [status, setStatus] = useState<Status>('waiting');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasHippo, setHasHippo] = useState<boolean | null>(null);
  const [hippoBoxes, setHippoBoxes] = useState<
    { bbox: [number, number, number, number]; confidence: number; className: string }[]
  >([]);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !camera) return;

    let cancelled = false;

    setStatus('waiting');
    setImageUrl(null);
    setErrorMessage(null);
    setHasHippo(null);
    setHippoBoxes([]);

    const waitForPhoto = async () => {
      try {
        const requestStart = Date.now();
        const timeoutMs = 70_000; // 70 segundos máximo

        while (!cancelled && Date.now() - requestStart < timeoutMs) {
          // pequeña espera entre peticiones
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (cancelled) return;

          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(
            `/api/cameras/${camera.id}/latest-photo?ts=${Date.now()}`
          );
          if (!res.ok) {
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          const data = await res.json();
          const ts = new Date(data.capturedAt).getTime();

          if (ts >= requestStart) {
            const url: string = data.imageUrl || data.thumbnail;
            setStatus('received');
            setImageUrl(url);
            setHasHippo(
              typeof data.hasHippo === 'boolean'
                ? data.hasHippo
                : !!(data.hippoDetection && data.hippoDetection.numHippos > 0),
            );
            const boxes =
              (data.hippoDetection?.hippos ?? []).map((h: any) => ({
                bbox: h.bbox_xyxy as [number, number, number, number],
                confidence: Number(h.confidence ?? 0),
                className: String(h.class_name ?? 'hippo'),
              })) ?? [];
            setHippoBoxes(boxes);
            return;
          }
        }

        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            'No se recibió la foto en el tiempo esperado. Verifica la conexión de la cámara.'
          );
        }
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('Error esperando la foto', err);
          setStatus('error');
          setErrorMessage('Ocurrió un error al esperar la foto. Revisa la consola del navegador.');
        }
      }
    };

    waitForPhoto();

    return () => {
      cancelled = true;
    };
  }, [isOpen, camera]);

  if (!camera) return null;

  const isWaiting = status === 'waiting';

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setRenderSize({ width: img.width, height: img.height });
  };

  const overlayBoxes = () => {
    if (!naturalSize || !renderSize) return null;
    const { width: nw, height: nh } = naturalSize;
    const { width: rw, height: rh } = renderSize;
    if (!nw || !nh || !rw || !rh) return null;

    return hippoBoxes.map((box, idx) => {
      const [x1, y1, x2, y2] = box.bbox;
      if (x2 <= x1 || y2 <= y1) return null;
      const left = (x1 / nw) * rw;
      const top = (y1 / nh) * rh;
      const width = ((x2 - x1) / nw) * rw;
      const height = ((y2 - y1) / nh) * rh;

      return (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={idx}
          className="absolute"
          style={{
            left,
            top,
            width,
            height,
            border: '2px solid red',
            boxSizing: 'border-box',
          }}
        >
          <div className="absolute -top-5 left-0 bg-red-600 text-white text-[11px] font-semibold px-1 rounded">
            {box.className} {(box.confidence * 100).toFixed(0)}%
          </div>
        </div>
      );
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>Tomar foto: {camera.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isWaiting && (
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                Se ha enviado una solicitud de foto a la cámara. Dependiendo de la conexión por datos
                móviles, la imagen puede tardar hasta 1 minuto en llegar al servidor.
              </p>
              <p>Este diálogo se actualizará automáticamente cuando la foto esté disponible.</p>
              <div className="flex items-center gap-2 text-gray-500">
                <span className="animate-spin h-4 w-4 rounded-full border-2 border-gray-300 border-t-transparent" />
                <span>Esperando foto...</span>
              </div>
            </div>
          )}

          {status === 'received' && imageUrl && (
            <div className="space-y-3">
              <div className="bg-gray-900 rounded-lg overflow-hidden max-h-[70vh] flex items-center justify-center relative">
                <ImageWithFallback
                  src={imageUrl}
                  alt={`Foto de ${camera.name}`}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                  onLoad={handleImageLoad}
                />
                {overlayBoxes()}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <p>La foto más reciente se ha recibido correctamente desde la cámara.</p>
                {hasHippo === true && (
                  <p className="text-green-600 font-semibold">
                    Se detectó al menos un hipopótamo en la imagen.
                  </p>
                )}
                {hasHippo === false && (
                  <p className="text-gray-500">No se detectaron hipopótamos en esta imagen.</p>
                )}
              </div>
            </div>
          )}

          {status === 'error' && errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

