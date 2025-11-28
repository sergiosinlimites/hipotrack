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

export interface Event {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: Date;
  thumbnail: string;
  imageUrl: string;
}

export interface EnergyData {
  voltage: number;
  current: number;
  watts: number;
  cpuTemp: number;
  timestamp: Date;
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
