import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/auth/callback')({
  head: () => ({
    meta: [
      { title: 'Signing you in — SVJ' },
      { name: 'description', content: 'Completing your SVJ sign-in and returning you to the app.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Signing you in — SVJ' },
      { property: 'og:description', content: 'Completing your SVJ sign-in and returning you to the app.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  useEffect(() => {
    window.location.href = 'app.lovable.svj://auth/callback' + window.location.search;
  }, []);

  return null;
}