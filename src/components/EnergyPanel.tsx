import { useMemo, useState } from 'react';
import { Camera, EnergyData } from '../types';
import { Battery, Zap, Cpu, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface EnergyPanelProps {
  currentData: EnergyData;
  history: EnergyData[];
  cameras: Camera[];
}

export function EnergyPanel({ currentData, history, cameras }: EnergyPanelProps) {
  const [selectedCameraId, setSelectedCameraId] = useState<string>('all');

  const cameraOptions = useMemo(
    () =>
      cameras.map((c) => ({
        id: c.id,
        name: c.name,
      })),
    [cameras]
  );

  const filteredHistory = useMemo(
    () =>
      selectedCameraId === 'all'
        ? history
        : history.filter((d) => d.cameraId === selectedCameraId),
    [history, selectedCameraId]
  );

  const latest = filteredHistory[0] || currentData;

  const chartData = filteredHistory.map((data, index) => ({
    time: `-${(filteredHistory.length - index - 1)}m`,
    watts: data.watts,
    temp: data.cpuTemp,
  }));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Energía</h2>
        <p className="text-gray-600 mt-1">Monitoreo en tiempo real por cámara</p>
      </div>

      {/* Camera filter */}
      {cameraOptions.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-gray-600">Cámara:</span>
          <Select value={selectedCameraId} onValueChange={setSelectedCameraId}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Selecciona una cámara" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cámaras</SelectItem>
              {cameraOptions.map((camera) => (
                <SelectItem key={camera.id} value={camera.id}>
                  {camera.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Current metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Battery className="size-4" />
            <span className="text-sm">Voltaje</span>
          </div>
          <p className="text-gray-900">{latest.voltage.toFixed(2)} V</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <TrendingUp className="size-4" />
            <span className="text-sm">Corriente</span>
          </div>
          <p className="text-gray-900">{latest.current.toFixed(2)} A</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Zap className="size-4" />
            <span className="text-sm">Potencia</span>
          </div>
          <p className="text-gray-900">{latest.watts.toFixed(2)} W</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Cpu className="size-4" />
            <span className="text-sm">Temperatura CPU</span>
          </div>
          <p className="text-gray-900">{latest.cpuTemp.toFixed(1)} °C</p>
        </div>
      </div>

      {/* Charts */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-gray-900 mb-4">Historial (10 minutos)</h3>
        
        <div className="space-y-6">
          {/* Power chart */}
          <div>
            <p className="text-sm text-gray-600 mb-2">Consumo (W)</p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  domain={[0, 6]}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: 12,
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="watts" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Temperature chart */}
          <div>
            <p className="text-sm text-gray-600 mb-2">Temperatura CPU (°C)</p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  domain={[35, 50]}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: 12,
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="temp" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
