/**
 * WhatsApp share (FR-J).
 *
 * WhatsApp is how families in Pakistan actually pass things around, so it is
 * the one place a proud parent will send this. Two deliberate constraints:
 *
 *  - It is a LINK the parent clicks, never an automatic send. Nothing leaves
 *    the device until they tap, and the message is theirs to edit in WhatsApp
 *    before it goes anywhere.
 *  - The text carries the child's first name and their progress numbers, and
 *    nothing else. No link back to the app, no identifiers, no session data --
 *    a forwarded WhatsApp message is effectively public, and a URL that
 *    resolved to a real child's digest would be a privacy hole with a share
 *    button attached.
 *
 * Uses the native share sheet where the browser offers one (Android, iOS), and
 * falls back to wa.me on desktop.
 */
import { useLocale } from '../i18n/LocaleProvider.js';

interface ShareButtonProps {
  name: string;
  level: number;
  sounds: number;
  words: number;
}

export function ShareButton({ name, level, sounds, words }: ShareButtonProps) {
  const { tr, num } = useLocale();

  const message = tr('share.message', {
    name,
    level: num(level),
    count: num(sounds),
    words: num(words)
  });

  async function share(): Promise<void> {
    // navigator.share needs a user gesture and rejects when dismissed; a
    // cancelled share is not an error worth surfacing.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      className="rounded-xl border border-leaf/40 px-4 py-2 text-sm font-semibold text-leaf hover:bg-leaf/5"
      onClick={() => void share()}
    >
      {tr('share.whatsapp')}
    </button>
  );
}
