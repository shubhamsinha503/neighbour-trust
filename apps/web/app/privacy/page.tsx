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
 *
 * That rule was broken once, on 2026-09-06: an address box and a link to a
 * reporting form both shipped while this page still read "There is no form" and
 * "What we collect from you: Nothing." It was false for a few hours rather than
 * stale, which is the worse of the two on a product whose whole claim is that
 * it does not overstate. The lapse is recorded in "If this changes" below
 * rather than quietly corrected, because a policy that silently rewrites itself
 * is the thing this page exists not to be.
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
        Last updated 6 September 2026
      </p>

      <Section title="The short version">
        <p>
          Neighbour Trust has no accounts, no sign-in, no cookies, no analytics
          and no advertising. It stores nothing about you in its database — there
          is no table of people in it, only tables of places.
        </p>
        <p>
          Two things on the site accept something you type, and both are
          optional: a box that measures distances from an address you give, and a
          link to a form for reporting what you have seen in your area. Neither
          is required to use anything. Both are described in full below.
        </p>
      </Section>

      <Section title="What we collect from you">
        <p>
          <strong className="font-semibold text-ink-primary">
            Nothing, unless you type it in yourself.
          </strong>{" "}
          There is no login, no newsletter and no tracking script. Browsing the
          site tells us nothing about you, and we cannot identify you.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            The address box.
          </strong>{" "}
          On the schools and connectivity pages you can enter an address so
          distances are measured from there rather than from the middle of the
          neighbourhood. What you type is sent to our server and on to{" "}
          <strong className="font-semibold text-ink-primary">Nominatim</strong>,
          the OpenStreetMap geocoding service, which turns it into coordinates.
          We do not store it, and it is not linked to anything else. It is sent
          in the body of the request rather than in the web address, precisely so
          it does not end up written into server logs.
        </p>
        <p className="mt-3">
          The result is used in your browser and forgotten when you close the
          tab. Nominatim receives the address from our server, not from you, so
          your own IP address is not part of what it sees.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            The reporting form.
          </strong>{" "}
          Cards where we have little or no data carry a link inviting you to tell
          us what you have seen. That link goes to a form hosted by{" "}
          <strong className="font-semibold text-ink-primary">Google Forms</strong>,
          outside this app, and what you submit is stored in the Google account
          of whoever runs this site — not in our database. It asks which
          neighbourhood, what category, what you saw, when, and how you know. An
          email address is optional and used only to ask you a follow-up
          question. Google's own privacy terms apply to that form, and the
          locality and category are filled in from the page you came from.
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
          <Bullet>
            <strong className="font-semibold text-ink-primary">Nominatim</strong>,
            run by the OpenStreetMap Foundation, receives an address only when
            you use the address box, and receives it from our server rather than
            from your browser.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Google</strong>{" "}
            hosts the reporting form, and sees a submission only if you choose to
            send one.
          </Bullet>
        </ul>
        <p className="mt-3">
          We do not read those logs to build profiles, and nothing in them is
          combined with anything else. They exist because servers keep them. The
          address lookup writes no log of its own.
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
          The app is not directed at children. Nothing is collected from anyone
          who simply reads it. The reporting form is open to whoever follows the
          link, so it asks for no more than is needed to check a report and makes
          an email address optional — but we cannot verify who fills it in, and
          we would rather say so than imply a check we do not perform.
        </p>
      </Section>

      <Section title="If this changes">
        <p>
          <strong className="font-semibold text-ink-primary">
            This page was briefly wrong, and it is worth telling you rather than
            quietly fixing.
          </strong>{" "}
          On 6 September 2026 the address box and the reporting link went live
          while this page still said there was no form and that we collected
          nothing. That was untrue for a few hours until this update. Nothing was
          stored in that window — the address box has never kept anything, and
          the form was hosted elsewhere from the start — but the promise made
          here was that the policy would change first, and it did not.
        </p>
        <p>
          The commitment stands, and now has a record attached to it. Resident
          reporting in the product itself is still planned and will need
          accounts. If that arrives, this page changes before the feature does,
          and you will be asked before anything about you is stored.
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
