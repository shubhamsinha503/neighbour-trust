import Link from "next/link";

export const metadata = {
  title: "About the data",
  description:
    "Where every figure comes from, how confidence is decided, and what "
    + "Neighbour Trust refuses to score.",
};

/**
 * How the numbers are made.
 *
 * The credibility argument in long form. The home page states it in three
 * sentences and the cards carry it per figure; this is the page for the reader
 * who wants to check the reasoning before trusting any of it — and, in
 * practice, the page a Play reviewer reads to understand what the app claims.
 *
 * Everything here is a decision recorded in the code, not marketing. The
 * refusals section in particular describes real guards with tests behind them.
 */
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/"
        className="text-[12px] font-semibold text-brand hover:underline"
      >
        ← Neighbour Trust
      </Link>

      <h1 className="mt-5 text-[24px] font-bold leading-[1.25] tracking-[-0.015em]">
        How these numbers are made
      </h1>
      <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-secondary">
        Locality guides in India are mostly editorial — someone&apos;s
        impression, written once, never dated. This is the opposite: every figure
        names its source, its age, and how much weight it deserves. Where we
        don&apos;t know something, the page says so instead of estimating.
      </p>

      <Section title="Air quality">
        <p>
          The headline figure is the CPCB National AQI, computed from 24-hour
          mean concentrations — which is how CPCB defines it. Not the latest
          single hour, which moves far more and reads higher.
        </p>
        <p>
          Readings come from the nearest monitoring station, and the card always
          says how far away that station is. India&apos;s regulatory network has
          been silent since 27 August 2026, so most localities are currently
          served by community low-cost sensors measuring PM2.5 alone. Those cards
          say exactly that rather than presenting the number as a full AQI.
        </p>
      </Section>

      <Section title="Schools">
        <p>
          School locations come from OpenStreetMap, staffing and enrolment from
          UDISE. The two disagree constantly — a locality can have sixty mapped
          schools and staffing figures for one — so the card reports both numbers
          rather than the flattering one.
        </p>
        <p>
          The UDISE snapshot is from January 2022. That is disclosed on every
          card and is why schools never reaches high confidence. UDISE carries no
          exam results at all, so nothing here is a ranking of school quality.
        </p>
      </Section>

      <Section title="Safety and water">
        <p>
          Both come from local news coverage, read and classified per locality.
          They are the two categories where official Indian data is weakest:
          NCRB publishes crime at district level, a year or more late.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            Neither is ever turned into a score.
          </strong>{" "}
          How often a place appears in the press tracks how much media attention
          it gets, not how often things happen there — a well-covered
          neighbourhood would look dangerous next to an identical one nobody
          writes about. So we describe the <em>kind</em> of incident reported,
          which survives that bias, and leave the ranking alone.
        </p>
        <p>
          Every headline is judged individually for whether it describes an
          incident in that specific locality. The card shows how many were read
          and how many survived, so the count never reads as an exhaustive tally.
        </p>
      </Section>

      <Section title="The Trust Score">
        <p>
          A weighted composite of the categories that can currently be scored,
          renormalised over what is actually present. Missing data never counts
          as a bad result — a locality with no air quality reading is not scored
          as though its air were poor.
        </p>
        <p>
          The score names what it is based on, because it currently rests on two
          of six categories. Below that threshold no number is published at all,
          and the page shows the individual cards instead. A single measurement
          wearing the words &ldquo;Trust Score&rdquo; would be worse than no
          score.
        </p>
      </Section>

      <Section title="Confidence tags">
        <p>
          Every figure carries one, and it is decided at the moment you read the
          page rather than when the data was stored — so a reading that was fresh
          when fetched degrades on its own as it ages, and is withheld entirely
          once too old to be meaningful.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            Community-estimated
          </strong>{" "}
          means there is no reliable official source and the figure leans on
          press coverage or community sensors. It is never dressed up as
          official data.
        </p>
      </Section>

      <Section title="What we refuse to do">
        <ul className="space-y-2">
          <Bullet>
            Publish a safety score from press coverage. The bias runs the wrong
            way and we have no way to correct for it yet.
          </Bullet>
          <Bullet>
            Report a median from too few samples, or a school count we can see is
            wrong.
          </Bullet>
          <Bullet>
            Fill an empty category with an estimate. Power and infrastructure
            have no data, and their cards say so.
          </Bullet>
          <Bullet>
            Average away a disagreement between sources. Where two sources
            conflict, the report shows both and says which is which.
          </Bullet>
        </ul>
      </Section>

      <Section title="Getting it wrong">
        <p>
          Some of this will be wrong. A locality&apos;s name can appear in a
          national story that has nothing to do with living there; a monitoring
          station can be further away than it looks; a 2022 staffing figure can
          describe a school that has since changed completely.
        </p>
        <p>
          Where we find such a case we fix it and say what it was, rather than
          quietly adjusting the number. If you spot one, tell us — you probably
          know your own neighbourhood better than any of these sources do.
        </p>
      </Section>

      <div className="mt-8 border-t border-hairline pt-4">
        <Link
          href="/privacy"
          className="text-[12.5px] font-semibold text-brand hover:underline"
        >
          Privacy →
        </Link>
      </div>
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
    <li className="relative pl-4 text-[13px] leading-[1.6] text-ink-secondary">
      <span className="absolute left-0 top-[0.55em] h-1 w-1 rounded-full bg-brand" />
      {children}
    </li>
  );
}
