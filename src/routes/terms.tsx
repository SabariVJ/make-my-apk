import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — SVJ" },
      { name: "description", content: "SVJ terms of service." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED]">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="font-anton text-3xl uppercase tracking-wider">Terms of Service</h1>
          <p className="text-xs font-mono text-[#8C8C90]">Last updated: September 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            1. Acceptance
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              By using SVJ, you agree to these Terms of Service. If you do not agree, do not use the
              application.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">2. Account</h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              You must be at least 13 years old to create an account. You are responsible for
              maintaining the security of your account credentials. One account per person.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            3. SVJ Plus Membership
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              SVJ Plus is an optional membership that unlocks additional features. Membership may be
              obtained through reward codes earned by completing the 60-Day Challenge.
            </p>
            <p>
              Membership is non-transferable and locked to your account. Lifetime membership
              (Founder accounts) cannot be downgraded or replaced with timed membership.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            4. User Content
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              You retain ownership of content you create within SVJ (reflections, check-ins, profile
              information). By using the application, you grant us a limited license to display this
              content within the application as intended.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            5. Prohibited Conduct
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use automated tools to interact with the application</li>
              <li>Attempt to access other users' accounts or data</li>
              <li>Circumvent membership or trial restrictions</li>
              <li>Use the application for any unlawful purpose</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            6. Termination
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              You may delete your account at any time. We reserve the right to suspend or terminate
              accounts that violate these terms.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">
            7. Disclaimer
          </h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              SVJ is provided "as is" without warranties of any kind. We are not responsible for any
              outcomes related to your use of the application, including health or fitness results.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-anton text-lg uppercase tracking-wider text-[#C81E3A]">8. Contact</h2>
          <div className="text-sm text-[#8C8C90] font-inter space-y-2 leading-relaxed">
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:support@svjfitness.com" className="text-[#C81E3A] underline">
                support@svjfitness.com
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
