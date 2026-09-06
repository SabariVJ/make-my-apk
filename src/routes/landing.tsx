import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "SVJ — Build a Life That Shows" },
      { name: "description", content: "Daily discipline challenges, real stat tracking, 60-day transformation. Download SVJ and start your journey." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0E1A] text-[#F2F4F8]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between bg-[#0A0E1A]/80 backdrop-blur-md border-b border-white/5">
        <div className="font-sans text-xl font-bold tracking-tight">SVJ</div>
        <a
          href="https://github.com/SabariVJ/make-my-apk/releases/latest/download/svj.apk"
          download="SVJ.apk"
          className="px-5 py-2 bg-[#FB7185] text-[#0A0E1A] font-medium text-sm rounded-full hover:bg-[#FB7185]/90 transition-colors"
        >
          Download APK
        </a>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center relative px-6 pt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-[#12172A] to-[#0A0E1A] opacity-50" />
        <div className="relative z-10 text-center max-w-2xl mx-auto">
          <h1 className="font-sans text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-6">
            Build a Life
            <br />
            <span className="text-[#8892A8]">That Shows</span>
          </h1>
          <p className="text-[#8892A8] text-lg md:text-xl mb-10 max-w-md mx-auto">
            Daily discipline challenges, real stat tracking, 60-day transformation. Your character hexagon awaits.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/SabariVJ/make-my-apk/releases/latest/download/svj.apk"
              download="SVJ.apk"
              className="px-8 py-4 bg-[#FB7185] text-[#0A0E1A] font-semibold rounded-full hover:bg-[#FB7185]/90 transition-all hover:scale-105"
            >
              Download APK
            </a>
            <a
              href="#how-it-works"
              className="px-8 py-4 border border-white/10 text-[#F2F4F8] rounded-full hover:bg-white/5 transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-[#8892A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* Stats Section */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-sans text-4xl md:text-5xl font-bold text-center mb-4">
            Your Character Hexagon
          </h2>
          <p className="text-[#8892A8] text-center mb-12 max-w-xl mx-auto">
            Six stats, one evolving character. Each completed action updates your hexagon in real time.
          </p>
        </div>
        {[
          { name: 'Physical', color: '#34D399', desc: 'Track workouts, reps, and physical progress' },
          { name: 'Ambition', color: '#A78BFA', desc: 'Set goals and crush them daily' },
          { name: 'Intellect', color: '#FBBF24', desc: 'Grow knowledge through focused learning' },
          { name: 'Mental', color: '#FDE047', desc: 'Build resilience and mental clarity' },
          { name: 'Social', color: '#60A5FA', desc: 'Connect with the SVJ community' },
          { name: 'Discipline', color: '#FB7185', desc: 'Consistency is your superpower' },
        ].map((stat) => (
          <div key={stat.name} className="py-16 border-b border-white/5">
            <div className="max-w-4xl mx-auto px-6 flex items-center gap-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${stat.color}20`, border: `1px solid ${stat.color}` }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stat.color }} />
              </div>
              <div>
                <h3 className="font-sans text-2xl font-bold mb-2" style={{ color: stat.color }}>
                  {stat.name}
                </h3>
                <p className="text-[#8892A8]">{stat.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 60-Day Challenge */}
      <section className="py-24 bg-[#12172A]/50">
        <div className="max-w-4xl mx-auto px-6 text-left">
          <span className="text-[#A78BFA] font-mono text-sm tracking-wider uppercase">The Program</span>
          <h2 className="font-sans text-4xl md:text-5xl font-bold mt-4 mb-6">
            60-Day Challenge
          </h2>
          <p className="text-[#8892A8] text-lg mb-8 max-w-2xl">
            A structured pathway with server-confirmed progress, milestone tracking, and an end-of-journey reward code that unlocks SVJ Plus for two months. Every day counts.
          </p>
          <div className="flex flex-wrap gap-3">
            {['60 Days', 'Server Confirmed', 'Reward Code', 'Plus Unlocked'].map((tag) => (
              <span
                key={tag}
                className="px-4 py-2 bg-[#0A0E1A] border border-white/10 rounded-full text-sm text-[#8892A8]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="py-24 bg-[#12172A]/50">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-sans text-4xl md:text-5xl font-bold mb-6">
            Start Your Journey
          </h2>
          <p className="text-[#8892A8] text-lg mb-10">
            Download the APK and begin your 60-day transformation. Sideloading required — Android only.
          </p>
          <a
            href="https://github.com/SabariVJ/make-my-apk/releases/latest/download/svj.apk"
            download="SVJ.apk"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#FB7185] text-[#0A0E1A] font-bold text-lg rounded-full hover:bg-[#FB7185]/90 transition-all hover:scale-105 mb-6"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download APK
          </a>
          <p className="text-[#8892A8] text-sm">
            Android 8.0+ required. Enable "Install unknown apps" in Settings → Security.
          </p>
          <p className="text-[#8892A8] text-sm mt-4">
            Play Store: Coming Soon
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-sans text-xl font-bold">SVJ</div>
          <div className="flex gap-6 text-sm text-[#8892A8]">
            <a href="#" className="hover:text-[#F2F4F8] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#F2F4F8] transition-colors">Terms</a>
            <a href="mailto:contact@savaje.com" className="hover:text-[#F2F4F8] transition-colors">Contact</a>
          </div>
          <p className="text-[#8892A8] text-sm">© 2026 SVJ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
