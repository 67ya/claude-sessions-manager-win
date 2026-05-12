import { useState, useEffect } from "react";
import { fetchUsage } from "../api";
import type { UsageSummary, UsageWindow } from "../types";

function fmtResetIn(resetsAt: string | null): string {
  if (!resetsAt) return "—";
  const remaining = new Date(resetsAt).getTime() - Date.now();
  if (remaining <= 0) return "resetting...";
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtResetAt(resetsAt: string | null): string {
  if (!resetsAt) return "—";
  return new Date(resetsAt).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function barColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function WindowCard({ title, icon, window }: { title: string; icon: React.ReactNode; window: UsageWindow }) {
  const pct = Math.min(window.utilization, 100);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-medium text-gray-400">{title}</h2>
      </div>

      {/* Big utilization number */}
      <div className="flex items-end justify-between">
        <div>
          <span className={`text-4xl font-bold ${pct >= 80 ? "text-red-400" : pct >= 50 ? "text-amber-400" : "text-gray-100"}`}>
            {window.utilization.toFixed(0)}
          </span>
          <span className="text-xl text-gray-500 ml-1">%</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">resets in</div>
          <div className="text-sm font-semibold text-gray-300">{fmtResetIn(window.resetsAt)}</div>
          <div className="text-xs text-gray-600">{fmtResetAt(window.resetsAt)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsage();
    const interval = setInterval(loadUsage, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadUsage = async () => {
    try {
      const data = await fetchUsage();
      setUsage(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load usage");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Usage Dashboard</h1>

      {error && (
        <div className="px-3 py-2 bg-red-900/30 text-red-300 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadUsage} className="hover:text-white">Retry</button>
        </div>
      )}

      {usage && (
        <>
          {/* Subscription Status */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Account</div>
                <div className="text-sm text-gray-200 truncate">{usage.activeUserEmail || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Plan</div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-purple-900/50 text-purple-300 capitalize">
                  {usage.subscriptionType || "—"}
                </span>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Token expires</div>
                <div className={`text-sm font-medium ${
                  usage.tokenExpiresIn === "expired" ? "text-red-400" :
                  usage.tokenExpiresIn?.startsWith("0") ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {usage.tokenExpiresIn ? `in ${usage.tokenExpiresIn}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Updated</div>
                <div className="text-xs text-gray-400">{new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          </div>

          {/* Window Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {usage.fiveHour ? (
              <WindowCard
                title="5-Hour Window"
                icon={
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                window={usage.fiveHour}
              />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-center text-gray-600 text-sm">
                No 5-hour data
              </div>
            )}

            {usage.sevenDay ? (
              <WindowCard
                title="7-Day Window"
                icon={
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                window={usage.sevenDay}
              />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-center text-gray-600 text-sm">
                No 7-day data
              </div>
            )}
          </div>

          {/* Opus window (if available) */}
          {usage.sevenDayOpus && (
            <WindowCard
              title="7-Day Opus Window"
              icon={
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
              window={usage.sevenDayOpus}
            />
          )}

          {/* Extra usage */}
          {usage.extraUsage?.isEnabled && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-medium text-gray-400">Extra Usage (Pay-as-you-go)</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Used</div>
                  <div className="text-lg font-semibold text-gray-200">
                    ${(usage.extraUsage.usedCredits ?? 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Limit</div>
                  <div className="text-lg font-semibold text-gray-200">
                    ${(usage.extraUsage.monthlyLimit ?? 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Utilization</div>
                  <div className="text-lg font-semibold text-gray-200">
                    {usage.extraUsage.utilization?.toFixed(0) ?? 0}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
