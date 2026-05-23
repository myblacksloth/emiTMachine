import { FormEvent, useEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import {
  AlarmClock,
  BarChart3,
  CalendarClock,
  Clock,
  Download,
  FileText,
  Hourglass,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
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
import type {
  ActivitySession,
  AdminUser,
  AdministrativeRequest,
  AdministrativeRequestType,
  AuditLog,
  AuditLogPage,
  AuthMode,
  ChartBucket,
  DashboardData,
  ManagerAssignment,
  ManagerSummary,
  OvertimeReport,
  Tag,
  Toast
} from "./types";

const emptyDashboard: DashboardData = {
  user: { name: "User", username: "", email: null, publicId: "", role: "user", adminApproved: true, canEditSessions: true, totpEnabled: false, passkeyCount: 0, recoveryCodeCount: 0 },
  activeSession: null,
  tags: [],
  charts: { daily: [], weekly: [], monthly: [] },
  summary: {
    totalMinutes: 0,
    todayMinutes: 0,
    currentWeekMinutes: 0,
    averageDailyMinutes: 0,
    workedDays: 0,
    presenceMinutes: 0,
    smartWorkingMinutes: 0
  },
  countdowns: []
};

const palette = ["#27b3a8", "#ff8a4c", "#7c6ee6", "#e14f77", "#3f8cff", "#8abf45"];

function normalizedTagName(tag?: Tag) {
  return tag?.name.trim().toLowerCase() ?? "";
}

function presenceTag(tags: Tag[]) {
  return tags.find((tag) => normalizedTagName(tag) === "presence") ?? tags[0] ?? null;
}

function withExclusiveWorkMode(tags: Tag[], selectedIds: string[], changedTagId: string, checked: boolean) {
  const changedTag = tags.find((tag) => tag.id === changedTagId);
  const changedName = normalizedTagName(changedTag);
  let next = checked ? [...selectedIds, changedTagId] : selectedIds.filter((tagId) => tagId !== changedTagId);

  // Presence and Smart working are mutually exclusive work modes in every entry form.
  if (checked && changedName === "presence") {
    next = next.filter((tagId) => normalizedTagName(tags.find((tag) => tag.id === tagId)) !== "smart working");
  } else if (checked && changedName === "smart working") {
    next = next.filter((tagId) => normalizedTagName(tags.find((tag) => tag.id === tagId)) !== "presence");
  }

  return Array.from(new Set(next));
}

function hasExclusiveWorkModeConflict(tags: Tag[], selectedIds: string[]) {
  const selectedNames = new Set(selectedIds.map((tagId) => normalizedTagName(tags.find((tag) => tag.id === tagId))));
  return selectedNames.has("presence") && selectedNames.has("smart working");
}

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

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function weekStartKeyFromIso(value: string) {
  return localDateKey(startOfLocalWeek(new Date(value)));
}

function isCurrentLocalWeek(value: string) {
  return weekStartKeyFromIso(value) === weekStartKeyFromIso(new Date().toISOString());
}

function activityEffectiveMinutes(activity: ActivitySession) {
  if (activity.durationMinutes !== null) return activity.durationMinutes;
  const liveMinutes = Math.max(0, Math.floor((Date.now() - new Date(activity.startedAt).getTime()) / 60000));
  return Math.max(0, liveMinutes - activity.noCountMinutes);
}

function sameLocalMonth(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

function dayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function requestOverlapsDay(request: AdministrativeRequest, day: Date) {
  const { start, end } = dayRange(day);
  return new Date(request.startedAt) < end && new Date(request.endedAt) > start;
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

function isLocalDateTimeValue(value: string) {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && !Number.isNaN(date.getTime());
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


type CriticalDialogRequest =
  | { kind: "confirm"; title: string; message: string; resolve: (value: boolean) => void }
  | { kind: "prompt"; title: string; message: string; defaultValue: string; resolve: (value: string | null) => void };

let criticalDialogHandler: ((request: CriticalDialogRequest) => void) | null = null;

function confirmCritical(message: string, title = "Confirm action") {
  return new Promise<boolean>((resolve) => {
    criticalDialogHandler?.({ kind: "confirm", title, message, resolve });
  });
}

function promptCritical(message: string, defaultValue = "", title = "Edit value") {
  return new Promise<string | null>((resolve) => {
    criticalDialogHandler?.({ kind: "prompt", title, message, defaultValue, resolve });
  });
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
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
      <CriticalDialogHost />
    </div>
  );
}

function CriticalDialogHost() {
  const [dialog, setDialog] = useState<CriticalDialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    criticalDialogHandler = (request) => {
      setInputValue(request.kind === "prompt" ? request.defaultValue : "");
      setDialog(request);
    };
    return () => {
      criticalDialogHandler = null;
    };
  }, []);

  if (!dialog) return null;

  const close = (confirmed: boolean) => {
    if (dialog.kind === "confirm") {
      dialog.resolve(confirmed);
    } else {
      dialog.resolve(confirmed ? inputValue : null);
    }
    setDialog(null);
  };

  return (
    <div className="modal-backdrop critical-backdrop" role="presentation">
      <section className="modal critical-modal" role="dialog" aria-modal="true" aria-labelledby="critical-title">
        <div>
          <p className="eyebrow">Action required</p>
          <h2 id="critical-title">{dialog.title}</h2>
        </div>
        <p className="muted">{dialog.message}</p>
        {dialog.kind === "prompt" ? (
          <label className="field">
            <span>Value</span>
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} autoFocus />
          </label>
        ) : null}
        <div className="modal-actions">
          <button type="button" onClick={() => close(false)}>
            Cancel
          </button>
          <button className="primary-action" type="button" onClick={() => close(true)}>
            Confirm
          </button>
        </div>
      </section>
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
        if (!(await confirmCritical("Create this account?"))) return;
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
        if (!(await confirmCritical("Recover this account and change its password?"))) return;
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
  const [view, setView] = useState<"dashboard" | "activities" | "calendar" | "requests" | "overtime" | "tags" | "tools" | "countdowns" | "profile" | "admin" | "audit">("dashboard");
  const [showMore, setShowMore] = useState(false);

  const moreViews = ["overtime", "tags", "tools", "countdowns", "admin", "audit"] as const;
  const isMoreActive = (moreViews as readonly string[]).includes(view);

  function navTo(v: typeof view) {
    setView(v);
    setShowMore(false);
  }
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
          <button type="button" className="topbar-signout" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <nav className="section-nav" aria-label="Workspace sections">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")} type="button">
          <LayoutDashboard size={16} /> <span>Dashboard</span>
        </button>
        <button className={view === "activities" ? "active" : ""} onClick={() => setView("activities")} type="button">
          <CalendarClock size={16} /> <span>Activities</span>
        </button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")} type="button">
          <CalendarClock size={16} /> <span>Calendar</span>
        </button>
        <button className={view === "requests" ? "active" : ""} onClick={() => setView("requests")} type="button">
          <ShieldCheck size={16} /> <span>Requests</span>
        </button>
        <button className={view === "overtime" ? "active" : ""} onClick={() => setView("overtime")} type="button">
          <Hourglass size={16} /> <span>Overtime</span>
        </button>
        <button className={view === "tags" ? "active" : ""} onClick={() => setView("tags")} type="button">
          <Tags size={16} /> <span>Tags</span>
        </button>
        <button className={view === "tools" ? "active" : ""} onClick={() => setView("tools")} type="button">
          <Clock size={16} /> <span>Tools</span>
        </button>
        <button className={view === "countdowns" ? "active" : ""} onClick={() => setView("countdowns")} type="button">
          <AlarmClock size={16} /> <span>Countdowns</span>
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")} type="button">
          <UserRound size={16} /> <span>Profile</span>
        </button>
        {data.user.role !== "user" ? (
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")} type="button">
            <ShieldCheck size={16} /> <span>Admin</span>
          </button>
        ) : null}
        {data.user.role === "root" ? (
          <button className={view === "audit" ? "active" : ""} onClick={() => setView("audit")} type="button">
            <ScrollText size={16} /> <span>Audit log</span>
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
            <Metric label="Today" value={minutesLabel(data.summary.todayMinutes)} icon={<TimerReset size={18} />} />
            <Metric label="Current week" value={minutesLabel(data.summary.currentWeekMinutes)} icon={<CalendarClock size={18} />} />
            <Metric label="Daily average" value={minutesLabel(data.summary.averageDailyMinutes)} icon={<Sparkles size={18} />} />
            <Metric label="Presence / smart" value={`${minutesLabel(data.summary.presenceMinutes)} / ${minutesLabel(data.summary.smartWorkingMinutes)}`} icon={<BarChart3 size={18} />} />
          </section>

          <section className="chart-grid" aria-label="Time charts">
            <Chart title="Daily hours" buckets={data.charts.daily} />
            <Chart title="Weekly hours" buckets={data.charts.weekly} />
            <Chart title="Monthly hours" buckets={data.charts.monthly} />
          </section>

        </>
      ) : null}

      {view === "activities" ? <ActivityPanel tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "calendar" ? <MonthlyCalendarPanel /> : null}
      {view === "requests" ? <AdministrativeRequestsPanel userRole={data.user.role} onToast={onToast} /> : null}
      {view === "overtime" ? <OvertimePanel onToast={onToast} /> : null}
      {view === "tags" ? <TagManager tags={data.tags} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "tools" ? <TimeTools /> : null}
      {view === "countdowns" ? <Countdowns countdowns={data.countdowns} activeSessionId={data.activeSession?.id ?? null} onRefresh={onRefresh} onToast={onToast} /> : null}
      {view === "profile" ? <ProfileSettings data={data} onToast={onToast} onRefresh={onRefresh} /> : null}
      {view === "admin" && data.user.role !== "user" ? <AdminPanel currentRole={data.user.role} onToast={onToast} /> : null}
      {view === "audit" && data.user.role === "root" ? <AuditLogView onToast={onToast} /> : null}

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

      <button type="button" className="mobile-signout" onClick={onLogout}>
        <LogOut size={16} /> Sign out
      </button>

      {/* ── Bottom navigation (mobile only, ≤560px) ───────────── */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {showMore && (
          <div className="bottom-nav-tray" id="bottom-nav-tray" role="menu">
            <button
              type="button"
              className={view === "overtime" ? "active" : ""}
              aria-current={view === "overtime" ? "page" : undefined}
              onClick={() => navTo("overtime")}
            >
              <Hourglass size={20} /><span>Overtime</span>
            </button>
            <button
              type="button"
              className={view === "tags" ? "active" : ""}
              aria-current={view === "tags" ? "page" : undefined}
              onClick={() => navTo("tags")}
            >
              <Tags size={20} /><span>Tags</span>
            </button>
            <button
              type="button"
              className={view === "tools" ? "active" : ""}
              aria-current={view === "tools" ? "page" : undefined}
              onClick={() => navTo("tools")}
            >
              <Clock size={20} /><span>Tools</span>
            </button>
            <button
              type="button"
              className={view === "countdowns" ? "active" : ""}
              aria-current={view === "countdowns" ? "page" : undefined}
              onClick={() => navTo("countdowns")}
            >
              <AlarmClock size={20} /><span>Countdowns</span>
            </button>
            {data.user.role !== "user" && (
              <button
                type="button"
                className={view === "admin" ? "active" : ""}
                aria-current={view === "admin" ? "page" : undefined}
                onClick={() => navTo("admin")}
              >
                <ShieldCheck size={20} /><span>Admin</span>
              </button>
            )}
            {data.user.role === "root" && (
              <button
                type="button"
                className={view === "audit" ? "active" : ""}
                aria-current={view === "audit" ? "page" : undefined}
                onClick={() => navTo("audit")}
              >
                <ScrollText size={20} /><span>Audit</span>
              </button>
            )}
          </div>
        )}
        <div className="bottom-nav-bar">
          <button
            type="button"
            className={view === "dashboard" ? "active" : ""}
            aria-current={view === "dashboard" ? "page" : undefined}
            onClick={() => navTo("dashboard")}
          >
            <LayoutDashboard size={22} /><span>Dashboard</span>
          </button>
          <button
            type="button"
            className={view === "activities" ? "active" : ""}
            aria-current={view === "activities" ? "page" : undefined}
            onClick={() => navTo("activities")}
          >
            <CalendarClock size={22} /><span>Activities</span>
          </button>
          <button
            type="button"
            className={view === "calendar" ? "active" : ""}
            aria-current={view === "calendar" ? "page" : undefined}
            onClick={() => navTo("calendar")}
          >
            <CalendarClock size={22} /><span>Calendar</span>
          </button>
          <button
            type="button"
            className={view === "requests" ? "active" : ""}
            aria-current={view === "requests" ? "page" : undefined}
            onClick={() => navTo("requests")}
          >
            <ShieldCheck size={22} /><span>Requests</span>
          </button>
          <button
            type="button"
            className={view === "profile" ? "active" : ""}
            aria-current={view === "profile" ? "page" : undefined}
            onClick={() => navTo("profile")}
          >
            <UserRound size={22} /><span>Profile</span>
          </button>
          <button
            type="button"
            className={isMoreActive || showMore ? "active" : ""}
            aria-expanded={showMore}
            aria-controls="bottom-nav-tray"
            onClick={() => setShowMore((s) => !s)}
          >
            <MoreHorizontal size={22} /><span>More</span>
          </button>
        </div>
      </nav>
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

function MonthlyCalendarPanel() {
  const [activities, setActivities] = useState<ActivitySession[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivitySession | null>(null);
  const [administrativeRequests, setAdministrativeRequests] = useState<AdministrativeRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AdministrativeRequest | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadActivities = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextActivities, nextRequests] = await Promise.all([
        api.activities(),
        api.administrativeRequests()
      ]);
      setActivities(nextActivities);
      setAdministrativeRequests(
        nextRequests.filter((request) => request.status === "approved" && !request.deletedAt && request.requestType !== "activity_change")
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load monthly calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivities();
  }, []);

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfLocalWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [cursor]);

  const activitiesByDay = useMemo(() => {
    const grouped = new Map<string, ActivitySession[]>();
    for (const activity of activities) {
      const startedAt = new Date(activity.startedAt);
      if (!sameLocalMonth(startedAt, cursor)) continue;
      const key = localDateKey(startedAt);
      grouped.set(key, [...(grouped.get(key) ?? []), activity]);
    }
    for (const [key, sessions] of grouped) {
      grouped.set(key, [...sessions].sort((first, second) => new Date(first.startedAt).getTime() - new Date(second.startedAt).getTime()));
    }
    return grouped;
  }, [activities, cursor]);

  const approvedRequestsByDay = useMemo(() => {
    const grouped = new Map<string, AdministrativeRequest[]>();
    for (const day of monthDays) {
      if (!sameLocalMonth(day, cursor)) continue;
      const dayRequests = administrativeRequests
        .filter((request) => requestOverlapsDay(request, day))
        .sort((first, second) => new Date(first.startedAt).getTime() - new Date(second.startedAt).getTime());
      if (dayRequests.length > 0) grouped.set(localDateKey(day), dayRequests);
    }
    return grouped;
  }, [administrativeRequests, cursor, monthDays]);

  const monthActivities = Array.from(activitiesByDay.values()).flat();
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const monthRequests = administrativeRequests.filter((request) => new Date(request.startedAt) < monthEnd && new Date(request.endedAt) > monthStart);
  const monthTotalMinutes = monthActivities.reduce((total, activity) => total + activityEffectiveMinutes(activity), 0);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = localDateKey(new Date());

  const moveMonth = (offset: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <section className="panel calendar-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Monthly report</p>
          <h2>{monthLabel}</h2>
        </div>
        <div className="calendar-actions">
          <button type="button" onClick={() => moveMonth(-1)}>Previous</button>
          <button type="button" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
          <button type="button" onClick={() => moveMonth(1)}>Next</button>
          <button type="button" onClick={loadActivities} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading monthly calendar...</div> : null}
      <section className="summary-grid compact calendar-summary" aria-label="Monthly summary">
        <Metric label="Month total" value={minutesLabel(monthTotalMinutes)} icon={<TimerReset size={18} />} />
        <Metric label="Activities" value={String(monthActivities.length)} icon={<CalendarClock size={18} />} />
        <Metric label="Approved requests" value={String(monthRequests.length)} icon={<ShieldCheck size={18} />} />
        <Metric label="Worked days" value={String(activitiesByDay.size)} icon={<Zap size={18} />} />
      </section>
      <div className="calendar-weekdays" aria-hidden="true">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {monthDays.map((day) => {
          const key = localDateKey(day);
          const dayActivities = activitiesByDay.get(key) ?? [];
          const dayRequests = approvedRequestsByDay.get(key) ?? [];
          const inMonth = sameLocalMonth(day, cursor);
          const dayTotal = dayActivities.reduce((total, activity) => total + activityEffectiveMinutes(activity), 0);
          return (
            <article className={`calendar-day ${inMonth ? "" : "outside"} ${key === todayKey ? "today" : ""}`} key={key}>
              <div className="calendar-day-header">
                <span>{day.getDate()}</span>
                {dayTotal > 0 ? <strong>{minutesLabel(dayTotal)}</strong> : null}
              </div>
              <div className="calendar-activities">
                {dayActivities.map((activity) => {
                  const tag = activity.tags[0];
                  return (
                    <button
                      className="calendar-activity"
                      key={activity.id}
                      onClick={() => setSelectedActivity(activity)}
                      style={{ borderColor: tag?.color ?? "#8E8E93", background: `${tag?.color ?? "#8E8E93"}22` }}
                      type="button"
                    >
                      <span style={{ background: tag?.color ?? "#8E8E93" }} />
                      <div>
                        <strong>{new Date(activity.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</strong>
                        <small>{tag?.name ?? "Activity"} · {activity.durationMinutes === null ? "Live" : minutesLabel(activity.durationMinutes)}</small>
                      </div>
                    </button>
                  );
                })}
                {dayRequests.map((request) => {
                  const color = administrativeRequestCalendarColors[request.requestType as Exclude<AdministrativeRequestType, "activity_change">] ?? "#8E8E93";
                  return (
                    <button
                      className="calendar-activity calendar-request"
                      key={request.id}
                      onClick={() => setSelectedRequest(request)}
                      style={{ borderColor: color, background: `${color}22` }}
                      type="button"
                    >
                      <span style={{ background: color }} />
                      <div>
                        <strong>{administrativeRequestLabels[request.requestType]}</strong>
                        <small>
                          {new Date(request.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {new Date(request.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </small>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      {selectedActivity ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal activity-detail-modal" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">{selectedActivity.endedAt ? "Closed activity" : "Open activity"}</p>
                <h2 id="activity-detail-title">Activity details</h2>
              </div>
            </div>
            <div className="activity-detail-grid">
              <div>
                <span>Start</span>
                <strong>{new Date(selectedActivity.startedAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>End</span>
                <strong>{selectedActivity.endedAt ? new Date(selectedActivity.endedAt).toLocaleString() : "Running"}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{selectedActivity.durationMinutes === null ? "Live" : minutesLabel(selectedActivity.durationMinutes)}</strong>
              </div>
              <div>
                <span>No count</span>
                <strong>{minutesLabel(selectedActivity.noCountMinutes)}</strong>
              </div>
            </div>
            <div className="activity-tags detail-tags">
              {selectedActivity.tags.map((tag) => (
                <span key={tag.id}><i style={{ background: tag.color }} />{tag.name}</span>
              ))}
            </div>
            <p className="muted">{selectedActivity.note || "No note"}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setSelectedActivity(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedRequest ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal activity-detail-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">Approved administrative request</p>
                <h2 id="request-detail-title">{administrativeRequestLabels[selectedRequest.requestType]}</h2>
              </div>
            </div>
            <div className="activity-detail-grid">
              <div>
                <span>Start</span>
                <strong>{new Date(selectedRequest.startedAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>End</span>
                <strong>{new Date(selectedRequest.endedAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{requestStatusLabel(selectedRequest.status)}</strong>
              </div>
              <div>
                <span>Decided at</span>
                <strong>{selectedRequest.decidedAt ? new Date(selectedRequest.decidedAt).toLocaleString() : "Approved"}</strong>
              </div>
            </div>
            <p className="muted">{selectedRequest.note || "No note"}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setSelectedRequest(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

const administrativeRequestLabels: Record<AdministrativeRequestType, string> = {
  vacation: "Vacation",
  leave: "Leave",
  smart_working: "Smart working",
  activity_change: "Activity change"
};

const administrativeRequestCalendarColors: Record<Exclude<AdministrativeRequestType, "activity_change">, string> = {
  vacation: "#34C759",
  leave: "#FF9F0A",
  smart_working: "#0A84FF"
};

function requestStatusLabel(status: AdministrativeRequest["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadAdministrativeRequestsCsv(requests: AdministrativeRequest[]) {
  const header = ["id", "type", "status", "requester", "public_id", "start", "end", "archived_at", "note"];
  const rows = requests.map((request) => [
    request.id,
    administrativeRequestLabels[request.requestType],
    requestStatusLabel(request.status),
    request.requester?.username ?? "",
    request.requester?.publicId ?? "",
    request.startedAt,
    request.endedAt,
    request.archivedAt ?? "",
    request.note ?? ""
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `administrative-request-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function AdministrativeRequestsPanel({ userRole, onToast }: { userRole: "user" | "admin" | "root"; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [requests, setRequests] = useState<AdministrativeRequest[]>([]);
  const [reviewRequests, setReviewRequests] = useState<AdministrativeRequest[]>([]);
  const [selectedOwnRequestIds, setSelectedOwnRequestIds] = useState<Set<string>>(() => new Set());
  const [selectedReviewRequestIds, setSelectedReviewRequestIds] = useState<Set<string>>(() => new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRequests, setHistoryRequests] = useState<AdministrativeRequest[]>([]);
  const [historyUserOptions, setHistoryUserOptions] = useState<Array<{ userId: string; label: string; publicId: string }>>([]);
  const [historyYear, setHistoryYear] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyUserId, setHistoryUserId] = useState("");
  const [requestType, setRequestType] = useState<AdministrativeRequestType>("vacation");
  const [startedAt, setStartedAt] = useState(defaultStartDateTimeValue());
  const [endedAt, setEndedAt] = useState(defaultEndDateTimeValue());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canReview = userRole === "admin" || userRole === "root";

  const loadRequests = async () => {
    setMessage("");
    try {
      const [own, review] = await Promise.all([
        api.administrativeRequests(),
        canReview ? api.administrativeRequestsForReview() : Promise.resolve([])
      ]);
      setRequests(own);
      setReviewRequests(review);
      setSelectedOwnRequestIds(new Set());
      setSelectedReviewRequestIds(new Set());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load administrative requests.");
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const openCreateRequest = () => {
    setRequestType("vacation");
    setStartedAt(defaultStartDateTimeValue());
    setEndedAt(defaultEndDateTimeValue());
    setNote("");
    setMessage("");
    setCreateOpen(true);
  };

  const createRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLocalDateTimeValue(startedAt) || !isLocalDateTimeValue(endedAt)) {
      setMessage("Use date and time in YYYY-MM-DD and HH:MM format.");
      return;
    }
    if (new Date(endedAt) <= new Date(startedAt)) {
      setMessage("Request end time must be after start time.");
      return;
    }
    setCreateOpen(false);
    if (!(await confirmCritical("Submit this administrative request?"))) {
      setCreateOpen(true);
      return;
    }
    try {
      await api.createAdministrativeRequest({
        requestType,
        startedAt: isoFromLocalValue(startedAt),
        endedAt: isoFromLocalValue(endedAt),
        note
      });
      setNote("");
      await loadRequests();
      onToast("success", "Administrative request created.");
    } catch (error) {
      setCreateOpen(true);
      setMessage(error instanceof Error ? error.message : "Unable to create administrative request.");
    }
  };

  const setStatus = async (request: AdministrativeRequest, status: "approved" | "revoked") => {
    if (!(await confirmCritical(`${requestStatusLabel(status)} this administrative request?`))) return;
    try {
      await api.setAdministrativeRequestStatus(request.id, status);
      await loadRequests();
      onToast("success", `Request ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update administrative request.");
    }
  };

  const deleteRequest = async (request: AdministrativeRequest) => {
    const message = request.status === "pending"
      ? "Delete this pending administrative request? This cannot be undone."
      : "Delete this already reviewed request? It will remain visible as deleted while keeping its approval status.";
    if (!(await confirmCritical(message))) return;
    try {
      const result = await api.deleteAdministrativeRequest(request.id);
      await loadRequests();
      onToast("success", result.mode === "deleted" ? "Administrative request deleted." : "Administrative request marked as deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete administrative request.");
    }
  };

  const loadHistory = async (filters = { year: historyYear, month: historyMonth, userId: historyUserId }, refreshUserOptions = false) => {
    try {
      const nextHistory = await api.administrativeRequestHistory(filters);
      setHistoryRequests(nextHistory);
      if (refreshUserOptions) {
        const options = new Map<string, { userId: string; label: string; publicId: string }>();
        for (const request of nextHistory) {
          if (request.requester) {
            options.set(request.userId, {
              userId: request.userId,
              label: request.requester.displayName || request.requester.username,
              publicId: request.requester.publicId
            });
          }
        }
        setHistoryUserOptions(Array.from(options.values()));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load historical administrative requests.");
    }
  };

  const openHistory = async () => {
    setHistoryYear("");
    setHistoryMonth("");
    setHistoryUserId("");
    setHistoryOpen(true);
    await loadHistory({ year: "", month: "", userId: "" }, true);
  };

  const archiveRequests = async (requestIds: string[], clearSelection: () => void) => {
    if (requestIds.length === 0) return;
    if (!(await confirmCritical(`Move ${requestIds.length} already reviewed administrative request(s) to history?`))) return;
    try {
      const result = await api.archiveAdministrativeRequests(requestIds);
      clearSelection();
      await loadRequests();
      onToast("success", `${result.archived} request(s) moved to history.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to move requests to history.");
    }
  };

  const exportHistory = async () => {
    try {
      downloadAdministrativeRequestsCsv(await api.administrativeRequestHistory());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export administrative request history.");
    }
  };

  const clearHistory = async () => {
    if (!(await confirmCritical("Delete all administrative requests from your history view? This does not delete the canonical requests."))) return;
    try {
      const result = await api.clearAdministrativeRequestHistory();
      setHistoryRequests([]);
      await loadRequests();
      onToast("success", `${result.deletedCount} historical request(s) removed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to clear administrative request history.");
    }
  };

  const pending = reviewRequests.filter((request) => request.status === "pending");
  const decided = reviewRequests.filter((request) => request.status !== "pending");
  const selectedOwnRequestIdsArray = Array.from(selectedOwnRequestIds);
  const selectedReviewRequestIdsArray = Array.from(selectedReviewRequestIds);

  return (
    <section className="request-grid">
      <section className="panel stack">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Administrative Requests</p>
            <h2>Requests</h2>
          </div>
          <button className="primary-action" type="button" onClick={openCreateRequest}>
            <Plus size={18} /> New request
          </button>
        </div>
        {message ? <p className="form-message error">{message}</p> : null}
      </section>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title" onSubmit={createRequest}>
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">Administrative Requests</p>
                <h2 id="request-modal-title">New request</h2>
              </div>
            </div>
            {message ? <p className="form-message error">{message}</p> : null}
            <label className="field">
              <span>Type</span>
              <select value={requestType} onChange={(event) => setRequestType(event.target.value as AdministrativeRequestType)}>
                <option value="vacation">Vacation</option>
                <option value="leave">Leave</option>
                <option value="smart_working">Smart working</option>
              </select>
            </label>
            <DateTimeField label="Start" value={startedAt} onChange={setStartedAt} />
            <DateTimeField label="End" value={endedAt} onChange={setEndedAt} />
            <label className="field">
              <span>Note</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="primary-action" type="submit">
                <Save size={18} /> Submit request
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="panel stack">
        <div className="panel-title">
          <h2>My requests</h2>
          <div className="request-toolbar">
            <button type="button" onClick={loadRequests}><RefreshCw size={16} /> Refresh</button>
            <button
              type="button"
              onClick={() => archiveRequests(selectedOwnRequestIdsArray, () => setSelectedOwnRequestIds(new Set()))}
              disabled={selectedOwnRequestIds.size === 0}
            >
              Move to history
            </button>
          </div>
        </div>
        <RequestList
          requests={requests}
          onDelete={deleteRequest}
          selectedIds={selectedOwnRequestIds}
          onSelectionChange={setSelectedOwnRequestIds}
        />
      </section>

      {canReview ? (
        <>
          <section className="panel stack">
            <div className="panel-title">
              <h2>Requests to review</h2>
            </div>
            <RequestList requests={pending} onStatus={setStatus} />
          </section>
          <section className="panel stack">
            <div className="panel-title">
              <h2>Reviewed requests</h2>
              <button
                type="button"
                onClick={() => archiveRequests(selectedReviewRequestIdsArray, () => setSelectedReviewRequestIds(new Set()))}
                disabled={selectedReviewRequestIds.size === 0}
              >
                Move to history
              </button>
            </div>
            <RequestList
              requests={decided}
              onStatus={setStatus}
              selectedIds={selectedReviewRequestIds}
              onSelectionChange={setSelectedReviewRequestIds}
            />
          </section>
        </>
      ) : null}

      <section className="panel stack">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Administrative Requests</p>
            <h2>History</h2>
          </div>
          <button type="button" onClick={openHistory}>Open history</button>
        </div>
      </section>

      {historyOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">Administrative Requests</p>
                <h2 id="history-modal-title">Historical requests</h2>
              </div>
            </div>
            <div className="history-filters">
              <label className="field">
                <span>Year</span>
                <input value={historyYear} onChange={(event) => setHistoryYear(event.target.value)} placeholder="2026" inputMode="numeric" />
              </label>
              <label className="field">
                <span>Month</span>
                <select value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)}>
                  <option value="">All</option>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option value={String(index + 1)} key={index + 1}>
                      {new Date(2026, index, 1).toLocaleDateString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>User</span>
                <select value={historyUserId} onChange={(event) => setHistoryUserId(event.target.value)}>
                  <option value="">All</option>
                  {historyUserOptions.map((requester) => (
                    <option value={requester.userId} key={requester.publicId}>
                      {requester.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => loadHistory()}>Apply filters</button>
            </div>
            <RequestList requests={historyRequests} />
            <div className="modal-actions">
              <button type="button" onClick={exportHistory}>
                <Download size={16} /> Export CSV
              </button>
              <button className="danger-action" type="button" onClick={clearHistory}>
                <Trash2 size={16} /> Clear history
              </button>
              <button type="button" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function RequestList({
  requests,
  onStatus,
  onDelete,
  selectedIds,
  onSelectionChange
}: {
  requests: AdministrativeRequest[];
  onStatus?: (request: AdministrativeRequest, status: "approved" | "revoked") => void;
  onDelete?: (request: AdministrativeRequest) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}) {
  if (requests.length === 0) {
    return <p className="empty-state">No administrative requests.</p>;
  }
  const selectableRequests = requests.filter((request) => request.status !== "pending");
  const allSelected = selectableRequests.length > 0 && selectableRequests.every((request) => selectedIds?.has(request.id));
  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(selectableRequests.map((request) => request.id)));
  };
  const toggleOne = (requestId: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(requestId)) {
      next.delete(requestId);
    } else {
      next.add(requestId);
    }
    onSelectionChange(next);
  };
  return (
    <div className="request-list">
      {onSelectionChange && selectableRequests.length > 0 ? (
        <label className="request-select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>Select all reviewed requests</span>
        </label>
      ) : null}
      {requests.map((request) => (
        <article className={`request-card ${request.status} ${request.deletedAt ? "deleted" : ""}`} key={request.id}>
          {onSelectionChange && request.status !== "pending" ? (
            <label className="request-select">
              <input type="checkbox" checked={selectedIds?.has(request.id) ?? false} onChange={() => toggleOne(request.id)} />
            </label>
          ) : null}
          <div>
            <p className="eyebrow">{request.requester ? `${request.requester.displayName} (${request.requester.username})` : requestStatusLabel(request.status)}</p>
            <h3>{administrativeRequestLabels[request.requestType]}</h3>
            <p className="muted">{new Date(request.startedAt).toLocaleString()} - {new Date(request.endedAt).toLocaleString()}</p>
            {request.note ? <p className="muted">{request.note}</p> : null}
            {request.deletedAt ? <p className="deleted-request-note">Deleted · original status: {requestStatusLabel(request.status)}</p> : null}
            {request.archivedAt ? <p className="deleted-request-note">Archived · {new Date(request.archivedAt).toLocaleString()}</p> : null}
          </div>
          <div className="request-actions">
            <strong>{requestStatusLabel(request.status)}</strong>
            {onStatus && !request.deletedAt ? (
              <>
                <button type="button" onClick={() => onStatus(request, "approved")}>Approve</button>
                <button className="danger-action" type="button" onClick={() => onStatus(request, "revoked")}>Revoke</button>
              </>
            ) : null}
            {onDelete && !request.deletedAt ? (
              <button className="danger-action" type="button" onClick={() => onDelete(request)}>
                <Trash2 size={16} /> Delete
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
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
    if (!(await confirmCritical("Save this weekly target? This value can be set only once."))) return;
    try {
      setReport(await api.setWeeklyWorkMinutes(minutes));
      onToast("success", "Weekly target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save weekly target.");
    }
  };

  const markPaid = async (weekStart: string) => {
    if (!(await confirmCritical("Mark this overtime week as paid? You will need an admin to remove this status."))) return;
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

const AUDIT_EVENT_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  password_change: "Password change",
  totp_setup: "TOTP setup",
  totp_reset: "TOTP reset",
  passkey_added: "Passkey added",
  passkey_removed: "Passkey removed",
  manual_clock_in: "Manual clock-in",
  manual_clock_out: "Manual clock-out",
  activity_created: "Activity created",
  activity_updated: "Activity updated",
  activity_deleted: "Activity deleted",
  csv_exported: "CSV exported",
  csv_imported: "CSV imported",
  overtime_target_set: "Overtime target set",
  overtime_paid: "Overtime marked paid",
  overtime_paid_revoked: "Overtime payment revoked",
  recovery_code_used: "Recovery code used",
  password_recovery: "Password recovery"
};

function AuditLogView({ onToast }: { onToast: (tone: Toast["tone"], message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // filter state
  const [filterUserId, setFilterUserId] = useState("");
  const [filterTargetUserId, setFilterTargetUserId] = useState("");
  const [filterEventType, setFilterEventType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // applied filters (only update on Search)
  const [appliedUserId, setAppliedUserId] = useState("");
  const [appliedTargetUserId, setAppliedTargetUserId] = useState("");
  const [appliedEventType, setAppliedEventType] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_LIMIT = 50;

  useEffect(() => {
    api.adminUsers()
      .then(setUsers)
      .catch(() => { /* non-fatal — user picker still works without the list */ });
  }, []);

  const fetchLogs = async (pg: number, uid: string, tuid: string, et: string, df: string, dt: string) => {
    setLoading(true);
    setMessage("");
    try {
      const result = await api.auditLogs({
        userId: uid || undefined,
        targetUserId: tuid || undefined,
        eventType: et || undefined,
        dateFrom: df || undefined,
        dateTo: dt || undefined,
        page: pg,
        limit: PAGE_LIMIT
      });
      setPage(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(currentPage, appliedUserId, appliedTargetUserId, appliedEventType, appliedDateFrom, appliedDateTo);
  }, [currentPage, appliedUserId, appliedTargetUserId, appliedEventType, appliedDateFrom, appliedDateTo]);

  const applyFilters = () => {
    setCurrentPage(1);
    setAppliedUserId(filterUserId);
    setAppliedTargetUserId(filterTargetUserId);
    setAppliedEventType(filterEventType);
    setAppliedDateFrom(filterDateFrom);
    setAppliedDateTo(filterDateTo);
  };

  const resetFilters = () => {
    setFilterUserId("");
    setFilterTargetUserId("");
    setFilterEventType("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
    setAppliedUserId("");
    setAppliedTargetUserId("");
    setAppliedEventType("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
  };

  const exportCsv = () => {
    const url = api.auditExportUrl({
      userId: appliedUserId || undefined,
      targetUserId: appliedTargetUserId || undefined,
      eventType: appliedEventType || undefined,
      dateFrom: appliedDateFrom || undefined,
      dateTo: appliedDateTo || undefined
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const totalPages = page ? Math.max(1, Math.ceil(page.total / PAGE_LIMIT)) : 1;

  const metadataSnippet = (metadata: AuditLog["metadata"]) => {
    if (metadata === null || metadata === undefined) return null;
    const text = JSON.stringify(metadata, null, 2);
    const truncated = text.length > 80 ? text.slice(0, 80) + "…" : text;
    return <code className="audit-meta-code" title={text}>{truncated}</code>;
  };

  const userLabel = (id: string | null, username: string | null) => {
    if (!id && !username) return <span className="muted">—</span>;
    return <span>{username ?? id}</span>;
  };

  return (
    <section className="panel stack audit-log-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">root console</p>
          <h2>Audit log</h2>
        </div>
        <button type="button" onClick={exportCsv}>
          <Download size={16} /> Export CSV
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(
              api.workReportPdfUrl({
                userId: filterUserId || undefined,
                dateFrom: filterDateFrom || undefined,
                dateTo: filterDateTo || undefined
              }),
              "_blank"
            )
          }
        >
          <FileText size={16} /> Download PDF
        </button>
      </div>

      <div className="audit-filter-bar">
        <label className="field audit-filter-field">
          <span>Actor</span>
          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
          >
            <option value="">All actors</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </label>

        <label className="field audit-filter-field">
          <span>Target user</span>
          <select
            value={filterTargetUserId}
            onChange={(e) => setFilterTargetUserId(e.target.value)}
          >
            <option value="">All targets</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </label>

        <label className="field audit-filter-field">
          <span>Event type</span>
          <select
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
          >
            <option value="">All types</option>
            {Object.entries(AUDIT_EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="field audit-filter-field">
          <span>From</span>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </label>

        <label className="field audit-filter-field">
          <span>To</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </label>

        <div className="audit-filter-actions">
          <button type="button" className="primary-action" onClick={applyFilters}>
            Search
          </button>
          <button type="button" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading audit logs...</div> : null}

      {!loading && page && page.logs.length === 0 ? (
        <p className="empty-state">No audit log entries match the current filters.</p>
      ) : null}

      {page && page.logs.length > 0 ? (
        <>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Event</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {page.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="audit-cell-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>{userLabel(log.userId, log.userUsername)}</td>
                    <td>{userLabel(log.targetUserId, log.targetUserUsername)}</td>
                    <td>
                      <span className="audit-event-badge">
                        {AUDIT_EVENT_LABELS[log.eventType] ?? log.eventType}
                      </span>
                    </td>
                    <td className="audit-cell-mono">
                      {log.ipAddress ?? <span className="muted">—</span>}
                    </td>
                    <td>{metadataSnippet(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="audit-pagination">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="audit-page-label">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminPanel({ currentRole, onToast }: { currentRole: "admin" | "root"; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<ManagerAssignment[]>([]);
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
      const [loaded, assignments] = await Promise.all([api.adminUsers(), api.managerAssignments()]);
      setUsers(loaded);
      setManagerAssignments(assignments);
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
    if (!(await confirmCritical(`Approve ${user.username} as admin?`))) return;
    await api.approveAdmin(user.id);
    await loadUsers();
    onToast("success", `${user.username} approved.`);
  };

  const toggleEditPermission = async (user: AdminUser) => {
    if (!(await confirmCritical(`${user.canEditSessions ? "Disable" : "Enable"} session editing for ${user.username}?`))) return;
    await api.setUserEditPermission(user.id, !user.canEditSessions);
    await loadUsers();
    onToast("success", "Session edit permission updated.");
  };

  const updatePublicId = async (user: AdminUser) => {
    const nextPublicId = await promptCritical(`User ID for ${user.username}`, user.publicId, "Edit user ID");
    if (nextPublicId === null) return;
    const trimmed = nextPublicId.trim();
    if (!trimmed) {
      setMessage("User ID cannot be empty.");
      return;
    }
    if (!(await confirmCritical(`Change the User ID for ${user.username} to "${trimmed}"?`))) return;
    await api.setUserPublicId(user.id, trimmed);
    await loadUsers();
    onToast("success", "User ID updated.");
  };

  const updateUserProfile = async (user: AdminUser) => {
    const displayName = await promptCritical(`Name for ${user.username}`, user.displayName || user.username, "Edit name");
    if (displayName === null) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setMessage("Name cannot be empty.");
      return;
    }
    const email = await promptCritical(`Email for ${user.username}`, user.email ?? "", "Edit email");
    if (email === null) return;
    if (!(await confirmCritical(`Update name and email for ${user.username}?`))) return;
    await api.setUserProfile(user.id, trimmedName, email);
    await loadUsers();
    await loadSelectedUserData(user.id);
    onToast("success", "User profile updated.");
  };

  const findUserForManagerInput = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return users.find(
      (user) =>
        user.id.toLowerCase() === normalized ||
        user.publicId.toLowerCase() === normalized ||
        user.username.toLowerCase() === normalized
    );
  };

  const addManagedUser = async (manager: AdminUser) => {
    const value = await promptCritical(`Username or User ID to assign to ${manager.username}`, "", "Assign responsible");
    if (value === null) return;
    const target = findUserForManagerInput(value);
    if (!target) {
      setMessage("User not found. Use username or User ID.");
      return;
    }
    if (!(await confirmCritical(`Assign ${target.username} to responsible admin ${manager.username}?`))) return;
    await api.addManagedUser(manager.id, target.id);
    setManagerAssignments(await api.managerAssignments());
    onToast("success", "Responsible user assigned.");
  };

  const removeManagedUser = async (manager: AdminUser, target: AdminUser) => {
    if (!(await confirmCritical(`Remove ${manager.username} as responsible for ${target.username}?`))) return;
    await api.removeManagedUser(manager.id, target.id);
    setManagerAssignments(await api.managerAssignments());
    onToast("success", "Responsible user removed.");
  };

  const toggleOvertimePermission = async (user: AdminUser) => {
    if (!(await confirmCritical(`${user.overtimeEnabled ? "Disable" : "Enable"} overtime/time bank for ${user.username}?`))) return;
    await api.setUserOvertimePermission(user.id, !user.overtimeEnabled, user.overtimeMode);
    await loadUsers();
    await loadSelectedUserData(user.id);
    onToast("success", "Overtime feature updated.");
  };

  const changeOvertimeMode = async (user: AdminUser, mode: "overtime" | "time_bank") => {
    if (!(await confirmCritical(`Change overtime mode for ${user.username}?`))) return;
    await api.setUserOvertimePermission(user.id, true, mode);
    await loadUsers();
    await loadSelectedUserData(user.id);
    onToast("success", "Overtime mode updated.");
  };

  const deleteOvertimePayment = async (weekStart: string) => {
    if (!selectedUserId) return;
    if (!(await confirmCritical("Remove this paid status from the selected user?"))) return;
    await api.deleteUserOvertimePayment(selectedUserId, weekStart);
    await loadSelectedUserData(selectedUserId);
    onToast("success", "Payment status removed.");
  };

  const resetPassword = async (user: AdminUser) => {
    if (!(await confirmCritical(`Reset password for ${user.username}? Active sessions will be revoked.`))) return;
    const result = await api.resetUserPassword(user.id);
    setTemporaryPassword(result.temporaryPassword);
    onToast("success", "Temporary password generated.");
  };

  const deleteUser = async (user: AdminUser) => {
    if (!(await confirmCritical(`Delete ${user.username} permanently?`))) return;
    await api.deleteUser(user.id);
    setSelectedUserId("");
    await loadUsers();
    onToast("success", "User deleted.");
  };

  const toggleRegistration = async () => {
    if (!(await confirmCritical(`${registrationEnabled ? "Lock" : "Open"} user registration?`))) return;
    await api.setRegistrationSetting(!registrationEnabled);
    setRegistrationEnabled(!registrationEnabled);
    onToast("success", "Registration setting updated.");
  };

  const cleanupAdministrativeRequests = async () => {
    // Root confirmation keeps cleanup explicit because the deleted requests are not restored by the UI.
    if (!(await confirmCritical("Delete administrative requests completed before the current month? This cannot be undone."))) return;
    const result = await api.cleanupAdministrativeRequests();
    onToast("success", `${result.deletedCount} old administrative request${result.deletedCount === 1 ? "" : "s"} deleted.`);
  };

  const importSelectedUserData = async (file: File | null) => {
    if (!selectedUser || !file) return;
    if (
      !(await confirmCritical(
        `Import this JSON backup into ${selectedUser.username}? Current sessions, tags, countdowns, overtime payments, and administrative requests for this user will be replaced.`
      ))
    ) {
      return;
    }
    try {
      const result = await api.importAdminUserData(selectedUser.id, file);
      await loadUsers();
      await loadSelectedUserData(selectedUser.id);
      onToast(
        "success",
        `Imported ${result.imported.sessions} sessions, ${result.imported.events} events, and ${result.imported.administrativeRequests} administrative requests.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import user data.");
      onToast("error", "User data import failed.");
    }
  };

  const copyUserId = async (user: AdminUser) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(user.publicId);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = user.publicId;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      onToast("success", "User ID copied to clipboard.");
    } catch {
      onToast("error", "Unable to copy user ID.");
    }
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
          {users.map((user) => {
            const isPendingAdmin = user.role === "admin" && !user.adminApproved;
            return (
              <article className={`admin-user ${selectedUserId === user.id ? "active" : ""} ${isPendingAdmin ? "pending-admin" : ""}`} key={user.id}>
                <div className="admin-user-header">
                  <button className="admin-user-select" type="button" onClick={() => setSelectedUserId(user.id)}>
                    <strong>{user.username}</strong>
                    <span>{user.role}{isPendingAdmin ? " · pending" : ""}</span>
                  </button>
                  <button className="copy-id-button" type="button" onClick={() => copyUserId(user)} title="Copy user ID">
                    {user.publicId}
                  </button>
                </div>
                {isPendingAdmin ? (
                  <div className="pending-admin-banner">
                    <strong>Approval pending</strong>
                    <span>This admin account cannot sign in until root approves it.</span>
                  </div>
                ) : null}
                <div className="admin-user-actions">
                  {currentRole === "root" && isPendingAdmin ? (
                    <button className="approve-admin-action" type="button" onClick={() => approveAdmin(user)}>Approve admin</button>
                  ) : null}
                  {user.role === "admin" && user.adminApproved ? (
                    <button type="button" onClick={() => addManagedUser(user)}>Add managed user</button>
                  ) : null}
                  {currentRole === "root" || user.role === "user" ? (
                    <button type="button" onClick={() => updatePublicId(user)}>Edit user ID</button>
                  ) : null}
                  {currentRole === "root" || user.role === "user" ? (
                    <button type="button" onClick={() => updateUserProfile(user)}>Edit name/email</button>
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
                {user.role === "admin" && user.adminApproved ? (
                <div className="manager-chip-list">
                  {managerAssignments.filter((assignment) => assignment.managerUserId === user.id).map((assignment) => {
                    const target = users.find((candidate) => candidate.id === assignment.userId);
                    if (!target) return null;
                    return (
                      <span key={`${assignment.managerUserId}-${assignment.userId}`}>
                        {target.username}
                        <button type="button" aria-label={`Remove ${target.username}`} onClick={() => removeManagedUser(user, target)}>
                          x
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              </article>
            );
          })}
        </div>
        {currentRole === "root" ? (
          <div className="admin-maintenance-actions">
            <a className="download-link" href={api.adminDumpUrl}>
              <Download size={16} /> Download JSON dump
            </a>
            <button className="danger-action" type="button" onClick={cleanupAdministrativeRequests}>
              <Trash2 size={16} /> Clean old requests
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Selected user</p>
            <h2>{selectedUser?.username ?? "No user selected"}</h2>
            {selectedUser ? (
              <p className="muted">
                User ID:{" "}
                <button className="inline-copy-id" type="button" onClick={() => copyUserId(selectedUser)} title="Copy user ID">
                  {selectedUser.publicId}
                </button>
              </p>
            ) : null}
            {selectedUser ? <p className="muted">Name: {selectedUser.displayName || selectedUser.username} · Email: {selectedUser.email || "not set"}</p> : null}
          </div>
          {selectedUser ? (
            <div className="selected-user-data-actions">
              <a className="download-link" href={api.adminUserExportUrl(selectedUser.id)}>
                <Download size={16} /> Export user data
              </a>
              <label className="download-link upload-link">
                <UploadCloud size={16} /> Import user data
                <input
                  accept=".json,application/json"
                  type="file"
                  onChange={(event) => {
                    void importSelectedUserData(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          ) : null}
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
                  <p className="muted">
                    {session.note || "No note"}
                    {session.noCountMinutes > 0 ? ` · No count ${minutesLabel(session.noCountMinutes)}` : ""}
                  </p>
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
  const [selectedWeekStart, setSelectedWeekStart] = useState("");

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

  const weeklyGroups = useMemo(() => {
    const groups = new Map<string, ActivitySession[]>();
    for (const activity of activities) {
      const weekStart = weekStartKeyFromIso(activity.startedAt);
      groups.set(weekStart, [...(groups.get(weekStart) ?? []), activity]);
    }
    return Array.from(groups.entries())
      .map(([weekStart, sessions]) => {
        const sortedSessions = [...sessions].sort((first, second) => new Date(second.startedAt).getTime() - new Date(first.startedAt).getTime());
        const totalMinutes = sortedSessions.reduce((total, session) => total + activityEffectiveMinutes(session), 0);
        const daysWorked = new Set(sortedSessions.map((session) => localDateKey(new Date(session.startedAt)))).size;
        const noCountMinutes = sortedSessions.reduce((total, session) => total + session.noCountMinutes, 0);
        return { weekStart, sessions: sortedSessions, totalMinutes, daysWorked, noCountMinutes };
      })
      .sort((first, second) => dateFromDateOnly(second.weekStart).getTime() - dateFromDateOnly(first.weekStart).getTime());
  }, [activities]);

  const activeWeekStart = selectedWeekStart || weeklyGroups[0]?.weekStart || weekStartKeyFromIso(new Date().toISOString());
  const activeWeek = weeklyGroups.find((group) => group.weekStart === activeWeekStart) ?? (
    creating ? { weekStart: activeWeekStart, sessions: [], totalMinutes: 0, daysWorked: 0, noCountMinutes: 0 } : null
  );

  useEffect(() => {
    if (weeklyGroups.length > 0 && !weeklyGroups.some((group) => group.weekStart === activeWeekStart)) {
      setSelectedWeekStart(weeklyGroups[0].weekStart);
    }
  }, [weeklyGroups, activeWeekStart]);

  const startEdit = (activity: ActivitySession) => {
    setEditingId(activity.id);
    setDraft({
      startedAt: localValueFromIso(activity.startedAt),
      endedAt: localValueFromIso(activity.endedAt),
      startTimezone: activity.startTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      endTimezone: activity.endTimezone || activity.startTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      note: activity.note,
      tagIds: activity.tagIds,
      reason: "User correction",
      noCountMinutes: activity.noCountMinutes
    });
  };

  const startCreate = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const defaultTag = presenceTag(tags);
    setMessage("");
    setCreating(true);
    setEditingId(null);
    setDraft({
      startedAt: defaultStartDateTimeValue(),
      endedAt: defaultEndDateTimeValue(),
      startTimezone: timezone,
      endTimezone: timezone,
      note: "",
      tagIds: defaultTag ? [defaultTag.id] : [],
      reason: "Manual activity insert",
      noCountMinutes: 0
    });
  };

  const cancelCreate = () => {
    setCreating(false);
    setDraft(null);
    setMessage("");
  };

  const saveActivity = async (activityId: string) => {
    if (!draft) return;
    if (draft.tagIds.length === 0) {
      setMessage("Select at least one tag before saving.");
      return;
    }
    if (hasExclusiveWorkModeConflict(tags, draft.tagIds)) {
      setMessage("Presence and Smart working cannot be selected together.");
      return;
    }
    if (!(await confirmCritical("Save changes to this activity?"))) return;
    let reason = draft.reason;
    const originalActivity = activities.find((activity) => activity.id === activityId);
    if (!isCurrentLocalWeek(draft.startedAt) || (originalActivity && !isCurrentLocalWeek(originalActivity.startedAt))) {
      const value = await promptCritical("Reason for changing this historical activity", draft.reason, "Audit reason");
      if (value === null) return;
      reason = value;
    }
    try {
      const result = await api.updateActivity(activityId, {
        startedAt: isoFromLocalValue(draft.startedAt),
        endedAt: draft.endedAt ? isoFromLocalValue(draft.endedAt) : null,
        startTimezone: draft.startTimezone,
        endTimezone: draft.endedAt ? draft.endTimezone : null,
        note: draft.note,
        tagIds: draft.tagIds,
        reason,
        noCountMinutes: draft.noCountMinutes
      });
      setEditingId(null);
      setDraft(null);
      await loadActivities();
      await onRefresh();
      onToast("success", result.pendingApproval ? "Historical activity update submitted for approval." : "Activity updated.");
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
    if (hasExclusiveWorkModeConflict(tags, draft.tagIds)) {
      setMessage("Presence and Smart working cannot be selected together.");
      return;
    }
    if (!(await confirmCritical("Create this manual activity?"))) return;
    let reason = draft.reason;
    if (!isCurrentLocalWeek(draft.startedAt)) {
      const value = await promptCritical("Reason for creating this historical activity", draft.reason, "Audit reason");
      if (value === null) return;
      reason = value;
    }
    try {
      const result = await api.createActivity({
        startedAt: isoFromLocalValue(draft.startedAt),
        endedAt: draft.endedAt ? isoFromLocalValue(draft.endedAt) : null,
        startTimezone: draft.startTimezone,
        endTimezone: draft.endedAt ? draft.endTimezone : null,
        note: draft.note,
        tagIds: draft.tagIds,
        reason,
        noCountMinutes: draft.noCountMinutes
      });
      setCreating(false);
      setDraft(null);
      await loadActivities();
      await onRefresh();
      onToast("success", result.pendingApproval ? "Historical activity creation submitted for approval." : "Activity created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create activity.");
    }
  };

  const deleteActivity = async (activity: ActivitySession) => {
    if (!(await confirmCritical("Delete this activity permanently? This cannot be undone."))) return;
    let reason: string | undefined;
    if (!isCurrentLocalWeek(activity.startedAt)) {
      const value = await promptCritical("Reason for deleting this historical activity", "Historical activity deletion", "Audit reason");
      if (value === null) return;
      reason = value;
    }
    try {
      const result = await api.deleteActivity(activity.id, reason);
      await loadActivities();
      await onRefresh();
      onToast(
        "success",
        result && typeof result === "object" && "pendingApproval" in result && result.pendingApproval
          ? "Historical activity deletion submitted for approval."
          : "Activity deleted."
      );
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
      {message && !creating && !editingId ? <p className="form-message error">{message}</p> : null}
      {loading ? <div className="loading-line">Loading activities...</div> : null}
      {activities.length === 0 && !loading ? <p className="empty-state">No activities recorded yet.</p> : null}
      {weeklyGroups.length > 0 ? (
        <div className="week-tabs" role="tablist" aria-label="Activity weeks">
          {weeklyGroups.map((group) => (
            <button
              className={group.weekStart === activeWeekStart ? "active" : ""}
              key={group.weekStart}
              onClick={() => setSelectedWeekStart(group.weekStart)}
              role="tab"
              type="button"
            >
              {weekRangeLabel(group.weekStart)}
            </button>
          ))}
        </div>
      ) : null}
      {activeWeek ? (
        <section className="week-activity-section" aria-label={`Activities for ${weekRangeLabel(activeWeek.weekStart)}`}>
          <div className="panel-title compact-title">
            <div>
              <p className="eyebrow">Week</p>
              <h2>{weekRangeLabel(activeWeek.weekStart)}</h2>
            </div>
          </div>
          <section className="summary-grid compact week-summary" aria-label="Week summary">
            <Metric label="Week total" value={minutesLabel(activeWeek.totalMinutes)} icon={<TimerReset size={18} />} />
            <Metric label="Sessions" value={String(activeWeek.sessions.length)} icon={<CalendarClock size={18} />} />
            <Metric label="Worked days" value={String(activeWeek.daysWorked)} icon={<Zap size={18} />} />
            <Metric label="No count" value={minutesLabel(activeWeek.noCountMinutes)} icon={<BarChart3 size={18} />} />
          </section>
          <div className="activity-list">
            {activeWeek.sessions.map((activity) => {
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
                      error={editingId === activity.id ? (message || undefined) : undefined}
                    />
                  ) : (
                    <>
                      <div className="activity-main">
                        <div>
                          <p className="eyebrow">{activity.endedAt ? "Closed session" : "Open session"}</p>
                          <h3>
                            <span>{new Date(activity.startedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                            <span className="activity-time-range">
                              {new Date(activity.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                              {" - "}
                              {activity.endedAt ? new Date(activity.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "now"}
                            </span>
                          </h3>
                          <p className="muted">
                            {activity.durationMinutes === null ? "Running" : minutesLabel(activity.durationMinutes)}
                            {activity.noCountMinutes > 0 ? ` · No count ${minutesLabel(activity.noCountMinutes)}` : ""}
                            {" · "}{activity.note || "No note"}
                          </p>
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
      ) : null}
      {creating && draft ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title">
            <div className="panel-title compact-title">
              <div>
                <p className="eyebrow">Manual activity</p>
                <h2 id="activity-modal-title">Add activity</h2>
              </div>
            </div>
            <ActivityEditor
              draft={draft}
              tags={tags}
              onDraft={setDraft}
              onCancel={cancelCreate}
              onSave={createActivity}
              saveLabel="Create activity"
              error={message || undefined}
            />
          </section>
        </div>
      ) : null}
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
  noCountMinutes: number;
};

function ActivityEditor({
  draft,
  tags,
  onDraft,
  onCancel,
  onSave,
  saveLabel,
  error
}: {
  draft: ActivityDraft;
  tags: Tag[];
  onDraft: (draft: ActivityDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  error?: string;
}) {
  return (
    <div className="activity-editor activity-card-editing">
      <div className="activity-edit-grid">
        <DateTimeField label="Start" value={draft.startedAt} onChange={(value) => onDraft({ ...draft, startedAt: value })} />
        <DateTimeField label="End" value={draft.endedAt} onChange={(value) => onDraft({ ...draft, endedAt: value })} />
        <TextField label="Start timezone" value={draft.startTimezone} onChange={(value) => onDraft({ ...draft, startTimezone: value })} />
        <TextField label="End timezone" value={draft.endTimezone} onChange={(value) => onDraft({ ...draft, endTimezone: value })} />
      </div>
      <NoCountField
        minutes={draft.noCountMinutes}
        onChange={(minutes) => onDraft({ ...draft, noCountMinutes: minutes })}
      />
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
                  tagIds: withExclusiveWorkMode(tags, draft.tagIds, tag.id, event.target.checked)
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
      {error ? <p className="form-message error">{error}</p> : null}
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
  const defaultTag = presenceTag(tags);
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTagIds.length ? defaultTagIds : mode === "in" && defaultTag ? [defaultTag.id] : []);
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
    if (hasExclusiveWorkModeConflict(tags, selectedTags)) {
      setError("Presence and Smart working cannot be selected together.");
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
        <DateTimeField label="Event time" value={occurredAt} onChange={setOccurredAt} />
        <fieldset className="tag-picker">
          <legend>Tags</legend>
          {tags.length === 0 ? <p className="empty-state">Create a tag before assigning one.</p> : null}
          {tags.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={selectedTags.includes(tag.id)}
                onChange={(event) =>
                  setSelectedTags((items) => withExclusiveWorkMode(tags, items, tag.id, event.target.checked))
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
        <SlideToConfirm
          label={busy ? "Saving..." : `Slide to ${mode === "in" ? "clock in" : "clock out"}`}
          disabled={busy}
          onConfirm={submit}
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function SlideToConfirm({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => Promise<void> | void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(0);
  const draggingRef = useRef(false);
  const [value, setValue] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [returning, setReturning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const unlocked = value >= 96;
  const isDisabled = disabled || submitting;

  const setSlideValue = (nextValue: number) => {
    valueRef.current = nextValue;
    setValue(nextValue);
  };

  const valueFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return valueRef.current;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const confirm = async () => {
    setValue(100);
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
      setSlideValue(0);
    }
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setReturning(false);
    draggingRef.current = true;
    setDragging(true);
    setSlideValue(valueFromPointer(event.clientX));
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || isDisabled) return;
    setSlideValue(valueFromPointer(event.clientX));
  };

  const finish = async () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (valueRef.current >= 96) {
      await confirm();
      return;
    }
    setReturning(true);
    window.requestAnimationFrame(() => setSlideValue(0));
    window.setTimeout(() => setReturning(false), 260);
  };

  return (
    <div
      ref={trackRef}
      className={`slide-confirm ${unlocked ? "unlocked" : ""} ${dragging ? "dragging" : ""} ${returning ? "returning" : ""} ${isDisabled ? "disabled" : ""}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      tabIndex={isDisabled ? -1 : 0}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={() => void finish()}
      onPointerCancel={() => void finish()}
      onKeyDown={(event) => {
        if (isDisabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void confirm();
        }
      }}
    >
      <span>{label}</span>
      <i className="slide-confirm-fill" style={{ width: `${value}%` }} />
      <b className="slide-confirm-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}

function TagManager({ tags, onRefresh, onToast }: { tags: Tag[]; onRefresh: () => Promise<void>; onToast: (tone: Toast["tone"], message: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(palette[0]);
  const [editing, setEditing] = useState<Record<string, Tag>>({});

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!(await confirmCritical(`Create tag "${name.trim()}"?`))) return;
    await api.createTag(name, color);
    setName("");
    setColor(palette[(palette.indexOf(color) + 1) % palette.length]);
    await onRefresh();
    onToast("success", "Tag created.");
  };

  const save = async (tag: Tag) => {
    if (!(await confirmCritical(`Save changes to tag "${tag.name}"?`))) return;
    await api.updateTag(tag.id, tag.name, tag.color);
    setEditing((items) => {
      const next = { ...items };
      delete next[tag.id];
      return next;
    });
    await onRefresh();
    onToast("success", "Tag updated.");
  };

  const remove = async (tag: Tag) => {
    if (tag.isDefault) return;
    if (!(await confirmCritical(`Delete tag "${tag.name}"? Activities can be kept by removing only this tag from them.`))) return;
    let deleteSessions = false;
    if (await confirmCritical(`Do you also want to delete every activity associated with "${tag.name}"?`)) {
      if (!(await confirmCritical(`This will permanently delete all activities associated with "${tag.name}". Continue?`))) return;
      deleteSessions = true;
    }
    const result = await api.deleteTag(tag.id, deleteSessions);
    await onRefresh();
    onToast("success", deleteSessions ? `Tag deleted with ${result.deletedSessions} associated activities.` : "Tag deleted. Associated activities were kept.");
  };

  return (
    <section className="tag-manager-grid">
      <form className="panel tag-create-panel" onSubmit={create}>
        <div className="panel-title">
          <div>
            <p className="eyebrow">Tags</p>
            <h2>Create tag</h2>
          </div>
        </div>
        <div className="tag-create-row">
          <TextField label="Tag name" value={name} onChange={setName} />
          <ColorField label="Color" value={color} onChange={setColor} />
          <button className="primary-action" type="submit">
            <Plus size={18} /> Add tag
          </button>
        </div>
      </form>
      <section className="panel tag-list-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Manage tags</h2>
          </div>
        </div>
        {tags.length === 0 ? <p className="empty-state">No tags have been created yet. Default tags will appear after the backend returns them.</p> : null}
        <div className="tag-list">
          {tags.map((tag) => {
            const draft = editing[tag.id] ?? tag;
            return (
              <article className="tag-editor" key={tag.id}>
                <div className="tag-editor-heading">
                  <span className="tag-preview-dot" style={{ background: draft.color }} />
                  <div>
                    <strong>{tag.name}</strong>
                    <small>{tag.isDefault ? "Default tag" : "Custom tag"}</small>
                  </div>
                </div>
                <TextField label="Name" value={draft.name} onChange={(value) => setEditing((items) => ({ ...items, [tag.id]: { ...draft, name: value } }))} />
                <ColorField label="Color" value={draft.color} onChange={(value) => setEditing((items) => ({ ...items, [tag.id]: { ...draft, color: value } }))} />
                <div className="tag-editor-actions">
                  <button type="button" onClick={() => save(draft)}>
                    <Save size={16} /> Save
                  </button>
                  {!tag.isDefault ? (
                    <button className="danger-action" type="button" onClick={() => remove(tag)}>
                      <Trash2 size={16} /> Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
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
            <TimeField label="From" value={diffFrom} onChange={setDiffFrom} />
            <TimeField label="To" value={diffTo} onChange={setDiffTo} />
          </div>
          <div className="time-result">{diffResult ?? "—"}</div>
        </div>

        <div className="time-tool-card">
          <div className="tool-header"><Plus size={15} /><strong>Target time</strong></div>
          <p className="muted small">Add hours and minutes to a start time</p>
          <div className="tool-row">
            <TimeField label="Start" value={addBase} onChange={setAddBase} />
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
            <TimeField label="Start" value={shiftStart} onChange={setShiftStart} />
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
            <TimeField label="Target" value={liveTarget} onChange={setLiveTarget} />
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
  const [profileName, setProfileName] = useState(data.user.name || data.user.username);
  const [profileEmail, setProfileEmail] = useState(data.user.email ?? "");
  const [managers, setManagers] = useState<ManagerSummary[]>([]);
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

  useEffect(() => {
    api.myManagers()
      .then(setManagers)
      .catch(() => setManagers([]));
  }, []);

  return (
    <section className="settings-grid">
      <section className="panel stack">
        <h2>Account</h2>
        <p className="muted">User ID: <strong>{data.user.publicId || "Not assigned"}</strong></p>
        <p className="muted">This identifier is generated automatically and can be changed by an admin.</p>
        {managers.length > 0 ? (
          <div className="manager-list">
            <h3>Responsabili</h3>
            {managers.map((manager) => (
              <p className="muted" key={manager.id}>
                <strong>{manager.displayName}</strong> ({manager.username}){manager.email ? ` · ${manager.email}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!(await confirmCritical("Save these profile changes?"))) return;
          await api.updateProfile(profileName, profileEmail);
          await onRefresh();
          onToast("success", "Profile updated.");
        }}
      >
        <h2>Name and email</h2>
        <TextField label="Name" value={profileName} onChange={setProfileName} autoComplete="name" />
        <TextField label="Email" value={profileEmail} onChange={setProfileEmail} type="email" autoComplete="email" />
        <button className="primary-action" type="submit">
          <Save size={18} /> Save profile
        </button>
      </form>

      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!(await confirmCritical("Change your password?"))) return;
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
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmCritical("Start TOTP setup for this account?"))) return;
            setTotp(await api.setupTotp());
          }}
        >
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
                if (!(await confirmCritical("Enable TOTP for this account?"))) return;
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
          if (!(await confirmCritical("Register this passkey for your account?"))) return;
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
                if (!(await confirmCritical(
                  remainingCount > 0
                    ? "This will permanently invalidate all existing recovery codes. Continue?"
                    : "Generate recovery codes for this account?"
                ))) return;
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
                if (!(await confirmCritical(`Import CSV file "${file.name}"? This can create new records.`))) {
                  event.target.value = "";
                  return;
                }
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
    if (!(await confirmCritical("Create this countdown?"))) return;
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
    if (!(await confirmCritical("Mark this countdown as completed?"))) return;
    await api.completeCountdown(id);
    await onRefresh();
    onToast("success", "Countdown completed.");
  };

  const remove = async (id: string) => {
    if (!(await confirmCritical("Remove this countdown?"))) return;
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
        <DateTimeField label="Target" value={targetAt} onChange={setTargetAt} />
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

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="time-field">
      <label className="tool-label">{label}</label>
      <input
        className="time-text-input"
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NoCountField({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const update = (nextHours: string, nextMinutes: string) => {
    onChange(Math.max(0, (Number(nextHours) || 0) * 60 + (Number(nextMinutes) || 0)));
  };
  return (
    <div className="no-count-control">
      <div>
        <span>No count</span>
        <small>Excluded from the effective session total.</small>
      </div>
      <div className="no-count-inputs">
        <input
          aria-label="No count hours"
          type="number"
          min="0"
          max="168"
          value={String(hours)}
          onChange={(event) => update(event.target.value, String(rest))}
        />
        <span>h</span>
        <input
          aria-label="No count minutes"
          type="number"
          min="0"
          max="59"
          value={String(rest)}
          onChange={(event) => update(String(hours), event.target.value)}
        />
        <span>m</span>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const swatches = Array.from(new Set([...palette, value])).filter(Boolean);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-control">
        <div className="color-swatches">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={swatch.toLowerCase() === value.toLowerCase() ? "active" : ""}
              aria-label={`Use ${swatch}`}
              style={{ background: swatch }}
              onClick={() => onChange(swatch)}
            />
          ))}
        </div>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="#27b3a8" />
      </div>
    </div>
  );
}

export default App;
