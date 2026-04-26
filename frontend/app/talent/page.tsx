"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import { getDashboard, type ProfileResponse, type Opportunity } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "risk" | "opportunities" | "simulate";
type OppFilter = "all" | "formal_job" | "gig" | "self_employment" | "training";

// ── Constants ────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Profile & Skills" },
  { id: "risk",          label: "Automation Risk" },
  { id: "opportunities", label: "Opportunities" },
  { id: "simulate",      label: "Simulate" },
];

const OPP_FILTERS: { id: OppFilter; label: string; color: string }[] = [
  { id: "all",             label: "All",            color: "gray"    },
  { id: "formal_job",      label: "Formal Job",     color: "blue"    },
  { id: "gig",             label: "Gig / Freelance", color: "yellow" },
  { id: "self_employment", label: "Self-Employment", color: "emerald" },
  { id: "training",        label: "Training",        color: "purple"  },
];

const OPP_BADGE: Record<string, string> = {
  formal_job:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
  gig:             "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  self_employment: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  training:        "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const ISCO_LABELS: Record<number, string> = {
  1: "Managers", 2: "Professionals", 3: "Technicians",
  4: "Clerical Workers", 5: "Service & Sales", 6: "Agricultural",
  7: "Craft & Trades", 8: "Operators", 9: "Elementary",
};

const COMPETENCY_DIMS = [
  { subject: "Technical",   keywords: ["technical", "repair", "install", "maintain", "engineer", "build", "hardware"] },
  { subject: "Digital",     keywords: ["digital", "computer", "software", "data", "code", "web", "ict", "programme"] },
  { subject: "Communication", keywords: ["communicat", "language", "teach", "train", "present", "writ", "counsel"] },
  { subject: "Problem Solving", keywords: ["problem", "analy", "critical", "decision", "plan", "strateg", "diagnos"] },
  { subject: "Business",    keywords: ["business", "manag", "finance", "sales", "market", "entrepreneur", "account"] },
  { subject: "Trade Skills", keywords: ["craft", "agricult", "construct", "trade", "cook", "sew", "drive", "weld"] },
];

const RADAR_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f87171", "#a78bfa"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function deriveRadar(skills: { label: string; why?: string; confidence: number }[]) {
  return COMPETENCY_DIMS.map((dim, i) => {
    const matches = skills.filter((s) =>
      dim.keywords.some(
        (kw) => s.label.toLowerCase().includes(kw) || (s.why ?? "").toLowerCase().includes(kw)
      )
    );
    const raw = matches.length
      ? matches.reduce((sum, s) => sum + s.confidence, 0) / matches.length
      : 0.2 + (i * 0.07) % 0.3;
    return { subject: dim.subject, value: Math.round(raw * 100), fullMark: 100 };
  });
}

function riskLevel(prob: number) {
  if (prob > 0.65) return { label: "High Risk",   color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30"    };
  if (prob > 0.35) return { label: "Medium Risk", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" };
  return                  { label: "Low Risk",    color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/30" };
}

// ── Automation Gauge (SVG arc) ────────────────────────────────────────────────
function AutomationGauge({ probability }: { probability: number }) {
  const pct   = Math.min(100, Math.round(probability * 100));
  const angle = (pct / 100) * 180;
  const r     = 70;
  const cx    = 100; const cy = 90;
  const toRad = (deg: number) => (deg - 180) * (Math.PI / 180);
  const arcX  = (deg: number) => cx + r * Math.cos(toRad(deg));
  const arcY  = (deg: number) => cy + r * Math.sin(toRad(deg));
  const needleX = cx + (r - 10) * Math.cos(toRad(angle));
  const needleY = cy + (r - 10) * Math.sin(toRad(angle));
  const color   = pct > 65 ? "#ef4444" : pct > 35 ? "#f59e0b" : "#22c55e";

  return (
    <svg width="200" height="110" viewBox="0 0 200 110" className="mx-auto">
      {/* Track */}
      <path d={`M ${arcX(0)} ${arcY(0)} A ${r} ${r} 0 0 1 ${arcX(180)} ${arcY(180)}`}
        fill="none" stroke="#374151" strokeWidth="14" strokeLinecap="round" />
      {/* Progress */}
      {pct > 0 && (
        <path d={`M ${arcX(0)} ${arcY(0)} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX(angle)} ${arcY(angle)}`}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="white" />
      {/* Labels */}
      <text x="28"  y="108" fill="#6b7280" fontSize="10">0%</text>
      <text x="160" y="108" fill="#6b7280" fontSize="10">100%</text>
      {/* Center value */}
      <text x={cx} y={cy - 18} textAnchor="middle" fill={color} fontSize="20" fontWeight="bold">{pct}%</text>
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TalentPage() {
  const router = useRouter();
  const [result, setResult]       = useState<ProfileResponse | null>(null);
  const [tab, setTab]             = useState<Tab>("overview");
  const [oppFilter, setOppFilter] = useState<OppFilter>("all");
  const [autoData, setAutoData]   = useState<{ isco_major_group: number; avg_automation_prob: number }[]>([]);
  const [simSkills, setSimSkills] = useState<Record<string, boolean>>({});

  // Load session data
  useEffect(() => {
    const raw = sessionStorage.getItem("unmapped_result");
    if (!raw) { router.push("/"); return; }
    const r = JSON.parse(raw) as ProfileResponse;
    setResult(r);
    const initialSim: Record<string, boolean> = {};
    r.passport?.mapped_skills?.forEach((s) => { initialSim[s.label] = true; });
    setSimSkills(initialSim);
  }, [router]);

  // Load automation data
  useEffect(() => {
    if (!result) return;
    const cc = result.passport?.country || "GHA";
    getDashboard(cc).then((d) => {
      setAutoData(d.charts?.automation_risk ?? []);
    }).catch(() => {});
  }, [result]);

  const radarData     = useMemo(() => deriveRadar(result?.passport?.mapped_skills ?? []), [result]);
  const userAutoRisk  = autoData.find((r) => r.isco_major_group === result?.passport?.isco_major_group);
  const risk          = riskLevel(userAutoRisk?.avg_automation_prob ?? 0);
  const filteredOpps  = (result?.opportunities?.opportunities ?? []).filter(
    (o) => oppFilter === "all" || o.type === oppFilter
  );
  const simRadar      = useMemo(() => {
    const active = (result?.passport?.mapped_skills ?? []).filter((s) => simSkills[s.label] !== false);
    return deriveRadar(active);
  }, [result, simSkills]);
  const simFitAvg     = filteredOpps.length
    ? Math.round(filteredOpps.filter((o) => (result?.passport?.mapped_skills?.some((s) => simSkills[s.label] !== false))).reduce((sum, o) => sum + o.fit_score, 0) / filteredOpps.length * 10) / 10
    : 0;

  const autoBarData = autoData.map((r) => ({
    name: ISCO_LABELS[r.isco_major_group] ?? `Group ${r.isco_major_group}`,
    risk: Math.round(r.avg_automation_prob * 100),
    isUser: r.isco_major_group === result?.passport?.isco_major_group,
  }));

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-gray-500">No profile found.</div>
        <a href="/chat" className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white">Start with Chat →</a>
      </div>
    );
  }

  const { passport, opportunities } = result;

  return (
    <div className="max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1 text-xs text-blue-400 mb-2">
            Talent Dashboard
          </div>
          <h1 className="text-2xl font-bold text-white">{passport?.isco_label ?? "Skills Profile"}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {passport?.education_level} · {passport?.country}
            {userAutoRisk && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs border ${risk.bg} ${risk.color} ${risk.border}`}>
                {risk.label}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => router.push("/chat")}
          className="text-xs border border-gray-700 text-gray-400 hover:border-gray-600 rounded-lg px-3 py-2 transition-colors shrink-0">
          ← New profile
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: Profile & Skills
      ══════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Profile summary + ISCO badge */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400 font-bold text-xl shrink-0">
                  {passport?.isco_major_group}
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">ISCO-08 Occupational Group</div>
                  <div className="font-semibold text-white text-lg">{passport?.isco_label}</div>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{passport?.profile_summary}</p>
            </div>
            {/* Quick stats */}
            <div className="space-y-3">
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{passport?.mapped_skills?.length ?? 0}</div>
                <div className="text-xs text-gray-500 mt-1">Skills mapped</div>
              </div>
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{opportunities?.opportunities?.length ?? 0}</div>
                <div className="text-xs text-gray-500 mt-1">Opportunities found</div>
              </div>
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${risk.color}`}>
                  {userAutoRisk ? `${Math.round(userAutoRisk.avg_automation_prob * 100)}%` : "–"}
                </div>
                <div className="text-xs text-gray-500 mt-1">Automation risk</div>
              </div>
            </div>
          </div>

          {/* Skill Radar + skill bars */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-sm font-medium text-gray-300 mb-1">Competency Radar</div>
              <div className="text-xs text-gray-600 mb-4">Derived from ESCO skill mapping</div>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} />
                  <Radar name="Skills" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip formatter={(v) => [`${v}%`, "Competency"]}
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-sm font-medium text-gray-300 mb-4">Mapped Skills · Confidence</div>
              <div className="space-y-3">
                {passport?.mapped_skills?.slice(0, 6).map((skill) => (
                  <div key={skill.uri}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300 truncate mr-2">{skill.label}</span>
                      <span className="text-gray-500 shrink-0">{Math.round(skill.confidence * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-500"
                        style={{ width: `${skill.confidence * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Adjacent skills */}
          {passport?.adjacent_skills?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
                Recommended Next Skills
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {passport.adjacent_skills.map((s, i) => (
                  <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="text-sm font-medium text-white">{s.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">{s.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: Automation Risk
      ══════════════════════════════════════════════════════════ */}
      {tab === "risk" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Gauge */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-6 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-300 mb-1 self-start">Your Automation Exposure</div>
              <div className="text-xs text-gray-600 mb-4 self-start">
                ISCO-{passport?.isco_major_group} · {passport?.isco_label}
              </div>
              <AutomationGauge probability={userAutoRisk?.avg_automation_prob ?? 0} />
              <div className={`mt-4 px-4 py-2 rounded-xl border text-sm font-medium ${risk.bg} ${risk.color} ${risk.border}`}>
                {risk.label} · Frey-Osborne (2013)
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center leading-relaxed max-w-xs">
                {(userAutoRisk?.avg_automation_prob ?? 0) > 0.5
                  ? "More than half the tasks in your occupation group are susceptible to automation. Reskilling toward digital and problem-solving competencies is strongly recommended."
                  : "Your occupation group shows below-average automation exposure. Focus on deepening your current skills and building adjacent competencies."}
              </p>
            </div>

            {/* All ISCO groups bar */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-sm font-medium text-gray-300 mb-1">Risk by Occupation Group</div>
              <div className="text-xs text-gray-600 mb-4">Your group highlighted · Frey & Osborne (2013)</div>
              {autoBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={autoBarData} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                    <Tooltip formatter={(v) => [`${v}%`, "Automation probability"]}
                      contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="risk" radius={[0, 4, 4, 0]}>
                      {autoBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.isUser ? "#6366f1" : "#374151"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Loading data…</div>}
            </div>
          </div>

          {/* Reskilling path */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
            <div className="text-sm font-medium text-gray-300 mb-4">Your Reskilling Pathway</div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <div className="text-xs text-red-400 font-medium mb-2 uppercase tracking-wider">At-Risk Tasks</div>
                <ul className="space-y-1">
                  {["Routine data entry", "Manual inspection", "Repetitive assembly", "Basic transaction processing"].map((t) => (
                    <li key={t} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />{t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                <div className="text-xs text-yellow-400 font-medium mb-2 uppercase tracking-wider">Bridge Skills</div>
                {passport?.adjacent_skills?.slice(0, 4).map((s, i) => (
                  <div key={i} className="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
                    <span className="w-1 h-1 rounded-full bg-yellow-400 shrink-0" />{s.label}
                  </div>
                ))}
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                <div className="text-xs text-emerald-400 font-medium mb-2 uppercase tracking-wider">Durable Skills</div>
                <ul className="space-y-1">
                  {["Critical thinking", "Interpersonal communication", "Creative problem solving", "Digital literacy"].map((t) => (
                    <li key={t} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: Opportunities
      ══════════════════════════════════════════════════════════ */}
      {tab === "opportunities" && (
        <div className="space-y-4">
          {/* Econometric summary */}
          {opportunities?.econometric_summary && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Labour Market Context</div>
              <p className="text-sm text-gray-300 leading-relaxed">{opportunities.econometric_summary}</p>
            </div>
          )}

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {OPP_FILTERS.map((f) => (
              <button key={f.id} onClick={() => setOppFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  oppFilter === f.id ? "bg-gray-700 border-gray-500 text-white" : "border-gray-700 text-gray-500 hover:border-gray-600"
                }`}>
                {f.label} {f.id === "all" ? `(${opportunities?.opportunities?.length ?? 0})` :
                  `(${opportunities?.opportunities?.filter((o) => o.type === f.id).length ?? 0})`}
              </button>
            ))}
          </div>

          {/* Opportunity cards */}
          {filteredOpps.map((opp: Opportunity, i: number) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs border rounded-full px-2 py-0.5 ${OPP_BADGE[opp.type] ?? "bg-gray-700 text-gray-300 border-gray-600"}`}>
                      {OPP_FILTERS.find((f) => f.id === opp.type)?.label ?? opp.type}
                    </span>
                    <span className="text-xs text-gray-500">{opp.sector}</span>
                  </div>
                  <h3 className="font-semibold text-white">{opp.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{opp.plain_explanation}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold text-white">{opp.fit_score}</div>
                  <div className="text-xs text-gray-500">/ 10 fit</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {opp.wage_floor_signal?.value != null && (
                  <div className="bg-gray-900 rounded-lg p-2.5">
                    <div className="text-xs text-gray-500 mb-0.5">Wage floor</div>
                    <div className="text-sm font-semibold text-white">
                      {opp.wage_floor_signal.currency}{opp.wage_floor_signal.value.toLocaleString()}/mo
                    </div>
                    <div className="text-xs text-gray-600">{opp.wage_floor_signal.source}{opp.wage_floor_signal.year ? ` · ${opp.wage_floor_signal.year}` : ""}</div>
                  </div>
                )}
                {opp.growth_signal?.value != null && (
                  <div className="bg-gray-900 rounded-lg p-2.5">
                    <div className="text-xs text-gray-500 mb-0.5">Sector growth</div>
                    <div className="text-sm font-semibold text-emerald-400">{opp.growth_signal.value}% YoY</div>
                    <div className="text-xs text-gray-600">{opp.growth_signal.source}{opp.growth_signal.year ? ` · ${opp.growth_signal.year}` : ""}</div>
                  </div>
                )}
              </div>
              {opp.gap && (
                <div className="mt-3 text-xs text-yellow-400 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
                  ⚠ Skill gap: {opp.gap}
                </div>
              )}
            </div>
          ))}

          {filteredOpps.length === 0 && (
            <div className="text-center py-12 text-gray-500">No opportunities in this category.</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: Simulate
      ══════════════════════════════════════════════════════════ */}
      {tab === "simulate" && (
        <div className="space-y-6">
          <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
            <div className="text-sm font-medium text-gray-300 mb-1">Interactive Skill Simulation</div>
            <p className="text-xs text-gray-500 mb-5">Toggle your skills on or off to see how they affect your competency profile and opportunity fit.</p>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Toggles */}
              <div className="space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Your skills</div>
                {passport?.mapped_skills?.map((skill) => (
                  <button key={skill.uri} onClick={() => setSimSkills((prev) => ({ ...prev, [skill.label]: !(prev[skill.label] ?? true) }))}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
                      simSkills[skill.label] !== false
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                        : "border-gray-700 bg-gray-800/40 text-gray-500"
                    }`}>
                    <span className="truncate">{skill.label}</span>
                    <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-1 shrink-0 ml-2 ${simSkills[skill.label] !== false ? "bg-blue-500 justify-end" : "bg-gray-600 justify-start"}`}>
                      <div className="w-3 h-3 rounded-full bg-white" />
                    </div>
                  </button>
                ))}
              </div>

              {/* Live radar */}
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Projected profile</div>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={simRadar}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} />
                    <Radar name="Projected" dataKey="value" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip formatter={(v) => [`${v}%`]}
                      contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-white">{Object.values(simSkills).filter(Boolean).length}</div>
                    <div className="text-xs text-gray-500">Active skills</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-cyan-400">{simFitAvg || "–"}</div>
                    <div className="text-xs text-gray-500">Avg fit score</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-emerald-400">{opportunities?.opportunities?.length ?? 0}</div>
                    <div className="text-xs text-gray-500">Opportunities</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
