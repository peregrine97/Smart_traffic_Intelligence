'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUpRight, ArrowRight, Cpu, Database, Terminal, Brain, TreeStructure, ShieldCheck, ChartLineUp } from '@phosphor-icons/react';
import ISTClock from '@/components/ISTClock';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Extract numeric part
    const numericStr = value.replace(/[^0-9.]/g, '');
    const target = parseFloat(numericStr);
    if (isNaN(target)) {
      el.textContent = value;
      return;
    }

    const prefix = value.match(/^[^0-9]*/)?.[0] || '';
    const hasComma = value.includes(',');
    const isDecimal = value.includes('.');

    gsap.fromTo(el, { textContent: '0' }, {
      textContent: target,
      duration: 2,
      ease: 'power2.out',
      snap: { textContent: isDecimal ? 0.1 : 1 },
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
      onUpdate: function () {
        const current = parseFloat(el.textContent || '0');
        if (hasComma) {
          el.textContent = prefix + Math.round(current).toLocaleString() + suffix;
        } else if (isDecimal) {
          el.textContent = prefix + current.toFixed(0) + suffix;
        } else {
          el.textContent = prefix + Math.round(current).toString() + suffix;
        }
      },
    });
  }, [value, suffix]);

  return <h3 ref={ref} className="font-black text-2xl sm:text-3xl md:text-4xl counter-value">0</h3>;
}

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Safety net: force everything visible after 2 seconds no matter what
    const safety = setTimeout(() => {
      document.querySelectorAll('.hero-title, .hero-subtitle, .hero-cta, .stat-card, .bench-card, .nav-card').forEach(el => {
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.transform = 'none';
      });
    }, 2000);

    const ctx = gsap.context(() => {
      // Hero animation — immediate, no scroll trigger
      gsap.from('.hero-title', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        clearProps: 'all',
      });

      gsap.from('.hero-subtitle', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        delay: 0.2,
        ease: 'power3.out',
        clearProps: 'all',
      });

      gsap.from('.hero-cta', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        delay: 0.4,
        stagger: 0.12,
        ease: 'power3.out',
        clearProps: 'all',
      });

      // Stats cards — scroll triggered with generous start
      gsap.from('.stat-card', {
        scrollTrigger: {
          trigger: statsRef.current,
          start: 'top 95%',
          once: true,
        },
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
        clearProps: 'all',
      });

      // Benchmark cards
      gsap.from('.bench-card', {
        scrollTrigger: {
          trigger: benchRef.current,
          start: 'top 95%',
          once: true,
        },
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.12,
        ease: 'power2.out',
        clearProps: 'all',
      });

      // Navigation bento cards
      gsap.from('.nav-card', {
        scrollTrigger: {
          trigger: navRef.current,
          start: 'top 95%',
          once: true,
        },
        y: 20,
        opacity: 0,
        duration: 0.4,
        stagger: 0.08,
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
    <div className="flex-1 w-full bg-grid">
      {/* Hero Section */}
      <section ref={heroRef} className="max-w-7xl mx-auto px-4 md:px-6 py-8 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-6 items-stretch">

          {/* Main Hero Card */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="border-3 border-neo-border bg-white p-4 sm:p-8 md:p-16 shadow-neo relative overflow-hidden h-full flex flex-col justify-center min-h-[320px] sm:min-h-[500px]">
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary rounded-full blur-3xl -mr-20 -mt-20 opacity-50"></div>

              {/* Mobile: Status Badge & System Icon */}
              <div className="relative mb-12 sm:mb-8">
                <div className="inline-block px-2 py-1 sm:px-3 sm:py-1 bg-neo-text text-primary border-2 border-neo-border font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(159,232,112,1)]">
                  System Status: Operational
                </div>

                {/* System Icon - Absolute positioned top-right on mobile */}
                <div className="lg:hidden absolute top-0 right-0 w-[28%] max-w-[120px] aspect-square border-3 border-neo-border overflow-hidden bg-primary flex items-center justify-center">
                  <Brain weight="bold" className="w-1/2 h-1/2 text-neo-text" />
                </div>
              </div>

              <h1 className="hero-title text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter leading-[0.85] mb-4 sm:mb-6 relative z-10">
                Smart Traffic<br />
                <span className="terminal-invert sm:terminal-invert-lg font-black inline-block">
                  Intelligence
                </span><br />
                Bengaluru
              </h1>

              <p className="hero-subtitle text-sm sm:text-lg md:text-xl max-w-2xl text-gray-500 font-mono leading-relaxed border-l-4 border-primary pl-3 sm:pl-6 mb-3 sm:mb-4">
                Four autonomous AI agents transform raw traffic incident data into predictive intelligence and deployment-ready action plans — in real time.
              </p>

              <p className="hero-subtitle text-[10px] sm:text-xs font-mono text-gray-500 mb-6 sm:mb-8 uppercase tracking-widest">
                Agentic AI Platform // 8,173 Real Incidents // Bengaluru Traffic Dataset
              </p>

              <div className="flex flex-col gap-3 relative z-10">
                <Link
                  href="/dashboard"
                  className="hero-cta px-5 py-3 sm:px-8 sm:py-4 bg-primary text-neo-text font-bold text-sm sm:text-lg uppercase tracking-wider btn-neo flex items-center justify-center gap-2 group w-full"
                >
                  <span className="flex items-center gap-2">
                    Launch Dashboard
                    <ArrowRight weight="bold" className="w-5 h-5 sm:w-6 sm:h-6" />
                  </span>
                </Link>
                <Link
                  href="/agents"
                  className="hero-cta px-5 py-3 sm:px-8 sm:py-4 bg-white text-neo-text font-bold text-sm sm:text-lg uppercase tracking-wider btn-neo transition-all flex items-center justify-center gap-2 w-full"
                >
                  Explore Agentic Workflow
                  <ArrowDown weight="bold" className="w-5 h-5 sm:w-6 sm:h-6" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column Grid */}
          <div className="hidden lg:flex lg:col-span-4 flex-col gap-6">
            {/* Platform Graphic Card */}
            <div className="border-3 border-neo-border bg-primary p-0 shadow-neo flex-1 min-h-[300px] flex flex-col items-center justify-center relative group overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute inset-0 bg-center"></div>
              </div>
              <Brain weight="bold" className="w-32 h-32 text-neo-text relative z-10" />
              <div className="absolute bottom-4 left-4 font-mono text-[10px] text-primary/50 uppercase tracking-widest z-10">
                4_Agent_Pipeline // Active
              </div>
              <div className="absolute inset-0 border-3 border-transparent group-hover:border-primary transition-all duration-300 pointer-events-none"></div>
            </div>

            {/* Stats Grid */}
            <div ref={statsRef} className="grid grid-cols-2 gap-6 h-auto">
              <div className="stat-card border-3 border-neo-border bg-white p-5 shadow-neo flex flex-col justify-between hover:bg-secondary transition-colors">
                <div className="flex justify-between items-start">
                  <Database weight="bold" className="w-8 h-8" />
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                </div>
                <div>
                  <AnimatedCounter value="8,173" />
                  <p className="font-mono text-[10px] font-bold uppercase leading-tight mt-1">Real<br />Incidents</p>
                </div>
              </div>
              <div className="stat-card border-3 border-neo-border bg-neo-text text-primary p-5 shadow-neo flex flex-col justify-between hover:bg-gray-900 transition-colors">
                <Cpu weight="bold" className="w-8 h-8" />
                <div>
                  <AnimatedCounter value="4" />
                  <p className="font-mono text-[10px] font-bold uppercase leading-tight mt-1 text-white">AI<br />Agents</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee Section - Platform Capabilities */}
      <section className="py-0 bg-primary border-y-[3px] border-neo-border relative overflow-hidden">
        <div className="text-center py-2 border-b-[3px] border-neo-border">
          <h3 className="text-sm font-bold tracking-widest uppercase inline-block">Platform Capabilities</h3>
        </div>
        <div className="w-full overflow-hidden py-6">
          <div className="flex w-max animate-marquee">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-20 px-10">
                <div className="md:text-4xl text-lg sm:text-2xl font-black text-neo-text tracking-tight uppercase">
                  Real-time Anomaly Detection
                </div>
                <div className="md:text-4xl text-2xl font-black text-neo-text tracking-tight uppercase">
                  XGBoost Classification
                </div>
                <div className="md:text-4xl text-2xl font-black text-neo-text tracking-tight uppercase">
                  Multilingual NLP Parsing
                </div>
                <div className="md:text-4xl text-2xl font-black text-neo-text tracking-tight uppercase">
                  Groq Action Plans
                </div>
                <div className="md:text-4xl text-2xl font-black text-neo-text tracking-tight uppercase">
                  Isolation Forest
                </div>
                <div className="md:text-4xl text-2xl font-black text-neo-text tracking-tight uppercase">
                  SSE Streaming
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Results Section */}
      <section ref={benchRef} className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-8 w-8 bg-neo-text flex items-center justify-center text-primary">
            <ChartLineUp weight="bold" className="w-5 h-5" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight">Key Results</h2>
          <div className="h-1 flex-1 bg-neo-text"></div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Result 1 */}
          <div className="bench-card border-3 border-neo-border neo-brutal-box bg-white shadow-neo overflow-hidden group">
            <div className="aspect-video overflow-hidden border-b-3 border-neo-border relative bg-black flex items-center justify-center">
              <Brain weight="bold" className="w-32 h-32 text-primary opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="absolute inset-0 pattern-diagonal opacity-10"></div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-primary text-neo-text text-xs font-bold px-2 py-1 border-2 border-neo-border uppercase">Validated</span>
                <span className="terminal-invert text-xs font-bold uppercase">Real Data</span>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">8,173 Real Incidents</h3>
              <p className="font-mono text-sm text-gray-600">Trained on authenticated Bengaluru traffic data — vehicle breakdowns, accidents, VIP movements, festivals, and protests.</p>
            </div>
          </div>

          {/* Result 2 */}
          <div className="bench-card border-3 border-neo-border neo-brutal-box bg-white shadow-neo overflow-hidden group">
            <div className="aspect-video overflow-hidden border-b-3 border-neo-border relative bg-black flex items-center justify-center">
              <TreeStructure weight="bold" className="w-32 h-32 text-primary opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="absolute inset-0 pattern-diagonal opacity-10"></div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-primary text-neo-text text-xs font-bold px-2 py-1 border-2 border-neo-border uppercase">Agentic</span>
                <span className="terminal-invert text-xs font-bold uppercase">End-to-End</span>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-2">4-Agent Pipeline</h3>
              <p className="font-mono text-sm text-gray-600">From raw Kannada text to deployment-ready field plan in under 2 seconds — NLP → Prediction → Anomaly → Action Plan.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Explore More - Premium Navigation Bento Grid */}
      <section ref={navRef} className="max-w-7xl mx-auto px-4 md:px-6 py-12 lg:py-20">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-10 w-10 bg-neo-text flex items-center justify-center text-primary shadow-neo-sm">
            <ArrowDown weight="bold" className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight">Explore Platform</h2>
          <div className="h-1 flex-1 bg-neo-text"></div>
          <span className="font-mono text-xs text-gray-500 hidden md:block">{"// NAVIGATION"}</span>
        </div>

        {/* Asymmetric Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 lg:gap-5">

          {/* Architecture Card - Large Left */}
          <Link
            href="/architecture"
            className="nav-card sm:col-span-1 md:col-span-2 md:row-span-2 relative group overflow-hidden block h-full"
          >
            <div className="border-4 border-neo-border bg-neo-text text-white p-5 sm:p-8 shadow-[5px_5px_0px_0px_#9FE870] h-full min-h-[180px] sm:min-h-[300px] md:min-h-[420px] flex flex-col justify-between transition-all duration-300 group-hover:translate-x-[3px] group-hover:translate-y-[3px] group-hover:shadow-none relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-3 sm:mb-6">
                  <span className="bg-primary text-neo-text px-2 py-1 font-mono text-sm font-bold">01</span>
                </div>
                <h3 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter mb-2 sm:mb-4 leading-[0.9] text-primary">
                  System<br /><span className="text-white">Architecture</span>
                </h3>
                <p className="font-mono text-xs sm:text-base text-gray-400 leading-relaxed max-w-[200px] hidden sm:block">
                  How the platform transforms raw data into actionable intelligence.
                </p>
              </div>

              <div className="relative z-10 hidden sm:flex items-center justify-between pt-6 border-t border-gray-700">
                <span className="font-mono text-sm tracking-wider text-gray-400 group-hover:text-primary transition-colors">View Architecture</span>
                <span className="w-10 h-10 border-2 border-primary flex items-center justify-center bg-primary text-neo-text">
                  <ArrowRight weight="bold" className="w-6 h-6" />
                </span>
              </div>
            </div>
          </Link>

          {/* Agents Card */}
          <Link
            href="/agents"
            className="nav-card sm:col-span-1 md:col-span-2 relative group block h-full"
          >
            <div className="border-4 border-neo-border bg-primary p-4 sm:p-6 shadow-neo min-h-[180px] sm:min-h-[200px] h-full flex flex-col justify-between transition-all duration-300 group-hover:translate-x-[3px] group-hover:translate-y-[3px] group-hover:shadow-none relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)' }}></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-neo-text text-primary px-2 py-1 font-mono text-xs font-bold">02</span>
                  <Brain weight="bold" className="w-10 h-10 text-neo-text/40" />
                </div>
                <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tighter leading-[0.9]">
                  AI Agent<br />Workflow
                </h3>
              </div>
              <div className="relative z-10 flex items-center justify-between pt-2 sm:pt-4">
                <span className="font-mono text-sm text-neo-text/70">4 Autonomous Agents</span>
                <ArrowUpRight weight="bold" className="w-6 h-6" />
              </div>
            </div>
          </Link>

          {/* Dashboard CTA */}
          <Link
            href="/dashboard"
            className="nav-card sm:col-span-1 md:col-span-2 relative group block h-full"
          >
            <div className="border-4 border-neo-border bg-accent p-4 sm:p-5 shadow-neo min-h-[180px] sm:min-h-[200px] h-full flex flex-col justify-between transition-all duration-300 group-hover:translate-x-[3px] group-hover:translate-y-[3px] group-hover:shadow-none relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors duration-500"></div>
              <div className="absolute inset-0 pattern-diagonal opacity-5"></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-3">
                  <span className="terminal-invert-sm font-mono uppercase">LIVE</span>
                  <ShieldCheck weight="bold" className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tighter leading-[0.95]">
                  Live<br />Dashboard
                </h3>
              </div>
              <div className="relative z-10 font-mono text-xs text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full status-active"></span>
                Map • Incidents • Analytics
              </div>
            </div>
          </Link>

          {/* Pipeline Card */}
          <Link
            href="/pipeline"
            className="nav-card sm:col-span-1 md:col-span-2 relative group block h-full"
          >
            <div className="border-4 border-neo-border bg-white p-4 sm:p-6 shadow-neo min-h-[180px] sm:min-h-[200px] h-full flex flex-col justify-between transition-all duration-300 group-hover:translate-x-[3px] group-hover:translate-y-[3px] group-hover:shadow-none relative overflow-hidden">
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 21px), repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 21px)' }}></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <span className="terminal-invert font-mono text-xs">03</span>
                  <Terminal weight="bold" className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tighter leading-[0.9]">
                  Data<span className="text-primary">Pipeline</span>
                </h3>
              </div>
              <p className="relative z-10 font-mono text-sm text-gray-500 uppercase tracking-widest">
                Dataset • Features • Models
              </p>
            </div>
          </Link>

          {/* IST Clock Card */}
          <div className="nav-card col-span-1 md:col-span-2 relative h-full">
            <div className="border-4 border-neo-border bg-neo-text p-4 sm:p-5 shadow-[5px_5px_0px_0px_#9FE870] min-h-[180px] sm:min-h-[200px] h-full flex flex-col justify-between relative overflow-hidden">
              <div className="relative z-10">
                <p className="font-mono text-[10px] text-gray-200 uppercase tracking-widest mb-1">SYSTEM TIME • GMT+5:30 • 24H</p>
              </div>
              <div className="relative z-10 flex-1 flex items-center justify-center">
                <ISTClock />
              </div>
            </div>
          </div>

          {/* Full Width Bottom Bar */}
          <Link
            href="/dashboard"
            className="nav-card sm:col-span-2 md:col-span-6 relative group"
          >
            <div className="border-4 border-neo-border bg-white px-4 sm:px-8 py-4 sm:py-6 shadow-neo flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300 group-hover:translate-x-[3px] group-hover:translate-y-[3px] group-hover:shadow-none group-hover:bg-primary">
              <div className="flex items-center gap-3 sm:gap-6">
                <Brain className="w-10 h-10 sm:w-16 sm:h-16" />
                <div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter">Ready to Deploy</h3>
                  <p className="font-mono text-sm text-gray-500 group-hover:text-neo-text/70 transition-colors">Launch the live dashboard — Map, Incidents, Anomaly Monitor, and Action Plans.</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4">
                  <ArrowRight weight="bold" className="w-8 h-8" />
              </div>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
