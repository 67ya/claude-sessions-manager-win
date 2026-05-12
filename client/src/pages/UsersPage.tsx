import { useState, useEffect, useRef, useCallback } from "react";
import { fetchUsers, saveProfile, switchProfile, deleteProfile, updateProfileMeta, switchMode, updateApiConfig, loginStart, loginCancel, loginSubmit, refreshToken } from "../api";
import type { UsersResponse, ProfileInfo, LoginState } from "../types";

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const profilePickerRef = useRef<HTMLDivElement>(null);

  // API config
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [apiModel, setApiModel] = useState("");
  const [showApiConfig, setShowApiConfig] = useState(false);

  // OAuth login
  const [loginState, setLoginState] = useState<LoginState>({ status: "idle", url: null, message: "" });
  const [loginCode, setLoginCode] = useState("");
  const [loginForProfile, setLoginForProfile] = useState("");
  const [loginPolling, setLoginPolling] = useState(false);

  // Tags/label editing
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // SSE ref
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const d = await fetchUsers();
      setData(d);
      setApiKey(d.apiConfig.apiKey);
      setApiBase(d.apiConfig.baseUrl);
      setApiModel(d.apiConfig.model);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    }
    setLoading(false);
  };

  const stopSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoginPolling(false);
  }, []);

  const startLoginPolling = useCallback(() => {
    stopSSE();
    setLoginPolling(true);
    const es = new EventSource("/api/users/login/stream");
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const state: LoginState = JSON.parse(e.data);
        setLoginState(state);
        if (state.status === "done" || state.status === "error" || (state as any).status === "timeout") {
          es.close();
          eventSourceRef.current = null;
          setLoginPolling(false);
          if (state.status === "done") {
            setLoginCode("");
            setLoginForProfile("");
            load();
          }
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setLoginPolling(false);
    };
  }, [stopSSE]);

  useEffect(() => {
    return () => stopSSE();
  }, [stopSSE]);

  // Close profile picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profilePickerRef.current && !profilePickerRef.current.contains(e.target as Node)) {
        setShowProfilePicker(false);
      }
    };
    if (showProfilePicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfilePicker]);

  const handleSwitch = async (mode: "api" | "subscription", profileName?: string) => {
    setSwitching(true);
    try {
      await switchMode({ mode, profileName });
      await load();
    } catch (e: any) {
      setError(e.message || "Switch failed");
    }
    setSwitching(false);
  };

  const handleLoginStart = async (updateProfile?: string) => {
    try {
      const res = await loginStart(updateProfile);
      setLoginForProfile(updateProfile || "");
      // Start SSE to track status
      startLoginPolling();
    } catch (e: any) {
      setError(e.message || "Login start failed");
    }
  };

  const handleLoginSubmit = async () => {
    if (!loginCode.trim()) {
      setError("Please enter the authorization code");
      return;
    }
    try {
      await loginSubmit(loginCode.trim());
      // SSE will pick up the result
    } catch (e: any) {
      setError(e.message || "Login submit failed");
    }
  };

  const handleLoginCancel = async () => {
    try {
      await loginCancel();
      stopSSE();
      setLoginState({ status: "idle", url: null, message: "" });
      setLoginCode("");
    } catch {}
  };

  const handleSaveAsProfile = async (name: string) => {
    try {
      await saveProfile(name);
      await load();
    } catch (e: any) {
      setError(e.message || "Save profile failed");
    }
  };

  const handleSwitchProfile = async (name: string) => {
    await handleSwitch("subscription", name);
  };

  const handleDeleteProfile = async (name: string) => {
    if (!confirm(`Delete profile "${name}"? This removes the saved tokens and metadata.`)) return;
    try {
      await deleteProfile(name);
      await load();
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const handleRefreshToken = async (name: string) => {
    try {
      const res = await refreshToken(name);
      if (res.ok) {
        await load();
      } else {
        setError(res.error || "Refresh failed");
      }
    } catch (e: any) {
      setError(e.message || "Refresh failed");
    }
  };

  const handleSaveTags = async (name: string) => {
    try {
      const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
      await updateProfileMeta(name, { tags });
      await load();
      setEditingTags(null);
    } catch (e: any) {
      setError(e.message || "Save tags failed");
    }
  };

  const handleSaveLabel = async (name: string, label: string) => {
    try {
      await updateProfileMeta(name, { label: label || undefined });
      await load();
    } catch (e: any) {
      setError(e.message || "Save label failed");
    }
  };

  const handleSaveApiConfig = async () => {
    try {
      await updateApiConfig({ apiKey, baseUrl: apiBase, model: apiModel });
      await load();
      setShowApiConfig(false);
    } catch (e: any) {
      setError(e.message || "Save config failed");
    }
  };

  const formatExpiry = (ts: number | null) => {
    if (!ts) return "N/A";
    const remaining = ts - Date.now();
    if (remaining <= 0) return "Expired";
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (parts.length === 0) parts.push(`${mins}m`);
    return parts.join(" ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Provider & Users</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600"
          >
            API Config
          </button>
          <button
            onClick={() => handleLoginStart()}
            disabled={loginPolling}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
          >
            {loginPolling ? "⏳ Login in progress..." : "🔑 OAuth Login"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/30 text-red-300 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-white ml-2">x</button>
        </div>
      )}

      {/* OAuth Login Panel */}
      {(loginState.status !== "idle" || loginPolling) && (
        <div className="bg-gray-900 border border-purple-800/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-purple-300">
              OAuth Login {loginForProfile ? `→ ${loginForProfile}` : ""}
            </h2>
            <button onClick={handleLoginCancel} className="text-xs text-gray-500 hover:text-white">
              Cancel
            </button>
          </div>

          {loginState.status === "waiting_code" && (
            <div className="space-y-3">
              {loginState.url && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">1. Open this URL in your browser:</p>
                  <a
                    href={loginState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-400 underline break-all hover:text-blue-300"
                  >
                    {loginState.url}
                  </a>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-gray-400">2. After authorization, paste the redirect URL or code:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                    placeholder="Paste the full redirect URL or authorization code..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-500"
                    onKeyDown={(e) => e.key === "Enter" && handleLoginSubmit()}
                  />
                  <button
                    onClick={handleLoginSubmit}
                    className="px-4 py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}

          {loginState.status === "submitting" && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full" />
              Verifying...
            </div>
          )}

          {loginState.status === "done" && (
            <div className="text-sm text-green-400">Login successful! Tokens saved.</div>
          )}

          {loginState.status === "error" && (
            <div className="text-sm text-red-400">{loginState.message || "Login failed"}</div>
          )}
        </div>
      )}

      {/* API Config Panel */}
      {showApiConfig && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-400">DeepSeek API Configuration</h2>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Base URL</label>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Model</label>
              <input
                type="text"
                value={apiModel}
                onChange={(e) => setApiModel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              onClick={handleSaveApiConfig}
              className="w-full py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500"
            >
              Save API Config
            </button>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-gray-400">Active Mode:</span>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => handleSwitch("api")}
              disabled={switching}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                data?.activeMode === "api"
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              DeepSeek API
            </button>
            <div className="relative" ref={profilePickerRef}>
              <button
                onClick={() => setShowProfilePicker(!showProfilePicker)}
                disabled={switching}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  data?.activeMode === "subscription"
                    ? "bg-green-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {data?.activeMode === "subscription" && data?.activeProfile
                  ? `Subscription (${data.activeProfile})`
                  : "Subscription"}
              </button>
              {showProfilePicker && (
                <div className="absolute top-full mt-1 left-0 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 py-1">
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">Pick a profile</div>
                  {(data?.profiles || []).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">No saved profiles</div>
                  )}
                  {(data?.profiles || []).map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setShowProfilePicker(false);
                        handleSwitch("subscription", p.name);
                      }}
                      disabled={switching}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 disabled:opacity-50 flex items-center justify-between ${
                        data?.activeProfile === p.name ? "bg-gray-700" : ""
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
                        {data?.activeProfile === p.name && (
                          <span className="text-green-400 text-[10px]">active</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {switching && (
            <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full" />
          )}
          {data?.currentUser.email && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>{data.currentUser.email}</span>
              {data.currentUser.subscriptionType && (
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  data.currentUser.subscriptionType === "pro" ? "bg-purple-900/50 text-purple-300"
                  : data.currentUser.subscriptionType === "max" ? "bg-amber-900/50 text-amber-300"
                  : "bg-gray-800 text-gray-400"
                }`}>
                  {data.currentUser.subscriptionType}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profiles List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400">
            Saved Profiles ({data?.profiles.length || 0})
          </h2>
          {data?.currentUser.email && (
            <button
              onClick={() => {
                const name = prompt("Profile name (letters, digits, dash, underscore):");
                if (name) handleSaveAsProfile(name);
              }}
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600"
            >
              + Save Current
            </button>
          )}
        </div>

        {!data?.profiles.length ? (
          <p className="text-xs text-gray-600">
            No saved profiles. Use "OAuth Login" or "Save Current" to create one.
          </p>
        ) : (
          data.profiles.map((p) => (
            <div
              key={p.name}
              className={`bg-gray-900 border rounded-xl p-4 space-y-2 ${
                data.activeProfile === p.name
                  ? "border-green-800/50 ring-1 ring-green-500/30"
                  : "border-gray-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-200">{p.name}</span>
                    {data.activeProfile === p.name && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-green-900/50 text-green-300">Active</span>
                    )}
                    {p.hasToken && p.tokenExpiresAt && p.tokenExpiresAt > Date.now() && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-green-900/30 text-green-400">
                        {formatExpiry(p.tokenExpiresAt)}
                      </span>
                    )}
                    {p.hasToken && p.tokenExpiresAt && p.tokenExpiresAt <= Date.now() && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/30 text-red-400">Expired</span>
                    )}
                    {!p.hasToken && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-500">No token</span>
                    )}
                    {p.subscriptionType && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        p.subscriptionType === "pro" ? "bg-purple-900/50 text-purple-300"
                        : p.subscriptionType === "max" ? "bg-amber-900/50 text-amber-300"
                        : "bg-gray-800 text-gray-400"
                      }`}>
                        {p.subscriptionType}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{p.email}</div>
                  {p.displayName && <div className="text-xs text-gray-600">{p.displayName}</div>}

                  {/* Tags */}
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {editingTags === p.name ? (
                      <div className="flex gap-1 items-center">
                        <input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveTags(p.name)}
                          placeholder="comma, separated, tags"
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-purple-500 w-40"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveTags(p.name)}
                          className="px-2 py-0.5 text-xs bg-purple-600 rounded hover:bg-purple-500"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTags(null)}
                          className="px-1 text-xs text-gray-500 hover:text-white"
                        >
                          x
                        </button>
                      </div>
                    ) : (
                      <>
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300"
                          >
                            {t}
                          </span>
                        ))}
                        {p.label && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/50 text-amber-300">
                            {p.label}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingTags(p.name);
                            setTagInput([...(p.label ? [p.label] : []), ...p.tags].join(", "));
                          }}
                          className="px-1.5 py-0.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-white"
                          title="Edit tags/label"
                        >
                          + tag
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {data.activeProfile !== p.name && (
                    <button
                      onClick={() => handleSwitchProfile(p.name)}
                      disabled={switching}
                      className="px-2 py-1 text-xs rounded bg-green-800 hover:bg-green-700 text-green-200 disabled:opacity-50"
                    >
                      Switch
                    </button>
                  )}
                  {p.hasToken && (
                    <button
                      onClick={() => handleRefreshToken(p.name)}
                      className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-blue-900 text-gray-400 hover:text-blue-300"
                      title="Refresh token"
                    >
                      🔄
                    </button>
                  )}
                  <button
                    onClick={() => handleLoginStart(p.name)}
                    className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-purple-900 text-gray-400 hover:text-purple-300"
                    title="Update token via OAuth login"
                  >
                    🔑
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(p.name)}
                    className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300"
                    title="Delete profile"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
