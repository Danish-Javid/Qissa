/**
 * Setup — the five-minute world seed (FR-A).
 *
 * What the parent types here becomes permanent story canon: the hero's
 * name, the city, the pet. The "something she's working on" field chooses
 * the first character theme. Voice consent is presented here too, before
 * any recording could ever happen (NFR-3).
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

export function Setup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [heroName, setHeroName] = useState('');
  const [city, setCity] = useState('');
  const [petName, setPetName] = useState('');
  const [petKind, setPetKind] = useState('');
  const [challenge, setChallenge] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/children', {
        name,
        birthDate,
        worldSeed: {
          heroName: heroName || name,
          city,
          petName: petName !== '' ? petName : undefined,
          petKind: petKind !== '' ? petKind : undefined,
          currentChallenge: challenge !== '' ? challenge : undefined
        }
      });
      if (consent) {
        // Consent is recorded once; the digest shows when it was given.
        await api.post('/auth/consent');
      }
      navigate('/parent');
    } catch (err) {
      const body = err instanceof Error ? (err as Error & { body?: { error?: string } }).body : undefined;
      setError(body?.error ?? 'Could not save. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold">Set up your child's world</h1>
        <p className="text-sm text-ink/60">
          Five minutes now, stories forever. These details become the canon of every story Qissa tells.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            Child's name
            <input required className="input-parent mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Birth date
            <input type="date" required className="input-parent mt-1" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            Story hero name
            <input required className="input-parent mt-1" placeholder={name || 'Mina'} value={heroName} onChange={(e) => setHeroName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Your city
            <input required className="input-parent mt-1" placeholder="Lahore" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            Pet name <span className="font-normal text-ink/50">(optional)</span>
            <input className="input-parent mt-1" value={petName} onChange={(e) => setPetName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Pet kind <span className="font-normal text-ink/50">(optional)</span>
            <input className="input-parent mt-1" placeholder="cat" value={petKind} onChange={(e) => setPetKind(e.target.value)} />
          </label>
        </div>

        <label className="block text-sm font-semibold">
          Something they're working on <span className="font-normal text-ink/50">(optional — shapes the first theme)</span>
          <input className="input-parent mt-1" placeholder="starting a new school" value={challenge} onChange={(e) => setChallenge(e.target.value)} />
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-paper p-4 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <strong>Voice consent.</strong> I allow short reading clips to be kept for up to 30 days so I can hear
            progress in the digest. Without this, no audio is ever stored — reading still works fully.
          </span>
        </label>

        {error !== null && <p className="rounded-lg bg-clay/10 p-2 text-sm text-clay">{error}</p>}

        <button type="submit" className="btn-parent w-full py-3" disabled={busy}>
          {busy ? 'Saving…' : 'Create world'}
        </button>
      </form>
    </div>
  );
}
