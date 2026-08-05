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

    const email = ((context.claims['email'] as string | undefined) ?? '').toLowerCase() || null;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, signup_date, is_plus_member')
      .eq('id', context.userId)
      .maybeSingle();

    if (error) throw error;

    if (data) return buildStatus(await mergeSiblingAccounts(supabaseAdmin, context.userId, email, data));

    // Safety net for users created before the profiles trigger existed.
    const { data: created, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: context.userId,
        email,
      })
      .select('id, email, display_name, signup_date, is_plus_member')
      .single();

    if (insertError) throw insertError;
    return buildStatus(await mergeSiblingAccounts(supabaseAdmin, context.userId, email, created));
  });

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  signup_date: string;
  is_plus_member: boolean;
};

/**
 * Account unification for people who signed up with email/password and later
 * used "Continue with Google" (or vice versa) with the SAME email address.
 *
 * Supabase may mint a second auth user for the second provider. We cannot merge
 * auth rows server-side, so instead we keep every profile that shares an email
 * perfectly in sync: the oldest signup date wins, membership/XP/stats/tier are
 * carried over, and both rows are written back. The result is that signing in
 * with either provider lands on the exact same account data.
 */
async function mergeSiblingAccounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  email: string | null,
  self: ProfileRow,
): Promise<ProfileRow> {
  if (!email) return self;

  const { data: siblings } = await admin
    .from('profiles')
    .select(
      'id, email, display_name, signup_date, is_plus_member, plus_unlocked_at, username, avatar_url, total_xp, current_streak',
    )
    .ilike('email', email);

  if (!siblings || siblings.length < 2) return self;

  // Canonical record = richest/oldest across all rows sharing this email.
  const canonical = siblings.reduce(
    (acc: Record<string, unknown>, row: Record<string, unknown>) => ({
      signup_date:
        new Date(row['signup_date'] as string) < new Date(acc['signup_date'] as string)
          ? row['signup_date']
          : acc['signup_date'],
      is_plus_member: Boolean(acc['is_plus_member']) || Boolean(row['is_plus_member']),
      plus_unlocked_at: acc['plus_unlocked_at'] ?? row['plus_unlocked_at'] ?? null,
      display_name: acc['display_name'] ?? row['display_name'] ?? null,
      username: acc['username'] ?? row['username'] ?? null,
      avatar_url: acc['avatar_url'] ?? row['avatar_url'] ?? null,
      total_xp: Math.max(Number(acc['total_xp'] ?? 0), Number(row['total_xp'] ?? 0)),
      current_streak: Math.max(Number(acc['current_streak'] ?? 0), Number(row['current_streak'] ?? 0)),
    }),
    siblings[0] as Record<string, unknown>,
  );

  await admin.from('profiles').update(canonical).ilike('email', email);

  return {
    id: userId,
    email,
    display_name: (canonical['display_name'] as string | null) ?? null,
    signup_date: canonical['signup_date'] as string,
    is_plus_member: Boolean(canonical['is_plus_member']),
  };
}

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
