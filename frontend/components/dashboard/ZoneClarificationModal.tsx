import React, { useState } from 'react';
import { MapPin, ArrowsClockwise, X, CheckCircle, WarningCircle, SpinnerGap } from '@phosphor-icons/react';
import { geocodeZone } from '../../lib/api';

interface Candidate {
    name: string;
    lat: number;
    lng: number;
}

interface ZoneClarificationModalProps {
    /** The original zone string the user typed — pre-fills the re-entry input. */
    initialZone: string;
    /** Initial list of ambiguous candidates returned by the first geocode call. */
    initialCandidates: Candidate[];
    /** Called when the user has confirmed a location. */
    onConfirm: (result: { name: string; lat: number; lng: number }) => void;
    /** Called when the user cancels — aborts the submission. */
    onCancel: () => void;
}

export default function ZoneClarificationModal({
    initialZone,
    initialCandidates,
    onConfirm,
    onCancel,
}: ZoneClarificationModalProps) {
    const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
    const [refineInput, setRefineInput] = useState(initialZone);
    const [isResolving, setIsResolving] = useState(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [stillAmbiguous, setStillAmbiguous] = useState(false);

    const handleCandidateClick = (c: Candidate) => {
        onConfirm({ name: c.name, lat: c.lat, lng: c.lng });
    };

    const handleResolve = async () => {
        const trimmed = refineInput.trim();
        if (!trimmed) return;

        setIsResolving(true);
        setRefineError(null);
        setStillAmbiguous(false);

        const result = await geocodeZone(trimmed);

        setIsResolving(false);

        if (result.confidence === 'high' && result.lat !== undefined && result.lng !== undefined) {
            onConfirm({
                name: result.resolved_name || trimmed,
                lat: result.lat,
                lng: result.lng,
            });
        } else if (result.confidence === 'ambiguous' && result.candidates?.length) {
            setCandidates(result.candidates);
            setStillAmbiguous(true);
        } else {
            setRefineError(
                result.message ||
                'Could not resolve this location. Try adding a landmark or street name.'
            );
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleResolve();
    };

    return (
        <div className="bg-white border-4 border-neo-border shadow-none md:shadow-[-8px_8px_0_0_rgba(22,51,0,1)] w-full max-w-2xl min-h-full md:min-h-0 flex flex-col my-auto flex-shrink-0">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-start justify-between p-5 border-b-4 border-neo-border bg-primary text-neo-text">
                    <div className="flex items-start gap-3">
                        <WarningCircle size={28} weight="bold" className="mt-0.5 flex-shrink-0" />
                        <div>
                            <h2 className="font-mono font-bold text-lg uppercase leading-tight">
                                Location Not Precise Enough
                            </h2>
                            <p className="text-sm font-mono mt-1 text-neo-text/80">
                                We couldn't pinpoint your zone precisely. Select a suggestion or describe it more accurately.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 border-2 border-neo-border bg-white hover:bg-neo-secondary transition-colors ml-3 flex-shrink-0"
                        title="Cancel submission"
                    >
                        <X size={18} weight="bold" />
                    </button>
                </div>

                <div className="p-5 space-y-6 overflow-y-auto max-h-[70vh]">

                    {/* ── Section A: Candidate cards ─────────────────────── */}
                    <div>
                        <h3 className="font-mono font-bold uppercase text-sm mb-3 flex items-center gap-2">
                            <MapPin size={16} weight="bold" />
                            Suggested Locations — click to confirm
                        </h3>
                        <div className="space-y-2">
                            {candidates.map((c, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleCandidateClick(c)}
                                    className="w-full text-left border-3 border-neo-border p-3 bg-neo-bg hover:bg-neo-primary transition-all group flex items-center justify-between gap-3 shadow-neo-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <MapPin
                                            size={20}
                                            weight="fill"
                                            className="text-red-500 flex-shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <div className="font-mono font-bold text-sm truncate">
                                                {c.name}
                                            </div>
                                            <div className="text-xs font-mono text-gray-500 mt-0.5">
                                                {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                                            </div>
                                        </div>
                                    </div>
                                    <CheckCircle
                                        size={20}
                                        weight="bold"
                                        className="text-neo-border flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-[3px] bg-neo-border" />
                        <span className="font-mono text-xs font-bold uppercase text-gray-500 flex-shrink-0">
                            Or be more specific
                        </span>
                        <div className="flex-1 h-[3px] bg-neo-border" />
                    </div>

                    {/* ── Section B: Re-entry field ──────────────────────── */}
                    <div>
                        <h3 className="font-mono font-bold uppercase text-sm mb-2">
                            Enter a More Precise Address
                        </h3>
                        <p className="text-xs font-mono text-gray-500 mb-3">
                            Include a landmark, street name, sector, or block number for better accuracy.
                        </p>
                        <div className="flex gap-0">
                            <input
                                type="text"
                                value={refineInput}
                                onChange={e => {
                                    setRefineInput(e.target.value);
                                    setRefineError(null);
                                    setStillAmbiguous(false);
                                }}
                                onKeyDown={handleKeyDown}
                                disabled={isResolving}
                                placeholder="e.g. HSR Layout Sector 2, near BDA Complex"
                                className="flex-1 border-3 border-r-0 border-neo-border p-3 focus:outline-none focus:ring-4 focus:ring-neo-primary font-mono text-sm bg-neo-bg disabled:opacity-60"
                            />
                            <button
                                onClick={handleResolve}
                                disabled={isResolving || !refineInput.trim()}
                                className="border-3 border-neo-border bg-neo-primary px-4 font-mono font-bold uppercase text-sm hover:bg-neo-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                            >
                                {isResolving ? (
                                    <SpinnerGap size={18} className="animate-spin" />
                                ) : (
                                    <ArrowsClockwise size={18} weight="bold" />
                                )}
                                <span className="hidden sm:inline">
                                    {isResolving ? 'Resolving…' : 'Re-resolve'}
                                </span>
                            </button>
                        </div>

                        {/* Still ambiguous note */}
                        {stillAmbiguous && !refineError && (
                            <p className="mt-2 text-xs font-mono font-bold text-amber-700 bg-amber-100 border-2 border-amber-400 px-3 py-2">
                                ⚠ Still ambiguous — try adding a landmark or street name
                            </p>
                        )}

                        {/* Error message */}
                        {refineError && (
                            <p className="mt-2 text-xs font-mono font-bold text-red-700 bg-red-100 border-2 border-red-400 px-3 py-2">
                                ✗ {refineError}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="border-t-4 border-neo-border p-4 bg-neo-bg flex justify-end">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2 border-3 border-neo-border font-mono font-bold uppercase text-sm bg-white hover:bg-red-100 transition-colors shadow-neo-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                    >
                        Cancel Submission
                    </button>
                </div>
            </div>
    );
}
