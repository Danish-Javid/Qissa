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
import { useLocale } from '../i18n/LocaleProvider.js';
import { api } from '../api/client.js';

export function Setup() {
  const { tr } = useLocale();
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
      setError(body?.error ?? tr('setup.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold">{tr('setup.title')}</h1>
        <p className="text-sm text-ink/60">
          {tr('setup.subtitle')}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            {tr('setup.childName')}
            <input required className="input-parent mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            {tr('setup.birthDate')}
            <input type="date" required className="input-parent mt-1" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            {tr('setup.heroName')}
            <input required className="input-parent mt-1" placeholder={name || 'Mina'} value={heroName} onChange={(e) => setHeroName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            {tr('setup.city')}
            <input required className="input-parent mt-1" placeholder={tr('setup.cityPlaceholder')} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-semibold">
            {tr('setup.petName')} <span className="font-normal text-ink/50">{tr('setup.optional')}</span>
            <input className="input-parent mt-1" value={petName} onChange={(e) => setPetName(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            {tr('setup.petKind')} <span className="font-normal text-ink/50">{tr('setup.optional')}</span>
            <input className="input-parent mt-1" placeholder={tr('setup.petKindPlaceholder')} value={petKind} onChange={(e) => setPetKind(e.target.value)} />
          </label>
        </div>

        <label className="block text-sm font-semibold">
          {tr('setup.challenge')} <span className="font-normal text-ink/50">{tr('setup.challengeHint')}</span>
          <input className="input-parent mt-1" placeholder={tr('setup.challengePlaceholder')} value={challenge} onChange={(e) => setChallenge(e.target.value)} />
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-paper p-4 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <strong>{tr('setup.consentLead')}</strong> {tr('setup.consentBody')}
          </span>
        </label>

        {error !== null && <p className="rounded-lg bg-clay/10 p-2 text-sm text-clay">{error}</p>}

        <button type="submit" className="btn-parent w-full py-3" disabled={busy}>
          {busy ? tr('setup.saving') : tr('setup.submit')}
        </button>
      </form>
    </div>
  );
}
