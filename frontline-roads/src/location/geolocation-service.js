import { AppError, ErrorCode } from '../core/errors.js';

function keyedError(code, messageKey, fallback, options = {}) {
  return new AppError(code, fallback, { ...options, messageKey, fallback });
}

function mapGeolocationError(error) {
  switch (error?.code) {
    case 1: return keyedError(ErrorCode.GEOLOCATION_DENIED, 'error.geolocationDenied', '位置情報の利用が許可されていません。ブラウザ設定から許可してください。');
    case 2: return keyedError(ErrorCode.GEOLOCATION_UNAVAILABLE, 'error.geolocationUnavailable', '現在地を取得できませんでした。屋外または窓際で再試行してください。');
    case 3: return keyedError(ErrorCode.GEOLOCATION_TIMEOUT, 'error.geolocationTimeout', '位置情報の取得がタイムアウトしました。');
    default: return keyedError(ErrorCode.GEOLOCATION_UNAVAILABLE, 'error.geolocationFailed', '位置情報の取得に失敗しました。');
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
    if (!this.geolocation) throw keyedError(ErrorCode.GEOLOCATION_UNSUPPORTED, 'error.geolocationUnsupported', 'このブラウザは位置情報に対応していません。', { recoverable: false });
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
