import Link from 'next/link';

import { buttonPrimary, buttonSize } from '@/lib/ui';

/** An unknown URL — most often an old or mistyped shared link. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-white">That page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-slate-400">
          If someone shared a place with you, the map may still have it.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/app" className={`${buttonPrimary} ${buttonSize.md}`}>
            Open the map
          </Link>
        </div>
      </div>
    </div>
  );
}
