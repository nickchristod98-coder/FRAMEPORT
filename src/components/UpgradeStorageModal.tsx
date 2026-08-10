import Link from 'next/link';

type UpgradeStorageModalProps = {
  open: boolean;
  usedLabel: string;
  limitLabel: string;
  onClose: () => void;
};

export default function UpgradeStorageModal({
  open,
  usedLabel,
  limitLabel,
  onClose
}: UpgradeStorageModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-storage-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-white/15 bg-black p-8 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">Storage full</p>
        <h2 id="upgrade-storage-title" className="font-display mt-3 text-3xl tracking-tight">
          Upgrade your plan
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          You&apos;ve used {usedLabel} of your {limitLabel} limit. Free up space or upgrade to PRO
          (20 GB) or MAX (50 GB) to keep uploading.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="inline-flex flex-1 items-center justify-center bg-white px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-black transition hover:bg-white/90"
            onClick={onClose}
          >
            View plans
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center border border-white/25 px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-white transition hover:border-white/50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
