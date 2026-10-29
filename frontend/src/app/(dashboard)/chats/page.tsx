"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/auth-context";
import api from "@/lib/api";
import {
  AutomationEvent,
  ChatStateTransition,
  Contact,
  Message,
  PaginatedResponse,
} from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  CircleX,
  Clock3,
  Hand,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  NEW: "New",
  QUALIFYING: "Qualifying",
  QUALIFIED: "Qualified",
  INSPECTION_PENDING: "Inspection pending",
  INSPECTION_BOOKED: "Inspection booked",
  HUMAN_TAKEOVER: "Human takeover",
  CONCLUDED_CLOSED: "Closed",
  COLD_LEAD: "Cold lead",
};

const eventTone = (status?: string) => {
  if (status === "succeeded")
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "failed") return "text-red-700 bg-red-50 border-red-200";
  if (status === "blocked")
    return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-blue-700 bg-blue-50 border-blue-200";
};

export default function ChatsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id;
  const [contacts, setContacts] = useState<PaginatedResponse<Contact> | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [transitions, setTransitions] = useState<ChatStateTransition[]>([]);
  const [showOperations, setShowOperations] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const fetchContacts = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await api.get(`/companies/${companyId}/contacts`, {
        params: { page: 1, limit: 50, search: search || undefined },
      });
      setContacts(res.data);
    } catch {
      /* silent */
    }
  }, [companyId, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const fetchMessages = useCallback(
    async (contactId: number, background = false) => {
      if (!companyId) return;
      if (!background) setLoadingMessages(true);
      try {
        const [messageRes, operationsRes] = await Promise.all([
          api.get(`/companies/${companyId}/contacts/${contactId}/messages`),
          api.get(`/companies/${companyId}/contacts/${contactId}/operations`),
        ]);
        const incoming = messageRes.data.messages as Message[];
        setMessages((current) => {
          const unchanged =
            current.length === incoming.length &&
            current.every(
              (message, index) =>
                message.id === incoming[index]?.id &&
                message.message === incoming[index]?.message &&
                message.image_url === incoming[index]?.image_url,
            );
          return unchanged ? current : incoming;
        });
        setEvents(operationsRes.data.events || []);
        setTransitions(operationsRes.data.transitions || []);
      } catch {
        /* silent */
      } finally {
        if (!background) setLoadingMessages(false);
      }
    },
    [companyId],
  );

  const selectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setShowMobileChat(true);
    setShowOperations(false);
    setActionError("");
    shouldAutoScrollRef.current = true;
    fetchMessages(contact.id);
  };

  const runAction = async (
    action: "pause" | "resume" | "handoff" | "close" | "reopen" | "retry",
  ) => {
    if (!companyId || !selectedContact) return;
    setActionLoading(action);
    setActionError("");
    try {
      const response = await api.put(
        `/companies/${companyId}/contacts/${selectedContact.id}/automation`,
        { action },
      );
      if (action !== "retry" && response.data) {
        setSelectedContact((current) =>
          current ? { ...current, ...response.data } : current,
        );
      }
      await Promise.all([fetchContacts(), fetchMessages(selectedContact.id)]);
    } catch (cause: any) {
      setActionError(
        cause?.response?.data?.message || "The action could not be completed.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!selectedContact) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchMessages(selectedContact.id, true);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [selectedContact, fetchMessages]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const displayName = (c: Contact) =>
    c.name || c.whatsapp_profile_name || `+${c.phone}`;
  const lastMsg = (c: Contact) => {
    if (c.messages?.length) {
      const m = c.messages[0].message;
      return m.length > 50 ? m.substring(0, 50) + "..." : m;
    }
    return "No messages yet";
  };
  const timeAgo = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };
  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const dueLabel = (date: string) => {
    const minutes = Math.ceil((new Date(date).getTime() - Date.now()) / 60000);
    if (minutes <= 0) return "Due now";
    if (minutes < 60) return `Due in ${minutes}m`;
    if (minutes < 1440) return `Due in ${Math.ceil(minutes / 60)}h`;
    return `Due in ${Math.ceil(minutes / 1440)}d`;
  };

  const grouped: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const date = new Date(msg.sent_at).toDateString();
    const last = grouped[grouped.length - 1];
    if (last?.date === date) last.msgs.push(msg);
    else grouped.push({ date, msgs: [msg] });
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6 lg:-m-8 rounded-2xl overflow-hidden border border-slate-200/60 bg-white shadow-sm">
      <div
        className={`${showMobileChat ? "hidden md:flex" : "flex"} w-full md:w-[340px] lg:w-[380px] flex-col border-r border-slate-200/60 bg-white`}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">Chats</h2>
            <span className="text-[11px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full font-medium">
              {contacts?.total ?? 0}
            </span>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg bg-slate-50 border-0 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500/20 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {contacts ? (
            contacts.data.length > 0 ? (
              contacts.data.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => selectContact(contact)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150 border-b border-slate-50 ${
                    selectedContact?.id === contact.id
                      ? "bg-emerald-50/80 border-l-2 border-l-emerald-500"
                      : "hover:bg-slate-50/80"
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(contact.name ||
                      contact.whatsapp_profile_name ||
                      "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-medium text-sm text-foreground truncate">
                        {displayName(contact)}
                      </h4>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {timeAgo(contact.last_message_received)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate pr-2">
                        {lastMsg(contact)}
                      </p>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                        {STATE_LABELS[contact.chat_state] || "New"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgb(148,163,184)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">
                  No conversations
                </p>
              </div>
            )
          ) : (
            <div className="space-y-0">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-200 rounded animate-pulse w-2/3" />
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`${!showMobileChat ? "hidden md:flex" : "flex"} flex-1 flex-col bg-white`}
      >
        {selectedContact ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-3">
              <button
                onClick={() => setShowMobileChat(false)}
                className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
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
                  <path d="m12 19-7-7 7-7" />
                  <path d="M19 12H5" />
                </svg>
              </button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {displayName(selectedContact)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">
                  {displayName(selectedContact)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedContact.phone ? `+${selectedContact.phone}` : ""}
                </p>
              </div>
              <Badge
                variant="outline"
                className="hidden sm:inline-flex text-[10px]"
              >
                {STATE_LABELS[selectedContact.chat_state] || "New"}
              </Badge>
              <Badge
                variant={
                  selectedContact.is_bot_activated ? "default" : "secondary"
                }
                className={`text-[10px] ${selectedContact.is_bot_activated ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : ""}`}
              >
                AI {selectedContact.is_bot_activated ? "On" : "Off"}
              </Badge>
            </div>

            <div className="border-b border-slate-100 bg-white px-3 py-2.5 sm:px-5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  disabled={!!actionLoading}
                  onClick={() =>
                    runAction(
                      selectedContact.is_bot_activated ? "pause" : "resume",
                    )
                  }
                >
                  {selectedContact.is_bot_activated ? (
                    <Pause className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {selectedContact.is_bot_activated ? "Pause AI" : "Resume AI"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  disabled={!!actionLoading}
                  onClick={() => runAction("handoff")}
                >
                  <Hand className="mr-1.5 h-3.5 w-3.5" />
                  Take over
                </Button>
                {selectedContact.chat_state === "CONCLUDED_CLOSED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    disabled={!!actionLoading}
                    onClick={() => runAction("reopen")}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Reopen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    disabled={!!actionLoading}
                    onClick={() => runAction("close")}
                  >
                    <CircleX className="mr-1.5 h-3.5 w-3.5" />
                    Close
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  disabled={
                    !!actionLoading ||
                    selectedContact.chat_state === "CONCLUDED_CLOSED"
                  }
                  onClick={() => runAction("retry")}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${actionLoading === "retry" ? "animate-spin" : ""}`}
                  />
                  Retry last reply
                </Button>
              </div>
              {actionError && (
                <p className="mt-2 text-xs text-red-600">{actionError}</p>
              )}
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Last run
                  </p>
                  <p className="truncate text-xs font-medium text-slate-700">
                    {events[0]
                      ? `${events[0].job_type.replaceAll("_", " ")} · ${events[0].status}`
                      : "No automation run yet"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Follow-up
                  </p>
                  <p className="truncate text-xs font-medium text-slate-700">
                    {selectedContact.follow_up_count
                      ? "Sent · no more scheduled"
                      : selectedContact.follow_up_due_at
                        ? dueLabel(selectedContact.follow_up_due_at)
                        : "Not scheduled"}
                  </p>
                </div>
                <button
                  onClick={() => setShowOperations((value) => !value)}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700"
                >
                  Details{" "}
                  {showOperations ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {showOperations && (
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-700">
                      Recent automation
                    </p>
                    <div className="space-y-2">
                      {events.slice(0, 5).map((event) => (
                        <div
                          key={event.id}
                          className={`rounded-lg border px-2.5 py-2 text-xs ${eventTone(event.status)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium capitalize">
                              {event.job_type.replaceAll("_", " ")}
                            </span>
                            <span className="capitalize">{event.status}</span>
                          </div>
                          <p className="mt-0.5 opacity-75">
                            Attempt {event.attempt}/{event.max_attempts} ·{" "}
                            {timeAgo(event.started_at)} ago
                          </p>
                          {event.error_message && (
                            <p className="mt-1 line-clamp-2">
                              The AI or delivery provider did not complete this
                              run. Retry it, or take over if the conversation is
                              urgent.
                            </p>
                          )}
                        </div>
                      ))}
                      {!events.length && (
                        <p className="text-xs text-slate-400">
                          Runs will appear here after the next message.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-700">
                      Conversation state
                    </p>
                    <div className="space-y-2">
                      {transitions.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex gap-2 text-xs">
                          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-700">
                              {STATE_LABELS[item.to_state] || item.to_state}
                            </p>
                            <p className="text-slate-400">
                              {item.reason || "State updated"} ·{" "}
                              {timeAgo(item.created_at)} ago
                            </p>
                          </div>
                        </div>
                      ))}
                      {!transitions.length && (
                        <p className="text-xs text-slate-400">
                          No state changes recorded yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              ref={messagesViewportRef}
              onScroll={() => {
                const viewport = messagesViewportRef.current;
                if (!viewport) return;
                shouldAutoScrollRef.current =
                  viewport.scrollHeight -
                    viewport.scrollTop -
                    viewport.clientHeight <
                  120;
              }}
              className="flex-1 overflow-auto bg-[#f0f2f5] px-4 py-4 sm:px-6"
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="h-2 w-2 rounded-full bg-emerald-500"
                        animate={{ y: [0, -8, 0] }}
                        transition={{
                          duration: 0.6,
                          delay: i * 0.15,
                          repeat: Infinity,
                          repeatDelay: 0.5,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-1">
                  {grouped.map((group, gi) => (
                    <div key={gi}>
                      <div className="flex justify-center my-4">
                        <span className="text-[11px] bg-white/90 text-muted-foreground px-3 py-1 rounded-full shadow-sm border border-slate-200/50 font-medium">
                          {formatDate(group.msgs[0].sent_at)}
                        </span>
                      </div>
                      {group.msgs.map((msg, mi) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(mi * 0.015, 0.2) }}
                          className={`flex mb-1.5 ${msg.author_type === "human" ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`relative max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                              msg.author_type === "human"
                                ? "bg-white text-foreground rounded-tl-md"
                                : msg.author_type === "user_whatsapp"
                                  ? "bg-blue-500 text-white rounded-tr-md"
                                  : "bg-emerald-500 text-white rounded-tr-md"
                            }`}
                          >
                            {msg.author_type !== "human" && (
                              <p
                                className={`text-[10px] font-medium mb-0.5 ${msg.author_type === "user_whatsapp" ? "text-blue-200" : "text-emerald-200"}`}
                              >
                                {msg.author_type === "user_whatsapp"
                                  ? "You"
                                  : "AI Bot"}
                              </p>
                            )}
                            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                              {msg.message}
                            </p>
                            {msg.image_url && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={msg.image_url}
                                alt="attachment"
                                className="mt-2 max-w-full rounded-lg"
                              />
                            )}
                            <p
                              className={`text-[10px] mt-1 text-right ${msg.author_type === "human" ? "text-slate-400" : msg.author_type === "user_whatsapp" ? "text-blue-200" : "text-emerald-200"}`}
                            >
                              {msg.sent_at ? formatTime(msg.sent_at) : ""}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ))}
                  {messages.length === 0 && !loadingMessages && (
                    <div className="text-center py-20">
                      <div className="h-14 w-14 rounded-2xl bg-white/80 flex items-center justify-center mx-auto mb-3 shadow-sm">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(148,163,184)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No messages yet
                      </p>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-center">
              <p className="text-xs text-muted-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="inline mr-1 -mt-0.5"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Read-only view - messages are managed through WhatsApp
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 flex items-center justify-center mx-auto mb-5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgb(16,185,129)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                Your conversations
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Select a contact to view the conversation history
              </p>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
