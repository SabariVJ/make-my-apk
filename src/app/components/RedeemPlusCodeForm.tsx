import React, { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Check, Loader2 } from "lucide-react";
import { useSVJ } from "@/app/context/SVJContext";
import { redeemPlusCode } from "@/lib/challenge.functions";

interface RedeemPlusCodeFormProps {
  /** Prefill the code input (e.g. from the completed challenge screen). */
  code?: string;
  /** Custom heading text. Defaults to "Redeem 60-Day Reward Code". */
  heading?: string;
  /** Additional copy shown below the description. */
  description?: string;
}

export const RedeemPlusCodeForm: React.FC<RedeemPlusCodeFormProps> = ({
  code: prefilledCode,
  heading = "Redeem 60-Day Reward Code",
  description = "Enter the code earned by completing all 60 days to unlock SVJ Plus for 2 months.",
}) => {
  const { updateUserProfile, setIsPaywallOpen, triggerConfetti } = useSVJ();
  const queryClient = useQueryClient();

  const callRedeemCode = useServerFn(redeemPlusCode);

  const [input, setInput] = useState(prefilledCode ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Sync prefilled code when the prop changes (e.g. code granted after completion).
  useEffect(() => {
    if (prefilledCode) setInput(prefilledCode);
  }, [prefilledCode]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setResult(null);

    try {
      const res = await callRedeemCode({ data: { code: trimmed } });

      if (res.ok) {
        // Immediate visual feedback — set local premium state.
        updateUserProfile({ isPremium: true, vipIcon: true, verifiedIcon: true });
        setIsPaywallOpen(false);
        triggerConfetti();

        // Let the server-refetched data become authoritative.
        void queryClient.invalidateQueries({ queryKey: ["trial-status"] });
        void queryClient.invalidateQueries({ queryKey: ["sixty-challenge"] });

        setResult({ ok: true, message: res.message });
        setInput("");
      } else {
        setResult({ ok: false, message: res.message });
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Something went wrong. Please retry.",
      });
    } finally {
      setBusy(false);
    }
  }, [
    input,
    busy,
    callRedeemCode,
    updateUserProfile,
    setIsPaywallOpen,
    triggerConfetti,
    queryClient,
  ]);

  return (
    <div className="rounded-2xl bg-[#17171A] border border-amber-500/30 p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-anton text-amber-400 uppercase tracking-wide">{heading}</div>
          <p className="text-[11px] text-[#8C8C90] font-inter mt-0.5">{description}</p>

          <div className="flex items-center gap-2 mt-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
              placeholder="SVJ-XXXX-XXXX"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="flex-1 min-w-0 bg-[#0B0B0C] svj-border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-[#F4F2ED] placeholder:text-[#8C8C90]/50 focus:outline-none focus:border-amber-500/60 uppercase"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={busy || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              <span>Redeem & Activate</span>
            </button>
          </div>

          {result && (
            <div
              className={`mt-2.5 text-[11px] font-mono font-semibold ${
                result.ok ? "text-emerald-400" : "text-rose-300"
              }`}
            >
              {result.ok ? (
                <span className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {result.message}
                </span>
              ) : (
                result.message
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
