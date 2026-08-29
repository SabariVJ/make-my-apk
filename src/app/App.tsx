import React, { useState } from "react";
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
import { TrialGate } from "./components/TrialGate";
import { getMissingSupabaseEnv, hasSupabaseConfig } from "@/integrations/supabase/client";
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

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("challenges");
  const {
    profileLoaded,
    comparingMember,
    setComparingMember,
    selectedMemberModal,
    setSelectedMemberModal,
    setIsPaywallOpen,
    isDarkOnboardingOpen,
    setIsDarkOnboardingOpen,
  } = useSVJ();

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
    if (tab === "plus") {
      setIsPaywallOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

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
      <UPIPaymentModal />
      <PaywallModal />
      <FirstTimeOnboardingModal />
      <GoogleAuthModal />
      <DarkCinematicOnboardingModal
        isOpen={isDarkOnboardingOpen}
        onClose={() => setIsDarkOnboardingOpen(false)}
      />

      {/* Bottom Sticky Navigation Bar */}
      <Navigation activeTab={activeTab} setActiveTab={handleTabChange} />
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
          <AppContent />
        </SVJProvider>
      )}
    </TrialGate>
  );
}
