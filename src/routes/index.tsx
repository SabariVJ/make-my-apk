import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const SvjApp = lazy(() => import("../app/App"));

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

function Splash() {
  return <div className="min-h-screen bg-svj-bg" />;
}

function Index() {
  return (
    <ClientOnly fallback={<Splash />}>
      <Suspense fallback={<Splash />}>
        <SvjApp />
      </Suspense>
    </ClientOnly>
  );
}
