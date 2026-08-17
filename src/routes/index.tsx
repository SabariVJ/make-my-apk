import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import SvjApp from "../app/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SVJ — Self-Improvement Challenges & Community" },
      {
        name: "description",
        content:
          "Take on daily discipline challenges, earn XP, climb the leaderboard and unlock rewards with the SVJ community.",
      },
      { property: "og:title", content: "SVJ — Self-Improvement Challenges & Community" },
      {
        property: "og:description",
        content:
          "Take on daily discipline challenges, earn XP, climb the leaderboard and unlock rewards with the SVJ community.",
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
