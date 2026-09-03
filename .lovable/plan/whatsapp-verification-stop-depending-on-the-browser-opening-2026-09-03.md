# WhatsApp verification: stop depending on the browser opening WhatsApp

## What the screenshot actually shows

`web.whatsapp.com` returns `ERR_BLOCKED_BY_RESPONSE` in your Chrome — the same
way `api.whatsapp.com` did earlier. Both are WhatsApp's own domains, opened as a
real top-level tab with `noopener`, so this is not the app's link construction.
Something on your side (extension, security software, or network/DNS filter) is
refusing WhatsApp web endpoints. Nothing in the code can un-block that domain.

So the fix is not "find the right WhatsApp URL" — it is making payment
verification work even when WhatsApp web is unreachable.

## What to change

1. **Primary path stays the WhatsApp app, not the web page**
   - On desktop, offer `whatsapp://send?phone=...&text=...` (opens WhatsApp
     Desktop if installed) as the first button, with `web.whatsapp.com` demoted
     to a secondary "open in browser instead" link.
   - Mobile / native shell keeps `wa.me` as today.

2. **Always-visible manual fallback in the payment modal**
   - Show the support number `+91 76396 62008` as selectable text with a copy
     button.
   - Keep the prefilled verification message with a copy button (already
     present) so it can be pasted into WhatsApp opened by any means.
   - Add a short line: "If WhatsApp doesn't open, message this number from your
     phone with the copied text."

3. **Second contact channel**
   - Add a `mailto:` link with the same subject/body (name, email, user ID) so a
     user with WhatsApp blocked can still request activation.

4. **No silent failure**
   - Removing any auto-navigation attempt that leaves a blank/blocked tab; the
     modal stays open with the fallback panel, as it does now.

## Technical details

- `src/lib/whatsapp.ts`: keep `buildWhatsAppAppUrl`; change `resolveWhatsAppUrl`
  desktop branch usage so the UI can present app-scheme first, web second. Add
  `buildActivationMailto(user)` returning the `mailto:` URL.
- `src/app/components/UPIPaymentModal.tsx`: fallback panel gains the app-scheme
  button, the copyable phone number, and the email fallback link.
- `src/app/components/TrialExpiredScreen.tsx`: same set of contact options.
- No backend, auth, membership, Capacitor, or Android changes.

## Verification

- Preview: confirm modal shows copy-message, copy-number, WhatsApp app button,
  web link, and email link; confirm nothing auto-navigates the preview frame.
- Prettier + typecheck + existing tests.

## Your side (outside the app)

Try WhatsApp in an incognito window with extensions off, or on mobile data — if
it loads there, the block is a local extension or network filter.
