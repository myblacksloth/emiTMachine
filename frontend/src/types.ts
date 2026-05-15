export type AuthMode = "login" | "register" | "passkey" | "recovery" | "totp";
export type UserRole = "user" | "admin" | "root";

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type ChartBucket = {
  label: string;
  totalMinutes: number;
  segments: Array<{
    tagId: string;
    tagName: string;
    color: string;
    minutes: number;
  }>;
};

export type DashboardSummary = {
  totalMinutes: number;
  averageDailyMinutes: number;
  workedDays: number;
  presenceMinutes: number;
  smartWorkingMinutes: number;
};

export type ActiveSession = {
  id: string;
  startedAt: string;
  tagIds: string[];
  note?: string;
};

export type Countdown = {
  id: string;
  title: string;
  targetAt: string;
  targetTimezone: string;
  linkedToCurrentSession: boolean;
  status: "active" | "completed" | "cancelled";
};

export type ActivitySession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startTimezone: string;
  endTimezone: string | null;
  note: string;
  durationMinutes: number | null;
  tagIds: string[];
  tags: Tag[];
};

export type DashboardData = {
  user: {
    name: string;
    username: string;
    role: UserRole;
    adminApproved: boolean;
    canEditSessions: boolean;
    totpEnabled: boolean;
    passkeyCount: number;
    recoveryCodeCount: number;
  };
  activeSession: ActiveSession | null;
  tags: Tag[];
  charts: {
    daily: ChartBucket[];
    weekly: ChartBucket[];
    monthly: ChartBucket[];
  };
  summary: DashboardSummary;
  countdowns: Countdown[];
};

export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  adminApproved: boolean;
  canEditSessions: boolean;
  status: "active" | "disabled" | "locked";
  disabledAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};
