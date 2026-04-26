const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ProfileRequest {
  education_level: string;
  experience_text: string;
  country_code: string;
}

export interface MappedSkill {
  uri: string;
  label: string;
  confidence: number;
  why: string;
}

export interface AdjacentSkill {
  label: string;
  rationale: string;
}

export interface Passport {
  isco_major_group: number;
  isco_label: string;
  mapped_skills: MappedSkill[];
  adjacent_skills: AdjacentSkill[];
  profile_summary: string;
  education_level: string;
  country: string;
  data_sources: string[];
  limitations: string;
}

export interface EconSignal {
  value: number | null;
  currency?: string;
  unit?: string;
  period?: string;
  source: string;
  year: number | null;
}

export interface Opportunity {
  title: string;
  type: "formal_job" | "gig" | "self_employment" | "training";
  sector: string;
  wage_floor_signal: EconSignal;
  growth_signal: EconSignal;
  fit_score: number;
  gap: string | null;
  plain_explanation: string;
}

export interface OpportunitiesResult {
  opportunities: Opportunity[];
  econometric_summary: string;
  data_note: string;
  raw_signals: {
    wages: Record<string, unknown>[];
    growth: Record<string, unknown>[];
    hci: Record<string, unknown>;
  };
  country_code: string;
  data_sources: string[];
}

export interface ProfileResponse {
  profile_id: string;
  passport: Passport;
  opportunities: OpportunitiesResult;
  error?: string;
}

export interface KeySignal {
  label: string;
  value: number | null;
  unit?: string;
  year?: number;
  source: string;
}

export interface DashboardResponse {
  country_code: string;
  country_name: string;
  narrative: string;
  key_signals: KeySignal[];
  charts: {
    employment_trends: Record<string, unknown>[];
    wage_trends: Record<string, unknown>[];
    automation_risk: { label: string; avg_automation_prob: number; isco_group: number }[];
  };
  data_sources: string[];
}

export async function submitProfile(req: ProfileRequest): Promise<ProfileResponse> {
  const res = await fetch(`${API_BASE}/api/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getDashboard(country_code: string): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE}/api/dashboard?country_code=${country_code}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getConfigs(): Promise<{
  configs: { country_code: string; country_name: string; region: string }[];
}> {
  const res = await fetch(`${API_BASE}/api/configs`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatRequest {
  session_id: string;
  message: string;
  country_code: string;
}

export interface ChatResponse {
  reply: string;
  is_complete: boolean;
  profile_id?: string;
  passport?: Passport;
  opportunities?: OpportunitiesResult;
  error?: string;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function resetChat(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/chat/${sessionId}`, { method: "DELETE" });
}

// ── Signals (Regional Compare) ───────────────────────────────────────────────

export interface SignalValue {
  value: number | null;
  year?: number;
  description?: string;
  category?: string;
}

export async function getSignals(
  countryCode: string
): Promise<Record<string, SignalValue>> {
  const res = await fetch(`${API_BASE}/api/signals?country_code=${countryCode}`);
  if (!res.ok) throw new Error(`Signals API error: ${res.status}`);
  const data = await res.json();
  return data.signals ?? {};
}

// ── CV Parser ─────────────────────────────────────────────────────────────────

export interface CvParseResult {
  education_level: string;
  experience_text: string;
  chars_extracted: number;
  filename: string;
}

export async function parseCv(file: File): Promise<CvParseResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/parse-cv`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `API error: ${res.status}`);
  }
  return res.json();
}
