/**
 * Patient Privacy Notice — APP 5 (Australian Privacy Principles)
 *
 * This notice must be accessible to patients at or before the time
 * of collection of their personal information. It is linked from
 * the portal layout and shown during the registration flow.
 */

export default function PrivacyNoticePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      <h1 className="text-2xl font-semibold">Privacy Notice</h1>
      <p className="text-sm text-muted-foreground">
        This notice explains how we collect, use, and protect your personal
        and health information in accordance with the Australian Privacy Act 1988
        and the Australian Privacy Principles (APPs).
      </p>

      <Section title="What we collect">
        <p>
          We collect personal information necessary to provide hearing health services,
          including your name, date of birth, contact details, Medicare number,
          referral information, clinical notes, and hearing aid details.
        </p>
      </Section>

      <Section title="Why we collect it">
        <p>
          Your information is collected to provide clinical care, manage appointments,
          process Medicare and Hearing Services Program claims, coordinate with your
          referring GP, and comply with health record-keeping requirements.
        </p>
      </Section>

      <Section title="How we use and disclose it">
        <ul className="list-disc list-inside space-y-1">
          <li>Providing your hearing health care and treatment</li>
          <li>Coordinating care with your GP or referring practitioner</li>
          <li>Processing Medicare and HSP claims on your behalf</li>
          <li>Sending appointment reminders and follow-up communications</li>
          <li>Meeting legal and regulatory obligations</li>
        </ul>
        <p className="mt-2">
          We will not use or disclose your health information for purposes
          other than those described above without your consent, unless
          required or authorised by law.
        </p>
      </Section>

      <Section title="AI-assisted queries">
        <p>
          This practice uses an AI assistant (Google Gemini) to help answer
          questions about practice data. When the AI processes a query,
          your identifying information (name, contact details, Medicare number)
          is replaced with pseudonyms before being sent to Google. The AI
          never sees your real identity. All AI queries are logged in our
          audit trail.
        </p>
      </Section>

      <Section title="Data storage and security">
        <p>
          Your records are stored in an encrypted database. Access is
          controlled by role — only your treating clinician has full access
          to your health records. Nurses see limited scheduling information.
          All access to your records is logged.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Access (APP 12):</strong> You can view your personal
            information through this portal or by contacting the practice.
          </li>
          <li>
            <strong>Correction (APP 13):</strong> You can request corrections
            to your personal information via the profile page or by
            contacting the practice directly.
          </li>
          <li>
            <strong>Complaints:</strong> If you believe your privacy has been
            breached, you can complain to the practice or to the Office of
            the Australian Information Commissioner (OAIC).
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          For privacy queries or to request access to your records, please
          contact the practice directly. Contact details are available on
          your appointment confirmation.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        This notice was last updated on 15 April 2026.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-sm text-foreground/80 space-y-2">{children}</div>
    </section>
  );
}
