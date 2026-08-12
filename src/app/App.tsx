import React, { useState } from "react";
import { SVJProvider, useSVJ } from "./context/SVJContext";
import { Header } from "./components/Header";
import { Navigation, ActiveTab } from "./components/Navigation";
import { ChallengesView } from "./views/ChallengesView";
import { WorkoutView } from "./views/WorkoutView";
import { NutritionView } from "./views/NutritionView";
import { CommunityView } from "./views/CommunityView";
import { LeaderboardView } from "./views/LeaderboardView";
import { RewardsView } from "./views/RewardsView";
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

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("challenges");
  const {
    comparingMember,
    setComparingMember,
    selectedMemberModal,
    setSelectedMemberModal,
    setIsPaywallOpen,
    isDarkOnboardingOpen,
    setIsDarkOnboardingOpen,
  } = useSVJ();

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
        {activeTab === "challenges" && <ChallengesView />}
        {activeTab === "workouts" && <WorkoutView />}
        {activeTab === "nutrition" && <NutritionView />}
        {activeTab === "community" && <CommunityView />}
        {activeTab === "leaderboard" && <LeaderboardView />}
        {activeTab === "rewards" && <RewardsView />}
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
  return (
    <TrialGate>
      <SVJProvider>
        <AppContent />
      </SVJProvider>
    </TrialGate>
  );
}
