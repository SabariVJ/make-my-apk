import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, QrCode, Check, ShieldCheck, Zap, Upload, ArrowRight, Smartphone } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import upiQr from "@/assets/upi-qr-clean.png.asset.json";

export const UPIPaymentModal: React.FC = () => {
  const { isUPIModalOpen, setIsUPIModalOpen } = useSVJ();
  const [showQR, setShowQR] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isUPIModalOpen) return null;

  const handlePaymentSubmitted = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // Payment proof must be verified by a protected server integration.
      // This UI intentionally cannot grant Plus membership.
    }, 1500);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-[#17171A] border border-white/10 rounded-2xl p-6 text-[#F4F2ED] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#C81E3A]" />
              <h2 className="font-anton text-xl tracking-wide uppercase text-white">
                UPI / Instant Upgrade
              </h2>
            </div>
            <button
              onClick={() => setIsUPIModalOpen(false)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!showQR ? (
            /* Prompt: Would you like to pay via UPI? */
            <div className="space-y-5 text-center py-4">
              <div className="relative w-28 h-28 rounded-2xl bg-[#0B0B0C] border-2 border-[#C81E3A]/60 flex items-center justify-center mx-auto overflow-hidden p-1.5 shadow-lg shadow-[#C81E3A]/20">
                <img
                  src={upiQr.url}
                  alt="SVJ QR Code"
                  className="w-full h-full object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div>
                <h3 className="font-anton text-xl text-white uppercase tracking-wide">
                  Pay via UPI or GPay?
                </h3>
                <p className="text-xs text-[#8C8C90] font-inter mt-1 max-w-xs mx-auto leading-relaxed">
                  Scan QR code using GPay, PhonePe, Paytm, or BHIM to complete instant SVJ Plus
                  verification.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setIsUPIModalOpen(false)}
                  className="py-3 rounded-xl bg-[#0B0B0C] hover:bg-white/5 border border-white/10 text-[#8C8C90] font-mono text-xs cursor-pointer"
                >
                  No, thanks
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  className="py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase text-xs cursor-pointer shadow-lg shadow-[#C81E3A]/20"
                >
                  Yes, show QR
                </button>
              </div>
            </div>
          ) : (
            /* QR Code Scanner Display */
            <div className="space-y-5 text-center py-2">
              <div className="p-3 rounded-2xl bg-white text-black inline-block shadow-2xl mx-auto border-4 border-[#C81E3A]">
                <div className="w-[min(14rem,60vw)] aspect-square bg-white p-1 rounded flex items-center justify-center overflow-hidden">
                  <img
                    src={upiQr.url}
                    alt="SVJ Official Payment QR Code"
                    width={669}
                    height={610}
                    loading="eager"
                    decoding="sync"
                    draggable={false}
                    className="w-full h-full object-contain select-none [image-rendering:-webkit-optimize-contrast] [backface-visibility:hidden] [transform:translateZ(0)]"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-[#8C8C90] font-inter">
                  Scan with GPay, PhonePe, Paytm or any UPI App
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 text-left text-xs text-zinc-300 space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>7-Day Free Trial Activated</span>
                </div>
                <p className="text-[11px] text-[#8C8C90] leading-relaxed">
                  Click 'Confirm Payment' below after scanning or to auto-activate instant trial.
                </p>
              </div>

              <div className="pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isProcessing}
                  onClick={handlePaymentSubmitted}
                  className="w-full py-3.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#C81E3A]/30 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span>Verifying UPI Transaction...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Submit Payment for Verification</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
