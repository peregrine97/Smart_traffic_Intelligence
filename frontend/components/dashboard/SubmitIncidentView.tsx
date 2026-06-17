import React, { useState } from 'react';
import { parseNLPDescription, predictIncident } from '../../lib/api';
import { TextAUnderline, ListBullets, MapPin, SpinnerGap } from '@phosphor-icons/react';

interface SubmitIncidentViewProps {
    onOpenPanel: (data: any) => void;
}

export default function SubmitIncidentView({ onOpenPanel }: SubmitIncidentViewProps) {
    const [mode, setMode] = useState<'nlp' | 'structured'>('nlp');
    const [description, setDescription] = useState('');
    
    // Structured state
    const [eventType, setEventType] = useState('0'); // 0 = unplanned, 1 = planned
    const [eventCause, setEventCause] = useState('vehicle_breakdown');
    const [zone, setZone] = useState('');
    const [corridorRank, setCorridorRank] = useState('0');
    const [vehType, setVehType] = useState('private_car');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // Map corridor rank selector value to a corridor name string.
            // The backend derives corridor_rank from the corridor name internally.
            const corridorNames: Record<string, string> = {
                '0': 'Non-corridor',
                '1': 'ORR East 1',
                '2': 'Hosur Road',
            };

            const eventTypeStr = eventType === '1' ? 'planned' : 'unplanned';

            let features: any = {
                event_type: eventTypeStr,
                corridor: corridorNames[corridorRank] || 'Non-corridor',
                event_cause: eventCause,
                veh_type: vehType,
                requires_road_closure: false,
                start_datetime: new Date().toISOString(),
                zone: zone || undefined,
                planned_duration_minutes: eventTypeStr === 'planned' ? 60 : 0,
            };

            let nlpResult = null;

            if (mode === 'nlp') {
                if (!description.trim()) {
                    throw new Error("Please enter a description");
                }
                nlpResult = await parseNLPDescription(description);
                if (nlpResult) {
                    // Overlay NLP extraction onto features
                    features.event_cause = nlpResult.root_cause || features.event_cause;
                    if (nlpResult.vehicle_type) {
                        features.veh_type = nlpResult.vehicle_type;
                    }
                }
            }

            const prediction = await predictIncident(features);
            
            if (!prediction) {
                throw new Error("Failed to get prediction from the backend");
            }

            onOpenPanel({
                ...features,
                ...prediction,
                nlpResult,       // Pass the NLP result to display in the panel
                // Ensure string event_type is preserved for the action planner
                event_type: eventTypeStr,
                event_cause: features.event_cause,
            });
            
            // Clear form
            if (mode === 'nlp') setDescription('');
            
        } catch (err: any) {
            setError(err.message || 'An error occurred during submission.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex justify-center p-8 w-full">
            <div className="neo-brutal-box p-8 bg-white max-w-2xl w-full h-fit">
                <h2 className="font-mono text-2xl font-bold uppercase mb-6 border-b-4 border-neo-border pb-2 flex items-center gap-3">
                    <MapPin weight="bold" />
                    Submit New Incident
                </h2>

                {/* Mode Toggles */}
                <div className="flex mb-8 border-3 border-neo-border">
                    <button
                        type="button"
                        onClick={() => setMode('nlp')}
                        className={`flex-1 py-3 font-mono font-bold uppercase flex justify-center items-center gap-2 transition-all ${
                            mode === 'nlp' ? 'bg-neo-primary text-neo-text' : 'bg-white hover:bg-neo-secondary'
                        }`}
                    >
                        <TextAUnderline size={20} weight="bold" />
                        Raw Text
                    </button>
                    <div className="w-[3px] bg-neo-border" />
                    <button
                        type="button"
                        onClick={() => setMode('structured')}
                        className={`flex-1 py-3 font-mono font-bold uppercase flex justify-center items-center gap-2 transition-all ${
                            mode === 'structured' ? 'bg-neo-primary text-neo-text' : 'bg-white hover:bg-neo-secondary'
                        }`}
                    >
                        <ListBullets size={20} weight="bold" />
                        Structured
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 border-3 border-neo-border font-mono text-sm text-red-600 font-bold">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {mode === 'nlp' ? (
                        <div className="space-y-2">
                            <label className="block font-mono font-bold uppercase text-sm">
                                Describe the incident (Any language)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full border-3 border-neo-border p-4 h-40 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm resize-none bg-neo-bg"
                                placeholder="e.g., ಬಿಎಂಟಿಸಿ ಬಸ್ ಕೆಟ್ಟು ನಿಂತಿದೆ ಸರ್ (BMTC bus broken down)"
                            />
                            <p className="text-xs font-mono text-gray-500 mt-2">
                                Our AI will automatically extract the cause, severity, and vehicle type.
                            </p>
                            
                            {/* Optional Zone field even in NLP */}
                            <div className="space-y-2 mt-4">
                                <label className="block font-mono font-bold uppercase text-sm">Zone / Area (Optional)</label>
                                <input
                                    type="text"
                                    value={zone}
                                    onChange={(e) => setZone(e.target.value)}
                                    className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                    placeholder="e.g., HSR Layout"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm">Event Type</label>
                                    <select 
                                        value={eventType} 
                                        onChange={(e) => setEventType(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                    >
                                        <option value="0">Unplanned</option>
                                        <option value="1">Planned</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm">Corridor Type</label>
                                    <select 
                                        value={corridorRank} 
                                        onChange={(e) => setCorridorRank(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                    >
                                        <option value="0">Non-corridor</option>
                                        <option value="1">ORR Variants</option>
                                        <option value="2">Major Named Corridor</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block font-mono font-bold uppercase text-sm">Event Cause</label>
                                <select 
                                    value={eventCause} 
                                    onChange={(e) => setEventCause(e.target.value)}
                                    className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
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

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm">Zone / Area</label>
                                    <input
                                        type="text"
                                        value={zone}
                                        onChange={(e) => setZone(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                        placeholder="e.g., Koramangala"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block font-mono font-bold uppercase text-sm">Vehicle Type</label>
                                    <select 
                                        value={vehType} 
                                        onChange={(e) => setVehType(e.target.value)}
                                        className="w-full border-3 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg"
                                    >
                                        <option value="private_car">Private Car</option>
                                        <option value="two_wheeler">Two Wheeler</option>
                                        <option value="bmtc_bus">BMTC Bus</option>
                                        <option value="heavy_vehicle">Heavy Vehicle</option>
                                        <option value="auto">Auto Rickshaw</option>
                                        <option value="others">Others</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full btn-neo py-4 text-lg font-bold font-mono uppercase flex justify-center items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <SpinnerGap size={24} className="animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                'Analyze & Generate Plan'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
