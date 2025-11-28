import { Video, Image, Zap, Settings, Menu, X, Database, Map } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';

type View = 'cameras' | 'events' | 'energy' | 'data' | 'map' | 'config' | 'settings';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const menuItems = [
  { id: 'cameras' as View, label: 'Cámaras', icon: Video },
  { id: 'events' as View, label: 'Eventos', icon: Image },
  { id: 'energy' as View, label: 'Energía', icon: Zap },
  { id: 'data' as View, label: 'Datos', icon: Database },
  { id: 'map' as View, label: 'Mapa', icon: Map },
  { id: 'config' as View, label: 'Configuración', icon: Settings },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleViewChange = (view: View) => {
    onViewChange(view);
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white shadow-lg"
        >
          {isOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen w-64 bg-gray-900 text-white p-4 z-40
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="mb-8 pt-12 lg:pt-0">
          <h1 className="text-xl text-white">Monitor IoT</h1>
          <p className="text-sm text-gray-400 mt-1">Sistema de Cámaras</p>
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleViewChange(item.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-colors
                  ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-500">Sistema v1.0.0</p>
            <p className="text-xs text-gray-500 mt-1">
              Tiempo activo: 2d 14h
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
