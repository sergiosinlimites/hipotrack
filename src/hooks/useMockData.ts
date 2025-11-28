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
        const mapped: Event[] = data.map((e: any) => ({
          id: e.id,
          cameraId: e.cameraId,
          cameraName: e.cameraName,
          timestamp: new Date(e.timestamp),
          thumbnail: e.thumbnail,
          imageUrl: e.imageUrl,
        }));
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
  const [currentData, setCurrentData] = useState({
    voltage: 5.0,
    current: 0.8,
    watts: 4.0,
    cpuTemp: 42,
    timestamp: new Date(),
  });

  useEffect(() => {
    // Initialize history with 10 points
    const history: EnergyData[] = [];
    for (let i = 9; i >= 0; i--) {
      history.push({
        voltage: 4.9 + Math.random() * 0.2,
        current: 0.7 + Math.random() * 0.3,
        watts: 3.5 + Math.random() * 1.0,
        cpuTemp: 40 + Math.random() * 5,
        timestamp: new Date(Date.now() - i * 60000),
      });
    }
    setEnergyHistory(history);

    // Update data every 5 seconds
    const interval = setInterval(() => {
      const newData: EnergyData = {
        voltage: 4.9 + Math.random() * 0.2,
        current: 0.7 + Math.random() * 0.3,
        watts: 3.5 + Math.random() * 1.0,
        cpuTemp: 40 + Math.random() * 5,
        timestamp: new Date(),
      };
      
      setCurrentData(newData);
      setEnergyHistory(prev => [...prev.slice(-9), newData]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { currentData, energyHistory };
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
    // Generate initial data usage events
    const initialEvents: DataUsageEvent[] = [];
    const eventTypes: DataEventType[] = ['detection', 'photo', 'stream', 'system'];
    const cameraIds = ['1', '2', '3', '4'];

    // Generate events for the last 30 days
    for (let i = 0; i < 200; i++) {
      const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      let bytes = 0;
      
      // Different event types consume different amounts of data
      switch (randomType) {
        case 'detection':
          bytes = 50 * 1024 + Math.random() * 150 * 1024; // 50-200 KB
          break;
        case 'photo':
          bytes = 300 * 1024 + Math.random() * 700 * 1024; // 300KB-1MB
          break;
        case 'stream':
          bytes = 5 * 1024 * 1024 + Math.random() * 15 * 1024 * 1024; // 5-20 MB
          break;
        case 'system':
          bytes = 10 * 1024 + Math.random() * 90 * 1024; // 10-100 KB
          break;
      }

      initialEvents.push({
        id: `data-event-${i}`,
        type: randomType,
        bytes,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        cameraId: randomType !== 'system' ? cameraIds[Math.floor(Math.random() * cameraIds.length)] : undefined,
      });
    }

    setEvents(initialEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    // Simulate new data events periodically
    const interval = setInterval(() => {
      const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      let bytes = 0;

      switch (randomType) {
        case 'detection':
          bytes = 50 * 1024 + Math.random() * 150 * 1024;
          break;
        case 'photo':
          bytes = 300 * 1024 + Math.random() * 700 * 1024;
          break;
        case 'stream':
          bytes = 5 * 1024 * 1024 + Math.random() * 15 * 1024 * 1024;
          break;
        case 'system':
          bytes = 10 * 1024 + Math.random() * 90 * 1024;
          break;
      }

      const newEvent: DataUsageEvent = {
        id: `data-event-${Date.now()}`,
        type: randomType,
        bytes,
        timestamp: new Date(),
        cameraId: randomType !== 'system' ? cameraIds[Math.floor(Math.random() * cameraIds.length)] : undefined,
      };

      setEvents(prev => [newEvent, ...prev].slice(0, 500));
    }, 30000); // Every 30 seconds

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
