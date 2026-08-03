import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const TRIAL_DAYS = 7;

export type TrialStatus = {
  userId: string;
  email: string | null;
  displayName: string | null;
  signupDate: string;
  isPlusMember: boolean;
  dayOfTrial: number;
  daysLeft: number;
  locked: boolean;
};

function buildStatus(row: {
  id: string;
  email: string | null;
  display_name: string | null;
  signup_date: string;
  is_plus_member: boolean;
}): TrialStatus {
  const start = new Date(row.signup_date).getTime();
  const elapsedDays = Math.floor((Date.now() - start) / 86_400_000);
  const dayOfTrial = elapsedDays + 1;
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
  return {
    userId: row.id,
    email: row.email,
    displayName: row.display_name,
    signupDate: row.signup_date,
    isPlusMember: row.is_plus_member,
    dayOfTrial,
    daysLeft,
    locked: !row.is_plus_member && daysLeft <= 0,
  };
}

export const getTrialStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrialStatus> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, signup_date, is_plus_member')
      .eq('id', context.userId)
      .maybeSingle();

    if (error) throw error;

    if (data) return buildStatus(data);

    // Safety net for users created before the profiles trigger existed.
    const { data: created, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: context.userId,
        email: (context.claims['email'] as string | undefined) ?? null,
      })
      .select('id, email, display_name, signup_date, is_plus_member')
      .single();

    if (insertError) throw insertError;
    return buildStatus(created);
  });

export const unlockPlus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrialStatus> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_plus_member: true, plus_unlocked_at: new Date().toISOString() })
      .eq('id', context.userId)
      .select('id, email, display_name, signup_date, is_plus_member')
      .single();

    if (error) throw error;
    return buildStatus(data);
  });
