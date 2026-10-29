"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  FileText,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";

type Tab = "overview" | "companies" | "users" | "audit";

type Overview = {
  totals: Record<string, number>;
  last_30_days: Record<string, number>;
  provider_usage: Array<{
    provider: string;
    requests: number;
    tokens: number;
    estimated_units: number;
  }>;
  daily_activity: Array<{ date: string; messages: number; signups: number }>;
};

type Company = {
  id: number;
  name: string;
  phone: number;
  email: string | null;
  created_at: string;
  updated_at: string | null;
  account_status: "active" | "suspended";
  subscription_plan: string;
  subscription_status: string;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  monthly_lead_quota: number | null;
  daily_lead_limit: number | null;
  monthly_used: number;
  daily_used: number;
  is_bot_activated: boolean | null;
  social_reply_enabled: boolean | null;
  whatsapp_connection_status: boolean | null;
  timezone: string | null;
  last_login_at: string | null;
  _count: Record<string, number>;
};

type AdminUser = {
  id: number;
  phone: string;
  full_name: string | null;
  company_name: string | null;
  company_id: number;
  role: "owner" | "manager" | "agent";
  status: "active" | "invited" | "suspended" | "revoked";
  can_view_contact_phone: boolean;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
  company: {
    name: string;
    account_status: string;
    subscription_expires_at: string | null;
  };
};

type AuditRow = {
  id: number;
  company_id: number;
  company_name: string;
  user_id: number | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: unknown;
  ip: string | null;
  created_at: string;
};

type CompanyForm = {
  name: string;
  email: string;
  account_status: string;
  subscription_plan: string;
  subscription_status: string;
  subscription_started_at: string;
  subscription_expires_at: string;
  suspension_reason: string;
  monthly_lead_quota: number;
  daily_lead_limit: number;
  is_bot_activated: boolean;
  social_reply_enabled: boolean;
  timezone: string;
};

const API = API_BASE_URL;
const unwrap = <T,>(value: { data?: T } | T): T =>
  value && typeof value === "object" && "data" in value
    ? (value as { data: T }).data
    : (value as T);

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Never";

const dateInput = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

const statusClass = (status: string) => {
  if (["active", "trialing", "published", "success"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["suspended", "expired", "revoked", "error"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (["past_due", "invited", "warning"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
};

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusClass(value)}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {Number(value || 0).toLocaleString()}
          </p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        <div className="rounded-xl bg-slate-950 p-2.5 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const request = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit,
      overrideSecret?: string,
    ): Promise<T> => {
      const response = await fetch(`${API}/admin${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": overrideSecret ?? secret,
          ...(init?.headers || {}),
        },
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("unauthorized");
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Request failed");
      }
      return unwrap<T>(await response.json());
    },
    [secret],
  );

  const loadAll = useCallback(
    async (key: string) => {
      setLoading(true);
      try {
        const [summary, companyRows, userRows, auditRows] = await Promise.all([
          request<Overview>("/overview", undefined, key),
          request<Company[]>("/companies", undefined, key),
          request<AdminUser[]>("/users", undefined, key),
          request<AuditRow[]>("/audit?take=150", undefined, key),
        ]);
        setOverview(summary);
        setCompanies(companyRows);
        setUsers(userRows);
        setAudit(auditRows);
        setAuthed(true);
        sessionStorage.setItem("admin_secret", key);
        setNotice(null);
      } catch (error) {
        setAuthed(false);
        sessionStorage.removeItem("admin_secret");
        setNotice({
          kind: "error",
          text:
            error instanceof Error && error.message !== "unauthorized"
              ? error.message
              : "Invalid admin secret.",
        });
      } finally {
        setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_secret");
    if (saved) {
      setSecret(saved);
      loadAll(saved);
    }
  }, [loadAll]);

  const flash = (text: string, kind: "success" | "error" = "success") => {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const refresh = async () => {
    await loadAll(secret);
    flash("Dashboard refreshed.");
  };

  const signOut = () => {
    sessionStorage.removeItem("admin_secret");
    setSecret("");
    setAuthed(false);
    setOverview(null);
  };

  const openCompany = (company: Company) => {
    setSelectedCompany(company);
    setCompanyForm({
      name: company.name,
      email: company.email || "",
      account_status: company.account_status,
      subscription_plan: company.subscription_plan,
      subscription_status: company.subscription_status,
      subscription_started_at: dateInput(company.subscription_started_at),
      subscription_expires_at: dateInput(company.subscription_expires_at),
      suspension_reason: company.suspension_reason || "",
      monthly_lead_quota: company.monthly_lead_quota || 0,
      daily_lead_limit: company.daily_lead_limit || 0,
      is_bot_activated: company.is_bot_activated !== false,
      social_reply_enabled: company.social_reply_enabled !== false,
      timezone: company.timezone || "Africa/Lagos",
    });
  };

  const extendExpiry = (days: number) => {
    if (!companyForm) return;
    const base = companyForm.subscription_expires_at
      ? new Date(companyForm.subscription_expires_at)
      : new Date();
    base.setDate(base.getDate() + days);
    setCompanyForm({
      ...companyForm,
      subscription_expires_at: dateInput(base.toISOString()),
    });
  };

  const applyAccessWindow = async (days: 7 | 30) => {
    if (!selectedCompany) return;
    const label = days === 7 ? "7-day trial" : "30-day access period";
    if (
      !window.confirm(`Start a fresh ${label} for ${selectedCompany.name}?`)
    ) {
      return;
    }
    setBusy(`company-${selectedCompany.id}`);
    try {
      await request(`/companies/${selectedCompany.id}/access-window`, {
        method: "POST",
        body: JSON.stringify({ days }),
      });
      setSelectedCompany(null);
      setCompanyForm(null);
      await loadAll(secret);
      flash(`${label} started. The customer dashboard countdown is now live.`);
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not update access.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const runCompanyAction = async (
    action: "revoke-sessions" | "disconnect-whatsapp" | "reindex-properties",
    prompt: string,
    success: string,
  ) => {
    if (!selectedCompany || !window.confirm(prompt)) return;
    setBusy(`company-${selectedCompany.id}`);
    try {
      await request(`/companies/${selectedCompany.id}/${action}`, {
        method: "POST",
      });
      await loadAll(secret);
      flash(success);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Action failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const saveCompany = async () => {
    if (!selectedCompany || !companyForm) return;
    if (
      companyForm.account_status === "suspended" &&
      selectedCompany.account_status !== "suspended" &&
      !window.confirm(
        `Suspend ${selectedCompany.name}? All current user sessions will stop working.`,
      )
    ) {
      return;
    }
    setBusy(`company-${selectedCompany.id}`);
    try {
      await request(`/companies/${selectedCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...companyForm,
          email: companyForm.email || null,
          subscription_started_at: companyForm.subscription_started_at
            ? new Date(companyForm.subscription_started_at).toISOString()
            : null,
          subscription_expires_at: companyForm.subscription_expires_at
            ? new Date(companyForm.subscription_expires_at).toISOString()
            : null,
          suspension_reason: companyForm.suspension_reason || null,
        }),
      });
      setSelectedCompany(null);
      setCompanyForm(null);
      await loadAll(secret);
      flash("Company settings saved and access rules applied.");
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not save company.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const updateUser = async (user: AdminUser, changes: Partial<AdminUser>) => {
    if (
      changes.status &&
      ["suspended", "revoked"].includes(changes.status) &&
      !window.confirm(
        `${changes.status === "suspended" ? "Suspend" : "Revoke"} access for ${user.full_name || user.phone}?`,
      )
    ) {
      return;
    }
    setBusy(`user-${user.id}`);
    try {
      await request(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      await loadAll(secret);
      flash("User access updated.");
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not update user.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeSessions = async (user: AdminUser) => {
    if (
      !window.confirm(
        `Sign ${user.full_name || user.phone} out of every device?`,
      )
    )
      return;
    setBusy(`user-${user.id}`);
    try {
      await request(`/users/${user.id}/revoke-sessions`, { method: "POST" });
      await loadAll(secret);
      flash("All sessions revoked.");
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Could not revoke sessions.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesSearch =
        !term ||
        company.name.toLowerCase().includes(term) ||
        String(company.phone).includes(term) ||
        company.email?.toLowerCase().includes(term);
      return (
        matchesSearch &&
        (statusFilter === "all" || company.account_status === statusFilter)
      );
    });
  }, [companies, search, statusFilter]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.phone.includes(term) ||
        user.full_name?.toLowerCase().includes(term) ||
        user.company.name.toLowerCase().includes(term);
      return (
        matchesSearch &&
        (statusFilter === "all" || user.status === statusFilter)
      );
    });
  }, [users, search, statusFilter]);

  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-16">
        <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
          <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="mb-8 flex items-center gap-3">
              <Image
                src="/logo-mark.svg"
                alt="GetChurnShield"
                width={52}
                height={52}
                className="h-12 w-12 rounded-2xl shadow-lg"
                priority
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
                  GetChurnShield
                </p>
                <h1 className="text-xl font-bold sm:text-2xl">
                  Admin control centre
                </h1>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-slate-400">
              Restricted system operations. Enter the production admin secret to
              continue.
            </p>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Admin secret
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                autoComplete="current-password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && secret && loadAll(secret)
                }
                className="h-12 w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-400"
                placeholder="Enter secret"
              />
            </div>
            <button
              type="button"
              onClick={() => loadAll(secret)}
              disabled={!secret || loading}
              className="mt-4 h-12 w-full rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Open dashboard"}
            </button>
            {notice && (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                {notice.text}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const maxMessages = Math.max(
    1,
    ...(overview?.daily_activity.map((point) => point.messages) || [1]),
  );
  const nav: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "users", label: "Users", icon: Users },
    { id: "audit", label: "Audit log", icon: History },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-3 py-3 sm:px-5 sm:py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-mark.svg"
              alt="GetChurnShield"
              width={44}
              height={44}
              className="h-10 w-10 rounded-xl shadow-lg"
              priority
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
                GetChurnShield
              </p>
              <h1 className="text-sm font-bold sm:text-base">Administration</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh dashboard"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 pb-28 sm:gap-6 sm:px-5 sm:py-6 sm:pb-28 lg:grid-cols-[220px_1fr] lg:px-8 lg:pb-6">
        <aside className="hidden h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-24 lg:block">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setSearch("");
                setStatusFilter("all");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
          <div className="mt-3 border-t border-slate-100 p-3 text-xs leading-relaxed text-slate-400">
            Actions are recorded in the system audit log.
          </div>
        </aside>

        <section className="min-w-0 space-y-4 sm:space-y-6">
          {notice && (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
            >
              <span>{notice.text}</span>
              <button onClick={() => setNotice(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {tab === "overview" && overview && (
            <>
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Live platform health
                </p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  System overview
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <StatCard
                  label="Companies"
                  value={overview.totals.companies}
                  icon={Building2}
                  detail={`${overview.totals.suspended_companies || 0} suspended`}
                />
                <StatCard
                  label="Active users"
                  value={overview.totals.active_users}
                  icon={Users}
                  detail={`${overview.totals.users || 0} total users`}
                />
                <StatCard
                  label="Customer contacts"
                  value={overview.totals.contacts}
                  icon={MessageSquare}
                  detail={`+${overview.last_30_days.contacts || 0} in 30 days`}
                />
                <StatCard
                  label="Messages"
                  value={overview.totals.messages}
                  icon={Activity}
                  detail={`+${overview.last_30_days.messages || 0} in 30 days`}
                />
                <StatCard
                  label="Properties"
                  value={overview.totals.properties}
                  icon={Home}
                />
                <StatCard
                  label="Published posts"
                  value={overview.totals.published_posts}
                  icon={FileText}
                />
                <StatCard
                  label="Social connections"
                  value={overview.totals.connected_social_accounts}
                  icon={Wifi}
                />
                <StatCard
                  label="Expiring in 7 days"
                  value={overview.totals.expiring_subscriptions}
                  icon={CalendarClock}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">Message activity</h3>
                      <p className="text-xs text-slate-500">Last 14 days</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {overview.last_30_days.messages.toLocaleString()} / 30
                      days
                    </span>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-400 sm:hidden">
                    Swipe to inspect all days
                  </p>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex h-52 min-w-[620px] items-end gap-2 sm:min-w-0">
                      {overview.daily_activity.map((point) => (
                        <div
                          key={point.date}
                          className="group flex min-w-0 flex-1 flex-col items-center gap-2"
                        >
                          <div className="relative flex h-40 w-full items-end justify-center rounded-lg bg-slate-50 px-1">
                            <div
                              className="w-full rounded-md bg-emerald-500 transition group-hover:bg-emerald-400"
                              style={{
                                height: `${Math.max(4, (point.messages / maxMessages) * 100)}%`,
                              }}
                              title={`${point.messages} messages, ${point.signups} signups`}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {point.date.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                    <div>
                      <h3 className="font-bold">AI usage</h3>
                      <p className="text-xs text-slate-500">
                        Provider routing · last 30 days
                      </p>
                    </div>
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-violet-50 p-3">
                      <p className="text-xs text-violet-600">Requests</p>
                      <p className="text-xl font-bold text-violet-950">
                        {overview.last_30_days.ai_requests.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-xs text-blue-600">Tokens</p>
                      <p className="text-xl font-bold text-blue-950">
                        {overview.last_30_days.ai_tokens.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {overview.provider_usage.length ? (
                      overview.provider_usage.map((provider) => (
                        <div
                          key={provider.provider}
                          className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-sm"
                        >
                          <span className="font-semibold capitalize">
                            {provider.provider}
                          </span>
                          <span className="text-slate-500">
                            {provider.requests.toLocaleString()} calls
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-slate-400">
                        No AI usage recorded yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {(tab === "companies" || tab === "users") && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Access and billing control
                </p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {tab === "companies" ? "Companies" : "Users"}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search…"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-500 sm:w-56"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none sm:w-auto"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  {tab === "users" && <option value="invited">Invited</option>}
                  {tab === "users" && <option value="revoked">Revoked</option>}
                </select>
              </div>
            </div>
          )}

          {tab === "companies" && (
            <>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Access</th>
                      <th className="px-4 py-3">Subscription</th>
                      <th className="px-4 py-3">Usage</th>
                      <th className="px-4 py-3">Assets</th>
                      <th className="px-4 py-3">Connections</th>
                      <th className="px-4 py-3">Last login</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((company) => (
                      <tr
                        key={company.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">
                            {company.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            #{company.id} · {String(company.phone)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill value={company.account_status} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <StatusPill value={company.subscription_status} />
                            <span className="text-xs text-slate-500">
                              {company.subscription_plan}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {company.subscription_expires_at
                              ? `Ends ${new Date(company.subscription_expires_at).toLocaleDateString()}`
                              : "No expiry"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p>
                            {company.monthly_used} /{" "}
                            {company.monthly_lead_quota || 0} leads
                          </p>
                          <p className="text-xs text-slate-400">
                            {company.daily_used} /{" "}
                            {company.daily_lead_limit || 0} today
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-600">
                          {company._count.properties} properties
                          <br />
                          {company._count.company_assets} media ·{" "}
                          {company._count.content_posts} posts
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1 text-xs">
                            {company.whatsapp_connection_status ? (
                              <Wifi className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <WifiOff className="h-4 w-4 text-slate-400" />
                            )}{" "}
                            {company._count.social_accounts} social
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {company._count.contacts} contacts
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {dateLabel(company.last_login_at)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => openCompany(company)}
                            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredCompanies.map((company) => (
                  <article
                    key={company.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-950">
                          {company.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          #{company.id} · {String(company.phone)}
                        </p>
                      </div>
                      <StatusPill value={company.account_status} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-slate-400">Subscription</p>
                        <div className="mt-1">
                          <StatusPill value={company.subscription_status} />
                        </div>
                        <p className="mt-1 truncate font-medium text-slate-600">
                          {company.subscription_plan}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-slate-400">Usage</p>
                        <p className="mt-1 font-bold text-slate-800">
                          {company.monthly_used} /{" "}
                          {company.monthly_lead_quota || 0}
                        </p>
                        <p className="text-slate-500">monthly leads</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                      <span>{company._count.properties} properties</span>
                      <span>{company._count.company_assets} media</span>
                      <span>{company._count.contacts} contacts</span>
                      <span className="flex items-center gap-1">
                        {company.whatsapp_connection_status ? (
                          <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5" />
                        )}
                        {company._count.social_accounts} social
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-400">
                        Last login: {dateLabel(company.last_login_at)}
                      </p>
                      <button
                        onClick={() => openCompany(company)}
                        className="min-h-11 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white"
                      >
                        Manage
                      </button>
                    </div>
                  </article>
                ))}
                {!filteredCompanies.length && (
                  <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    No companies match your filters.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "users" && (
            <>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Phone access</th>
                      <th className="px-4 py-3">Last login</th>
                      <th className="px-4 py-3">Security</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-4">
                          <p className="font-semibold">
                            {user.full_name || "Unnamed user"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user.phone} · #{user.id}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p>{user.company.name}</p>
                          <StatusPill value={user.company.account_status} />
                        </td>
                        <td className="px-4 py-4">
                          <select
                            value={user.role}
                            disabled={busy === `user-${user.id}`}
                            onChange={(event) =>
                              updateUser(user, {
                                role: event.target.value as AdminUser["role"],
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs capitalize"
                          >
                            <option value="owner">Owner</option>
                            <option value="manager">Manager</option>
                            <option value="agent">Agent</option>
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <select
                            value={user.status}
                            disabled={busy === `user-${user.id}`}
                            onChange={(event) =>
                              updateUser(user, {
                                status: event.target
                                  .value as AdminUser["status"],
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs capitalize"
                          >
                            <option value="active">Active</option>
                            <option value="invited">Invited</option>
                            <option value="suspended">Suspended</option>
                            <option value="revoked">Revoked</option>
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() =>
                              updateUser(user, {
                                can_view_contact_phone:
                                  !user.can_view_contact_phone,
                              })
                            }
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${user.can_view_contact_phone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                          >
                            {user.can_view_contact_phone ? "Allowed" : "Hidden"}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {dateLabel(user.last_login_at)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => revokeSessions(user)}
                            disabled={busy === `user-${user.id}`}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Revoke sessions
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredUsers.map((user) => (
                  <article
                    key={user.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-950">
                          {user.full_name || "Unnamed user"}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {user.phone} · #{user.id}
                        </p>
                      </div>
                      <StatusPill value={user.status} />
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">Company</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {user.company.name}
                        </p>
                        <StatusPill value={user.company.account_status} />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="text-xs font-semibold text-slate-500">
                        Role
                        <select
                          value={user.role}
                          disabled={busy === `user-${user.id}`}
                          onChange={(event) =>
                            updateUser(user, {
                              role: event.target.value as AdminUser["role"],
                            })
                          }
                          className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize"
                        >
                          <option value="owner">Owner</option>
                          <option value="manager">Manager</option>
                          <option value="agent">Agent</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-500">
                        Status
                        <select
                          value={user.status}
                          disabled={busy === `user-${user.id}`}
                          onChange={(event) =>
                            updateUser(user, {
                              status: event.target.value as AdminUser["status"],
                            })
                          }
                          className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize"
                        >
                          <option value="active">Active</option>
                          <option value="invited">Invited</option>
                          <option value="suspended">Suspended</option>
                          <option value="revoked">Revoked</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                      <button
                        onClick={() =>
                          updateUser(user, {
                            can_view_contact_phone:
                              !user.can_view_contact_phone,
                          })
                        }
                        disabled={busy === `user-${user.id}`}
                        className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${user.can_view_contact_phone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        Phone:{" "}
                        {user.can_view_contact_phone ? "Allowed" : "Hidden"}
                      </button>
                      <button
                        onClick={() => revokeSessions(user)}
                        disabled={busy === `user-${user.id}`}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Revoke sessions
                      </button>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400">
                      Last login: {dateLabel(user.last_login_at)}
                    </p>
                  </article>
                ))}
                {!filteredUsers.length && (
                  <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    No users match your filters.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "audit" && (
            <>
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Accountability
                </p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Audit log
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Administrative and workspace security events, newest first.
                </p>
              </div>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {dateLabel(row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {row.company_name}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill value={row.action} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {row.entity || "system"}{" "}
                          {row.entity_id ? `#${row.entity_id}` : ""}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {row.ip || "—"}
                        </td>
                        <td
                          className="max-w-sm truncate px-4 py-3 font-mono text-[11px] text-slate-400"
                          title={row.meta ? JSON.stringify(row.meta) : ""}
                        >
                          {row.meta ? JSON.stringify(row.meta) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {audit.map((row) => (
                  <article
                    key={row.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {row.company_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {dateLabel(row.created_at)}
                        </p>
                      </div>
                      <StatusPill value={row.action} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="text-slate-400">Target</p>
                        <p className="mt-1 font-medium text-slate-700">
                          {row.entity || "system"}{" "}
                          {row.entity_id ? `#${row.entity_id}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">IP address</p>
                        <p className="mt-1 truncate font-mono text-slate-700">
                          {row.ip || "—"}
                        </p>
                      </div>
                    </div>
                    {row.meta != null && (
                      <details className="mt-3 text-xs">
                        <summary className="cursor-pointer font-semibold text-slate-600">
                          View event details
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </article>
                ))}
                {!audit.length && (
                  <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    No audit events recorded yet.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.1)] backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setSearch("");
                setStatusFilter("all");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-current={tab === item.id ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-500"}`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {selectedCompany && companyForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/45 backdrop-blur-sm sm:items-stretch"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelectedCompany(null)
          }
        >
          <div className="h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:h-full sm:rounded-none">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Company #{selectedCompany.id}
                </p>
                <h3 className="max-w-[250px] truncate text-lg font-bold sm:max-w-none sm:text-xl">
                  {selectedCompany.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCompany(null)}
                aria-label="Close company editor"
                className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-4 sm:space-y-7 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Company name
                  <input
                    value={companyForm.name}
                    onChange={(event) =>
                      setCompanyForm({
                        ...companyForm,
                        name: event.target.value,
                      })
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Email
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(event) =>
                      setCompanyForm({
                        ...companyForm,
                        email: event.target.value,
                      })
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  <h4 className="font-bold">Workspace access</h4>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Account status
                    <select
                      value={companyForm.account_status}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          account_status: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Suspension reason
                    <input
                      value={companyForm.suspension_reason}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          suspension_reason: event.target.value,
                        })
                      }
                      disabled={companyForm.account_status !== "suspended"}
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal disabled:bg-slate-100"
                      placeholder="Required context for your team"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-indigo-600" />
                  <h4 className="font-bold">Subscription and expiry</h4>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Plan
                    <input
                      value={companyForm.subscription_plan}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          subscription_plan: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
                      placeholder="trial, starter, growth…"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Status
                    <select
                      value={companyForm.subscription_status}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          subscription_status: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
                    >
                      <option value="pending">Pending</option>
                      <option value="trialing">Trialing</option>
                      <option value="active">Active</option>
                      <option value="past_due">Past due</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Started at
                    <input
                      type="datetime-local"
                      value={companyForm.subscription_started_at}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          subscription_started_at: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Expires at
                    <input
                      type="datetime-local"
                      value={companyForm.subscription_expires_at}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          subscription_expires_at: event.target.value,
                        })
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => applyAccessWindow(7)}
                    disabled={busy === `company-${selectedCompany.id}`}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
                  >
                    Start 7-day trial
                  </button>
                  <button
                    onClick={() => applyAccessWindow(30)}
                    disabled={busy === `company-${selectedCompany.id}`}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
                  >
                    Start 30-day access
                  </button>
                  <button
                    onClick={() => extendExpiry(90)}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
                  >
                    +90 days
                  </button>
                  <button
                    onClick={() =>
                      setCompanyForm({
                        ...companyForm,
                        subscription_expires_at: "",
                      })
                    }
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    Clear expiry
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600">
                  Monthly lead quota
                  <input
                    type="number"
                    min={0}
                    value={companyForm.monthly_lead_quota}
                    onChange={(event) =>
                      setCompanyForm({
                        ...companyForm,
                        monthly_lead_quota: Number(event.target.value),
                      })
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Daily lead limit
                  <input
                    type="number"
                    min={0}
                    value={companyForm.daily_lead_limit}
                    onChange={(event) =>
                      setCompanyForm({
                        ...companyForm,
                        daily_lead_limit: Number(event.target.value),
                      })
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Timezone
                  <input
                    value={companyForm.timezone}
                    onChange={(event) =>
                      setCompanyForm({
                        ...companyForm,
                        timezone: event.target.value,
                      })
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() =>
                    setCompanyForm({
                      ...companyForm,
                      is_bot_activated: !companyForm.is_bot_activated,
                    })
                  }
                  className={`flex items-center justify-between rounded-xl border p-4 text-left ${companyForm.is_bot_activated ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Bot className="h-4 w-4" /> WhatsApp AI bot
                  </span>
                  {companyForm.is_bot_activated ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Ban className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                <button
                  onClick={() =>
                    setCompanyForm({
                      ...companyForm,
                      social_reply_enabled: !companyForm.social_reply_enabled,
                    })
                  }
                  className={`flex items-center justify-between rounded-xl border p-4 text-left ${companyForm.social_reply_enabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <MessageSquare className="h-4 w-4" /> Social auto-replies
                  </span>
                  {companyForm.social_reply_enabled ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Ban className="h-5 w-5 text-slate-400" />
                  )}
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-700" />
                  <h4 className="font-bold">Master workspace actions</h4>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    onClick={() =>
                      runCompanyAction(
                        "revoke-sessions",
                        `Sign every user in ${selectedCompany.name} out of all devices?`,
                        "Every workspace user has been signed out.",
                      )
                    }
                    disabled={busy === `company-${selectedCompany.id}`}
                    className="min-h-11 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  >
                    Revoke all logins
                  </button>
                  <button
                    onClick={() =>
                      runCompanyAction(
                        "disconnect-whatsapp",
                        `Disconnect ${selectedCompany.name}'s WhatsApp session? They will need to reconnect it.`,
                        "WhatsApp session disconnected.",
                      )
                    }
                    disabled={busy === `company-${selectedCompany.id}`}
                    className="min-h-11 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    Disconnect WhatsApp
                  </button>
                  <button
                    onClick={() =>
                      runCompanyAction(
                        "reindex-properties",
                        `Re-index every PDF and reconcile duplicate properties for ${selectedCompany.name}?`,
                        "Property reconciliation completed and PDF re-indexing queued.",
                      )
                    }
                    disabled={busy === `company-${selectedCompany.id}`}
                    className="min-h-11 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                  >
                    Re-index property library
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-500" />
                  <h4 className="text-sm font-bold">Workspace footprint</h4>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-xs sm:grid-cols-6">
                  {Object.entries(selectedCompany._count).map(
                    ([key, value]) => (
                      <div key={key} className="rounded-lg bg-white p-2">
                        <p className="text-lg font-bold">{value}</p>
                        <p className="truncate capitalize text-slate-400">
                          {key.replaceAll("_", " ")}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div
              className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 pt-3 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4"
              style={{
                paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
              }}
            >
              <button
                onClick={() => setSelectedCompany(null)}
                className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold sm:min-h-0 sm:py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={saveCompany}
                disabled={busy === `company-${selectedCompany.id}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50 sm:min-h-0 sm:px-5 sm:py-2.5"
              >
                <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
