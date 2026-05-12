import { useState, useEffect, useCallback, useRef } from "react";
import type { SessionInfo, SessionDetail, ProfileInfo } from "../types";
import { fetchSessions, fetchSessionDetail, fetchGlobalMode, switchGlobalMode, getProcessingSessions, forceUnstickSession, fetchUsers, switchProfile } from "../api";
import SessionList from "../components/sessions/SessionList";
import SessionDetailPanel from "../components/sessions/SessionDetail";
import SearchBar from "../components/sessions/SearchBar";
import GithubPanel from "../components/sessions/GithubPanel";

interface Props {
  showToast: (msg: string) => void;
}

export default function SessionsPage({ showToast }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [archivedFilter, setArchivedFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sort, setSort] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Global mode state
  const [globalMode, setGlobalMode] = useState<"api" | "subscription" | "unknown">("unknown");
  const [modeSwitching, setModeSwitching] = useState(false);

  // Profile picker for switching to subscription
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Blocked sessions dialog
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [blockedSessions, setBlockedSessions] = useState<Array<{
    id: string;
    customName?: string;
    title: string;
    currentMode: string;
    messageCount: number;
  }>>([]);
  const [unstickBusy, setUnstickBusy] = useState<Set<string>>(new Set());

  const loadMode = useCallback(async () => {
    try {
      const m = await fetchGlobalMode();
      setGlobalMode(m.mode);
    } catch {}
  }, []);

  useEffect(() => { loadMode(); }, [loadMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessions({
        search: search || undefined,
        category: catFilter || undefined,
        archived: archivedFilter || undefined,
        sort: sort || undefined,
      });
      setSessions(data.sessions);
      setCategories(data.categories);
    } catch (e: any) {
      showToast(e.message || "Failed to load sessions");
    }
    setLoading(false);
  }, [search, catFilter, archivedFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const d = await fetchSessionDetail(id);
      setDetail(d);
    } catch {
      showToast("Failed to load session detail");
    }
    setDetailLoading(false);
  };

  const handleMetaChange = () => {
    load();
    if (selectedId) handleSelect(selectedId);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    }
  };

  const handleBulkAction = () => {
    setSelectedIds(new Set());
    load();
  };

  const handleGlobalSwitch = async () => {
    const target = globalMode === "api" ? "subscription" : "api";

    if (target === "subscription") {
      // Show profile picker instead of immediately switching
      try {
        const data = await fetchUsers();
        setProfiles(data.profiles);
        setActiveProfile(data.activeProfile);
        if (data.profiles.length === 0) {
          showToast("No saved profiles. Please add one in Settings → Users first.");
          return;
        }
        setShowProfilePicker(true);
      } catch { showToast("Failed to load profiles"); }
      return;
    }

    // Switching to API mode — no profile needed
    setModeSwitching(true);
    try {
      const res = await switchGlobalMode(target);
      if (res.success) {
        setGlobalMode(target);
        showToast(`Global mode → ${target === "api" ? "DeepSeek API" : "Claude Subscription"}`);
        load();
      }
    } catch (e: any) {
      try {
        const sessions = await getProcessingSessions();
        if (sessions.sessions && sessions.sessions.length > 0) {
          setBlockedSessions(sessions.sessions);
          setShowBlockedDialog(true);
        } else {
          showToast("Switch failed: " + (e.message || "unknown"));
        }
      } catch {
        showToast("Switch failed: " + (e.message || "unknown"));
      }
    }
    setModeSwitching(false);
  };

  const handleProfileSwitch = async (name: string) => {
    setShowProfilePicker(false);
    setModeSwitching(true);
    try {
      // First restore the profile's OAuth files
      const r = await switchProfile(name);
      if (!r.success) { showToast("Profile switch failed"); setModeSwitching(false); return; }
      // Then switch global mode to subscription
      const res = await switchGlobalMode("subscription");
      if (res.success) {
        setGlobalMode("subscription");
        setActiveProfile(name);
        showToast(`Global mode → Claude Subscription (${name})`);
        load();
      }
    } catch (e: any) {
      try {
        const sessions = await getProcessingSessions();
        if (sessions.sessions && sessions.sessions.length > 0) {
          setBlockedSessions(sessions.sessions);
          setShowBlockedDialog(true);
        } else {
          showToast("Switch failed: " + (e.message || "unknown"));
        }
      } catch {
        showToast("Switch failed: " + (e.message || "unknown"));
      }
    }
    setModeSwitching(false);
  };

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowProfilePicker(false);
      }
    };
    if (showProfilePicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfilePicker]);

  const handleForceUnstick = async (sessionId: string) => {
    setUnstickBusy((prev) => new Set(prev).add(sessionId));
    try {
      await forceUnstickSession(sessionId);
      showToast("Session unstuck. You can now retry the switch.");
      // Remove from blocked list
      setBlockedSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e: any) {
      showToast("Unstick failed: " + (e.message || "unknown"));
    }
    setUnstickBusy((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  };

  const handleRetrySwitch = () => {
    setShowBlockedDialog(false);
    // Retry after a brief delay to let state settle
    setTimeout(() => {
      const target = globalMode === "api" ? "subscription" : "api";
      setModeSwitching(true);
      switchGlobalMode(target)
        .then((res) => {
          if (res.success) {
            setGlobalMode(target);
            showToast(`Global mode → ${target === "api" ? "DeepSeek API" : "Claude Subscription"}`);
            load();
          }
        })
        .catch((e: any) => {
          showToast("Switch failed: " + (e.message || "unknown"));
        })
        .finally(() => setModeSwitching(false));
    }, 500);
  };

  return (
    <>
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-30">
        <div className="px-2 md:px-4 py-2 md:py-3 flex items-center gap-2 md:gap-4 flex-wrap">
          <SearchBar
            search={search}
            onSearch={setSearch}
            categories={categories}
            catFilter={catFilter}
            onCatFilter={setCatFilter}
            archivedFilter={archivedFilter}
            onArchivedFilter={setArchivedFilter}
            sort={sort}
            onSort={setSort}
            providerFilter={providerFilter}
            onProviderFilter={setProviderFilter}
          />
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowGithub(true)}
                className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-500 transition-colors"
              >
                Sync {selectedIds.size} to GitHub
              </button>
            )}
            <button
              onClick={() => setShowGithub(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              GitHub
            </button>
          </div>
          {/* Global Mode Toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <span
              className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                globalMode === "api"
                  ? "bg-blue-900/60 text-blue-300"
                  : globalMode === "subscription"
                    ? "bg-green-900/60 text-green-300"
                    : "bg-gray-700 text-gray-400"
              }`}
            >
              {globalMode === "api" ? "API" : globalMode === "subscription" ? "Sub" : "..."}
            </span>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={handleGlobalSwitch}
                disabled={modeSwitching || globalMode === "unknown"}
                className="px-3 py-1 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors"
              >
                {modeSwitching ? "⏳" : "🔄"} Switch to {globalMode === "api" ? "Sub" : "API"}
              </button>
              {showProfilePicker && (
                <div className="absolute top-full mt-1 right-0 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 py-1">
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">Pick a profile</div>
                  {profiles.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => handleProfileSwitch(p.name)}
                      disabled={modeSwitching}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 disabled:opacity-50 flex items-center justify-between ${
                        activeProfile === p.name ? "bg-gray-700" : ""
                      }`}
                    >
                      <div>
                        <span className="text-white">{p.name}</span>
                        <span className="text-gray-500 ml-2">{p.email}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.subscriptionType && (
                          <span className={`px-1 py-0 text-[10px] rounded ${
                            p.subscriptionType === "pro" ? "bg-purple-900/50 text-purple-300"
                            : p.subscriptionType === "max" ? "bg-amber-900/50 text-amber-300"
                            : "bg-gray-700 text-gray-400"
                          }`}>{p.subscriptionType}</span>
                        )}
                        {p.hasToken ? (
                          p.tokenExpiresAt && p.tokenExpiresAt > Date.now() ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="Token valid" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Token expired" />
                          )
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" title="No token" />
                        )}
                        {activeProfile === p.name && (
                          <span className="text-green-400 text-[10px]">active</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500 hidden md:block">{sessions.length} sessions</div>
        </div>
      </header>

      {/* Main */}
      <main className="px-2 md:px-4 py-4 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
          </div>
        ) : (() => {
          const filtered = providerFilter
            ? sessions.filter((s) => (s.provider || "unknown") === providerFilter)
            : sessions;
          if (filtered.length === 0) {
            return (
              <div className="text-center py-20 text-gray-500">
                <p className="text-lg">No sessions found</p>
                <p className="text-sm mt-2">
                  {archivedFilter === "only"
                    ? "No archived sessions"
                    : providerFilter
                      ? "No sessions with this provider"
                      : "All clear — start a new Claude Code session"}
                </p>
              </div>
            );
          }
          return (
            <SessionList
              sessions={filtered}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              allSelected={selectedIds.size === filtered.length && filtered.length > 0}
              onMetaChange={handleMetaChange}
              onBulkAction={handleBulkAction}
              showToast={showToast}
            />
          );
        })()}
      </main>

      {/* Detail Panel */}
      {selectedId && (
        <SessionDetailPanel
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          onMetaChange={handleMetaChange}
          showToast={showToast}
        />
      )}

      {/* GitHub Panel */}
      {showGithub && (
        <GithubPanel
          sessionIds={Array.from(selectedIds)}
          sessions={sessions}
          onClose={() => setShowGithub(false)}
          showToast={showToast}
        />
      )}

      {/* Blocked Sessions Dialog */}
      {showBlockedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">⏸️</span>
              <div>
                <h2 className="text-lg font-semibold">Cannot Switch Mode</h2>
                <p className="text-sm text-gray-400">
                  {blockedSessions.length} session(s) have unanswered messages. A global mode switch would disrupt them.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {blockedSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium truncate">
                      {s.customName || s.title || s.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {s.messageCount} msgs · Mode: <span className={s.currentMode === "api" ? "text-blue-400" : "text-green-400"}>
                        {s.currentMode || "unknown"}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleForceUnstick(s.id)}
                    disabled={unstickBusy.has(s.id)}
                    className="px-3 py-1 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {unstickBusy.has(s.id) ? "⏳" : "🔓"} Force Unstick
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBlockedDialog(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              {blockedSessions.length === 0 && (
                <button
                  onClick={handleRetrySwitch}
                  disabled={modeSwitching}
                  className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors"
                >
                  {modeSwitching ? "⏳" : "🔄"} Retry Switch
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
