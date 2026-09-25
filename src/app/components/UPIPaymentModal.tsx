import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  QrCode,
  Check,
  ShieldCheck,
  Zap,
  Upload,
  ArrowRight,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import upiQr from "@/assets/upi-qr-clean.png.asset.json";
import { RedeemPlusCodeForm } from "./RedeemPlusCodeForm";
import {
  resolveWhatsAppUrl,
  buildWhatsAppAppUrl,
  buildWhatsAppWebUrl,
  buildActivationMailto,
  buildPaymentConfirmationMessage,
  formatWhatsAppNumber,
  SVJ_WHATSAPP_NUMBER,
} from "@/lib/whatsapp";

export const UPIPaymentModal: React.FC = () => {
  const { isUPIModalOpen, setIsUPIModalOpen } = useSVJ();
  const [showQR, setShowQR] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"upi" | "code">("upi");
  const [showContactFallback, setShowContactFallback] = useState(false);
  const [copied, setCopied] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);

  const supportMessage = buildPaymentConfirmationMessage();
  const isNative = Capacitor.isNativePlatform();
  const supportUrl = resolveWhatsAppUrl(supportMessage, isNative);
  const appUrl = buildWhatsAppAppUrl(supportMessage);
  const webUrl = buildWhatsAppWebUrl(supportMessage);
  const mailtoUrl = buildActivationMailto(supportMessage);

  if (!isUPIModalOpen || Capacitor.getPlatform() === "android") return null;

  const handleSimulatePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // Never auto-navigate on the web: popups and WhatsApp web can be blocked
      // by extensions, filters or embedded frames, leaving a dead tab.
      setShowContactFallback(true);
      if (isNative) {
        try {
          void import("@capacitor/browser").then(({ Browser }) =>
            Browser.open({ url: supportUrl }),
          );
        } catch {
          /* fallback panel already shown */
        }
      }
    }, 900);
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(supportMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(`+${SVJ_WHATSAPP_NUMBER}`);
      setNumberCopied(true);
      setTimeout(() => setNumberCopied(false), 2000);
    } catch {
      setNumberCopied(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="svj-radius-card svj-lit-top svj-elev-3 relative max-h-[90dvh] w-full max-w-md overflow-y-auto overflow-x-hidden border border-white/[0.06] bg-[#17171A] p-4 text-[#F4F2ED]"
        >
          {/* Header */}
          <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-[#C81E3A]" />
              <h2 className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]">
                SVJ Plus payment
              </h2>
            </div>
            <button
              onClick={() => setIsUPIModalOpen(false)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                setPaymentTab("upi");
                setShowQR(false);
              }}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 font-inter text-xs font-semibold transition-colors ${
                paymentTab === "upi"
                  ? "bg-[#C81E3A] text-white"
                  : "border border-white/[0.08] bg-[#08080A] text-[#8C8C90] hover:text-[#F4F2ED]"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              UPI
            </button>
            <button
              onClick={() => setPaymentTab("code")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 font-inter text-xs font-semibold transition-colors ${
                paymentTab === "code"
                  ? "bg-gold text-black"
                  : "border border-white/[0.08] bg-[#08080A] text-[#8C8C90] hover:text-[#F4F2ED]"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Redeem code
            </button>
          </div>

          {paymentTab === "code" ? (
            <div className="space-y-4 py-2">
              <p className="text-center font-inter text-xs text-[#8C8C90]">
                Enter the code earned by completing all 60 days to unlock SVJ Plus for 2 months.
              </p>
              <RedeemPlusCodeForm
                heading="Activate 60-Day Reward"
                description="Enter the code earned by completing all 60 days to unlock SVJ Plus for 2 months."
              />
            </div>
          ) : !showQR ? (
            /* Prompt: Would you like to pay via UPI? */
            <div className="space-y-5 text-center py-4">
              <div className="relative w-28 h-28 rounded-lg bg-[#0B0B0C] border-2 border-[#C81E3A]/60 flex items-center justify-center mx-auto overflow-hidden p-1.5 shadow-lg shadow-[#C81E3A]/20">
                <img
                  src={upiQr.url}
                  alt="SVJ QR Code"
                  className="w-full h-full object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div>
                <h3 className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]">
                  Pay with UPI?
                </h3>
                <p className="mx-auto mt-1 max-w-xs font-inter text-xs leading-relaxed text-[#8C8C90]">
                  Scan the code with GPay, PhonePe, Paytm or BHIM. SVJ Plus is activated only after
                  the payment is manually verified.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setIsUPIModalOpen(false)}
                  className="cursor-pointer rounded-xl border border-white/[0.08] bg-[#08080A] py-3 font-inter text-xs font-semibold text-[#8C8C90] hover:text-[#F4F2ED]"
                >
                  Not now
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  className="cursor-pointer rounded-xl bg-[#C81E3A] py-3 font-inter text-xs font-semibold text-white shadow-lg shadow-[#C81E3A]/20 hover:bg-[#A0182E]"
                >
                  Show the QR code
                </button>
              </div>
            </div>
          ) : (
            /* QR Code Scanner Display */
            <div className="space-y-5 text-center py-2">
              <div className="p-3 rounded-2xl bg-white text-black inline-block shadow-2xl mx-auto border-4 border-[#C81E3A]">
                <div className="w-[min(14rem,60vw)] aspect-square bg-white p-1 rounded-lg flex items-center justify-center overflow-hidden">
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
                <div className="font-inter text-[11px] text-[#8C8C90]">
                  Scan with GPay, PhonePe, Paytm or any UPI app
                </div>
              </div>

              <div className="svj-radius-row space-y-1 border border-white/[0.05] bg-[#08080A] p-3 text-left text-xs text-zinc-300">
                <div className="flex items-center gap-2 font-inter font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Activated by hand, never automatically</span>
                </div>
                <p className="font-inter text-[11px] leading-relaxed text-[#8C8C90]">
                  After paying, send support your UPI transaction reference. SVJ Plus is activated
                  only after the payment is manually verified.
                </p>
              </div>

              <div className="pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isProcessing}
                  onClick={handleSimulatePayment}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3.5 font-inter text-sm font-semibold text-white shadow-lg shadow-[#C81E3A]/30 hover:bg-[#A0182E] disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span>Preparing contact options...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>I've Paid — Contact Support</span>
                    </>
                  )}
                </motion.button>
              </div>

              {showContactFallback && (
                <div className="svj-radius-row mt-3 space-y-2.5 border border-white/[0.06] bg-[#08080A] p-3 text-left">
                  <p className="font-inter text-[11px] leading-relaxed text-[#8C8C90]">
                    Send us your payment details to activate SVJ Plus:
                  </p>
                  <a
                    href={isNative ? supportUrl : appUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-inter text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Open WhatsApp
                  </a>
                  <a
                    href={webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-xl border border-white/12 py-2.5 font-inter text-xs text-[#F4F2ED] transition-colors hover:bg-white/5"
                  >
                    Open in browser instead
                  </a>
                  <button
                    onClick={handleCopyMessage}
                    className="w-full cursor-pointer rounded-xl border border-white/12 py-2.5 font-inter text-xs text-[#F4F2ED] transition-colors hover:bg-white/5"
                  >
                    {copied ? "Message copied" : "Copy verification message"}
                  </button>
                  <button
                    onClick={handleCopyNumber}
                    className="w-full cursor-pointer select-text rounded-xl border border-white/12 py-2.5 font-inter text-xs text-[#F4F2ED] transition-colors hover:bg-white/5"
                  >
                    {numberCopied ? "Number copied" : `Copy number ${formatWhatsAppNumber()}`}
                  </button>
                  <a
                    href={mailtoUrl}
                    className="flex w-full items-center justify-center rounded-xl border border-white/12 py-2.5 font-inter text-xs text-[#8C8C90] transition-colors hover:bg-white/5 hover:text-[#F4F2ED]"
                  >
                    Email us instead
                  </a>
                  <p className="font-inter text-[11px] leading-relaxed text-[#8C8C90]">
                    If WhatsApp doesn&apos;t open, message{" "}
                    <span className="select-all font-mono text-[#F4F2ED]">
                      {formatWhatsAppNumber()}
                    </span>{" "}
                    from your phone with the copied text.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
