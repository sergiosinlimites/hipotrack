import React, { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Camera } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface StreamingModalProps {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
  timeout: number; // minutes
}

export function StreamingModal({ camera, isOpen, onClose, timeout }: StreamingModalProps) {
  const [timeLeft, setTimeLeft] = useState(timeout * 60);
  const [frameTick, setFrameTick] = useState(0);

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
    const interval = setInterval(() => {
      setFrameTick((prev) => prev + 1);
    }, 2000); // cada 2 segundos

    return () => clearInterval(interval);
  }, [isOpen, camera]);

  if (!camera) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const streamSrc =
    camera && isOpen
      ? `/api/cameras/${camera.id}/live-frame?ts=${frameTick}`
      : 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=800&q=60';

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
            />
            <div className="absolute top-4 left-4 bg-red-600 px-3 py-1 rounded-full flex items-center gap-2">
              <div className="size-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-sm">EN VIVO</span>
            </div>
          </div>

          {/* Info bar */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>Resolución estimada: 320x240</span>
                <span>FPS objetivo: ~{Math.round(1 / 2)}</span>
              </div>

              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="size-4" />
                <span>
                  Cierre automático en {minutes}:{seconds.toString().padStart(2, '0')}
                </span>
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
