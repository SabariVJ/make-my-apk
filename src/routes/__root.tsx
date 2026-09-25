import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Compass, Home, RotateCw, TriangleAlert } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StatusScreen } from "../app/components/StatusScreen";

function NotFoundComponent() {
  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <StatusScreen
      testId="not-found-screen"
      icon={Compass}
      eyebrow="Error 404"
      title="Page not found"
      message="The page you're looking for doesn't exist or has been moved."
      primaryAction={{ label: "Go home", onClick: goHome, icon: Home }}
    >
      {/* Keeps the SPA navigation path available for in-app links. */}
      <Link
        to="/"
        className="block font-inter text-[11px] text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
      >
        Or navigate back to the app
      </Link>
    </StatusScreen>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <StatusScreen
      testId="crash-screen"
      icon={TriangleAlert}
      eyebrow="Something broke"
      title="This page didn't load"
      message="Something went wrong on our end. Try again, or head back home and pick up where you left off."
      primaryAction={{
        label: "Try again",
        icon: RotateCw,
        onClick: () => {
          router.invalidate();
          reset();
        },
      }}
      secondaryAction={{
        label: "Go home",
        icon: Home,
        onClick: () => {
          window.location.href = "/";
        },
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SVJ — Self-Improvement Challenges & Community" },
      {
        name: "description",
        content:
          "Take on daily discipline challenges, earn XP, climb the leaderboard and unlock rewards with the SVJ community.",
      },
      { name: "theme-color", content: "#0B0B0C" },
      { property: "og:title", content: "SVJ — Self-Improvement Challenges & Community" },
      {
        property: "og:description",
        content:
          "Take on daily discipline challenges, earn XP, climb the leaderboard and unlock rewards with the SVJ community.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "SVJ — Self-Improvement Challenges & Community" },
      {
        name: "twitter:description",
        content:
          "Take on daily discipline challenges, earn XP, climb the leaderboard and unlock rewards with the SVJ community.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a4af9dc5-6ae5-49c3-8cf3-cc1e3d898068/id-preview-d5d625fb--33b1119f-3051-482e-90aa-488c5d0681b3.lovable.app-1785576350170.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a4af9dc5-6ae5-49c3-8cf3-cc1e3d898068/id-preview-d5d625fb--33b1119f-3051-482e-90aa-488c5d0681b3.lovable.app-1785576350170.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700;800;900&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Critical inline background: keeps the SVJ dark shell visible from the
            very first paint, before the Tailwind stylesheet arrives. Without it
            the body defaults to white and flashes during any load. */}
        <style>{`html,body{background-color:#0B0B0C}`}</style>
        <HeadContent />
      </head>
      <body className="bg-svj-bg text-svj-text antialiased overflow-x-hidden">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
