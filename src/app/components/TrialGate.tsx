import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
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
