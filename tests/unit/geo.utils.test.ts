import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  haversineDistanceMeters,
  geoPointToGeoJson,
  geoJsonToGeoPoint,
  validateGeoFix,
} from '../../src/modules/quests/utils/geo.utils';

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical points', () => {
    const point = { lat: 46.0667, lng: 11.1217 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('returns approximately correct distance between two known points', () => {
    // Trento centro → Trento stazione: circa 700 m in linea d'aria
    const centro = { lat: 46.0697, lng: 11.1211 };
    const stazione = { lat: 46.0628, lng: 11.126 };
    const dist = haversineDistanceMeters(centro, stazione);
    expect(dist).toBeGreaterThan(600);
    expect(dist).toBeLessThan(900);
  });

  it('is symmetric (A→B == B→A)', () => {
    const a = { lat: 46.0, lng: 11.0 };
    const b = { lat: 46.1, lng: 11.1 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 5);
  });
});

describe('geoPointToGeoJson / geoJsonToGeoPoint', () => {
  it('converts lat/lng to GeoJSON [lng, lat] order', () => {
    const result = geoPointToGeoJson({ lat: 46.0, lng: 11.0 });
    expect(result.type).toBe('Point');
    expect(result.coordinates).toEqual([11.0, 46.0]);
  });

  it('round-trips through GeoJSON without loss', () => {
    const original = { lat: 46.0667, lng: 11.1217 };
    const geoJson = geoPointToGeoJson(original);
    const back = geoJsonToGeoPoint(geoJson);
    expect(back.lat).toBeCloseTo(original.lat, 10);
    expect(back.lng).toBeCloseTo(original.lng, 10);
  });
});

describe('validateGeoFix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a fix within accuracy and age thresholds', () => {
    // accuracy=50 < 100 soglia, età=10s < 60s soglia
    expect(() =>
      validateGeoFix({ accuracy: 50, clientTimestamp: Date.now() - 10_000 }),
    ).not.toThrow();
  });

  it('accepts a fix exactly at the accuracy threshold (strict >)', () => {
    expect(() =>
      validateGeoFix({ accuracy: 100, clientTimestamp: Date.now() - 10_000 }),
    ).not.toThrow();
  });

  it('rejects a fix with accuracy beyond the threshold', () => {
    expect(() => validateGeoFix({ accuracy: 101, clientTimestamp: Date.now() - 10_000 })).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE_ACCURACY' }),
    );
  });

  it('accepts a fix exactly at the age threshold (strict >)', () => {
    expect(() =>
      validateGeoFix({ accuracy: 50, clientTimestamp: Date.now() - 60_000 }),
    ).not.toThrow();
  });

  it('rejects a stale GPS fix older than the threshold', () => {
    // Fix vecchio di 61 secondi → supera la soglia di 60s
    expect(() => validateGeoFix({ accuracy: 50, clientTimestamp: Date.now() - 61_000 })).toThrow(
      expect.objectContaining({ code: 'STALE_FIX' }),
    );
  });

  it('checks accuracy before age (fail-fast)', () => {
    // Entrambi fuori soglia: deve lanciare l'errore di accuracy (controllato per primo)
    expect(() => validateGeoFix({ accuracy: 999, clientTimestamp: Date.now() - 999_000 })).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE_ACCURACY' }),
    );
  });
});
