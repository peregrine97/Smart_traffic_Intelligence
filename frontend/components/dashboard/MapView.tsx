import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import L from 'leaflet';
import 'leaflet.heat';
import {
    fetchHeatmap,
    fetchHeatmapReplay,
    resetHeatmapReplay,
    fetchIncidents,
    fetchAnomalyScores,
    predictIncident,
    resetAnomalyReplay,
} from '../../lib/api';
import { WarningCircle, ArrowRight, ListDashes, X, ArrowsClockwise, Play, Stop } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Heatmap Layer — updates the Leaflet heat layer whenever `points` changes.
// The layer instance is kept in a ref so setLatLngs() is called instead of
// destroying and re-creating the layer on every poll.
// ---------------------------------------------------------------------------
function HeatmapLayer({ points }: { points: Array<[number, number, number]> }) {
    const map = useMap();
    const layerRef = useRef<any>(null);

    // 1. Unmount cleanup effect (runs only on mount/unmount)
    useEffect(() => {
        return () => {
            if (layerRef.current && map) {
                if (layerRef.current._onZoomEnd) {
                    map.off('zoomend', layerRef.current._onZoomEnd);
                }
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [map]);

    // 2. Data update and initialization effect
    useEffect(() => {
        if (!map || points.length === 0) return;

        // Calculate actual max value from the data dynamically instead of guessing
        const calculatedMax = Math.max(...points.map(p => p[2]));
        const dynamicMax = calculatedMax > 0.5 ? calculatedMax : 1.0;

        // Function to determine responsive styling based on zoom level
        const getZoomOptions = () => {
            const z = map.getZoom();
            // When zoomed out (e.g. city-wide), use small, sharp points so corridors are visible.
            // When zoomed in, use larger, blurrier points for smooth coverage.
            return {
                radius: z >= 14 ? 24 : z >= 12 ? 16 : 8,
                blur: z >= 14 ? 30 : z >= 12 ? 20 : 10,
            };
        };

        if (!layerRef.current) {
            // @ts-ignore — leaflet.heat extends L with heatLayer()
            layerRef.current = L.heatLayer(points, {
                ...getZoomOptions(),
                maxZoom: 13,
                max: dynamicMax, // Dynamically set based on the dataset
                gradient: { 
                    0.3: '#2563eb', // Blue
                    0.5: '#10b981', // Emerald/Green
                    0.7: '#f59e0b', // Amber/Orange
                    0.9: '#ef4444', // Red
                    1.0: '#991b1b'  // Dark Red
                },
            });

            // Safepatch _redraw to prevent crashes if it fires via requestAnimFrame after removal
            // This fixes the "Cannot read properties of null (reading 'getSize')" error.
            const originalRedraw = layerRef.current._redraw;
            layerRef.current._redraw = function() {
                if (!this._map) return; // Abort if layer has been removed from map
                return originalRedraw.call(this);
            };

            layerRef.current.addTo(map);

            const onZoomEnd = () => {
                if (layerRef.current && layerRef.current._map) {
                    layerRef.current.setOptions(getZoomOptions());
                    layerRef.current.redraw(); // Leaflet.heat requires redraw after changing radius/blur
                }
            };

            map.on('zoomend', onZoomEnd);
            layerRef.current._onZoomEnd = onZoomEnd;
        } else {
            // Efficiently update existing layer safely — no DOM teardown
            if (layerRef.current._map) {
                layerRef.current.setOptions({ max: dynamicMax });
                layerRef.current.setLatLngs(points);
            }
        }
    }, [map, points]);

    return null;
}

// ---------------------------------------------------------------------------
// Replay status badge shown inside the Replay button
// ---------------------------------------------------------------------------
type ReplayStatus = 'idle' | 'running' | 'finished';

interface ReplayBadgeProps {
    status: ReplayStatus;
    pointCount: number;
}

function ReplayBadge({ status, pointCount }: ReplayBadgeProps) {
    if (status === 'idle') return null;
    if (status === 'finished') {
        return (
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-neo-primary border-2 border-neo-border uppercase">
                Done · {pointCount.toLocaleString()} pts
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-300 border-2 border-neo-border uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-neo-border inline-block" />
            Live · {pointCount.toLocaleString()} pts
        </span>
    );
}

// ---------------------------------------------------------------------------
// Helper: Sort anomalies by severity, then by score
// ---------------------------------------------------------------------------
const sortAnomalies = (zones: any[]) => {
    const priorityMap: Record<string, number> = { Critical: 1, Watch: 2, Normal: 3 };
    return [...zones].sort((a, b) => {
        const pA = priorityMap[a.alert_level] || 4;
        const pB = priorityMap[b.alert_level] || 4;
        if (pA !== pB) return pA - pB;
        // More negative score = more anomalous, so sort ascending
        return (a.anomaly_score || 0) - (b.anomaly_score || 0);
    });
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface MapViewProps {
    onOpenPanel: (data: any) => void;
}

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------
export default function MapView({ onOpenPanel }: MapViewProps) {
    // ── Heatmap ─────────────────────────────────────────────────────────────
    // staticHeatmap: loaded once from /heatmap (full, pre-computed dataset)
    // replayHeatmap: polled from /heatmap/replay every 5 s when replay is active
    const [staticHeatmap, setStaticHeatmap] = useState<Array<[number, number, number]>>([]);
    const [replayHeatmap, setReplayHeatmap] = useState<Array<[number, number, number]>>([]);
    const [replayStatus, setReplayStatus] = useState<ReplayStatus>('idle');

    // The heatmap displayed on the map is whichever mode is active
    const activeHeatmap = replayStatus !== 'idle' ? replayHeatmap : staticHeatmap;

    // ── Map markers ─────────────────────────────────────────────────────────
    const [incidents, setIncidents] = useState<any[]>([]);

    // ── Anomaly sidebar ─────────────────────────────────────────────────────
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [anomalyProgress, setAnomalyProgress] = useState<{ done: number; total: number; finished: boolean }>({
        done: 0, total: 0, finished: false,
    });
    const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState(false);
    // Bump this to restart the anomaly polling interval after a replay reset
    const [anomalyPollKey, setAnomalyPollKey] = useState(0);

    // ── UI ──────────────────────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    // Stable map key so the MapContainer never re-mounts on state changes
    const [mapId] = useState(() => `map-${Math.random().toString(36).slice(2)}`);

    const bglrCenter: [number, number] = [12.9716, 77.5946];

    // ── Polling refs ─────────────────────────────────────────────────────────
    // We track the replay interval in a ref so startReplay / stopReplay can
    // always reference the current interval ID without stale closure issues.
    const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Track how many points the last poll returned to detect "finished" state
    const lastPointCountRef = useRef<number>(0);
    const stablePointCountRef = useRef<number>(0); // ticks with unchanged count

    // ── Initial load: static heatmap + incident markers ──────────────────────
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const [heatRes, incRes] = await Promise.all([
                    fetchHeatmap(),
                    fetchIncidents(),
                ]);
                if (heatRes && Array.isArray(heatRes)) {
                    setStaticHeatmap(heatRes.map((h: any) => [h.lat, h.lng, h.weight]));
                }
                if (incRes && Array.isArray(incRes)) {
                    // Show up to 500 markers for rendering performance
                    const src = Array.isArray(incRes) ? incRes : (incRes as any).incidents ?? [];
                    setIncidents(src.slice(0, 500));
                }
            } catch (err) {
                console.error('Error loading initial map data:', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    // ── Anomaly polling — 5 s interval, reset by anomalyPollKey ─────────────
    useEffect(() => {
        const poll = async () => {
            const res = await fetchAnomalyScores();
            if (res) {
                setAnomalies(sortAnomalies(res.zones ?? []));
                setAnomalyProgress(res.progress ?? { done: 0, total: 0, finished: false });
            }
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, [anomalyPollKey]);

    // ── Heatmap replay controls ───────────────────────────────────────────────

    // Tracks how many consecutive polls returned the same point count.
    // When this reaches 2, the dataset is considered exhausted.
    const stableCountRef = useRef<number>(0);

    /** Poll the backend every 5 s and push the new point list into state. */
    const pollReplay = useCallback(async () => {
        const res = await fetchHeatmapReplay();
        if (!res || !Array.isArray(res)) return;

        const pts: Array<[number, number, number]> = res.map(
            (p: any) => [p.lat, p.lng, p.weight] as [number, number, number]
        );
        setReplayHeatmap(pts);

        // Detect if the replay has finished (point count stops growing)
        const count = pts.length;
        if (count === lastPointCountRef.current) {
            stableCountRef.current += 1;
            // Two consecutive polls with no new points → dataset exhausted
            if (stableCountRef.current >= 2 && count > 0) {
                setReplayStatus('finished');
            }
        } else {
            stableCountRef.current = 0;
        }
        lastPointCountRef.current = count;
    }, []);


    const startReplay = useCallback(async () => {
        // Reset backend accumulator to start from the first row of the dataset
        await resetHeatmapReplay();

        // Reset local state
        setReplayHeatmap([]);
        setReplayStatus('running');
        lastPointCountRef.current = 0;
        stableCountRef.current = 0;

        // Clear any existing interval before starting a new one
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);

        // Poll immediately and then every 5 s
        await pollReplay();
        replayIntervalRef.current = setInterval(pollReplay, 5000);
    }, [pollReplay]);

    const stopReplay = useCallback(() => {
        if (replayIntervalRef.current) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
        }
        setReplayStatus('idle');
        setReplayHeatmap([]);
    }, []);

    // Clean up the polling interval if the component unmounts
    useEffect(() => {
        return () => {
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        };
    }, []);

    // ── Incident click handler ───────────────────────────────────────────────
    const handleIncidentClick = async (incident: any) => {
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
        const prediction = await predictIncident(features);
        onOpenPanel({ ...incident, ...prediction, event_type: features.event_type });
    };

    // ── Anomaly zone plan click handler ─────────────────────────────────────
    const handleAnomalyPlanClick = async (zoneData: any) => {
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
            priority: zoneData.alert_level === 'Critical' ? 'High' : 'Low',
            confidence: Math.abs(zoneData.anomaly_score ?? 0),
        });
    };

    // ── Marker icon factory ──────────────────────────────────────────────────
    const createCustomIcon = (priority: string) =>
        L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:${priority === 'High' ? '#ef4444' : '#f59e0b'};width:12px;height:12px;border-radius:50%;border:2px solid #163300;box-shadow:2px 2px 0px #163300;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
        });

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="w-full h-full relative flex">

            {/* ── Floating control bar (top-left) ─────────────────────────── */}
            <div className="absolute top-4 left-4 z-40 flex items-center gap-2 flex-wrap">

                {/* Anomalies button */}
                <button
                    onClick={() => setIsAnomalyModalOpen(true)}
                    className="bg-white border-4 border-neo-border p-3 shadow-neo hover:bg-neo-secondary transition-colors flex items-center justify-center gap-2"
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

                {/* Heatmap Replay button */}
                {replayStatus === 'idle' || replayStatus === 'finished' ? (
                    <button
                        onClick={startReplay}
                        className="bg-white border-4 border-neo-border p-3 shadow-neo hover:bg-neo-primary transition-colors flex items-center justify-center gap-2"
                        title="Start heatmap city replay — streams the dataset chronologically"
                    >
                        <Play size={28} weight="bold" />
                        <span className="font-mono font-bold uppercase hidden md:block">
                            {replayStatus === 'finished' ? 'Replay Again' : 'City Replay'}
                        </span>
                    </button>
                ) : (
                    <button
                        onClick={stopReplay}
                        className="bg-amber-300 border-4 border-neo-border p-3 shadow-neo hover:bg-red-400 transition-colors flex items-center justify-center gap-2"
                        title="Stop heatmap replay and return to static view"
                    >
                        <Stop size={28} weight="bold" />
                        <span className="font-mono font-bold uppercase hidden md:block">Stop Replay</span>
                    </button>
                )}

                {/* Replay status badge */}
                <ReplayBadge status={replayStatus} pointCount={replayHeatmap.length} />
            </div>

            {/* ── Anomaly Modal ────────────────────────────────────────────── */}
            {isAnomalyModalOpen && (
                <div
                    className="absolute inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setIsAnomalyModalOpen(false)}
                >
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
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Progress pill */}
                                {anomalyProgress.total > 0 && (
                                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold border-2 border-neo-border uppercase ${
                                        anomalyProgress.finished
                                            ? 'bg-neo-primary'
                                            : 'bg-amber-300'
                                    }`}>
                                        {anomalyProgress.finished ? '✓ Done' : '● Live'}
                                        {' · '}{anomalyProgress.done.toLocaleString()}
                                        {' / '}{anomalyProgress.total.toLocaleString()}
                                    </span>
                                )}
                                <button
                                    onClick={async () => {
                                        const resetState = await resetAnomalyReplay();
                                        if (resetState) {
                                            setAnomalies(sortAnomalies(resetState.zones ?? []));
                                            setAnomalyProgress(resetState.progress ?? { done: 0, total: 0, finished: false });
                                            setAnomalyPollKey(k => k + 1);
                                        }
                                    }}
                                    className="px-3 py-1 text-sm font-bold border-2 border-neo-border bg-white hover:bg-neo-secondary transition-colors flex items-center gap-2 uppercase"
                                    title="Restart the anomaly simulation replay from the beginning"
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
                                                anom.alert_level === 'Watch' ? 'bg-amber-400 text-black' :
                                                'bg-neo-primary text-neo-text'
                                            }`}>
                                                {anom.alert_level}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                                            <div className="text-gray-500">Active Incidents</div>
                                            <div className="font-bold text-right">{anom.incident_count}</div>
                                            <div className="text-gray-500">High Priority %</div>
                                            <div className="font-bold text-right">{Math.round((anom.high_priority_ratio || 0) * 100)}%</div>
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

            {/* ── Map Container ───────────────────────────────────────────── */}
            <MapContainer
                key={mapId}
                center={bglrCenter}
                zoom={12}
                className="w-full h-full z-10"
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {activeHeatmap.length > 0 && <HeatmapLayer points={activeHeatmap} />}

                {incidents.map((inc, idx) => (
                    <Marker
                        key={idx}
                        position={[inc.lat, inc.lng]}
                        icon={createCustomIcon(inc.priority)}
                        eventHandlers={{ click: () => handleIncidentClick(inc) }}
                    >
                        <Popup className="font-mono neo-popup">
                            <div className="font-bold mb-1">{inc.junction || inc.address || 'Unknown Location'}</div>
                            <div className="text-xs mb-2">{inc.event_type} — {inc.priority}</div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleIncidentClick(inc); }}
                                className="bg-neo-primary text-neo-text border-2 border-neo-border px-2 py-1 text-xs w-full uppercase font-bold hover:bg-neo-secondary"
                            >
                                View Details
                            </button>
                        </Popup>
                    </Marker>
                ))}

                {/* Zoom control — bottom-right so it doesn't collide with the sidebar */}
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
