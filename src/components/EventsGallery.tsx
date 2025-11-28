import { useState } from 'react';
import { Event } from '../types';
import { Calendar, Camera as CameraIcon, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface EventsGalleryProps {
  events: Event[];
}

export function EventsGallery({ events }: EventsGalleryProps) {
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const uniqueCameras = Array.from(new Set(events.map(e => e.cameraName)));

  const filteredEvents = selectedCamera === 'all' 
    ? events 
    : events.filter(e => e.cameraId === selectedCamera);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Eventos</h2>
        <p className="text-gray-600 mt-1">{filteredEvents.length} eventos registrados</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-3">
        <Select value={selectedCamera} onValueChange={setSelectedCamera}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filtrar por cámara" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cámaras</SelectItem>
            {uniqueCameras.map((camera, index) => (
              <SelectItem key={index} value={String(index + 1)}>
                {camera}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=200&q=50"
                alt={event.cameraName}
                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-white text-xs truncate">{event.cameraName}</p>
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
        <DialogContent className="max-w-4xl">
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
              
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=1200&q=80"
                  alt="Event"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
