import { useEffect, useRef, useState } from 'react';
import { Camera } from '../types';
import { MapPin, Navigation } from 'lucide-react';

interface MapViewProps {
  cameras: Camera[];
}

// We'll use Leaflet via CDN instead of npm to avoid build issues
declare global {
  interface Window {
    L: any;
  }
}

export function MapView({ cameras }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load Leaflet CSS and JS
    const loadLeaflet = async () => {
      // Check if Leaflet is already loaded
      if (window.L) {
        initializeMap();
        return;
      }

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        setIsLoading(false);
        initializeMap();
      };
      document.head.appendChild(script);
    };

    loadLeaflet();

    return () => {
      // Cleanup map on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!window.L || !mapInstanceRef.current) return;

    // Update markers when cameras change
    updateMarkers();
  }, [cameras]);

  const initializeMap = () => {
    if (!mapRef.current || !window.L || mapInstanceRef.current) return;

    // Calculate center from cameras with coordinates
    const camerasWithCoords = cameras.filter(c => c.coordinates);
    const centerLat = camerasWithCoords.length > 0
      ? camerasWithCoords.reduce((sum, c) => sum + c.coordinates!.lat, 0) / camerasWithCoords.length
      : -34.6037;
    const centerLng = camerasWithCoords.length > 0
      ? camerasWithCoords.reduce((sum, c) => sum + c.coordinates!.lng, 0) / camerasWithCoords.length
      : -58.3816;

    // Initialize map
    const map = window.L.map(mapRef.current).setView([centerLat, centerLng], 13);

    // Add OpenStreetMap tiles
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
    updateMarkers();
  };

  const updateMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;

    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    cameras.forEach(camera => {
      if (!camera.coordinates) return;

      const { lat, lng } = camera.coordinates;
      
      // Define marker color based on status
      const markerColor = camera.status === 'online' ? '#10b981' : camera.status === 'waiting' ? '#f59e0b' : '#6b7280';
      
      // Create custom icon
      const icon = window.L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            position: relative;
            width: 30px;
            height: 30px;
          ">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="${markerColor}" stroke="white" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3" fill="white"></circle>
            </svg>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
      });

      const marker = window.L.marker([lat, lng], { icon }).addTo(mapInstanceRef.current);

      // Add popup
      const statusLabel = camera.status === 'online' ? 'En línea' : camera.status === 'waiting' ? 'En espera' : 'Deshabilitada';
      const statusColor = camera.status === 'online' ? 'text-emerald-600' : camera.status === 'waiting' ? 'text-yellow-600' : 'text-gray-500';
      
      marker.bindPopup(`
        <div style="font-family: system-ui, -apple-system, sans-serif;">
          <h3 style="font-weight: 600; font-size: 14px; margin: 0 0 4px 0; color: #111827;">${camera.name}</h3>
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 8px 0;">${camera.location}</p>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
            <span style="color: #6b7280;">Estado:</span>
            <span style="color: ${markerColor}; font-weight: 500;">${statusLabel}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 4px;">
            <span style="color: #6b7280;">Tipo:</span>
            <span style="color: #111827;">${camera.type}</span>
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
        </div>
      `);

      markersRef.current.push(marker);
    });

    // Fit bounds if there are cameras with coordinates
    const camerasWithCoords = cameras.filter(c => c.coordinates);
    if (camerasWithCoords.length > 0) {
      const bounds = window.L.latLngBounds(
        camerasWithCoords.map(c => [c.coordinates!.lat, c.coordinates!.lng])
      );
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  };

  const camerasWithCoords = cameras.filter(c => c.coordinates);
  const camerasWithoutCoords = cameras.filter(c => !c.coordinates);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Mapa de Cámaras</h2>
        <p className="text-gray-600 mt-1">Ubicaciones GPS de las cámaras</p>
      </div>

      {/* Map container */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-6" style={{ height: '600px', position: 'relative' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <p className="text-gray-600">Cargando mapa...</p>
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <MapPin className="size-4 text-emerald-600" />
            <span className="text-sm">Con ubicación</span>
          </div>
          <p className="text-gray-900">{camerasWithCoords.length} cámaras</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <MapPin className="size-4 text-gray-400" />
            <span className="text-sm">Sin ubicación</span>
          </div>
          <p className="text-gray-900">{camerasWithoutCoords.length} cámaras</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Navigation className="size-4 text-blue-600" />
            <span className="text-sm">Total</span>
          </div>
          <p className="text-gray-900">{cameras.length} cámaras</p>
        </div>
      </div>

      {/* Cameras without coordinates */}
      {camerasWithoutCoords.length > 0 && (
        <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
          <h3 className="text-gray-900 mb-2">Cámaras sin ubicación GPS</h3>
          <p className="text-sm text-gray-600 mb-3">
            Las siguientes cámaras no tienen coordenadas configuradas:
          </p>
          <ul className="space-y-1">
            {camerasWithoutCoords.map(camera => (
              <li key={camera.id} className="text-sm text-gray-700">
                • {camera.name} ({camera.location})
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-600 mt-3">
            Edita estas cámaras en la sección de Configuración para agregar sus coordenadas.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="border border-gray-200 rounded-lg p-4 mt-6">
        <h3 className="text-gray-900 mb-3">Leyenda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-emerald-500" />
            <span className="text-sm text-gray-700">En línea</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-yellow-500" />
            <span className="text-sm text-gray-700">En espera</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-4 rounded-full bg-gray-500" />
            <span className="text-sm text-gray-700">Deshabilitada</span>
          </div>
        </div>
      </div>
    </div>
  );
}
