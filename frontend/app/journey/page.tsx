'use client';

import { Database, Table, Funnel, ChartBar, Gear, Brain, ArrowRight, CaretDown } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Link from 'next/link';

gsap.registerPlugin(ScrollTrigger);

export default function JourneyPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.pipeline-step, .stat-card, .feature-card, .model-card').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
            if (progressRef.current) {
                progressRef.current.style.transform = 'scaleY(1)';
            }
        }, 2000);

        const ctx = gsap.context(() => {
            // Header
            gsap.from(headerRef.current, {
                y: 50,
                opacity: 0,
                duration: 1,
                ease: 'power3.out',
                clearProps: 'all',
            });

            // Scroll-linked vertical progress bar
            gsap.to(progressRef.current, {
                scaleY: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: contentRef.current,
                    start: 'top 30%',
                    end: 'bottom 80%',
                    scrub: 1,
                }
            });

            // Pipeline steps staggered
            const steps = gsap.utils.toArray('.pipeline-step');
            steps.forEach((step: any, i) => {
                gsap.from(step, {
                    scrollTrigger: {
                        trigger: step,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse',
                    },
                    y: 60,
                    opacity: 0,
                    duration: 0.7,
                    ease: 'power3.out',
                    clearProps: 'all',
                });
            });

            // Stat cards counter-like entrance
            gsap.from('.stat-card', {
                scrollTrigger: {
                    trigger: '.stat-grid',
                    start: 'top 85%',
                    once: true,
                },
                y: 30,
                opacity: 0,
                scale: 0.9,
                stagger: 0.1,
                duration: 0.5,
                ease: 'back.out(1.5)',
                clearProps: 'all',
            });

            // Feature cards
            gsap.from('.feature-card', {
                scrollTrigger: {
                    trigger: '.feature-grid',
                    start: 'top 85%',
                    once: true,
                },
                y: 20,
                opacity: 0,
                stagger: 0.06,
                duration: 0.4,
                ease: 'power2.out',
                clearProps: 'all',
            });

            // Model cards
            gsap.from('.model-card', {
                scrollTrigger: {
                    trigger: '.model-grid',
                    start: 'top 85%',
                    once: true,
                },
                x: -40,
                opacity: 0,
                stagger: 0.15,
                duration: 0.6,
                ease: 'power3.out',
                clearProps: 'all',
            });

        }, containerRef);

        return () => {
            clearTimeout(safety);
            ctx.revert();
        };
    }, []);

    return (
        <div ref={containerRef} className="flex-1 w-full bg-grid pb-24 overflow-hidden">
            {/* Header */}
            <section ref={headerRef} className="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-16 text-center">
                <div className="inline-flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 bg-neo-text text-primary flex items-center justify-center shadow-[6px_6px_0px_0px_#9FE870]">
                        <Database weight="fill" className="w-10 h-10" />
                    </div>
                </div>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-none mb-6">
                    Data Pipeline
                </h1>
                <p className="text-xl md:text-2xl font-mono text-gray-700 max-w-3xl mx-auto">
                    How we process 8,173 real Bengaluru incidents into predictive signals.
                </p>
                <div className="mt-12 animate-bounce flex justify-center">
                    <CaretDown weight="bold" className="w-10 h-10 text-neo-text" />
                </div>
            </section>

            <div ref={contentRef} className="max-w-7xl mx-auto px-4 md:px-6 relative">

                {/* Scroll-linked Progress Line (Desktop only) */}
                <div className="hidden md:block absolute left-8 top-0 bottom-0 w-1.5 bg-gray-200 z-0">
                    <div ref={progressRef} className="absolute top-0 left-0 w-full h-full bg-primary origin-top scale-y-0"></div>
                </div>

                {/* Step Number Markers */}
                <div className="relative">

                {/* 1. Dataset Overview */}
                <div className="pipeline-step relative md:pl-20 mb-16">
                    {/* Step marker */}
                    <div className="hidden md:flex absolute left-4 top-6 w-10 h-10 bg-primary border-4 border-neo-border items-center justify-center font-black text-lg z-10 shadow-neo-sm">
                        1
                    </div>
                    <div className="border-4 border-neo-border bg-white shadow-[8px_8px_0px_0px_#163300] hover:shadow-[10px_10px_0px_0px_#163300] transition-shadow relative overflow-hidden">
                        <div className="bg-primary border-b-4 border-neo-border p-5 flex items-center gap-3">
                            <Table weight="bold" className="w-7 h-7" />
                            <h2 className="text-2xl font-black uppercase">Core Dataset</h2>
                            <div className="ml-auto font-mono text-xs font-bold bg-neo-text text-primary px-3 py-1">SOURCE</div>
                        </div>
                        <div className="p-6 md:p-10 grid md:grid-cols-2 gap-10">
                            <div>
                                <p className="font-mono text-sm mb-8 leading-relaxed">
                                    The platform trains on a proprietary dataset of authenticated traffic incidents in Bengaluru. It distinguishes between <b>unplanned events</b> (accidents, tree falls, breakdowns) and <b>planned events</b> (VIP movements, festivals, construction).
                                </p>
                                <div className="stat-grid grid grid-cols-2 gap-4">
                                    <div className="stat-card border-3 border-neo-border p-5 bg-secondary hover:bg-primary transition-colors cursor-default group">
                                        <div className="font-black text-4xl group-hover:scale-110 transition-transform origin-left">{DATA.datasetInfo.totalRecords.toLocaleString()}</div>
                                        <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-2">Total Records</div>
                                    </div>
                                    <div className="stat-card border-3 border-neo-border p-5 bg-gray-50 hover:bg-accent transition-colors cursor-default group">
                                        <div className="font-black text-4xl group-hover:scale-110 transition-transform origin-left">{DATA.datasetInfo.trainableRecords.toLocaleString()}</div>
                                        <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-2">Trainable (Filtered)</div>
                                    </div>
                                    <div className="stat-card border-3 border-neo-border p-5 bg-gray-50 hover:bg-red-100 transition-colors cursor-default group">
                                        <div className="font-black text-4xl group-hover:scale-110 transition-transform origin-left">{DATA.datasetInfo.unplannedRecords.toLocaleString()}</div>
                                        <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-2">Unplanned Incidents</div>
                                    </div>
                                    <div className="stat-card border-3 border-neo-border p-5 bg-gray-50 hover:bg-blue-100 transition-colors cursor-default group">
                                        <div className="font-black text-4xl group-hover:scale-110 transition-transform origin-left">{DATA.datasetInfo.plannedRecords.toLocaleString()}</div>
                                        <div className="font-mono text-[10px] font-bold uppercase text-gray-600 mt-2">Planned Events</div>
                                    </div>
                                </div>
                            </div>
                            <div className="border-4 border-neo-border p-6 bg-black text-white relative overflow-hidden">
                                <div className="absolute inset-0 pattern-diagonal opacity-5 pointer-events-none"></div>
                                <div className="font-mono text-xs text-primary mb-5 uppercase tracking-widest border-b border-gray-700 pb-3 relative z-10 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-primary inline-block status-active"></span>
                                    Key Columns Utilized
                                </div>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4 relative z-10">
                                    {DATA.datasetInfo.keyColumns.map((col, idx) => (
                                        <li key={idx} className="font-mono text-[11px] flex items-center gap-2 hover:text-primary transition-colors">
                                            <span className="text-primary font-bold">&gt;</span> {col}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-6 p-3 border border-gray-700 bg-white/5 font-mono text-[10px] text-gray-400 relative z-10">
                                    <b className="text-primary">Note:</b> 57% of records have null zones. Anomaly models explicitly handle these by grouping via police_station fallback.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Feature Engineering */}
                <div className="pipeline-step relative md:pl-20 mb-16">
                    <div className="hidden md:flex absolute left-4 top-6 w-10 h-10 bg-accent border-4 border-neo-border items-center justify-center font-black text-lg z-10 shadow-neo-sm">
                        2
                    </div>
                    <div className="border-4 border-neo-border bg-white shadow-[8px_8px_0px_0px_#163300] hover:shadow-[10px_10px_0px_0px_#163300] transition-shadow">
                        <div className="bg-accent border-b-4 border-neo-border p-5 flex items-center gap-3">
                            <Gear weight="bold" className="w-7 h-7" />
                            <h2 className="text-2xl font-black uppercase">Feature Engineering</h2>
                            <div className="ml-auto font-mono text-xs font-bold bg-neo-text text-primary px-3 py-1">TRANSFORM</div>
                        </div>
                        <div className="p-6 md:p-10">
                            <p className="font-mono text-sm mb-8 leading-relaxed max-w-3xl">
                                Raw timestamps and locations are insufficient for ML. The backend pre-computes derived temporal and spatial features before model training to capture urban traffic dynamics.
                            </p>
                            <div className="feature-grid grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {DATA.derivedFeatures.map((feat, idx) => (
                                    <div key={idx} className="feature-card border-3 border-neo-border p-4 hover:bg-secondary hover:-translate-y-1 transition-all cursor-default group">
                                        <div className="font-mono font-bold text-[10px] bg-neo-text text-white px-2 py-1 mb-3 inline-block group-hover:bg-primary group-hover:text-neo-text transition-colors">
                                            {feat.name}
                                        </div>
                                        <p className="font-mono text-[10px] text-gray-600 leading-relaxed">{feat.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Models */}
                <div className="pipeline-step relative md:pl-20">
                    <div className="hidden md:flex absolute left-4 top-6 w-10 h-10 bg-neo-text text-primary border-4 border-primary items-center justify-center font-black text-lg z-10 shadow-[3px_3px_0px_0px_#9FE870]">
                        3
                    </div>
                    <div className="border-4 border-neo-border bg-white shadow-[8px_8px_0px_0px_#163300] hover:shadow-[10px_10px_0px_0px_#163300] transition-shadow">
                        <div className="bg-neo-text text-primary border-b-4 border-neo-border p-5 flex items-center gap-3">
                            <Brain weight="bold" className="w-7 h-7" />
                            <h2 className="text-2xl font-black uppercase">Model Training</h2>
                            <div className="ml-auto font-mono text-xs font-bold bg-primary text-neo-text px-3 py-1">LEARN</div>
                        </div>
                        <div className="p-6 md:p-10">
                            <div className="model-grid grid md:grid-cols-3 gap-6">
                                {DATA.modelInfo.map((model, idx) => (
                                    <div key={idx} className="model-card flex flex-col border-4 border-neo-border shadow-neo hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none transition-all group">
                                        <div className="bg-gray-100 p-4 border-b-4 border-neo-border group-hover:bg-primary transition-colors">
                                            <div className="font-mono text-[10px] font-bold text-gray-500 uppercase mb-1">{model.type}</div>
                                            <h3 className="font-black text-xl uppercase leading-tight">{model.name}</h3>
                                        </div>
                                        <div className="p-5 flex-1 flex flex-col gap-5 font-mono text-xs">
                                            <div>
                                                <div className="text-gray-500 font-bold mb-1.5 uppercase text-[10px]">Algorithm</div>
                                                <div className="bg-primary/20 border-2 border-primary text-neo-text px-3 py-1.5 inline-block font-bold">{model.algorithm}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500 font-bold mb-1.5 uppercase text-[10px]">Target</div>
                                                <div>{model.target}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500 font-bold mb-1.5 uppercase text-[10px]">Data Scope</div>
                                                <div>{model.records}</div>
                                            </div>
                                            <div className="mt-auto pt-4 border-t-2 border-dashed border-gray-300 text-gray-600 leading-relaxed">
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
            </div>

            {/* CTA */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mt-20 text-center">
                <Link href="/dashboard" className="inline-flex items-center gap-3 bg-neo-text text-primary font-black uppercase text-xl px-10 py-6 border-4 border-primary shadow-[8px_8px_0px_0px_#9FE870] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none transition-all duration-300 group">
                    See Models in Action 
                    <ArrowRight weight="bold" className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                </Link>
            </section>
        </div>
    );
}
