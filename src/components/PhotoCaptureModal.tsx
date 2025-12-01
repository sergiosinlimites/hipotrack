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

  useEffect(() => {
    if (!isOpen || !camera) return;

    let cancelled = false;

    setStatus('waiting');
    setImageUrl(null);
    setErrorMessage(null);

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
              <div className="bg-gray-900 rounded-lg overflow-hidden max-h-[70vh] flex items-center justify-center">
                <ImageWithFallback
                  src={imageUrl}
                  alt={`Foto de ${camera.name}`}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                />
              </div>
              <p className="text-xs text-gray-600">
                La foto más reciente se ha recibido correctamente desde la Raspberry.
              </p>
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

