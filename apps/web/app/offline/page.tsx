export const metadata = { title: "Offline · Neighbour Trust" };

/**
 * Shown when a navigation fails because the device has no connection.
 *
 * Cached by the service worker, and the only page that is. Report pages are
 * never cached: a stale air quality reading that looks current would break the
 * one promise this product makes.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="rounded-[20px] border border-hairline bg-surface-1 p-6">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-[linear-gradient(155deg,#0e5a3f_0%,#1baf7a_100%)] text-[16px] font-bold text-white">
          N
        </div>

        <h1 className="mt-4 text-[19px] font-bold tracking-[-0.01em]">
          You&apos;re offline
        </h1>

        <p className="mt-2 text-[13px] leading-[1.6] text-ink-secondary">
          Neighbour Trust needs a connection. We don&apos;t keep neighbourhood
          data on your device, because a saved reading would still look current
          days later — and every figure here is supposed to tell you how old it
          is.
        </p>

        <p className="mt-3 text-[13px] leading-[1.6] text-ink-secondary">
          Reconnect and reload, and you&apos;ll get the live version.
        </p>
      </div>
    </main>
  );
}
