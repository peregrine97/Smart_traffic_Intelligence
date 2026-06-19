'use client';

import { TreeStructure, Cpu, ShieldCheck, Database, MagnifyingGlass, Lightning as Zap, Broadcast, MapPin, ChartLineUp, TerminalWindow, Crosshair, ArrowRight } from '@phosphor-icons/react';
import Link from 'next/link';
import { DATA } from '@/components/constants';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function ArchitecturePage() {
    const headerRef = useRef<HTMLDivElement>(null);
    const diagramRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.diag-box, .diag-line, .cap-card').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);

        const ctx = gsap.context(() => {
            // Header animation
            gsap.from(headerRef.current, {
                y: 30,
                opacity: 0,
                duration: 0.7,
                ease: 'power3.out',
                clearProps: 'all',
            });

            // Diagram boxes and lines
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: diagramRef.current,
                    start: 'top 95%',
                }
            });

            tl.from('.diag-box', {
                y: 20,
                opacity: 0,
                stagger: 0.15,
                duration: 0.5,
                ease: 'power2.out',
                clearProps: 'all',
            })
            .from('.diag-line', {
                scaleX: 0,
                transformOrigin: 'left',
                stagger: 0.1,
                duration: 0.3,
                ease: 'power1.inOut',
                clearProps: 'all',
            }, '-=0.3');

            // Capabilities Grid
            gsap.from('.cap-card', {
                scrollTrigger: {
                    trigger: gridRef.current,
                    start: 'top 95%',
                    once: true,
                },
                y: 30,
                opacity: 0,
                stagger: 0.12,
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
            <section ref={headerRef} className="max-w-7xl mx-auto px-4 md:px-6 pt-12 pb-8">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-10 w-10 bg-neo-text flex items-center justify-center text-primary shadow-neo-sm">
                        <TreeStructure weight="bold" className="w-6 h-6" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">System Architecture</h1>
                </div>
                <p className="text-xl font-mono text-gray-600 max-w-3xl border-l-4 border-primary pl-4">
                    How Smart Traffic Intelligence orchestrates data, predictive models, and autonomous agents to manage Bengaluru traffic.
                </p>
            </section>

            {/* Core Architecture Diagram */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mb-16">
                <div ref={diagramRef} className="border-4 border-neo-border bg-white p-6 md:p-12 shadow-neo relative overflow-hidden">
                    <div className="absolute inset-0 pattern-diagonal opacity-5 pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-4">

                        {/* Block 1: Input Data */}
                        <div className="diag-box w-full lg:w-1/4 border-3 border-neo-border bg-secondary p-6 text-center hover:bg-primary transition-colors">
                            <Database weight="bold" className="w-12 h-12 mx-auto mb-4 text-neo-text" />
                            <h3 className="font-black uppercase tracking-tight text-lg mb-2">Bengaluru Dataset</h3>
                            <p className="font-mono text-xs text-gray-700">8,173 Historical Incidents<br />+ Live Feed</p>
                        </div>

                        {/* Arrow */}
                        <div className="diag-line hidden lg:block w-12 h-2 bg-neo-text relative agent-pulse"></div>
                        <div className="diag-line lg:hidden h-8 w-2 bg-neo-text relative agent-pulse"></div>

                        {/* Block 2: Agent Orchestrator */}
                        <div className="diag-box w-full lg:w-1/3 border-4 border-neo-border bg-neo-text p-6 text-center text-white relative shadow-[6px_6px_0px_0px_#9FE870]">
                            <Cpu weight="bold" className="w-16 h-16 mx-auto mb-4 text-primary" />
                            <h3 className="font-black uppercase tracking-tight text-xl mb-4 text-primary">AI Orchestrator</h3>
                            <div className="grid grid-cols-2 gap-2 text-left">
                                <div className="border border-gray-600 bg-black/50 p-2 font-mono text-[10px] text-gray-300">1. NLP Parser</div>
                                <div className="border border-gray-600 bg-black/50 p-2 font-mono text-[10px] text-gray-300">2. Predictor</div>
                                <div className="border border-gray-600 bg-black/50 p-2 font-mono text-[10px] text-gray-300">3. Anomaly AI</div>
                                <div className="border border-gray-600 bg-black/50 p-2 font-mono text-[10px] text-gray-300">4. Action Planner</div>
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="diag-line hidden lg:block w-12 h-2 bg-neo-text relative agent-pulse-delay-1"></div>
                        <div className="diag-line lg:hidden h-8 w-2 bg-neo-text relative agent-pulse-delay-1"></div>

                        {/* Block 3: Actionable Output */}
                        <div className="diag-box w-full lg:w-1/4 border-3 border-neo-border bg-white p-6 text-center hover:bg-gray-50 transition-colors">
                            <TerminalWindow weight="bold" className="w-12 h-12 mx-auto mb-4 text-neo-text" />
                            <h3 className="font-black uppercase tracking-tight text-lg mb-2">Live Dashboard</h3>
                            <p className="font-mono text-xs text-gray-600">Map • Alerts • Deployment Plans</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Core Capabilities Detailed */}
            <section ref={gridRef} className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="flex items-center gap-4 mb-8">
                    <Crosshair weight="bold" className="w-8 h-8 text-primary bg-neo-text p-1" />
                    <h2 className="text-2xl font-black uppercase tracking-tight">Core Capabilities</h2>
                    <div className="h-1 flex-1 bg-neo-text opacity-20"></div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {DATA.capabilities.map((cap, idx) => (
                        <div key={idx} className="cap-card border-3 border-neo-border bg-white shadow-neo flex flex-col group hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                            {/* Card Header */}
                            <div className="bg-neo-text text-white p-4 border-b-3 border-neo-border flex justify-between items-center">
                                <span className="font-mono text-xs font-bold text-primary bg-white/10 px-2 py-1">SYS_{cap.id}</span>
                                {idx === 0 && <MagnifyingGlass weight="bold" className="w-6 h-6 text-primary" />}
                                {idx === 1 && <Broadcast weight="bold" className="w-6 h-6 text-primary" />}
                                {idx === 2 && <ShieldCheck weight="bold" className="w-6 h-6 text-primary" />}
                            </div>

                            {/* Card Body */}
                            <div className="p-6 flex-1 flex flex-col">
                                <h3 className="text-xl font-black uppercase tracking-tight mb-3">{cap.title}</h3>
                                <p className="font-mono text-sm text-gray-600 mb-6 flex-1">{cap.description}</p>

                                <div className="space-y-2 mb-6">
                                    {cap.features.map((feature, fIdx) => (
                                        <div key={fIdx} className="flex items-start gap-2 font-mono text-xs font-bold">
                                            <Zap weight="fill" className="w-4 h-4 text-primary shrink-0" />
                                            <span>{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Bottom CTA */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mt-16">
                <Link href="/dashboard" className="block w-full border-4 border-neo-border bg-primary p-8 shadow-neo group hover:bg-neo-text hover:text-white transition-colors duration-300">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-3xl font-black uppercase tracking-tight mb-2 group-hover:text-primary">Experience the Architecture</h2>
                            <p className="font-mono text-sm group-hover:text-gray-300">See the predictive models and NLP parser in action.</p>
                        </div>
                        <div className="w-16 h-16 bg-white border-3 border-neo-border text-neo-text flex items-center justify-center group-hover:bg-primary transition-colors">
                            <ArrowRight weight="bold" className="w-8 h-8" />
                        </div>
                    </div>
                </Link>
            </section>
        </div>
    );
}
