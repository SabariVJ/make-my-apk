import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  adminDeleteUser,
  adminGrantPlus,
  adminListUsers,
  adminRevokePlus,
  getAdminDashboardStats,
} from "@/lib/admin.functions";
import {
  adminListSupportTickets,
  adminUpdateSupportTicket,
  type SupportTicketWithReporter,
  type TicketStatus,
} from "@/lib/support.functions";

// Utilitarian internal tool: plain tables, dark obsidian/crimson palette,
// no heavy animation. Security note (UI hiding is cosmetic — RLS and the
// server-side role checks in admin.functions/support.functions are the
// actual boundary).

const inputClass =
  "rounded-lg border border-white/10 bg-[#17171A] px-3 py-2 font-inter text-sm text-[#F4F2ED] placeholder:text-[#8C8C90]/60 outline-none focus:border-[#C81E3A]/60";

const actionButtonClass =
  "cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-inter text-[11px] font-semibold text-[#F4F2ED] hover:bg-white/[0.08] disabled:opacity-50";

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-2 flex items-center gap-1.5 font-inter text-xs text-[#E62846]">
      <AlertCircle className="h-3.5 w-3.5" />
      {message}
    </p>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3" data-testid="admin-stat">
      <p className="font-mono text-xl font-bold text-[#F4F2ED]">{value.toLocaleString()}</p>
      <p className="mt-0.5 font-inter text-[10px] font-semibold uppercase tracking-wide text-[#8C8C90]">
        {label}
      </p>
    </div>
  );
}

// ── Users section ───────────────────────────────────────────────────────────

const UsersSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => getAdminDashboardStats({ data: undefined }),
  });

  const users = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => adminListUsers({ data: { search, page, pageSize: 25 } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const onError = (cause: unknown) =>
    setActionError(cause instanceof Error ? cause.message : "Action failed");

  const grantPlus = useMutation({
    mutationFn: (input: { targetUserId: string; expiresAt: string | null }) =>
      adminGrantPlus({ data: input }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError,
  });
  const revokePlus = useMutation({
    mutationFn: (targetUserId: string) => adminRevokePlus({ data: { targetUserId } }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError,
  });
  const deleteUser = useMutation({
    mutationFn: (targetUserId: string) => adminDeleteUser({ data: { targetUserId } }),
    onSuccess: () => {
      setActionError(null);
      setConfirmDeleteId(null);
      invalidate();
    },
    onError,
  });

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <section data-testid="admin-users-section" aria-label="Users">
      <h2 className="mb-3 font-anton text-lg tracking-wide text-[#F4F2ED]">Users</h2>

      {stats.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-[#8C8C90]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-inter text-xs">Loading stats...</span>
        </div>
      ) : stats.data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Total users" value={stats.data.totalUsers} />
          <StatCard label="Plus members" value={stats.data.totalPlusMembers} />
          <StatCard label="New (7 days)" value={stats.data.newSignupsLast7Days} />
          <StatCard label="Open tickets" value={stats.data.openTickets} />
        </div>
      ) : (
        <ErrorNote message="Could not load stats." />
      )}

      <form onSubmit={submitSearch} className="mt-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8C90]" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search username, name or email"
            aria-label="Search users"
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <button type="submit" className={actionButtonClass}>
          Search
        </button>
      </form>

      {actionError && <ErrorNote message={actionError} />}

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table data-testid="admin-users-table" className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] font-inter text-[10px] uppercase tracking-wide text-[#8C8C90]">
              <th scope="col" className="px-3 py-2 font-semibold">
                User
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Plus
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Streak
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                XP
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Joined
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center font-inter text-xs text-[#8C8C90]">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading users...
                </td>
              </tr>
            ) : (users.data?.users.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center font-inter text-xs text-[#8C8C90]">
                  No users match.
                </td>
              </tr>
            ) : (
              users.data!.users.map((user) => (
                <tr key={user.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-inter text-xs font-semibold text-[#F4F2ED]">
                      {user.display_name || user.username || "—"}
                    </p>
                    <p className="font-mono text-[10px] text-[#8C8C90]">{user.email ?? user.id}</p>
                  </td>
                  <td className="px-3 py-2.5 font-inter text-xs">
                    {user.is_plus_member ? (
                      <span className="text-amber-300">
                        Plus
                        {user.plus_expires_at
                          ? ` → ${new Date(user.plus_expires_at).toLocaleDateString()}`
                          : " (lifetime)"}
                      </span>
                    ) : (
                      <span className="text-[#8C8C90]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[#F4F2ED]">
                    {user.current_streak}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[#F4F2ED]">
                    {user.total_xp.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-inter text-xs text-[#8C8C90]">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {user.is_plus_member ? (
                        <button
                          type="button"
                          className={actionButtonClass}
                          disabled={revokePlus.isPending}
                          onClick={() => revokePlus.mutate(user.id)}
                        >
                          Revoke Plus
                        </button>
                      ) : (
                        <>
                          <input
                            type="date"
                            aria-label={`Plus expiry for ${user.email ?? user.id}`}
                            value={expiry[user.id] ?? ""}
                            onChange={(event) =>
                              setExpiry((previous) => ({
                                ...previous,
                                [user.id]: event.target.value,
                              }))
                            }
                            className={`${inputClass} !px-2 !py-1 text-[11px]`}
                          />
                          <button
                            type="button"
                            className={actionButtonClass}
                            disabled={grantPlus.isPending}
                            onClick={() =>
                              grantPlus.mutate({
                                targetUserId: user.id,
                                expiresAt: expiry[user.id] || null,
                              })
                            }
                          >
                            Grant Plus
                          </button>
                        </>
                      )}
                      {confirmDeleteId === user.id ? (
                        <>
                          <button
                            type="button"
                            data-testid={`confirm-delete-${user.id}`}
                            className="cursor-pointer rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-2.5 py-1.5 font-inter text-[11px] font-bold text-[#F4F2ED] hover:bg-[#C81E3A]/30"
                            disabled={deleteUser.isPending}
                            onClick={() => deleteUser.mutate(user.id)}
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            className={actionButtonClass}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete user ${user.email ?? user.id}`}
                          className="cursor-pointer rounded-lg border border-[#C81E3A]/40 p-1.5 text-[#E62846] hover:bg-[#C81E3A]/10"
                          onClick={() => setConfirmDeleteId(user.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          className={actionButtonClass}
          disabled={page <= 1}
          onClick={() => setPage((previous) => Math.max(1, previous - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-[#8C8C90]">Page {users.data?.page ?? page}</span>
        <button
          type="button"
          className={actionButtonClass}
          disabled={!users.data?.hasMore}
          onClick={() => setPage((previous) => previous + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
};

// ── Tickets section ─────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: TicketStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const TicketRow: React.FC<{ ticket: SupportTicketWithReporter }> = ({ ticket }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [response, setResponse] = useState(ticket.admin_response ?? "");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      adminUpdateSupportTicket({
        data: {
          ticketId: ticket.id,
          status,
          adminResponse: dirty ? response : undefined,
        },
      }),
    onSuccess: () => {
      setError(null);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (cause: unknown) => setError(cause instanceof Error ? cause.message : "Update failed"),
  });

  return (
    <li
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
      data-testid={`admin-ticket-${ticket.status}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-inter text-xs font-semibold text-[#F4F2ED]">
            {ticket.reporter_username || ticket.reporter_email || ticket.user_id}
          </p>
          <p className="font-mono text-[10px] text-[#8C8C90]">
            {ticket.reporter_email ?? "no email"} · {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 font-inter text-[10px] font-semibold capitalize text-[#F4F2ED]">
            {ticket.category}
          </span>
          <label className="sr-only" htmlFor={`status-${ticket.id}`}>
            Ticket status
          </label>
          <select
            id={`status-${ticket.id}`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as TicketStatus);
              setDirty(true);
            }}
            className={`${inputClass} !w-auto !py-1.5 text-xs`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap font-inter text-xs leading-relaxed text-[#B9B7BC]">
        {ticket.message}
      </p>

      <label className="mt-2 block font-inter text-[10px] font-bold uppercase tracking-wide text-[#8C8C90]">
        Admin response
      </label>
      <textarea
        value={response}
        onChange={(event) => {
          setResponse(event.target.value);
          setDirty(true);
        }}
        rows={2}
        maxLength={5000}
        placeholder="Write a response the user will see under their ticket..."
        className={`${inputClass} mt-1 w-full resize-none text-xs`}
      />

      {error && <ErrorNote message={error} />}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#C81E3A] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-wide text-white hover:bg-[#A0182E] disabled:opacity-60"
          disabled={update.isPending || (!dirty && status === ticket.status)}
          onClick={() => update.mutate()}
        >
          {update.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>
    </li>
  );
};

const TicketsSection: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");

  const tickets = useQuery({
    queryKey: ["admin-tickets", statusFilter],
    queryFn: () => adminListSupportTickets({ data: { status: statusFilter, limit: 100 } }),
  });

  return (
    <section data-testid="admin-tickets-section" aria-label="Support tickets">
      <h2 className="mb-3 mt-8 font-anton text-lg tracking-wide text-[#F4F2ED]">Tickets</h2>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter tickets by status">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={statusFilter === filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 font-inter text-[11px] font-semibold transition-colors ${
              statusFilter === filter.value
                ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-[#F4F2ED]"
                : "border-white/10 bg-white/[0.04] text-[#8C8C90] hover:text-white"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {tickets.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-[#8C8C90]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-inter text-xs">Loading tickets...</span>
        </div>
      ) : tickets.error ? (
        <ErrorNote message="Could not load tickets." />
      ) : (tickets.data?.length ?? 0) === 0 ? (
        <p className="py-4 text-center font-inter text-xs text-[#8C8C90]">
          No tickets match this filter.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {tickets.data!.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </section>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export const AdminDashboardView: React.FC = () => (
  <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
    <header className="mb-6 flex items-center gap-2">
      <ShieldCheck className="h-5 w-5 text-[#C81E3A]" />
      <h1 className="font-anton text-2xl tracking-wide text-[#F4F2ED]">Admin</h1>
    </header>
    <UsersSection />
    <TicketsSection />
  </div>
);
