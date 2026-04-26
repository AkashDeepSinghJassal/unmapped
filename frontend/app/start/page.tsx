"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitProfile, parseCv } from "@/lib/api";
import CountrySelect from "@/components/CountrySelect";

const EDUCATION_LEVELS = [
  "Primary school",
  "Junior high school (JHS)",
  "Senior high school (SHS) / Secondary",
  "TVET / Vocational certificate",
  "Bachelor degree or above",
  "No formal education",
];

type CvState = "idle" | "parsing" | "done" | "error";

export default function StartPage() {
  const router    = useRouter();
  const fileRef   = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const [step, setStep]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const [cvState, setCvState]     = useState<CvState>("idle");
  const [cvError, setCvError]     = useState("");
  const [cvFilename, setCvFilename] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const [form, setForm] = useState({
    education_level: "",
    experience_text: "",
    country_code: "GHA",
  });

  const canNext =
    step === 1
      ? form.education_level !== "" && form.country_code !== ""
      : form.experience_text.trim().length > 20;

  // ── CV handling ─────────────────────────────────────────────────────────────
  async function handleCvFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "doc", "txt"].includes(ext ?? "")) {
      setCvError("Unsupported file type. Please upload PDF, DOCX, or TXT.");
      setCvState("error");
      return;
    }
    setCvState("parsing");
    setCvError("");
    setCvFilename(file.name);
    try {
      const result = await parseCv(file);
      setForm((f) => ({
        ...f,
        education_level: result.education_level || f.education_level,
        experience_text: result.experience_text || f.experience_text,
      }));
      setCvState("done");
    } catch (e) {
      setCvError(e instanceof Error ? e.message : "Failed to parse CV");
      setCvState("error");
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleCvFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleCvFile(file);
  }

  // ── Form submit ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const result = await submitProfile(form);
      sessionStorage.setItem("unmapped_result", JSON.stringify(result));
      router.push("/talent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1 text-xs text-blue-400 mb-4">
          Quick Form · 2 steps
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Map your skills to opportunities</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          Upload your CV for instant auto-fill, or fill in the form manually.
        </p>
      </div>

      {/* ── CV Upload zone ── */}
      <div className="mb-8">
        <div
          ref={dropRef}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => cvState !== "parsing" && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer ${
            isDragOver
              ? "border-blue-400 bg-blue-500/10"
              : cvState === "done"
              ? "border-emerald-500/50 bg-emerald-500/5"
              : cvState === "error"
              ? "border-red-500/40 bg-red-500/5"
              : cvState === "parsing"
              ? "border-blue-500/40 bg-blue-500/5 cursor-wait"
              : "border-gray-700 bg-gray-800/30 hover:border-gray-600 hover:bg-gray-800/50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={onFileInput}
          />

          {cvState === "idle" && (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-700/60 rounded-xl flex items-center justify-center shrink-0 text-2xl">
                📄
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200 mb-0.5">
                  Upload your CV <span className="text-gray-500 font-normal">(optional)</span>
                </div>
                <div className="text-xs text-gray-500">
                  Drag & drop or click · PDF, DOCX, TXT · max 5 MB
                </div>
                <div className="text-xs text-blue-400 mt-1">
                  AI will auto-fill education and experience fields
                </div>
              </div>
            </div>
          )}

          {cvState === "parsing" && (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                <span className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              </div>
              <div>
                <div className="text-sm font-medium text-blue-300">Parsing CV…</div>
                <div className="text-xs text-gray-500 mt-0.5">{cvFilename}</div>
                <div className="text-xs text-gray-600 mt-1">AI is extracting education & experience</div>
              </div>
            </div>
          )}

          {cvState === "done" && (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0 text-2xl">
                ✓
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-emerald-300">CV parsed — fields auto-filled</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{cvFilename}</div>
                <div className="text-xs text-gray-500 mt-1">Review the fields below and edit if needed.</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setCvState("idle"); setCvFilename(""); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0 px-2 py-1"
              >
                Remove
              </button>
            </div>
          )}

          {cvState === "error" && (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0 text-2xl">
                ✕
              </div>
              <div>
                <div className="text-sm font-medium text-red-300">Parse failed</div>
                <div className="text-xs text-red-400/80 mt-0.5">{cvError}</div>
                <div className="text-xs text-gray-500 mt-1">Click to try again with a different file</div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mt-5">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">or fill in manually</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="flex gap-2 mb-8">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-blue-500" : "bg-gray-700"}`} />
        ))}
      </div>

      {/* ── Step 1: Country + Education ── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Your country</label>
            <CountrySelect value={form.country_code} onChange={(code) => setForm((f) => ({ ...f, country_code: code }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Highest education completed
              {cvState === "done" && form.education_level && (
                <span className="ml-2 text-emerald-400 text-xs font-normal">← from CV</span>
              )}
            </label>
            <div className="space-y-2">
              {EDUCATION_LEVELS.map((level) => (
                <button key={level} onClick={() => setForm((f) => ({ ...f, education_level: level }))}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                    form.education_level === level
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"
                  }`}>
                  {level}
                </button>
              ))}
            </div>
          </div>

          <button disabled={!canNext} onClick={() => setStep(2)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors">
            Continue →
          </button>
        </div>
      )}

      {/* ── Step 2: Experience ── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tell us what you can do
              {cvState === "done" && form.experience_text && (
                <span className="ml-2 text-emerald-400 text-xs font-normal">← from CV</span>
              )}
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Review the auto-filled text or write your own. More detail = better skill match.
            </p>
            <textarea value={form.experience_text}
              onChange={(e) => setForm((f) => ({ ...f, experience_text: e.target.value }))}
              rows={7}
              placeholder="Example: I've been repairing smartphones for 5 years, taught basic coding to students using YouTube tutorials. I manage my own repair shop handling orders, suppliers and payments..."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" />
            <p className="text-xs text-gray-600 mt-1 text-right">{form.experience_text.length} characters</p>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{error}</div>}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="px-5 py-3 border border-gray-700 text-gray-300 hover:border-gray-600 rounded-xl text-sm transition-colors">
              ← Back
            </button>
            <button disabled={!canNext || loading} onClick={handleSubmit}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
              {loading
                ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mapping your skills…</>)
                : "Map my skills →"}
            </button>
          </div>
        </div>
      )}

      {/* Trust indicators */}
      <div className="mt-12 pt-6 border-t border-gray-800">
        <p className="text-xs text-gray-600 mb-3">Grounded in real data</p>
        <div className="flex flex-wrap gap-2">
          {["ILOSTAT", "World Bank WDI", "ESCO v1.2.1", "Frey-Osborne (2013)"].map((s) => (
            <span key={s} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-gray-400">{s}</span>
          ))}
        </div>
      </div>

    </div>
  );
}
