import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";
import type { AdmobConsentInfo } from "@capacitor-community/admob";

/**
 * AdMob banner with proper UMP consent flow — single unified lifecycle:
 *
 * - One serialized operation queue (enqueue).
 * - One generation counter that increments on every enabled→true transition.
 * - One desired-enabled flag so privacy-choice reconciliation respects
 *   the current mounted state.
 *
 * All operations (init, consent, show, hide, remove) go through the same
 * serialized path. No external function may directly hide/show banners.
 *
 * Renders null — side-effect-only component.
 * Must be placed inside AppContent AFTER profileLoaded is true.
 */

const AD_UNIT_ID = "ca-app-pub-1475355973043918/9002240668";

let admobInitialized = false;

// ── Serialized operation queue ──────────────────────────────────────────────
let pendingChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = pendingChain.then(fn, fn);
  pendingChain = next.catch(() => {});
  return next;
}

// ── Privacy-choices notification ────────────────────────────────────────────
// When the Profile "Privacy Choices" button is tapped, the user may revoke
// or grant consent. We notify the currently mounted banner controller so it
// can re-run its consent→show/hide logic through the normal lifecycle.
// No external function may directly show/hide/remove banners.
let _privacyChoicesVersion = 0;
let _privacyChoicesListeners: Array<() => void> = [];

/**
 * Called by Profile after showPrivacyOptionsForm closes.
 * Notifies the currently mounted NativeBannerAd to re-read consent.
 */
export async function showPrivacyChoices(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await AdMob.showPrivacyOptionsForm();
    // Notify all mounted listeners that consent may have changed.
    _privacyChoicesVersion++;
    for (const listener of _privacyChoicesListeners) listener();
    return true;
  } catch (err) {
    console.warn("[NativeBannerAd] privacy options form failed:", err);
    return false;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

async function resolveConsent(): Promise<boolean> {
  try {
    const info: AdmobConsentInfo = await AdMob.requestConsentInfo();
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      const afterConsent = await AdMob.showConsentForm();
      return afterConsent.canRequestAds;
    }
    return info.canRequestAds;
  } catch (err) {
    console.warn("[NativeBannerAd] consent flow failed:", err);
    return false;
  }
}

async function cleanupBanner(): Promise<void> {
  try {
    await AdMob.hideBanner();
  } catch {
    /* no banner active */
  }
  try {
    await AdMob.removeBanner();
  } catch {
    /* already removed */
  }
}

// ── Banner lifecycle ────────────────────────────────────────────────────────

/**
 * The full banner show/hide lifecycle, serialized through enqueue().
 * Returns true if a banner was placed, false otherwise.
 *
 * @param gen  The generation counter when this call was started.
 * @param getGen  Returns the current generation (may have advanced).
 * @param desiredEnabled  Whether the banner should be shown.
 */
async function bannerLifecycle(
  gen: number,
  getGen: () => number,
  desiredEnabled: boolean,
): Promise<boolean> {
  // If the desired state changed during the async flow, abort.
  if (gen !== getGen()) return false;

  if (!desiredEnabled) {
    await cleanupBanner();
    return false;
  }

  if (!admobInitialized) {
    await AdMob.initialize({});
    admobInitialized = true;
  }

  if (gen !== getGen()) return false;

  const canRequest = await resolveConsent();
  if (!canRequest || gen !== getGen()) {
    console.info("[NativeBannerAd] consent not granted — no banner shown");
    // If consent was denied, clean up any stale banner.
    if (gen === getGen()) await cleanupBanner();
    return false;
  }

  if (gen !== getGen()) return false;

  // Clean up before showing new banner.
  await cleanupBanner();

  // Recheck after async cleanup.
  if (gen !== getGen()) return false;

  await AdMob.showBanner({
    adId: AD_UNIT_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 72,
  });

  return gen === getGen();
}

// ── Component ───────────────────────────────────────────────────────────────

export function NativeBannerAd({ enabled }: { enabled: boolean }) {
  const generationRef = useRef(0);
  const bannerActiveRef = useRef(false);
  const desiredEnabledRef = useRef(enabled);

  // Keep desiredEnabled in sync with the prop.
  desiredEnabledRef.current = enabled;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const gen = ++generationRef.current;
    const getGen = () => generationRef.current;

    const run = async () => {
      try {
        const placed = await bannerLifecycle(gen, getGen, desiredEnabledRef.current);
        bannerActiveRef.current = placed;
      } catch (err) {
        console.warn("[NativeBannerAd] lifecycle failed:", err);
      }
    };

    void enqueue(run);

    // Subscribe to privacy-choices changes while this effect is active.
    const onPrivacyChange = () => {
      // Only reconcile if this generation is still current and banner is enabled.
      if (gen === getGen() && desiredEnabledRef.current) {
        const reconcileGen = gen;
        void enqueue(async () => {
          const placed = await bannerLifecycle(reconcileGen, getGen, true);
          bannerActiveRef.current = placed;
        });
      }
    };
    _privacyChoicesListeners.push(onPrivacyChange);

    return () => {
      // Remove listener.
      _privacyChoicesListeners = _privacyChoicesListeners.filter((l) => l !== onPrivacyChange);

      // Only clean up if this generation is still current.
      if (gen === getGen()) {
        bannerActiveRef.current = false;
        void enqueue(() => cleanupBanner());
      }
    };
  }, [enabled]);

  return null;
}
