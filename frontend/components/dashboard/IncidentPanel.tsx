import React, { useEffect, useState, useRef } from 'react';
import { X, ThumbsUp, ThumbsDown, ShieldWarning, Clock, Info } from '@phosphor-icons/react';
import { streamActionPlan, submitFeedback } from '../../lib/api';

interface IncidentPanelProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
}

export default function IncidentPanel({ isOpen, onClose, data }: IncidentPanelProps) {
    const [actionPlan, setActionPlan] = useState<string>('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);
    const [feedbackStatus, setFeedbackStatus] = useState<'none' | 'submitting' | 'submitted'>('none');
    const [selectedFeedback, setSelectedFeedback] = useState<'up' | 'down' | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !data) {
            setActionPlan('');
            setIsStreaming(false);
            setStreamError(null);
            setFeedbackStatus('none');
            setSelectedFeedback(null);
            return;
        }

        // Only start streaming if we have a priority (meaning prediction is done)
        if (data.priority) {
            setIsStreaming(true);
            setActionPlan('');
            setStreamError(null);

            // Build the POST body. Exclude UI-only fields that the backend
            // does not expect (nlpResult is a frontend-only enrichment object).
            const { nlpResult, ...rest } = data;
            const body: Record<string, any> = { ...rest };

            // Pass NLP fields as flat strings if the parse result is available.
            if (nlpResult) {
                body.nlp_cause    = nlpResult.root_cause   ?? '';
                body.nlp_summary  = nlpResult.normalized_summary ?? '';
            }

            // AbortController lets us cleanly cancel the in-flight fetch when
            // the panel closes or the effect re-runs, without leaking the stream.
            const controller = new AbortController();

            streamActionPlan(
                body,
                (token) => {
                    // Intercept WARNING tokens from the backend — they must not
                    // be rendered inline in the action plan (no key leak risk).
                    if (token.startsWith('WARNING:')) {
                        setStreamError('The AI action planner is currently unavailable. Please check the backend configuration.');
                        setIsStreaming(false);
                    } else {
                        setActionPlan(prev => prev + token);
                    }
                },
                ()      => setIsStreaming(false),
                (err)   => {
                    console.error('Action plan stream error:', err);
                    setIsStreaming(false);
                },
                controller.signal,
            );

            return () => {
                controller.abort();
            };
        }
    }, [isOpen, data]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [actionPlan]);

    const handleFeedback = async (rating: 'up' | 'down') => {
        if (feedbackStatus !== 'none') return;
        
        setSelectedFeedback(rating);
        setFeedbackStatus('submitting');
        
        await submitFeedback({
            incident_context: data,
            action_plan: actionPlan,
            rating
        });
        
        setFeedbackStatus('submitted');
    };

    if (!data) return null;

    const isHighPriority = data.priority === 'High';

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b-4 border-neo-border bg-neo-secondary">
                <h2 className="font-mono font-bold text-xl uppercase tracking-tight flex items-center gap-2">
                    <ShieldWarning size={28} weight={isHighPriority ? "fill" : "regular"} className={isHighPriority ? "text-red-500" : "text-amber-500"} />
                    Incident Output
                </h2>
                <button 
                    onClick={onClose}
                    className="p-1 border-2 border-transparent hover:border-neo-border hover:bg-white transition-all"
                >
                    <X size={24} weight="bold" />
                </button>
            </div>

            {/* Content Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-grid" ref={scrollRef}>
                
                {/* 1. Incident Details */}
                <div className="neo-brutal-box p-4 bg-white">
                    <h3 className="font-mono font-bold uppercase mb-3 border-b-2 border-neo-border pb-2">Context</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm font-mono">
                        <div className="text-gray-500">Address/Zone:</div>
                        <div className="font-bold">{data.address || data.zone || 'Unknown'}</div>
                        
                        <div className="text-gray-500">Junction:</div>
                        <div className="font-bold">{data.junction || 'N/A'}</div>
                        
                        <div className="text-gray-500">Corridor:</div>
                        <div className="font-bold">{data.corridor || 'Non-corridor'}</div>
                        
                        <div className="text-gray-500">Cause:</div>
                        <div className="font-bold capitalize">{data.event_cause?.replace('_', ' ') || 'Unknown'}</div>
                        
                        <div className="text-gray-500">Type:</div>
                        <div className="font-bold capitalize">
                            {data.event_type === 1 || data.event_type === 'planned' ? 'Planned' : 'Unplanned'}
                        </div>
                    </div>
                </div>

                {/* 1.5 NLP Parse Result (if available) */}
                {data.nlpResult && (
                    <div className="neo-brutal-box p-4 bg-neo-accent/20 border-neo-accent text-neo-text">
                        <h3 className="font-mono font-bold uppercase mb-2 flex items-center gap-2">
                            <Info size={20} />
                            Parsed from description
                        </h3>
                        <p className="text-sm italic mb-2">"{data.nlpResult.normalized_summary}"</p>
                        <div className="flex gap-2 text-xs font-mono">
                            <span className="bg-white border-2 border-neo-border px-2 py-1">Severity: {data.nlpResult.severity}</span>
                            <span className="bg-white border-2 border-neo-border px-2 py-1">Action: {data.nlpResult.action_needed ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                )}

                {/* 2. Prediction Result */}
                {data.priority && (
                    <div className={`neo-brutal-box p-4 ${isHighPriority ? 'bg-red-100' : 'bg-amber-100'}`}>
                        <h3 className="font-mono font-bold uppercase mb-3 border-b-2 border-neo-border pb-2">Prediction Result</h3>
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`px-4 py-2 border-3 border-neo-border font-bold uppercase text-xl ${isHighPriority ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'}`}>
                                {data.priority} Priority
                            </div>
                            <div className="text-sm font-mono font-bold">
                                Confidence: {Math.round((data.confidence || 0) * 100)}%
                            </div>
                        </div>
                        <div className="flex items-center gap-2 font-mono bg-white border-2 border-neo-border p-3">
                            <Clock size={24} />
                            <div>
                                <div className="font-bold">Estimated Resolution</div>
                                <div>{data.estimated_duration_minutes} minutes (by {new Date(data.estimated_resolution_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Action Plan Stream */}
                {data.priority && (
                    <div className="neo-brutal-box p-4 bg-white relative">
                        <h3 className="font-mono font-bold uppercase mb-3 border-b-2 border-neo-border pb-2">Action Plan</h3>
                        {streamError ? (
                            <div className="p-3 bg-amber-100 border-2 border-amber-400 font-mono text-sm text-amber-800">
                                ⚠ {streamError}
                            </div>
                        ) : (
                            <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap min-h-[150px]">
                                {actionPlan || <span className="animate-pulse">Waiting for AI to generate plan...</span>}
                            </div>
                        )}
                        {isStreaming && (
                            <div className="absolute bottom-2 right-4 text-xs font-mono font-bold text-neo-primary bg-neo-text px-2 py-1">
                                STREAMING...
                            </div>
                        )}
                    </div>
                )}

                {/* 4. Feedback Row */}
                {(!isStreaming && actionPlan.length > 0) && (
                    <div className="flex flex-col gap-2 mt-8 p-4 bg-neo-bg border-3 border-neo-border border-dashed">
                        <div className="text-sm font-mono font-bold text-center uppercase">Was this plan helpful?</div>
                        <div className="flex justify-center gap-4">
                            <button 
                                onClick={() => handleFeedback('up')}
                                disabled={feedbackStatus !== 'none'}
                                className={`flex items-center gap-2 px-4 py-2 border-3 border-neo-border transition-all font-bold font-mono ${
                                    selectedFeedback === 'up' ? 'bg-neo-primary text-neo-text translate-x-[2px] translate-y-[2px] shadow-none' : 
                                    feedbackStatus === 'none' ? 'bg-white hover:bg-neo-primary shadow-neo-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none' : 'bg-gray-200 opacity-50'
                                }`}
                            >
                                <ThumbsUp size={20} weight={selectedFeedback === 'up' ? "fill" : "regular"} />
                                YES
                            </button>
                            <button 
                                onClick={() => handleFeedback('down')}
                                disabled={feedbackStatus !== 'none'}
                                className={`flex items-center gap-2 px-4 py-2 border-3 border-neo-border transition-all font-bold font-mono ${
                                    selectedFeedback === 'down' ? 'bg-red-400 text-black translate-x-[2px] translate-y-[2px] shadow-none' : 
                                    feedbackStatus === 'none' ? 'bg-white hover:bg-red-400 shadow-neo-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none' : 'bg-gray-200 opacity-50'
                                }`}
                            >
                                <ThumbsDown size={20} weight={selectedFeedback === 'down' ? "fill" : "regular"} />
                                NO
                            </button>
                        </div>
                        {feedbackStatus === 'submitted' && (
                            <div className="text-center text-xs font-mono font-bold text-green-600 mt-2">
                                Feedback recorded. Thank you.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
