'use client';

import { useEffect, useState } from 'react';

/** First year the product was published. Fixed point for the range. */
const LAUNCH_YEAR = 2025;

/**
 * Copyright line with a year that does not go stale.
 *
 * The landing page is statically prerendered, so `new Date().getFullYear()` in
 * the server component baked in the *build* year — a site left undeployed over
 * New Year would quietly claim the wrong one. Rendering the launch year on the
 * server and extending it on the client keeps the markup stable through
 * hydration while staying correct.
 */
export function CopyrightLine() {
  const [currentYear, setCurrentYear] = useState(LAUNCH_YEAR);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const range = currentYear > LAUNCH_YEAR ? `${LAUNCH_YEAR}–${currentYear}` : `${LAUNCH_YEAR}`;

  return <span>© {range} Fit Ready IQ</span>;
}
