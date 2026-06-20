// Mock for react-leaflet
const React = require('react');

const MapContainer = ({ children, ...props }) =>
  React.createElement('div', { 'data-testid': 'map-container', ...props }, children);

const TileLayer = () => React.createElement('div', { 'data-testid': 'tile-layer' });
const Marker = ({ children, ...props }) =>
  React.createElement('div', { 'data-testid': 'map-marker', ...props }, children);
const Popup = ({ children }) =>
  React.createElement('div', { 'data-testid': 'map-popup' }, children);
const CircleMarker = ({ children, ...props }) =>
  React.createElement('div', { 'data-testid': 'circle-marker', ...props }, children);
const Circle = (props) =>
  React.createElement('div', { 'data-testid': 'map-circle' });
const Polygon = ({ children, ...props }) =>
  React.createElement('div', { 'data-testid': 'map-polygon', ...props }, children);
const LayersControl = ({ children }) =>
  React.createElement('div', { 'data-testid': 'layers-control' }, children);
const ZoomControl = () => React.createElement('div', { 'data-testid': 'zoom-control' });
const useMap = jest.fn(() => ({
  setView: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  getBounds: jest.fn(() => ({ contains: jest.fn(() => true) })),
  getZoom: jest.fn(() => 12),
  fitBounds: jest.fn(),
  invalidateSize: jest.fn(),
}));
const useMapEvents = jest.fn(() => null);

module.exports = {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Circle,
  Polygon,
  LayersControl,
  ZoomControl,
  useMap,
  useMapEvents,
};
