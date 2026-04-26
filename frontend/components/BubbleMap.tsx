"use client";

/**
 * BubbleMap — react-leaflet world map with circle markers sized by indicator.
 * Must be dynamically imported (ssr: false) in Next.js pages.
 *
 * Usage:
 *   import dynamic from "next/dynamic";
 *   const BubbleMap = dynamic(() => import("@/components/BubbleMap"), { ssr: false });
 */

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

// ── Static country registry ──────────────────────────────────────────────────
export interface CountryGeo {
  code: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const LMIC_COUNTRIES: CountryGeo[] = [
  // Sub-Saharan Africa
  { code: "GHA", name: "Ghana",              lat: 7.95,   lng: -1.02,  region: "Sub-Saharan Africa" },
  { code: "NGA", name: "Nigeria",            lat: 9.08,   lng: 8.68,   region: "Sub-Saharan Africa" },
  { code: "KEN", name: "Kenya",              lat: -0.02,  lng: 37.91,  region: "Sub-Saharan Africa" },
  { code: "ETH", name: "Ethiopia",           lat: 9.15,   lng: 40.49,  region: "Sub-Saharan Africa" },
  { code: "TZA", name: "Tanzania",           lat: -6.37,  lng: 34.89,  region: "Sub-Saharan Africa" },
  { code: "UGA", name: "Uganda",             lat: 1.37,   lng: 32.29,  region: "Sub-Saharan Africa" },
  { code: "RWA", name: "Rwanda",             lat: -1.94,  lng: 29.87,  region: "Sub-Saharan Africa" },
  { code: "SEN", name: "Senegal",            lat: 14.50,  lng: -14.45, region: "Sub-Saharan Africa" },
  { code: "CIV", name: "Côte d'Ivoire",      lat: 7.54,   lng: -5.55,  region: "Sub-Saharan Africa" },
  { code: "CMR", name: "Cameroon",           lat: 3.85,   lng: 11.50,  region: "Sub-Saharan Africa" },
  { code: "ZMB", name: "Zambia",             lat: -13.13, lng: 27.85,  region: "Sub-Saharan Africa" },
  { code: "ZWE", name: "Zimbabwe",           lat: -19.02, lng: 29.15,  region: "Sub-Saharan Africa" },
  { code: "MOZ", name: "Mozambique",         lat: -18.67, lng: 35.53,  region: "Sub-Saharan Africa" },
  { code: "MDG", name: "Madagascar",         lat: -18.77, lng: 46.87,  region: "Sub-Saharan Africa" },
  { code: "MLI", name: "Mali",               lat: 17.57,  lng: -3.99,  region: "Sub-Saharan Africa" },
  { code: "BFA", name: "Burkina Faso",       lat: 12.36,  lng: -1.53,  region: "Sub-Saharan Africa" },
  { code: "TCD", name: "Chad",               lat: 15.45,  lng: 18.73,  region: "Sub-Saharan Africa" },
  // South & Southeast Asia
  { code: "BGD", name: "Bangladesh",         lat: 23.69,  lng: 90.36,  region: "South Asia" },
  { code: "IND", name: "India",              lat: 20.59,  lng: 78.96,  region: "South Asia" },
  { code: "PAK", name: "Pakistan",           lat: 30.38,  lng: 69.35,  region: "South Asia" },
  { code: "NPL", name: "Nepal",              lat: 28.39,  lng: 84.12,  region: "South Asia" },
  { code: "MMR", name: "Myanmar",            lat: 16.87,  lng: 96.17,  region: "Southeast Asia" },
  { code: "KHM", name: "Cambodia",           lat: 12.57,  lng: 104.99, region: "Southeast Asia" },
  { code: "LAO", name: "Laos",               lat: 19.86,  lng: 102.50, region: "Southeast Asia" },
  { code: "PHL", name: "Philippines",        lat: 12.88,  lng: 121.77, region: "Southeast Asia" },
  { code: "IDN", name: "Indonesia",          lat: -0.79,  lng: 113.92, region: "Southeast Asia" },
  // Latin America
  { code: "BOL", name: "Bolivia",            lat: -16.29, lng: -63.59, region: "Latin America" },
  { code: "GTM", name: "Guatemala",          lat: 15.78,  lng: -90.23, region: "Latin America" },
  { code: "HND", name: "Honduras",           lat: 15.20,  lng: -86.24, region: "Latin America" },
  { code: "HTI", name: "Haiti",              lat: 18.97,  lng: -72.29, region: "Latin America" },
  { code: "NIC", name: "Nicaragua",          lat: 12.87,  lng: -85.21, region: "Latin America" },
];

// ── Indicative fallback data (real data overlays this for configured countries) ──
const INDICATIVE_STATS: Record<string, Record<string, number>> = {
  youth_unemployment: {
    GHA: 12, NGA: 40, KEN: 17, ETH: 26, TZA: 14, UGA: 13, RWA: 22, SEN: 19,
    CIV: 21, CMR: 29, ZMB: 23, ZWE: 22, MOZ: 19, MDG: 31, MLI: 36, BFA: 34,
    TCD: 38, BGD: 11, IND: 23, PAK: 26, NPL: 18, MMR: 14, KHM: 6,  LAO: 16,
    PHL: 17, IDN: 16, BOL: 7,  GTM: 7,  HND: 11, HTI: 38, NIC: 9,
  },
  neet_rate: {
    GHA: 28, NGA: 52, KEN: 31, ETH: 44, TZA: 38, UGA: 37, RWA: 29, SEN: 46,
    CIV: 43, CMR: 41, ZMB: 48, ZWE: 44, MOZ: 53, MDG: 55, MLI: 60, BFA: 58,
    TCD: 65, BGD: 30, IND: 29, PAK: 41, NPL: 34, MMR: 24, KHM: 18, LAO: 27,
    PHL: 22, IDN: 21, BOL: 20, GTM: 28, HND: 32, HTI: 64, NIC: 26,
  },
  internet_pct: {
    GHA: 53, NGA: 55, KEN: 83, ETH: 24, TZA: 38, UGA: 26, RWA: 30, SEN: 57,
    CIV: 36, CMR: 35, ZMB: 32, ZWE: 34, MOZ: 22, MDG: 18, MLI: 19, BFA: 19,
    TCD: 6,  BGD: 44, IND: 69, PAK: 36, NPL: 48, MMR: 43, KHM: 54, LAO: 49,
    PHL: 67, IDN: 77, BOL: 48, GTM: 51, HND: 38, HTI: 32, NIC: 50,
  },
  automation_risk: {
    GHA: 55, NGA: 62, KEN: 48, ETH: 70, TZA: 66, UGA: 71, RWA: 52, SEN: 63,
    CIV: 60, CMR: 64, ZMB: 68, ZWE: 67, MOZ: 72, MDG: 74, MLI: 73, BFA: 75,
    TCD: 78, BGD: 57, IND: 44, PAK: 58, NPL: 64, MMR: 61, KHM: 56, LAO: 60,
    PHL: 42, IDN: 46, BOL: 53, GTM: 58, HND: 61, HTI: 76, NIC: 59,
  },
};

export type IndicatorKey = keyof typeof INDICATIVE_STATS;

export interface BubbleMapProps {
  indicator: IndicatorKey;
  realData?: Record<string, number>;   // override from live API (country_code -> value)
  height?: number;
}

function indicatorColor(indicator: IndicatorKey, value: number): string {
  if (indicator === "internet_pct") {
    // Higher = better
    if (value > 60) return "#22d3ee";
    if (value > 35) return "#f59e0b";
    return "#ef4444";
  }
  // Higher = worse (unemployment, neet, automation)
  if (value > 55) return "#ef4444";
  if (value > 30) return "#f59e0b";
  return "#22d3ee";
}

const INDICATOR_META: Record<IndicatorKey, { label: string; unit: string; description: string }> = {
  youth_unemployment: {
    label: "Youth Unemployment",
    unit:  "%",
    description: "Youth (15–24) unemployment rate (%)",
  },
  neet_rate: {
    label: "NEET Youth Rate",
    unit:  "%",
    description: "Youth not in Education, Employment, or Training (%)",
  },
  internet_pct: {
    label: "Internet Penetration",
    unit:  "%",
    description: "Internet users as % of population",
  },
  automation_risk: {
    label: "Automation Risk",
    unit:  "%",
    description: "Estimated occupational automation exposure (Frey-Osborne proxy)",
  },
};

export default function BubbleMap({ indicator, realData = {}, height = 440 }: BubbleMapProps) {
  const meta     = INDICATOR_META[indicator];
  const baseData = INDICATIVE_STATS[indicator];

  // Fix leaflet default icon issue in webpack builds
  useEffect(() => {
    // No marker icons needed (using CircleMarker only)
  }, []);

  return (
    <div style={{ height, width: "100%" }} className="rounded-xl overflow-hidden">
      <MapContainer
        center={[5, 20]}
        zoom={2}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", background: "#0f1117" }}
        zoomControl={true}
      >
        {/* Dark CartoDB tiles — no API key required */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {LMIC_COUNTRIES.map((country) => {
          const value   = realData[country.code] ?? baseData[country.code];
          if (value == null) return null;

          const isReal  = country.code in realData;
          const radius  = Math.max(6, Math.min(35, value * 0.55));
          const color   = indicatorColor(indicator, value);

          return (
            <CircleMarker
              key={country.code}
              center={[country.lat, country.lng]}
              radius={radius}
              fillColor={color}
              fillOpacity={isReal ? 0.85 : 0.45}
              color={isReal ? "white" : color}
              weight={isReal ? 1.5 : 0.5}
            >
              <Popup>
                <div style={{ minWidth: 160, fontFamily: "sans-serif" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: "#111827" }}>
                    {country.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                    {country.region}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      backgroundColor: color, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {meta.label}: {value}{meta.unit}
                    </span>
                  </div>
                  {isReal && (
                    <div style={{ fontSize: 11, color: "#0891b2", marginTop: 4 }}>
                      ✓ Live API data
                    </div>
                  )}
                  {!isReal && (
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                      Indicative estimate
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
