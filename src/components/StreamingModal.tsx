import React, { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Camera } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import hipotrackPlaceholder from '../assets/hipotrack-placeholder.svg';

interface StreamingModalProps {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
  timeout: number; // minutes
}

export function StreamingModal({ camera, isOpen, onClose, timeout }: StreamingModalProps) {
  const [timeLeft, setTimeLeft] = useState(timeout * 60);
  const [frameTick, setFrameTick] = useState(0);
  const [hasHippo, setHasHippo] = useState<boolean | null>(null);
  const [hippoBoxes, setHippoBoxes] = useState<
    { bbox: [number, number, number, number]; confidence: number; className: string }[]
  >([]);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setTimeLeft(timeout * 60);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, timeout]);

  // Actualizar el frame de video periódicamente mientras el modal esté abierto
  useEffect(() => {
    if (!isOpen || !camera) return;

    setFrameTick(0);
    setHasHippo(null);
    setHippoBoxes([]);
    const interval = setInterval(async () => {
      setFrameTick((prev) => prev + 1);

      // Consultar detección de hipopótamos para el último frame en vivo
      try {
        const res = await fetch(`/api/cameras/${camera.id}/live-frame-detection?ts=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
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
      } catch {
        // Ignoramos errores puntuales de red
      }
    }, 2000); // cada 2 segundos

    return () => clearInterval(interval);
  }, [isOpen, camera]);

  if (!camera) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const streamSrc =
    camera && isOpen
      ? `/api/cameras/${camera.id}/live-frame?ts=${frameTick}`
      : hipotrackPlaceholder;

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
        // eslint-disable-next-line react/no-array-index-key
        <div
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{camera.name}</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stream viewer */}
          <div className="bg-gray-900 rounded-lg overflow-hidden aspect-video relative">
            <ImageWithFallback
              key={frameTick}
              src={streamSrc}
              alt="Live stream"
              className="w-full h-full object-cover"
              onLoad={handleImageLoad}
            />
            <div className="absolute top-4 left-4 bg-red-600 px-3 py-1 rounded-full flex items-center gap-2">
              <div className="size-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-sm">EN VIVO</span>
            </div>
            {overlayBoxes()}
          </div>

          {/* Info bar */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>Resolución estimada: 1280x720</span>
                <span>FPS objetivo: ~30</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="size-4" />
                  <span>
                    Cierre automático en {minutes}:{seconds.toString().padStart(2, '0')}
                  </span>
                </div>
                {hasHippo === true && (
                  <span className="text-green-600 font-semibold">Hipopótamo detectado en el video</span>
                )}
                {hasHippo === false && (
                  <span className="text-gray-500">Sin hipopótamos detectados en los últimos frames</span>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-600">
              Se ha solicitado video en vivo a la cámara. El inicio del streaming puede tardar hasta 1 minuto
              mientras la Raspberry establece la conexión por datos móviles.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
