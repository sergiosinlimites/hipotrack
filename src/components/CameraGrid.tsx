import { Camera } from '../types';
import { CameraCard } from './CameraCard';

interface CameraGridProps {
  cameras: Camera[];
  onRequestStream: (camera: Camera) => void;
  onRequestPhoto: (camera: Camera) => void;
}

export function CameraGrid({ cameras, onRequestStream, onRequestPhoto }: CameraGridProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Cámaras</h2>
        <p className="text-gray-600 mt-1">
          {cameras.filter(c => c.status === 'online').length} de {cameras.length} cámaras en línea
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cameras.map((camera) => (
          <CameraCard
            key={camera.id}
            camera={camera}
            onRequestStream={onRequestStream}
            onRequestPhoto={onRequestPhoto}
          />
        ))}
      </div>
    </div>
  );
}
