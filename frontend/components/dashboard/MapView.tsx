import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import L from 'leaflet';
import 'leaflet.heat';
import { fetchHeatmap, fetchIncidents, fetchAnomalyScores, predictIncident, resetAnomalyReplay } from '../../lib/api';
import { WarningCircle, Lightning, ArrowRight, ListDashes, X, ArrowsClockwise } from '@phosphor-icons/react';

// --- Heatmap Layer Component ---
function HeatmapLayer({ points }: { points: Array<[number, number, number]> }) {
    const map = useMap();
    const layerRef = useRef<any>(null);

    useEffect(() => {
        if (!map || points.length === 0) return;

        if (!layerRef.current) {
            // @ts-ignore
            layerRef.current = L.heatLayer(points, {
                radius: 25,
                blur: 15,
                maxZoom: 15,
                gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
            }).addTo(map);
        } else {
            layerRef.current.setLatLngs(points);
        }

        return () => {
            if (layerRef.current && map) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [map, points]);

    return null;
}

interface MapViewProps {
    onOpenPanel: (data: any) => void;
}

export default function MapView({ onOpenPanel }: MapViewProps) {
    const [heatmapData, setHeatmapData] = useState<Array<[number, number, number]>>([]);
    const [incidents, setIncidents] = useState<any[]>([]);
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState(false);
    const [replayCounter, setReplayCounter] = useState(0);

    const bglrCenter: [number, number] = [12.9716, 77.5946];

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [heatRes, incRes] = await Promise.all([
                    fetchHeatmap(),
                    fetchIncidents()
                ]);
                
                if (heatRes && Array.isArray(heatRes)) {
                    setHeatmapData(heatRes.map((h: any) => [h.lat, h.lng, h.weight]));
                }
                
                if (incRes && Array.isArray(incRes)) {
                    setIncidents(incRes.slice(0, 500)); // Limit to 500 for perf if needed
                }
            } catch (err) {
                console.error("Error loading map data", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    // Anomaly polling - depends on replayCounter to reset timer on restart
    useEffect(() => {
        const fetchScores = async () => {
            const anomRes = await fetchAnomalyScores();
            if (anomRes && Array.isArray(anomRes)) {
                setAnomalies(anomRes);
            }
        };

        fetchScores();
        
        const interval = setInterval(fetchScores, 5000);
        return () => clearInterval(interval);
    }, [replayCounter]);

    const handleIncidentClick = async (incident: any) => {
        // According to AGENTS.md, clicking a map marker opens Incident Panel and runs prediction fresh.
        // Send fields the PredictRequest schema accepts — backend derives corridor_rank internally.
        const features = {
            event_type: incident.event_type === 1 || incident.event_type === 'planned' ? 'planned' : 'unplanned',
            corridor: incident.corridor || 'Non-corridor',
            event_cause: incident.event_cause,
            veh_type: incident.veh_type,
            requires_road_closure: Boolean(incident.requires_road_closure),
            start_datetime: incident.start_datetime || new Date().toISOString(),
            zone: incident.zone || undefined,
            junction: incident.junction || undefined,
            planned_duration_minutes: 0,
            address: incident.address,
            police_station: incident.police_station,
        };

        // predict (Agent 2)
        const prediction = await predictIncident(features);
        
        onOpenPanel({
            ...incident,
            ...prediction,
            // Preserve string event_type for the action planner
            event_type: features.event_type,
        });
    };

    const handleAnomalyPlanClick = async (zoneData: any) => {
        // Trigger prediction for anomaly zone context.
        // Use 'unplanned' as event_type (valid enum value) and mark is_zone_alert
        // so the action planner frames the plan as a zone-level pre-emptive response.
        const zoneFeatures = {
            event_type: 'unplanned',
            event_cause: 'congestion',
            zone: zoneData.zone || undefined,
            start_datetime: new Date().toISOString(),
        };
        const prediction = await predictIncident(zoneFeatures);

        onOpenPanel({
            zone: zoneData.zone,
            event_cause: 'congestion',
            event_type: 'unplanned',
            is_zone_alert: true,
            ...prediction,
            // Override priority with the anomaly alert level
            priority: zoneData.alert_level === 'Critical' ? 'High' : 'Low',
            confidence: Math.abs(zoneData.anomaly_score ?? 0),
        });
    };

    // Custom Icon based on priority
    const createCustomIcon = (priority: string) => L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${priority === 'High' ? '#ef4444' : '#f59e0b'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #163300; box-shadow: 2px 2px 0px #163300;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    return (
        <div className="w-full h-full relative flex">
            {/* Floating Action Button for Anomalies */}
            <button 
                onClick={() => setIsAnomalyModalOpen(true)}
                className="absolute top-4 left-4 z-[1000] bg-white border-4 border-neo-border p-3 shadow-neo hover:bg-neo-secondary transition-colors group flex items-center justify-center gap-2"
                title="View Anomalies"
            >
                <div className="relative">
                    <ListDashes size={28} weight="bold" />
                    {anomalies.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-neo-border">
                            {anomalies.length}
                        </span>
                    )}
                </div>
                <span className="font-mono font-bold uppercase hidden md:block">Anomalies</span>
            </button>

            {/* Anomaly Modal Overlay */}
            {isAnomalyModalOpen && (
                <div className="absolute inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAnomalyModalOpen(false)}>
                    <div 
                        className="bg-neo-bg border-4 border-neo-border w-full max-w-md max-h-full flex flex-col shadow-[-8px_8px_0_0_rgba(22,51,0,1)] pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-4 border-b-4 border-neo-border bg-neo-primary flex-wrap gap-2">
                            <h2 className="font-mono text-xl font-bold uppercase flex items-center gap-2">
                                <WarningCircle size={24} weight="bold" />
                                Active Anomalies
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={async () => {
                                        const resetState = await resetAnomalyReplay();
                                        if (resetState && Array.isArray(resetState)) {
                                            setAnomalies(resetState);
                                            setReplayCounter(c => c + 1); // Reset the 5s polling timer
                                        }
                                    }}
                                    className="px-3 py-1 text-sm font-bold border-2 border-neo-border bg-white hover:bg-neo-secondary transition-colors flex items-center gap-2 uppercase"
                                    title="Restart the simulation replay from the beginning"
                                >
                                    <ArrowsClockwise size={16} weight="bold" />
                                    Replay
                                </button>
                                <button 
                                    onClick={() => setIsAnomalyModalOpen(false)}
                                    className="p-1 border-2 border-neo-border bg-white hover:bg-neo-secondary transition-colors"
                                    title="Close"
                                >
                                    <X size={20} weight="bold" />
                                </button>
                            </div>
                        </div>
                        
                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto flex flex-col gap-4 bg-grid">
                            {anomalies.length === 0 ? (
                                <div className="text-center p-8 bg-white border-2 border-neo-border font-mono font-bold">
                                    No active anomalies detected.
                                </div>
                            ) : (
                                anomalies.map((anom, idx) => (
                                    <div key={idx} className="neo-brutal-box p-4 bg-white">
                                        <div className="flex justify-between items-start mb-2 border-b-2 border-neo-border pb-2">
                                            <h3 className="font-mono font-bold uppercase truncate">{anom.zone || 'Unknown Zone'}</h3>
                                            <span className={`px-2 py-0.5 text-xs font-mono font-bold border-2 border-neo-border ${
                                                anom.alert_level === 'Critical' ? 'bg-red-500 text-white' : 
                                                anom.alert_level === 'Watch' ? 'bg-amber-400 text-black' : 'bg-neo-primary text-neo-text'
                                            }`}>
                                                {anom.alert_level}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                                            <div className="text-gray-500">Active Incidents</div>
                                            <div className="font-bold text-right">{anom.incident_count}</div>
                                            <div className="text-gray-500">High Priority %</div>
                                            <div className="font-bold text-right">{Math.round((anom.high_priority_ratio || 0)*100)}%</div>
                                            <div className="text-gray-500">Avg Duration</div>
                                            <div className="font-bold text-right">{Math.round(anom.mean_duration || 0)}m</div>
                                        </div>
                                        {(anom.alert_level === 'Critical' || anom.alert_level === 'Watch') && (
                                            <button 
                                                onClick={() => {
                                                    setIsAnomalyModalOpen(false);
                                                    handleAnomalyPlanClick(anom);
                                                }}
                                                className="w-full btn-neo text-xs py-2 flex items-center justify-center gap-2 uppercase font-bold"
                                            >
                                                Generate Plan <ArrowRight size={14} weight="bold" />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Map Container */}
            <MapContainer center={bglrCenter} zoom={12} className="w-full h-full z-10" zoomControl={false}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                
                {heatmapData.length > 0 && <HeatmapLayer points={heatmapData} />}

                {incidents.map((inc, idx) => (
                    <Marker 
                        key={idx} 
                        position={[inc.lat, inc.lng]} 
                        icon={createCustomIcon(inc.priority)}
                        eventHandlers={{
                            click: () => handleIncidentClick(inc)
                        }}
                    >
                        <Popup className="font-mono neo-popup">
                            <div className="font-bold mb-1">{inc.junction || inc.address || 'Unknown Location'}</div>
                            <div className="text-xs mb-2">{inc.event_type} - {inc.priority}</div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleIncidentClick(inc); }}
                                className="bg-neo-primary text-neo-text border-2 border-neo-border px-2 py-1 text-xs w-full uppercase font-bold hover:bg-neo-secondary"
                            >
                                View Details
                            </button>
                        </Popup>
                    </Marker>
                ))}

                {/* Optional: Add Zoom Control to bottom right so it doesn't overlap sidebar */}
                <div className="leaflet-bottom leaflet-right">
                    <div className="leaflet-control-zoom leaflet-bar leaflet-control">
                        <a className="leaflet-control-zoom-in" href="#" title="Zoom in" role="button" aria-label="Zoom in">+</a>
                        <a className="leaflet-control-zoom-out" href="#" title="Zoom out" role="button" aria-label="Zoom out">−</a>
                    </div>
                </div>
            </MapContainer>
        </div>
    );
}
