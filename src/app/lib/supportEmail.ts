import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";

export const SUPPORT_EMAIL = "sabarivj777@gmail.com";
export const SUPPORT_SUBJECT = "SVJ Support / Account Verification";

export interface SupportEmailResult {
  ok: boolean;
  method: "native" | "web" | "copied" | "unavailable";
  error?: string;
}

interface VjSupportPlugin {
  openEmail(options: { to: string; subject: string; body?: string }): Promise<void>;
}

const VjSupport = registerPlugin<VjSupportPlugin>("VjSupport");

/** Build the Gmail web compose URL with safely encoded parameters. */
export function buildGmailComposeUrl(
  to: string = SUPPORT_EMAIL,
  subject: string = SUPPORT_SUBJECT,
): string {
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("to", to);
  url.searchParams.set("su", subject);
  return url.toString();
}

/** Build a standards-compliant mailto: URI with encoded params. */
export function buildMailtoUrl(
  to: string = SUPPORT_EMAIL,
  subject: string = SUPPORT_SUBJECT,
): string {
  const url = new URL(`mailto:${to}`);
  url.searchParams.set("subject", subject);
  return url.toString();
}

async function copyEmail(): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = SUPPORT_EMAIL;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Open the user's email client with SVJ support prefilled.
 * Never sends email automatically — the user must press Send.
 */
export async function openSupportEmail(
  subject: string = SUPPORT_SUBJECT,
): Promise<SupportEmailResult> {
  // 1. Native Android: real ACTION_SENDTO email intent via VjSupport plugin.
  if (Capacitor.isNativePlatform()) {
    try {
      await VjSupport.openEmail({ to: SUPPORT_EMAIL, subject });
      return { ok: true, method: "native" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Native failure (e.g. no email app installed) — offer copy fallback.
      const copied = await copyEmail();
      return {
        ok: copied,
        method: copied ? "copied" : "unavailable",
        error: copied ? undefined : message,
      };
    }
  }

  // 2. Web / browser preview: open Gmail compose from the user gesture.
  try {
    const composeUrl = buildGmailComposeUrl(SUPPORT_EMAIL, subject);
    const win = window.open(composeUrl, "_blank", "noopener,noreferrer");
    if (win) {
      return { ok: true, method: "web" };
    }
    // Popup blocked — try mailto as a secondary gesture-driven path.
    window.location.href = buildMailtoUrl(SUPPORT_EMAIL, subject);
    return { ok: true, method: "web" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const copied = await copyEmail();
    return {
      ok: copied,
      method: copied ? "copied" : "unavailable",
      error: copied ? undefined : message,
    };
  }
}

/** Copy the support address to the clipboard. */
export async function copySupportEmail(): Promise<boolean> {
  return copyEmail();
}
