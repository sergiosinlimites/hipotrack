import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ConnectionBanner } from './components/ConnectionBanner';
import { CameraGrid } from './components/CameraGrid';
import { StreamingModal } from './components/StreamingModal';
import { PhotoCaptureModal } from './components/PhotoCaptureModal';
import { EventsGallery } from './components/EventsGallery';
import { EnergyPanel } from './components/EnergyPanel';
import { DataPanel } from './components/DataPanel';
import { MapView } from './components/MapView';
import { CameraForm } from './components/CameraForm';
import { SettingsPanel } from './components/SettingsPanel';
import {
  useMockCameras,
  useMockEvents,
  useMockEnergyData,
  useMockSettings,
  useMockDataUsage,
} from './hooks/useMockData';
import { Camera, Event } from './types';

type View = 'cameras' | 'events' | 'energy' | 'data' | 'map' | 'config' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState('cameras' as View);
  const [isConnected, setIsConnected] = useState(true);
  const [streamingCamera, setStreamingCamera] = useState(null as Camera | null);
  const [photoCamera, setPhotoCamera] = useState(null as Camera | null);
  const [photoImageUrl, setPhotoImageUrl] = useState(null as string | null);

  const { cameras, setCameras } = useMockCameras();
  const { events, setEvents } = useMockEvents();
  const { currentData, energyHistory } = useMockEnergyData();
  const { settings, setSettings } = useMockSettings();
  const { summary, dataLimit, setDataLimit } = useMockDataUsage();

  // Simulate connection status
  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(Math.random() > 0.1); // 90% connected
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleSaveCamera = async (cameraInput: Omit<Camera, 'id'> & { id?: string }) => {
    try {
      // Si hay id, actualizamos. Si no, creamos una nueva cámara.
      if (cameraInput.id) {
        const res = await fetch(`/api/cameras/${cameraInput.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cameraInput),
        });
        if (!res.ok) throw new Error('Error al actualizar cámara');
        const updated: Camera = await res.json();
        setCameras((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const res = await fetch('/api/cameras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cameraInput),
        });
        if (!res.ok) throw new Error('Error al crear cámara');
        const created: Camera = await res.json();
        setCameras((prev) => [...prev, created]);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('handleSaveCamera error', err);
      alert('No se pudo guardar la cámara. Revisa la consola del navegador.');
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta cámara?')) return;

    try {
      const res = await fetch(`/api/cameras/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error('Error al eliminar cámara');
      }
      setCameras((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('handleDeleteCamera error', err);
      alert('No se pudo eliminar la cámara. Revisa la consola del navegador.');
    }
  };

  const handleRequestStream = async (camera: Camera) => {
    try {
      const res = await fetch(`/api/cameras/${camera.id}/request-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: settings.streamTimeout * 60 }),
      });
      if (!res.ok) throw new Error('Error al solicitar streaming');

      alert(
        'Se ha solicitado video en vivo. La cámara puede tardar hasta 1 minuto en comenzar a transmitir dependiendo de la conexión.'
      );

      setStreamingCamera(camera);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('handleRequestStream error', err);
      alert('No se pudo solicitar el video. Revisa la consola del navegador.');
    }
  };

  const handleRequestPhoto = async (camera: Camera) => {
    try {
      const res = await fetch(`/api/cameras/${camera.id}/request-photo`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Error al solicitar foto');

      setPhotoCamera(camera);
      setPhotoImageUrl(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('handleRequestPhoto error', err);
      alert('No se pudo solicitar la foto. Revisa la consola del navegador.');
    }
  };

  // WebSocket de eventos (fotos) para actualizaciones en tiempo (casi) real
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl =
      process.env.NODE_ENV !== 'production' && window.location.hostname === 'localhost'
        ? `${protocol}://localhost:3001/ws/events`
        : `${protocol}://${window.location.host}/ws/events`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          id: string;
          cameraId: string;
          cameraName: string;
          timestamp: string;
          imageUrl: string;
          thumbnail?: string;
        };

        if (data.type === 'photo') {
          const evt: Event = {
            id: data.id,
            cameraId: data.cameraId,
            cameraName: data.cameraName,
            timestamp: new Date(data.timestamp),
            thumbnail: data.thumbnail || data.imageUrl,
            imageUrl: data.imageUrl,
          };

          // Actualizar lista de eventos
          setEvents((prev) => [evt, ...prev]);

          // Actualizar thumbnail de la cámara
          setCameras((prev) =>
            prev.map((c) =>
              c.id === data.cameraId ? { ...c, thumbnail: data.thumbnail || data.imageUrl } : c
            )
          );

          // Si el modal de foto está abierto para esa cámara, mostrar la imagen
          if (photoCamera && photoCamera.id === data.cameraId) {
            setPhotoImageUrl(data.imageUrl);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error parsing WS event', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [setCameras, setEvents, photoCamera]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <ConnectionBanner isConnected={isConnected} />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {currentView === 'cameras' && (
            <CameraGrid
              cameras={cameras}
              onRequestStream={handleRequestStream}
              onRequestPhoto={handleRequestPhoto}
            />
          )}

          {currentView === 'events' && <EventsGallery events={events} />}

          {currentView === 'energy' && (
            <EnergyPanel currentData={currentData} history={energyHistory} />
          )}

          {currentView === 'data' && (
            <DataPanel summary={summary} dataLimit={dataLimit} onUpdateLimit={setDataLimit} />
          )}

          {currentView === 'map' && <MapView cameras={cameras} />}

          {currentView === 'config' && (
            <CameraForm
              cameras={cameras}
              onSave={handleSaveCamera}
              onDelete={handleDeleteCamera}
            />
          )}

          {currentView === 'settings' && (
            <SettingsPanel settings={settings} onUpdate={setSettings} />
          )}
        </div>
      </main>

      <StreamingModal
        camera={streamingCamera}
        isOpen={!!streamingCamera}
        onClose={() => setStreamingCamera(null)}
        timeout={settings.streamTimeout}
      />

      <PhotoCaptureModal
        camera={photoCamera}
        isOpen={!!photoCamera}
        onClose={() => setPhotoCamera(null)}
        imageUrl={photoImageUrl}
      />
    </div>
  );
}
