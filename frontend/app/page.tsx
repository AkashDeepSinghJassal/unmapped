import Link from "next/link";

const STATS = [
  { value: "13,000+", label: "ESCO skills indexed" },
  { value: "3", label: "AI agents" },
  { value: "Real", label: "Econometric data" },
  { value: "Open", label: "Infrastructure" },
];

const TALENT_FEATURES = [
  { icon: "⬡", text: "Skill radar across 6 competency dimensions" },
  { icon: "⚡", text: "Automation risk (Frey-Osborne / ILO)" },
  { icon: "🌍", text: "Regional labour market comparison" },
  { icon: "💼", text: "Matched opportunities with real wage signals" },
  { icon: "📈", text: "Reskilling pathway recommendations" },
  { icon: "🎯", text: "Interactive what-if skill simulation" },
];

const POLICY_FEATURES = [
  { icon: "🗺", text: "Skill risk maps by occupation group" },
  { icon: "🔵", text: "Skill cluster analysis" },
  { icon: "↔️", text: "Skill-job mismatch indicators" },
  { icon: "📊", text: "Econometric insights (WB Data360 + ILOSTAT)" },
  { icon: "👥", text: "Talent pool discovery by region" },
  { icon: "🤖", text: "AI-generated policy recommendations" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Describe your background",
    desc: "Chat with our AI advisor or fill a quick form. Describe your education, work history, and self-taught skills — formal or informal.",
    color: "blue",
  },
  {
    step: "02",
    title: "AI maps your skills",
    desc: "Three AI agents cross-reference your description against the ESCO taxonomy (13,000+ skills) and assign ISCO occupation codes.",
    color: "cyan",
  },
  {
    step: "03",
    title: "Get grounded insights",
    desc: "See your automation risk, matched opportunities with real wage data, and a personalised reskilling path — all backed by World Bank data.",
    color: "emerald",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">

      {/* ── Hero ── */}
      <section className="py-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)]" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1.5 text-xs text-blue-400 mb-6">
            World Bank Youth Summit · HackNation 5
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-5 tracking-tight leading-tight">
            Skills without borders.
            <br />
            <span className="bg-linear-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Opportunity without limits.
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            AI infrastructure that maps invisible youth skills to real economic outcomes —
            grounded in ESCO, ILOSTAT, and World Bank data. Country-agnostic. Explainable. Open.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/chat"
              className="px-7 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30">
              Start with AI Chat →
            </Link>
            <Link href="/dashboard"
              className="px-7 py-3 border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white rounded-xl transition-all text-sm">
              Policy Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div className="border-y border-gray-800 py-6 mb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two dashboard cards ── */}
      <section className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6 mb-20 px-2">

        {/* Talent card */}
        <div className="relative bg-gray-900 border border-gray-800 rounded-3xl p-8 hover:border-blue-500/50 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full -translate-y-1/4 translate-x-1/4 group-hover:bg-blue-500/10 transition-all" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-5 text-2xl">
              🧭
            </div>
            <div className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 text-xs text-blue-400 mb-3">
              For Youth &amp; Job Seekers
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Talent Dashboard</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Discover your hidden competencies, understand automation risk, and get matched
              to real opportunities backed by econometric signals.
            </p>
            <ul className="space-y-2.5 mb-8">
              {TALENT_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-2.5 text-sm text-gray-400">
                  <span className="text-base shrink-0">{f.icon}</span>
                  {f.text}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Link href="/chat"
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors text-center text-sm">
                Chat with AI →
              </Link>
              <Link href="/start"
                className="px-4 py-3 border border-gray-700 text-gray-400 hover:border-gray-600 rounded-xl transition-colors text-sm">
                Quick form
              </Link>
            </div>
          </div>
        </div>

        {/* Policy card */}
        <div className="relative bg-gray-900 border border-gray-800 rounded-3xl p-8 hover:border-purple-500/50 transition-all overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full -translate-y-1/4 translate-x-1/4 group-hover:bg-purple-500/10 transition-all" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-5 text-2xl">
              🏛
            </div>
            <div className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 text-xs text-purple-400 mb-3">
              For Policymakers &amp; Institutions
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Policy Dashboard</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Country-level labour market intelligence for evidence-based workforce policy,
              talent discovery, and strategic skills investment.
            </p>
            <ul className="space-y-2.5 mb-8">
              {POLICY_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-2.5 text-sm text-gray-400">
                  <span className="text-base shrink-0">{f.icon}</span>
                  {f.text}
                </li>
              ))}
            </ul>
            <Link href="/dashboard"
              className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors text-center text-sm">
              View Policy Dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto mb-20 px-2">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">How it works</h2>
          <p className="text-gray-500 text-sm">Three steps from description to economic insight</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.step} className="relative">
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="hidden md:block absolute top-6 left-full w-full h-px bg-linear-to-r from-gray-700 to-transparent z-10 -translate-x-4" />
              )}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className={`text-xs font-mono font-bold mb-3 text-${step.color}-400`}>{step.step}</div>
                <h3 className="font-semibold text-white mb-2 text-sm">{step.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Data sources ── */}
      <section className="max-w-4xl mx-auto pb-8 px-2">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-wrap items-center gap-4">
          <span className="text-xs text-gray-500 shrink-0">Grounded in real data:</span>
          {["ESCO v1.2.1 · 13k skills", "World Bank Data360", "World Bank WDI", "Frey-Osborne (2013)", "ILOSTAT"].map((s) => (
            <span key={s} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-gray-400">
              {s}
            </span>
          ))}
        </div>
      </section>

    </div>
  );
}
