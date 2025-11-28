import { WifiOff } from 'lucide-react';

interface ConnectionBannerProps {
  isConnected: boolean;
}

export function ConnectionBanner({ isConnected }: ConnectionBannerProps) {
  if (isConnected) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2">
      <WifiOff className="size-4 text-amber-600" />
      <span className="text-amber-700">Reintentando conexión...</span>
    </div>
  );
}
