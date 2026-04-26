"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell,
} from "recharts";
import { getDashboard, getSignals, type DashboardResponse } from "@/lib/api";
import CountrySelect from "@/components/CountrySelect";
import type { IndicatorKey } from "@/components/BubbleMap";

// Dynamically loaded — leaflet requires browser APIs
const BubbleMap = dynamic(() => import("@/components/BubbleMap"), {
  ssr: false,
  loading: () => (
    <div className="h-96 flex items-center justify-center text-gray-500 text-sm bg-gray-900 rounded-xl">
      Loading map…
    </div>
  ),
});

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "skills" | "talent" | "risk" | "compare" | "map" | "insights";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview",          icon: "📊" },
  { id: "skills",   label: "Skills Intel",      icon: "🔵" },
  { id: "talent",   label: "Talent Pool",       icon: "👥" },
  { id: "risk",     label: "Risk Analysis",     icon: "⚡" },
  { id: "compare",  label: "Regional Compare",  icon: "🌍" },
  { id: "map",      label: "World Map",         icon: "🗺" },
  { id: "insights", label: "AI Insights",       icon: "🤖" },
];

const ISCO_LABELS: Record<number, string> = {
  1: "Managers", 2: "Professionals", 3: "Technicians",
  4: "Clerical", 5: "Service & Sales", 6: "Agricultural",
  7: "Craft & Trades", 8: "Operators", 9: "Elementary",
};

const LINE_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f87171", "#a78bfa"];

const INDICATOR_SHORT: Record<string, string> = {
  wage_workers_pct:               "Wage Workers %",
  neet_youth_pct:                 "NEET Youth %",
  female_labour_participation_pct:"Female LFP %",
  youth_unemployment_pct:         "Youth Unemployment %",
  gdp_per_capita_usd:             "GDP/capita USD",
  gdp_per_capita_growth_pct:      "GDP Growth %",
  internet_users_pct:             "Internet Users %",
  fixed_broadband_per100:         "Broadband /100",
};

// ── Mock skill cluster data (computed from automation data) ──────────────────
function buildClusterData(autoRisk: { label: string; avg_automation_prob: number; isco_group: number }[]) {
  const growthProxy: Record<number, number> = { 2: 8, 3: 6, 1: 4, 5: 3, 4: 1, 8: -1, 9: -3, 6: -2, 7: 0 };
  return autoRisk.map((r) => ({
    name: r.label,
    automation_risk: Math.round(r.avg_automation_prob * 100),
    demand_growth:   growthProxy[r.isco_group] ?? 0,
    isco:            r.isco_group,
    size:            300,
  }));
}

function buildMismatchData(autoRisk: { label: string; avg_automation_prob: number }[]) {
  return autoRisk.map((r) => ({
    name:    r.label.length > 12 ? r.label.slice(0, 12) + "…" : r.label,
    supply:  Math.round(50 + Math.random() * 30),
    demand:  Math.round(100 - r.avg_automation_prob * 80),
    gap:     Math.round((1 - r.avg_automation_prob) * 60 - 20),
  }));
}

// ── Mock candidate profiles ───────────────────────────────────────────────────
const MOCK_CANDIDATES = [
  { name: "Kwame A.",  isco: "Technicians",    skills: ["ICT repair","Coding","Teaching"],         match: 87, edu: "SHS",       region: "Greater Accra",   invisible: "Self-taught JS, 3 apps built" },
  { name: "Fatima B.", isco: "Service & Sales", skills: ["Customer service","Inventory","Payments"], match: 72, edu: "TVET",      region: "Ashanti",         invisible: "Managed shop 4 yrs, 200+ clients" },
  { name: "Amara C.",  isco: "Agricultural",   skills: ["Crop management","Market sales","Irrigation"], match: 64, edu: "Primary", region: "Northern",      invisible: "Collective farming lead, 10 members" },
  { name: "Priya D.",  isco: "Professionals",  skills: ["Data analysis","Excel","Reporting"],       match: 91, edu: "Bachelor's", region: "Dhaka",           invisible: "Freelance data work, 5 projects" },
  { name: "Hassan E.", isco: "Craft & Trades", skills: ["Welding","Electrical","Blueprint reading"], match: 78, edu: "TVET",      region: "Kumasi",         invisible: "Apprentice → independent contractor" },
  { name: "Mei L.",    isco: "Operators",      skills: ["Machine operation","Quality control","Logistics"], match: 59, edu: "JHS", region: "Chittagong",    invisible: "Trained 3 junior operators" },
];

// ── Skill gap insight data ────────────────────────────────────────────────────
const SKILL_GAPS = [
  { skill: "Data Literacy",       demand: 82, supply: 34, gap: 48 },
  { skill: "Digital Marketing",   demand: 75, supply: 41, gap: 34 },
  { skill: "Financial Management",demand: 68, supply: 45, gap: 23 },
  { skill: "ICT Repair",          demand: 60, supply: 52, gap: 8  },
  { skill: "Agricultural Tech",   demand: 55, supply: 28, gap: 27 },
  { skill: "Construction",        demand: 70, supply: 65, gap: 5  },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function SignalCard({ label, value, unit, year, source }: {
  label: string; value: number | null; unit?: string; year?: number; source: string;
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5">
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-bold text-white mb-1">
        {value != null ? (
          <>{typeof value === "number" ? (value % 1 === 0 ? value.toLocaleString() : value.toFixed(2)) : value}
            {unit && <span className="text-gray-400 text-lg font-normal ml-1">{unit}</span>}
          </>
        ) : <span className="text-gray-600 text-xl">N/A</span>}
      </div>
      <div className="text-xs text-gray-600">{source}{year ? ` · ${year}` : ""}</div>
    </div>
  );
}

type TrendRow = { year: number; indicator_label: string; value: number };

function pivotTrend(rows: TrendRow[]) {
  const byYear: Record<number, Record<string, number>> = {};
  for (const r of rows) {
    if (!byYear[r.year]) byYear[r.year] = { year: r.year };
    byYear[r.year][r.indicator_label] = Number(r.value);
  }
  return Object.values(byYear).sort((a, b) => a.year - b.year);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [countryCode, setCountryCode] = useState("GHA");
  const [data, setData]   = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab]     = useState<Tab>("overview");
  const [mapIndicator, setMapIndicator] = useState<IndicatorKey>("youth_unemployment");
  const [mapRealData, setMapRealData]   = useState<Record<string, number>>({});

  // Regional compare — uses /api/signals (raw indicator_label keys)
  const [compareCC, setCompareCC]         = useState("BGD");
  const [homeSignals, setHomeSignals]     = useState<Record<string, { value: number | null; year?: number }>>({});
  const [compareSignals, setCompareSignals] = useState<Record<string, { value: number | null; year?: number }>>({});
  const [loadingCompare, setLoadingCompare] = useState(false);

  async function load(cc: string) {
    setLoading(true); setError("");
    try {
      const result = await getDashboard(cc);
      setData(result);
      // Feed real indicator values into the map
      const realVals: Record<string, number> = {};
      for (const sig of result.key_signals ?? []) {
        if (sig.value == null) continue;
        const k = sig.label.toLowerCase().replace(/\s+/g, "_");
        if (k.includes("youth_unemployment") || k.includes("youth unemployment")) realVals[cc] = sig.value;
        if (k.includes("neet"))              realVals[cc] = sig.value;
        if (k.includes("internet"))          realVals[cc] = sig.value;
      }
      setMapRealData((prev) => ({ ...prev, ...realVals }));
    }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(countryCode); }, [countryCode]);

  // Load home country signals for compare tab
  useEffect(() => {
    if (!countryCode) return;
    getSignals(countryCode).then(setHomeSignals).catch(() => {});
  }, [countryCode]);

  // Load comparison country signals
  useEffect(() => {
    if (!compareCC) return;
    setLoadingCompare(true);
    getSignals(compareCC)
      .then(setCompareSignals)
      .catch(() => {})
      .finally(() => setLoadingCompare(false));
  }, [compareCC]);

  const empTrendData  = data ? pivotTrend((data.charts.employment_trends ?? []) as TrendRow[]) : [];
  const empLines      = Array.from(new Set(((data?.charts.employment_trends ?? []) as TrendRow[]).map((r) => r.indicator_label)));
  const wageTrendData = data ? pivotTrend((data.charts.wage_trends ?? []) as TrendRow[]) : [];
  const wageLines     = Array.from(new Set(((data?.charts.wage_trends ?? []) as TrendRow[]).map((r) => r.indicator_label)));
  const autoData      = data?.charts.automation_risk ?? [];
  const automationChartData = autoData.map((r) => ({ name: r.label, risk: Math.round((r.avg_automation_prob ?? 0) * 100), isco: r.isco_group }));
  const clusterData   = buildClusterData(autoData);
  const mismatchData  = buildMismatchData(autoData);

  const radarData = autoData.slice(0, 6).map((r) => ({
    subject: ISCO_LABELS[r.isco_group] ?? `G${r.isco_group}`,
    risk: Math.round(r.avg_automation_prob * 100),
  }));

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1 text-xs text-purple-400 mb-3">
            Policymaker Dashboard
          </div>
          <h1 className="text-2xl font-bold text-white">Labour Market Intelligence</h1>
          <p className="text-gray-400 text-sm mt-1">World Bank Data360 · ILOSTAT · Frey-Osborne (2013) · ESCO v1.2.1</p>
        </div>
        <CountrySelect value={countryCode} onChange={setCountryCode} disabled={loading} variant="pill" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
              tab === t.id ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-500 gap-3">
          <span className="w-5 h-5 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" />
          Loading labour market data…
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400 mb-6">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* ══════════════════════════════════════════════════════
              TAB: Overview
          ══════════════════════════════════════════════════════ */}
          {tab === "overview" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {data.key_signals.map((sig, i) => (
                  <SignalCard key={i} label={sig.label} value={sig.value} unit={sig.unit} year={sig.year} source={sig.source} />
                ))}
              </div>

              {/* AI Narrative */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 bg-purple-500/30 rounded flex items-center justify-center">
                    <span className="text-purple-400 text-xs font-bold">AI</span>
                  </div>
                  <span className="text-sm font-medium text-gray-300">Policy Briefing — {data.country_name}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{data.narrative}</p>
              </div>

              {/* Employment trends */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Youth Labour Indicators</div>
                  <div className="text-xs text-gray-600 mb-4">World Bank Data360 · WB_WDI</div>
                  {empTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={empTrendData} margin={{ left: 0, right: 10 }}>
                        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v, n) => [`${Number(v).toFixed(1)}%`, INDICATOR_SHORT[n as string] ?? n]}
                          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                        <Legend formatter={(v) => INDICATOR_SHORT[v] ?? v} wrapperStyle={{ fontSize: 10 }} />
                        {empLines.map((key, i) => (
                          <Line key={key} type="monotone" dataKey={key} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No data for this country</div>}
                </div>

                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Economic &amp; Digital Trends</div>
                  <div className="text-xs text-gray-600 mb-4">World Bank Data360 · GDP &amp; Internet</div>
                  {wageTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={wageTrendData} margin={{ left: 0, right: 10 }}>
                        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <Tooltip formatter={(v, n) => [Number(v).toLocaleString(), INDICATOR_SHORT[n as string] ?? n]}
                          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                        <Legend formatter={(v) => INDICATOR_SHORT[v] ?? v} wrapperStyle={{ fontSize: 10 }} />
                        {wageLines.map((key, i) => (
                          <Line key={key} type="monotone" dataKey={key} stroke={LINE_COLORS[(i + 2) % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No data</div>}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: Skills Intelligence
          ══════════════════════════════════════════════════════ */}
          {tab === "skills" && (
            <div className="space-y-6">
              {/* Skill Risk Radar */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Automation Risk Radar</div>
                  <div className="text-xs text-gray-600 mb-4">Risk % per ISCO occupational group</div>
                  {radarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#374151" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} />
                        <Radar name="Automation Risk %" dataKey="risk" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
                        <Tooltip formatter={(v) => [`${v}%`, "Automation risk"]}
                          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>}
                </div>

                {/* Skill-job mismatch */}
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Skill-Job Mismatch</div>
                  <div className="text-xs text-gray-600 mb-4">Labour demand vs supply index · simulated</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={SKILL_GAPS} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      <YAxis type="category" dataKey="skill" width={100} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="demand" name="Demand" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="supply" name="Supply" fill="#374151" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Skill Clusters scatter */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                <div className="text-sm font-medium text-gray-300 mb-1">Skill Clusters — Risk vs Demand Growth</div>
                <div className="text-xs text-gray-600 mb-4">Each bubble = ISCO occupation group · X = automation risk · Y = demand growth proxy</div>
                {clusterData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                      <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                      <XAxis dataKey="automation_risk" name="Automation Risk %" type="number" domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "#6b7280" }} label={{ value: "Automation Risk %", position: "insideBottom", offset: -10, fill: "#6b7280", fontSize: 10 }} />
                      <YAxis dataKey="demand_growth" name="Demand Growth %" type="number" domain={[-5, 12]}
                        tick={{ fontSize: 10, fill: "#6b7280" }} label={{ value: "Growth %", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 }} />
                      <ZAxis dataKey="size" range={[80, 300]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }}
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs">
                              <div className="font-medium text-white mb-1">{d.name}</div>
                              <div className="text-gray-400">Automation: {d.automation_risk}%</div>
                              <div className="text-gray-400">Demand growth: {d.demand_growth}%</div>
                            </div>
                          );
                        }} />
                      <Scatter name="ISCO Groups" data={clusterData}>
                        {clusterData.map((entry, i) => (
                          <Cell key={i} fill={entry.demand_growth > 0 ? "#22d3ee" : "#ef4444"} fillOpacity={0.7} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>}
                <div className="flex gap-4 mt-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" />Growing sector</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Declining sector</span>
                </div>
              </div>

              {/* Skill gap table */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                <div className="text-sm font-medium text-gray-300 mb-4">Skill Gap Insights</div>
                <div className="space-y-3">
                  {SKILL_GAPS.map((g) => (
                    <div key={g.skill} className="flex items-center gap-4">
                      <div className="w-32 text-xs text-gray-400 shrink-0">{g.skill}</div>
                      <div className="flex-1">
                        <div className="flex gap-1">
                          <div className="h-2 bg-purple-500/50 rounded-l-full" style={{ width: `${g.supply}%` }} />
                          <div className="h-2 bg-red-500/30 rounded-r-full" style={{ width: `${g.gap}%` }} />
                        </div>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${g.gap > 30 ? "text-red-400" : g.gap > 15 ? "text-yellow-400" : "text-emerald-400"}`}>
                        {g.gap > 0 ? `+${g.gap}` : g.gap} gap
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500/50" />Supply</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/30" />Unmet demand</span>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: Talent Pool
          ══════════════════════════════════════════════════════ */}
          {tab === "talent" && (
            <div className="space-y-6">
              {/* Distribution by ISCO */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Automation Risk by Group</div>
                  <div className="text-xs text-gray-600 mb-4">Frey &amp; Osborne (2013) · ISCO-08</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={automationChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                      <Tooltip formatter={(v) => [`${v}%`, "Automation probability"]}
                        contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="risk" radius={[0, 4, 4, 0]}>
                        {automationChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.risk > 65 ? "#ef4444" : entry.risk > 40 ? "#f59e0b" : "#22d3ee"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-4">Talent Discovery Summary</div>
                  <div className="space-y-3">
                    {[
                      { label: "Profiles analysed",     value: "6",    color: "text-white"        },
                      { label: "High-skill match (≥80%)",value: "3",    color: "text-emerald-400"  },
                      { label: "Mid-skill match (60–79%)",value: "2",   color: "text-yellow-400"   },
                      { label: "Needs upskilling (<60%)",value: "1",    color: "text-red-400"      },
                      { label: "Avg match score",        value: "75%",  color: "text-blue-400"     },
                      { label: "Invisible skills found", value: "6/6",  color: "text-purple-400"   },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                        <span className="text-xs text-gray-400">{row.label}</span>
                        <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Candidate profiles table */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-700">
                  <div className="text-sm font-medium text-gray-300">Candidate Profiles</div>
                  <div className="text-xs text-gray-600 mt-0.5">Sample profiles · Invisible skills surfaced by AI</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-500">
                        <th className="px-5 py-3 text-left font-medium">Candidate</th>
                        <th className="px-4 py-3 text-left font-medium">Occupation</th>
                        <th className="px-4 py-3 text-left font-medium">Top Skills</th>
                        <th className="px-4 py-3 text-left font-medium">Invisible Skills</th>
                        <th className="px-4 py-3 text-left font-medium">Region</th>
                        <th className="px-4 py-3 text-left font-medium">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_CANDIDATES.map((c, i) => (
                        <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-gray-200">{c.name}</div>
                            <div className="text-gray-600 mt-0.5">{c.edu}</div>
                          </td>
                          <td className="px-4 py-3.5 text-gray-400">{c.isco}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {c.skills.slice(0, 2).map((s) => (
                                <span key={s} className="bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full px-2 py-0.5">{s}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-1 text-xs">
                              {c.invisible}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-gray-400">{c.region}</td>
                          <td className="px-4 py-3.5">
                            <div className={`font-bold ${c.match >= 80 ? "text-emerald-400" : c.match >= 65 ? "text-yellow-400" : "text-red-400"}`}>
                              {c.match}%
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: Risk Analysis
          ══════════════════════════════════════════════════════ */}
          {tab === "risk" && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Automation risk bar */}
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Automation Risk by Occupation</div>
                  <div className="text-xs text-gray-600 mb-4">Frey &amp; Osborne (2013) · ISCO-08 groups</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={automationChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                      <Tooltip formatter={(v) => [`${v}%`, "Automation probability"]}
                        contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="risk" radius={[0, 4, 4, 0]} fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Mismatch */}
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                  <div className="text-sm font-medium text-gray-300 mb-1">Supply vs Demand Gap</div>
                  <div className="text-xs text-gray-600 mb-4">Occupation group workforce balance · estimated</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={mismatchData} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="demand" name="Demand index" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="supply" name="Supply index"  fill="#374151" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* High risk occupations */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                <div className="text-sm font-medium text-gray-300 mb-4">High-Risk Occupation Alert</div>
                <div className="grid md:grid-cols-3 gap-3">
                  {automationChartData.filter((r) => r.risk > 60).map((r) => (
                    <div key={r.name} className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                      <div className="text-xs text-red-400 font-medium mb-1">HIGH RISK</div>
                      <div className="text-sm font-semibold text-white mb-1">{r.name}</div>
                      <div className="text-2xl font-bold text-red-400">{r.risk}%</div>
                      <div className="text-xs text-gray-600 mt-1">automation probability</div>
                    </div>
                  ))}
                  {automationChartData.filter((r) => r.risk > 60).length === 0 && (
                    <div className="col-span-3 text-center py-6 text-gray-600 text-sm">No high-risk occupations for this dataset</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: Regional Compare
          ══════════════════════════════════════════════════════ */}
          {tab === "compare" && (() => {

            const COMPARE_ROWS = [
              { key: "human_capital_index",           label: "Human Capital Index",          unit: "",   higherBetter: true  },
              { key: "youth_unemployment_pct",         label: "Youth Unemployment %",         unit: "%",  higherBetter: false },
              { key: "neet_youth_pct",                 label: "Youth NEET Rate %",            unit: "%",  higherBetter: false },
              { key: "neet_youth_female_pct",          label: "NEET Female Youth %",          unit: "%",  higherBetter: false },
              { key: "internet_users_pct",             label: "Internet Users %",             unit: "%",  higherBetter: true  },
              { key: "fixed_broadband_per100",         label: "Fixed Broadband per 100",      unit: "",   higherBetter: true  },
              { key: "wage_workers_pct",               label: "Wage Workers %",               unit: "%",  higherBetter: true  },
              { key: "informal_employment_total_pct",  label: "Informal Employment %",        unit: "%",  higherBetter: false },
              { key: "female_labour_participation_pct",label: "Female Labour Participation %",unit: "%",  higherBetter: true  },
              { key: "secondary_school_enrollment_pct",label: "Secondary Enrolment %",        unit: "%",  higherBetter: true  },
              { key: "gdp_per_capita_usd",             label: "GDP per Capita (USD)",         unit: "",   higherBetter: true  },
              { key: "gdp_per_capita_growth_pct",      label: "GDP Growth %",                 unit: "%",  higherBetter: true  },
            ];

            function formatVal(v: number | null | undefined, unit: string) {
              if (v == null) return "N/A";
              return unit === "" ? v.toFixed(2) : `${v.toFixed(1)}${unit}`;
            }

            function winnerClass(homeVal: number | null | undefined, cmpVal: number | null | undefined, higherBetter: boolean) {
              if (homeVal == null || cmpVal == null) return "";
              const homeBetter = higherBetter ? homeVal >= cmpVal : homeVal <= cmpVal;
              return homeBetter ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold";
            }

            return (
              <div className="space-y-5">
                {/* Country selector row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-sm text-gray-300 font-medium">{countryCode}</span>
                    <span className="text-xs text-gray-600">(selected)</span>
                  </div>
                  <span className="text-gray-600 text-sm">vs</span>
                  <div className="w-56">
                    <CountrySelect
                      value={compareCC}
                      onChange={setCompareCC}
                      disabled={loadingCompare}
                      variant="pill"
                    />
                  </div>
                  {loadingCompare && (
                    <span className="w-4 h-4 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" />
                  )}
                </div>

                {/* Summary cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Home */}
                  <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-sm font-semibold text-blue-300">{countryCode}</span>
                      <span className="ml-auto text-xs text-gray-600">Home country</span>
                    </div>
                    {COMPARE_ROWS.slice(0, 6).map(({ key, label, unit, higherBetter }) => {
                      const home = homeSignals[key];
                      const cmp  = compareSignals[key];
                      const cls  = winnerClass(home?.value, cmp?.value, higherBetter);
                      return (
                        <div key={key} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                          <span className="text-xs text-gray-500">{label}</span>
                          <span className={`text-sm ${cls || "text-gray-300"}`}>
                            {formatVal(home?.value, unit)}
                            {home?.year && <span className="text-xs text-gray-600 ml-1">({home.year})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Comparison */}
                  <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                      <span className="text-sm font-semibold text-gray-300">{compareCC}</span>
                      <span className="ml-auto text-xs text-gray-600">Comparison</span>
                    </div>
                    {COMPARE_ROWS.slice(0, 6).map(({ key, label, unit, higherBetter }) => {
                      const home = homeSignals[key];
                      const cmp  = compareSignals[key];
                      const cls  = winnerClass(cmp?.value, home?.value, higherBetter);
                      return (
                        <div key={key} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                          <span className="text-xs text-gray-500">{label}</span>
                          <span className={`text-sm ${cls || "text-gray-300"}`}>
                            {formatVal(cmp?.value, unit)}
                            {cmp?.year && <span className="text-xs text-gray-600 ml-1">({cmp.year})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full comparison table */}
                <div className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-gray-700">
                    <div className="text-sm font-medium text-gray-300">Full Indicator Comparison</div>
                    <div className="text-xs text-gray-600 mt-0.5">Green = better performer · World Bank Data360</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-900">
                        <tr className="border-b border-gray-700 text-gray-500">
                          <th className="px-4 py-2.5 text-left font-medium">Indicator</th>
                          <th className="px-4 py-2.5 text-right font-medium text-blue-400">{countryCode}</th>
                          <th className="px-4 py-2.5 text-right font-medium text-purple-400">{compareCC}</th>
                          <th className="px-4 py-2.5 text-center font-medium">Leader</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COMPARE_ROWS.map(({ key, label, unit, higherBetter }) => {
                          const home = homeSignals[key];
                          const cmp  = compareSignals[key];
                          const homeBetter = home?.value != null && cmp?.value != null
                            ? (higherBetter ? home.value >= cmp.value : home.value <= cmp.value)
                            : null;
                          return (
                            <tr key={key} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                              <td className="px-4 py-2.5 text-gray-400">{label}</td>
                              <td className={`px-4 py-2.5 text-right ${homeBetter === true ? "text-emerald-400 font-semibold" : "text-gray-300"}`}>
                                {formatVal(home?.value, unit)}
                              </td>
                              <td className={`px-4 py-2.5 text-right ${homeBetter === false ? "text-emerald-400 font-semibold" : "text-gray-300"}`}>
                                {formatVal(cmp?.value, unit)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {homeBetter === true  && <span className="text-blue-400 text-xs">{countryCode} ↑</span>}
                                {homeBetter === false && <span className="text-purple-400 text-xs">{compareCC} ↑</span>}
                                {homeBetter === null  && <span className="text-gray-600 text-xs">N/A</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-gray-600">
                  Data sourced from World Bank Data360 API. Values reflect the most recent available year per indicator.
                  Switch the home country using the selector at the top of the page.
                </p>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════
              TAB: World Map
          ══════════════════════════════════════════════════════ */}
          {tab === "map" && (
            <div className="space-y-5">
              {/* Indicator selector */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0">Visualise:</span>
                {(
                  [
                    { id: "youth_unemployment", label: "Youth Unemployment %",   icon: "👤" },
                    { id: "neet_rate",           label: "NEET Youth Rate %",      icon: "📉" },
                    { id: "internet_pct",        label: "Internet Penetration %", icon: "🌐" },
                    { id: "automation_risk",     label: "Automation Risk %",      icon: "🤖" },
                  ] as { id: IndicatorKey; label: string; icon: string }[]
                ).map((ind) => (
                  <button key={ind.id} onClick={() => setMapIndicator(ind.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-all ${
                      mapIndicator === ind.id
                        ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                        : "border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}>
                    <span>{ind.icon}</span>{ind.label}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-cyan-400 opacity-85" /> Low / Good
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-yellow-400 opacity-85" /> Medium
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400 opacity-85" /> High / Poor
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-white opacity-85 border border-gray-500" /> Live API data
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-gray-400 opacity-45" /> Indicative estimate
                </span>
                <span className="ml-auto">Bubble size ∝ indicator value · Click for details</span>
              </div>

              {/* Map */}
              <div className="rounded-2xl border border-gray-700 overflow-hidden">
                <BubbleMap
                  indicator={mapIndicator}
                  realData={mapRealData}
                  height={480}
                />
              </div>

              {/* Country stats table */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-300">Country Comparison Table</div>
                    <div className="text-xs text-gray-600 mt-0.5">30 LMICs · indicative values + live data where available</div>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="border-b border-gray-700 text-gray-500">
                        <th className="px-4 py-2.5 text-left font-medium">Country</th>
                        <th className="px-4 py-2.5 text-left font-medium">Region</th>
                        <th className="px-4 py-2.5 text-right font-medium">Youth Unemp %</th>
                        <th className="px-4 py-2.5 text-right font-medium">NEET %</th>
                        <th className="px-4 py-2.5 text-right font-medium">Internet %</th>
                        <th className="px-4 py-2.5 text-right font-medium">Auto Risk %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { code: "GHA", name: "Ghana",       region: "Sub-Saharan Africa" },
                        { code: "BGD", name: "Bangladesh",  region: "South Asia"         },
                        { code: "NGA", name: "Nigeria",     region: "Sub-Saharan Africa" },
                        { code: "KEN", name: "Kenya",       region: "Sub-Saharan Africa" },
                        { code: "ETH", name: "Ethiopia",    region: "Sub-Saharan Africa" },
                        { code: "IND", name: "India",       region: "South Asia"         },
                        { code: "PAK", name: "Pakistan",    region: "South Asia"         },
                        { code: "PHL", name: "Philippines", region: "Southeast Asia"     },
                        { code: "IDN", name: "Indonesia",   region: "Southeast Asia"     },
                        { code: "HTI", name: "Haiti",       region: "Latin America"      },
                      ].map((c) => {
                        const yu = ({GHA:12,BGD:11,NGA:40,KEN:17,ETH:26,IND:23,PAK:26,PHL:17,IDN:16,HTI:38} as Record<string,number>)[c.code] ?? "–";
                        const nr = ({GHA:28,BGD:30,NGA:52,KEN:31,ETH:44,IND:29,PAK:41,PHL:22,IDN:21,HTI:64} as Record<string,number>)[c.code] ?? "–";
                        const ip = ({GHA:53,BGD:44,NGA:55,KEN:83,ETH:24,IND:69,PAK:36,PHL:67,IDN:77,HTI:32} as Record<string,number>)[c.code] ?? "–";
                        const ar = ({GHA:55,BGD:57,NGA:62,KEN:48,ETH:70,IND:44,PAK:58,PHL:42,IDN:46,HTI:76} as Record<string,number>)[c.code] ?? "–";
                        const isLive = c.code in mapRealData;
                        return (
                          <tr key={c.code} className={`border-b border-gray-700/50 ${isLive ? "bg-purple-500/5" : ""}`}>
                            <td className="px-4 py-2.5">
                              <span className="font-medium text-gray-200">{c.name}</span>
                              {isLive && <span className="ml-1.5 text-xs text-cyan-400">live</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{c.region}</td>
                            <td className="px-4 py-2.5 text-right"><span className={typeof yu === "number" && yu > 30 ? "text-red-400 font-medium" : "text-gray-300"}>{yu}{typeof yu === "number" ? "%" : ""}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={typeof nr === "number" && nr > 45 ? "text-red-400 font-medium" : "text-gray-300"}>{nr}{typeof nr === "number" ? "%" : ""}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={typeof ip === "number" && ip > 60 ? "text-cyan-400 font-medium" : "text-gray-300"}>{ip}{typeof ip === "number" ? "%" : ""}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={typeof ar === "number" && ar > 65 ? "text-red-400 font-medium" : "text-gray-300"}>{ar}{typeof ar === "number" ? "%" : ""}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-gray-600">
                Bubble maps use CartoDB Dark Matter tiles (no API key required). Live data sourced from World Bank Data360 for configured countries. All other values are indicative estimates from published reports.
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: AI Insights
          ══════════════════════════════════════════════════════ */}
          {tab === "insights" && (
            <div className="space-y-6">
              {/* Full AI narrative */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 bg-purple-500/30 rounded flex items-center justify-center">
                    <span className="text-purple-400 text-xs font-bold">AI</span>
                  </div>
                  <span className="text-sm font-medium text-gray-300">AI Policy Briefing — {data.country_name}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{data.narrative}</p>
              </div>

              {/* Recommendations */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                <div className="text-sm font-medium text-gray-300 mb-4">Strategic Recommendations</div>
                <div className="space-y-3">
                  {[
                    { priority: "HIGH",   color: "red",    icon: "🎯", rec: "Prioritise reskilling programmes for craft & trade workers facing 60–80% automation exposure." },
                    { priority: "HIGH",   color: "red",    icon: "📱", rec: "Expand digital literacy access in informal sector — internet penetration remains a key barrier." },
                    { priority: "MEDIUM", color: "yellow", icon: "🎓", rec: "Invest in TVET-to-formal transition pathways to reduce NEET youth rates." },
                    { priority: "MEDIUM", color: "yellow", icon: "💼", rec: "Create incentives for SMEs to formalise gig workers in high-growth service sectors." },
                    { priority: "LOW",    color: "green",  icon: "🌐", rec: "Establish regional skill mobility agreements to address geographic labour market gaps." },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border bg-${item.color}-500/5 border-${item.color}-500/20`}>
                      <span className="text-lg shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-bold text-${item.color}-400 mr-2`}>{item.priority}</span>
                        <span className="text-sm text-gray-300">{item.rec}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key signals summary */}
              <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
                <div className="text-sm font-medium text-gray-300 mb-4">Key Economic Indicators</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.key_signals.map((sig, i) => (
                    <SignalCard key={i} label={sig.label} value={sig.value} unit={sig.unit} year={sig.year} source={sig.source} />
                  ))}
                </div>
              </div>

              {/* Data sources */}
              <div className="flex flex-wrap gap-2">
                {data.data_sources.map((s) => (
                  <span key={s} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-gray-500">{s}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
