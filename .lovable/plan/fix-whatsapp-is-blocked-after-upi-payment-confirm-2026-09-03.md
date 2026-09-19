# Fix: "WhatsApp is blocked" after UPI payment confirm

## What's actually happening

Nothing is wrong with your payment setup or the QR. The button opens a
`wa.me` link. On desktop, WhatsApp redirects `wa.me` to
`api.whatsapp.com/send/...`, and that page refuses to load when it is opened
from inside an embedded preview window — Chrome shows
`ERR_BLOCKED_BY_RESPONSE`. On a real phone or in the installed Android app the
same link opens WhatsApp fine, so this mostly bites in the Lovable preview and
on desktop browsers.

So: you aren't missing a config step — the link target needs to be
platform-aware, with a visible manual fallback.

## What to change

1. **Pick the right WhatsApp URL per platform** (in `src/lib/whatsapp.ts`)
   - Native Android/iOS: `whatsapp://send?phone=...&text=...` with `wa.me` fallback.
   - Desktop browser: `https://web.whatsapp.com/send?phone=...&text=...` (loads
     normally; no `api.whatsapp.com` redirect).
   - Mobile browser: keep `https://wa.me/...`.

2. **Open it in a way that can't be silently blocked** (in
   `src/app/components/UPIPaymentModal.tsx`)
   - Native: open through the Capacitor Browser plugin / system intent.
   - Web: `window.open(...)`; if it returns `null` (popup or frame blocked),
     don't just fail.

3. **Add an always-visible fallback panel after "Confirm"** instead of closing
   the modal immediately:
   - a real `<a href target="_blank" rel="noopener">Open WhatsApp</a>` link
     (a user-clicked anchor escapes the preview frame restriction),
   - a "Copy message" button that copies the verification text,
   - the support number shown as plain text so the user can message manually.

4. Keep the modal open until the user closes it, so the fallback stays
   reachable if the new tab was blocked.

## Not changing

Payment amount/flow, QR image, manual-verification wording, entitlement logic,
database, auth, Android config.

## How you'll verify

- In preview: click Confirm → fallback panel appears with a clickable
  "Open WhatsApp" link and a working Copy button; no blank blocked tab as the
  only outcome.
- On the phone build: Confirm opens the WhatsApp app with the message
  pre-filled.
