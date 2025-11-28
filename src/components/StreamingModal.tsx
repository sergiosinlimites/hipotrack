import { useEffect, useState, useRef } from 'react';
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
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!isOpen) return;

    setTimeLeft(timeout * 60);
    lastActivityRef.current = Date.now();

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      setTimeLeft(timeout * 60);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, timeout * 60 - elapsed);
      
      setTimeLeft(remaining);
      
      if (remaining === 0) {
        onClose();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [isOpen, timeout, onClose]);

  if (!camera) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

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
              src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=800&q=60"
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
                <span>Resolución estimada: 640x480</span>
                <span>FPS objetivo: 1-3</span>
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
