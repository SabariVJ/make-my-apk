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
 * 3. Only showBanner when canRequestAds is true
 * 4. Serialize all async AdMob operations to prevent races
 * 5. Handle privacy choices by re-reading consent and updating the banner
 *
 * Cancellation ordering:
 *   - An old show operation must NOT remove a banner placed by a newer call.
 *   - We use a generation counter so stale cleanups skip if a newer show
 *     started.
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
 * Serialized through the same queue as banner operations.
 * After the form closes, re-read consent and update banner.
 */
/**
 * Trigger a consent re-read and banner update after the privacy form closes.
 * Hides the current banner, re-reads consent, and shows a new banner only
 * if consent still permits it.
 */
export async function reconcileAfterPrivacyChoices(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Use a unique generation so any stale in-flight show knows it's superseded.
  const gen = 0; // reconciliation uses its own ad-hoc generation
  void enqueue(async () => {
    await cleanupBanner();
    const canRequest = await resolveConsent();
    if (canRequest) {
      try {
        await AdMob.showBanner({
          adId: AD_UNIT_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 72,
        });
      } catch {
        /* banner not shown */
      }
    }
  });
}

export async function showPrivacyChoices(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await enqueue(() => AdMob.showPrivacyOptionsForm());
    return true;
  } catch (err) {
    console.warn("[NativeBannerAd] privacy options form failed:", err);
    return false;
  }
}

/**
 * Read current consent state and show the form if required.
 * Returns the updated canRequestAds result.
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
    console.warn("[NativeBannerAd] consent flow failed:", err);
    return false;
  }
}

/** Safely hide and remove any existing banner. */
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

/**
 * Canonical show-banner flow, called inside enqueue() for serialization.
 * `myGeneration` is incremented each time this flow is started by a new
 * effect run. Stale cleanups skip if a newer generation has started.
 */
async function showBannerFlow(myGeneration: number, getGeneration: () => number): Promise<boolean> {
  if (!admobInitialized) {
    await AdMob.initialize({});
    admobInitialized = true;
  }

  if (myGeneration !== getGeneration()) return false;

  // Always re-read consent — no cached bypass.
  const canRequest = await resolveConsent();
  if (!canRequest || myGeneration !== getGeneration()) {
    console.info("[NativeBannerAd] consent not granted — no banner shown");
    return false;
  }

  // Clean up any stale banner before showing a new one.
  // Only if we're still the current generation.
  if (myGeneration === getGeneration()) {
    await cleanupBanner();
  }

  // Recheck AFTER cleanup — cleanup is async, a newer show may have started.
  if (myGeneration !== getGeneration()) return false;

  await AdMob.showBanner({
    adId: AD_UNIT_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 72,
  });

  return myGeneration === getGeneration();
}

export function NativeBannerAd({ enabled }: { enabled: boolean }) {
  const bannerActiveRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!enabled) {
      if (bannerActiveRef.current) {
        bannerActiveRef.current = false;
        void enqueue(() => cleanupBanner());
      }
      return;
    }

    // Increment generation so any in-flight show from a prior effect
    // knows it is stale and must not set bannerActiveRef or remove
    // the banner that the NEW effect will show.
    const gen = ++generationRef.current;
    const getGen = () => generationRef.current;

    const run = async () => {
      try {
        const placed = await showBannerFlow(gen, getGen);
        if (placed) {
          bannerActiveRef.current = true;
        }
      } catch (err) {
        console.warn("[NativeBannerAd] AdMob init/show failed:", err);
      }
    };

    void enqueue(run);

    return () => {
      // Only clean up if this generation is still the current one.
      // If a newer effect started, the newer showBannerFlow will manage
      // its own banner and this cleanup must not remove it.
      if (gen === getGen()) {
        bannerActiveRef.current = false;
        void enqueue(() => cleanupBanner());
      }
    };
  }, [enabled]);

  return null;
}
