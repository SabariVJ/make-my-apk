import { createFileRoute } from "@tanstack/react-router";

const APK_URL = "https://github.com/SabariVJ/make-my-apk/releases/latest/download/svj.apk";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "SVJ — Build a Life That Shows" },
      {
        name: "description",
        content:
          "Daily discipline challenges, real stat tracking, 60-day transformation. Download SVJ and start your journey.",
      },
    ],
  }),
  component: LandingPage,
});

const ATTRIBUTES = [
  { name: "Physical", color: "#10B981", desc: "Track workouts, reps and physical progress" },
  { name: "Ambition", color: "#A855F7", desc: "Set goals and crush them daily" },
  { name: "Intellect", color: "#F59E0B", desc: "Grow knowledge through focused learning" },
  { name: "Mental", color: "#EAB308", desc: "Build resilience and mental clarity" },
  { name: "Social", color: "#3B82F6", desc: "Connect with the SVJ community" },
  { name: "Discipline", color: "#F43F5E", desc: "Consistency is your superpower" },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED]">
      {/* Navigation */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-white/[0.06] bg-[#0B0B0C]/85 px-6 py-4 backdrop-blur-md">
        <div className="font-anton text-xl tracking-wide">SVJ</div>
        <a
          href={APK_URL}
          download="SVJ.apk"
          className="svj-radius-row bg-[#C81E3A] px-5 py-2 font-inter text-sm font-semibold text-white transition-colors hover:bg-[#A0182E]"
        >
          Download APK
        </a>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(200,30,58,0.18),transparent_70%)]" />
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <p className="font-inter text-[11px] font-semibold tracking-[0.18em] text-[#C9A227]">
            THE PERFORMANCE OS
          </p>
          <h1 className="mt-4 font-anton text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            Build a life
            <br />
            <span className="text-[#8C8C90]">that shows</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md font-inter text-lg text-[#A6A6AD]">
            Daily discipline challenges, real stat tracking and a 60-day transformation. Your
            character hexagon awaits.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href={APK_URL}
              download="SVJ.apk"
              className="svj-radius-row bg-[#C81E3A] px-8 py-4 font-inter font-semibold text-white transition-colors hover:bg-[#A0182E]"
            >
              Download APK
            </a>
            <a
              href="#how-it-works"
              className="svj-radius-row border border-white/10 px-8 py-4 font-inter text-[#F4F2ED] transition-colors hover:bg-white/5"
            >
              See how it works
            </a>
          </div>
        </div>
        <a
          href="#how-it-works"
          aria-label="Scroll to how it works"
          className="absolute bottom-10 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </a>
      </section>

      {/* Character Matrix */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-anton text-4xl tracking-tight sm:text-5xl">Your character matrix</h2>
          <p className="mx-auto mt-4 max-w-xl font-inter text-[#A6A6AD]">
            Six stats, one evolving character. Every completed action updates your matrix in real
            time.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-3 px-6 sm:grid-cols-2">
          {ATTRIBUTES.map((stat) => (
            <div
              key={stat.name}
              className="svj-radius-card svj-lit-top flex items-center gap-4 border border-white/[0.06] bg-[#17171A] p-5"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center svj-radius-row"
                style={{ backgroundColor: `${stat.color}1F`, border: `1px solid ${stat.color}66` }}
              >
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stat.color }} />
              </div>
              <div>
                <h3 className="font-inter text-base font-semibold" style={{ color: stat.color }}>
                  {stat.name}
                </h3>
                <p className="font-inter text-sm text-[#8C8C90]">{stat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 60-Day Challenge */}
      <section className="border-y border-white/[0.06] bg-[#101014] py-24">
        <div className="mx-auto max-w-4xl px-6">
          <p className="font-inter text-[11px] font-semibold tracking-[0.18em] text-[#C9A227]">
            The program
          </p>
          <h2 className="mt-3 font-anton text-4xl tracking-tight sm:text-5xl">60-day challenge</h2>
          <p className="mt-6 max-w-2xl font-inter text-lg text-[#A6A6AD]">
            A structured pathway with server-confirmed progress, milestone tracking and an
            end-of-journey reward code that unlocks SVJ Plus for two months. Every day counts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["60 days", "Server confirmed", "Reward code", "Plus unlocked"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-[#0B0B0C] px-4 py-2 font-inter text-sm text-[#A6A6AD]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-anton text-4xl tracking-tight sm:text-5xl">Start your journey</h2>
          <p className="mt-6 font-inter text-lg text-[#A6A6AD]">
            Download the APK and begin your 60-day transformation. Sideloading required — Android
            only.
          </p>
          <a
            href={APK_URL}
            download="SVJ.apk"
            className="mt-10 inline-flex items-center gap-3 svj-radius-row bg-[#C81E3A] px-10 py-5 font-inter text-lg font-bold text-white transition-colors hover:bg-[#A0182E]"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download APK
          </a>
          <p className="mt-6 font-inter text-sm text-[#8C8C90]">
            Android 8.0+ required. Enable "Install unknown apps" in Settings → Security.
          </p>
          <p className="mt-4 font-inter text-sm text-[#8C8C90]">Play Store: coming soon</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="font-anton text-xl tracking-wide">SVJ</div>
          <div className="flex gap-6 font-inter text-sm text-[#8C8C90]">
            <a href="/privacy" className="transition-colors hover:text-[#F4F2ED]">
              Privacy
            </a>
            <a href="/terms" className="transition-colors hover:text-[#F4F2ED]">
              Terms
            </a>
            <a
              href="mailto:sabarivj777@gmail.com"
              className="transition-colors hover:text-[#F4F2ED]"
            >
              Contact
            </a>
          </div>
          <p className="font-inter text-sm text-[#8C8C90]">© 2026 SVJ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
