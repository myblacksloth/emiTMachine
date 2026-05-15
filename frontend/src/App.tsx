import { FormEvent, useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  Download,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Tags,
  TimerReset,
  Trash2,
  UploadCloud,
  UserRound,
  Zap
} from "lucide-react";
import { api } from "./api";
import type { ActivitySession, AuthMode, ChartBucket, DashboardData, Tag, Toast } from "./types";

const emptyDashboard: DashboardData = {
  user: { name: "User", username: "", totpEnabled: false, passkeyCount: 0, recoveryCodeCount: 0 },
  activeSession: null,
  tags: [],
  charts: { daily: [], weekly: [], monthly: [] },
  summary: {
    totalMinutes: 0,
    averageDailyMinutes: 0,
    workedDays: 0,
    presenceMinutes: 0,
    smartWorkingMinutes: 0
  },
  countdowns: []
};

const palette = ["#27b3a8", "#ff8a4c", "#7c6ee6", "#e14f77", "#3f8cff", "#8abf45"];

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

function clientDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function isoFromLocalValue(value: string) {
  return new Date(value).toISOString();
}

function localValueFromIso(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (tone: Toast["tone"], message: string) => {
    const id = Date.now();
    setToasts((items) => [...items, { id, tone, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((toast) => toast.id !== id)), 4200);
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.dashboard();
      setDashboard(data);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.currentUser()
      .then((result) => {
        if (result) void loadDashboard();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to check the current session."));
  }, []);

  const handleAuthenticated = async (requiresTotp?: boolean) => {
    if (requiresTotp) {
      setAuthMode("totp");
      pushToast("info", "Enter your authentication code to finish signing in.");
      return;
    }
    await loadDashboard();
    pushToast("success", "Signed in.");
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setAuthenticated(false);
      setDashboard(emptyDashboard);
      setAuthMode("login");
    }
  };

  if (!authenticated) {
    return (
      <Shell toasts={toasts}>
        <AuthPanel mode={authMode} setMode={setAuthMode} onAuthenticated={handleAuthenticated} />
        {error ? <div className="global-error">{error}</div> : null}
      </Shell>
    );
  }

  return (
    <Shell toasts={toasts}>
      <Dashboard
        data={dashboard}
        loading={loading}
        error={error}
        onRefresh={loadDashboard}
        onLogout={handleLogout}
        onData={setDashboard}
        onToast={pushToast}
      />
    </Shell>
  );
}

function Shell({ children, toasts }: { children: ReactNode; toasts: Toast[] }) {
  return (
    <div className="app-shell">
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function AuthPanel({
  mode,
  setMode,
  onAuthenticated
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onAuthenticated: (requiresTotp?: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const passkeyWarning = mode === "passkey" ? api.passkeyEnvironmentWarning() : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const result = await api.login(username, password);
        await onAuthenticated(result.requiresTotp);
      } else if (mode === "register") {
        await api.register(name, username, password);
        await onAuthenticated(false);
      } else if (mode === "passkey") {
        if (!username.trim()) {
          setMessage("Enter your username before using a passkey.");
          return;
        }
        await api.passkeyLogin(username);
        await onAuthenticated(false);
      } else if (mode === "recovery") {
        await api.recoverAccount(username, recoveryCode, totpCode, password);
        setMessage("Recovery accepted. You can sign in with your updated credentials.");
        setMode("login");
      } else {
        await api.login(username, password, totpCode);
        await onAuthenticated(false);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <BrandMark />
        <p className="eyebrow">Multi-user time tracking</p>
        <h1>Make time feel lighter.</h1>
        <p>Clock in, follow your rhythm, collect focused sessions, and keep reports tidy from one calm little workspace.</p>
        <div className="auth-sparks" aria-label="Highlights">
          <span><Sparkles size={16} /> Passkeys</span>
          <span><BarChart3 size={16} /> Tiny charts</span>
          <span><Zap size={16} /> Fast punches</span>
        </div>
      </section>
      <section className="panel auth-panel" aria-label="Authentication">
        <div className="tabs" role="tablist" aria-label="Authentication options">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
            Sign in
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">
            Register
          </button>
          <button className={mode === "passkey" ? "active" : ""} onClick={() => setMode("passkey")} type="button">
            <KeyRound size={15} /> Passkey
          </button>
          <button className={mode === "recovery" ? "active" : ""} onClick={() => setMode("recovery")} type="button">
            Recovery
          </button>
        </div>
        <form className="stack" onSubmit={submit}>
          <h2>{mode === "totp" ? "Authentication code" : authTitle(mode)}</h2>
          {passkeyWarning ? <p className="form-message error">{passkeyWarning}</p> : null}
          {mode === "register" ? <TextField label="Full name, optional" value={name} onChange={setName} autoComplete="name" /> : null}
          {mode !== "totp" ? <TextField label="Username" value={username} onChange={setUsername} autoComplete="username" /> : null}
          {mode === "login" || mode === "register" || mode === "totp" || mode === "recovery" ? (
            <>
              <TextField
                label={mode === "recovery" ? "New password" : "Password"}
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete={mode === "login" || mode === "totp" ? "current-password" : "new-password"}
                minLength={mode === "register" || mode === "recovery" ? 8 : undefined}
              />
              {mode === "register" || mode === "recovery" ? (
                <PasswordHints password={password} />
              ) : null}
            </>
          ) : null}
          {mode === "recovery" ? <TextField label="Recovery code" value={recoveryCode} onChange={setRecoveryCode} autoComplete="one-time-code" /> : null}
          {mode === "recovery" || mode === "totp" ? <TextField label="TOTP code" value={totpCode} onChange={setTotpCode} inputMode="numeric" autoComplete="one-time-code" /> : null}
          <button className="primary-action" type="submit" disabled={busy || (mode === "passkey" && Boolean(passkeyWarning))}>
            <Sparkles size={18} />
            {busy ? "Please wait..." : authButton(mode)}
          </button>
          {mode === "login" ? (
            <button className="link-button" type="button" onClick={() => setMode("recovery")}>
              I need account recovery
            </button>
          ) : null}
          {message ? <p className="form-message">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="emiTMachine">
      <span className="brand-script">emiT</span>
      <span className="brand-dot">Machine</span>
    </div>
  );
}

function authTitle(mode: AuthMode) {
  return {
    login: "Sign in with password",
    register: "Create your account",
    passkey: "Sign in with passkey",
    recovery: "Recover account",
    totp: "Authentication code"
  }[mode];
}

function authButton(mode: AuthMode) {
  return {
    login: "Sign in",
    register: "Create account",
    passkey: "Use passkey",
    recovery: "Recover account",
    totp: "Verify code"
  }[mode];
}

function Dashboard({
  data,
  loading,
  error,
  onRefresh,
  onLogout,
  onData,
  onToast
}: {
  data: DashboardData;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  onData: (data: DashboardData) => void;
  onToast: (tone: Toast["tone"], message: string) => void;
}) {
  const [confirming, setConfirming] = useState<"in" | "out" | null>(null);
  const [view, setView] = useState<"dashboard" | "activities" | "tags" | "profile">("dashboard");
  const activeTagNames = data.activeSession?.tagIds
    .map((tagId) => data.tags.find((tag) => tag.id === tagId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Signed in as {data.user.username || data.user.name}</p>
          <h1>Today feels workable.</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button type="button" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <nav className="section-nav" aria-label="Workspace sections">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")} type="button">
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button className={view === "activities" ? "active" : ""} onClick={() => setView("activities")} type="button">
          <CalendarClock size={16} /> Activities
        </button>
        <button className={view === "tags" ? "active" : ""} onClick={() => setView("tags")} type="button">
          <Tags size={16} /> Tags
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")} type="button">
          <UserRound size={16} /> Profile
        </button>
      </nav>

      {error ? <div className="global-error">{error}</div> : null}
      {loading ? <div className="loading-line">Loading current workspace...</div> : null}

      {view === "dashboard" ? (
        <>
          <section className={`work-band ${data.activeSession ? "open" : ""}`}>
            <div className={`session-state ${data.activeSession ? "open" : ""}`}>
              <span>{data.activeSession ? "Session active" : "No active session"}</span>
              <strong>{data.activeSession ? `Started ${new Date(data.activeSession.startedAt).toLocaleString()}` : "Ready to start work"}</strong>
              {activeTagNames ? <small>{activeTagNames}</small> : null}
            </div>
            <button className="clock-action" type="button" onClick={() => setConfirming(data.activeSession ? "out" : "in")}>
              {data.activeSession ? <Square size={18} /> : <Zap size={18} />}
              {data.activeSession ? "Clock out" : "Clock in"}
            </button>
          </section>

          <section className="summary-grid" aria-label="Summary">
            <Metric label="Total hours" value={minutesLabel(data.summary.totalMinutes)} icon={<TimerReset size={18} />} />
            <Metric label="Daily average" value={minutesLabel(data.summary.averageDailyMinutes)} icon={<Sparkles size={18} />} />
            <Metric label="Worked days" value={String(data.summary.workedDays)} icon={<Zap size={18} />} />
            <Metric label="Presence / smart" value={`${minutesLabel(data.summary.presenceMinutes)} / ${minutesLabel(data.summary.smartWorkingMinutes)}`} icon={<BarChart3 size={18} />} />
          </section>

          <section className="chart-grid" aria-label="Time charts">
            <Chart title="Daily hours" buckets={data.charts.daily} />
            <Chart title="Weekly hours" buckets={data.charts.weekly} />
            <Chart title="Monthly hours" buckets={data.charts.monthly} />
          </section>

          <Countdowns countdowns={data.countdowns} />
        </>
      ) : null}

      {view === "activities" ? <ActivityPanel tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "tags" ? <TagManager tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "profile" ? <ProfileSettings data={data} onToast={onToast} onRefresh={onRefresh} /> : null}

      {confirming ? (
        <PunchDialog
          mode={confirming}
          tags={data.tags}
          defaultTagIds={data.activeSession?.tagIds ?? []}
          onClose={() => setConfirming(null)}
          onSuccess={(updated) => {
            onData(updated);
            setConfirming(null);
            onToast("success", confirming === "in" ? "Clock-in recorded." : "Clock-out recorded.");
          }}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <article className="metric">
      <span><i>{icon}</i>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Chart({ title, buckets }: { title: string; buckets: ChartBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.totalMinutes));
  return (
    <article className="panel chart-panel">
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
      {buckets.length === 0 ? (
        <p className="empty-state">No tracked sessions yet.</p>
      ) : (
        <div className="bars">
          {buckets.map((bucket) => (
            <div className="bar-row" key={bucket.label}>
              <span>{bucket.label}</span>
              <div className="bar-track" aria-label={`${bucket.label}: ${minutesLabel(bucket.totalMinutes)}`}>
                <div className="bar-fill" style={{ width: `${Math.max(6, (bucket.totalMinutes / max) * 100)}%` }}>
                  {bucket.segments.map((segment) => (
                    <i key={`${segment.tagId}-${segment.tagName}`} style={{ background: segment.color, flexGrow: segment.minutes }} />
                  ))}
                </div>
              </div>
              <strong>{minutesLabel(bucket.totalMinutes)}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ActivityPanel({ tags, onRefresh, onToast }: { tags: Tag[]; onRefresh: () => Promise<void>; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [activities, setActivities] = useState<ActivitySession[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadActivities = async () => {
    setLoading(true);
    setMessage("");
    try {
      setActivities(await api.activities());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load activities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivities();
  }, []);

  const startEdit = (activity: ActivitySession) => {
    setEditingId(activity.id);
    setDraft({
      startedAt: localValueFromIso(activity.startedAt),
      endedAt: localValueFromIso(activity.endedAt),
      startTimezone: activity.startTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      endTimezone: activity.endTimezone || activity.startTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      note: activity.note,
      tagIds: activity.tagIds,
      reason: "User correction"
    });
  };

  const saveActivity = async (activityId: string) => {
    if (!draft) return;
    if (draft.tagIds.length === 0) {
      setMessage("Select at least one tag before saving.");
      return;
    }
    try {
      await api.updateActivity(activityId, {
        startedAt: isoFromLocalValue(draft.startedAt),
        endedAt: draft.endedAt ? isoFromLocalValue(draft.endedAt) : null,
        startTimezone: draft.startTimezone,
        endTimezone: draft.endedAt ? draft.endTimezone : null,
        note: draft.note,
        tagIds: draft.tagIds,
        reason: draft.reason
      });
      setEditingId(null);
      setDraft(null);
      await loadActivities();
      await onRefresh();
      onToast("success", "Activity updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update activity.");
    }
  };

  const deleteActivity = async (activity: ActivitySession) => {
    if (!window.confirm("Delete this activity permanently? This cannot be undone.")) return;
    try {
      await api.deleteActivity(activity.id);
      await loadActivities();
      await onRefresh();
      onToast("success", "Activity deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete activity.");
    }
  };

  return (
    <section className="panel activity-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Enabled by default</p>
          <h2>Activity history</h2>
        </div>
        <button type="button" onClick={loadActivities} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <p className="muted">Review, correct, or delete recorded work sessions. This is currently enabled for every user and is ready to become an admin-controlled permission.</p>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading activities...</div> : null}
      {activities.length === 0 && !loading ? <p className="empty-state">No activities recorded yet.</p> : null}
      <div className="activity-list">
        {activities.map((activity) => {
          const activeDraft = editingId === activity.id ? draft : null;
          return (
            <article className="activity-card" key={activity.id}>
              {activeDraft ? (
                <>
                  <div className="activity-edit-grid">
                    <label className="field">
                      <span>Start</span>
                      <input type="datetime-local" value={activeDraft.startedAt} onChange={(event) => setDraft({ ...activeDraft, startedAt: event.target.value })} />
                    </label>
                    <label className="field">
                      <span>End</span>
                      <input type="datetime-local" value={activeDraft.endedAt} onChange={(event) => setDraft({ ...activeDraft, endedAt: event.target.value })} />
                    </label>
                    <TextField label="Start timezone" value={activeDraft.startTimezone} onChange={(value) => setDraft({ ...activeDraft, startTimezone: value })} />
                    <TextField label="End timezone" value={activeDraft.endTimezone} onChange={(value) => setDraft({ ...activeDraft, endTimezone: value })} />
                  </div>
                  <fieldset className="tag-picker">
                    <legend>Tags</legend>
                    {tags.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          checked={activeDraft.tagIds.includes(tag.id)}
                          onChange={(event) =>
                            setDraft({
                              ...activeDraft,
                              tagIds: event.target.checked ? [...activeDraft.tagIds, tag.id] : activeDraft.tagIds.filter((tagId) => tagId !== tag.id)
                            })
                          }
                        />
                        <span style={{ background: tag.color }} />
                        {tag.name}
                      </label>
                    ))}
                  </fieldset>
                  <TextField label="Reason" value={activeDraft.reason} onChange={(value) => setDraft({ ...activeDraft, reason: value })} />
                  <label className="field">
                    <span>Note</span>
                    <textarea value={activeDraft.note} onChange={(event) => setDraft({ ...activeDraft, note: event.target.value })} />
                  </label>
                  <div className="activity-actions">
                    <button type="button" onClick={() => { setEditingId(null); setDraft(null); }}>
                      Cancel
                    </button>
                    <button className="primary-action" type="button" onClick={() => saveActivity(activity.id)}>
                      <Save size={18} /> Save activity
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="activity-main">
                    <div>
                      <p className="eyebrow">{activity.endedAt ? "Closed session" : "Open session"}</p>
                      <h3>{new Date(activity.startedAt).toLocaleString()} - {activity.endedAt ? new Date(activity.endedAt).toLocaleString() : "now"}</h3>
                      <p className="muted">{activity.durationMinutes === null ? "Running" : minutesLabel(activity.durationMinutes)} · {activity.note || "No note"}</p>
                    </div>
                    <strong>{activity.durationMinutes === null ? "Live" : minutesLabel(activity.durationMinutes)}</strong>
                  </div>
                  <div className="activity-tags">
                    {activity.tags.map((tag) => (
                      <span key={tag.id}><i style={{ background: tag.color }} />{tag.name}</span>
                    ))}
                  </div>
                  <div className="activity-actions">
                    <button type="button" onClick={() => startEdit(activity)}>
                      <Save size={16} /> Edit
                    </button>
                    <button className="danger-action" type="button" onClick={() => deleteActivity(activity)}>
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

type ActivityDraft = {
  startedAt: string;
  endedAt: string;
  startTimezone: string;
  endTimezone: string;
  note: string;
  tagIds: string[];
  reason: string;
};

function PunchDialog({
  mode,
  tags,
  defaultTagIds,
  onClose,
  onSuccess
}: {
  mode: "in" | "out";
  tags: Tag[];
  defaultTagIds: string[];
  onClose: () => void;
  onSuccess: (data: DashboardData) => void;
}) {
  const [occurredAt, setOccurredAt] = useState(clientDateTimeValue());
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTagIds.length ? defaultTagIds : mode === "in" && tags[0] ? [tags[0].id] : []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    if (mode === "in" && selectedTags.length === 0) {
      setError("Select at least one tag before clocking in.");
      setBusy(false);
      return;
    }
    try {
      const updated = mode === "in" ? await api.clockIn(isoFromLocalValue(occurredAt), selectedTags, note) : await api.clockOut(isoFromLocalValue(occurredAt), selectedTags, note);
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record the event.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="punch-title">
        <h2 id="punch-title">Confirm {mode === "in" ? "clock in" : "clock out"}</h2>
        <p className="muted">Review the client time before recording this event.</p>
        <label className="field">
          <span>Event time</span>
          <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        </label>
        <fieldset className="tag-picker">
          <legend>Tags</legend>
          {tags.length === 0 ? <p className="empty-state">Create a tag before assigning one.</p> : null}
          {tags.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={selectedTags.includes(tag.id)}
                onChange={(event) =>
                  setSelectedTags((items) => (event.target.checked ? [...items, tag.id] : items.filter((tagId) => tagId !== tag.id)))
                }
              />
              <span style={{ background: tag.color }} />
              {tag.name}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Note</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for this session" />
        </label>
        {error ? <p className="form-message error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-action" type="button" onClick={submit} disabled={busy}>
            <Save size={18} />
            {busy ? "Saving..." : "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TagManager({ tags, onRefresh, onToast }: { tags: Tag[]; onRefresh: () => Promise<void>; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(palette[0]);
  const [editing, setEditing] = useState<Record<string, Tag>>({});

  const create = async (event: FormEvent) => {
    event.preventDefault();
    await api.createTag(name, color);
    setName("");
    setColor(palette[(palette.indexOf(color) + 1) % palette.length]);
    await onRefresh();
    onToast("success", "Tag created.");
  };

  const save = async (tag: Tag) => {
    await api.updateTag(tag.id, tag.name, tag.color);
    setEditing((items) => {
      const next = { ...items };
      delete next[tag.id];
      return next;
    });
    await onRefresh();
    onToast("success", "Tag updated.");
  };

  return (
    <section className="two-column">
      <form className="panel stack" onSubmit={create}>
        <h2>Create tag</h2>
        <TextField label="Tag name" value={name} onChange={setName} />
        <label className="field">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <button className="primary-action" type="submit">
          <Plus size={18} /> Add tag
        </button>
      </form>
      <section className="panel stack">
        <h2>Manage tags</h2>
        {tags.length === 0 ? <p className="empty-state">No tags have been created yet. Default tags will appear after the backend returns them.</p> : null}
        {tags.map((tag) => {
          const draft = editing[tag.id] ?? tag;
          return (
            <div className="tag-editor" key={tag.id}>
              <input value={draft.name} onChange={(event) => setEditing((items) => ({ ...items, [tag.id]: { ...draft, name: event.target.value } }))} />
              <input type="color" value={draft.color} onChange={(event) => setEditing((items) => ({ ...items, [tag.id]: { ...draft, color: event.target.value } }))} />
              <button type="button" onClick={() => save(draft)}>
                <Save size={16} /> Save
              </button>
            </div>
          );
        })}
      </section>
    </section>
  );
}

function ProfileSettings({
  data,
  onToast,
  onRefresh
}: {
  data: DashboardData;
  onToast: (tone: Toast["tone"], message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [totp, setTotp] = useState<{ qrCodeUrl: string; secretLabel: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [passkeyLabel, setPasskeyLabel] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [remainingCount, setRemainingCount] = useState(data.user.recoveryCodeCount);
  const [importResult, setImportResult] = useState("");
  const passkeyWarning = api.passkeyEnvironmentWarning();

  const recoveryBlob = useMemo(() => new Blob([recoveryCodes.join("\n")], { type: "text/plain" }), [recoveryCodes]);
  const recoveryUrl = useMemo(() => (recoveryCodes.length ? URL.createObjectURL(recoveryBlob) : ""), [recoveryBlob, recoveryCodes.length]);

  return (
    <section className="settings-grid">
      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await api.changePassword(currentPassword, newPassword);
          setCurrentPassword("");
          setNewPassword("");
          onToast("success", "Password changed.");
        }}
      >
        <h2>Password</h2>
        <TextField label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" autoComplete="current-password" />
        <TextField label="New password" value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" minLength={8} />
        <PasswordHints password={newPassword} />
        <button className="primary-action" type="submit">
          <ShieldCheck size={18} /> Change password
        </button>
      </form>

      <section className="panel stack">
        <h2>TOTP</h2>
        <p className="muted">{data.user.totpEnabled ? "TOTP is enabled for this account." : "Set up an authenticator app with a QR code."}</p>
        <button type="button" onClick={async () => setTotp(await api.setupTotp())}>
          <KeyRound size={16} /> Show QR setup
        </button>
        {totp ? (
          <>
            <img className="qr" src={totp.qrCodeUrl} alt="TOTP setup QR code" />
            <p className="muted">{totp.secretLabel}</p>
            <TextField label="Verification code" value={totpCode} onChange={setTotpCode} inputMode="numeric" />
            <button
              className="primary-action"
              type="button"
              onClick={async () => {
                await api.confirmTotp(totpCode);
                onToast("success", "TOTP enabled.");
              }}
            >
              <ShieldCheck size={18} /> Enable TOTP
            </button>
          </>
        ) : null}
      </section>

      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (passkeyBusy) return;
          setPasskeyBusy(true);
          try {
            await api.registerPasskey(passkeyLabel);
            setPasskeyLabel("");
            await onRefresh();
            onToast("success", "Passkey registered.");
          } catch (err) {
            onToast("error", err instanceof Error ? err.message : "Passkey registration failed.");
          } finally {
            setPasskeyBusy(false);
          }
        }}
      >
        <h2>Passkeys</h2>
        <p className="muted">{data.user.passkeyCount} passkey records are linked to this account.</p>
        {passkeyWarning ? <p className="form-message error">{passkeyWarning}</p> : null}
        <TextField label="Passkey label" value={passkeyLabel} onChange={setPasskeyLabel} placeholder="Work laptop" />
        <button className="primary-action" type="submit" disabled={passkeyBusy || Boolean(passkeyWarning)}>
          <KeyRound size={18} />
          {passkeyBusy ? "Waiting for authenticator..." : "Register passkey"}
        </button>
      </form>

      <section className="panel stack">
        <h2>Recovery codes</h2>

        {recoveryCodes.length === 0 ? (
          <>
            {remainingCount === 0 ? (
              <p className="recovery-status warn">
                No recovery codes — you won't be able to recover your account if you lose access.
              </p>
            ) : (
              <p className="recovery-status ok">
                {remainingCount} unused {remainingCount === 1 ? "code" : "codes"} stored for this account.
              </p>
            )}
            <button
              type="button"
              onClick={async () => {
                if (
                  remainingCount > 0 &&
                  !window.confirm("This will permanently invalidate all existing recovery codes. Continue?")
                ) return;
                const result = await api.generateRecoveryCodes();
                setRecoveryCodes(result.codes);
                setRemainingCount(result.codes.length);
                await onRefresh();
              }}
            >
              {remainingCount === 0 ? "Generate recovery codes" : "Regenerate codes"}
            </button>
          </>
        ) : (
          <>
            <p className="recovery-status warn">
              Save these codes now — they will not be shown again.
            </p>
            <pre className="codes">{recoveryCodes.join("\n")}</pre>
            <a className="download-link" href={recoveryUrl} download="emitmachine-recovery-codes.txt">
              <Download size={16} /> Download recovery codes
            </a>
            <button type="button" onClick={() => setRecoveryCodes([])}>
              Done — I have saved my codes
            </button>
          </>
        )}
      </section>

      <section className="panel stack wide">
        <h2>CSV export and restore</h2>
        <div className="csv-actions">
          <a className="download-link" href={api.exportCsvUrl}>
            <Download size={16} /> Download CSV export
          </a>
          <label className="file-input">
            <span><UploadCloud size={16} /> Upload CSV restore</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const result = await api.importCsv(file);
                setImportResult(`${result.importedRows} rows imported. ${result.invalidRows} rows need review.`);
              }}
            />
          </label>
        </div>
        {importResult ? <p className="form-message">{importResult}</p> : null}
      </section>
    </section>
  );
}

function Countdowns({ countdowns }: { countdowns: DashboardData["countdowns"] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="panel countdown-panel">
      <div className="panel-title">
        <h2>Countdowns</h2>
      </div>
      {countdowns.length === 0 ? (
        <p className="empty-state">No countdowns configured.</p>
      ) : (
        <div className="countdown-grid">
          {countdowns.map((countdown) => {
            const remaining = Math.max(0, new Date(countdown.targetTime).getTime() - Date.now());
            const hours = Math.floor(remaining / 3_600_000);
            const minutes = Math.floor((remaining % 3_600_000) / 60_000);
            const seconds = Math.floor((remaining % 60_000) / 1000);
            return (
              <article className={`countdown ${remaining === 0 ? "done" : ""}`} key={countdown.id}>
                <span>{countdown.title}</span>
                <strong>
                  {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </strong>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PasswordHints({ password }: { password: string }) {
  const dirty = password.length > 0;
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "200 characters or fewer", met: password.length <= 200 }
  ];
  return (
    <ul className="password-hints" aria-label="Password requirements">
      {rules.map(({ label, met }) => (
        <li key={label} className={`password-hint ${dirty ? (met ? "met" : "unmet") : ""}`}>
          <span aria-hidden="true">{dirty ? (met ? "✓" : "✗") : "·"}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  minLength
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} inputMode={inputMode} placeholder={placeholder} minLength={minLength} />
    </label>
  );
}

export default App;
