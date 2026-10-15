'use client';

import { useCallback, useState } from 'react';
import type { MediaDeviceOption } from './constants';

/** Pure: device list -> picker options with fallback labels. */
export function deviceOptions(devices: Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[], kind: MediaDeviceKind, fallback: string): MediaDeviceOption[] {
  return devices
    .filter((d) => d.kind === kind && d.deviceId)
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
}

/** Camera / microphone lists and the selected device ids. */
export function useMediaDevices() {
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [micId, setMicId] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setCameras(deviceOptions(devices, 'videoinput', 'Camera'));
    setMics(deviceOptions(devices, 'audioinput', 'Microphone'));
  }, []);

  return { cameras, mics, cameraId, micId, setCameraId, setMicId, refreshDevices };
}
