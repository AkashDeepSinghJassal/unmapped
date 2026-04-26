"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { getDashboard, type DashboardResponse } from "@/lib/api";
import CountrySelect from "@/components/CountrySelect";

function SignalCard({
  label,
  value,
  unit,
  year,
  source,
}: {
  label: string;
  value: number | null;
  unit?: string;
  year?: number;
  source: string;
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-5">
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-3xl font-bold text-white mb-1">
        {value !== null && value !== undefined ? (
          <>
            {typeof value === "number"
              ? value % 1 === 0
                ? value.toLocaleString()
                : value.toFixed(2)
              : value}
            {unit && (
              <span className="text-gray-400 text-lg font-normal ml-1">
                {unit}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-600 text-xl">N/A</span>
        )}
      </div>
      <div className="text-xs text-gray-600">
        {source}
        {year && ` · ${year}`}
      </div>
    </div>
  );
}


export default function DashboardPage() {
  const [countryCode, setCountryCode] = useState("GHA");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(cc: string) {
    setLoading(true);
    setError("");
    try {
      const result = await getDashboard(cc);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(countryCode);
  }, [countryCode]);

  // Prepare chart data — all series are [{year, indicator_label, value}] from Data360
  type TrendRow = { year: number; indicator_label: string; value: number };

  // Employment trends: pivot to [{year, wage_workers_pct, neet_youth_pct, youth_unemployment_pct}]
  const empTrendData = (() => {
    const rows = (data?.charts.employment_trends ?? []) as TrendRow[];
    if (!rows.length) return [];
    const byYear: Record<number, Record<string, number>> = {};
    for (const r of rows) {
      if (!byYear[r.year]) byYear[r.year] = { year: r.year };
      byYear[r.year][r.indicator_label] = Number(r.value);
    }
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  })();

  const empLines = Array.from(
    new Set(((data?.charts.employment_trends ?? []) as TrendRow[]).map((r) => r.indicator_label))
  );

  // Wage/digital trends chart
  const wageTrendData = (() => {
    const rows = (data?.charts.wage_trends ?? []) as TrendRow[];
    if (!rows.length) return [];
    const byYear: Record<number, Record<string, number>> = {};
    for (const r of rows) {
      if (!byYear[r.year]) byYear[r.year] = { year: r.year };
      byYear[r.year][r.indicator_label] = Number(r.value);
    }
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  })();

  const wageLines = Array.from(
    new Set(((data?.charts.wage_trends ?? []) as TrendRow[]).map((r) => r.indicator_label))
  );

  const automationChartData = data?.charts.automation_risk?.map((r) => ({
    name: r.label,
    risk: Math.round((r.avg_automation_prob ?? 0) * 100),
  })) ?? [];

  // Compact label map for legend
  const INDICATOR_SHORT: Record<string, string> = {
    wage_workers_pct: "Wage Workers %",
    neet_youth_pct: "NEET Youth %",
    female_labour_participation_pct: "Female LFP %",
    youth_unemployment_pct: "Youth Unemployment %",
    gdp_per_capita_usd: "GDP/capita USD",
    gdp_per_capita_growth_pct: "GDP Growth %",
    internet_users_pct: "Internet Users %",
    fixed_broadband_per100: "Broadband /100",
  };

  const LINE_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f87171", "#a78bfa"];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1 text-xs text-purple-400 mb-3">
            Policymaker Dashboard
          </div>
          <h1 className="text-2xl font-bold text-white">
            Labour Market Signals
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Real econometric data from ILOSTAT, World Bank WDI, and Frey-Osborne
          </p>
        </div>

        {/* Country switcher */}
        <CountrySelect
          value={countryCode}
          onChange={setCountryCode}
          disabled={loading}
          variant="pill"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-500 gap-3">
          <span className="w-5 h-5 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" />
          Loading labour market data…
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-8">
          {/* Key signals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.key_signals.map((sig, i) => (
              <SignalCard
                key={i}
                label={sig.label}
                value={sig.value}
                unit={sig.unit}
                year={sig.year}
                source={sig.source}
              />
            ))}
          </div>

          {/* AI Narrative */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 bg-purple-500/30 rounded flex items-center justify-center">
                <span className="text-purple-400 text-xs font-bold">AI</span>
              </div>
              <span className="text-sm font-medium text-gray-300">
                Policy Briefing — {data.country_name}
              </span>
              <span className="ml-auto text-xs text-gray-600">AI Narrative</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
              {data.narrative}
            </p>
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Employment trends (Data360 multi-line) */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-sm font-medium text-gray-300 mb-1">
                Youth Labour Indicators (% trend)
              </div>
              <div className="text-xs text-gray-600 mb-4">
                Source: World Bank Data360 · WB_WDI
              </div>
              {empTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={empTrendData} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(v, name) => [`${Number(v).toFixed(1)}%`, INDICATOR_SHORT[name as string] ?? name]}
                      contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                    />
                    <Legend formatter={(v) => INDICATOR_SHORT[v] ?? v} wrapperStyle={{ fontSize: 10 }} />
                    {empLines.map((key, i) => (
                      <Line key={key} type="monotone" dataKey={key} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                  No employment data available for this country
                </div>
              )}
            </div>

            {/* Automation risk */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-sm font-medium text-gray-300 mb-1">
                Automation Risk by Occupation Group
              </div>
              <div className="text-xs text-gray-600 mb-4">
                Source: Frey &amp; Osborne (2013) · ISCO-08 groups
              </div>
              {automationChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={automationChartData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                    <Tooltip formatter={(v) => [`${v}%`, "Automation probability"]}
                      contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="risk" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                  No automation data available
                </div>
              )}
            </div>
          </div>

          {/* GDP / Digital trends */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
            <div className="text-sm font-medium text-gray-300 mb-1">
              Economic &amp; Digital Trends
            </div>
            <div className="text-xs text-gray-600 mb-4">
              Source: World Bank Data360 · GDP per capita, Internet penetration · 8-year view
            </div>
            {wageTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={wageTrendData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip
                    formatter={(v, name) => [Number(v).toLocaleString(), INDICATOR_SHORT[name as string] ?? name]}
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                  />
                  <Legend formatter={(v) => INDICATOR_SHORT[v] ?? v} wrapperStyle={{ fontSize: 10 }} />
                  {wageLines.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={LINE_COLORS[(i + 2) % LINE_COLORS.length]}
                      strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
                No economic trend data available
              </div>
            )}
          </div>

          {/* Data sources */}
          <div className="flex flex-wrap gap-2 pt-2">
            {data.data_sources.map((s) => (
              <span
                key={s}
                className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-gray-500"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
