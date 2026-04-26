"use client";

import { useEffect, useRef, useState } from "react";
import { getConfigs } from "@/lib/api";

export interface Country {
  code: string;
  name: string;
  region?: string;
}

interface Props {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Visual variant — "dark" (default) for forms, "pill" for dashboard header */
  variant?: "dark" | "pill";
}

// Shown immediately while the API call loads (avoids an empty dropdown flash)
const FALLBACK_COUNTRIES: Country[] = [
  { code: "GHA", name: "Ghana",      region: "Sub-Saharan Africa" },
  { code: "BGD", name: "Bangladesh", region: "South Asia" },
];

export default function CountrySelect({
  value,
  onChange,
  disabled = false,
  variant = "dark",
}: Props) {
  const [countries, setCountries] = useState<Country[]>(FALLBACK_COUNTRIES);
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState("");
  const containerRef              = useRef<HTMLDivElement>(null);
  const searchRef                 = useRef<HTMLInputElement>(null);

  // Load full country list from backend
  useEffect(() => {
    getConfigs()
      .then((res) => {
        if (res.configs.length > 0) {
          setCountries(
            res.configs
              .filter((c) => c.country_code && c.country_name)
              .sort((a, b) => a.country_name.localeCompare(b.country_name))
              .map((c) => ({
                code:   c.country_code,
                name:   c.country_name,
                region: c.region ?? undefined,
              }))
          );
        }
      })
      .catch(() => {/* keep fallback */});
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const selected   = countries.find((c) => c.code === value);
  const filtered   = query
    ? countries.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.code.toLowerCase().includes(query.toLowerCase())
      )
    : countries;

  // Group by region for cleaner browsing when not searching
  const grouped = filtered.reduce<Record<string, Country[]>>((acc, c) => {
    const region = c.region ?? "Other";
    if (!acc[region]) acc[region] = [];
    acc[region].push(c);
    return acc;
  }, {});

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  // ── Trigger button styles ────────────────────────────────────────────────
  const triggerBase =
    "flex items-center gap-2 transition-all focus:outline-none disabled:opacity-50";

  const triggerStyles =
    variant === "pill"
      ? `${triggerBase} px-4 py-2 rounded-xl text-sm font-medium border ${
          open
            ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
            : "bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600"
        }`
      : `${triggerBase} w-full p-3 rounded-xl border text-sm font-medium ${
          open
            ? "border-blue-500 bg-blue-500/10 text-blue-300"
            : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"
        }`;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={triggerStyles}
      >
        <span className="flex-1 text-left truncate">
          {selected ? selected.name : "Select country…"}
        </span>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-800">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none"
                viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries…"
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                No countries match &ldquo;{query}&rdquo;
              </div>
            ) : query ? (
              // Flat list when searching
              filtered.map((c) => (
                <CountryOption key={c.code} country={c} selected={value === c.code} onSelect={select} />
              ))
            ) : (
              // Grouped by region when browsing
              Object.entries(grouped).sort().map(([region, items]) => (
                <div key={region}>
                  <div className="px-3 pt-3 pb-1 text-xs text-gray-600 uppercase tracking-widest font-medium">
                    {region}
                  </div>
                  {items.map((c) => (
                    <CountryOption key={c.code} country={c} selected={value === c.code} onSelect={select} />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          {countries.length > 5 && (
            <div className="px-3 py-2 border-t border-gray-800 text-xs text-gray-600 text-right">
              {countries.length} countries available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CountryOption({
  country,
  selected,
  onSelect,
}: {
  country: Country;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(country.code)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
        selected
          ? "bg-blue-500/15 text-blue-300"
          : "text-gray-300 hover:bg-gray-800"
      }`}
    >
      <span className="flex-1 truncate">{country.name}</span>
      <span className="text-xs text-gray-600 font-mono">{country.code}</span>
      {selected && (
        <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
