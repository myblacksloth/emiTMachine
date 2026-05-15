export type AuthMode = "login" | "register" | "passkey" | "recovery" | "totp";

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
  targetTime: string;
  linkedToCurrentSession: boolean;
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

export type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};
