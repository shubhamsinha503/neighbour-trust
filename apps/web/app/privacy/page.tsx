import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description:
    "What Neighbour Trust collects, which is almost nothing, and what the "
    + "services behind it record.",
};

/**
 * Privacy policy.
 *
 * Required by the Play Store, and by India's DPDP Act for anything that
 * processes personal data. Written to describe what this app actually does
 * today rather than to cover every future possibility — a policy that claims
 * broad rights "just in case" is the kind of document this product exists to be
 * the opposite of.
 *
 * IMPORTANT: this describes a build with no accounts, no analytics, no cookies
 * and no client-side storage. That is verifiable in the source. If any of those
 * change — resident reporting, sign-in, analytics — this page has to change in
 * the same commit, or it becomes a false statement rather than a stale one.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/"
        className="text-[12px] font-semibold text-brand hover:underline"
      >
        ← Neighbour Trust
      </Link>

      <h1 className="mt-5 text-[24px] font-bold tracking-[-0.01em]">Privacy</h1>
      <p className="mt-1.5 text-[12px] text-ink-muted">
        Last updated 2 September 2026
      </p>

      <Section title="The short version">
        <p>
          Neighbour Trust has no accounts, no sign-in, no cookies, no analytics
          and no advertising. It does not ask you for anything and does not store
          anything on your device beyond what a browser keeps to display a page.
        </p>
        <p>
          Everything it shows is data about places, not about people.
        </p>
      </Section>

      <Section title="What we collect from you">
        <p>
          <strong className="font-semibold text-ink-primary">Nothing.</strong>{" "}
          There is no form, no login, no newsletter and no tracking script. We
          cannot identify you and do not try to.
        </p>
      </Section>

      <Section title="What the servers record">
        <p>
          Being honest about this matters more than the sentence above sounding
          absolute. Like any website, ours runs on hosting that keeps ordinary
          request logs, and those logs contain IP addresses:
        </p>
        <ul className="mt-2 space-y-1.5 pl-4">
          <Bullet>
            <strong className="font-semibold text-ink-primary">Vercel</strong>{" "}
            serves the site and records standard access logs.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Render</strong>{" "}
            runs the data API and does the same.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Neon</strong>{" "}
            stores the neighbourhood data. It holds no personal data, because we
            have none to put in it.
          </Bullet>
        </ul>
        <p className="mt-3">
          We do not read those logs to build profiles, and nothing in them is
          combined with anything else. They exist because servers keep them.
        </p>
      </Section>

      <Section title="If you install the app">
        <p>
          The installed app is the same website in a container. It requests no
          Android permissions — no location, no contacts, no storage, no camera.
          It cannot see anything on your phone.
        </p>
        <p>
          A small amount of the page is stored offline so that losing signal
          shows a clear message rather than a browser error. Neighbourhood data
          is deliberately not stored offline: a saved air quality reading would
          still look current days later, and every figure here is supposed to
          tell you how old it is.
        </p>
      </Section>

      <Section title="Where the data comes from">
        <p>
          Air quality from CPCB and community sensors via OpenAQ. Schools from
          UDISE and OpenStreetMap. Safety and water from published news
          coverage. All of it is public information about public places, and
          each figure on the site names its own source and date.
        </p>
        <p>
          News headlines are read by an automated classifier to decide whether an
          article describes an incident in a particular locality. It reads
          published headlines only.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The app is not directed at children and collects no data from anyone,
          including children.
        </p>
      </Section>

      <Section title="If this changes">
        <p>
          Resident reporting is planned, and it will need accounts. If that
          arrives, this page changes before the feature does, and you will be
          asked before anything about you is stored. We will not start
          collecting data and update the policy afterwards.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy, or a request about data you believe we
          hold, can be sent to the address on the listing page for this app.
        </p>
      </Section>

      <p className="mt-8 border-t border-hairline pt-4 text-[11.5px] leading-[1.6] text-ink-muted">
        This describes what the software actually does, and is written to be
        checkable against it rather than to be broad. It is not legal advice; if
        you are relying on it for compliance in your own jurisdiction, have a
        lawyer read it.
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
        {title}
      </h2>
      <div className="space-y-2.5 text-[13px] leading-[1.65] text-ink-secondary">
        {children}
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-3.5 text-[13px] leading-[1.6] text-ink-secondary">
      <span className="absolute left-0 top-[0.55em] h-1 w-1 rounded-full bg-ink-muted" />
      {children}
    </li>
  );
}
