'use client';

import { Users, GithubLogo, LinkedinLogo, ArrowUpRight, ArrowRight, Code, BookOpen } from '@phosphor-icons/react';
import { DATA } from '@/components/constants';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function TeamPage() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Safety net: force everything visible after 2s
        const safety = setTimeout(() => {
            document.querySelectorAll('.fade-in-up').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);

        const ctx = gsap.context(() => {
            gsap.from('.fade-in-up', {
                y: 25,
                opacity: 0,
                duration: 0.5,
                stagger: 0.12,
                ease: 'power2.out',
                clearProps: 'all',
            });
        }, containerRef);
        return () => {
            clearTimeout(safety);
            ctx.revert();
        };
    }, []);

    return (
        <div ref={containerRef} className="flex-1 w-full bg-grid pb-20">
            {/* Header */}
            <section className="max-w-7xl mx-auto px-4 md:px-6 pt-12 pb-12 fade-in-up">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 bg-primary border-3 border-neo-border flex items-center justify-center text-neo-text shadow-neo-sm">
                        <Users weight="bold" className="w-7 h-7" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-none">
                        The Team
                    </h1>
                </div>
                <p className="text-xl font-mono text-gray-600 max-w-2xl border-l-4 border-primary pl-4">
                    The engineers and researchers behind Smart Traffic Intelligence.
                </p>
            </section>

            <div className="max-w-7xl mx-auto px-4 md:px-6 grid lg:grid-cols-12 gap-8">
                
                {/* Team Roster */}
                <div className="lg:col-span-8">
                    <div className="grid sm:grid-cols-2 gap-6 fade-in-up">
                        {DATA.team.map((member, idx) => (
                            <div key={idx} className="border-4 border-neo-border bg-white p-6 shadow-neo hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all group">
                                <div className="w-16 h-16 bg-secondary border-3 border-neo-border mb-4 overflow-hidden pattern-diagonal">
                                    {/* Placeholder for avatar */}
                                </div>
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-1">{member.name}</h3>
                                <div className="font-mono text-xs font-bold text-primary bg-neo-text inline-block px-2 py-1 mb-4">
                                    {member.role}
                                </div>
                                <p className="font-mono text-sm text-gray-600">
                                    <span className="font-bold text-neo-text uppercase text-[10px]">Focus:</span><br/>
                                    {member.focus}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Project Info & Resources */}
                <div className="lg:col-span-4 flex flex-col gap-6 fade-in-up">
                    
                    <div className="border-4 border-neo-border bg-neo-text text-white p-6 shadow-[5px_5px_0px_0px_#9FE870]">
                        <h3 className="text-xl font-black uppercase mb-4 text-primary">Project Scope</h3>
                        <p className="font-mono text-sm text-gray-300 leading-relaxed mb-6">
                            Smart Traffic Intelligence was developed to solve real-world urban congestion issues by utilizing agentic AI workflows on historical traffic datasets.
                        </p>
                        <div className="space-y-3 font-mono text-xs">
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="text-gray-400">Dataset</span>
                                <span className="font-bold text-white">Bengaluru (8.1k records)</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="text-gray-400">Core Tech</span>
                                <span className="font-bold text-white">FastAPI + Next.js</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-700 pb-2">
                                <span className="text-gray-400">AI Models</span>
                                <span className="font-bold text-white">XGBoost, Isolation Forest</span>
                            </div>
                            <div className="flex justify-between pb-2">
                                <span className="text-gray-400">LLM Engine</span>
                                <span className="font-bold text-primary">Gemini Flash</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-4 border-neo-border bg-secondary p-6 shadow-neo">
                        <h3 className="text-xl font-black uppercase mb-4">Resources</h3>
                        <div className="flex flex-col gap-3">
                            <Link href="#" className="flex items-center justify-between border-2 border-neo-border bg-white p-3 hover:bg-primary transition-colors group">
                                <span className="flex items-center gap-2 font-mono text-sm font-bold uppercase"><GithubLogo weight="bold" className="w-5 h-5"/> GitHub Repo</span>
                                <ArrowUpRight weight="bold" className="w-4 h-4" />
                            </Link>
                            <Link href="#" className="flex items-center justify-between border-2 border-neo-border bg-white p-3 hover:bg-primary transition-colors group">
                                <span className="flex items-center gap-2 font-mono text-sm font-bold uppercase"><BookOpen weight="bold" className="w-5 h-5"/> Documentation</span>
                                <ArrowUpRight weight="bold" className="w-4 h-4" />
                            </Link>
                            <Link href="/dashboard" className="flex items-center justify-between border-2 border-neo-border bg-neo-text text-primary p-3 hover:bg-black transition-colors group">
                                <span className="flex items-center gap-2 font-mono text-sm font-bold uppercase"><Code weight="bold" className="w-5 h-5"/> Live Dashboard</span>
                                <ArrowRight weight="bold" className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
