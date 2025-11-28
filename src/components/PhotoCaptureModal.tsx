import React from 'react';
import { Camera } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface PhotoCaptureModalProps {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
}

export function PhotoCaptureModal({ camera, isOpen, onClose, imageUrl }: PhotoCaptureModalProps) {
  if (!camera) return null;

  const isWaiting = !imageUrl;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
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

          {!isWaiting && imageUrl && (
            <div className="space-y-3">
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <ImageWithFallback
                  src={imageUrl}
                  alt={`Foto de ${camera.name}`}
                  className="w-full h-auto"
                />
              </div>
              <p className="text-xs text-gray-600">
                La foto más reciente se ha recibido correctamente desde la Raspberry.
              </p>
            </div>
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

