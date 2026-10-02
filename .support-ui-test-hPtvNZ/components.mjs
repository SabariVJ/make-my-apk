// src/app/components/SupportTickets.tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, MessageSquarePlus, Ticket } from "lucide-react";

// mock:support
var listMySupportTickets = (...args) => globalThis.supportFixture.mine(...args);
var adminListSupportTickets = (...args) => globalThis.supportFixture.admin(...args);
var adminUpdateSupportTicket = (...args) => globalThis.supportFixture.update(...args);
var createSupportTicket = (...args) => globalThis.supportFixture.create(...args);

// mock:auth
import { useSyncExternalStore } from "react";
var useAuthUserId = () => useSyncExternalStore(
  globalThis.supportFixture.subscribe,
  () => globalThis.supportFixture.userId,
  () => null
);

// src/app/hooks/useSupportTicketRefresh.ts
import { useEffect } from "react";
var SUPPORT_TICKET_REFRESH_OPTIONS = {
  refetchInterval: 15e3,
  refetchIntervalInBackground: false,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always"
};
function useSupportTicketWindowFocus(refetch, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refetch]);
}

// src/app/components/SupportTickets.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var CATEGORY_OPTIONS = [
  { value: "payment", label: "Payment issue" },
  { value: "bug", label: "Bug report" },
  { value: "account", label: "Account issue" },
  { value: "other", label: "Other" }
];
var STATUS_STYLES = {
  open: { label: "Open", className: "border-[#C81E3A]/50 bg-[#C81E3A]/10 text-[#F4F2ED]" },
  in_progress: {
    label: "In Progress",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300"
  },
  resolved: {
    label: "Resolved",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
  }
};
function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: `inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-inter text-[10px] font-semibold uppercase tracking-wide ${style.className}`,
      children: style.label
    }
  );
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(void 0, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
var RaiseTicketForm = () => {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const trimmed = message.trim();
    if (trimmed.length < 1) {
      setError("Please describe the issue first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSupportTicket({ data: { category, message: trimmed } });
      void queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setSubmitted(true);
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the ticket. Try again.");
    } finally {
      setSubmitting(false);
    }
  };
  if (submitted) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": "ticket-submitted",
        className: "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center",
        children: [
          /* @__PURE__ */ jsx("p", { className: "font-inter text-sm font-semibold text-emerald-300", children: "Ticket submitted" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 font-inter text-xs text-[#8C8C90]", children: "We'll respond right here under My Tickets \u2014 no email needed." }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setSubmitted(false),
              className: "mt-3 cursor-pointer rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 font-inter text-[11px] font-semibold text-white hover:bg-white/[0.08]",
              children: "Raise another ticket"
            }
          )
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs(
    "form",
    {
      onSubmit: handleSubmit,
      "data-testid": "raise-ticket-form",
      className: "rounded-2xl border border-white/10 bg-white/[0.03] p-3",
      children: [
        /* @__PURE__ */ jsxs(
          "label",
          {
            htmlFor: "ticket-category",
            className: "flex items-center gap-1.5 font-inter text-[11px] font-semibold uppercase tracking-wide text-[#8C8C90]",
            children: [
              /* @__PURE__ */ jsx(MessageSquarePlus, { className: "h-3.5 w-3.5" }),
              "Category"
            ]
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "relative mt-1.5", children: [
          /* @__PURE__ */ jsx(
            "select",
            {
              id: "ticket-category",
              value: category,
              onChange: (event) => setCategory(event.target.value),
              className: "w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-[#17171A] px-3 py-2.5 pr-9 font-inter text-sm text-[#F4F2ED] outline-none focus:border-[#C81E3A]/60",
              children: CATEGORY_OPTIONS.map((option) => /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value))
            }
          ),
          /* @__PURE__ */ jsx(ChevronDown, { className: "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8C90]" })
        ] }),
        /* @__PURE__ */ jsx(
          "label",
          {
            htmlFor: "ticket-message",
            className: "mt-3 block font-inter text-[11px] font-semibold uppercase tracking-wide text-[#8C8C90]",
            children: "What happened?"
          }
        ),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            id: "ticket-message",
            value: message,
            onChange: (event) => setMessage(event.target.value),
            rows: 4,
            maxLength: 5e3,
            placeholder: "Describe the issue \u2014 include anything that helps us reproduce it.",
            className: "mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-[#17171A] px-3 py-2.5 font-inter text-sm text-[#F4F2ED] placeholder:text-[#8C8C90]/60 outline-none focus:border-[#C81E3A]/60"
          }
        ),
        error && /* @__PURE__ */ jsx("p", { role: "alert", className: "mt-2 font-inter text-xs text-[#E62846]", children: error }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "submit",
            disabled: submitting,
            className: "mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-inter text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#A0182E] disabled:opacity-60",
            children: [
              submitting ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx(Ticket, { className: "h-4 w-4" }),
              submitting ? "Submitting..." : "Submit ticket"
            ]
          }
        )
      ]
    }
  );
};
var MyTicketsList = () => {
  const userId = useAuthUserId();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-support-tickets", userId],
    queryFn: () => listMySupportTickets({ data: void 0 }),
    enabled: userId !== null,
    ...SUPPORT_TICKET_REFRESH_OPTIONS
  });
  useSupportTicketWindowFocus(refetch, userId !== null);
  if (isLoading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2 py-4 text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }),
      /* @__PURE__ */ jsx("span", { className: "font-inter text-xs", children: "Loading tickets..." })
    ] });
  }
  if (error) {
    return /* @__PURE__ */ jsx("p", { role: "alert", className: "py-3 text-center font-inter text-xs text-[#E62846]", children: "Couldn't load your tickets. Try again later." });
  }
  const tickets = (data ?? []).filter(
    (ticket) => ticket.status !== "resolved" && ticket.user_id === userId
  );
  if (tickets.length === 0) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        "data-testid": "no-tickets",
        className: "rounded-2xl border border-white/[0.06] bg-[#08080A] px-3 py-4 text-center",
        children: [
          /* @__PURE__ */ jsx("div", { className: "mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10", children: /* @__PURE__ */ jsx(Ticket, { className: "h-4 w-4 text-emerald-300" }) }),
          /* @__PURE__ */ jsx("p", { className: "font-inter text-xs font-semibold text-[#F4F2ED]", children: "No active tickets" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 font-inter text-[11px] leading-relaxed text-[#8C8C90]", children: "Resolved tickets clear from this list automatically." })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsx("ul", { "data-testid": "my-tickets-list", className: "space-y-2.5", children: tickets.map((ticket) => /* @__PURE__ */ jsxs(
    "li",
    {
      className: "rounded-2xl border border-white/10 bg-white/[0.03] p-3",
      "data-testid": `my-ticket-${ticket.status}`,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "font-inter text-xs font-semibold capitalize text-[#F4F2ED]", children: CATEGORY_OPTIONS.find((option) => option.value === ticket.category)?.label ?? ticket.category }),
          /* @__PURE__ */ jsx(StatusBadge, { status: ticket.status })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1.5 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#B9B7BC]", children: ticket.message }),
        ticket.admin_response && /* @__PURE__ */ jsxs("div", { className: "mt-2 rounded-xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 p-2.5", children: [
          /* @__PURE__ */ jsx("p", { className: "font-inter text-[10px] font-bold uppercase tracking-wide text-[#C81E3A]", children: "SVJ Support" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#F4F2ED]", children: ticket.admin_response })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 font-mono text-[10px] text-[#8C8C90]", children: formatDate(ticket.created_at) })
      ]
    },
    ticket.id
  )) });
};

// src/app/views/AdminDashboardView.tsx
import { useState as useState2 } from "react";
import { useMutation, useQuery as useQuery2, useQueryClient as useQueryClient2 } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2 as Loader22,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";

// mock:admin
var getAdminDashboardStats = () => globalThis.supportFixture.stats();
var adminListUsers = async () => ({ users: [], page: 1, hasMore: false });
var adminDeleteUser = async () => {
};
var adminGrantPlus = async () => {
};
var adminRevokePlus = async () => {
};

// src/app/views/AdminDashboardView.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var inputClass = "rounded-lg border border-white/10 bg-[#17171A] px-3 py-2 font-inter text-sm text-[#F4F2ED] placeholder:text-[#8C8C90]/60 outline-none focus:border-[#C81E3A]/60";
var actionButtonClass = "cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-inter text-[11px] font-semibold text-[#F4F2ED] hover:bg-white/[0.08] disabled:opacity-50";
function ErrorNote({ message }) {
  return /* @__PURE__ */ jsxs2("p", { role: "alert", className: "mt-2 flex items-center gap-1.5 font-inter text-xs text-[#E62846]", children: [
    /* @__PURE__ */ jsx2(AlertCircle, { className: "h-3.5 w-3.5" }),
    message
  ] });
}
function StatCard({ label, value }) {
  return /* @__PURE__ */ jsxs2("div", { className: "rounded-xl border border-white/10 bg-white/[0.03] p-3", "data-testid": "admin-stat", children: [
    /* @__PURE__ */ jsx2("p", { className: "font-mono text-xl font-bold text-[#F4F2ED]", children: value.toLocaleString() }),
    /* @__PURE__ */ jsx2("p", { className: "mt-0.5 font-inter text-[10px] font-semibold uppercase tracking-wide text-[#8C8C90]", children: label })
  ] });
}
var UsersSection = () => {
  const queryClient = useQueryClient2();
  const [searchInput, setSearchInput] = useState2("");
  const [search, setSearch] = useState2("");
  const [page, setPage] = useState2(1);
  const [durationValue, setDurationValue] = useState2({});
  const [durationUnit, setDurationUnit] = useState2(
    {}
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState2(null);
  const [actionError, setActionError] = useState2(null);
  const stats = useQuery2({
    queryKey: ["admin-stats"],
    queryFn: () => getAdminDashboardStats({ data: void 0 })
  });
  const users = useQuery2({
    queryKey: ["admin-users", search, page],
    queryFn: () => adminListUsers({ data: { search, page, pageSize: 25 } })
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };
  const onError = (cause) => setActionError(cause instanceof Error ? cause.message : "Action failed");
  const grantPlus = useMutation({
    mutationFn: (input) => adminGrantPlus({ data: input }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError
  });
  const revokePlus = useMutation({
    mutationFn: (targetUserId) => adminRevokePlus({ data: { targetUserId } }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError
  });
  const deleteUser = useMutation({
    mutationFn: (targetUserId) => adminDeleteUser({ data: { targetUserId } }),
    onSuccess: () => {
      setActionError(null);
      setConfirmDeleteId(null);
      invalidate();
    },
    onError
  });
  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };
  return /* @__PURE__ */ jsxs2("section", { "data-testid": "admin-users-section", "aria-label": "Users", children: [
    /* @__PURE__ */ jsx2("h2", { className: "mb-3 font-anton text-lg tracking-wide text-[#F4F2ED]", children: "Users" }),
    stats.isLoading ? /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2 py-3 text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx2(Loader22, { className: "h-4 w-4 animate-spin" }),
      /* @__PURE__ */ jsx2("span", { className: "font-inter text-xs", children: "Loading stats..." })
    ] }) : stats.data ? /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-4", children: [
      /* @__PURE__ */ jsx2(StatCard, { label: "Total users", value: stats.data.totalUsers }),
      /* @__PURE__ */ jsx2(StatCard, { label: "Plus members", value: stats.data.totalPlusMembers }),
      /* @__PURE__ */ jsx2(StatCard, { label: "New (7 days)", value: stats.data.newSignupsLast7Days }),
      /* @__PURE__ */ jsx2(StatCard, { label: "Open tickets", value: stats.data.openTickets })
    ] }) : /* @__PURE__ */ jsx2(ErrorNote, { message: "Could not load stats." }),
    /* @__PURE__ */ jsxs2("form", { onSubmit: submitSearch, className: "mt-4 flex gap-2", role: "search", children: [
      /* @__PURE__ */ jsxs2("div", { className: "relative flex-1", children: [
        /* @__PURE__ */ jsx2(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8C90]" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "search",
            value: searchInput,
            onChange: (event) => setSearchInput(event.target.value),
            placeholder: "Search username, name or email",
            "aria-label": "Search users",
            className: `${inputClass} w-full pl-9`
          }
        )
      ] }),
      /* @__PURE__ */ jsx2("button", { type: "submit", className: actionButtonClass, children: "Search" })
    ] }),
    actionError && /* @__PURE__ */ jsx2(ErrorNote, { message: actionError }),
    /* @__PURE__ */ jsx2("div", { className: "mt-3 overflow-x-auto rounded-xl border border-white/10", children: /* @__PURE__ */ jsxs2("table", { "data-testid": "admin-users-table", className: "w-full min-w-[720px] text-left", children: [
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { className: "border-b border-white/10 bg-white/[0.04] font-inter text-[10px] uppercase tracking-wide text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "User" }),
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "Plus" }),
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "Streak" }),
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "XP" }),
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "Joined" }),
        /* @__PURE__ */ jsx2("th", { scope: "col", className: "px-3 py-2 font-semibold", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: users.isLoading ? /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsxs2("td", { colSpan: 6, className: "px-3 py-6 text-center font-inter text-xs text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx2(Loader22, { className: "mr-2 inline h-4 w-4 animate-spin" }),
        "Loading users..."
      ] }) }) : (users.data?.users.length ?? 0) === 0 ? /* @__PURE__ */ jsx2("tr", { children: /* @__PURE__ */ jsx2("td", { colSpan: 6, className: "px-3 py-6 text-center font-inter text-xs text-[#8C8C90]", children: "No users match." }) }) : users.data.users.map((user) => /* @__PURE__ */ jsxs2("tr", { className: "border-b border-white/[0.06] last:border-0", children: [
        /* @__PURE__ */ jsxs2("td", { className: "px-3 py-2.5", children: [
          /* @__PURE__ */ jsx2("p", { className: "font-inter text-xs font-semibold text-[#F4F2ED]", children: user.display_name || user.username || "\u2014" }),
          /* @__PURE__ */ jsx2("p", { className: "font-mono text-[10px] text-[#8C8C90]", children: user.email ?? user.id })
        ] }),
        /* @__PURE__ */ jsx2("td", { className: "px-3 py-2.5 font-inter text-xs", children: user.is_plus_member && (!user.plus_expires_at || new Date(user.plus_expires_at).getTime() > Date.now()) ? /* @__PURE__ */ jsxs2("span", { className: "text-amber-300", children: [
          "Plus",
          user.plus_expires_at ? ` \u2192 ${new Date(user.plus_expires_at).toLocaleDateString()}` : " (lifetime)"
        ] }) : user.is_plus_member ? /* @__PURE__ */ jsx2("span", { className: "text-[#8C8C90]", children: "Expired" }) : /* @__PURE__ */ jsx2("span", { className: "text-[#8C8C90]", children: "\u2014" }) }),
        /* @__PURE__ */ jsx2("td", { className: "px-3 py-2.5 font-mono text-xs text-[#F4F2ED]", children: user.current_streak }),
        /* @__PURE__ */ jsx2("td", { className: "px-3 py-2.5 font-mono text-xs text-[#F4F2ED]", children: user.total_xp.toLocaleString() }),
        /* @__PURE__ */ jsx2("td", { className: "px-3 py-2.5 font-inter text-xs text-[#8C8C90]", children: new Date(user.created_at).toLocaleDateString() }),
        /* @__PURE__ */ jsx2("td", { className: "px-3 py-2.5", children: /* @__PURE__ */ jsxs2("div", { className: "flex flex-wrap items-center gap-1.5", children: [
          user.is_plus_member && (!user.plus_expires_at || new Date(user.plus_expires_at).getTime() > Date.now()) ? /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              className: actionButtonClass,
              disabled: revokePlus.isPending,
              onClick: () => revokePlus.mutate(user.id),
              children: "Revoke Plus"
            }
          ) : /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx2(
              "input",
              {
                type: "number",
                min: 1,
                max: (durationUnit[user.id] ?? "month") === "week" ? 104 : 24,
                step: 1,
                inputMode: "numeric",
                "aria-label": `Plus duration for ${user.email ?? user.id}`,
                value: durationValue[user.id] ?? "1",
                onChange: (event) => setDurationValue((previous) => ({
                  ...previous,
                  [user.id]: event.target.value
                })),
                disabled: (durationUnit[user.id] ?? "month") === "lifetime",
                className: `${inputClass} !w-16 !px-2 !py-1 text-[11px]`
              }
            ),
            /* @__PURE__ */ jsxs2(
              "select",
              {
                "aria-label": `Plus duration unit for ${user.email ?? user.id}`,
                value: durationUnit[user.id] ?? "month",
                onChange: (event) => setDurationUnit((previous) => ({
                  ...previous,
                  [user.id]: event.target.value
                })),
                className: `${inputClass} !w-auto !px-2 !py-1 text-[11px]`,
                children: [
                  /* @__PURE__ */ jsx2("option", { value: "week", children: "Weeks" }),
                  /* @__PURE__ */ jsx2("option", { value: "month", children: "Months" }),
                  /* @__PURE__ */ jsx2("option", { value: "lifetime", children: "Lifetime" })
                ]
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: actionButtonClass,
                disabled: grantPlus.isPending,
                onClick: () => {
                  const unit = durationUnit[user.id] ?? "month";
                  const value = durationValue[user.id] ?? "1";
                  grantPlus.mutate({
                    targetUserId: user.id,
                    durationValue: unit === "lifetime" ? 0 : Number(value),
                    durationUnit: unit
                  });
                },
                children: "Give Plus"
              }
            )
          ] }),
          confirmDeleteId === user.id ? /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                "data-testid": `confirm-delete-${user.id}`,
                className: "cursor-pointer rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-2.5 py-1.5 font-inter text-[11px] font-bold text-[#F4F2ED] hover:bg-[#C81E3A]/30",
                disabled: deleteUser.isPending,
                onClick: () => deleteUser.mutate(user.id),
                children: "Confirm delete"
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: actionButtonClass,
                onClick: () => setConfirmDeleteId(null),
                children: "Cancel"
              }
            )
          ] }) : /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              "aria-label": `Delete user ${user.email ?? user.id}`,
              className: "cursor-pointer rounded-lg border border-[#C81E3A]/40 p-1.5 text-[#E62846] hover:bg-[#C81E3A]/10",
              onClick: () => setConfirmDeleteId(user.id),
              children: /* @__PURE__ */ jsx2(Trash2, { className: "h-3.5 w-3.5" })
            }
          )
        ] }) })
      ] }, user.id)) })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "mt-2 flex items-center justify-end gap-2", children: [
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          className: actionButtonClass,
          disabled: page <= 1,
          onClick: () => setPage((previous) => Math.max(1, previous - 1)),
          "aria-label": "Previous page",
          children: /* @__PURE__ */ jsx2(ChevronLeft, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs2("span", { className: "font-mono text-xs text-[#8C8C90]", children: [
        "Page ",
        users.data?.page ?? page
      ] }),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          className: actionButtonClass,
          disabled: !users.data?.hasMore,
          onClick: () => setPage((previous) => previous + 1),
          "aria-label": "Next page",
          children: /* @__PURE__ */ jsx2(ChevronRight, { className: "h-4 w-4" })
        }
      )
    ] })
  ] });
};
var STATUS_FILTERS = [
  { value: "all", label: "All active" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" }
];
var STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" }
];
var TicketRow = ({ ticket }) => {
  const queryClient = useQueryClient2();
  const [status, setStatus] = useState2(ticket.status);
  const [response, setResponse] = useState2(ticket.admin_response ?? "");
  const [dirty, setDirty] = useState2(false);
  const [error, setError] = useState2(null);
  const update = useMutation({
    mutationFn: (input) => adminUpdateSupportTicket({ data: input }),
    onSuccess: async (_result, input) => {
      setError(null);
      setDirty(false);
      if (input.status === "resolved") {
        await queryClient.cancelQueries({ queryKey: ["admin-tickets"] });
        await queryClient.cancelQueries({ queryKey: ["my-support-tickets"] });
        queryClient.setQueriesData(
          { queryKey: ["admin-tickets"] },
          (rows) => rows?.filter((row) => row.id !== input.ticketId)
        );
        queryClient.setQueriesData(
          { queryKey: ["my-support-tickets"] },
          (rows) => rows?.filter((row) => row.id !== input.ticketId)
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Update failed")
  });
  return /* @__PURE__ */ jsxs2(
    "li",
    {
      className: "rounded-xl border border-white/10 bg-white/[0.03] p-3",
      "data-testid": `admin-ticket-${ticket.status}`,
      children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxs2("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx2("p", { className: "font-inter text-xs font-semibold text-[#F4F2ED]", children: ticket.reporter_username || ticket.reporter_email || ticket.user_id }),
            /* @__PURE__ */ jsxs2("p", { className: "font-mono text-[10px] text-[#8C8C90]", children: [
              ticket.reporter_email ?? "no email",
              " \xB7 ",
              new Date(ticket.created_at).toLocaleString()
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx2("span", { className: "rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 font-inter text-[10px] font-semibold capitalize text-[#F4F2ED]", children: ticket.category }),
            /* @__PURE__ */ jsx2("label", { className: "sr-only", htmlFor: `status-${ticket.id}`, children: "Ticket status" }),
            /* @__PURE__ */ jsx2(
              "select",
              {
                id: `status-${ticket.id}`,
                value: status,
                onChange: (event) => {
                  setStatus(event.target.value);
                  setDirty(true);
                },
                className: `${inputClass} !w-auto !py-1.5 text-xs`,
                children: STATUS_OPTIONS.map((option) => /* @__PURE__ */ jsx2("option", { value: option.value, children: option.label }, option.value))
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx2("p", { className: "mt-2 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#B9B7BC]", children: ticket.message }),
        /* @__PURE__ */ jsx2("label", { className: "mt-2 block font-inter text-[10px] font-bold uppercase tracking-wide text-[#8C8C90]", children: "Admin response" }),
        /* @__PURE__ */ jsx2(
          "textarea",
          {
            value: response,
            onChange: (event) => {
              setResponse(event.target.value);
              setDirty(true);
            },
            rows: 2,
            maxLength: 5e3,
            placeholder: "Write a response the user will see under their ticket...",
            className: `${inputClass} mt-1 w-full resize-none text-xs`
          }
        ),
        error && /* @__PURE__ */ jsx2(ErrorNote, { message: error }),
        /* @__PURE__ */ jsx2("div", { className: "mt-2 flex justify-end", children: /* @__PURE__ */ jsxs2(
          "button",
          {
            type: "button",
            className: "flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#C81E3A] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[#A0182E] disabled:opacity-60",
            disabled: update.isPending || !dirty && status === ticket.status,
            onClick: () => update.mutate({
              ticketId: ticket.id,
              status,
              adminResponse: dirty ? response : void 0
            }),
            children: [
              update.isPending ? /* @__PURE__ */ jsx2(Loader22, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsx2(RefreshCw, { className: "h-3.5 w-3.5" }),
              "Save"
            ]
          }
        ) })
      ]
    }
  );
};
var TicketsSection = () => {
  const [statusFilter, setStatusFilter] = useState2("all");
  const tickets = useQuery2({
    queryKey: ["admin-tickets", statusFilter],
    queryFn: () => adminListSupportTickets({ data: { status: statusFilter, limit: 100 } }),
    ...SUPPORT_TICKET_REFRESH_OPTIONS
  });
  useSupportTicketWindowFocus(tickets.refetch);
  const activeTickets = (tickets.data ?? []).filter((ticket) => ticket.status !== "resolved");
  return /* @__PURE__ */ jsxs2("section", { "data-testid": "admin-tickets-section", "aria-label": "Support tickets", children: [
    /* @__PURE__ */ jsx2("h2", { className: "mb-2 mt-6 font-anton text-lg tracking-wide text-[#F4F2ED]", children: "Tickets" }),
    /* @__PURE__ */ jsx2("div", { className: "flex flex-wrap gap-1.5", role: "group", "aria-label": "Filter tickets by status", children: STATUS_FILTERS.map((filter) => /* @__PURE__ */ jsx2(
      "button",
      {
        type: "button",
        "aria-pressed": statusFilter === filter.value,
        onClick: () => setStatusFilter(filter.value),
        className: `cursor-pointer rounded-full border px-3 py-1.5 font-inter text-[11px] font-semibold transition-colors ${statusFilter === filter.value ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-[#F4F2ED]" : "border-white/10 bg-white/[0.04] text-[#8C8C90] hover:text-white"}`,
        children: filter.label
      },
      filter.value
    )) }),
    tickets.isLoading ? /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2 py-4 text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx2(Loader22, { className: "h-4 w-4 animate-spin" }),
      /* @__PURE__ */ jsx2("span", { className: "font-inter text-xs", children: "Loading tickets..." })
    ] }) : tickets.error ? /* @__PURE__ */ jsx2(ErrorNote, { message: "Could not load tickets." }) : activeTickets.length === 0 ? /* @__PURE__ */ jsx2("p", { className: "py-4 text-center font-inter text-xs text-[#8C8C90]", children: "No active tickets." }) : /* @__PURE__ */ jsx2("ul", { className: "mt-3 space-y-3", children: activeTickets.map((ticket) => /* @__PURE__ */ jsx2(TicketRow, { ticket }, ticket.id)) })
  ] });
};
var AdminDashboardView = () => /* @__PURE__ */ jsxs2("div", { className: "py-4", children: [
  /* @__PURE__ */ jsxs2("header", { className: "mb-6 flex items-center gap-2", children: [
    /* @__PURE__ */ jsx2(ShieldCheck, { className: "h-5 w-5 text-[#C81E3A]" }),
    /* @__PURE__ */ jsx2("h1", { className: "font-anton text-2xl tracking-wide text-[#F4F2ED]", children: "Admin" })
  ] }),
  /* @__PURE__ */ jsx2(UsersSection, {}),
  /* @__PURE__ */ jsx2(TicketsSection, {})
] });
export {
  AdminDashboardView,
  MyTicketsList,
  RaiseTicketForm
};
