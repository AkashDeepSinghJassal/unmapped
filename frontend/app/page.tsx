"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitProfile } from "@/lib/api";
import CountrySelect from "@/components/CountrySelect";

const EDUCATION_LEVELS = [
  "Primary school",
  "Junior high school (JHS)",
  "Senior high school (SHS) / Secondary",
  "TVET / Vocational certificate",
  "Bachelor degree or above",
  "No formal education",
];

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    education_level: "",
    experience_text: "",
    country_code: "GHA",
  });

  const canNext =
    step === 1
      ? form.education_level !== "" && form.country_code !== ""
      : form.experience_text.trim().length > 20;

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const result = await submitProfile(form);
      // Store result in sessionStorage for the results page
      sessionStorage.setItem("unmapped_result", JSON.stringify(result));
      router.push("/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1 text-xs text-blue-400 mb-4">
          World Bank Youth Summit · HackNation 5
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          Map your skills to real opportunities
        </h1>
        <p className="text-gray-400 text-base leading-relaxed">
          Tell us about your education and experience. We&apos;ll match you to
          real jobs, gig work, and training — grounded in actual labour market
          data, not guesses.
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-blue-500" : "bg-gray-700"
            }`}
          />
        ))}
      </div>

      {/* Step 1 — Location + Education */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your country
            </label>
            <CountrySelect
              value={form.country_code}
              onChange={(code) => setForm((f) => ({ ...f, country_code: code }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Highest education completed
            </label>
            <div className="space-y-2">
              {EDUCATION_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    setForm((f) => ({ ...f, education_level: level }))
                  }
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                    form.education_level === level
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!canNext}
            onClick={() => setStep(2)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* Step 2 — Experience */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tell us what you can do
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Describe your work experience, informal jobs, things you&apos;ve
              taught yourself, or projects you&apos;ve done. The more detail, the
              better your match.
            </p>
            <textarea
              value={form.experience_text}
              onChange={(e) =>
                setForm((f) => ({ ...f, experience_text: e.target.value }))
              }
              rows={6}
              placeholder="Example: I've been repairing smartphones for 5 years, mostly screen replacements and software fixes. I taught basic coding to students using YouTube tutorials. I also manage my own repair shop — handle orders, suppliers, and payments..."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
            <p className="text-xs text-gray-600 mt-1 text-right">
              {form.experience_text.length} characters
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 border border-gray-700 text-gray-300 hover:border-gray-600 rounded-xl text-sm transition-colors"
            >
              ← Back
            </button>
            <button
              disabled={!canNext || loading}
              onClick={handleSubmit}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Mapping your skills…
                </>
              ) : (
                "Map my skills →"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Trust indicators */}
      <div className="mt-12 pt-6 border-t border-gray-800">
        <p className="text-xs text-gray-600 mb-3">Grounded in real data</p>
        <div className="flex flex-wrap gap-2">
          {["ILOSTAT", "World Bank WDI", "ESCO v1.2.1", "Frey-Osborne (2013)"].map(
            (s) => (
              <span
                key={s}
                className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-gray-400"
              >
                {s}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
