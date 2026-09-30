import React, { useEffect, useState } from "react";
import { Gift, Loader2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claimMyPlusGift, getMyPendingPlusGift } from "@/lib/plusGift.functions";

function formatGiftDuration(value: number, unit: "week" | "month" | "lifetime"): string {
  if (unit === "lifetime") return "Lifetime SVJ Plus";
  const label = unit === "week" ? "week" : "month";
  return `${value} ${label}${value === 1 ? "" : "s"} of SVJ Plus`;
}

export const PlusGiftClaimModal: React.FC = () => {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const pending = useQuery({
    queryKey: ["plus-gift-pending"],
    queryFn: () => getMyPendingPlusGift({ data: undefined }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const gift = pending.data ?? null;

  useEffect(() => {
    setDismissed(false);
  }, [gift?.id]);

  const claim = useMutation({
    mutationFn: () => {
      if (!gift) throw new Error("No Plus gift available");
      return claimMyPlusGift({ data: { grantId: gift.id } });
    },
    onSuccess: () => {
      setDismissed(true);
      void queryClient.invalidateQueries({ queryKey: ["plus-gift-pending"] });
      void queryClient.invalidateQueries({ queryKey: ["trial-status"] });
    },
  });

  if (pending.isPending || pending.isError || !gift || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plus-gift-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[2px]"
    >
      <div className="relative w-full max-w-[360px] rounded-2xl border border-[#C81E3A]/35 bg-[#17171A] p-5 text-center shadow-2xl">
        <button
          type="button"
          aria-label="Close Plus gift notice"
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 rounded-full p-1 text-[#8C8C90] hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#C81E3A]/35 bg-[#C81E3A]/10">
          <Gift className="h-5 w-5 text-[#C81E3A]" />
        </div>

        <p className="mt-3 font-inter text-[10px] font-bold uppercase tracking-[0.18em] text-[#8C8C90]">
          {gift.senderLabel} sent you
        </p>
        <h2 id="plus-gift-title" className="mt-1 font-anton text-2xl tracking-wide text-white">
          SVJ PLUS
        </h2>
        <p className="mt-1 font-inter text-sm text-[#D4AF37]">
          {formatGiftDuration(gift.durationValue, gift.durationUnit)}
        </p>
        <p className="mt-3 font-inter text-xs leading-relaxed text-[#8C8C90]">
          Your Plus access has been added to your account. Claim it to dismiss this gift and keep it
          in your account.
        </p>

        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-2.5 font-inter text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#A0182E] disabled:opacity-60"
        >
          {claim.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Claim Plus
        </button>

        {claim.isError && (
          <p role="alert" className="mt-2 font-inter text-[11px] text-[#E62846]">
            {claim.error instanceof Error ? claim.error.message : "Could not claim this Plus gift."}
          </p>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-2 w-full py-1.5 font-inter text-[11px] text-[#8C8C90] hover:text-[#F4F2ED]"
        >
          Later
        </button>
      </div>
    </div>
  );
};
