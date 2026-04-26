"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendChatMessage,
  resetChat,
  type ChatResponse,
  type Passport,
  type OpportunitiesResult,
  type Opportunity,
} from "@/lib/api";
import CountrySelect from "@/components/CountrySelect";

// ── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "bot";

interface Message {
  id: string;
  role: Role;
  text: string;
  /** Only set on the final bot message when analysis is complete */
  analysis?: {
    passport: Passport;
    opportunities: OpportunitiesResult;
    profile_id: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

const TYPE_BADGE: Record<Opportunity["type"], string> = {
  formal_job:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
  gig:             "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  self_employment: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  training:        "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const TYPE_LABEL: Record<Opportunity["type"], string> = {
  formal_job:      "Formal Job",
  gig:             "Gig / Freelance",
  self_employment: "Self-employment",
  training:        "Training",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function SkillPassportCard({ passport }: { passport: Passport }) {
  return (
    <div className="mt-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-blue-300">Skills Passport</span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
          ISCO-{passport.isco_major_group} · {passport.isco_label}
        </span>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">{passport.profile_summary}</p>

      <div className="space-y-2">
        {passport.mapped_skills.slice(0, 5).map((skill) => (
          <div key={skill.uri} className="flex items-start gap-2">
            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-200 font-medium">{skill.label}</span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1.5 rounded-full bg-blue-500/40"
                    style={{ width: `${Math.round(skill.confidence * 48)}px` }}
                  />
                  <span className="text-xs text-gray-500">{Math.round(skill.confidence * 100)}%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{skill.why}</p>
            </div>
          </div>
        ))}
      </div>

      {passport.adjacent_skills?.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Next skills to develop:</p>
          <div className="flex flex-wrap gap-1.5">
            {passport.adjacent_skills.map((s) => (
              <span key={s.label} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-2.5 py-1 text-gray-300">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpportunitiesCard({ opportunities }: { opportunities: OpportunitiesResult }) {
  return (
    <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-emerald-300">Top Opportunities</span>
      </div>

      <div className="space-y-3">
        {opportunities.opportunities.slice(0, 4).map((opp, i) => (
          <div key={i} className="bg-gray-800/60 rounded-xl p-3 space-y-1.5">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-100">{opp.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_BADGE[opp.type]}`}>
                {TYPE_LABEL[opp.type]}
              </span>
              <span className="ml-auto text-xs font-bold text-emerald-400">{opp.fit_score}/10</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{opp.plain_explanation}</p>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {opp.wage_floor_signal?.value != null && (
                <span>
                  💰 {opp.wage_floor_signal.currency ?? ""}{opp.wage_floor_signal.value.toLocaleString()}/mo
                  {opp.wage_floor_signal.year ? ` (${opp.wage_floor_signal.year})` : ""}
                </span>
              )}
              {opp.growth_signal?.value != null && (
                <span>📈 {opp.growth_signal.value}% growth</span>
              )}
              {opp.gap && <span className="text-yellow-600">⚠ {opp.gap}</span>}
            </div>
          </div>
        ))}
      </div>

      {opportunities.econometric_summary && (
        <p className="text-xs text-gray-500 leading-relaxed pt-1 border-t border-gray-700/50">
          {opportunities.econometric_summary}
        </p>
      )}
    </div>
  );
}

function BotMessage({ msg }: { msg: Message }) {
  return (
    <div className="flex gap-3 max-w-[85%]">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-xs font-bold">U</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-gray-800/70 border border-gray-700/60 rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>

        {/* Inline analysis cards */}
        {msg.analysis && (
          <div className="mt-1">
            <SkillPassportCard passport={msg.analysis.passport} />
            <OpportunitiesCard opportunities={msg.analysis.opportunities} />
            <div className="mt-3 flex gap-2">
              <a
                href={`/talent?profile_id=${msg.analysis.profile_id}`}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                View full results →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className="flex gap-3 max-w-[80%] ml-auto flex-row-reverse">
      <div className="w-8 h-8 rounded-xl bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-3">
        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.text}</p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [countryCode, setCountryCode] = useState("GHA");
  const [sessionId]                 = useState(uid);
  const [isDone, setIsDone]         = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Greet on mount
  useEffect(() => {
    const greeting: Message = {
      id:   uid(),
      role: "bot",
      text: "Hi! 👋 I'm your AI career advisor. I'll help map your skills to real job opportunities.\n\nTo get started — tell me a bit about yourself. What kind of work or activities have you been doing recently?",
    };
    setMessages([greeting]);
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || isDone) return;

    const userMsg: Message = { id: uid(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res: ChatResponse = await sendChatMessage({
        session_id:   sessionId,
        message:      text,
        country_code: countryCode,
      });

      const botMsg: Message = {
        id:   uid(),
        role: "bot",
        text: res.reply,
        ...(res.is_complete && res.passport && res.opportunities
          ? {
              analysis: {
                passport:      res.passport,
                opportunities: res.opportunities,
                profile_id:    res.profile_id ?? "",
              },
            }
          : {}),
      };

      setMessages((prev) => [...prev, botMsg]);

      if (res.is_complete) {
        setIsDone(true);
        // Also persist to sessionStorage so /results can read it
        if (res.passport && res.opportunities) {
          sessionStorage.setItem(
            "unmapped_result",
            JSON.stringify({
              passport:      res.passport,
              opportunities: res.opportunities,
              profile_id:    res.profile_id,
            })
          );
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id:   uid(),
          role: "bot",
          text: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function startOver() {
    await resetChat(sessionId);
    setMessages([
      {
        id:   uid(),
        role: "bot",
        text: "Let's start fresh! Tell me about your work or skills.",
      },
    ]);
    setIsDone(false);
    setInput("");
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-10rem)]">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div>
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1 text-xs text-blue-400 mb-1">
            AI Career Advisor · Chat
          </div>
          <p className="text-xs text-gray-500">
            Have a conversation — the AI will ask follow-up questions then map your skills.
          </p>
        </div>

        {/* Country picker */}
        <div className="ml-auto shrink-0">
          <CountrySelect
            value={countryCode}
            onChange={setCountryCode}
            disabled={loading || isDone}
            variant="pill"
          />
        </div>
      </div>

      {/* ── Message thread ── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.map((msg) =>
          msg.role === "bot" ? (
            <BotMessage key={msg.id} msg={msg} />
          ) : (
            <UserMessage key={msg.id} msg={msg} />
          )
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">U</span>
            </div>
            <div className="bg-gray-800/70 border border-gray-700/60 rounded-2xl rounded-tl-sm">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="shrink-0 pt-3 border-t border-gray-800">
        {isDone ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-gray-400 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3">
              Analysis complete ✓
            </div>
            <button
              onClick={startOver}
              className="px-4 py-3 border border-gray-700 text-gray-300 hover:border-gray-600 rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              Start over
            </button>
            <button
              onClick={() => router.push("/talent")}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
            >
              Full results →
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
              placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
              className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none transition-colors disabled:opacity-50"
              style={{ maxHeight: "120px", overflowY: "auto" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        )}

        <p className="text-xs text-gray-700 mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
