import React from 'react';
import { Video, MapPin, Camera as CameraIcon } from 'lucide-react';
import { Camera } from '../types';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface CameraCardProps {
  camera: Camera;
  onRequestStream: (camera: Camera) => void;
  onRequestPhoto: (camera: Camera) => void;
}

const statusColors = {
  online: 'bg-emerald-500/10 border-emerald-500/30',
  waiting: 'bg-amber-500/10 border-amber-500/30',
  disabled: 'bg-gray-500/10 border-gray-500/30',
};

const statusDotColors = {
  online: 'bg-emerald-500',
  waiting: 'bg-amber-500',
  disabled: 'bg-gray-500',
};

const statusLabels = {
  online: 'Online',
  waiting: 'En espera',
  disabled: 'Deshabilitada',
};

export function CameraCard({ camera, onRequestStream, onRequestPhoto }: CameraCardProps) {
  return (
    <div className={`border rounded-lg overflow-hidden ${statusColors[camera.status]}`}>
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 relative">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=400&q=50"
          alt={camera.name}
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-1 rounded">
          <div className={`size-2 rounded-full ${statusDotColors[camera.status]}`} />
          <span className="text-white text-xs">{statusLabels[camera.status]}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div>
          <h3 className="text-gray-900">{camera.name}</h3>
          <div className="flex items-center gap-1 text-gray-600 text-sm mt-1">
            <MapPin className="size-3" />
            <span>{camera.location}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onRequestStream(camera)}
            disabled={camera.status === 'disabled'}
            className="flex-1"
          >
            <Video className="size-3 mr-1" />
            Ver video
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRequestPhoto(camera)}
            className="flex-1"
          >
            <CameraIcon className="size-3 mr-1" />
            Tomar foto
          </Button>
        </div>
      </div>
    </div>
  );
}
