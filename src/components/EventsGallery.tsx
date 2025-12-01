import { useMemo, useState } from 'react';
import { Event } from '../types';
import { Calendar, Camera as CameraIcon, X, PlayCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import hipotrackPlaceholder from '../assets/hipotrack-placeholder.svg';

interface EventsGalleryProps {
  events: Event[];
}

export function EventsGallery({ events }: EventsGalleryProps) {
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photo' | 'video'>('all');

  const uniqueCameras = useMemo(
    () =>
      Array.from(new Map(events.map((e) => [e.cameraId, e.cameraName])).entries()).map(
        ([id, name]) => ({ id, name })
      ),
    [events]
  );

  const filteredEvents = useMemo(() => {
    // Primero, descartar cualquier evento que no tenga media válida.
    const withMedia = events.filter((e) => {
      const mediaType = e.mediaType || (e.videoUrl ? 'video' : 'photo');
      const hasPhoto = mediaType === 'photo' && !!e.imageUrl;
      const hasVideo = mediaType === 'video' && !!e.videoUrl;
      return hasPhoto || hasVideo;
    });

    const byCamera =
      selectedCamera === 'all'
        ? withMedia
        : withMedia.filter((e) => e.cameraId === selectedCamera);

    if (mediaFilter === 'all') return byCamera;

    return byCamera.filter((e) => {
      const mediaType = e.mediaType || (e.videoUrl ? 'video' : 'photo');
      return mediaType === mediaFilter;
    });
  }, [events, selectedCamera, mediaFilter]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Eventos</h2>
        <p className="text-gray-600 mt-1">{filteredEvents.length} eventos registrados</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select value={selectedCamera} onValueChange={setSelectedCamera}>
            <SelectTrigger className="w-52 sm:w-64">
              <SelectValue placeholder="Filtrar por cámara" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cámaras</SelectItem>
              {uniqueCameras.map((camera) => (
                <SelectItem key={camera.id} value={camera.id}>
                  {camera.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Tipo de evento:</span>
          <div className="flex gap-1">
            <Button
              size="xs"
              variant={mediaFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setMediaFilter('all')}
            >
              Todos
            </Button>
            <Button
              size="xs"
              variant={mediaFilter === 'photo' ? 'default' : 'outline'}
              onClick={() => setMediaFilter('photo')}
            >
              Fotos
            </Button>
            <Button
              size="xs"
              variant={mediaFilter === 'video' ? 'default' : 'outline'}
              onClick={() => setMediaFilter('video')}
            >
              Videos
            </Button>
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredEvents.map((event) => (
          <div
            key={event.id}
            className="cursor-pointer group"
            onClick={() => setSelectedEvent(event)}
          >
            <div className="aspect-video bg-gray-900 rounded overflow-hidden mb-2 relative">
              <ImageWithFallback
                src={event.thumbnail || hipotrackPlaceholder}
                alt={event.cameraName}
                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
              />
              <div className="absolute inset-0 flex flex-col justify-between">
                <div className="flex items-start justify-between p-2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5">
                    <CameraIcon className="size-3 text-white/80" />
                    <span className="text-[10px] text-white/90 truncate max-w-[120px]">
                      {event.cameraName}
                    </span>
                  </div>
                  {event.mediaType === 'video' && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5">
                      <PlayCircle className="size-3 text-white" />
                      <span className="text-[10px] text-white">Video</span>
                    </div>
                  )}
                </div>
                <div className="bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-[11px] truncate">
                    {event.timestamp.toLocaleString('es')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Calendar className="size-3" />
              <span>{event.timestamp.toLocaleDateString('es')}</span>
            </div>
            <p className="text-xs text-gray-600">
              {event.timestamp.toLocaleTimeString('es', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          </div>
        ))}
      </div>

      {/* Image viewer dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh]">
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-gray-900">{selectedEvent.cameraName}</h3>
                  <p className="text-sm text-gray-600">
                    {selectedEvent.timestamp.toLocaleString('es')}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              
              <div className="bg-gray-900 rounded-lg overflow-hidden max-h-[70vh] flex items-center justify-center">
                {selectedEvent.mediaType === 'video' && selectedEvent.videoUrl ? (
                  <video
                    className="w-full h-full max-h-[70vh] bg-black"
                    src={selectedEvent.videoUrl}
                    controls
                    autoPlay
                  />
                ) : (
                  <ImageWithFallback
                    src={selectedEvent.imageUrl || selectedEvent.thumbnail}
                    alt="Event"
                    className="w-full h-auto"
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
