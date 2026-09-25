import React from "react";
import { motion } from "motion/react";
import { Lock, ShieldCheck, LogOut, ExternalLink } from "lucide-react";
import upiQr from "@/assets/upi-qr-clean.png.asset.json";
import { resolveWhatsAppUrl, buildPaymentConfirmationMessage } from "@/lib/whatsapp";

type Props = {
  email: string | null;
  onSignOut: () => void;
};

export const TrialExpiredScreen: React.FC<Props> = ({ email, onSignOut }) => {
  const handleContactSupport = () => {
    window.open(
      resolveWhatsAppUrl(buildPaymentConfirmationMessage(email)),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0B0B0C] p-4 font-inter text-[#F4F2ED]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="svj-radius-card svj-lit-top svj-elev-3 w-full max-w-md space-y-5 border border-white/[0.06] bg-[#17171A] p-5 text-center"
      >
        <div className="space-y-1">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/30 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#C81E3A]" />
          </div>
          <h1 className="pt-2 font-inter text-xl font-semibold tracking-tight text-[#F4F2ED]">
            Your free trial has ended
          </h1>
          <p className="text-[11px] font-inter text-[#8C8C90]">
            SVJ Plus continues everything you have built{email ? `, signed in as ${email}` : ""}.
          </p>
        </div>

        <div className="mx-auto inline-block rounded-2xl border-4 border-[#C81E3A] bg-white p-3 text-black shadow-2xl">
          <div className="w-[min(14rem,60vw)] aspect-square bg-white p-1 rounded-lg flex items-center justify-center overflow-hidden">
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

        <p className="font-inter text-[11px] text-[#8C8C90]">
          Scan with GPay, PhonePe, Paytm or any UPI app
        </p>

        <div className="svj-radius-row space-y-1 border border-white/[0.05] bg-[#08080A] p-3 text-left text-xs text-zinc-300">
          <div className="flex items-center gap-2 font-inter font-semibold text-emerald-400">
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
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3.5 font-inter text-sm font-semibold text-white shadow-lg shadow-[#C81E3A]/30 hover:bg-[#A0182E]"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Request Upgrade</span>
        </motion.button>

        <p className="text-[10px] font-inter leading-relaxed text-[#8C8C90]">
          After paying via UPI, tap above to message us on WhatsApp with your payment screenshot.
          Your account is activated manually within 24 hours.
        </p>

        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 py-2 font-inter text-[11px] text-[#8C8C90] hover:text-white"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </motion.div>
    </div>
  );
};
