import { AppError, ErrorCode } from '../core/errors.js';

function mapGeolocationError(error) {
  switch (error?.code) {
    case 1: return new AppError(ErrorCode.GEOLOCATION_DENIED, 'Location access is not permitted. Allow location access from the browser settings.');
    case 2: return new AppError(ErrorCode.GEOLOCATION_UNAVAILABLE, 'Current position cannot be acquired. Retry from a place with better signal.');
    case 3: return new AppError(ErrorCode.GEOLOCATION_TIMEOUT, 'Location acquisition timed out.');
    default: return new AppError(ErrorCode.GEOLOCATION_UNAVAILABLE, 'Location of Acquire at Failed .');
  }
}

function normalizedPosition(position) {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

export class GeolocationService {
  constructor(geolocation = globalThis.navigator?.geolocation) {
    this.geolocation = geolocation;
  }

  async getCurrentPosition(options = {}) {
    if (!this.geolocation) throw new AppError(ErrorCode.GEOLOCATION_UNSUPPORTED, 'This browser does not support location services.', { recoverable: false });
    const settings = { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000, ...options };
    return new Promise((resolve, reject) => {
      this.geolocation.getCurrentPosition(
        position => resolve(normalizedPosition(position)),
        error => reject(mapGeolocationError(error)),
        settings
      );
    });
  }

  watchPosition(onPosition, onError = null, options = {}) {
    if (!this.geolocation) return () => {};
    const settings = { enableHighAccuracy: true, timeout: 25000, maximumAge: 10000, ...options };
    const watchId = this.geolocation.watchPosition(
      position => onPosition(normalizedPosition(position)),
      error => onError?.(mapGeolocationError(error)),
      settings
    );
    return () => this.geolocation.clearWatch(watchId);
  }
}
