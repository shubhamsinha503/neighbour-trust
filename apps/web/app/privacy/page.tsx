import Link from "next/link";

import { ForgetMeButton } from "@/components/ForgetMeButton";

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
 * IMPORTANT: this describes a build with optional Google sign-in (session
 * cookies only for people who sign in, and an account table holding the Google
 * id, email, name and what they save), one functional preference cookie that
 * remembers the city filter last chosen on the device (see
 * apps/web/lib/preferences.ts), an OPT-IN personalisation layer that — only
 * after the consent banner is accepted — sets a random visitor id and stores
 * that same city preference against it server-side (apps/api/app/prefs.py,
 * infra/migrations/014_visitor_prefs.sql), and one cookieless analytics script
 * that counts page views and cannot identify a reader. That is verifiable in the
 * source. If any of it changes — resident reporting, sign-in, another preference,
 * what the visitor id stores, an analytics tool that sets cookies or assigns a
 * persistent id — this page has to change in the same commit, or it becomes a
 * false statement rather than a stale one.
 *
 * The analytics script was added on 2026-09-08 in the same commit as the
 * wording below, which is the rule working rather than the rule being tested.
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
        Last updated 22 September 2026
      </p>

      <Section title="The short version">
        <p>
          Neighbour Trust has no advertising, and you never need an account to
          read anything on it. If you choose to sign in with Google — only to
          save localities, keep notes and compare them — we store your Google
          account id, email, name and what you save, and nothing else. You can
          delete all of it yourself, at any time, in one step. If you never sign
          in, we keep a small cookie remembering the city filter you last chose,
          so your next visit opens there — and, only if you say yes to the banner
          that asks, we remember that preference against a private id so it
          follows you across devices. That id names no one, you can delete it in
          one tap, and if you say no we keep nothing on our side. Details below.
        </p>
        <p>
          It counts page views, so we can see which neighbourhoods people look
          up. That counter sets no cookies, stores nothing in your browser and
          keeps no identifier for you, so it can tell us a page was opened and
          never that you opened it. Details below.
        </p>
        <p>
          A few things on the site accept something you type, and all of them
          are optional: the search box, which can look up a pincode or place to
          find the localities near it; a box that measures distances from an
          address you give; a question box on each locality page, answered by an
          AI model; a button to ask us to add a locality we don&apos;t cover,
          which stores the place and nothing about you; and a link to a form for
          reporting what you have seen in your area. None is required to use
          anything. Each is described in full
          below.
        </p>
      </Section>

      <Section title="What we collect from you">
        <p>
          <strong className="font-semibold text-ink-primary">
            Nothing that identifies you, unless you sign in or type it in yourself.
          </strong>{" "}
          There is no newsletter, and signing in is optional. Without signing in
          we cannot identify you by name, and we build a per-person profile only
          if you ask us to — the next two paragraphs are the whole of it.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            A preference cookie, on your device.
          </strong>{" "}
          So the front page opens where you left off, we keep one small
          first-party cookie in your browser remembering the city filter you last
          selected — for example that you were looking at Hyderabad. It holds that
          one choice and nothing else, stays on your device, and identifies
          nobody: a note that says &ldquo;show Hyderabad first&rdquo; is not a
          profile. Choosing &ldquo;All&rdquo; or clearing your browser&apos;s site
          data removes it, and the site works exactly the same without it. This
          one is functional and needs no permission — it does nothing but remember
          a filter on the device it was set on.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            Remembering it across your devices — only if you say yes.
          </strong>{" "}
          A banner asks, once, whether we may remember that preference for you
          rather than just on one device. If you say yes, we create a random id —
          a string like <code>a3f1…</code> that means nothing and is tied to no
          name, email or account — put it in a cookie your browser keeps, and
          store your city choice against it on our server so it follows you to
          your phone or another browser. The id is set so that page scripts
          cannot read it and it never appears in a web address. We store only the
          preference itself; we do not record where you go on the site, and this
          id is never joined to the page-view counter, the server logs, or a
          sign-in. If you say no, we set a plain &ldquo;no&rdquo; and create no id
          and no server record. You can withdraw and erase the whole thing in one
          tap, here:
        </p>
        <ForgetMeButton />
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            If you sign in.
          </strong>{" "}
          Sign-in uses your Google account and asks Google only for your basic
          profile: your name and email. We store your Google account id (so we
          recognise you next time), that name and email, the localities you save
          and any private notes you write on them, and when you joined and were
          last seen. Nothing else — not your photo, contacts, location or
          browsing. Your shortlist and notes are visible only to you; they are
          never shown to anyone else, counted publicly, or used in any
          locality&apos;s score.
        </p>
        <p className="mt-3">
          Signing in sets cookies that keep you signed in for up to 30 days and
          protect the sign-in form from forgery. They are set only when you sign
          in, and removed when you sign out. Comparisons are ordinary links and
          need no account.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            Deleting your account.
          </strong>{" "}
          On your shortlist page, &ldquo;Delete my account and everything
          saved&rdquo; permanently erases your account, shortlist and notes from
          our database straight away. Nothing is kept or deactivated &ldquo;just
          in case&rdquo;. Copies may remain in the database provider&apos;s
          routine backups until those expire.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            Page-view counting.
          </strong>{" "}
          Every page loads a small script from{" "}
          <strong className="font-semibold text-ink-primary">
            Vercel Web Analytics
          </strong>
          , which records that a page was opened, roughly where in the world the
          request came from, and which site sent you here if any. It sets no
          cookies, writes nothing to your browser, and assigns you no identifier
          — so it cannot follow you between visits, between pages in a way that
          builds a profile, or onto any other website. We use it to see which
          localities people look up, which is how we decide where to add data
          next.
        </p>
        <p className="mt-3">
          It runs on every page. There is no way to switch it off from within
          the site, and we would rather say that plainly than offer a toggle
          that does nothing; a browser blocker or Do Not Track extension will
          stop it loading, and the site works exactly the same without it.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            The search box and the address box.
          </strong>{" "}
          Searching a locality name is matched in your browser and sent nowhere.
          If you search a pincode we don&apos;t hold, or press Enter to find a
          place such as an apartment, road or landmark, that text is looked up so
          we can show the localities nearest to it. On the schools and
          connectivity pages you can also enter an address so distances are
          measured from there rather than from the middle of the neighbourhood.
          In both cases what you typed is sent to our server and on to{" "}
          <strong className="font-semibold text-ink-primary">Nominatim</strong>,
          the OpenStreetMap geocoding service, which turns it into coordinates.
          We do not store it, and it is not linked to anything else. It is sent
          in the body of the request rather than in the web address, precisely so
          it does not end up written into server logs.
        </p>
        <p className="mt-3">
          The result is used in your browser and forgotten when you close the
          tab. Nominatim receives the text from our server, not from you, so
          your own IP address is not part of what it sees.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            Asking us to add a locality.
          </strong>{" "}
          When a search doesn&apos;t find what you wanted, you can ask us to add
          it. We store only what you searched for, the city filter if you had
          one selected, and — if the place was found on the map — where that
          place is and how far it is from the nearest locality we cover. We do
          not store your name, email, IP address or anything else about you,
          and the request is not linked to any account. To stop the button
          being misused, our server counts requests per IP address in memory
          for an hour; that count is never written down. We use the requests,
          counted together, to decide which areas to add next.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            The question box.
          </strong>{" "}
          Each locality page lets you ask a question about that neighbourhood.
          Your question is sent to our server, and from there to{" "}
          <strong className="font-semibold text-ink-primary">Groq</strong>, the
          company that runs the AI model which writes the answer, together with
          the public data we hold about that locality. We do not store your
          question or the answer. To stop the box being flooded, our server
          keeps a count of questions per IP address in memory for an hour; it is
          never written to a database or a file, and it is gone when the server
          restarts. Groq receives the question from our server, not from you, so
          your IP address is not part of what it sees, but its own terms apply
          to what it is sent — so please don&apos;t put personal details in a
          question.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink-primary">
            The reporting form.
          </strong>{" "}
          Every locality page, and cards where we have little or no data, carry
          a link inviting you to tell us what you have seen. That link goes to a form hosted by{" "}
          <strong className="font-semibold text-ink-primary">Google Forms</strong>,
          outside this app, and what you submit is stored in the Google account
          of whoever runs this site — not in our database. It asks which
          neighbourhood, what category, what you saw, when, and how you know. An
          email address is optional and used only to ask you a follow-up
          question. Google's own privacy terms apply to that form, and the
          locality — and, from a category card, the category — is filled in
          from the page you came from.
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
            serves the site, records standard access logs, and runs the
            page-view counter described above. The counter's figures are
            aggregate — page, country, referrer — and are not joined to those
            logs by us.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Render</strong>{" "}
            runs the data API and does the same.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Neon</strong>{" "}
            stores the neighbourhood data and, for people who sign in, their
            account and shortlist. For everyone else it holds nothing personal.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Nominatim</strong>,
            run by the OpenStreetMap Foundation, receives what you typed only
            when you look up a place in the search box or use the address box,
            and receives it from our server rather than from your browser.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Groq</strong>{" "}
            receives a question only when you ask one, with that locality&apos;s
            public data, and receives it from our server rather than from your
            browser.
          </Bullet>
          <Bullet>
            <strong className="font-semibold text-ink-primary">Google</strong>{" "}
            handles sign-in if you choose to sign in, and hosts the reporting
            form, seeing a submission only if you choose to send one.
          </Bullet>
        </ul>
        <p className="mt-3">
          We do not read those logs to build profiles, and nothing in them is
          combined with anything else. They exist because servers keep them. The
          place lookup and the question box write no log of their own.
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
          <strong className="font-semibold text-ink-primary">
            On 8 September 2026 page-view counting was added
          </strong>{" "}
          — the wording above changed in the same commit as the script, which is
          the commitment working rather than being tested again. A cookieless
          counter was chosen over the usual analytics tools specifically so that
          the rest of this page stays true: no cookies, no identifier, no
          consent banner asking you to agree to something you did not want.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            It was wrong again, from 12 to 13 September 2026.
          </strong>{" "}
          The question box on each locality page went live on 12 September, and
          this page did not mention it or name Groq until the next day. No
          question was stored by us in that window, but the page did not tell
          you where a question goes, and it should have said so before the box
          appeared. On 13 September the search box also began looking up
          pincodes and places, and this page was updated in the same change.
          On 15 September a button to ask us to add a locality was added, and
          this page was updated in the same change to say what it stores.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            On 13 September 2026 optional sign-in was added
          </strong>{" "}
          — to save localities, write private notes and compare them. This page
          changed in the same commit as the code, before sign-in was switched on.
          Signing in is the &ldquo;asking before anything about you is
          stored&rdquo; this page promised: nothing is stored until you choose
          to sign in.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            On 22 September 2026 a preference cookie was added
          </strong>{" "}
          — a single functional cookie that remembers the city filter you last
          chose, so a return visit opens there rather than empty. Until this, the
          app wrote nothing to the browser for signed-out visitors and said so on
          this page; the 8 September note above even gave that as the reason for
          picking a cookieless page-view counter. That is no longer true, so the
          wording changed in the same commit as the cookie, before it went live.
          It stores only a city name, is sent to no one, and identifies nobody —
          the dull, honest kind of cookie, chosen so that no consent banner is
          needed for it.
        </p>
        <p>
          <strong className="font-semibold text-ink-primary">
            Also on 22 September 2026, opt-in personalisation was added
          </strong>{" "}
          — and this is the larger reversal, so it is worth naming plainly. For
          the first time the site can keep a per-person record for someone who has
          not signed in: if you accept the banner, a random id is set in a cookie
          and your city preference is stored against it on our server, so it
          follows you between devices. This page said, for months, that we
          assigned no identifier and tied nothing to a profile without sign-in.
          That is no longer true for anyone who opts in, and the change — the
          banner, the id, the &ldquo;forget me&rdquo; button, and this note — all
          shipped in the same commit, before the feature went live. It is opt-in,
          it stores only the preference and never your movements, and it is
          erasable in one tap. We are telling you it happened rather than letting
          you discover it, which is the whole of the commitment below.
        </p>
        <p>
          The commitment stands, and now has a record attached to it. If
          anything else about what is stored changes, this page changes first.
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
