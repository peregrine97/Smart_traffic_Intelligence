import React, { useState } from 'react';
import { parseNLPDescription, predictIncident, geocodeZone } from '../../lib/api';
import { TextAUnderline, ListBullets, MapPin, SpinnerGap, Warning, Robot } from '@phosphor-icons/react';
import ZoneClarificationModal from './ZoneClarificationModal';

// ---------------------------------------------------------------------------
// Available LLM models for Agent 1 (NLP) + Agent 4 (Action Planner)
// All are routed through the Groq API — no extra keys needed.
// ---------------------------------------------------------------------------
const MODEL_OPTIONS = [
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', provider: 'Meta', badge: 'Fast' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'Meta', badge: 'Smart' },
    { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1', provider: 'DeepSeek', badge: 'Reasoning' },
    { id: 'qwen-2.5-32b', label: 'Qwen 2.5 32B', provider: 'Alibaba', badge: 'Balanced' },
] as const;

// ---------------------------------------------------------------------------
// Vehicle-type applicability per event cause
// ---------------------------------------------------------------------------
/** Causes where a specific vehicle IS the source of the incident. Dropdown shown + required-ish. */
const CAUSES_VEHICLE_REQUIRED = new Set([
    'vehicle_breakdown',
    'accident',
]);

/** Causes where NO vehicle is involved — field is irrelevant (auto-set to null). */
const CAUSES_NO_VEHICLE = new Set([
    'tree_fall',
    'water_logging',
    'pot_holes',
    'construction',
    'public_event',
]);

/** All other causes (others, procession, vip_movement, protest, congestion, etc.)
 *  will show the dropdown as optional — default is "unknown". */

type ModelId = typeof MODEL_OPTIONS[number]['id'];

interface ResolvedLocation {
    name: string;
    lat: number;
    lng: number;
}

interface SubmitIncidentViewProps {
    onOpenPanel: (data: any) => void;
    /** Called after a successful submission with the resolved lat/lng pin. */
    onPinDropped: (pin: { lat: number; lng: number; zone: string }) => void;
}

export default function SubmitIncidentView({ onOpenPanel, onPinDropped }: SubmitIncidentViewProps) {
    const [mode, setMode] = useState<'nlp' | 'structured'>('structured');
    const [description, setDescription] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelId | null>(null);

    // Structured state
    const [eventType, setEventType] = useState('0'); // 0 = unplanned, 1 = planned
    const [eventCause, setEventCause] = useState('vehicle_breakdown');
    const [zone, setZone] = useState('');
    const [corridorRank, setCorridorRank] = useState('0');
    // 'unknown' → sends null to backend (model trained with null→'unknown' fill)
    // 'none'    → cause has no vehicle; also sends null but field is hidden
    const [vehType, setVehType] = useState('unknown');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Geocoding / clarification state
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [showClarification, setShowClarification] = useState(false);
    const [clarificationCandidates, setClarificationCandidates] = useState<
        { name: string; lat: number; lng: number }[]
    >([]);
    // Resolved location — set once the user confirms (either automatically or via modal)
    const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);

    // ---------------------------------------------------------------------------
    // Geocoding step — called on submit before predict
    // ---------------------------------------------------------------------------

    /**
     * Attempts to geocode the current zone string.
     * Returns the resolved location on success, or null if we need to show
     * the clarification modal or surface an error.
     *
     * Side effects: sets isGeocoding, error, showClarification state.
     */
    const resolveZone = async (zoneStr: string): Promise<ResolvedLocation | null> => {
        setIsGeocoding(true);
        setError(null);

        const result = await geocodeZone(zoneStr);
        setIsGeocoding(false);

        if (result.confidence === 'high' && result.lat !== undefined && result.lng !== undefined) {
            return {
                name: result.resolved_name || zoneStr,
                lat: result.lat,
                lng: result.lng,
            };
        }

        if (result.confidence === 'ambiguous' && result.candidates?.length) {
            setClarificationCandidates(result.candidates);
            setShowClarification(true);
            // Resolution happens via the modal callback
            return null;
        }

        // Failed
        setError(
            result.message ||
            'Could not resolve this location. Try a more specific name or add a landmark.'
        );
        return null;
    };

    // ---------------------------------------------------------------------------
    // Main submit handler
    // ---------------------------------------------------------------------------

    const runPrediction = async (
        location: ResolvedLocation,
        nlpResult: any,
        featuresOverride?: any
    ) => {
        const corridorNames: Record<string, string> = {
            '0': 'Non-corridor',
            '1': 'ORR East 1',
            '2': 'Hosur Road',
        };

        const eventTypeStr = eventType === '1' ? 'planned' : 'unplanned';

        // Resolve the veh_type to send to the backend:
        // • No-vehicle causes           → always null (model trained on null→'unknown' fill)
        // • 'unknown' selection          → null (let model use its learned default)
        // • Any real vehicle type        → send the value
        const resolvedVehType: string | null =
            CAUSES_NO_VEHICLE.has(eventCause)
                ? null
                : (vehType === 'unknown' || vehType === 'none' ? null : vehType);

        let features: any = featuresOverride || {
            event_type: eventTypeStr,
            corridor: corridorNames[corridorRank] || 'Non-corridor',
            event_cause: eventCause,
            veh_type: resolvedVehType,
            requires_road_closure: false,
            start_datetime: new Date().toISOString(),
            zone: location.name,
            planned_duration_minutes: eventTypeStr === 'planned' ? 60 : 0,
            // Resolved coordinates sent to the backend for heatmap placement
            lat: location.lat,
            lng: location.lng,
        };

        if (mode === 'nlp' && nlpResult) {
            features.event_cause = nlpResult.root_cause || features.event_cause;
            // NLP returns null when no vehicle is mentioned — honour that by explicitly
            // setting null rather than leaving the form's default value in place.
            if ('vehicle_type' in nlpResult) {
                features.veh_type = nlpResult.vehicle_type || null;
            }
        }

        const prediction = await predictIncident(features);

        if (!prediction) {
            throw new Error('Failed to get prediction from the backend');
        }

        // Drop a pin on the city map
        onPinDropped({ lat: location.lat, lng: location.lng, zone: location.name });

        onOpenPanel({
            ...features,
            ...prediction,
            nlpResult,
            event_type: features.event_type,
            event_cause: features.event_cause,
            // Coordinates shown in the IncidentPanel Context section
            lat: location.lat,
            lng: location.lng,
            resolved_zone_name: location.name,
            // Pass selected model so IncidentPanel forwards it to the action planner
            selected_model: selectedModel || undefined,
        });

        // Clear form
        if (mode === 'nlp') setDescription('');
        setZone('');
        setResolvedLocation(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // ── Validate zone is present ─────────────────────────────────────────
        const zoneStr = zone.trim();
        if (!zoneStr) {
            setError('Zone / Area is required. Please enter the location of the incident.');
            return;
        }

        // ── Validate description for NLP mode ────────────────────────────────
        if (mode === 'nlp' && !description.trim()) {
            setError('Please enter an incident description.');
            return;
        }

        // ── Validate AI Model is selected ────────────────────────────────────
        if (!selectedModel) {
            setError('Please select an AI Model (e.g., Compound Mini) to analyze the incident.');
            return;
        }

        setIsLoading(true);

        try {
            // ── Step 1: NLP parse (if in NLP mode) ───────────────────────────
            let nlpResult = null;
            if (mode === 'nlp') {
                nlpResult = await parseNLPDescription(description, selectedModel || undefined);
            }

            // ── Step 2: Geocode the zone ──────────────────────────────────────
            const location = await resolveZone(zoneStr);

            if (!location) {
                // Either the clarification modal opened (ambiguous)
                // or an error was already set (failed). Stop here.
                // Store nlpResult so the modal callback can use it.
                setIsLoading(false);
                return;
            }

            // ── Step 3: Predict + open panel ─────────────────────────────────
            await runPrediction(location, nlpResult);

        } catch (err: any) {
            setError(err.message || 'An error occurred during submission.');
        } finally {
            setIsLoading(false);
        }
    };

    // Called when the user picks/confirms a location from the clarification modal
    const handleClarificationConfirm = async (loc: ResolvedLocation) => {
        setShowClarification(false);
        setClarificationCandidates([]);
        setResolvedLocation(loc);
        setIsLoading(true);

        try {
            let nlpResult = null;
            if (mode === 'nlp' && description.trim()) {
                nlpResult = await parseNLPDescription(description, selectedModel || undefined);
            }
            await runPrediction(loc, nlpResult);
        } catch (err: any) {
            setError(err.message || 'An error occurred during submission.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClarificationCancel = () => {
        setShowClarification(false);
        setClarificationCandidates([]);
        setIsLoading(false);
    };

    const isBusy = isLoading || isGeocoding;

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Clarification modal — rendered as an absolute overlay over the entire submit view */}
            {showClarification && (
                <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-0 md:p-8 overflow-y-auto">
                    <ZoneClarificationModal
                        initialZone={zone}
                        initialCandidates={clarificationCandidates}
                        onConfirm={handleClarificationConfirm}
                        onCancel={handleClarificationCancel}
                    />
                </div>
            )}

            <div className={`flex-1 flex justify-center p-8 w-full ${showClarification ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                <div className="neo-brutal-box p-8 bg-white max-w-2xl w-full h-fit">
                    <h2 className="font-mono text-2xl font-bold uppercase mb-6 border-b-4 border-neo-border pb-2 flex items-center gap-3">
                        <MapPin weight="bold" />
                        Submit New Incident
                    </h2>

                    {/* Mode Toggles */}
                    <div className="flex flex-col sm:flex-row mb-8 border-3 border-neo-border">
                        <button
                            type="button"
                            onClick={() => setMode('structured')}
                            className={`flex-1 py-3 px-2 sm:px-4 font-mono font-bold uppercase flex justify-center items-center gap-2 transition-all text-sm sm:text-base ${mode === 'structured' ? 'bg-neo-primary text-neo-text' : 'bg-white hover:bg-neo-secondary'
                                }`}
                        >
                            <ListBullets size={20} weight="bold" className="shrink-0" />
                            <span>Structured</span>
                        </button>
                        <div className="h-[3px] w-full sm:w-[3px] sm:h-auto bg-neo-border" />
                        <button
                            type="button"
                            onClick={() => setMode('nlp')}
                            className={`flex-1 py-3 px-2 sm:px-4 font-mono font-bold uppercase flex justify-center items-center gap-2 transition-all text-sm sm:text-base ${mode === 'nlp' ? 'bg-neo-primary text-neo-text' : 'bg-white hover:bg-neo-secondary'
                                }`}
                        >
                            <TextAUnderline size={20} weight="bold" className="shrink-0" />
                            <span>Raw Text</span>
                        </button>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-100 border-3 border-neo-border font-mono text-sm text-red-700 font-bold flex items-start gap-2">
                            <Warning size={18} weight="bold" className="flex-shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {mode === 'nlp' ? (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                        Describe the incident (Any language)
                                        <span className="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full border-3 border-neo-border p-4 h-40 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm resize-none bg-neo-bg"
                                        placeholder="e.g., ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್ (BMTC bus broken down)"
                                        required
                                    />
                                    <p className="text-xs font-mono text-gray-500">
                                        Our AI will automatically extract the cause, severity, and vehicle type.
                                    </p>
                                </div>

                                {/* Zone — REQUIRED in NLP mode */}
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                        Zone / Area
                                        <span className="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={zone}
                                        onChange={(e) => setZone(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                        placeholder="e.g., HSR Layout, Silk Board, Whitefield"
                                        required
                                    />
                                    <p className="text-xs font-mono text-gray-400">
                                        Required — AI will resolve the exact coordinates for this area.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                            Event Type
                                            <span className="text-red-500 ml-0.5">*</span>
                                        </label>
                                        <select
                                            value={eventType}
                                            onChange={(e) => setEventType(e.target.value)}
                                            className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg truncate min-w-0"
                                        >
                                            <option value="0">Unplanned</option>
                                            <option value="1">Planned</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                            Corridor Type
                                            <span className="text-red-500 ml-0.5">*</span>
                                        </label>
                                        <select
                                            value={corridorRank}
                                            onChange={(e) => setCorridorRank(e.target.value)}
                                            className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg truncate min-w-0"
                                        >
                                            <option value="0">Non-corridor</option>
                                            <option value="1">ORR Variants</option>
                                            <option value="2">Major Named Corridor</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                        Event Cause
                                        <span className="text-red-500 ml-0.5">*</span>
                                    </label>
                                    <select
                                        value={eventCause}
                                        onChange={(e) => setEventCause(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg truncate min-w-0"
                                    >
                                        <option value="vehicle_breakdown">Vehicle Breakdown</option>
                                        <option value="tree_fall">Tree Fall</option>
                                        <option value="accident">Accident</option>
                                        <option value="water_logging">Water Logging</option>
                                        <option value="pot_holes">Potholes</option>
                                        <option value="construction">Construction</option>
                                        <option value="public_event">Public Event</option>
                                        <option value="others">Others</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Zone — REQUIRED in Structured mode */}
                                    <div className="space-y-2">
                                        <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                            Zone / Area
                                            <span className="text-red-500 ml-0.5">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={zone}
                                            onChange={(e) => setZone(e.target.value)}
                                            className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                            placeholder="e.g., Koramangala"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        {/* Label row: hide asterisk for no-vehicle causes */}
                                        <label className="block font-mono font-bold uppercase text-sm flex items-center gap-1">
                                            Vehicle Type
                                            {CAUSES_VEHICLE_REQUIRED.has(eventCause) && (
                                                <span className="text-red-500 ml-0.5" title="Required for this cause">*</span>
                                            )}
                                            {CAUSES_NO_VEHICLE.has(eventCause) && (
                                                <span className="text-xs normal-case text-gray-400 font-normal ml-1">(not applicable)</span>
                                            )}
                                        </label>

                                        {CAUSES_NO_VEHICLE.has(eventCause) ? (
                                            /* ── No vehicle involved — show a read-only badge ── */
                                            <div className="w-full border-3 border-neo-border p-3 bg-gray-50 font-mono text-sm text-gray-400 flex items-center gap-2 select-none">
                                                <span className="inline-block w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                                                N/A — no vehicle for this cause
                                            </div>
                                        ) : (
                                            /* ── Vehicle possibly involved — show full dropdown ── */
                                            <select
                                                value={vehType}
                                                onChange={(e) => setVehType(e.target.value)}
                                                className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg truncate min-w-0"
                                            >
                                                {/* Default: unknown — backend treats null/unknown correctly */}
                                                <option value="unknown">Unknown (auto-detect)</option>
                                                <option disabled className="text-gray-300">──────────────</option>
                                                <option value="private_car">Private Car</option>
                                                <option value="two_wheeler">Two Wheeler</option>
                                                <option value="bmtc_bus">BMTC Bus</option>
                                                <option value="heavy_vehicle">Heavy Vehicle</option>
                                                <option value="auto">Auto Rickshaw</option>
                                                <option value="others">Others</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── AI Model Selector ─────────────────────────────────── */}
                        <div className="pt-2 space-y-2">
                            <label className="block font-mono font-bold uppercase text-sm flex items-center gap-2">
                                <Robot size={16} weight="bold" />
                                <span>AI Model <span className="text-red-500 ml-0.5">*</span></span>
                                <span className="text-xs font-normal normal-case text-gray-400 ml-1">(Agent 1 NLP + Agent 4 Plan)</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {MODEL_OPTIONS.map((opt) => {
                                    const isSelected = selectedModel === opt.id;
                                    return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setSelectedModel(opt.id)}
                                        className={`relative flex flex-col items-start px-3 py-3 border-3 font-mono text-left transition-all ${isSelected
                                            ? 'border-neo-border bg-[#9FE870] shadow-none translate-x-[2px] translate-y-[2px]'
                                            : 'border-neo-border bg-white hover:bg-[#D4F0C4] shadow-[3px_3px_0px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between w-full gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black uppercase truncate ${isSelected ? 'text-black' : 'text-neo-text'}`}>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="text-black bg-white rounded-full p-0.5">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 border border-neo-border shrink-0 ${isSelected ? 'bg-white text-black' : 'bg-neo-bg text-gray-600'
                                                }`}>{opt.badge}</span>
                                        </div>
                                        <span className={`text-[10px] mt-1 font-bold ${isSelected ? 'text-black/80' : 'text-gray-500'}`}>{opt.provider}</span>
                                    </button>
                                )})}
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isBusy}
                                className="w-full btn-neo py-4 text-lg font-bold font-mono uppercase flex justify-center items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isBusy ? (
                                    <>
                                        <SpinnerGap size={24} className="animate-spin" />
                                        {isGeocoding ? 'Resolving Location…' : 'Processing…'}
                                    </>
                                ) : (
                                    'Analyze & Generate Plan'
                                )}
                            </button>
                            <p className="text-center text-xs font-mono text-gray-400 mt-2">
                                <span className="text-red-500">*</span> Zone / Area and AI Model are required for submission
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
