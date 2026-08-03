import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';

/**
 * The custom URL scheme registered in capacitor.config.ts (appId: "app.lovable.svj").
 * Supabase will redirect here after Google OAuth completes on native.
 */
const NATIVE_REDIRECT = 'app.lovable.svj://auth/callback';

/**
 * Trigger Google OAuth.
 *
 * - Native (Android/iOS via Capacitor): uses skipBrowserRedirect + Capacitor Browser plugin
 *   so the system browser opens, completes OAuth, then deep-links back to the app.
 * - Web: standard full-page redirect handled by Supabase.
 */
export async function signInWithGoogle(): Promise<{ error?: Error }> {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: NATIVE_REDIRECT,
      },
    });

    if (error) return { error };

    if (data?.url) {
      await Browser.open({ url: data.url, windowName: '_self' });
    }

    return {};
  } else {
    // Web: let Supabase do a normal redirect back to the current origin.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) return { error };
    return {};
  }
}
