'use client';

import { useRef, useState, useEffect } from 'react';

const ArrowIcon = () => (
  <svg
    width="10"
    height="16"
    viewBox="0 0 10 16"
    fill="none"
    aria-hidden="true"
    className="transition-transform duration-300 group-hover:translate-x-[4px]"
  >
    <path
      d="M1.5 1.5L8 8L1.5 14.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BrainIcon = () => (
  <svg className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
  </svg>
);

const FolderIcon = () => (
  <svg className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

export default function GrowthMetrics() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && isMountedRef.current) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(node);

    return () => {
      isMountedRef.current = false;
      observer.disconnect();
    };
  }, []);

  const revealBase = `transition-[opacity,transform] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-[22px] opacity-0'}`;

  return (
    <section 
      ref={sectionRef}
      className="safari-paint-section relative overflow-hidden bg-[#101010] py-[80px] font-body"
      id="growth" 
      aria-label="Growth and Insights"
    >
      {/* Three Background Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[37.2%] top-[-30px] h-[1096px] w-[1833px] opacity-[0.17]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,126,255,0.8) 0%, rgba(0,126,255,0) 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-7px] left-[-86px] h-[595px] w-[995px] opacity-[0.17]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,126,255,0.8) 0%, rgba(0,126,255,0) 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-288px] top-[27px] h-[681px] w-[401px] opacity-[0.17]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,126,255,0.8) 0%, rgba(0,126,255,0) 72%)',
        }}
      />

      <div className="site-shell relative z-10 px-0 pb-[40px] pt-[40px] max-[1024px]:pb-[20px] max-[1024px]:pt-[20px]">
        
        {/* Main Grid */}
        <div className="grid min-w-0 grid-cols-[minmax(0,0.97fr)_minmax(0,1.03fr)] gap-x-[clamp(32px,3.333vw,64px)] max-[1024px]:grid-cols-1 max-[1024px]:gap-y-[64px]">
          
          {/* Left Column: Heading Area */}
          <div className="min-w-0 pt-[7px] max-[1024px]:pt-0">
            {/* Label */}
            <div className={`flex items-center gap-2 mb-6 ${revealBase} delay-0`}>
              <span className="w-1.5 h-1.5 bg-[#E6FF2A] shrink-0" />
              <span className="text-[#E6FF2A] text-[10px] font-normal tracking-widest uppercase">INSIGHT AND PROGRAMS</span>
            </div>

            <h2 className={`m-0 max-w-[740px] text-[clamp(40px,3.33vw,64px)] font-semibold leading-tight min-[1440px]:leading-[79px] text-[#F7F7F7] ${revealBase} delay-[80ms]`}>
              Insights That Drive
              <br />
              Measurable Growth
            </h2>

            <p className={`mt-[24px] max-w-[580px] text-[clamp(12px,1vw,14px)] font-extralight leading-relaxed min-[1440px]:leading-[24px] text-[#F7F7F7] ${revealBase} delay-[160ms]`}>
              Discover how integrated technology, intelligence, and media transform business challenges into measurable enterprise outcomes through proven workflows, strategic leadership, and real-world execution.
            </p>
          </div>

          {/* Right Column: Cards Area */}
          <div className="flex min-w-0 flex-col gap-[20px]">
            
            {/* Card 1 */}
            <div className={`group relative h-auto w-full overflow-hidden rounded-[20px] border border-[#F5F5F5]/50 p-[16px] transition-[border-color,box-shadow] duration-500 hover:border-[#E6FF2A]/70 hover:shadow-[0_14px_38px_rgba(0,0,0,0.22)] lg:p-[20px] ${revealBase} delay-[120ms]`} style={{ background: 'linear-gradient(143deg, rgba(16,16,16,0.78) 10%, rgba(41,54,66,0.72) 100%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_15%,rgba(171,185,197,0.38)_100%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              
              <div className="relative z-10 flex flex-col items-start pr-[60px] min-[768px]:pr-[70px]">
                <h3 className="text-[clamp(24px,1.8vw,32px)] font-medium leading-tight tracking-[-0.025em] text-[#F5F5F5] transition-colors duration-300 group-hover:text-[#E6FF2A]">
                  How We Lead Differently
                </h3>

                <p className="mt-[8px] text-[13px] font-extralight leading-[18px] text-[#F7F7F7]">
                  Discover the leadership philosophy behind resilient enterprise execution.
                </p>

                <a href="/insight-programs/leadership-thoughts" className="mt-[8px] inline-flex h-[40px] items-center gap-[10px] rounded-full bg-[#E6FF2A] px-[16px] text-[12px] font-bold tracking-[-0.015em] text-[#101010] no-underline transition-[background-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:bg-[#FBFCDC]">
                  LEADERSHIP THOUGHTS
                  <ArrowIcon />
                </a>
              </div>

              <div className="absolute right-[16px] top-[16px] flex h-[44px] w-[44px] items-center justify-center rounded-[8px] border border-[#F5F5F5]/50 text-[#F5F5F5] transition-[border-color,background-color,color] duration-300 group-hover:border-[#F5F5F5]/80 group-hover:bg-white/15 group-hover:text-[#E6FF2A] lg:right-[20px] lg:top-[20px]">
                <BrainIcon />
              </div>
            </div>

            {/* Card 2 */}
            <div className={`group relative h-auto w-full overflow-hidden rounded-[20px] border border-[#F5F5F5]/50 p-[16px] transition-[border-color,box-shadow] duration-500 hover:border-[#E6FF2A]/70 hover:shadow-[0_14px_38px_rgba(0,0,0,0.22)] lg:p-[20px] ${revealBase} delay-[220ms]`} style={{ background: 'linear-gradient(143deg, rgba(16,16,16,0.78) 10%, rgba(41,54,66,0.72) 100%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_15%,rgba(171,185,197,0.38)_100%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              
              <div className="relative z-10 flex flex-col items-start pr-[60px] min-[768px]:pr-[70px]">
                <h3 className="text-[clamp(24px,1.8vw,32px)] font-medium leading-tight tracking-[-0.025em] text-[#F5F5F5] transition-colors duration-300 group-hover:text-[#E6FF2A]">
                  Read Our Proven Work
                </h3>

                <p className="mt-[8px] text-[13px] font-extralight leading-[18px] text-[#F7F7F7]">
                  Explore proven outcomes across the Arsalynk ecosystem.
                </p>

                <a href="/insight-programs/case-studies" className="mt-[8px] inline-flex h-[40px] items-center gap-[10px] rounded-full bg-[#E6FF2A] px-[16px] text-[12px] font-bold tracking-[-0.015em] text-[#101010] no-underline transition-[background-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:bg-[#FBFCDC]">
                  CASE STUDIES
                  <ArrowIcon />
                </a>
              </div>

              <div className="absolute right-[16px] top-[16px] flex h-[44px] w-[44px] items-center justify-center rounded-[8px] border border-[#F5F5F5]/50 text-[#F5F5F5] transition-[border-color,background-color,color] duration-300 group-hover:border-[#F5F5F5]/80 group-hover:bg-white/15 group-hover:text-[#E6FF2A] lg:right-[20px] lg:top-[20px]">
                <FolderIcon />
              </div>
            </div>
          </div>

        </div>

        {/* Stats Section */}
        <div className="mt-[48px] max-[639px]:mt-[42px]">
          {/* Label */}
          <div className={`flex items-center gap-2 mb-[16px] max-[639px]:mb-[20px] max-[639px]:justify-center ${revealBase} delay-[280ms]`}>
            <span className="w-1.5 h-1.5 bg-[#94A3B8] shrink-0 max-[639px]:bg-[#F7F7F7]" />
            <span className="text-[#94A3B8] text-[10px] font-bold tracking-widest uppercase max-[639px]:text-[14px] max-[639px]:text-[#F7F7F7]">OUR PROVEN RECORDS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-8 max-[639px]:gap-y-0 lg:gap-y-0">
            {[
              { value: "50+", label: "Enterprise Projects" },
              { value: "10+", label: "Industry Sectors" },
              { value: "7+",  label: "Specialized Company" },
              { value: "25+", label: "Digital Solutions Delivered" },
            ].map((stat, index) => (
              <div 
                key={index} 
                className={`relative px-[24px] py-[36px] flex flex-col justify-center max-[1024px]:py-4 max-[639px]:grid max-[639px]:min-h-[110px] max-[639px]:grid-cols-[46%_54%] max-[639px]:items-center max-[639px]:border-b max-[639px]:border-white/70 max-[639px]:px-0 max-[639px]:py-[18px] ${index === 0 ? 'pl-[24px] max-[1024px]:pl-0' : ''} ${revealBase}`}
                style={{ transitionDelay: `${350 + (index * 70)}ms` }}
              >
                {/* Desktop Separator */}
                {index > 0 && (
                  <span aria-hidden="true" className="absolute bottom-[0px] left-0 top-[0px] w-px bg-white/[0.18] max-[1024px]:hidden" />
                )}
                {/* Tablet Separator */}
                {index > 0 && index % 2 !== 0 && (
                  <span aria-hidden="true" className="absolute bottom-[0px] left-0 top-[0px] w-px bg-white/[0.18] hidden sm:block lg:hidden" />
                )}
                
                <div className="flex items-center gap-[10px] max-[639px]:gap-[14px] max-[639px]:pl-[22px]">
                  <span className="h-[8px] w-[8px] shrink-0 bg-[#E6FF2A] max-[639px]:h-[6px] max-[639px]:w-[16px]" />
                  <span className="text-[clamp(48px,5vw,72px)] font-heading font-normal leading-none tracking-tight text-[#E6FF2A] max-[639px]:text-[64px]">
                    {stat.value}
                  </span>
                </div>
                <div className="mt-[10px] text-[14px] min-[1440px]:text-[16px] font-extralight leading-relaxed text-[#F7F7F7] max-[639px]:mt-0 max-[639px]:max-w-[135px] max-[639px]:pr-[12px] max-[639px]:text-[18px] max-[639px]:leading-[1.3]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}