'use client';

import { Brain, ArrowRight, TextOutdent, Target, ShieldCheck, ClipboardText, Database } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function AgentsPage() {
    const headerRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.flow-node, .agent-card-item').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);

        const ctx = gsap.context(() => {
            gsap.from(headerRef.current, {
                y: 30,
                opacity: 0,
                duration: 0.7,
                ease: 'power3.out',
                clearProps: 'all',
            });

            // Flow Diagram Animation
            const flowTl = gsap.timeline({
                scrollTrigger: {
                    trigger: flowRef.current,
                    start: 'top 95%',
                }
            });

            flowTl.from('.flow-node', {
                scale: 0.85,
                opacity: 0,
                duration: 0.4,
                stagger: 0.2,
                ease: 'back.out(1.2)',
                clearProps: 'all',
            });

            // Agent Cards Animation
            gsap.from('.agent-card-item', {
                scrollTrigger: {
                    trigger: cardsRef.current,
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

    const getIconForAgent = (id: string) => {
        switch (id) {
            case 'nlp-parser': return <TextOutdent weight="bold" className="w-8 h-8" />;
            case 'prediction-engine': return <Target weight="bold" className="w-8 h-8" />;
            case 'anomaly-detector': return <ShieldCheck weight="bold" className="w-8 h-8" />;
            case 'action-planner': return <ClipboardText weight="bold" className="w-8 h-8" />;
            default: return <Brain weight="bold" className="w-8 h-8" />;
        }
    };

    const getColorClasses = (colorType: string) => {
        switch (colorType) {
            case 'primary': return 'bg-primary text-neo-text shadow-[6px_6px_0px_0px_#163300]';
            case 'accent': return 'bg-accent text-neo-text shadow-[6px_6px_0px_0px_#163300]';
            case 'secondary': return 'bg-white text-neo-text shadow-[6px_6px_0px_0px_#163300]';
            case 'dark': return 'bg-neo-text text-primary shadow-[6px_6px_0px_0px_#9FE870]';
            default: return 'bg-white text-neo-text shadow-neo';
        }
    };

    return (
        <div className="flex-1 w-full bg-grid pb-20">
            {/* Header */}
            <section ref={headerRef} className="max-w-7xl mx-auto px-4 md:px-6 pt-12 pb-12">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 bg-primary border-3 border-neo-border flex items-center justify-center text-neo-text shadow-neo-sm">
                        <Brain weight="fill" className="w-7 h-7" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-none">
                        Agentic<br />Workflow
                    </h1>
                </div>
                <p className="text-xl font-mono text-gray-600 max-w-3xl">
                    Four specialized AI agents operating in sequence. From raw citizen input to predictive modeling to deployment-ready action plans.
                </p>
            </section>

            {/* Pipeline Visualizer */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mb-20 overflow-hidden">
                <div className="border-4 border-neo-border bg-white p-6 shadow-neo overflow-x-auto">
                    <div ref={flowRef} className="min-w-[800px] flex items-center justify-between relative py-8 px-4">
                        {/* Background connecting line */}
                        <div className="absolute top-1/2 left-8 right-8 h-2 bg-gray-200 -translate-y-1/2"></div>
                        {/* Animated overlay line */}
                        <div className="absolute top-1/2 left-8 h-2 w-0 agent-flow-line -translate-y-1/2"></div>

                        {/* Input Node */}
                        <div className="flow-node relative z-10 flex flex-col items-center gap-3 w-32">
                            <div className="w-16 h-16 rounded-full border-4 border-neo-border bg-gray-100 flex items-center justify-center">
                                <Database weight="fill" className="w-8 h-8" />
                            </div>
                            <span className="font-mono text-xs font-bold uppercase text-center">Raw Data</span>
                        </div>

                        {/* Agent Nodes */}
                        {DATA.agents.map((agent, idx) => (
                            <div key={idx} className="flow-node relative z-10 flex flex-col items-center gap-3 w-32">
                                <div className={`w-16 h-16 border-4 border-neo-border flex items-center justify-center ${agent.color === 'dark' ? 'bg-neo-text text-primary' : 'bg-primary text-neo-text'}`}>
                                    {getIconForAgent(agent.id)}
                                </div>
                                <div className="flex flex-col items-center text-center">
                                    <span className="font-mono text-[10px] font-bold text-gray-500">AGENT {agent.number}</span>
                                    <span className="font-mono text-xs font-bold uppercase leading-tight">{agent.shortName}</span>
                                </div>
                            </div>
                        ))}

                        {/* Output Node */}
                        <div className="flow-node relative z-10 flex flex-col items-center gap-3 w-32">
                            <div className="w-16 h-16 rounded-full border-4 border-neo-border bg-accent flex items-center justify-center">
                                <ClipboardText weight="fill" className="w-8 h-8" />
                            </div>
                            <span className="font-mono text-xs font-bold uppercase text-center">Action Plan</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Agent Details Grid */}
            <section ref={cardsRef} className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="flex flex-col gap-12">
                    {DATA.agents.map((agent, idx) => (
                        <div key={idx} className={`agent-card-item border-4 border-neo-border p-6 md:p-10 ${getColorClasses(agent.color)} relative overflow-hidden group`}>
                            {/* Number Watermark */}
                            <div className="absolute -right-4 -bottom-10 text-[180px] font-black opacity-10 leading-none pointer-events-none">
                                {agent.number}
                            </div>

                            <div className="grid md:grid-cols-12 gap-8 relative z-10">
                                {/* Left Column: Identity */}
                                <div className="md:col-span-4 flex flex-col gap-4">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className={`w-14 h-14 border-3 flex items-center justify-center ${agent.color === 'dark' ? 'border-primary bg-transparent text-primary' : 'border-neo-border bg-white text-neo-text'}`}>
                                            {getIconForAgent(agent.id)}
                                        </div>
                                        <div>
                                            <div className="font-mono text-xs font-bold tracking-widest opacity-70">AGENT {agent.number}</div>
                                            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-none">{agent.name}</h2>
                                        </div>
                                    </div>
                                    <p className={`font-mono text-sm leading-relaxed ${agent.color === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                        {agent.description}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-auto pt-4">
                                        {agent.techBadges.map((badge, bIdx) => (
                                            <span key={bIdx} className={`px-2 py-1 font-mono text-[10px] font-bold uppercase border-2 ${agent.color === 'dark' ? 'border-primary text-primary' : 'border-neo-border bg-white text-neo-text'}`}>
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Column: I/O Spec */}
                                <div className={`md:col-span-8 border-3 p-5 md:p-6 flex flex-col gap-5 ${agent.color === 'dark' ? 'border-primary/30 bg-black/40' : 'border-neo-border bg-white/50'}`}>
                                    
                                    {/* IO Grid */}
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="font-black uppercase text-xs mb-2 flex items-center gap-2 opacity-60">
                                                <ArrowRight weight="bold" /> Input Vector
                                            </h4>
                                            <div className="font-mono text-xs p-3 bg-black/5 border border-neo-border/20 rounded-sm">
                                                {agent.input}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-black uppercase text-xs mb-2 flex items-center gap-2 opacity-60">
                                                Output Vector <ArrowRight weight="bold" />
                                            </h4>
                                            <div className="font-mono text-xs p-3 bg-black/5 border border-neo-border/20 rounded-sm">
                                                {agent.output}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details List */}
                                    <div className="pt-4 border-t-2 border-dashed border-neo-border/20">
                                        <h4 className="font-black uppercase text-xs mb-3 opacity-60">Execution Details</h4>
                                        <ul className="flex flex-col gap-2">
                                            {agent.details.map((detail, dIdx) => (
                                                <li key={dIdx} className="flex items-start gap-2 font-mono text-xs">
                                                    <div className={`mt-1 shrink-0 w-1.5 h-1.5 ${agent.color === 'dark' ? 'bg-primary' : 'bg-neo-text'}`} />
                                                    <span>{detail}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mt-16 text-center">
                <Link href="/dashboard" className="inline-flex items-center gap-3 bg-neo-text text-primary font-black uppercase text-lg px-8 py-4 border-4 border-neo-border shadow-neo hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none transition-all">
                    Test Pipeline in Dashboard <ArrowRight weight="bold" className="w-6 h-6" />
                </Link>
            </section>
        </div>
    );
}
