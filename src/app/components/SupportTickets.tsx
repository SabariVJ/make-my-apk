import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, MessageSquarePlus, Ticket } from "lucide-react";

import {
  createSupportTicket,
  listMySupportTickets,
  type SupportTicket,
  type TicketCategory,
} from "@/lib/support.functions";
import { useAuthUserId } from "../hooks/useWorkoutQueue";
import {
  SUPPORT_TICKET_REFRESH_OPTIONS,
  useSupportTicketWindowFocus,
} from "../hooks/useSupportTicketRefresh";

const CATEGORY_OPTIONS: Array<{ value: TicketCategory; label: string }> = [
  { value: "payment", label: "Payment issue" },
  { value: "bug", label: "Bug report" },
  { value: "account", label: "Account issue" },
  { value: "other", label: "Other" },
];

const STATUS_STYLES: Record<SupportTicket["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "border-[#C81E3A]/50 bg-[#C81E3A]/10 text-[#F4F2ED]" },
  in_progress: {
    label: "In Progress",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  resolved: {
    label: "Resolved",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
};

function StatusBadge({ status }: { status: SupportTicket["status"] }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open!;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-inter text-[10px] font-semibold uppercase tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Raise-a-Ticket form: category dropdown + message, submitted via RLS-guarded insert. */
export const RaiseTicketForm: React.FC = () => {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<TicketCategory>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
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
    return (
      <div
        data-testid="ticket-submitted"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center"
      >
        <p className="font-inter text-sm font-semibold text-emerald-300">Ticket submitted</p>
        <p className="mt-1 font-inter text-xs text-[#8C8C90]">
          We'll respond right here under My Tickets — no email needed.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-3 cursor-pointer rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 font-inter text-[11px] font-semibold text-white hover:bg-white/[0.08]"
        >
          Raise another ticket
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="raise-ticket-form"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
    >
      <label
        htmlFor="ticket-category"
        className="flex items-center gap-1.5 font-inter text-[11px] font-semibold uppercase tracking-wide text-[#8C8C90]"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        Category
      </label>
      <div className="relative mt-1.5">
        <select
          id="ticket-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as TicketCategory)}
          className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-[#17171A] px-3 py-2.5 pr-9 font-inter text-sm text-[#F4F2ED] outline-none focus:border-[#C81E3A]/60"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8C90]" />
      </div>

      <label
        htmlFor="ticket-message"
        className="mt-3 block font-inter text-[11px] font-semibold uppercase tracking-wide text-[#8C8C90]"
      >
        What happened?
      </label>
      <textarea
        id="ticket-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="Describe the issue — include anything that helps us reproduce it."
        className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-[#17171A] px-3 py-2.5 font-inter text-sm text-[#F4F2ED] placeholder:text-[#8C8C90]/60 outline-none focus:border-[#C81E3A]/60"
      />

      {error && (
        <p role="alert" className="mt-2 font-inter text-xs text-[#E62846]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-inter text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#A0182E] disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
        {submitting ? "Submitting..." : "Submit ticket"}
      </button>
    </form>
  );
};

/** My Tickets: the current user's own tickets with status badge and admin response. */
export const MyTicketsList: React.FC = () => {
  const userId = useAuthUserId();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-support-tickets", userId],
    queryFn: () => listMySupportTickets({ data: undefined }),
    enabled: userId !== null,
    ...SUPPORT_TICKET_REFRESH_OPTIONS,
  });
  useSupportTicketWindowFocus(refetch, userId !== null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-[#8C8C90]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-inter text-xs">Loading tickets...</span>
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="py-3 text-center font-inter text-xs text-[#E62846]">
        Couldn't load your tickets. Try again later.
      </p>
    );
  }

  const tickets = (data ?? []).filter(
    (ticket) => ticket.status !== "resolved" && ticket.user_id === userId,
  );
  if (tickets.length === 0) {
    return (
      <p data-testid="no-tickets" className="py-3 text-center font-inter text-xs text-[#8C8C90]">
        No active tickets.
      </p>
    );
  }

  return (
    <ul data-testid="my-tickets-list" className="space-y-2.5">
      {tickets.map((ticket) => (
        <li
          key={ticket.id}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
          data-testid={`my-ticket-${ticket.status}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-inter text-xs font-semibold capitalize text-[#F4F2ED]">
              {CATEGORY_OPTIONS.find((option) => option.value === ticket.category)?.label ??
                ticket.category}
            </span>
            <StatusBadge status={ticket.status} />
          </div>
          <p className="mt-1.5 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#B9B7BC]">
            {ticket.message}
          </p>
          {ticket.admin_response && (
            <div className="mt-2 rounded-xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 p-2.5">
              <p className="font-inter text-[10px] font-bold uppercase tracking-wide text-[#C81E3A]">
                SVJ Support
              </p>
              <p className="mt-1 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#F4F2ED]">
                {ticket.admin_response}
              </p>
            </div>
          )}
          <p className="mt-2 font-mono text-[10px] text-[#8C8C90]">
            {formatDate(ticket.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
};
