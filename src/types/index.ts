export type CameraStatus = 'online' | 'waiting' | 'disabled';
export type CameraType = 'USB' | 'CSI' | 'RTSP';
export type OperationMode = 'saving' | 'limited' | 'remote';

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: CameraStatus;
  type: CameraType;
  url: string;
  enabled: boolean;
  thumbnail?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export type EventMediaType = 'photo' | 'video';

export interface Event {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: Date;
  /**
   * URL de la miniatura mostrada en la galería.
   * Para fotos suele ser la propia imagen; para vídeos, un frame JPG.
   */
  thumbnail: string;
  /**
   * URL de la imagen de alta resolución (solo para eventos de foto).
   */
  imageUrl?: string;
  /**
   * URL del vídeo MP4 generado a partir del streaming (solo para eventos de vídeo).
   */
  videoUrl?: string;
  /**
   * Tipo de medio del evento. Si falta, el frontend intentará inferirlo.
   */
  mediaType: EventMediaType;
}

export interface EnergyData {
  voltage: number;
  current: number;
  watts: number;
  cpuTemp: number;
  timestamp: Date;
  cameraId?: string;
  cameraName?: string;
}

export interface AppSettings {
  operationMode: OperationMode;
  streamTimeout: number;
  snapshotQuality: number;
}

export type DataEventType = 'detection' | 'photo' | 'stream' | 'system';

export interface DataUsageEvent {
  id: string;
  type: DataEventType;
  bytes: number;
  timestamp: Date;
  cameraId?: string;
}

export interface DataUsageSummary {
  total: number;
  byType: Record<DataEventType, number>;
  history: { timestamp: Date; bytes: number }[];
}

export interface DataLimit {
  maxBytes: number;
  resetDate: Date;
}
