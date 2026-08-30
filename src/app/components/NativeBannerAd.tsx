import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { AdMob, BannerAdPosition, BannerAdSize } from "@capacitor-community/admob";

/**
 * Lazy AdMob banner that only initializes and shows after the main application
 * is mounted. Renders null — this is a side-effect-only component.
 *
 * Must be placed inside AppContent AFTER profileLoaded is true so the banner
 * never overlays the TrialGate / loading / auth screens.
 */

const AD_UNIT_ID = "ca-app-pub-1475355973043918/9002240668";

let admobInitialized = false;

export function NativeBannerAd({ enabled }: { enabled: boolean }) {
  const bannerShownRef = useRef(false);

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
