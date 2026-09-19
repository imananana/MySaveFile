import { LegalLayout, LegalSection } from '../components/common/LegalLayout';

const CONTACT = 'privacy@mysavefile.com';

export function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="June 3, 2026"
      intro={
        <>
          MySaveFile is a free, non-commercial fan project for The Sims 4 players. By using it, you
          agree to these terms. We've kept them deliberately short and plain.
        </>
      }
    >
      <LegalSection title="The service">
        <p>
          The planner is provided free of charge, as a hobby project, on an "as is" basis. It helps you plan
          and track Sims 4 saves. We may change, suspend, or discontinue any part of it at any time.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You're responsible for keeping your login credentials secure and for activity that happens under
          your account. Let us know promptly if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Please don't:</p>
        <ul>
          <li>upload illegal, infringing, hateful, or otherwise harmful content;</li>
          <li>post external links to malware or content that deceives or harms others;</li>
          <li>attempt to break, overload, scrape, or gain unauthorized access to the service;</li>
          <li>use the planner to impersonate others or violate their rights.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of the content you create. By enabling a public showcase or share link, you grant
          us permission to display that content publicly through the site so the feature can work. You're
          responsible for the content you add and for any external links you share.
        </p>
      </LegalSection>

      <LegalSection title="The Sims & intellectual property">
        <p>
          The Sims™ is a trademark of Electronic Arts Inc. This is an unofficial, non-commercial fan project
          and is <strong>not affiliated with or endorsed by EA</strong>. The planner is an independent tool: it
          reads community-documented file formats and does not redistribute EA/Maxis code or assets. You must
          own the relevant game and packs to use that content in-game.
        </p>
      </LegalSection>

      <LegalSection title="Donations">
        <p>
          The project may accept voluntary donations to help cover running costs. Donations are gifts, not
          purchases — they don't buy features, guarantee availability, or create any obligation on our part.
        </p>
      </LegalSection>

      <LegalSection title="No warranty & data loss">
        <p>
          The planner is provided without warranties of any kind. We do our best, but we can't guarantee it
          will be error-free or always available, and we aren't liable for lost data. Please keep your own
          backups of anything important — you can export your saves at any time.
        </p>
      </LegalSection>

      <LegalSection title="External links">
        <p>
          Showcases may link to external sites (for example, where a creator hosts a downloadable save). We
          don't control and aren't responsible for third-party sites or their content.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          We may suspend or remove accounts that violate these terms. You can stop using the planner and delete
          your account at any time.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update these terms as the project evolves; the "Last updated" date above reflects the latest
          version. Continued use after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
