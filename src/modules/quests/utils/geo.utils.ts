import { GeoFix } from '@trentino-quest/shared-types';
import { GeoJsonPoint } from '../../../database/models/Quest.model';
import { env } from '../../../config/env';
import { GeoFixRejectedError } from '../../../utils/errors';

/**
 * Coordinate geografiche in formato {lat, lng}, allineato all'interfaccia
 * GeoPoint di shared-types e usato dall'API REST.
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Raggio medio della Terra in metri, usato dalla formula di Haversine.
 */
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Converte gradi in radianti.
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcola la distanza geodesica tra due punti sulla superficie terrestre
 * usando la formula di Haversine. Restituisce il risultato in metri.
 *
 * La formula di Haversine ha precisione ottima per distanze fino a qualche
 * centinaio di chilometri e tratta la Terra come una sfera (approssimazione
 * sufficiente per le distanze rilevanti in questo dominio applicativo: il
 * raggio di check-in di una quest e' al massimo 500 metri).
 */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1Rad = degreesToRadians(a.lat);
  const lat2Rad = degreesToRadians(b.lat);
  const deltaLat = degreesToRadians(b.lat - a.lat);
  const deltaLng = degreesToRadians(b.lng - a.lng);

  const sinDeltaLatHalf = Math.sin(deltaLat / 2);
  const sinDeltaLngHalf = Math.sin(deltaLng / 2);

  const h =
    sinDeltaLatHalf * sinDeltaLatHalf +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDeltaLngHalf * sinDeltaLngHalf;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Converte un GeoPoint dell'API REST nel formato GeoJsonPoint usato da
 * MongoDB per le query geografiche.
 *
 * IMPORTANTE: l'ordine delle coordinate viene invertito. GeoJSON segue
 * lo standard [longitude, latitude] in contrasto con la convenzione
 * umana "lat, lng".
 */
export function geoPointToGeoJson(point: GeoPoint): GeoJsonPoint {
  return {
    type: 'Point',
    coordinates: [point.lng, point.lat],
  };
}

/**
 * Converte un GeoJsonPoint di MongoDB nel formato GeoPoint dell'API REST.
 *
 * Operazione inversa di geoPointToGeoJson: riporta l'ordine delle
 * coordinate alla convenzione umana.
 */
export function geoJsonToGeoPoint(geoJson: GeoJsonPoint): GeoPoint {
  return {
    lng: geoJson.coordinates[0],
    lat: geoJson.coordinates[1],
  };
}

/**
 * Converte in modo tollerante un valore di coordinate persistito nel campo
 * Mixed di un documento (collezionabile) verso il formato GeoPoint dell'API.
 *
 * Il campo puo' contenere forme diverse a seconda di come e' stato scritto:
 *  - GeoJSON `{ type: 'Point', coordinates: [lng, lat] }` (seed e write path corretto)
 *  - legacy `{ lat, lng }` (documenti scritti da versioni precedenti del CRUD)
 *  - null / valore malformato
 *
 * In tutti i casi NON lancia mai: un dato malformato viene degradato a null
 * cosi' la serializzazione di una lista non fallisce a causa di un singolo
 * documento sporco. Restituire null e' preferibile a un 500.
 */
export function toGeoPointTolerant(value: unknown): GeoPoint | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;

  // Forma GeoJSON: array [lng, lat]
  const coords = record.coordinates;
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return { lng: coords[0], lat: coords[1] };
  }

  // Forma legacy { lat, lng }
  if (typeof record.lat === 'number' && typeof record.lng === 'number') {
    return { lat: record.lat, lng: record.lng };
  }

  return null;
}

/**
 * Metadati di qualita' di un fix GPS validati dalla funzione anti-cheat.
 *
 * Sottoinsieme di GeoFix di shared-types che esclude lat/lng: la
 * validazione anti-cheat non li usa, quindi non li accettiamo nella
 * firma (interface segregation). Quando un endpoint riceve un GeoFix
 * completo, passa solo i campi rilevanti tramite destrutturazione.
 */
export type GeoFixQualityMetadata = Pick<GeoFix, 'accuracy' | 'clientTimestamp'>;

/**
 * Valida i metadati di qualita' di un fix GPS contro le soglie anti-cheat
 * configurate via env.
 *
 * Da invocare nei controller di check-in e scansione QR quando il client
 * ha inviato il campo opzionale `fix`. Se il fix supera le soglie, lancia
 * GeoFixRejectedError, che il middleware di error handling globale mappa
 * automaticamente a HTTP 422 con il codice applicativo appropriato.
 *
 * Il confronto e' strict (>): un fix con accuracy o eta' esattamente pari
 * alla soglia configurata e' accettato. Questo riflette l'interpretazione
 * naturale di "soglia massima" come limite incluso.
 *
 * Cause di rifiuto:
 *  - OUT_OF_RANGE_ACCURACY: accuracy > GEO_MAX_ACCURACY_METERS
 *  - STALE_FIX: eta' del fix > GEO_MAX_FIX_AGE_SECONDS
 *
 * Allineato con UC-22.4 (validazione GPS alla scansione QR) e UC-30
 * (check-in geolocalizzato) del Deliverable D1.
 */
export function validateGeoFix(fix: GeoFixQualityMetadata): void {
  // Rifiuto per accuracy insufficiente.
  if (fix.accuracy > env.GEO_MAX_ACCURACY_METERS) {
    throw new GeoFixRejectedError(
      `GPS troppo impreciso: accuracy ${fix.accuracy}m, soglia ${env.GEO_MAX_ACCURACY_METERS}m`,
      'OUT_OF_RANGE_ACCURACY',
      {
        actualAccuracy: fix.accuracy,
        maxAllowedAccuracy: env.GEO_MAX_ACCURACY_METERS,
      },
    );
  }

  // Rifiuto per fix obsoleto.
  // Conversione a secondi una volta sola per consistenza con env e messaggi.
  const fixAgeSeconds = (Date.now() - fix.clientTimestamp) / 1000;
  if (fixAgeSeconds > env.GEO_MAX_FIX_AGE_SECONDS) {
    throw new GeoFixRejectedError(
      `Fix GPS troppo vecchio: ${Math.round(fixAgeSeconds)}s, soglia ${env.GEO_MAX_FIX_AGE_SECONDS}s`,
      'STALE_FIX',
      {
        fixAgeSeconds: Math.round(fixAgeSeconds),
        maxAllowedAgeSeconds: env.GEO_MAX_FIX_AGE_SECONDS,
      },
    );
  }
}
