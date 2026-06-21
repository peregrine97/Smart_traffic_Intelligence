'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import SubmitIncidentView from '../../components/dashboard/SubmitIncidentView';
import AnalyticsView from '../../components/dashboard/AnalyticsView';
import IncidentPanel from '../../components/dashboard/IncidentPanel';
import { MapTrifold, Plus, ChartBar } from '@phosphor-icons/react';
import type { IncidentPin } from '../../types/index';

// Leaflet map needs to be dynamically imported with ssr: false
const MapView = dynamic(() => import('../../components/dashboard/MapView'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-neo-bg">
            <div className="font-mono text-neo-text font-bold uppercase text-xl border-4 border-neo-border p-4 bg-neo-secondary shadow-neo">
                Loading Map Data...
            </div>
        </div>
    )
});

type ViewState = 'map' | 'submit' | 'analytics';

import BackendLockModal from '../../components/dashboard/BackendLockModal';

export default function DashboardPage() {
    const [activeView, setActiveView] = useState<ViewState>('map');
    const [panelData, setPanelData] = useState<any>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    // ── Incident pins — shared between SubmitIncidentView and MapView ──────────
    // Accumulated over the session; survive view switches but reset on page refresh.
    const [incidentPins, setIncidentPins] = useState<IncidentPin[]>([]);

    const addIncidentPin = (pin: { lat: number; lng: number; zone: string }) => {
        setIncidentPins(prev => [
            ...prev,
            { ...pin, id: `pin-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ]);
    };

    const openPanelWithData = (data: any) => {
        setPanelData(data);
        setIsPanelOpen(true);
    };

    const closePanel = () => {
        setIsPanelOpen(false);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] w-full overflow-hidden bg-neo-bg relative">
            <BackendLockModal />
            
            {/* Dashboard Sub-navigation */}
            <div className="flex border-b-3 border-neo-border bg-white z-20 shadow-neo-sm relative overflow-x-auto">
                <button
                    onClick={() => setActiveView('map')}
                    className={`flex items-center gap-2 px-4 md:px-6 py-3 md:py-4 font-mono text-sm md:text-base font-bold uppercase border-r-3 border-neo-border transition-all whitespace-nowrap flex-shrink-0 ${activeView === 'map' ? 'bg-neo-primary text-neo-text border-b-4 border-b-neo-text' : 'bg-white hover:bg-neo-secondary'}`}
                >
                    <MapTrifold size={22} weight="bold" className="flex-shrink-0" />
                    City Map
                    {incidentPins.length > 0 && (
                        <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-neo-border">
                            {incidentPins.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveView('submit')}
                    className={`flex items-center gap-2 px-4 md:px-6 py-3 md:py-4 font-mono text-sm md:text-base font-bold uppercase border-r-3 border-neo-border transition-all whitespace-nowrap flex-shrink-0 ${activeView === 'submit' ? 'bg-neo-primary text-neo-text border-b-4 border-b-neo-text' : 'bg-white hover:bg-neo-secondary'}`}
                >
                    <Plus size={22} weight="bold" className="flex-shrink-0" />
                    Submit Incident
                </button>
                <button
                    onClick={() => setActiveView('analytics')}
                    className={`flex items-center gap-2 px-4 md:px-6 py-3 md:py-4 font-mono text-sm md:text-base font-bold uppercase border-r-3 border-neo-border transition-all whitespace-nowrap flex-shrink-0 ${activeView === 'analytics' ? 'bg-neo-primary text-neo-text border-b-4 border-b-neo-text' : 'bg-white hover:bg-neo-secondary'}`}
                >
                    <ChartBar size={22} weight="bold" className="flex-shrink-0" />
                    Analytics
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative flex overflow-hidden">
                <div className="flex-1 bg-grid relative flex flex-col overflow-hidden">
                    {activeView === 'map' && (
                        <MapView
                            onOpenPanel={openPanelWithData}
                            incidentPins={incidentPins}
                            onNewIncident={() => setActiveView('submit')}
                        />
                    )}
                    {activeView === 'submit' && (
                        <SubmitIncidentView
                            onOpenPanel={openPanelWithData}
                            onPinDropped={addIncidentPin}
                        />
                    )}
                    {activeView === 'analytics' && <AnalyticsView />}
                </div>

                {/* Incident Panel Drawer */}
                <div
                    className={`absolute top-0 right-0 h-full w-full md:w-[500px] bg-white border-l-4 border-neo-border transform transition-transform duration-300 z-50 shadow-[-8px_0_0_0_rgba(22,51,0,1)] ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <IncidentPanel
                        isOpen={isPanelOpen}
                        onClose={closePanel}
                        data={panelData}
                    />
                </div>

                {/* Overlay for mobile panel */}
                {isPanelOpen && (
                    <div
                        className="absolute inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                        onClick={closePanel}
                    />
                )}
            </div>
        </div>
    );
}
