import { Camera } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useState } from 'react';

interface CameraHistoryModalProps {
  camera: Camera | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CameraHistoryModal({ camera, isOpen, onClose }: CameraHistoryModalProps) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  if (!camera) return null;

  // Mock 10 recent snapshots
  const snapshots = Array.from({ length: 10 }, (_, i) => ({
    id: `snap-${i}`,
    timestamp: new Date(Date.now() - i * 15 * 60 * 1000), // Every 15 minutes
  }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registro: {camera.name}</DialogTitle>
        </DialogHeader>

        {selectedImage !== null ? (
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-lg overflow-hidden aspect-video">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=800&q=70"
                alt="Snapshot"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {snapshots[selectedImage].timestamp.toLocaleString('es')}
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-sm text-blue-600 hover:underline"
              >
                Volver a la galería
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
            {snapshots.map((snapshot, index) => (
              <div
                key={snapshot.id}
                className="cursor-pointer group"
                onClick={() => setSelectedImage(index)}
              >
                <div className="aspect-video bg-gray-900 rounded overflow-hidden mb-1">
                  <ImageWithFallback
                    src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=200&q=50"
                    alt={`Snapshot ${index + 1}`}
                    className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                  />
                </div>
                <p className="text-xs text-gray-600 text-center">
                  {snapshot.timestamp.toLocaleTimeString('es', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
