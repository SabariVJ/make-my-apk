import React from "react";
import { motion } from "motion/react";
import { Lock, ShieldCheck, LogOut, ExternalLink } from "lucide-react";
import upiQr from "@/assets/upi-qr-clean.png.asset.json";

type Props = {
  email: string | null;
  onSignOut: () => void;
};

export const TrialExpiredScreen: React.FC<Props> = ({ email, onSignOut }) => {
  const handleContactSupport = () => {
    window.open(
      `https://wa.me/919790833416?text=${encodeURIComponent(`Hi! I've paid for SVJ Plus. My email: ${email ?? "(not signed in)"}. Please activate my account.`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] font-inter flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl bg-[#121214] border border-white/10 p-6 shadow-2xl space-y-5 text-center"
      >
        <div className="space-y-1">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/30 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#C81E3A]" />
          </div>
          <h1 className="font-anton text-xl uppercase tracking-wider text-white pt-2">
            Your 7-Day Trial Has Ended
          </h1>
          <p className="text-[11px] font-mono text-[#8C8C90]">
            Upgrade to SVJ Plus to continue{email ? ` as ${email}` : ""}.
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-white text-black inline-block shadow-2xl mx-auto border-4 border-[#C81E3A]">
          <div className="w-[min(14rem,60vw)] aspect-square bg-white p-1 rounded flex items-center justify-center overflow-hidden">
            <img
              src={upiQr.url}
              alt="SVJ Plus payment QR code"
              width={669}
              height={610}
              loading="eager"
              decoding="sync"
              draggable={false}
              className="w-full h-full object-contain select-none [image-rendering:-webkit-optimize-contrast]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <p className="text-[11px] text-[#8C8C90] font-inter">
          Scan with GPay, PhonePe, Paytm or any UPI App
        </p>

        <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 text-left text-xs text-zinc-300 space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Lifetime SVJ Plus Access</span>
          </div>
          <p className="text-[11px] text-[#8C8C90] leading-relaxed">
            After paying, contact us to activate your account. Access is granted manually after
            payment verification — not automatically.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleContactSupport}
          className="w-full py-3.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#C81E3A]/30 cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Request Upgrade</span>
        </motion.button>

        <p className="text-[10px] font-mono text-[#8C8C90]">
          After paying via UPI, tap above to message us on WhatsApp with your payment screenshot.
          Your account will be activated within 24 hours.
        </p>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full text-[11px] font-mono text-[#8C8C90] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </motion.div>
    </div>
  );
};
