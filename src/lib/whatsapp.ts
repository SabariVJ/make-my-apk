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
