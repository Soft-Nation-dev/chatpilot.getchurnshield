"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

type Notification = {
  id: number;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  entity: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

const notificationHref = (notification: Notification) => {
  if (notification.entity === "content") return "/content";
  if (notification.entity === "media") return "/media";
  if (notification.entity === "chat") return "/chats";
  if (notification.entity === "property") return "/properties";
  return "/dashboard";
};

const severityDot: Record<Notification["severity"], string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

export function Header() {
  const { user, logout } = useAuth();
  const { setOpen } = useSidebar();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [openNotifications, setOpenNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const companyId = user?.company_id;

  const loadNotifications = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await api.get(`/companies/${companyId}/notifications`, {
        params: { take: 20 },
      });
      setNotifications(response.data.items || []);
      setUnread(response.data.unread || 0);
    } catch {
      // Notifications must never interrupt the rest of the dashboard.
    }
  }, [companyId]);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) {
        setOpenNotifications(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markRead = async (notification: Notification) => {
    if (!companyId || notification.read_at) return;
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, read_at: new Date().toISOString() }
          : item,
      ),
    );
    setUnread((current) => Math.max(0, current - 1));
    try {
      await api.put(
        `/companies/${companyId}/notifications/${notification.id}/read`,
      );
    } catch {
      loadNotifications();
    }
  };

  const markAllRead = async () => {
    if (!companyId || !unread) return;
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read_at: item.read_at || new Date().toISOString(),
      })),
    );
    setUnread(0);
    try {
      await api.put(`/companies/${companyId}/notifications/read-all`);
    } catch {
      loadNotifications();
    }
  };

  return (
    <header className="relative isolate z-[100] flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/60 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
        <div className="md:hidden flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gradient">
            Outbound Engine
          </span>
        </div>
        <div className="hidden md:block" />
      </div>
      <div className="flex items-center gap-4">
        <div ref={notificationRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenNotifications((value) => !value)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {openNotifications && (
            <div className="absolute right-0 top-11 z-[120] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Background activity
                  </p>
                  <p className="text-xs text-slate-500">
                    {unread
                      ? `${unread} unread update${unread === 1 ? "" : "s"}`
                      : "You are up to date"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={!unread}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 disabled:text-slate-300"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
              <div className="max-h-[28rem] overflow-y-auto">
                {notifications.length ? (
                  notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={notificationHref(notification)}
                      onClick={() => {
                        markRead(notification);
                        setOpenNotifications(false);
                      }}
                      className={`block border-b border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50 ${notification.read_at ? "" : "bg-emerald-50/40"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot[notification.severity] || severityDot.info}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {notification.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                            {notification.message}
                          </p>
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">
                    Background updates will appear here.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-sm shadow-sm">
            {user?.company_name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground leading-none">
              {user?.company_name}
            </p>
            <p className="text-xs capitalize text-muted-foreground mt-0.5">
              {user?.role} · {user?.phone}
            </p>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
        </Button>
      </div>
    </header>
  );
}
