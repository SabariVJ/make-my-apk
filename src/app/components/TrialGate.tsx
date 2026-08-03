import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { getTrialStatus, unlockPlus } from '@/lib/trial.functions';
import { AuthScreen } from './AuthScreen';
import { TrialExpiredScreen } from './TrialExpiredScreen';

const Splash: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
    <p className="text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">{label}</p>
  </div>
);

export const TrialGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const queryClient = useQueryClient();

  const fetchStatus = useServerFn(getTrialStatus);
  const doUnlock = useServerFn(unlockPlus);

  // ── Native deep-link handler ──────────────────────────────────────────────
  // When Google OAuth completes on Android/iOS it redirects to:
  //   app.lovable.svj://auth/callback#access_token=...&refresh_token=...
  // We catch that URL, extract the tokens, set the Supabase session, and close
  // the in-app browser that was opened by the Capacitor Browser plugin.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('app.lovable.svj://auth/callback')) return;

      // Tokens arrive in the URL fragment, e.g. #access_token=...&refresh_token=...
      const fragment = url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }

      // Dismiss the in-app browser window
      await Browser.close();
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  // ── Supabase auth state ───────────────────────────────────────────────────
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
      queryClient.invalidateQueries({ queryKey: ['trial-status'] });
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const statusQuery = useQuery({
    queryKey: ['trial-status', userId],
    queryFn: () => fetchStatus({}),
    enabled: Boolean(userId),
    // Re-checked on every app open, tab focus and reconnect — never cached stale.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  if (!sessionReady) return <Splash label="Loading SVJ" />;
  if (!session) return <AuthScreen />;
  if (statusQuery.isPending) return <Splash label="Checking your trial" />;

  if (statusQuery.isError) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-anton uppercase tracking-wider">Could not verify your membership</p>
        <button
          onClick={() => statusQuery.refetch()}
          className="px-4 py-2 rounded-xl bg-[#C81E3A] text-white font-mono text-xs cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const status = statusQuery.data;

  if (status.locked) {
    return (
      <TrialExpiredScreen
        email={status.email}
        onUnlock={async () => {
          await doUnlock({});
          await queryClient.invalidateQueries({ queryKey: ['trial-status'] });
          await statusQuery.refetch();
        }}
        onSignOut={async () => {
          await queryClient.cancelQueries();
          queryClient.clear();
          await supabase.auth.signOut();
        }}
      />
    );
  }

  return <>{children}</>;
};
