'use client';

import { Users, GithubLogo, LinkedinLogo, ArrowUpRight, ArrowRight, Code, BookOpen, TerminalWindow, TreeStructure, Brain, PaintBrush, UserFocus } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function TeamPage() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.fade-in-up, .team-card').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);

        const ctx = gsap.context(() => {
            gsap.from('.fade-in-up', {
                y: 40,
                opacity: 0,
                duration: 0.7,
                stagger: 0.15,
                ease: 'power3.out',
                clearProps: 'all',
            });

            const cards = gsap.utils.toArray('.team-card');
            cards.forEach((card: any, i) => {
                gsap.from(card, {
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 90%',
                        toggleActions: 'play none none reverse'
                    },
                    y: 50,
                    rotation: i % 2 === 0 ? -2 : 2,
                    opacity: 0,
                    duration: 0.6,
                    ease: 'back.out(1.5)',
                    clearProps: 'all'
                });
            });

        }, containerRef);
        return () => {
            clearTimeout(safety);
            ctx.revert();
        };
    }, []);

    // Helper for live stat tickers
    const TickerStat = ({ label, max, suffix = "" }: { label: string, max: number, suffix?: string }) => {
        const [val, setVal] = useState(0);
        useEffect(() => {
            const int = setInterval(() => {
                setVal(prev => (prev + Math.floor(Math.random() * 5)) % max);
            }, 800);
            return () => clearInterval(int);
        }, [max]);
        return (
            <div className="flex justify-between items-center text-[10px] font-mono border-t border-dashed border-current pt-1 mt-1 opacity-70">
                <span>{label}</span>
                <span className="font-bold">{val}{suffix}</span>
            </div>
        );
    };

    return (
        <div ref={containerRef} className="flex-1 w-full bg-grid pb-24 overflow-hidden">
            {/* Header */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-12 fade-in-up text-center">
                <div className="inline-flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 bg-primary border-4 border-neo-border flex items-center justify-center text-neo-text shadow-[6px_6px_0px_0px_#163300]">
                        <Users weight="bold" className="w-10 h-10" />
                    </div>
                </div>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-none mb-6">
                    The Team
                </h1>
                <p className="text-xl md:text-2xl font-mono text-gray-700 max-w-3xl mx-auto border-b-4 border-primary pb-6 inline-block">
                    Architects of the Gridlock Engine.
                </p>
            </section>

            <div className="max-w-7xl mx-auto px-4 md:px-6 grid lg:grid-cols-12 gap-10">
                
                {/* Team Roster - Unique Individual Cards */}
                <div className="lg:col-span-8">
                    <div className="grid sm:grid-cols-2 gap-8">
                        
                        {/* Member 1: The Systems Architect (Hacker/Terminal Theme) */}
                        <div className="team-card border-4 border-neo-border bg-neo-text text-white p-6 shadow-[8px_8px_0px_0px_#9FE870] group hover:-translate-y-2 hover:shadow-[12px_12px_0px_0px_#9FE870] transition-all relative overflow-hidden flex flex-col h-full">
                            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
                                <TerminalWindow weight="duotone" className="w-24 h-24 text-primary animate-pulse" />
                            </div>
                            <div className="w-16 h-16 bg-black border-2 border-primary mb-5 flex items-center justify-center relative z-10">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-20"></span>
                                <UserFocus weight="bold" className="w-8 h-8 text-primary" />
                            </div>
                            <div className="relative z-10 flex-1">
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-1 text-primary">{DATA.team[0]?.name || "Lead Dev"}</h3>
                                <div className="font-mono text-[10px] font-bold text-black bg-primary inline-block px-2 py-1 mb-4">
                                    {DATA.team[0]?.role || "Systems Architect"}
                                </div>
                                <p className="font-mono text-xs text-gray-400 mb-4 h-12 line-clamp-3">
                                    <span className="font-bold text-white uppercase">Focus:</span> {DATA.team[0]?.focus || "Full-Stack"}
                                </p>
                            </div>
                            <div className="mt-auto relative z-10 bg-black/50 p-3 border border-primary/30">
                                <div className="text-[10px] text-primary font-mono mb-1 flex items-center gap-1">
                                    <span className="w-2 h-2 bg-primary inline-block animate-pulse"></span> SYSTEM.ONLINE
                                </div>
                                <TickerStat label="UPTIME" max={9999} suffix="s" />
                                <TickerStat label="REQ_SEC" max={120} suffix=" req/s" />
                            </div>
                        </div>

                        {/* Member 2: The ML Engineer (Data/Graph Theme) */}
                        <div className="team-card border-4 border-neo-border bg-white p-6 shadow-[8px_8px_0px_0px_#163300] group hover:-translate-y-2 hover:shadow-[12px_12px_0px_0px_#163300] transition-all relative overflow-hidden flex flex-col h-full">
                            <div className="absolute inset-0 pattern-diagonal opacity-5"></div>
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 border-4 border-accent rounded-full opacity-20 group-hover:scale-150 transition-transform duration-700 ease-out"></div>
                            <div className="w-16 h-16 bg-accent border-3 border-neo-border mb-5 flex items-center justify-center relative z-10 overflow-hidden">
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                                <TreeStructure weight="bold" className="w-8 h-8 text-neo-text" />
                            </div>
                            <div className="relative z-10 flex-1">
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-1 text-neo-text">{DATA.team[1]?.name || "ML Eng"}</h3>
                                <div className="font-mono text-[10px] font-bold text-white bg-neo-text inline-block px-2 py-1 mb-4">
                                    {DATA.team[1]?.role || "Model Trainer"}
                                </div>
                                <p className="font-mono text-xs text-gray-600 mb-4 h-12 line-clamp-3">
                                    <span className="font-bold text-neo-text uppercase">Focus:</span> {DATA.team[1]?.focus || "XGBoost"}
                                </p>
                            </div>
                            <div className="mt-auto relative z-10 bg-accent/20 p-3 border-2 border-neo-border/20">
                                <div className="h-8 flex items-end gap-1 mb-2">
                                    {[40, 70, 30, 90, 50, 80, 20].map((h, i) => (
                                        <div key={i} className="flex-1 bg-neo-text opacity-70 origin-bottom animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}></div>
                                    ))}
                                </div>
                                <TickerStat label="LOSS" max={100} suffix="%" />
                                <TickerStat label="ACCURACY" max={99} suffix="%" />
                            </div>
                        </div>

                        {/* Member 3: The AI Agent Dev (Glowing/Neuromancer Theme) */}
                        <div className="team-card border-4 border-neo-border bg-black text-white p-6 shadow-[8px_8px_0px_0px_#a0e1e1] group hover:-translate-y-2 hover:shadow-[12px_12px_0px_0px_#a0e1e1] transition-all relative overflow-hidden flex flex-col h-full">
                            <div className="absolute -top-10 -left-10 w-32 h-32 bg-accent/20 rounded-full blur-2xl group-hover:bg-accent/40 transition-colors"></div>
                            <div className="w-16 h-16 bg-transparent border-2 border-accent mb-5 flex items-center justify-center relative z-10">
                                <Brain weight="fill" className="w-8 h-8 text-accent drop-shadow-[0_0_8px_rgba(160,225,225,0.8)]" />
                            </div>
                            <div className="relative z-10 flex-1">
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-1 text-accent">{DATA.team[2]?.name || "AI Dev"}</h3>
                                <div className="font-mono text-[10px] font-bold text-black bg-accent inline-block px-2 py-1 mb-4">
                                    {DATA.team[2]?.role || "Prompt Engineer"}
                                </div>
                                <p className="font-mono text-xs text-gray-400 mb-4 h-12 line-clamp-3">
                                    <span className="font-bold text-white uppercase">Focus:</span> {DATA.team[2]?.focus || "Agents"}
                                </p>
                            </div>
                            <div className="mt-auto relative z-10 border border-accent/30 p-3 bg-accent/5">
                                <div className="flex gap-2 mb-2 justify-center">
                                    <span className="w-2 h-2 rounded-full bg-accent animate-ping" style={{ animationDelay: '0s' }}></span>
                                    <span className="w-2 h-2 rounded-full bg-accent animate-ping" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-2 h-2 rounded-full bg-accent animate-ping" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                                <TickerStat label="TOKENS" max={8000} suffix=" ctx" />
                                <TickerStat label="PROMPTS" max={500} />
                            </div>
                        </div>

                        {/* Member 4: The Frontend Engineer (Creative/Pixel Theme) */}
                        <div className="team-card border-4 border-neo-border bg-primary p-6 shadow-[8px_8px_0px_0px_#163300] group hover:-translate-y-2 hover:shadow-[12px_12px_0px_0px_#163300] transition-all relative overflow-hidden flex flex-col h-full">
                            <div className="absolute inset-0 flex items-center justify-center opacity-10 mix-blend-overlay pointer-events-none">
                                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--neo-text)_2px,_transparent_2px)] bg-[size:16px_16px] group-hover:bg-[size:20px_20px] transition-all duration-500"></div>
                            </div>
                            <div className="w-16 h-16 bg-white border-4 border-neo-border mb-5 flex items-center justify-center relative z-10 group-hover:rotate-12 transition-transform">
                                <PaintBrush weight="bold" className="w-8 h-8 text-neo-text" />
                            </div>
                            <div className="relative z-10 flex-1">
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-1 text-neo-text">{DATA.team[3]?.name || "UI/UX Dev"}</h3>
                                <div className="font-mono text-[10px] font-bold text-white bg-neo-text inline-block px-2 py-1 mb-4 shadow-[2px_2px_0px_0px_#ffffff]">
                                    {DATA.team[3]?.role || "Frontend Engineer"}
                                </div>
                                <p className="font-mono text-xs text-neo-text/80 mb-4 h-12 line-clamp-3">
                                    <span className="font-bold text-neo-text uppercase">Focus:</span> {DATA.team[3]?.focus || "React & GSAP"}
                                </p>
                            </div>
                            <div className="mt-auto relative z-10 bg-white border-2 border-neo-border p-3 overflow-hidden">
                                <div className="flex whitespace-nowrap mb-2 border-b-2 border-neo-border pb-1">
                                    <div className="animate-[scroll_4s_linear_infinite] font-mono text-[10px] font-bold">
                                        PIXEL PERFECT • 60 FPS • NEO BRUTAL • 
                                    </div>
                                    <div className="animate-[scroll_4s_linear_infinite] font-mono text-[10px] font-bold" aria-hidden="true">
                                        PIXEL PERFECT • 60 FPS • NEO BRUTAL • 
                                    </div>
                                </div>
                                <TickerStat label="COMPONENTS" max={150} />
                                <TickerStat label="RE-RENDERS" max={3} />
                            </div>
                        </div>

                    </div>
                </div>

                {/* Project Info & Resources */}
                <div className="lg:col-span-4 flex flex-col gap-8 fade-in-up">
                    
                    <div className="border-4 border-neo-border bg-neo-text text-white p-8 shadow-[8px_8px_0px_0px_#9FE870] hover:-translate-y-1 hover:shadow-[10px_10px_0px_0px_#9FE870] transition-all relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-xl animate-pulse"></div>
                        <h3 className="text-2xl font-black uppercase mb-6 text-primary flex items-center gap-2">
                            <ArrowRight weight="bold" /> Project Scope
                        </h3>
                        <p className="font-mono text-sm text-gray-300 leading-relaxed mb-8">
                            Smart Traffic Intelligence was developed to solve real-world urban congestion issues by utilizing agentic AI workflows on historical traffic datasets.
                        </p>
                        <div className="space-y-4 font-mono text-xs">
                            <div className="flex justify-between border-b border-gray-700 pb-2 group hover:border-primary transition-colors">
                                <span className="text-gray-400">Dataset</span>
                                <span className="font-bold text-white group-hover:text-primary transition-colors">Bengaluru (8.1k)</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2 group hover:border-primary transition-colors">
                                <span className="text-gray-400">Core Tech</span>
                                <span className="font-bold text-white group-hover:text-primary transition-colors">FastAPI + Next.js</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2 group hover:border-primary transition-colors">
                                <span className="text-gray-400">AI Models</span>
                                <span className="font-bold text-white group-hover:text-primary transition-colors">XGBoost, I-Forest</span>
                            </div>
                            <div className="flex justify-between pb-2 group">
                                <span className="text-gray-400">LLM Engine</span>
                                <span className="font-bold text-primary group-hover:text-white transition-colors">Gemini Flash</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-4 border-neo-border bg-secondary p-8 shadow-neo hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#163300] transition-all relative overflow-hidden">
                        <div className="absolute inset-0 pattern-diagonal opacity-10 pointer-events-none"></div>
                        <h3 className="text-2xl font-black uppercase mb-6 relative z-10">Resources</h3>
                        <div className="flex flex-col gap-4 relative z-10">
                            <Link href="#" className="flex items-center justify-between border-3 border-neo-border bg-white p-4 hover:bg-primary hover:-translate-y-1 transition-all group shadow-sm hover:shadow-neo-sm">
                                <span className="flex items-center gap-3 font-mono text-sm font-bold uppercase"><GithubLogo weight="bold" className="w-6 h-6"/> GitHub Repo</span>
                                <ArrowUpRight weight="bold" className="w-5 h-5 group-hover:rotate-45 transition-transform" />
                            </Link>
                            <Link href="#" className="flex items-center justify-between border-3 border-neo-border bg-white p-4 hover:bg-primary hover:-translate-y-1 transition-all group shadow-sm hover:shadow-neo-sm">
                                <span className="flex items-center gap-3 font-mono text-sm font-bold uppercase"><BookOpen weight="bold" className="w-6 h-6"/> Documentation</span>
                                <ArrowUpRight weight="bold" className="w-5 h-5 group-hover:rotate-45 transition-transform" />
                            </Link>
                            <Link href="/dashboard" className="flex items-center justify-between border-3 border-neo-border bg-neo-text text-primary p-4 hover:bg-black hover:-translate-y-1 transition-all group shadow-sm hover:shadow-neo-sm">
                                <span className="flex items-center gap-3 font-mono text-sm font-bold uppercase"><Code weight="bold" className="w-6 h-6"/> Live Dashboard</span>
                                <ArrowRight weight="bold" className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                            </Link>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
