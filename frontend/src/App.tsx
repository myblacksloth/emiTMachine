import { FormEvent, useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import {
  AlarmClock,
  BarChart3,
  CalendarClock,
  Clock,
  Download,
  Hourglass,
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
  Timer,
  TimerReset,
  Trash2,
  UploadCloud,
  UserRound,
  Zap
} from "lucide-react";
import { api } from "./api";
import type { ActivitySession, AdminUser, AuthMode, ChartBucket, DashboardData, OvertimeReport, Tag, Toast } from "./types";

const emptyDashboard: DashboardData = {
  user: { name: "User", username: "", role: "user", adminApproved: true, canEditSessions: true, totpEnabled: false, passkeyCount: 0, recoveryCodeCount: 0 },
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
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${sign}${hours}h ${String(rest).padStart(2, "0")}m`;
}

function dateFromDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekRangeLabel(weekStart: string) {
  const start = dateFromDateOnly(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function clientDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function isoFromLocalValue(value: string) {
  return new Date(value).toISOString();
}

function defaultEndDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function defaultStartDateTimeValue() {
  const date = new Date();
  date.setHours(date.getHours() - 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function defaultCountdownValue() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
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
  const [requestedRole, setRequestedRole] = useState<"user" | "admin">("user");
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
        const result = await api.register(name, username, password, requestedRole);
        if (result.requiresApproval) {
          setMessage("Admin registration submitted. A root user must approve it before sign-in.");
          setMode("login");
          return;
        }
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
          {mode === "register" ? (
            <label className="field">
              <span>Account type</span>
              <select value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as "user" | "admin")}>
                <option value="user">Standard user</option>
                <option value="admin">Admin, requires root approval</option>
              </select>
            </label>
          ) : null}
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
  const [view, setView] = useState<"dashboard" | "activities" | "overtime" | "tags" | "tools" | "profile" | "admin">("dashboard");
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
        <button className={view === "overtime" ? "active" : ""} onClick={() => setView("overtime")} type="button">
          <Hourglass size={16} /> Banca ore
        </button>
        <button className={view === "tags" ? "active" : ""} onClick={() => setView("tags")} type="button">
          <Tags size={16} /> Tags
        </button>
        <button className={view === "tools" ? "active" : ""} onClick={() => setView("tools")} type="button">
          <Clock size={16} /> Tools
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")} type="button">
          <UserRound size={16} /> Profile
        </button>
        {data.user.role !== "user" ? (
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")} type="button">
            <ShieldCheck size={16} /> Admin
          </button>
        ) : null}
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

          <Countdowns countdowns={data.countdowns} activeSessionId={data.activeSession?.id ?? null} onRefresh={onRefresh} onToast={onToast} />
        </>
      ) : null}

      {view === "activities" ? <ActivityPanel tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "overtime" ? <OvertimePanel onToast={onToast} /> : null}
      {view === "tags" ? <TagManager tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "tools" ? <TimeTools /> : null}
      {view === "profile" ? <ProfileSettings data={data} onToast={onToast} onRefresh={onRefresh} /> : null}
      {view === "admin" && data.user.role !== "user" ? <AdminPanel currentRole={data.user.role} onToast={onToast} /> : null}

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

function OvertimePanel({ onToast }: { onToast: (tone: Toast["tone"], message: string) => void }) {
  const [report, setReport] = useState<OvertimeReport | null>(null);
  const [targetHours, setTargetHours] = useState("40");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadOvertime = async () => {
    setLoading(true);
    setMessage("");
    try {
      setReport(await api.overtime());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load overtime data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOvertime();
  }, []);

  const saveWeeklyTarget = async () => {
    const minutes = Math.round((Number(targetHours) || 0) * 60);
    if (minutes <= 0) {
      setMessage("Enter a weekly target greater than zero.");
      return;
    }
    try {
      setReport(await api.setWeeklyWorkMinutes(minutes));
      onToast("success", "Weekly target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save weekly target.");
    }
  };

  const markPaid = async (weekStart: string) => {
    try {
      setReport(await api.markOvertimePaid(weekStart));
      onToast("success", "Payment marked as received.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to mark payment.");
    }
  };

  const settings = report?.settings;

  return (
    <section className="panel overtime-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Banca ore straordinari</p>
          <h2>Overtime balance</h2>
        </div>
        <button type="button" onClick={loadOvertime} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading overtime data...</div> : null}
      {!settings?.enabled ? (
        <p className="empty-state">This feature is not enabled for your user yet.</p>
      ) : null}
      {settings?.enabled && settings.weeklyWorkMinutes === null ? (
        <div className="overtime-setup">
          <TextField label="Weekly target hours" value={targetHours} onChange={setTargetHours} type="number" min="1" step="0.25" />
          <p className="muted">This value can be set once. If an admin disables the feature later, the target is cleared.</p>
          <button className="primary-action" type="button" onClick={saveWeeklyTarget}>
            <Save size={18} /> Save weekly target
          </button>
        </div>
      ) : null}
      {settings?.enabled && settings.weeklyWorkMinutes !== null && report ? (
        <>
          <section className="summary-grid compact overtime-summary" aria-label="Overtime summary">
            <Metric label="Mode" value={settings.mode === "time_bank" ? "Banca ore" : "Straordinari"} icon={<Hourglass size={18} />} />
            <Metric label="Weekly target" value={minutesLabel(settings.weeklyWorkMinutes)} icon={<TimerReset size={18} />} />
            <Metric label="Residual bank" value={settings.mode === "time_bank" ? minutesLabel(report.residualMinutes) : "—"} icon={<BarChart3 size={18} />} />
            <Metric label="Weeks" value={String(report.weeks.length)} icon={<CalendarClock size={18} />} />
          </section>
          <div className="overtime-week-list">
            {report.weeks.map((week) => (
              <article className="overtime-week" key={week.weekStart}>
                <div>
                  <p className="eyebrow">{week.isClosed ? "Closed week" : "Current week"}</p>
                  <h3>{weekRangeLabel(week.weekStart)}</h3>
                  <p className="muted">
                    Worked {minutesLabel(week.workedMinutes)} · target {minutesLabel(week.targetMinutes)}
                  </p>
                </div>
                <div className="overtime-week-stats">
                  <strong className={week.deltaMinutes >= 0 ? "positive" : "negative"}>
                    {week.deltaMinutes >= 0 ? "+" : "-"}{minutesLabel(Math.abs(week.deltaMinutes))}
                  </strong>
                  <span>Overtime {minutesLabel(week.overtimeMinutes)}</span>
                  {settings.mode === "overtime" && week.isClosed && week.overtimeMinutes > 0 ? (
                    week.paidAt ? (
                      <span className="paid-chip">Paid {new Date(week.paidAt).toLocaleDateString()}</span>
                    ) : (
                      <button type="button" onClick={() => markPaid(week.weekStart)}>
                        Mark paid
                      </button>
                    )
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminPanel({ currentRole, onToast }: { currentRole: "admin" | "root"; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedSessions, setSelectedSessions] = useState<ActivitySession[]>([]);
  const [selectedOvertime, setSelectedOvertime] = useState<OvertimeReport | null>(null);
  const [summary, setSummary] = useState<{ sessions: number; total_seconds: string | number; average_session_seconds: string | number; days_worked: number } | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState("");

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  const loadUsers = async () => {
    setMessage("");
    try {
      const loaded = await api.adminUsers();
      setUsers(loaded);
      setSelectedUserId((current) => current || loaded.find((user) => user.role === "user")?.id || loaded[0]?.id || "");
      if (currentRole === "root") {
        setRegistrationEnabled((await api.registrationSetting()).enabled);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load admin data.");
    }
  };

  const loadSelectedUserData = async (userId: string) => {
    if (!userId) return;
    try {
      const [summaryPayload, sessions, overtime] = await Promise.all([
        api.adminUserSummary(userId),
        api.adminUserSessions(userId),
        api.adminUserOvertime(userId).catch(() => null)
      ]);
      setSummary(summaryPayload.summary);
      setSelectedSessions(sessions);
      setSelectedOvertime(overtime);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load selected user data.");
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    void loadSelectedUserData(selectedUserId);
  }, [selectedUserId]);

  const approveAdmin = async (user: AdminUser) => {
    await api.approveAdmin(user.id);
    await loadUsers();
    onToast("success", `${user.username} approved.`);
  };

  const toggleEditPermission = async (user: AdminUser) => {
    await api.setUserEditPermission(user.id, !user.canEditSessions);
    await loadUsers();
    onToast("success", "Session edit permission updated.");
  };

  const toggleOvertimePermission = async (user: AdminUser) => {
    await api.setUserOvertimePermission(user.id, !user.overtimeEnabled, user.overtimeMode);
    await loadUsers();
    await loadSelectedUserData(user.id);
    onToast("success", "Overtime feature updated.");
  };

  const changeOvertimeMode = async (user: AdminUser, mode: "overtime" | "time_bank") => {
    await api.setUserOvertimePermission(user.id, true, mode);
    await loadUsers();
    await loadSelectedUserData(user.id);
    onToast("success", "Overtime mode updated.");
  };

  const deleteOvertimePayment = async (weekStart: string) => {
    if (!selectedUserId) return;
    await api.deleteUserOvertimePayment(selectedUserId, weekStart);
    await loadSelectedUserData(selectedUserId);
    onToast("success", "Payment status removed.");
  };

  const resetPassword = async (user: AdminUser) => {
    if (!window.confirm(`Reset password for ${user.username}? Active sessions will be revoked.`)) return;
    const result = await api.resetUserPassword(user.id);
    setTemporaryPassword(result.temporaryPassword);
    onToast("success", "Temporary password generated.");
  };

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.username} permanently?`)) return;
    await api.deleteUser(user.id);
    setSelectedUserId("");
    await loadUsers();
    onToast("success", "User deleted.");
  };

  const toggleRegistration = async () => {
    await api.setRegistrationSetting(!registrationEnabled);
    setRegistrationEnabled(!registrationEnabled);
    onToast("success", "Registration setting updated.");
  };

  return (
    <section className="admin-grid">
      <section className="panel stack">
        <div className="panel-title">
          <div>
            <p className="eyebrow">{currentRole} console</p>
            <h2>Users</h2>
          </div>
          <button type="button" onClick={loadUsers}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {currentRole === "root" ? (
          <div className="admin-system-row">
            <span>Registration is {registrationEnabled ? "open" : "locked"}</span>
            <button type="button" onClick={toggleRegistration}>
              {registrationEnabled ? "Lock registration" : "Open registration"}
            </button>
          </div>
        ) : null}
        {message ? <p className="form-message error">{message}</p> : null}
        {temporaryPassword ? (
          <p className="form-message">Temporary password: <strong>{temporaryPassword}</strong></p>
        ) : null}
        <div className="admin-user-list">
          {users.map((user) => (
            <article className={`admin-user ${selectedUserId === user.id ? "active" : ""}`} key={user.id}>
              <button type="button" onClick={() => setSelectedUserId(user.id)}>
                <strong>{user.username}</strong>
                <span>{user.role}{user.role === "admin" && !user.adminApproved ? " · pending" : ""}</span>
              </button>
              <div className="admin-user-actions">
                {currentRole === "root" && user.role === "admin" && !user.adminApproved ? (
                  <button type="button" onClick={() => approveAdmin(user)}>Approve</button>
                ) : null}
                {user.role !== "root" ? (
                  <button type="button" onClick={() => toggleEditPermission(user)}>
                    {user.canEditSessions ? "Disable edits" : "Enable edits"}
                  </button>
                ) : null}
                {user.role !== "root" ? (
                  <>
                    <button type="button" onClick={() => toggleOvertimePermission(user)}>
                      {user.overtimeEnabled ? "Disable overtime" : "Enable overtime"}
                    </button>
                    {user.overtimeEnabled ? (
                      <select value={user.overtimeMode} onChange={(event) => changeOvertimeMode(user, event.target.value as "overtime" | "time_bank")}>
                        <option value="overtime">Straordinari</option>
                        <option value="time_bank">Banca ore</option>
                      </select>
                    ) : null}
                  </>
                ) : null}
                {user.role !== "root" && (currentRole === "root" || user.role === "user") ? (
                  <>
                    <button type="button" onClick={() => resetPassword(user)}>Reset password</button>
                    <button className="danger-action" type="button" onClick={() => deleteUser(user)}>Delete</button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {currentRole === "root" ? (
          <a className="download-link" href={api.adminDumpUrl}>
            <Download size={16} /> Download JSON dump
          </a>
        ) : null}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Selected user</p>
            <h2>{selectedUser?.username ?? "No user selected"}</h2>
          </div>
        </div>
        {summary ? (
          <section className="summary-grid compact" aria-label="Selected user summary">
            <Metric label="Sessions" value={String(summary.sessions ?? 0)} icon={<CalendarClock size={18} />} />
            <Metric label="Total" value={minutesLabel(Math.round(Number(summary.total_seconds ?? 0) / 60))} icon={<TimerReset size={18} />} />
            <Metric label="Average" value={minutesLabel(Math.round(Number(summary.average_session_seconds ?? 0) / 60))} icon={<BarChart3 size={18} />} />
            <Metric label="Days" value={String(summary.days_worked ?? 0)} icon={<Sparkles size={18} />} />
          </section>
        ) : null}
        {selectedOvertime?.settings.enabled ? (
          <section className="overtime-admin-box">
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">Banca ore straordinari</p>
                <h2>{selectedOvertime.settings.mode === "time_bank" ? "Banca ore" : "Straordinari"}</h2>
              </div>
              <strong>{selectedOvertime.settings.weeklyWorkMinutes ? minutesLabel(selectedOvertime.settings.weeklyWorkMinutes) : "Target missing"}</strong>
            </div>
            {selectedOvertime.settings.mode === "time_bank" ? (
              <p className="form-message">Residual bank: <strong>{minutesLabel(selectedOvertime.residualMinutes)}</strong></p>
            ) : null}
            <div className="overtime-week-list compact">
              {selectedOvertime.weeks.filter((week) => week.paidAt).map((week) => (
                <article className="overtime-week" key={week.weekStart}>
                  <div>
                    <h3>{weekRangeLabel(week.weekStart)}</h3>
                    <p className="muted">Paid overtime: {minutesLabel(week.overtimeMinutes)}</p>
                  </div>
                  <button className="danger-action" type="button" onClick={() => deleteOvertimePayment(week.weekStart)}>
                    Remove paid status
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <div className="activity-list">
          {selectedSessions.map((session) => (
            <article className="activity-card" key={session.id}>
              <div className="activity-main">
                <div>
                  <p className="eyebrow">{session.endedAt ? "Closed session" : "Open session"}</p>
                  <h3>{new Date(session.startedAt).toLocaleString()} - {session.endedAt ? new Date(session.endedAt).toLocaleString() : "now"}</h3>
                  <p className="muted">{session.note || "No note"}</p>
                </div>
                <strong>{session.durationMinutes === null ? "Live" : minutesLabel(session.durationMinutes)}</strong>
              </div>
              <div className="activity-tags">
                {session.tags.map((tag) => (
                  <span key={tag.id}><i style={{ background: tag.color }} />{tag.name}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function ActivityPanel({ tags, onRefresh, onToast }: { tags: Tag[]; onRefresh: () => Promise<void>; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [activities, setActivities] = useState<ActivitySession[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [creating, setCreating] = useState(false);
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

  const startCreate = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setCreating(true);
    setEditingId(null);
    setDraft({
      startedAt: defaultStartDateTimeValue(),
      endedAt: defaultEndDateTimeValue(),
      startTimezone: timezone,
      endTimezone: timezone,
      note: "",
      tagIds: tags[0] ? [tags[0].id] : [],
      reason: "Manual activity insert"
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

  const createActivity = async () => {
    if (!draft) return;
    if (draft.tagIds.length === 0) {
      setMessage("Select at least one tag before creating the activity.");
      return;
    }
    try {
      await api.createActivity({
        startedAt: isoFromLocalValue(draft.startedAt),
        endedAt: draft.endedAt ? isoFromLocalValue(draft.endedAt) : null,
        startTimezone: draft.startTimezone,
        endTimezone: draft.endedAt ? draft.endTimezone : null,
        note: draft.note,
        tagIds: draft.tagIds,
        reason: draft.reason
      });
      setCreating(false);
      setDraft(null);
      await loadActivities();
      await onRefresh();
      onToast("success", "Activity created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create activity.");
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
      <div className="activity-actions">
        <button type="button" onClick={startCreate}>
          <Plus size={16} /> Add activity
        </button>
      </div>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading activities...</div> : null}
      {activities.length === 0 && !loading ? <p className="empty-state">No activities recorded yet.</p> : null}
      <div className="activity-list">
        {creating && draft ? (
          <ActivityEditor
            draft={draft}
            tags={tags}
            onDraft={setDraft}
            onCancel={() => {
              setCreating(false);
              setDraft(null);
            }}
            onSave={createActivity}
            saveLabel="Create activity"
          />
        ) : null}
        {activities.map((activity) => {
          const activeDraft = editingId === activity.id ? draft : null;
          return (
            <article className="activity-card" key={activity.id}>
              {activeDraft ? (
                <ActivityEditor
                  draft={activeDraft}
                  tags={tags}
                  onDraft={setDraft}
                  onCancel={() => { setEditingId(null); setDraft(null); }}
                  onSave={() => saveActivity(activity.id)}
                  saveLabel="Save activity"
                />
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

function ActivityEditor({
  draft,
  tags,
  onDraft,
  onCancel,
  onSave,
  saveLabel
}: {
  draft: ActivityDraft;
  tags: Tag[];
  onDraft: (draft: ActivityDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="activity-editor activity-card-editing">
      <div className="activity-edit-grid">
        <label className="field">
          <span>Start</span>
          <input type="datetime-local" value={draft.startedAt} onChange={(event) => onDraft({ ...draft, startedAt: event.target.value })} />
        </label>
        <label className="field">
          <span>End</span>
          <input type="datetime-local" value={draft.endedAt} onChange={(event) => onDraft({ ...draft, endedAt: event.target.value })} />
        </label>
        <TextField label="Start timezone" value={draft.startTimezone} onChange={(value) => onDraft({ ...draft, startTimezone: value })} />
        <TextField label="End timezone" value={draft.endTimezone} onChange={(value) => onDraft({ ...draft, endTimezone: value })} />
      </div>
      <fieldset className="tag-picker">
        <legend>Tags</legend>
        {tags.length === 0 ? <p className="empty-state">Create a tag before assigning one.</p> : null}
        {tags.map((tag) => (
          <label key={tag.id}>
            <input
              type="checkbox"
              checked={draft.tagIds.includes(tag.id)}
              onChange={(event) =>
                onDraft({
                  ...draft,
                  tagIds: event.target.checked ? [...draft.tagIds, tag.id] : draft.tagIds.filter((tagId) => tagId !== tag.id)
                })
              }
            />
            <span style={{ background: tag.color }} />
            {tag.name}
          </label>
        ))}
      </fieldset>
      <TextField label="Reason" value={draft.reason} onChange={(value) => onDraft({ ...draft, reason: value })} />
      <label className="field">
        <span>Note</span>
        <textarea value={draft.note} onChange={(event) => onDraft({ ...draft, note: event.target.value })} />
      </label>
      <div className="activity-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-action" type="button" onClick={onSave}>
          <Save size={18} /> {saveLabel}
        </button>
      </div>
    </div>
  );
}

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

function TimeTools() {
  const [diffFrom, setDiffFrom] = useState("");
  const [diffTo, setDiffTo] = useState("");

  const [addBase, setAddBase] = useState("");
  const [addH, setAddH] = useState("0");
  const [addM, setAddM] = useState("0");

  const [shiftStart, setShiftStart] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const [shiftWorkH, setShiftWorkH] = useState("8");
  const [shiftBreakM, setShiftBreakM] = useState("30");

  const [liveTarget, setLiveTarget] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => tick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  function parseHHMM(s: string): number | null {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function toHHMM(totalMinutes: number): string {
    const norm = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
  }

  function fmtDiff(minutes: number): string {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  const diffResult = useMemo(() => {
    const from = parseHHMM(diffFrom);
    const to = parseHHMM(diffTo);
    if (from === null || to === null) return null;
    let diff = to - from;
    if (diff < 0) diff += 1440;
    return fmtDiff(diff);
  }, [diffFrom, diffTo]);

  const addResult = useMemo(() => {
    const base = parseHHMM(addBase);
    if (base === null) return null;
    const dH = parseInt(addH) || 0;
    const dM = parseInt(addM) || 0;
    const total = base + dH * 60 + dM;
    const days = Math.floor(total / 1440);
    return days !== 0 ? `${toHHMM(total)} (${days > 0 ? "+" : ""}${days}g)` : toHHMM(total);
  }, [addBase, addH, addM]);

  const shiftEndTime = useMemo(() => {
    const start = parseHHMM(shiftStart);
    if (start === null) return null;
    return toHHMM(start + Math.round((parseFloat(shiftWorkH) || 0) * 60) + (parseInt(shiftBreakM) || 0));
  }, [shiftStart, shiftWorkH, shiftBreakM]);

  // recomputes every second via tick
  const shiftEndMinutes = (() => {
    const start = parseHHMM(shiftStart);
    if (start === null) return null;
    const total = start + Math.round((parseFloat(shiftWorkH) || 0) * 60) + (parseInt(shiftBreakM) || 0);
    return ((total % 1440) + 1440) % 1440;
  })();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const shiftRemaining = shiftEndMinutes !== null ? (() => {
    let r = shiftEndMinutes - nowMinutes;
    if (r < 0) r += 1440;
    return r;
  })() : null;

  // live countdown — recomputes every second via tick
  let liveResult: string | null = null;
  const liveT = parseHHMM(liveTarget);
  if (liveT !== null) {
    const n = new Date();
    const nowSec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    let diff = liveT * 60 - nowSec;
    if (diff < 0) diff += 86400;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    liveResult =
      diff === 0 ? "Adesso!"
      : h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
      : m > 0 ? `${m}m ${String(s).padStart(2, "0")}s`
      : `${s}s`;
  }

  return (
    <section className="panel stack wide">
      <h2><Clock size={18} /> Time Tools</h2>
      <div className="time-tools-grid">

        <div className="time-tool-card">
          <div className="tool-header"><Timer size={15} /><strong>Elapsed time</strong></div>
          <p className="muted small">How long between two times of day</p>
          <div className="tool-row">
            <label className="tool-label">From</label>
            <input type="time" value={diffFrom} onChange={(e) => setDiffFrom(e.target.value)} />
            <label className="tool-label">To</label>
            <input type="time" value={diffTo} onChange={(e) => setDiffTo(e.target.value)} />
          </div>
          <div className="time-result">{diffResult ?? "—"}</div>
        </div>

        <div className="time-tool-card">
          <div className="tool-header"><Plus size={15} /><strong>Target time</strong></div>
          <p className="muted small">Add hours and minutes to a start time</p>
          <div className="tool-row">
            <label className="tool-label">Start</label>
            <input type="time" value={addBase} onChange={(e) => setAddBase(e.target.value)} />
            <label className="tool-label">+</label>
            <input type="number" value={addH} min="0" max="99" onChange={(e) => setAddH(e.target.value)} className="tool-num" />
            <span className="muted">h</span>
            <input type="number" value={addM} min="0" max="59" onChange={(e) => setAddM(e.target.value)} className="tool-num" />
            <span className="muted">m</span>
          </div>
          <div className="time-result">{addResult ?? "—"}</div>
        </div>

        <div className="time-tool-card">
          <div className="tool-header"><Hourglass size={15} /><strong>Shift end</strong></div>
          <p className="muted small">When will your shift end — and how much is left now?</p>
          <div className="tool-row">
            <label className="tool-label">Start</label>
            <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            <label className="tool-label">Work</label>
            <input type="number" value={shiftWorkH} min="0" max="24" step="0.5" onChange={(e) => setShiftWorkH(e.target.value)} className="tool-num" />
            <span className="muted">h</span>
            <label className="tool-label">Break</label>
            <input type="number" value={shiftBreakM} min="0" max="120" onChange={(e) => setShiftBreakM(e.target.value)} className="tool-num" />
            <span className="muted">m</span>
          </div>
          <div className="time-result">
            {shiftEndTime ? (
              <>
                {shiftEndTime}
                {shiftRemaining !== null && (
                  <small className="tool-remaining">
                    {shiftRemaining === 0 ? " — finito!" : ` — ${fmtDiff(shiftRemaining)} rimasti`}
                  </small>
                )}
              </>
            ) : "—"}
          </div>
        </div>

        <div className="time-tool-card">
          <div className="tool-header"><AlarmClock size={15} /><strong>Live countdown</strong></div>
          <p className="muted small">Real-time countdown to any time today</p>
          <div className="tool-row">
            <label className="tool-label">Target</label>
            <input type="time" value={liveTarget} onChange={(e) => setLiveTarget(e.target.value)} />
          </div>
          <div className={`time-result${liveTarget ? " live" : ""}`}>{liveResult ?? "—"}</div>
        </div>

      </div>
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

function Countdowns({
  countdowns,
  activeSessionId,
  onRefresh,
  onToast
}: {
  countdowns: DashboardData["countdowns"];
  activeSessionId: string | null;
  onRefresh: () => Promise<void>;
  onToast: (tone: Toast["tone"], message: string) => void;
}) {
  const [, tick] = useState(0);
  const [title, setTitle] = useState("");
  const [targetAt, setTargetAt] = useState(defaultCountdownValue());
  const [linkToCurrentSession, setLinkToCurrentSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.createCountdown(title, isoFromLocalValue(targetAt), linkToCurrentSession);
      setTitle("");
      setTargetAt(defaultCountdownValue());
      setLinkToCurrentSession(false);
      await onRefresh();
      onToast("success", "Countdown created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create countdown.");
    } finally {
      setBusy(false);
    }
  };

  const complete = async (id: string) => {
    await api.completeCountdown(id);
    await onRefresh();
    onToast("success", "Countdown completed.");
  };

  const remove = async (id: string) => {
    await api.deleteCountdown(id);
    await onRefresh();
    onToast("success", "Countdown removed.");
  };

  return (
    <section className="panel countdown-panel">
      <div className="panel-title">
        <h2>Countdowns</h2>
      </div>
      <form className="countdown-form" onSubmit={create}>
        <TextField label="Title" value={title} onChange={setTitle} placeholder="End focus block" />
        <label className="field">
          <span>Target</span>
          <input type="datetime-local" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={linkToCurrentSession}
            disabled={!activeSessionId}
            onChange={(event) => setLinkToCurrentSession(event.target.checked)}
          />
          Link to current session
        </label>
        <button className="primary-action" type="submit" disabled={busy || !title.trim()}>
          <Plus size={18} /> {busy ? "Creating..." : "Add countdown"}
        </button>
      </form>
      {message ? <p className="form-message error">{message}</p> : null}
      {countdowns.length === 0 ? (
        <p className="empty-state">No countdowns configured.</p>
      ) : (
        <div className="countdown-grid">
          {countdowns.map((countdown) => {
            const remaining = Math.max(0, new Date(countdown.targetAt).getTime() - Date.now());
            const hours = Math.floor(remaining / 3_600_000);
            const minutes = Math.floor((remaining % 3_600_000) / 60_000);
            const seconds = Math.floor((remaining % 60_000) / 1000);
            return (
              <article className={`countdown ${remaining === 0 ? "done" : ""}`} key={countdown.id}>
                <span>{countdown.title}</span>
                <strong>
                  {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </strong>
                <small>{countdown.linkedToCurrentSession ? "Linked to current session" : countdown.targetTimezone}</small>
                <div className="countdown-actions">
                  <button type="button" onClick={() => complete(countdown.id)}>
                    Done
                  </button>
                  <button className="danger-action" type="button" onClick={() => remove(countdown.id)}>
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
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
  minLength,
  min,
  step
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  minLength?: number;
  min?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        minLength={minLength}
        min={min}
        step={step}
      />
    </label>
  );
}

export default App;
