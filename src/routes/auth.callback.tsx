import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Signing you in — SVJ" },
      { name: "description", content: "Completing your SVJ sign-in and returning you to the app." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Signing you in — SVJ" },
      {
        property: "og:description",
        content: "Completing your SVJ sign-in and returning you to the app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  useEffect(() => {
    // Forward BOTH search and hash: Supabase delivers the PKCE `code` in the
    // query string, but implicit-flow tokens (or a provider `error`) can arrive
    // in the fragment. Dropping the hash previously left the deep link bare,
    // which surfaced as "Google sign-in did not return a session." on native.
    window.location.href =
      "app.lovable.svj://auth/callback" + window.location.search + window.location.hash;
  }, []);

  return null;
}
