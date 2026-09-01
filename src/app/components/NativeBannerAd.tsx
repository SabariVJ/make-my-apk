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
 * AdMob banner with proper UMP consent flow:
 * 1. Initialize AdMob once
 * 2. On every banner request: re-read consent info, show form if REQUIRED
 * 3. Only showBanner when canRequestAds === true
 * 4. Serialize all async AdMob operations to prevent races
 * 5. Handle privacy choices by re-reading consent and updating banner
 *
 * Renders null — side-effect-only component.
 * Must be placed inside AppContent AFTER profileLoaded is true.
 */

const AD_UNIT_ID = "ca-app-pub-1475355973043918/9002240668";

let admobInitialized = false;

/** Serializes all AdMob async operations to prevent duplicate init/show/remove races. */
let pendingChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = pendingChain.then(fn, fn);
  pendingChain = next.catch(() => {});
  return next;
}

/**
 * Show the Google privacy options form so the user can modify ad consent.
 * Called from Profile "Privacy choices" button. Safe to call multiple times.
 * After the form closes, we re-read consent state and update the banner.
 */
export async function showPrivacyChoices(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await AdMob.showPrivacyOptionsForm();
    // After the privacy form closes, return true so the caller
    // can trigger a consent re-read.
    return true;
  } catch (err) {
    console.warn("[NativeBannerAd] privacy options form failed:", err);
    return false;
  }
}

/**
 * Read current consent state and show the form if required.
 * Returns the *updated* canRequestAds result.
 * Every call reads fresh state — no cached bypass.
 */
async function resolveConsent(): Promise<boolean> {
  try {
    const info: AdmobConsentInfo = await AdMob.requestConsentInfo();

    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      const afterConsent = await AdMob.showConsentForm();
      return afterConsent.canRequestAds;
    }

    return info.canRequestAds;
  } catch (err) {
    // Consent request failed — block ad requests (safe default).
    console.warn("[NativeBannerAd] consent flow failed:", err);
    return false;
  }
}

/** Safely hide and remove any existing banner, catching errors. */
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

export function NativeBannerAd({ enabled }: { enabled: boolean }) {
  const bannerActiveRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!enabled) {
      if (bannerActiveRef.current) {
        bannerActiveRef.current = false;
        void enqueue(() => cleanupBanner());
      }
      return;
    }

    let cancelled = false;

    const show = async () => {
      try {
        if (!admobInitialized) {
          await AdMob.initialize({});
          admobInitialized = true;
        }

        if (cancelled) return;

        // Always re-read consent — no cached bypass.
        const canRequest = await resolveConsent();
        if (!canRequest || cancelled) {
          console.info("[NativeBannerAd] consent not granted — no banner shown");
          return;
        }

        if (cancelled) return;

        // Clean up any stale banner before showing a new one.
        await cleanupBanner();

        await AdMob.showBanner({
          adId: AD_UNIT_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 72,
        });

        if (!cancelled) {
          bannerActiveRef.current = true;
        } else {
          // Banner arrived after cancellation — immediately remove.
          void enqueue(() => cleanupBanner());
        }
      } catch (err) {
        console.warn("[NativeBannerAd] AdMob init/show failed:", err);
      }
    };

    void enqueue(show);

    return () => {
      cancelled = true;
      if (bannerActiveRef.current) {
        bannerActiveRef.current = false;
        void enqueue(() => cleanupBanner());
      }
    };
  }, [enabled]);

  return null;
}
