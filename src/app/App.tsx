import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SVJProvider, useSVJ } from "./context/SVJContext";
import { Header } from "./components/Header";
import { Navigation, ActiveTab } from "./components/Navigation";
import { ChallengesView } from "./views/ChallengesView";
import { WorkoutView } from "./views/WorkoutView";
import { NutritionView } from "./views/NutritionView";
import { CommunityView } from "./views/CommunityView";
import { LeaderboardView } from "./views/LeaderboardView";
import { SixtyDayChallengeView } from "./views/SixtyDayChallengeView";
import { ProfileView } from "./views/ProfileView";
import { MemberProfileModal } from "./components/MemberProfileModal";
import { XPComparisonModal } from "./components/XPComparisonModal";
import { EditProfileModal } from "./components/EditProfileModal";
import { LevelUpModal } from "./components/LevelUpModal";
import { UPIPaymentModal } from "./components/UPIPaymentModal";
import { PaywallModal } from "./components/PaywallModal";
import { FirstTimeOnboardingModal } from "./components/FirstTimeOnboardingModal";
import { DarkCinematicOnboardingModal } from "./components/DarkCinematicOnboardingModal";
import { GoogleAuthModal } from "./components/GoogleAuthModal";
import { RedeemPlusCodeForm } from "./components/RedeemPlusCodeForm";
import { NativeBannerAd } from "./components/NativeBannerAd";
import { TrialGate } from "./components/TrialGate";
import { getMissingSupabaseEnv, hasSupabaseConfig, supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Shown instead of crashing (white screen / generic error page) when the
// running environment has no Supabase backend config yet — e.g. a preview
// sandbox that has not had VITE_SUPABASE_PUBLISHABLE_KEY set. Lists exactly
// which variable(s) are missing so it is actionable, and keeps the dark SVJ
// shell as the first paint.
const ConfigMissingScreen: React.FC = () => {
  const missing = getMissingSupabaseEnv();
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="font-anton text-2xl uppercase tracking-wider">SVJ</div>
      <p className="text-sm text-[#8C8C90] max-w-sm font-mono">
        Backend configuration is missing
        {missing.length > 0 ? ` (${missing.join(", ")})` : ""}.
      </p>
      <p className="text-[11px] font-mono text-[#8C8C90] max-w-sm">
        Set the missing variable(s) in the project's environment / API keys and restart the preview.
        The app will load here once Supabase is connected.
      </p>
    </div>
  );
};

const AppContent: React.FC<{
  locked?: boolean;
  lockEmail?: string | null;
}> = ({ locked = false, lockEmail = null }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(locked ? "sixty" : "challenges");
  const [showTrialNotice, setShowTrialNotice] = useState(locked);
  const isAndroid = Capacitor.getPlatform() === "android";

  useEffect(() => {
    setShowTrialNotice(locked);
  }, [locked]);

  const {
    user,
    profileLoaded,
    comparingMember,
    setComparingMember,
    selectedMemberModal,
    setSelectedMemberModal,
    setIsPaywallOpen,
    isDarkOnboardingOpen,
    setIsDarkOnboardingOpen,
  } = useSVJ();
  const queryClient = useQueryClient();

  // Show a splash while the user profile is being synced from localStorage or
  // the Supabase session. Without this, a fresh sign-in (or session restore on
  // a new device) would briefly render INITIAL_USER (0 XP, "New Voyager") as
  // if it were the real authenticated user.
  if (!profileLoaded) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
        <p className="text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">Loading SVJ</p>
      </div>
    );
  }

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === "signout") {
      void (async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      })();
      return;
    }
    if (tab === "plus") {
      // Google Play release: external UPI purchasing is unavailable on Android.
      if (!isAndroid) setIsPaywallOpen(true);
    } else if (locked && tab !== "sixty" && tab !== "redeem" && tab !== "profile") {
      // Restricted shell: only sixty, redeem, and profile are allowed.
      return;
    } else {
      setActiveTab(tab);
    }
  };

  if (locked) {
    // ── Restricted post-trial shell ──────────────────────────────────────
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] font-inter antialiased selection:bg-[#C81E3A] selection:text-white">
        <Header />

        {/* Trial-expired notice modal — shown once on first render */}
        {showTrialNotice && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-expired-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95"
          >
            <div className="w-full max-w-sm rounded-3xl bg-[#121214] border border-white/10 p-6 shadow-2xl space-y-5 text-center">
              <h2
                id="trial-expired-title"
                className="font-anton text-xl uppercase tracking-wider text-white"
              >
                Your 7-Day Trial Has Ended
              </h2>
              <p className="text-xs font-mono text-[#8C8C90] leading-relaxed">
                {isAndroid
                  ? "Full SVJ access is now locked. You can continue the 60-Day Challenge, redeem a reward code, or manage your profile."
                  : "Full SVJ access is now locked. You can continue the 60-Day Challenge, redeem a reward code, manage your profile, or upgrade to SVJ Plus."}
              </p>
              <div className="space-y-2.5">
                {!isAndroid && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowTrialNotice(false);
                      setIsPaywallOpen(true);
                    }}
                    className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton uppercase tracking-wider text-xs cursor-pointer"
                  >
                    Explore SVJ Plus
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTrialNotice(false)}
                  className="w-full py-3 rounded-xl border border-white/15 text-[#8C8C90] hover:text-white font-mono text-xs cursor-pointer"
                >
                  Continue in Limited Mode
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="max-w-4xl mx-auto px-4 pt-4 sm:px-6">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-4">
            <p className="font-anton text-sm uppercase tracking-wider text-amber-300">
              Your 7-Day Trial Has Ended
            </p>
            <p className="text-[11px] font-mono text-[#8C8C90] mt-1 leading-relaxed">
              Full SVJ access is locked. You can still complete the 60-Day Challenge, redeem a
              reward code, manage your profile or sign out.
            </p>
          </div>
          {activeTab === "sixty" && <SixtyDayChallengeView />}
          {activeTab === "redeem" && (
            <div className="space-y-4">
              <h2 className="font-anton text-xl uppercase tracking-wider text-white">
                Redeem Code
              </h2>
              <p className="text-xs text-[#8C8C90] font-inter">
                Enter the code earned by completing all 60 days to unlock SVJ Plus for 2 months.
              </p>
              <RedeemPlusCodeForm />
            </div>
          )}
          {activeTab === "profile" && <ProfileView />}
        </main>

        <Navigation activeTab={activeTab} setActiveTab={handleTabChange} restricted />

        {/* Global Modals still available in restricted shell */}
        {!isAndroid && (
          <>
            <UPIPaymentModal />
            <PaywallModal />
          </>
        )}
        <EditProfileModal />
        <GoogleAuthModal />

        {/* AdMob banner — only for non-premium users after the real UI loads */}
        <NativeBannerAd enabled={!user.isPremium} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] font-inter antialiased selection:bg-[#C81E3A] selection:text-white">
      {/* Top Bar Header */}
      <Header />

      {/* Main View Area */}
      <main className="max-w-4xl mx-auto px-4 pt-4 sm:px-6">
        {activeTab === "challenges" && (
          <ChallengesView onOpenSixtyDay={() => handleTabChange("sixty")} />
        )}
        {activeTab === "workouts" && <WorkoutView />}
        {activeTab === "nutrition" && <NutritionView />}
        {activeTab === "community" && <CommunityView />}
        {activeTab === "leaderboard" && <LeaderboardView />}
        {activeTab === "sixty" && <SixtyDayChallengeView />}
        {activeTab === "profile" && <ProfileView />}
      </main>

      {/* Global Modals & Overlays */}
      <MemberProfileModal
        member={selectedMemberModal}
        onClose={() => setSelectedMemberModal(null)}
        onCompare={(member) => {
          setSelectedMemberModal(null);
          setComparingMember(member);
        }}
      />

      <XPComparisonModal member={comparingMember} onClose={() => setComparingMember(null)} />

      <EditProfileModal />
      <LevelUpModal />
      {!isAndroid && (
        <>
          <UPIPaymentModal />
          <PaywallModal />
        </>
      )}
      <FirstTimeOnboardingModal />
      <GoogleAuthModal />
      <DarkCinematicOnboardingModal
        isOpen={isDarkOnboardingOpen}
        onClose={() => setIsDarkOnboardingOpen(false)}
      />

      {/* Bottom Sticky Navigation Bar */}
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />

      {/* AdMob banner — only for non-premium users after the real UI loads */}
      <NativeBannerAd enabled={!user.isPremium} />
    </div>
  );
};

export default function App() {
  if (!hasSupabaseConfig()) return <ConfigMissingScreen />;
  return (
    <TrialGate>
      {(status) => (
        // status comes from the server-side getTrialStatus check, so isPremium
        // mirrors the authoritative Plus state in BOTH directions (active or
        // expired) instead of trusting what localStorage may have persisted.
        <SVJProvider
          plusActive={status?.plusActive ?? null}
          isPlusMember={status?.isPlusMember ?? null}
          plusExpiresAt={status?.plusExpiresAt ?? null}
        >
          <AppContent locked={status?.locked} lockEmail={status?.email} />
        </SVJProvider>
      )}
    </TrialGate>
  );
}
