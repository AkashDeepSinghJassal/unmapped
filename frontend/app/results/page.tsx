"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileResponse, Opportunity } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  formal_job: "Formal Job",
  gig: "Gig Work",
  self_employment: "Self-Employment",
  training: "Training",
};

const TYPE_COLORS: Record<string, string> = {
  formal_job: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  gig: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  self_employment: "bg-green-500/15 text-green-300 border-green-500/30",
  training: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "text-green-400" : pct >= 50 ? "text-amber-400" : "text-gray-500";
  return (
    <span className={`text-xs font-medium ${color}`}>{pct}% match</span>
  );
}

function EconBadge({
  label,
  value,
  unit,
  source,
  year,
}: {
  label: string;
  value: number | null;
  unit?: string;
  source: string;
  year?: number | null;
}) {
  if (value === null || value === undefined) return null;
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-gray-400 font-normal ml-1">{unit}</span>}
      </div>
      <div className="text-xs text-gray-600 mt-0.5">
        {source}
        {year && ` · ${year}`}
      </div>
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-gray-800/40 border border-gray-700 rounded-2xl overflow-hidden">
      <div
        className="p-5 cursor-pointer hover:bg-gray-800/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs text-gray-500 font-mono">#{rank}</span>
              <span
                className={`text-xs border rounded-full px-2 py-0.5 ${
                  TYPE_COLORS[opp.type] || "bg-gray-700 text-gray-300 border-gray-600"
                }`}
              >
                {TYPE_LABELS[opp.type] || opp.type}
              </span>
              <span className="text-xs text-gray-500">{opp.sector}</span>
            </div>
            <h3 className="font-semibold text-white text-base">{opp.title}</h3>
            <p className="text-sm text-gray-400 mt-1">{opp.plain_explanation}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-white">{opp.fit_score}</div>
            <div className="text-xs text-gray-500">/ 10</div>
          </div>
        </div>

        {/* Econometric signals — always visible */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <EconBadge
            label="Wage floor"
            value={opp.wage_floor_signal?.value ?? null}
            unit={opp.wage_floor_signal?.currency + "/mo"}
            source={opp.wage_floor_signal?.source || "ILOSTAT"}
            year={opp.wage_floor_signal?.year}
          />
          <EconBadge
            label="Sector growth"
            value={opp.growth_signal?.value ?? null}
            unit="% YoY"
            source={opp.growth_signal?.source || "ILOSTAT"}
            year={opp.growth_signal?.year}
          />
        </div>
      </div>

      {expanded && opp.gap && (
        <div className="px-5 pb-4 border-t border-gray-700/50 pt-3">
          <p className="text-xs text-amber-400">
            <span className="font-medium">Skill gap: </span>
            {opp.gap}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ProfileResponse | null>(null);
  const [tab, setTab] = useState<"passport" | "opportunities">("passport");

  useEffect(() => {
    const raw = sessionStorage.getItem("unmapped_result");
    if (!raw) {
      router.push("/");
      return;
    }
    setResult(JSON.parse(raw));
  }, [router]);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading…
      </div>
    );
  }

  const { passport, opportunities } = result;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 flex items-center gap-1"
        >
          ← New profile
        </button>
        <h1 className="text-2xl font-bold text-white">Your Skills Profile</h1>
        <p className="text-gray-400 text-sm mt-1">
          {passport?.education_level} ·{" "}
          {passport?.country === "GHA" ? "Ghana" : "Bangladesh"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 mb-6">
        {(["passport", "opportunities"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "passport" ? "Skills Passport" : "Opportunities"}
          </button>
        ))}
      </div>

      {/* Skills Passport Tab */}
      {tab === "passport" && passport && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center text-blue-400 font-bold text-lg shrink-0">
                {passport.isco_major_group}
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">ISCO-08 Group</div>
                <div className="font-semibold text-white">{passport.isco_label}</div>
                <p className="text-sm text-gray-400 mt-2">{passport.profile_summary}</p>
              </div>
            </div>
          </div>

          {/* Mapped skills */}
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
              Recognised Skills
            </h2>
            <div className="space-y-3">
              {passport.mapped_skills?.map((skill) => (
                <div
                  key={skill.uri}
                  className="bg-gray-800/40 border border-gray-700 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white text-sm">
                      {skill.label}
                    </span>
                    <ConfidenceBadge score={skill.confidence} />
                  </div>
                  <p className="text-xs text-gray-500">{skill.why}</p>
                  <div className="mt-2">
                    {/* Confidence bar */}
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${skill.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Adjacent skills */}
          {passport.adjacent_skills?.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
                Skills to Develop Next
              </h2>
              <div className="space-y-2">
                {passport.adjacent_skills.map((s, i) => (
                  <div
                    key={i}
                    className="bg-gray-800/40 border border-gray-700 rounded-xl p-4"
                  >
                    <div className="font-medium text-white text-sm mb-1">
                      {s.label}
                    </div>
                    <p className="text-xs text-gray-500">{s.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limitations */}
          {passport.limitations && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs text-amber-400/80">
                <span className="font-medium">Note: </span>
                {passport.limitations}
              </p>
            </div>
          )}

          <button
            onClick={() => setTab("opportunities")}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            See your opportunities →
          </button>
        </div>
      )}

      {/* Opportunities Tab */}
      {tab === "opportunities" && opportunities && (
        <div className="space-y-6">
          {/* Econometric summary */}
          {opportunities.econometric_summary && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5">
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Labour Market Context
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {opportunities.econometric_summary}
              </p>
            </div>
          )}

          {/* Opportunity cards */}
          <div className="space-y-4">
            {opportunities.opportunities?.map((opp, i) => (
              <OpportunityCard key={i} opp={opp} rank={i + 1} />
            ))}
          </div>

          {/* Data note */}
          {opportunities.data_note && (
            <p className="text-xs text-gray-600 text-center">
              {opportunities.data_note}
            </p>
          )}

          {/* Sources */}
          <div className="flex flex-wrap gap-2 justify-center">
            {opportunities.data_sources?.map((s) => (
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
