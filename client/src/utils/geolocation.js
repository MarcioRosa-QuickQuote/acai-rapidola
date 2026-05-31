import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const isNative = () => Capacitor.isNativePlatform();

// Solicita permissão explicitamente (necessário no Android/iOS nativo)
export async function requestLocationPermission() {
  if (!isNative()) return 'granted';
  const status = await Geolocation.requestPermissions();
  // status.location = 'granted' | 'denied' | 'prompt'
  return status.location;
}

// Equivalente a navigator.geolocation.getCurrentPosition
export function getCurrentPosition(successCb, errorCb, options = {}) {
  const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000, ...options };

  if (isNative()) {
    Geolocation.getCurrentPosition({ enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout })
      .then(pos => successCb({
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
        timestamp: pos.timestamp,
      }))
      .catch(err => errorCb?.(err));
  } else {
    navigator.geolocation.getCurrentPosition(successCb, errorCb, opts);
  }
}

// Equivalente a navigator.geolocation.watchPosition — retorna { remove } em vez de watchId
export function watchPosition(successCb, errorCb, options = {}) {
  const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000, ...options };

  if (isNative()) {
    let callbackId = null;

    Geolocation.watchPosition(
      { enableHighAccuracy: opts.enableHighAccuracy, timeout: opts.timeout },
      (pos, err) => {
        if (err) { errorCb?.(err); return; }
        successCb({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          timestamp: pos.timestamp,
        });
      }
    ).then(id => { callbackId = id; });

    return {
      remove: () => {
        if (callbackId != null) Geolocation.clearWatch({ id: callbackId });
      }
    };
  } else {
    const watchId = navigator.geolocation.watchPosition(successCb, errorCb, opts);
    return {
      remove: () => navigator.geolocation.clearWatch(watchId),
    };
  }
}
