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
 * Lazy AdMob banner that follows the UMP consent flow:
 * 1. Initialize AdMob
 * 2. Request consent info
 * 3. Show consent form if REQUIRED
 * 4. Only request banner if canRequestAds is true
 *
 * Renders null — side-effect-only component.
 * Must be placed inside AppContent AFTER profileLoaded is true.
 */

const AD_UNIT_ID = "ca-app-pub-1475355973043918/9002240668";

let admobInitialized = false;

/**
 * Show the Google privacy options form so the user can modify ad consent.
 * Called from Profile "Privacy choices" button. Safe to call multiple times.
 */
export async function showPrivacyChoices(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.showPrivacyOptionsForm();
  } catch (err) {
    console.warn("[NativeBannerAd] privacy options form failed:", err);
  }
}

/**
 * Request UMP consent info and show the consent form if required.
 * Returns true when ads are allowed after consent handling.
 */
async function handleConsentFlow(): Promise<boolean> {
  try {
    const info: AdmobConsentInfo = await AdMob.requestConsentInfo();

    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      const afterConsent = await AdMob.showConsentForm();
      return afterConsent.canRequestAds;
    }

    return info.canRequestAds;
  } catch (err) {
    // Consent request failed — fall through to block ad requests
    // This is the safe default: no ads without confirmed consent.
    console.warn("[NativeBannerAd] consent flow failed:", err);
    return false;
  }
}

export function NativeBannerAd({ enabled }: { enabled: boolean }) {
  const bannerShownRef = useRef(false);
  const consentHandledRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!enabled) {
      // Hide + remove if the banner was previously shown
      if (bannerShownRef.current) {
        bannerShownRef.current = false;
        void AdMob.hideBanner().catch(() => {});
        void AdMob.removeBanner().catch(() => {});
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

        // Run consent flow once per initialization
        if (!consentHandledRef.current) {
          consentHandledRef.current = true;
          const canRequest = await handleConsentFlow();
          if (!canRequest) {
            console.info("[NativeBannerAd] consent not granted — no banner shown");
            return;
          }
        }

        if (cancelled) return;

        await AdMob.showBanner({
          adId: AD_UNIT_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 72,
        });

        if (!cancelled) {
          bannerShownRef.current = true;
        }
      } catch (err) {
        console.warn("[NativeBannerAd] AdMob init/show failed:", err);
      }
    };

    void show();

    return () => {
      cancelled = true;
      if (bannerShownRef.current) {
        bannerShownRef.current = false;
        void AdMob.hideBanner().catch(() => {});
        void AdMob.removeBanner().catch(() => {});
      }
    };
  }, [enabled]);

  return null;
}
