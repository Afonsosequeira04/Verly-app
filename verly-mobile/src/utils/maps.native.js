import MapView, { Marker } from 'react-native-maps';

export function getMapComponents() {
  return { MapView, Marker, supported: true };
}
