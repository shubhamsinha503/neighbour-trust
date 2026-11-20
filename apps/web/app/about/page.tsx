import Link from "next/link";

export const metadata = {
  title: "About the data",
  description:
    "Where every figure comes from, how confidence is decided, and what "
    + "Nestra refuses to score.",
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
        ← Nestra
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

      <Section title="What we cover">
        <p>
          Five categories can appear on a locality report. Air quality, schools
          and connectivity are wired to live sources. Safety and water carry
          local press coverage only. Power has no card of its own — no source
          publishes it at locality level — so reported outages appear as a flag
          on the report instead.
        </p>
        <p>
          Nestra is in early access, across Delhi, Bengaluru, Gurugram,
          Hyderabad and Mumbai. A category with nothing sourced yet is left off
          a report rather than shown as a blank or filled with an estimate.
        </p>
      </Section>

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
        <p>
          Where no live station of any kind is in range, the card falls back to a
          modelled PM2.5 estimate from the Copernicus CAMS model. It is marked as
          a low-confidence estimate and never shown as a station measurement — a
          modelled figure to weigh, not a reading we stand behind as fact.
        </p>
      </Section>

      <Section title="Schools">
        <p>
          School locations come from OpenStreetMap, so the card answers one
          question: how many schools are near a locality, and how close. That is
          a real and useful thing to know, and it is honestly all open data
          supports here.
        </p>
        <p>
          It is not a measure of school quality. No open Indian dataset publishes
          teaching quality, exam results or current staffing at locality level,
          so the card never shows one and never ranks schools. A locality with
          many schools nearby reads as good <em>access</em> — not good schools —
          and the card says exactly that.
        </p>
      </Section>

      <Section title="Safety and water">
        <p>
          Both come from local news coverage, read and classified per locality.
          They are the two categories where official Indian data is weakest:
          NCRB publishes crime at district level, a year or more late. Both are
          always tagged community-estimated.
        </p>
        <p>
          How often a place appears in the press tracks how much media attention
          it gets, not how often things happen there — a well-covered
          neighbourhood would look dangerous next to an identical one nobody
          writes about. So these scores are built mainly from the{" "}
          <em>kind</em> of incident reported, which survives that bias: for
          safety, the share of reported incidents involving violence; for water,
          whether flooding, supply failures or contamination recur. The raw count
          enters only as a small, capped adjustment, so being written about more
          can move a score a little and never dominate it.
        </p>
        <p>
          A score needs at least three confirmed incidents in the last 12 months;
          below that the card describes what was reported and gives no number.
          A locality with nothing reported shows a baseline on its card, labelled
          as one, and that baseline is never counted in the Trust Score —
          silence in the press is not evidence that nothing happened.
        </p>
        <p>
          Every headline is judged individually for whether it describes an
          incident in that specific locality. The card shows how many were read
          and how many survived, so the count never reads as an exhaustive tally.
        </p>
      </Section>

      <Section title="Reported as coming">
        <p>
          Some reports carry a short list of infrastructure the local press has
          written about — a metro extension, a flyover, a new hospital. These
          are press reports, not commitments. Indian infrastructure projects are
          announced years before they open, and many are delayed or dropped;
          some of the headlines are themselves about a delay.
        </p>
        <p>
          Nothing in that list counts toward the Trust Score. How much a
          locality gets written about is not how much is being built there, so
          the section shows the dated headline and its source and leaves the
          reader to weigh it.
        </p>
      </Section>

      <Section title="Flood risk">
        <p>
          Where a locality falls in a modeled flood zone, the report says so and
          gives the depth a 1-in-100-year river flood would reach nearby. It
          comes from WRI Aqueduct Floods, a global model at about 1 km — so it is
          regional screening, not a street-level or observed figure, and the card
          says exactly that and links the source.
        </p>
        <p>
          It is never turned into a score. A modeled hazard is a fact to weigh,
          not a number to average into the Trust Score, so a flood zone shows as
          a plain warning and a clear locality as a plain reassurance.
        </p>
      </Section>

      <Section title="The Trust Score" id="trust-score">
        <p>
          A weighted average of up to five categories, each scored 0–100. The
          weights are a judgement about what matters to a typical buyer, not a
          measurement, and they are published so they can be argued with:
        </p>
        <ul className="space-y-1">
          <Bullet>Air quality — 24%</Bullet>
          <Bullet>Schools (access, not quality) — 24%</Bullet>
          <Bullet>Safety — 24%</Bullet>
          <Bullet>Water — 17%</Bullet>
          <Bullet>Connectivity — 11%</Bullet>
        </ul>
        <p>
          <strong className="font-semibold text-ink-primary">Missing data.</strong>{" "}
          A category with no data is left out and the remaining weights are
          scaled up to fill 100%. It is never scored as zero (that would call a
          locality bad because we have not measured it) or as average (that
          would invent a number and make every locality look alike). A reading
          too old to describe today is shown with its date and also left out.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            Why that matters when you read one.
          </strong>{" "}
          A score averaged over two categories looks exactly as complete as one
          averaged over five. So every report shows what share of the full
          weight its score rests on, names the categories that are not in it,
          and opens to the full breakdown: each category&apos;s score, its share
          of the number and its confidence. Read a missing category as unknown,
          not as fine. A high score with low coverage says the things we could
          measure look good — it is not an overall verdict on the neighbourhood.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">Minimum coverage.</strong>{" "}
          Below 35% of the total weight no score is published at all, and the
          page shows the individual cards instead. A single measurement wearing
          the words &ldquo;Trust Score&rdquo; would be worse than no score.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">Power.</strong>{" "}
          No source publishes power supply at locality level, so power has no
          weight. Repeated reported outages or equipment failures can take 3 or 6
          points off, and only when a warning on the same page says why.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            Never in the score.
          </strong>{" "}
          Modelled flood risk, sunlight, &ldquo;reported as coming&rdquo; projects
          and resident reports are shown separately and never move the number.
        </p>
      </Section>

      <Section title="Checking a figure yourself">
        <p>
          Every report has a &ldquo;Where each figure comes from&rdquo; section,
          and every warning carries the same line: the source (linked), the date
          the data was measured or published, and its confidence tag. For safety,
          water and power, the most recent original news articles behind the
          figure are listed and linked, so you can read what was actually
          reported rather than our summary of it.
        </p>
      </Section>

      <Section title="Confidence tags">
        <p>
          Every figure carries one, and it is decided at the moment you read the
          page rather than when the data was stored — so a reading that was fresh
          when fetched degrades on its own as it ages, and is withheld entirely
          once too old to be meaningful.
        </p>
        <ul className="space-y-2">
          <Bullet>
            <strong className="font-semibold text-ink-primary">High</strong> — recent,
            from an official or regulatory source close to the locality.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Medium</strong> — a real
            measurement, but older, further away or from a weaker source. An air
            reading more than 3 hours old can be no better than medium.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Low</strong> — an
            indication only: old, distant, partial or modelled. An air reading more
            than 24 hours old is low; after 7 days it is shown with its date and
            left out of the score.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">
              Community-estimated
            </strong>{" "}
            — there is no reliable official source and the figure leans on press
            coverage or community sensors. It is never dressed up as official data.
          </Bullet>
        </ul>
      </Section>

      <Section title="What we refuse to do">
        <ul className="space-y-2">
          <Bullet>
            Rank localities by how often they are in the news. Safety and water
            scores read the kind of incident reported, with the count capped,
            because volume tracks media attention rather than what happens.
          </Bullet>
          <Bullet>
            Dress a school count up as a quality ranking, or report a figure from
            too few samples.
          </Bullet>
          <Bullet>
            Fill an empty category with an estimate or an average. A category
            with no data is left out of the score, and the report names it.
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
          station can be further away than it looks; a school OpenStreetMap maps
          nearby can have closed or moved since it was recorded.
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
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-7 scroll-mt-6">
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
