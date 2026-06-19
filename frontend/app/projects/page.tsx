'use client';

import { Brain, ArrowRight, TextOutdent, Target, ShieldCheck, ClipboardText, Database, CaretDown } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function AgentsPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const flowRef = useRef<HTMLDivElement>(null);
    const cardsContainerRef = useRef<HTMLDivElement>(null);
    const progressLineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.flow-node, .agent-card-item, .agent-number, .agent-content').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
            if (progressLineRef.current) {
                progressLineRef.current.style.transform = 'scaleY(1)';
            }
        }, 2000);

        const ctx = gsap.context(() => {
            // Header animation
            gsap.from(headerRef.current, {
                y: 50,
                opacity: 0,
                duration: 1,
                ease: 'power3.out',
                clearProps: 'all',
            });

            // Flow Diagram Pipeline Animation
            const flowNodes = gsap.utils.toArray('.flow-node');
            const flowTl = gsap.timeline({
                scrollTrigger: {
                    trigger: flowRef.current,
                    start: 'top 85%',
                }
            });

            flowTl.from(flowNodes, {
                y: 40,
                opacity: 0,
                scale: 0.8,
                duration: 0.6,
                stagger: 0.15,
                ease: 'back.out(1.5)',
                clearProps: 'all',
            });

            // Vertical scroll progress line
            gsap.to(progressLineRef.current, {
                scaleY: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: cardsContainerRef.current,
                    start: 'top 50%',
                    end: 'bottom 80%',
                    scrub: 1,
                }
            });

            // Agent Cards Scroll Animation
            const cards = gsap.utils.toArray('.agent-card-wrap');
            cards.forEach((card: any, i) => {
                const isEven = i % 2 === 0;
                
                // Card Entrance
                gsap.from(card, {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse'
                    },
                    x: isEven ? -80 : 80,
                    opacity: 0,
                    duration: 0.8,
                    ease: 'power3.out',
                    clearProps: 'all',
                });

                // Parallax Number Watermark
                const numberWatermark = card.querySelector('.agent-number');
                if (numberWatermark) {
                    gsap.to(numberWatermark, {
                        scrollTrigger: {
                            trigger: card,
                            start: 'top bottom',
                            end: 'bottom top',
                            scrub: 1,
                        },
                        y: 100,
                        ease: 'none'
                    });
                }
            });

            // CTA bounce
            gsap.from('.cta-btn', {
                scrollTrigger: {
                    trigger: '.cta-section',
                    start: 'top 90%',
                    toggleActions: 'play none none reverse'
                },
                y: 30,
                opacity: 0,
                duration: 0.6,
                ease: 'back.out(2)',
                clearProps: 'all'
            });

        }, containerRef);

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
            case 'primary': return 'bg-primary text-neo-text shadow-[8px_8px_0px_0px_#163300] hover:shadow-[12px_12px_0px_0px_#163300]';
            case 'accent': return 'bg-accent text-neo-text shadow-[8px_8px_0px_0px_#163300] hover:shadow-[12px_12px_0px_0px_#163300]';
            case 'secondary': return 'bg-white text-neo-text shadow-[8px_8px_0px_0px_#163300] hover:shadow-[12px_12px_0px_0px_#163300]';
            case 'dark': return 'bg-neo-text text-primary shadow-[8px_8px_0px_0px_#9FE870] hover:shadow-[12px_12px_0px_0px_#9FE870]';
            default: return 'bg-white text-neo-text shadow-neo';
        }
    };

    return (
        <div ref={containerRef} className="flex-1 w-full bg-grid pb-20 overflow-hidden">
            {/* Header */}
            <section ref={headerRef} className="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-16 text-center">
                <div className="inline-flex items-center gap-4 mb-6 mx-auto">
                    <div className="h-16 w-16 bg-primary border-4 border-neo-border flex items-center justify-center text-neo-text shadow-neo">
                        <Brain weight="fill" className="w-10 h-10" />
                    </div>
                </div>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-none mb-6">
                    Agentic Workflow
                </h1>
                <p className="text-xl md:text-2xl font-mono text-gray-700 max-w-3xl mx-auto">
                    Four specialized AI agents operating in sequence. From raw citizen input to predictive modeling to deployment-ready action plans.
                </p>
                <div className="mt-12 animate-bounce flex justify-center">
                    <CaretDown weight="bold" className="w-10 h-10 text-neo-text" />
                </div>
            </section>

            {/* Pipeline Visualizer */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 mb-24">
                <div className="border-4 border-neo-border bg-white p-8 md:p-12 shadow-[8px_8px_0px_0px_#163300] overflow-x-auto relative z-10">
                    <div ref={flowRef} className="min-w-[800px] flex items-center justify-between relative">
                        {/* Background connecting line */}
                        <div className="absolute top-[40px] left-12 right-12 h-3 bg-gray-200 border-y-2 border-neo-border z-0"></div>
                        {/* Animated overlay line */}
                        <div className="absolute top-[40px] left-12 h-3 w-[80%] bg-primary border-y-2 border-neo-border z-0 agent-flow-line opacity-80"></div>

                        {/* Input Node */}
                        <div className="flow-node relative z-10 flex flex-col items-center gap-4 w-32">
                            <div className="w-20 h-20 rounded-full border-4 border-neo-border bg-gray-100 flex items-center justify-center shadow-[4px_4px_0px_0px_#163300] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#163300] transition-all">
                                <Database weight="fill" className="w-10 h-10" />
                            </div>
                            <span className="font-mono text-sm font-bold uppercase text-center bg-white px-2 py-1 border-2 border-neo-border">Raw Data</span>
                        </div>

                        {/* Agent Nodes */}
                        {DATA.agents.map((agent, idx) => (
                            <div key={idx} className="flow-node relative z-10 flex flex-col items-center gap-4 w-32">
                                <div className={`w-20 h-20 border-4 border-neo-border flex items-center justify-center shadow-[4px_4px_0px_0px_#163300] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#163300] transition-all ${agent.color === 'dark' ? 'bg-neo-text text-primary border-primary' : 'bg-primary text-neo-text'}`}>
                                    {getIconForAgent(agent.id)}
                                </div>
                                <div className="flex flex-col items-center text-center bg-white px-2 py-1 border-2 border-neo-border">
                                    <span className="font-mono text-[10px] font-bold text-gray-500">AGENT {agent.number}</span>
                                    <span className="font-mono text-xs font-bold uppercase leading-tight">{agent.shortName}</span>
                                </div>
                            </div>
                        ))}

                        {/* Output Node */}
                        <div className="flow-node relative z-10 flex flex-col items-center gap-4 w-32">
                            <div className="w-20 h-20 rounded-full border-4 border-neo-border bg-accent flex items-center justify-center shadow-[4px_4px_0px_0px_#163300] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#163300] transition-all">
                                <ClipboardText weight="fill" className="w-10 h-10" />
                            </div>
                            <span className="font-mono text-sm font-bold uppercase text-center bg-white px-2 py-1 border-2 border-neo-border">Action Plan</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Agent Details Grid with Progress Line */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 relative">
                {/* Scroll-linked Progress Line (Desktop only) */}
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-2 bg-gray-200 border-x-2 border-neo-border -translate-x-1/2 z-0">
                    <div ref={progressLineRef} className="absolute top-0 left-0 w-full h-full bg-primary origin-top scale-y-0"></div>
                </div>

                <div ref={cardsContainerRef} className="flex flex-col gap-16 relative z-10 py-10">
                    {DATA.agents.map((agent, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                            <div key={idx} className={`agent-card-wrap flex flex-col md:flex-row gap-8 ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                                
                                {/* Timeline Dot */}
                                <div className="hidden md:flex flex-col items-center justify-center absolute left-1/2 -translate-x-1/2 mt-12 z-20">
                                    <div className={`w-8 h-8 rounded-full border-4 border-neo-border flex items-center justify-center font-black text-xs shadow-neo ${agent.color === 'dark' ? 'bg-neo-text text-primary' : 'bg-primary text-neo-text'}`}>
                                        {agent.number}
                                    </div>
                                </div>

                                {/* Content Card */}
                                <div className={`w-full md:w-[45%] agent-card-item border-4 border-neo-border p-6 md:p-8 ${getColorClasses(agent.color)} relative overflow-hidden group transition-transform duration-300`}>
                                    
                                    {/* Number Watermark Parallax */}
                                    <div className="agent-number absolute -right-6 -top-10 text-[200px] font-black opacity-[0.07] leading-none pointer-events-none transition-transform">
                                        {agent.number}
                                    </div>

                                    <div className="relative z-10 flex flex-col h-full gap-5">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-14 h-14 border-3 flex items-center justify-center shadow-neo-sm ${agent.color === 'dark' ? 'border-primary bg-transparent text-primary' : 'border-neo-border bg-white text-neo-text'}`}>
                                                {getIconForAgent(agent.id)}
                                            </div>
                                            <div>
                                                <div className="font-mono text-xs font-bold tracking-widest opacity-70">AGENT {agent.number}</div>
                                                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-none">{agent.name}</h2>
                                            </div>
                                        </div>
                                        <p className={`font-mono text-sm leading-relaxed flex-1 ${agent.color === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                            {agent.description}
                                        </p>
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            {agent.techBadges.map((badge, bIdx) => (
                                                <span key={bIdx} className={`px-2 py-1 font-mono text-[10px] font-bold uppercase border-2 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all cursor-default ${agent.color === 'dark' ? 'border-primary text-primary bg-black/30' : 'border-neo-border bg-white text-neo-text'}`}>
                                                    {badge}
                                                </span>
                                            ))}
                                        </div>
                                        
                                        {/* I/O Reveal on Hover */}
                                        <div className={`mt-4 p-4 border-3 transition-all duration-300 ${agent.color === 'dark' ? 'border-primary/50 bg-black/50' : 'border-neo-border/50 bg-white/70'}`}>
                                            <div className="mb-3">
                                                <h4 className="font-black uppercase text-[10px] mb-1 flex items-center gap-1 opacity-70">
                                                    <ArrowRight weight="bold" /> Input
                                                </h4>
                                                <div className="font-mono text-xs opacity-90 truncate" title={agent.input}>{agent.input}</div>
                                            </div>
                                            <div>
                                                <h4 className="font-black uppercase text-[10px] mb-1 flex items-center gap-1 opacity-70">
                                                    Output <ArrowRight weight="bold" />
                                                </h4>
                                                <div className="font-mono text-[10px] opacity-90">{agent.output}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Empty space for alternating layout */}
                                <div className="hidden md:block w-[45%]"></div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* CTA */}
            <section className="cta-section max-w-7xl mx-auto px-4 md:px-6 mt-16 pb-12 text-center relative z-10">
                <Link href="/dashboard" className="cta-btn inline-flex items-center gap-3 bg-neo-text text-primary font-black uppercase text-xl px-10 py-6 border-4 border-primary shadow-[8px_8px_0px_0px_#9FE870] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none transition-all duration-300 group">
                    Test Pipeline in Dashboard 
                    <ArrowRight weight="bold" className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                </Link>
            </section>
        </div>
    );
}
