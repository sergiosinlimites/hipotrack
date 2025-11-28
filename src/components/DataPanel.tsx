import { DataUsageSummary, DataLimit } from '../types';
import { Database, Image, Video, Activity, Edit2, Check, X } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useState } from 'react';
import { Button } from './ui/button';

interface DataPanelProps {
  summary: DataUsageSummary;
  dataLimit: DataLimit;
  onUpdateLimit: (limit: DataLimit) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const COLORS = {
  detection: '#3b82f6',
  photo: '#10b981',
  stream: '#f59e0b',
  system: '#6366f1',
};

export function DataPanel({ summary, dataLimit, onUpdateLimit }: DataPanelProps) {
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [editLimitGB, setEditLimitGB] = useState((dataLimit.maxBytes / (1024 * 1024 * 1024)).toString());

  const usagePercentage = (summary.total / dataLimit.maxBytes) * 100;

  const handleSaveLimit = () => {
    const newLimitGB = parseFloat(editLimitGB);
    if (!isNaN(newLimitGB) && newLimitGB > 0) {
      onUpdateLimit({
        ...dataLimit,
        maxBytes: newLimitGB * 1024 * 1024 * 1024,
      });
      setIsEditingLimit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditLimitGB((dataLimit.maxBytes / (1024 * 1024 * 1024)).toString());
    setIsEditingLimit(false);
  };

  // Prepare data for pie chart
  const pieData = [
    { name: 'Detecciones', value: summary.byType.detection, color: COLORS.detection },
    { name: 'Fotos', value: summary.byType.photo, color: COLORS.photo },
    { name: 'Streaming', value: summary.byType.stream, color: COLORS.stream },
    { name: 'Sistema', value: summary.byType.system, color: COLORS.system },
  ].filter(item => item.value > 0);

  // Prepare data for bar chart (by event type)
  const barData = [
    { name: 'Detecciones', bytes: summary.byType.detection, mb: summary.byType.detection / (1024 * 1024) },
    { name: 'Fotos', bytes: summary.byType.photo, mb: summary.byType.photo / (1024 * 1024) },
    { name: 'Streaming', bytes: summary.byType.stream, mb: summary.byType.stream / (1024 * 1024) },
    { name: 'Sistema', bytes: summary.byType.system, mb: summary.byType.system / (1024 * 1024) },
  ];

  // Prepare data for line chart (daily usage)
  const lineData = summary.history.map((item, index) => ({
    day: `Día ${index + 1}`,
    mb: item.bytes / (1024 * 1024),
    date: item.timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
  }));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Consumo de Datos</h2>
        <p className="text-gray-600 mt-1">Monitoreo de uso de SIM</p>
      </div>

      {/* Usage Summary */}
      <div className="border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-gray-600">Consumo Total</p>
            <p className="text-gray-900 mt-1">{formatBytes(summary.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Límite del Plan</p>
            {isEditingLimit ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={editLimitGB}
                  onChange={(e) => setEditLimitGB(e.target.value)}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                  min="1"
                  step="1"
                />
                <span className="text-sm text-gray-900">GB</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveLimit}
                  className="p-1 h-auto"
                >
                  <Check className="size-4 text-green-600" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="p-1 h-auto"
                >
                  <X className="size-4 text-red-600" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-900">{formatBytes(dataLimit.maxBytes)}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingLimit(true)}
                  className="p-1 h-auto"
                >
                  <Edit2 className="size-3 text-gray-500" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Uso del plan</span>
            <span className={usagePercentage > 90 ? 'text-red-600' : usagePercentage > 75 ? 'text-yellow-600' : 'text-gray-900'}>
              {usagePercentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePercentage > 90 ? 'bg-red-500' : usagePercentage > 75 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            Resetea: {dataLimit.resetDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stats by event type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Activity className="size-4" style={{ color: COLORS.detection }} />
            <span className="text-sm">Detecciones</span>
          </div>
          <p className="text-gray-900">{formatBytes(summary.byType.detection)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {((summary.byType.detection / summary.total) * 100).toFixed(1)}% del total
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Image className="size-4" style={{ color: COLORS.photo }} />
            <span className="text-sm">Fotos Enviadas</span>
          </div>
          <p className="text-gray-900">{formatBytes(summary.byType.photo)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {((summary.byType.photo / summary.total) * 100).toFixed(1)}% del total
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Video className="size-4" style={{ color: COLORS.stream }} />
            <span className="text-sm">Streaming</span>
          </div>
          <p className="text-gray-900">{formatBytes(summary.byType.stream)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {((summary.byType.stream / summary.total) * 100).toFixed(1)}% del total
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Database className="size-4" style={{ color: COLORS.system }} />
            <span className="text-sm">Sistema</span>
          </div>
          <p className="text-gray-900">{formatBytes(summary.byType.system)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {((summary.byType.system / summary.total) * 100).toFixed(1)}% del total
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pie chart - Distribution by type */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-gray-900 mb-4">Distribución por Tipo</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${((entry.value / summary.total) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatBytes(value)}
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart - Consumption by event type */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-gray-900 mb-4">Consumo por Evento</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                label={{ value: 'MB', angle: -90, position: 'insideLeft', fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(2)} MB`}
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                }}
              />
              <Bar dataKey="mb" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line chart - Daily usage */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-gray-900 mb-4">Historial de Consumo (30 días)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              stroke="#9ca3af"
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
              label={{ value: 'MB', angle: -90, position: 'insideLeft', fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={(label, payload) => {
                if (payload && payload[0]) {
                  return `Fecha: ${payload[0].payload.date}`;
                }
                return label;
              }}
              formatter={(value: number) => [`${value.toFixed(2)} MB`, 'Consumo']}
              contentStyle={{
                fontSize: 12,
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
              }}
            />
            <Line
              type="monotone"
              dataKey="mb"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
