import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import SvjApp from "../app/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZENEXIS — Ascend to Your Apex" },
      {
        name: "description",
        content:
          "Daily discipline challenges, gamified XP, workout logging, step tracking, and biometric recovery with the ZENEXIS athlete ecosystem.",
      },
      { property: "og:title", content: "ZENEXIS — Ascend to Your Apex" },
      {
        property: "og:description",
        content:
          "Daily discipline challenges, gamified XP, workout logging, step tracking, and biometric recovery with the ZENEXIS athlete ecosystem.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// Dark splash: the SVJ shell is dark from the very first paint (never white).
function Splash() {
  return <div className="min-h-screen bg-svj-bg" />;
}

function Index() {
  // ClientOnly is required: SVJProvider reads localStorage in its state
  // initializers, which must not run during SSR. The app itself is statically
  // imported so it is already in the entry bundle — no lazy chunk fetch means
  // no blank-app window on cold start. Tab navigation is pure React state, so
  // switching tabs never navigates, reloads, or blanks the shell.
  return (
    <ClientOnly fallback={<Splash />}>
      <SvjApp />
    </ClientOnly>
  );
}
