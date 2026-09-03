// ============================================================================
// WhatsApp click-to-chat configuration — single source of truth.
//
// Never use api.whatsapp.com. Always use wa.me for Android deep-link + web
// fallback. Do not expose payment secrets.
// ============================================================================

/** Founder's WhatsApp number (normalized: no +, spaces, brackets, or dashes). */
export const SVJ_WHATSAPP_NUMBER = "917639662008";

/**
 * Build a WhatsApp click-to-chat URL using wa.me.
 * Opens the WhatsApp app on Android/Capacitor when available; falls back to web.
 */
export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${SVJ_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Native app deep link (Android/iOS) — opens the installed WhatsApp directly. */
export function buildWhatsAppAppUrl(message: string): string {
  return `whatsapp://send?phone=${SVJ_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
}

/** WhatsApp Web link — loads normally on desktop, no redirect hop. */
export function buildWhatsAppWebUrl(message: string): string {
  return `https://web.whatsapp.com/send?phone=${SVJ_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Best URL for the current platform:
 * - native shell / mobile browser → wa.me (opens the app, web fallback)
 * - desktop browser → web.whatsapp.com (wa.me redirects desktop traffic to a
 *   page that refuses to load inside embedded/preview windows)
 */
export function resolveWhatsAppUrl(message: string, isNative = false): string {
  if (isNative || isMobileUserAgent()) return buildWhatsAppUrl(message);
  return buildWhatsAppWebUrl(message);
}

/** Contact support message after completing SVJ Plus payment. */
export function buildPlusActivationMessage(user: {
  name: string;
  email?: string;
  id: string;
}): string {
  return (
    `Hi SVJ Founder, I have completed my SVJ Plus payment and would like to verify and activate my subscription.\n\n` +
    `Name: ${user.name}\n` +
    `Email: ${user.email || "N/A"}\n` +
    `SVJ User ID: ${user.id}\n\n` +
    `Please verify my payment and activate SVJ Plus.`
  );
}

/** Simple payment confirmation message (for UPI/trial flows). */
export function buildPaymentConfirmationMessage(email?: string | null): string {
  return `Hi SVJ Founder, I have completed my SVJ Plus payment and would like to verify and activate my subscription.\n\nEmail: ${email || "(not signed in)"}\n\nPlease verify my payment and activate SVJ Plus.`;
}
