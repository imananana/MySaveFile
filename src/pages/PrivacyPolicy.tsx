import { LegalLayout, LegalSection } from '../components/common/LegalLayout';

const CONTACT = 'privacy@mysavefile.com';

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="September 17, 2026"
      intro={
        <>
          MySaveFile is a free, non-commercial fan project — a planning tool for The Sims 4. This
          policy explains what information the planner collects, how it's used, and the choices you have.
          We try to collect as little as possible.
        </>
      }
    >
      <LegalSection title="Information we collect">
        <ul>
          <li><strong>Account details</strong> — your email address, a securely hashed password (we never store it in plain text), and a display name.</li>
          <li><strong>If you sign in with Google</strong> — your Google account email and basic profile info (name and avatar), received through Google's standard OAuth sign-in. We don't see or store your Google password.</li>
          <li><strong>Content you create</strong> — the worlds, households, sims, lots, clubs, holidays, businesses, notes, descriptions, photos, and external links you add to the planner.</li>
          <li><strong>Save file imports</strong> — when you import a Sims 4 <code>.save</code> file, it is read locally in your browser. The raw file is <strong>not</strong> uploaded; only the extracted records (names, lot types, assignments, etc.) are saved to your planner.</li>
          <li><strong>Limited technical data</strong> — basic error diagnostics (such as the type of error, browser, and IP address) may be captured to help us fix crashes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use it">
        <ul>
          <li>To provide the planner and keep your data associated with your account.</li>
          <li>To sign you in and keep you signed in.</li>
          <li>To send you transactional emails you request, such as a password-reset link.</li>
          <li>
            To send you a service notice when something on our side affected your account — for
            example, to tell you we fixed a problem that broke one of your imports.
          </li>
          <li>
            Occasionally, to ask for your feedback on the planner. Feedback requests and the service
            notices above are the only non-transactional email we will ever send — no marketing, no
            newsletters — and feedback requests always include a simple way to opt out of future ones.
          </li>
          <li>
            To understand how the planner is used in aggregate — for example, which features get
            used most — so we can decide what to improve next. These statistics never identify you
            or your saves.
          </li>
          <li>To diagnose and fix errors and improve reliability.</li>
        </ul>
        <p>We do <strong>not</strong> sell your data, and we don't use it for advertising.</p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>We rely on a few trusted services to run the planner. Your data may be processed by them only to provide the service:</p>
        <ul>
          <li><strong>Railway</strong> — application hosting and the PostgreSQL database.</li>
          <li><strong>Cloudflare R2</strong> — storage for photos you upload.</li>
          <li><strong>Resend</strong> — sending transactional email (e.g. password resets).</li>
          <li><strong>Google</strong> — optional "Sign in with Google" authentication.</li>
          <li><strong>Sentry</strong> — error reporting.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Public sharing">
        <p>
          Everything you create is <strong>private to your account by default.</strong> Nothing is public unless
          you choose to publish a showcase or generate a share link. If you do, the content you've shared
          (and any photos in it) becomes viewable by anyone with that link.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We use a single authentication cookie to keep you signed in, and a short-lived session cookie during
          Google sign-in. We do <strong>not</strong> use third-party advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="Keeping & deleting your data">
        <p>
          We keep your data while your account is active. You can delete individual saves at any time, and you
          can request deletion of your account and associated data by emailing us at{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Passwords are hashed, traffic is served over HTTPS, and we limit who can access your data. No method
          of storage or transmission is ever 100% secure, but we take reasonable steps to protect your
          information.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The planner isn't directed at children under 13, and we don't knowingly collect personal information
          from them. If you believe a child has provided us information, contact us and we'll remove it.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We may update this policy as the planner evolves. Material changes will be reflected by updating the
          "Last updated" date at the top.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions or data requests? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
