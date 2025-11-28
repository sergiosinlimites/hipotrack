import { EnergyData } from '../types';
import { Battery, Zap, Cpu, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface EnergyPanelProps {
  currentData: EnergyData;
  history: EnergyData[];
}

export function EnergyPanel({ currentData, history }: EnergyPanelProps) {
  const chartData = history.map((data, index) => ({
    time: `-${(history.length - index - 1)}m`,
    watts: data.watts,
    temp: data.cpuTemp,
  }));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Energía</h2>
        <p className="text-gray-600 mt-1">Monitoreo en tiempo real</p>
      </div>

      {/* Current metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Battery className="size-4" />
            <span className="text-sm">Voltaje</span>
          </div>
          <p className="text-gray-900">{currentData.voltage.toFixed(2)} V</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <TrendingUp className="size-4" />
            <span className="text-sm">Corriente</span>
          </div>
          <p className="text-gray-900">{currentData.current.toFixed(2)} A</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Zap className="size-4" />
            <span className="text-sm">Potencia</span>
          </div>
          <p className="text-gray-900">{currentData.watts.toFixed(2)} W</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Cpu className="size-4" />
            <span className="text-sm">Temperatura CPU</span>
          </div>
          <p className="text-gray-900">{currentData.cpuTemp.toFixed(1)} °C</p>
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
