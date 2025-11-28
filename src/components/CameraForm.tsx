import { useState } from 'react';
import { Camera, CameraType } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Plus, Edit, Trash2, TestTube, MapPin } from 'lucide-react';

interface CameraFormProps {
  cameras: Camera[];
  onSave: (camera: Omit<Camera, 'id'> & { id?: string }) => void;
  onDelete: (id: string) => void;
}

export function CameraForm({ cameras, onSave, onDelete }: CameraFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [formData, setFormData] = useState<Partial<Camera>>({
    name: '',
    location: '',
    type: 'USB',
    url: '',
    enabled: true,
    coordinates: undefined,
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const handleEdit = (camera: Camera) => {
    setEditingCamera(camera);
    setFormData(camera);
    setIsOpen(true);
  };

  const handleNew = () => {
    setEditingCamera(null);
    setFormData({
      name: '',
      location: '',
      type: 'USB',
      url: '',
      enabled: true,
      coordinates: undefined,
    });
    setIsOpen(true);
  };

  const handleGetGPSLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData({
          ...formData,
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
        setIsGettingLocation(false);
      },
      (error) => {
        alert('Error al obtener ubicación: ' + error.message);
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: Omit<Camera, 'id'> & { id?: string } = {
      id: editingCamera?.id,
      name: formData.name || '',
      location: formData.location || '',
      type: formData.type || 'USB',
      url: formData.url || '',
      enabled: formData.enabled ?? true,
      status: formData.enabled ? 'online' : 'disabled',
      coordinates: formData.coordinates,
    };

    onSave(payload);
    setIsOpen(false);
  };

  const handleTestSnapshot = () => {
    alert('Probando snapshot de la cámara...');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-gray-900">Configuración de Cámaras</h2>
          <p className="text-gray-600 mt-1">Administrar cámaras del sistema</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="size-4 mr-2" />
          Nueva Cámara
        </Button>
      </div>

      {/* Camera list */}
      <div className="space-y-3">
        {cameras.map((camera) => (
          <div key={camera.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="text-gray-900">{camera.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{camera.location}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span>Tipo: {camera.type}</span>
                <span>URL: {camera.url}</span>
                <span className={camera.enabled ? 'text-emerald-600' : 'text-gray-500'}>
                  {camera.enabled ? 'Habilitada' : 'Deshabilitada'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(camera)}>
                <Edit className="size-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onDelete(camera.id)}
              >
                <Trash2 className="size-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Form dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCamera ? 'Editar Cámara' : 'Nueva Cámara'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Ubicación</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData({ ...formData, type: value as CameraType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USB">USB</SelectItem>
                  <SelectItem value="CSI">CSI</SelectItem>
                  <SelectItem value="RTSP">RTSP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL o Dispositivo</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="/dev/video0 o rtsp://..."
                required
              />
            </div>

            {/* GPS Coordinates */}
            <div className="space-y-2">
              <Label>Coordenadas GPS</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    step="any"
                    placeholder="Latitud"
                    value={formData.coordinates?.lat || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      coordinates: {
                        lat: parseFloat(e.target.value) || 0,
                        lng: formData.coordinates?.lng || 0,
                      },
                    })}
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    step="any"
                    placeholder="Longitud"
                    value={formData.coordinates?.lng || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      coordinates: {
                        lat: formData.coordinates?.lat || 0,
                        lng: parseFloat(e.target.value) || 0,
                      },
                    })}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetGPSLocation}
                disabled={isGettingLocation}
                className="w-full"
              >
                <MapPin className="size-4 mr-2" />
                {isGettingLocation ? 'Obteniendo ubicación...' : 'Obtener ubicación GPS actual'}
              </Button>
              {formData.coordinates && (
                <p className="text-xs text-gray-600">
                  Ubicación: {formData.coordinates.lat.toFixed(6)}, {formData.coordinates.lng.toFixed(6)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Habilitada</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleTestSnapshot} className="flex-1">
                <TestTube className="size-4 mr-2" />
                Probar Snapshot
              </Button>
              <Button type="submit" className="flex-1">
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
