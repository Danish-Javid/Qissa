/**
 * Public landing page — Qissa as a LIVING PRIMER, not "a reading app".
 *
 * Positioning (founder intent): Qissa is more than an app that practices
 * reading — it is the child's first real book: a primer that writes itself
 * around one child, grows sound by sound, and hands progress back to the
 * parent. The page leads with that idea.
 *
 * Design research applied (2026 high-converting landing patterns):
 *  - Outcome headline with specificity; two CTAs of different commitment.
 *  - Trust via product truths and audited-pipeline proof, not vague praise.
 *  - Restraint everywhere except ONE maximalist moment: a real primer page
 *    rendered in the child UI, beside the engine's own safety checklist.
 *  - Glass sticky nav, stats band, scroll reveals, hover lift, FAQ,
 *    rich dark footer. Everything honours prefers-reduced-motion.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/** Small inline icons keep the page dependency-free and CSP-'self'. */
function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-5 w-5'} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const icons = {
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z M19 17l.9 2.1L22 20l-2.1.9L19 23l-.9-2.1L16 20l2.1-.9L19 17z',
  check: 'M20 6L9 17l-5-5',
  chevron: 'M6 9l6 6 6-6',
  feather: 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z M16 8L2 22 M17.5 15H9',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
};

/** Sections rise once as they enter the viewport (CSS handles reduced motion). */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const stats = [
  { n: '81', label: 'sounds, in gentle order' },
  { n: '8', label: 'levels from first sound to fluent' },
  { n: '15', label: 'minute sessions, capped by the server' },
  { n: '30', label: 'days before voice clips are deleted' },
  { n: '2', label: 'taps per screen for the child' },
  { n: '0', label: 'ads, chats or strangers. ever.' }
];

const pillars = [
  {
    icon: icons.feather,
    title: 'It writes itself around your child',
    body: 'Your child’s name, their pet, their city become the canon of every story. No two children read the same primer — because no two children are the same reader.'
  },
  {
    icon: icons.book,
    title: 'It grows one sound at a time',
    body: 'A full scope and sequence — 81 sounds across 8 levels — with spaced review of wobbly sounds woven back in. Every page is decodable: only known sounds, plus exactly one new one.'
  },
  {
    icon: icons.clock,
    title: 'It knows when to stop',
    body: 'Fifteen minutes, then the primer closes itself with a real-world mission — “find something red at home”. Screen time with a beginning, a middle and a goodnight.'
  }
];

const gates = [
  'decodability — every word sounds out with taught sounds',
  'content filter — warm, safe, no fear or commerce',
  'target sound “s” woven in ×7 (minimum 6)',
  'review sound “t” returning ×4 (minimum 3)',
  'every decision written to the parent’s reasoning timeline'
];

const promises = [
  { icon: icons.shield, title: 'A closed world', body: 'No ads, no chat, no strangers, no infinite scroll. Nobody can reach your child, and nothing is ever sold to them.' },
  { icon: icons.mic, title: 'Their voice stays theirs', body: 'Voice clips exist only to hear the reading. Deleted after 30 days. No human ever listens.' },
  { icon: icons.eye, title: 'You see everything', body: 'A calm evening digest: what they read, which sounds are growing, and the reasoning behind every help the buddy gave.' },
  { icon: icons.wifi, title: 'Offline-first', body: 'Stories live on the device. Planes, trains and load-shedding cannot interrupt story time.' },
  { icon: icons.heart, title: 'Confidence before correctness', body: 'Never a third attempt, never pressure. Tricky words are helped like a friend helps — then the story smiles and moves on.' },
  { icon: icons.sparkle, title: 'Rewards that mean something', body: 'Stars are earned by reading, confetti fires for finishing, and the buddy cheers words — never for tapping faster.' }
];

const faqs = [
  {
    q: 'What exactly is a “primer”, and why is Qissa one?',
    a: 'A primer is a child’s very first reading book — the one that teaches the code of written language, sound by sound. Qissa is a living primer: instead of one static book, it writes a fresh decodable story for your child every day, at exactly their pace, with their name in it. It is not practice beside the curriculum; it is the curriculum, bound into stories.'
  },
  {
    q: 'What ages is it for?',
    a: 'Ages 4–7, from pre-reader to early reader. The primer adapts to what your child has been taught so far, not to their birthday — a cautious 6-year-old and a hungry 4-year-old each get pages they can actually read.'
  },
  {
    q: 'How much screen time is it?',
    a: 'Fifteen minutes a day, capped by the server — the child cannot extend it and neither can we. Each session ends by sending your child into the real world with a tiny offline mission.'
  },
  {
    q: 'Is my child’s voice safe?',
    a: 'Yes. Audio is processed to hear the reading, kept at most 30 days, then deleted. There is no chat, no social surface, no advertising, and no human review of audio — by design, not by promise.'
  },
  {
    q: 'What does “decodable” mean, and who checks it?',
    a: 'A word is decodable when your child can sound it out with the sounds they have already been taught. An audited safety engine re-checks every single word of every generated story before it can reach the child — if one word fails, that story is rejected and a safe one is served instead.'
  },
  {
    q: 'What does it cost?',
    a: 'Qissa is free during its hackathon pilot. Our belief is simple: the first book should never be behind a paywall.'
  }
];

export function Landing() {
  useReveal();
  return (
    <div className="min-h-full bg-paper text-ink">
      {/* ── Glass header ─────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-40 border-b-2 border-ink/5">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-leaf text-white shadow-md">
              <Icon d={icons.book} className="h-5 w-5" />
            </span>
            <span className="font-story text-2xl font-bold tracking-tight">Qissa</span>
            <span className="mt-1 hidden rounded-full bg-gold/30 px-2.5 py-0.5 text-[11px] font-bold text-ink/70 sm:inline">a living primer</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-bold text-ink/75 md:flex">
            <a href="#primer" className="transition hover:text-clay">The primer</a>
            <a href="#page" className="transition hover:text-clay">Inside a page</a>
            <a href="#how" className="transition hover:text-clay">How it works</a>
            <a href="#safety" className="transition hover:text-clay">Safety</a>
            <a href="#faq" className="transition hover:text-clay">FAQ</a>
          </nav>
          <Link to="/parent" className="rounded-full bg-clay px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-105 active:scale-95">
            Begin story time
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky via-sky to-paper">
        <div className="cloud-drift absolute top-12 left-0 h-10 w-28 rounded-full bg-white/80" style={{ animationDuration: '80s' }} />
        <div className="cloud-drift absolute top-32 left-0 h-8 w-20 rounded-full bg-white/70" style={{ animationDuration: '100s', animationDelay: '-35s' }} />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="pop-in">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-leaf/25 bg-white/70 px-4 py-1.5 text-sm font-bold text-leaf shadow-sm">
              <Icon d={icons.sparkle} className="h-4 w-4" /> For ages 4–7 · writes a new story every day
            </p>
            <h1 className="font-story text-5xl leading-[1.05] font-bold sm:text-6xl lg:text-7xl">
              Not a reading app.<br />Your child’s <span className="text-warm">first real book.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/80">
              Qissa is a living primer: it writes decodable stories around your child — their
              name, their pace, their sounds — listens while they read aloud, and teaches all
              81 sounds of English, one gentle story at a time.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/parent" className="btn-big btn-face-clay btn-glow !min-h-[60px] !px-8 !text-lg">
                Start the first story
              </Link>
              <a href="#page" className="btn-big btn-face-paper !min-h-[60px] !px-8 !text-lg">Peek inside a page</a>
            </div>
            <p className="mt-4 text-sm font-semibold text-ink/60">Free during the pilot · two-minute setup · no credit card</p>
          </div>

          {/* The maximalist visual: art + floating proof chips */}
          <div className="relative">
            <div className="book-page pop-in rotate-1 p-3" style={{ animationDelay: '120ms' }}>
              <img src="/landing/hero.png" alt="A child reading a book aloud to a friendly fox buddy on a grassy hill" className="w-full rounded-[26px]" />
            </div>
            <div className="book-page buddy-float absolute -top-5 -left-4 flex items-center gap-2 px-4 py-2.5 !rounded-3xl">
              <Icon d={icons.star} className="h-5 w-5 text-gold" />
              <span className="font-story text-sm font-bold">Star earned — read “moss” alone!</span>
            </div>
            <div className="book-page absolute -right-3 -bottom-6 flex items-center gap-2 px-4 py-2.5 !rounded-3xl" style={{ transform: 'rotate(-2deg)' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-leaf/15 font-story text-sm font-bold text-leaf">ss</span>
              <span className="text-sm font-bold text-ink/70">today’s new sound</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Proof strip: true attributions, quiet confidence ─────── */}
      <div className="border-b-2 border-ink/5 bg-paper">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-5 text-center text-[13px] font-bold text-ink/55">
          <span>Grounded in the science of reading</span>
          <span className="hidden text-gold sm:inline">✦</span>
          <span>Andika, the literacy-safe typeface</span>
          <span className="hidden text-gold sm:inline">✦</span>
          <span>Powered by Azure AI Foundry</span>
          <span className="hidden text-gold sm:inline">✦</span>
          <span>Built for the Alibaba Cloud AI Hackathon Pakistan 2026</span>
        </p>
      </div>

      {/* ── Stats band ───────────────────────────────────────────── */}
      <section className="bg-ink py-14 text-paper">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 text-center sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="reveal">
              <p className="font-story text-5xl font-bold text-gold">{s.n}</p>
              <p className="mt-1.5 text-[13px] leading-snug font-semibold text-paper/75">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The primer manifesto ─────────────────────────────────── */}
      <section id="primer" className="mx-auto max-w-6xl px-6 py-24">
        <div className="reveal mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold tracking-widest text-clay uppercase">More than an app</p>
          <h2 className="mt-3 font-story text-4xl font-bold sm:text-5xl">A primer is a child’s first book. Qissa is one that lives.</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink/75">
            A century of reading research agrees on one thing: children learn to read fastest
            from texts they can actually decode. Qissa turns that finding into a book that
            rewrites itself daily around a single child.
          </p>
        </div>
        <div className="mt-14 grid gap-7 md:grid-cols-3">
          {pillars.map((p, i) => (
            <div key={p.title} className="book-page card-lift reveal relative p-8" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="absolute -top-5 left-8 flex h-11 w-11 items-center justify-center rounded-full bg-sun font-story text-xl font-bold text-ink shadow-md">{i + 1}</span>
              <span className="mb-5 mt-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-leaf/15 text-leaf">
                <Icon d={p.icon} className="h-6 w-6" />
              </span>
              <h3 className="font-story text-2xl font-bold">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-ink/75">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Inside a page: the maximalist moment ─────────────────── */}
      <section id="page" className="relative overflow-hidden bg-gradient-to-b from-sky/60 to-paper py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          {/* A real primer page, rendered in the child UI */}
          <div className="reveal relative">
            <div className="book-page mx-auto w-full max-w-md px-8 py-12">
              <p className="mb-8 text-center text-xs font-bold tracking-widest text-ink/40 uppercase">Ayla’s primer · page 4 of 9</p>
              <div className="flex flex-wrap items-center justify-center gap-3 font-story text-4xl font-bold">
                <span className="word-chip">The</span>
                <span className="word-chip relative bg-leaf/15 text-leaf">
                  cat
                  <svg viewBox="0 0 24 24" className="sparkle-pop absolute -top-6 -right-5 h-7 w-7 text-gold" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
                  </svg>
                </span>
                <span className="word-chip wobble">sat</span>
                <span className="word-chip">.</span>
              </div>
              <div className="mt-10 flex items-end justify-center gap-4">
                <div className="bubble text-base">You read it!</div>
                <img src="/landing/buddy.png" alt="The Qissa fox buddy cheering" className="buddy-float h-24 w-24 rounded-full object-cover" />
              </div>
            </div>
          </div>
          <div className="reveal">
            <p className="text-sm font-bold tracking-widest text-clay uppercase">Inside a page</p>
            <h2 className="mt-3 font-story text-4xl leading-tight font-bold">Every word on the page is a word your child can sound out. We prove it before they see it.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink/75">
              The story above was written for one child on one day: “sat” wobbles, so it
              wobbles on screen; “cat” was read alone, so it sparkles. Behind the page,
              the engine’s audited gates ran:
            </p>
            <ul className="mt-6 space-y-3">
              {gates.map((g) => (
                <li key={g} className="flex items-start gap-3 font-semibold text-ink/80">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf text-white">
                    <Icon d={icons.check} className="h-3.5 w-3.5" />
                  </span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-24">
        <div className="reveal text-center">
          <p className="text-sm font-bold tracking-widest text-clay uppercase">A day with Qissa</p>
          <h2 className="mt-3 font-story text-4xl font-bold sm:text-5xl">Three gentle steps. Then the real world.</h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {[
            { icon: icons.book, t: 'Open today’s story', b: 'One tap. The primer opens a story written for this child, this day — nine pages, one short sentence each.' },
            { icon: icons.mic, t: 'Read aloud together', b: 'Your child reads each line; the buddy listens, cheers the wins and helps the wobbles — never more than twice, never with pressure.' },
            { icon: icons.heart, t: 'Close with a hug of stars', b: 'Stars for what they read, a digest for you, and an offline mission that sends them hunting for words in the house.' }
          ].map((s, i) => (
            <div key={s.t} className="card-lift reveal relative rounded-3xl border-2 border-ink/5 bg-white/80 p-8" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="absolute -top-5 left-8 flex h-11 w-11 items-center justify-center rounded-full bg-sun font-story text-xl font-bold text-ink shadow-md">{i + 1}</span>
              <span className="mb-5 mt-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sun/20 text-clay">
                <Icon d={s.icon} className="h-6 w-6" />
              </span>
              <h3 className="font-story text-2xl font-bold">{s.t}</h3>
              <p className="mt-3 leading-relaxed text-ink/75">{s.b}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 grid items-center gap-10 lg:grid-cols-2">
          <img src="/landing/scene-read.png" alt="A child reading aloud while the fox buddy listens" className="book-page card-lift reveal w-full p-3" />
          <div className="reveal">
            <h3 className="font-story text-3xl leading-tight font-bold">The buddy never corrects like a test. It helps like a friend.</h3>
            <p className="mt-4 text-lg leading-relaxed text-ink/75">
              When a word is tricky, the buddy says it, then you read it together. If it is still
              hard, the story smiles and moves on — confidence first, always. That wobble is
              quietly scheduled back into tomorrow’s story for review.
            </p>
            <img src="/landing/scene-parent.png" alt="A parent and child reading together in warm evening light" className="book-page mt-8 w-full max-w-sm p-3" />
            <p className="mt-4 text-sm font-semibold text-ink/60">And at bedtime, your digest: what they read, what is growing, what tomorrow holds.</p>
          </div>
        </div>
      </section>

      {/* ── Safety band ──────────────────────────────────────────── */}
      <section id="safety" className="bg-ink py-24 text-paper">
        <div className="mx-auto max-w-6xl px-6">
          <div className="reveal mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold tracking-widest text-gold uppercase">The parent contract</p>
            <h2 className="mt-3 font-story text-4xl font-bold text-white">Built like a children’s library, not a feed.</h2>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {promises.map((p, i) => (
              <div key={p.title} className="reveal rounded-3xl border-2 border-paper/10 bg-paper/5 p-7" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/20 text-gold">
                  <Icon d={p.icon} className="h-5 w-5" />
                </span>
                <h3 className="font-story text-xl font-bold text-white">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-paper/75">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="reveal text-center">
          <p className="text-sm font-bold tracking-widest text-clay uppercase">Parents ask</p>
          <h2 className="mt-3 font-story text-4xl font-bold">Fair questions, straight answers.</h2>
        </div>
        <div className="mt-12 space-y-4">
          {faqs.map((f) => (
            <details key={f.q} className="faq reveal group rounded-3xl border-2 border-ink/10 bg-white/80 px-7 py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-story text-xl font-bold">
                {f.q}
                <Icon d={icons.chevron} className="faq-chev h-5 w-5 shrink-0 text-clay" />
              </summary>
              <p className="mt-4 leading-relaxed text-ink/75">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky to-paper py-24">
        <div className="cloud-drift absolute top-8 left-0 h-9 w-24 rounded-full bg-white/80" style={{ animationDuration: '90s' }} />
        <div className="reveal mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <img src="/landing/buddy.png" alt="The Qissa fox buddy waving and holding a book" className="buddy-float w-44" />
          <h2 className="mt-8 font-story text-4xl font-bold sm:text-5xl">The first book is waiting.</h2>
          <p className="mt-4 max-w-md text-lg text-ink/75">Two minutes of setup. Then story time writes itself around your child.</p>
          <Link to="/parent" className="btn-big btn-face-leaf btn-glow mt-9">Begin story time — free</Link>
          <p className="mt-4 text-sm font-semibold text-ink/60">No credit card · no ads · voice deleted in 30 days</p>
        </div>
      </section>

      {/* ── Rich footer ──────────────────────────────────────────── */}
      <footer className="bg-ink pt-16 pb-8 text-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-leaf text-white">
                <Icon d={icons.book} className="h-5 w-5" />
              </span>
              <span className="font-story text-2xl font-bold text-white">Qissa</span>
            </div>
            <p className="mt-4 max-w-xs leading-relaxed text-paper/70">
              A living primer for ages 4–7 — decodable stories that write themselves
              around one child, and hand every win back to you.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-widest text-gold uppercase">Explore</h3>
            <ul className="mt-4 space-y-2.5 font-semibold text-paper/75">
              <li><a className="transition hover:text-white" href="#primer">The primer</a></li>
              <li><a className="transition hover:text-white" href="#page">Inside a page</a></li>
              <li><a className="transition hover:text-white" href="#how">A day with Qissa</a></li>
              <li><a className="transition hover:text-white" href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-widest text-gold uppercase">Parents</h3>
            <ul className="mt-4 space-y-2.5 font-semibold text-paper/75">
              <li><Link className="transition hover:text-white" to="/parent">Sign in</Link></li>
              <li><Link className="transition hover:text-white" to="/parent">Evening digest</Link></li>
              <li><Link className="transition hover:text-white" to="/parent/archive">Story archive</Link></li>
              <li><a className="transition hover:text-white" href="#safety">The parent contract</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-widest text-gold uppercase">The science</h3>
            <ul className="mt-4 space-y-2.5 font-semibold text-paper/75">
              <li>Systematic synthetic phonics</li>
              <li>Decodable texts, always</li>
              <li>Spaced review of wobbly sounds</li>
              <li>Andika, built for early readers</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-14 flex max-w-6xl flex-col items-center justify-between gap-3 border-t-2 border-paper/10 px-6 pt-6 text-[13px] font-semibold text-paper/60 sm:flex-row">
          <p>© 2026 Qissa · made with care in Pakistan</p>
          <p>Built for the Alibaba Cloud AI Hackathon Pakistan 2026 · Powered by Azure AI Foundry</p>
        </div>
      </footer>
    </div>
  );
}
