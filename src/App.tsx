import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ConnectionBanner } from './components/ConnectionBanner';
import { CameraGrid } from './components/CameraGrid';
import { StreamingModal } from './components/StreamingModal';
import { CameraHistoryModal } from './components/CameraHistoryModal';
import { EventsGallery } from './components/EventsGallery';
import { EnergyPanel } from './components/EnergyPanel';
import { DataPanel } from './components/DataPanel';
import { MapView } from './components/MapView';
import { CameraForm } from './components/CameraForm';
import { SettingsPanel } from './components/SettingsPanel';
import { useMockCameras, useMockEvents, useMockEnergyData, useMockSettings, useMockDataUsage } from './hooks/useMockData';
import { Camera } from './types';

type View = 'cameras' | 'events' | 'energy' | 'data' | 'map' | 'config' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('cameras');
  const [isConnected, setIsConnected] = useState(true);
  const [streamingCamera, setStreamingCamera] = useState<Camera | null>(null);
  const [historyCamera, setHistoryCamera] = useState<Camera | null>(null);

  const { cameras, setCameras } = useMockCameras();
  const events = useMockEvents();
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

  const handleSaveCamera = (camera: Camera) => {
    setCameras((prev) => {
      const index = prev.findIndex((c) => c.id === camera.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = camera;
        return updated;
      }
      return [...prev, camera];
    });
  };

  const handleDeleteCamera = (id: string) => {
    if (confirm('¿Seguro que deseas eliminar esta cámara?')) {
      setCameras((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <ConnectionBanner isConnected={isConnected} />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {currentView === 'cameras' && (
            <CameraGrid
              cameras={cameras}
              onViewLive={setStreamingCamera}
              onViewHistory={setHistoryCamera}
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

      <CameraHistoryModal
        camera={historyCamera}
        isOpen={!!historyCamera}
        onClose={() => setHistoryCamera(null)}
      />
    </div>
  );
}
