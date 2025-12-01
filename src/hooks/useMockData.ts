import React, { useState, useEffect } from 'react';
import { Camera, Event, EnergyData, AppSettings, DataUsageEvent, DataUsageSummary, DataLimit, DataEventType } from '../types';

export function useMockCameras() {
  const [cameras, setCameras] = useState([] as Camera[]);

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await fetch('/api/cameras');
        if (!res.ok) throw new Error('Error fetching cameras');
        const data = await res.json();
        setCameras(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMockCameras error', err);
      }
    };

    fetchCameras();
  }, []);

  return { cameras, setCameras };
}

export function useMockEvents() {
  const [events, setEvents] = useState([] as Event[]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/events?ts=${Date.now()}`);
        if (!res.ok) throw new Error('Error fetching events');
        const data = await res.json();
        const mapped: Event[] = data.map((e: any) => {
          const mediaType = e.mediaType === 'video' ? 'video' : 'photo';
          return {
            id: e.id,
            cameraId: e.cameraId,
            cameraName: e.cameraName,
            timestamp: new Date(e.timestamp),
            thumbnail: e.thumbnail,
            imageUrl: e.imageUrl,
            videoUrl: e.videoUrl,
            mediaType,
          };
        });
        setEvents(mapped);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMockEvents error', err);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);

    return () => clearInterval(interval);
  }, []);

  return { events, setEvents };
}

export function useMockEnergyData() {
  const [energyHistory, setEnergyHistory] = useState([] as EnergyData[]);
  const [currentData, setCurrentData] = useState<EnergyData | null>(null);

  useEffect(() => {
    const fetchEnergy = async () => {
      try {
        const res = await fetch(`/api/energy?ts=${Date.now()}`);
        if (!res.ok) throw new Error('Error fetching energy data');
        const data = await res.json();

        const mapped: EnergyData[] = (data || []).map((s: any) => ({
          voltage: s.voltage,
          current: s.current,
          watts: s.watts,
          cpuTemp: s.cpuTemp,
          timestamp: new Date(s.timestamp),
          cameraId: s.cameraId,
          cameraName: s.cameraName,
        }));

        setEnergyHistory(mapped);
        if (mapped.length > 0) {
          setCurrentData(mapped[0]);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMockEnergyData error', err);
      }
    };

    fetchEnergy();
    const interval = setInterval(fetchEnergy, 15000);

    return () => clearInterval(interval);
  }, []);

  // Fallback simple para no romper la UI si aún no hay datos reales
  const effectiveCurrent =
    currentData ||
    ({
      voltage: 5.0,
      current: 0.8,
      watts: 4.0,
      cpuTemp: 42,
      timestamp: new Date(),
    } as EnergyData);

  return { currentData: effectiveCurrent, energyHistory };
}

export function useMockSettings() {
  const [settings, setSettings] = useState({
    operationMode: 'limited',
    streamTimeout: 3,
    snapshotQuality: 60,
  });

  return { settings, setSettings };
}

export function useMockDataUsage() {
  const [events, setEvents] = useState([] as DataUsageEvent[]);
  const [dataLimit, setDataLimit] = useState({
    maxBytes: 40 * 1024 * 1024 * 1024, // 40 GB
    resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  });

  useEffect(() => {
    const fetchDataUsage = async () => {
      try {
        const res = await fetch(`/api/data-usage?ts=${Date.now()}`);
        if (!res.ok) throw new Error('Error fetching data usage');
        const data = await res.json();
        const mapped: DataUsageEvent[] = (data || []).map((e: any) => ({
          id: e.id,
          type: e.type as DataEventType,
          bytes: e.bytes,
          timestamp: new Date(e.timestamp),
          cameraId: e.cameraId,
        }));
        setEvents(mapped);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMockDataUsage error', err);
      }
    };

    fetchDataUsage();
    const interval = setInterval(fetchDataUsage, 30000);

    return () => clearInterval(interval);
  }, []);

  const summary: DataUsageSummary = {
    total: events.reduce((sum, event) => sum + event.bytes, 0),
    byType: {
      detection: events.filter(e => e.type === 'detection').reduce((sum, e) => sum + e.bytes, 0),
      photo: events.filter(e => e.type === 'photo').reduce((sum, e) => sum + e.bytes, 0),
      stream: events.filter(e => e.type === 'stream').reduce((sum, e) => sum + e.bytes, 0),
      system: events.filter(e => e.type === 'system').reduce((sum, e) => sum + e.bytes, 0),
    },
    history: [],
  };

  // Generate daily history for the last 30 days
  const dailyHistory = new Map<string, number>();
  events.forEach(event => {
    const dateKey = event.timestamp.toISOString().split('T')[0];
    dailyHistory.set(dateKey, (dailyHistory.get(dateKey) || 0) + event.bytes);
  });

  const historyArray: { timestamp: Date; bytes: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    historyArray.push({
      timestamp: date,
      bytes: dailyHistory.get(dateKey) || 0,
    });
  }
  summary.history = historyArray;

  return { events, summary, dataLimit, setDataLimit };
}
