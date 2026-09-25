import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { SVJProvider, useSVJ } from "./context/SVJContext";
import { EngagementProvider } from "./context/EngagementContext";
import { ActivityProvider } from "./context/ActivityContext";
import { Header } from "./components/Header";
import { Navigation, ActiveTab } from "./components/Navigation";
import { UtilityRail, UtilityDrawer } from "./components/UtilityNav";
import { ChallengesView } from "./views/ChallengesView";
import { ActivityView } from "./views/ActivityView";
import { EarnPlusView } from "./views/EarnPlusView";
import { WorkoutView } from "./views/WorkoutView";
import { NutritionView } from "./views/NutritionView";
import { CommunityView } from "./views/CommunityView";
import { LeaderboardView } from "./views/LeaderboardView";
import { SixtyDayChallengeView } from "./views/SixtyDayChallengeView";
import { SvjPlanView } from "./views/SvjPlanView";
import { TransformationReportView } from "./views/TransformationReportView";
import { ProfileView } from "./views/ProfileView";
import { RecoveryView } from "./components/RecoveryView";
import { MemberProfileModal } from "./components/MemberProfileModal";
import { XPComparisonModal } from "./components/XPComparisonModal";
import { EditProfileModal } from "./components/EditProfileModal";
import { LevelUpModal } from "./components/LevelUpModal";
import { UPIPaymentModal } from "./components/UPIPaymentModal";
import { PaywallModal } from "./components/PaywallModal";
import { FirstTimeOnboardingModal } from "./components/FirstTimeOnboardingModal";
import { GoogleAuthModal } from "./components/GoogleAuthModal";
import { RedeemPlusCodeForm } from "./components/RedeemPlusCodeForm";
import { NativeBannerAd } from "./components/NativeBannerAd";
import { TrialGate } from "./components/TrialGate";
import { StatusScreen } from "./components/StatusScreen";
import { NotificationCoordinator } from "./components/NotificationCoordinator";
import { getMissingSupabaseEnv, hasSupabaseConfig, supabase } from "@/integrations/supabase/client";
import { isFounderAccount } from "./lib/founderGate";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, WifiOff, RotateCw, LogIn } from "lucide-react";
import { useOnlineStatus } from "./lib/useOnlineStatus";
import {
  installSessionExpiryWatcher,
  markIntentionalSignOut,
  subscribeToSessionExpiry,
} from "./lib/sessionExpired";

/**
 * One page container for every screen.
 *
 * Responsive density rule: the shell owns the padding and the vertical
 * clearance for the fixed bottom navigation, so no view adds its own
 * horizontal padding or its own `pb-24/28/32` — that duplication is what made
 * screens unevenly spaced and pushed actions below the fold.
 *
 * Width: full-bleed on phones, fluid on tablets, and on desktop the content
 * box grows to ~1264px (86rem minus the 7rem utility-rail reservation) so the
 * app stops rendering a narrow mobile column inside a wide window.
 */
const PAGE_CONTAINER =
  "mx-auto w-full px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-4";
/** Desktop content box + the right-side reservation that keeps the rail off content. */
const PAGE_CONTAINER_DESKTOP = "lg:max-w-[86rem] lg:pr-28";

// Shown instead of crashing (white screen / generic error page) when the
// running environment has no Supabase backend config yet — e.g. a preview
// sandbox that has not had VITE_SUPABASE_PUBLISHABLE_KEY set. Lists exactly
// which variable(s) are missing so it is actionable, and keeps the dark SVJ
// shell as the first paint.
const ConfigMissingScreen: React.FC = () => {
  const missing = getMissingSupabaseEnv();
  return (
    <div className="min-h-[100dvh] bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="font-anton text-2xl tracking-wide">SVJ</div>
      <p className="max-w-sm font-inter text-sm text-[#8C8C90]">
        Backend configuration is missing
        {missing.length > 0 ? ` (${missing.join(", ")})` : ""}.
      </p>
      <p className="max-w-sm font-inter text-[11px] text-[#8C8C90]">
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
  const [showTrialNotice, setShowTrialNotice] = useState(locked);
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const isAndroid = Capacitor.getPlatform() === "android";
  // Android Play: prevent stale tabs (community/leaderboard hidden on native)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (locked) return "sixty";
    return "challenges";
  });

  useEffect(() => {
    setShowTrialNotice(locked);
  }, [locked]);

  // Android Play: reset hidden tabs if they somehow become active
  useEffect(() => {
    if (isAndroid && activeTab === "leaderboard") {
      setActiveTab("challenges");
    }
  }, [activeTab, isAndroid]);

  const {
    user,
    profileLoaded,
    comparingMember,
    setComparingMember,
    selectedMemberModal,
    setSelectedMemberModal,
    setIsPaywallOpen,
    storageError,
  } = useSVJ();
  const queryClient = useQueryClient();

  // Founder-only staged rollout for Recovery V2. Uses the server-backed
  // profile flag and stays false until that profile has loaded, so the extra
  // destination can never flash from the INITIAL_USER placeholder.
  const founderRecoveryEnabled = isFounderAccount(user, profileLoaded);

  // Show a splash while the user profile is being synced from localStorage or
  // the Supabase session. Without this, a fresh sign-in (or session restore on
  // a new device) would briefly render INITIAL_USER (0 XP, "New Voyager") as
  // if it were the real authenticated user.
  if (!profileLoaded) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
        <p className="font-inter text-[11px] text-[#8C8C90]">Loading SVJ</p>
      </div>
    );
  }

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === "signout") {
      void (async () => {
        markIntentionalSignOut();
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      })();
      return;
    }
    if (tab === "plus") {
      setIsPaywallOpen(true);
    } else if (
      locked &&
      tab !== "sixty" &&
      tab !== "redeem" &&
      tab !== "profile" &&
      tab !== "earn"
    ) {
      // Free reward missions remain available after the trial, not premium tabs.
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

        {/* Renders nothing visually — schedules the notification plan. */}
        <NotificationCoordinator onNavigate={handleTabChange} />

        {/* Trial-expired notice modal — shown once on first render */}
        {showTrialNotice && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-expired-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95"
          >
            <div className="w-full max-w-sm space-y-5 svj-radius-card svj-elev-3 svj-lit-top border border-white/10 bg-[#17171A] p-6 text-center">
              <h2 id="trial-expired-title" className="font-anton text-xl tracking-wide text-white">
                Your 7-Day Trial Has Ended
              </h2>
              <p className="font-inter text-xs leading-relaxed text-[#8C8C90]">
                You can keep using Earn Plus daily missions, the 60-Day Challenge, reward codes, and
                your profile, or view SVJ Plus membership details.
              </p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowTrialNotice(false);
                    setActiveTab("earn");
                  }}
                  className="w-full rounded-xl border border-rose-400/30 bg-rose-950/20 py-3 text-sm font-semibold text-rose-200"
                >
                  Open Earn Plus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTrialNotice(false);
                    setIsPaywallOpen(true);
                  }}
                  className="w-full cursor-pointer svj-radius-row bg-[#C81E3A] py-3 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E]"
                >
                  Explore SVJ Plus
                </button>
                <button
                  type="button"
                  onClick={() => setShowTrialNotice(false)}
                  className="w-full cursor-pointer svj-radius-row border border-white/15 py-3 font-inter text-xs text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
                >
                  Continue in Limited Mode
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Same container as the main shell, minus the (absent) utility rail. */}
        <main className={`${PAGE_CONTAINER} max-w-4xl lg:max-w-6xl`}>
          {storageError && (
            <p
              role="alert"
              className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200"
            >
              {storageError}
            </p>
          )}
          <div className="mb-3 svj-radius-card border border-gold/30 bg-gold/10 p-3.5">
            <p className="font-inter text-sm font-semibold text-gold">Your 7-Day Trial Has Ended</p>
            <p className="mt-1 font-inter text-[11px] leading-relaxed text-[#8C8C90]">
              You can still use Earn Plus daily missions, complete the 60-Day Challenge, redeem a
              reward code, manage your profile or sign out.
            </p>
          </div>
          {activeTab === "sixty" && <SixtyDayChallengeView />}
          {activeTab === "plan" && (
            <SvjPlanView onNavigateToChallenges={() => handleTabChange("challenges")} />
          )}
          {activeTab === "transform" && <TransformationReportView />}
          {activeTab === "earn" && <EarnPlusView onBack={() => handleTabChange("sixty")} />}
          {activeTab === "redeem" && (
            <div className="space-y-4">
              <h2 className="font-anton text-xl tracking-wide text-white">Redeem Code</h2>
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
        {!isAndroid && <UPIPaymentModal />}
        <PaywallModal
          onOpenPlan={() => {
            setIsPaywallOpen(false);
            setActiveTab("plan");
          }}
        />
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
      <Header onOpenUtilityMenu={() => setUtilityMenuOpen(true)} />

      {/* Renders nothing visually — schedules the notification plan
          (daily/evening/training) via the existing native infrastructure. */}
      <NotificationCoordinator onNavigate={handleTabChange} />

      {/* Secondary destinations: right rail on desktop, drawer on phones. */}
      <UtilityRail activeTab={activeTab} setActiveTab={handleTabChange} />
      <UtilityDrawer
        open={utilityMenuOpen}
        onClose={() => setUtilityMenuOpen(false)}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
      />

      {/* Main View Area — the container reserves desktop width and the rail's
          right gutter so it can never cover content, and it alone owns the
          bottom-navigation clearance. Tab switches crossfade with a quick
          fade+slide. The animation wrapper is visual only: state lives in
          providers above it, so Activity tracking, workout recorders and
          native listeners are never reset. */}
      <main className={`${PAGE_CONTAINER} ${PAGE_CONTAINER_DESKTOP}`}>
        {storageError && (
          <p
            role="alert"
            className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200"
          >
            {storageError}
          </p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 34,
              opacity: { duration: 0.16 },
            }}
          >
            {activeTab === "challenges" && (
              <ChallengesView
                onOpenSixtyDay={() => handleTabChange("sixty")}
                onOpenEarnPlus={() => handleTabChange("earn")}
                onOpenActivity={() => handleTabChange("activity")}
              />
            )}
            {activeTab === "activity" && (
              <ActivityView hideRecoverySection={founderRecoveryEnabled} />
            )}
            {activeTab === "earn" && <EarnPlusView onBack={() => handleTabChange("challenges")} />}
            {activeTab === "workouts" && <WorkoutView />}
            {/* Founder-only staged rollout: Recovery as its own destination. */}
            {activeTab === "recovery" && (
              <RecoveryView onOpenPlan={() => handleTabChange("plan")} />
            )}
            {activeTab === "nutrition" && <NutritionView />}
            {activeTab === "community" && <CommunityView />}
            {activeTab === "leaderboard" && <LeaderboardView />}
            {activeTab === "sixty" && <SixtyDayChallengeView />}
            {activeTab === "plan" && (
              <SvjPlanView onNavigateToChallenges={() => handleTabChange("challenges")} />
            )}
            {activeTab === "transform" && <TransformationReportView />}
            {activeTab === "profile" && <ProfileView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Modals & Overlays */}
      <MemberProfileModal
        member={selectedMemberModal}
        onClose={() => setSelectedMemberModal(null)}
        onCompare={(member) => {
          // Never route a self-comparison into the rivalry modal — the modal
          // also guards, but the shared handler is the primary boundary.
          if (member.id === user.id) {
            setSelectedMemberModal(null);
            return;
          }
          setSelectedMemberModal(null);
          setComparingMember(member);
        }}
      />

      <XPComparisonModal member={comparingMember} onClose={() => setComparingMember(null)} />

      <EditProfileModal />
      <LevelUpModal />
      {!isAndroid && <UPIPaymentModal />}
      <PaywallModal
        onOpenPlan={() => {
          setIsPaywallOpen(false);
          setActiveTab("plan");
        }}
      />
      <FirstTimeOnboardingModal />
      <GoogleAuthModal />

      {/* Bottom Sticky Navigation Bar */}
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />

      {/* AdMob banner — only for non-premium users after the real UI loads */}
      <NativeBannerAd enabled={!user.isPremium} />
    </div>
  );
};

export default function App() {
  // Honor the OS "reduce motion" setting globally so every framer-motion
  // animation (tab transitions, cards, modals) collapses to fades/none
  // without touching each component individually.
  return (
    <MotionConfig reducedMotion="user">
      <AppRoot />
    </MotionConfig>
  );
}

function AppRoot() {
  // No-network gate: covers every blocking state the app can be in (auth,
  // trial check, app shell). Auto-dismisses when the browser reports online.
  const online = useOnlineStatus();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => subscribeToSessionExpiry(() => setSessionExpired(true)), []);

  // Catches background auth/401 failures that no component handles directly.
  useEffect(() => installSessionExpiryWatcher(), []);

  if (!online) {
    return (
      <StatusScreen
        testId="no-internet-screen"
        icon={WifiOff}
        eyebrow="Offline"
        title="No Internet"
        message="No connection — check your internet and try again."
        primaryAction={{
          label: "Retry",
          icon: RotateCw,
          onClick: () => {
            // Re-evaluate immediately; the listener still dismisses us
            // automatically the moment the connection returns.
            if (typeof navigator !== "undefined" && navigator.onLine) window.location.reload();
          },
        }}
      />
    );
  }

  if (sessionExpired && hasSupabaseConfig()) {
    return (
      <StatusScreen
        testId="session-expired-screen"
        icon={LogIn}
        eyebrow="Session"
        title="Session Expired"
        message="Your signed-in session is no longer valid. Log in again to continue where you left off."
        primaryAction={{
          label: "Log in again",
          icon: LogIn,
          onClick: () => {
            void (async () => {
              markIntentionalSignOut();
              await supabase.auth.signOut().catch(() => undefined);
              setSessionExpired(false);
            })();
          },
        }}
      />
    );
  }

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
          <EngagementProvider key={status?.userId ?? "signed-out"} userId={status?.userId ?? null}>
            <ActivityProvider userId={status?.userId ?? null}>
              <AppContent locked={status?.locked} lockEmail={status?.email} />
            </ActivityProvider>
          </EngagementProvider>
        </SVJProvider>
      )}
    </TrialGate>
  );
}
