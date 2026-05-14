import { GeoJsonPoint } from '../../../database/models/Quest.model';

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
