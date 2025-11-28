import { AppSettings, OperationMode } from '../types';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Save, Power, Wifi, Settings as SettingsIcon } from 'lucide-react';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

const modeInfo = {
  saving: {
    label: 'Modo Ahorro',
    description: 'Capturas cada 30 min, sin streaming',
    icon: Power,
  },
  limited: {
    label: 'Modo Streaming Limitado',
    description: 'Capturas cada 10 min, streaming bajo demanda',
    icon: Wifi,
  },
  remote: {
    label: 'Modo Configuración Remota',
    description: 'Control total vía red',
    icon: SettingsIcon,
  },
};

export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  const handleModeChange = (mode: OperationMode) => {
    onUpdate({ ...settings, operationMode: mode });
  };

  const handleTimeoutChange = (value: number[]) => {
    onUpdate({ ...settings, streamTimeout: value[0] });
  };

  const handleQualityChange = (value: number[]) => {
    onUpdate({ ...settings, snapshotQuality: value[0] });
  };

  const handleSave = () => {
    alert('Configuración guardada correctamente');
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-gray-900">Configuración</h2>
        <p className="text-gray-600 mt-1">Ajustes del sistema de monitoreo</p>
      </div>

      <div className="space-y-6">
        {/* Operation mode */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-900 mb-4">Modo de Operación</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {(Object.keys(modeInfo) as OperationMode[]).map((mode) => {
              const info = modeInfo[mode];
              const Icon = info.icon;
              const isActive = settings.operationMode === mode;
              
              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`size-5 mb-2 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                  <p className={isActive ? 'text-blue-900' : 'text-gray-900'}>
                    {info.label}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stream timeout */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <Label>Tiempo de inactividad para cierre de streaming</Label>
            <p className="text-sm text-gray-600 mt-1">
              {settings.streamTimeout} minuto{settings.streamTimeout !== 1 ? 's' : ''}
            </p>
          </div>
          <Slider
            value={[settings.streamTimeout]}
            onValueChange={handleTimeoutChange}
            min={1}
            max={10}
            step={1}
          />
        </div>

        {/* Snapshot quality */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <Label>Calidad de snapshots</Label>
            <p className="text-sm text-gray-600 mt-1">
              {settings.snapshotQuality}% - {
                settings.snapshotQuality < 40 ? 'Baja (máximo ahorro)' :
                settings.snapshotQuality < 70 ? 'Media (balanceada)' :
                'Alta (mejor calidad)'
              }
            </p>
          </div>
          <Slider
            value={[settings.snapshotQuality]}
            onValueChange={handleQualityChange}
            min={20}
            max={100}
            step={10}
          />
        </div>

        {/* Remote commands */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-900 mb-4">Comandos Remotos</h3>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline">Reiniciar Sistema</Button>
            <Button variant="outline">Limpiar Registros</Button>
            <Button variant="outline">Actualizar Firmware</Button>
            <Button variant="outline">Exportar Logs</Button>
          </div>
        </div>

        {/* Save button */}
        <Button onClick={handleSave} className="w-full">
          <Save className="size-4 mr-2" />
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}
