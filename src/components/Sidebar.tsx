import { Video, Image, Zap, Settings, Menu, X, Database, Map } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
import hipotrackLogo from '../assets/hipotrack_logo.png';

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
          fixed lg:sticky top-0 left-0 h-screen w-64 bg-white text-slate-900 border-r border-slate-200 p-4 z-40
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="mb-8 pt-12 lg:pt-0">
          <div className="flex items-center gap-3">
            <img
              src={hipotrackLogo}
              alt="Hipotrack"
              className="h-40 w-auto lg:h-11"
            />
          </div>
          <p className="text-sm text-sky-700 mt-2 tracking-wide">Monitoreo energético y visual</p>
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
                      ? 'bg-sky-100 text-sky-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }
                `}
              >
                <Icon className="size-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-400">Hipotrack v1.0.0</p>
            <p className="text-xs text-slate-400 mt-1">
              Tiempo activo: 2d 14h
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
