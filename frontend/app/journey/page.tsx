'use client';

import { Database, Table, Funnel, ChartBar, Gear, Brain } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function JourneyPage() {
    const headerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.pipeline-step').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);

        const ctx = gsap.context(() => {
            gsap.from(headerRef.current, {
                y: 25,
                opacity: 0,
                duration: 0.7,
                ease: 'power3.out',
                clearProps: 'all',
            });

            gsap.from('.pipeline-step', {
                scrollTrigger: {
                    trigger: contentRef.current,
                    start: 'top 95%',
                    once: true,
                },
                y: 30,
                opacity: 0,
                stagger: 0.15,
                duration: 0.5,
                ease: 'power2.out',
                clearProps: 'all',
            });
        });
        return () => {
            clearTimeout(safety);
            ctx.revert();
        };
    }, []);

    return (
        <div className="flex-1 w-full bg-grid pb-20">
            {/* Header */}
            <section ref={headerRef} className="max-w-7xl mx-auto px-4 md:px-6 pt-12 pb-12">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 bg-neo-text text-primary flex items-center justify-center shadow-neo-sm">
                        <Database weight="fill" className="w-7 h-7" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-none">
                        Data<br />Pipeline
                    </h1>
                </div>
                <p className="text-xl font-mono text-gray-600 max-w-3xl">
                    The foundation of Smart Traffic Intelligence. How we process 8,173 real Bengaluru incidents into predictive signals.
                </p>
            </section>

            <div ref={contentRef} className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* 1. Dataset Overview */}
                <div className="pipeline-step border-4 border-neo-border bg-white shadow-neo mb-10">
                    <div className="bg-primary border-b-4 border-neo-border p-4 flex items-center gap-3">
                        <Table weight="bold" className="w-6 h-6" />
                        <h2 className="text-xl font-black uppercase">1. Core Dataset</h2>
                    </div>
                    <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8">
                        <div>
                            <p className="font-mono text-sm mb-6 leading-relaxed">
                                The platform trains on a proprietary dataset of authenticated traffic incidents in Bengaluru. It distinguishes between <b>unplanned events</b> (accidents, tree falls, breakdowns) and <b>planned events</b> (VIP movements, festivals, construction).
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="border-2 border-neo-border p-4 bg-secondary">
                                    <div className="font-black text-3xl">{DATA.datasetInfo.totalRecords.toLocaleString()}</div>
                                    <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-1">Total Records</div>
                                </div>
                                <div className="border-2 border-neo-border p-4 bg-gray-50">
                                    <div className="font-black text-3xl">{DATA.datasetInfo.trainableRecords.toLocaleString()}</div>
                                    <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-1">Trainable (Filtered)</div>
                                </div>
                                <div className="border-2 border-neo-border p-4 bg-gray-50">
                                    <div className="font-black text-3xl">{DATA.datasetInfo.unplannedRecords.toLocaleString()}</div>
                                    <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-1">Unplanned Incidents</div>
                                </div>
                                <div className="border-2 border-neo-border p-4 bg-gray-50">
                                    <div className="font-black text-3xl">{DATA.datasetInfo.plannedRecords.toLocaleString()}</div>
                                    <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-1">Planned Events</div>
                                </div>
                            </div>
                        </div>
                        <div className="border-3 border-neo-border p-5 bg-black text-white">
                            <div className="font-mono text-xs text-primary mb-4 uppercase tracking-widest border-b border-gray-700 pb-2">Key Columns Utilized</div>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                                {DATA.datasetInfo.keyColumns.map((col, idx) => (
                                    <li key={idx} className="font-mono text-[10px] flex items-center gap-2">
                                        <span className="text-primary">&gt;</span> {col}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 p-3 border border-gray-700 bg-white/5 font-mono text-[10px] text-gray-400">
                                <b>Note:</b> 57% of records have null zones. Anomaly models explicitly handle these by grouping via police_station fallback.
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Feature Engineering */}
                <div className="pipeline-step border-4 border-neo-border bg-white shadow-neo mb-10">
                    <div className="bg-accent border-b-4 border-neo-border p-4 flex items-center gap-3">
                        <Gear weight="bold" className="w-6 h-6" />
                        <h2 className="text-xl font-black uppercase">2. Feature Engineering</h2>
                    </div>
                    <div className="p-6 md:p-8">
                        <p className="font-mono text-sm mb-6 leading-relaxed max-w-3xl">
                            Raw timestamps and locations are insufficient for ML. The backend pre-computes derived temporal and spatial features before model training to capture urban traffic dynamics.
                        </p>
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {DATA.derivedFeatures.map((feat, idx) => (
                                <div key={idx} className="border-2 border-neo-border p-4 hover:bg-gray-50 transition-colors">
                                    <div className="font-mono font-bold text-xs bg-neo-text text-white inline-block px-2 py-1 mb-2">
                                        {feat.name}
                                    </div>
                                    <p className="font-mono text-[10px] text-gray-600">{feat.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 3. Models */}
                <div className="pipeline-step border-4 border-neo-border bg-white shadow-neo">
                    <div className="bg-neo-text text-primary border-b-4 border-neo-border p-4 flex items-center gap-3">
                        <Brain weight="bold" className="w-6 h-6" />
                        <h2 className="text-xl font-black uppercase">3. Model Training</h2>
                    </div>
                    <div className="p-6 md:p-8">
                        <div className="grid md:grid-cols-3 gap-6">
                            {DATA.modelInfo.map((model, idx) => (
                                <div key={idx} className="flex flex-col border-3 border-neo-border">
                                    <div className="bg-gray-100 p-3 border-b-3 border-neo-border">
                                        <div className="font-mono text-[10px] font-bold text-gray-500 uppercase">{model.type}</div>
                                        <h3 className="font-black text-lg uppercase leading-tight">{model.name}</h3>
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col gap-4 font-mono text-xs">
                                        <div>
                                            <div className="text-gray-500 font-bold mb-1 uppercase">Algorithm</div>
                                            <div className="bg-primary/20 border border-primary text-neo-text px-2 py-1 inline-block">{model.algorithm}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 font-bold mb-1 uppercase">Target</div>
                                            <div>{model.target}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 font-bold mb-1 uppercase">Data Scope</div>
                                            <div>{model.records}</div>
                                        </div>
                                        <div className="mt-auto pt-4 border-t border-dashed border-gray-300 text-gray-600">
                                            {model.details}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
