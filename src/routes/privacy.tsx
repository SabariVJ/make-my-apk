import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — SVJ" },
      { name: "description", content: "SVJ privacy policy and data practices." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED]">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="font-inter text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-xs font-mono text-[#8C8C90]">Last updated: September 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            1. Data We Collect
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              <strong className="text-white">Account information:</strong> When you sign up, we
              collect your email address and display name through Supabase Authentication. If you
              use Google Sign-In, Google provides your email and profile information per your Google
              account permissions.
            </p>
            <p>
              <strong className="text-white">Profile data:</strong> Username, bio, profile photo (if
              uploaded), evolution theme, equipped avatar frame, and display preferences.
            </p>
            <p>
              <strong className="text-white">Activity data:</strong> Challenge progress, completed
              days, XP earned, streaks, habit/task completions, 60-Day Challenge enrollment and
              progress, redeem code usage, and membership status.
            </p>
            <p>
              <strong className="text-white">Social data:</strong> Friend connections and friend
              requests you initiate or receive.
            </p>
            <p>
              <strong className="text-white">Fitness and recovery data:</strong> Workouts, sets,
              reps, load, training plans, activity steps and routes, GPS points, recovery check-ins,
              reported sleep, readiness history, goals, progress, and consistency insights. Health
              Connect data is read only when you explicitly connect and authorize it; SVJ does not
              write to Health Connect.
            </p>
            <p>
              <strong className="text-white">Device and communication data:</strong> Notification
              preferences, support messages you send, and advertising/device identifiers handled by
              Google AdMob. SVJ keeps fitness data in the app while you use the service; you can
              delete your account from Profile or the deletion page. SVJ is intended for people aged
              18 or older and does not knowingly create accounts for children.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            2. How We Use Your Data
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              Your data is used to provide the SVJ experience: tracking challenges, training,
              recovery, XP, streaks, membership status, reminders, and social connections. Activity
              data powers the leaderboard and friend comparisons. Location and route data are used
              to record the routes and distance you choose to track.
            </p>
            <p>
              We do not sell your personal data to third parties. We do not directly use your data
              for advertising targeting. The Android app uses Google AdMob, which may use your
              Advertising ID to serve ads based on your consent choices.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            3. Third-Party Services
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              <strong className="text-white">Supabase:</strong> We use Supabase for authentication,
              database hosting, and server functions. Supabase processes your authentication
              credentials and stores your account and activity data. See{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C81E3A] underline"
              >
                Supabase's Privacy Policy
              </a>
              .
            </p>
            <p>
              <strong className="text-white">Google OAuth:</strong> If you use "Continue with
              Google," Google processes your authentication. We receive your email and profile
              information per your Google permissions. We do not access other Google data.
            </p>
            <p>
              <strong className="text-white">Health Connect and device sensors:</strong> With your
              permission, SVJ reads health and activity records, step counts, and location during an
              activity you start. Sensor readings stay on your device unless you save or sync the
              resulting activity.
            </p>
            <p>
              <strong className="text-white">Google AdMob:</strong> The Android app displays
              advertisements through Google AdMob. When you consent to personalized advertising,
              AdMob may collect device identifiers (Advertising ID) and use them to serve relevant
              ads. If you do not consent, non-personalized ads may still be shown. You can opt out
              of personalized ads through your device settings. AdMob's data practices are governed
              by{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C81E3A] underline"
              >
                Google's Privacy Policy
              </a>
              .
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            4. Data Retention
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              We retain your account and activity data for as long as your account is active. When
              you delete your account, all associated data is permanently removed from our servers,
              including your profile, challenge progress, XP, streaks, friend connections, and
              membership records.
            </p>
            <p>
              Some data may persist in automated backups for a limited period before being
              permanently purged.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            5. Account Deletion
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              You can delete your account at any time from your Profile settings or through our{" "}
              <Link to="/delete-account" className="text-[#C81E3A] underline">
                account deletion page
              </Link>
              . Deletion is permanent and removes all your data.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            6. Security
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              We use industry-standard security measures including encrypted data transmission
              (TLS), database-level row security policies, and server-side authentication
              verification. No payment information is stored on our servers.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-inter text-lg font-semibold tracking-tight text-[#E62846]">
            7. Contact
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a href="mailto:sabarivj777@gmail.com" className="text-[#C81E3A] underline">
                sabarivj777@gmail.com
              </a>
              .
            </p>
          </div>
        </section>

        <div className="pt-8 border-t border-white/10">
          <Link to="/" className="text-xs text-[#8C8C90] hover:text-white font-mono">
            ← Back to SVJ
          </Link>
        </div>
      </div>
    </div>
  );
}
