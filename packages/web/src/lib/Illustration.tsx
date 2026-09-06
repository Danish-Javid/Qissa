/**
 * A photographic/painted illustration that fails invisibly.
 *
 * The landing PNGs are the only raster assets in the app, and they are NOT in
 * the service worker's precache (the workbox glob covers js/css/html/svg/woff2
 * — deliberately, because these four files are ~3.5 MB and precaching them
 * would blow the install budget on exactly the mobile connections this app is
 * built for). That is the right trade, but it means a flaky or offline load
 * leaves the browser with nothing to draw, and an <img> with no alt renders as
 * a broken-image glyph — which is what a parent saw where the Qissa mark should
 * have been.
 *
 * So: hide on failure rather than show a broken box, and never block first
 * paint. Anything structural (the app's own mark, Buddy) is inline SVG instead
 * — see Buddy.tsx, whose whole point is that no image asset has to load.
 */
import { useState } from 'react';

interface Props {
  src: string;
  /** Empty string marks the image as decorative, exactly as in plain HTML. */
  alt: string;
  className?: string;
  /** Above-the-fold art should not be lazy — it is the first thing seen. */
  eager?: boolean;
}

export function Illustration({ src, alt, className = '', eager = false }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
