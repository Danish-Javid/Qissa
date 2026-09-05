/**
 * Shared shell for parent screens — landmark + skip link (WCAG 2.4.1, 1.3.1).
 *
 * The parent surfaces are dense, adult, and navigated with a keyboard far more
 * often than the child ones. Before this they had no landmarks at all, so a
 * screen-reader user had no way to jump past the header on each page and no
 * structural map of the document.
 *
 * The child screens deliberately do NOT use this: there is no navigation to
 * skip, and a skip link is one more thing a toddler can tab into.
 */
import type { ReactNode } from 'react';

export function ParentPage({
  children,
  className = 'mx-auto max-w-3xl space-y-6 p-6'
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <a className="skip-link" href="#parent-main">
        Skip to content
      </a>
      <main id="parent-main" className={className}>
        {children}
      </main>
    </>
  );
}
