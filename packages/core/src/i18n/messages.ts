/**
 * Bilingual message catalog for every PARENT-facing string (FR-J).
 *
 * Design rules:
 *  - `en` is the source of truth; `ur` is typed as the same shape, so a
 *    missing translation is a compile error, not a blank screen at a demo.
 *  - Placeholders are `{name}` and are substituted by `t()`. No string
 *    concatenation at call sites: Urdu word order differs from English, so a
 *    sentence must be translatable as one whole unit.
 *  - Pedagogy vocabulary the child is learning (the graphemes themselves,
 *    the English words) is NEVER translated — it is quoted verbatim in both
 *    locales, because that is literally what the child is decoding.
 *
 * The Urdu here is written the way a Lahore parent speaks rather than the way
 * a textbook does: everyday register, and English loanwords kept where the
 * natural spoken form uses them ("level", "filter").
 */

const en = {
  // --- common chrome -------------------------------------------------------
  'common.appName': 'Qissa',
  'common.backToDashboard': 'Back to dashboard',
  'common.loading': 'Loading…',
  'common.language': 'Language',
  'common.print': 'Print',
  'common.share': 'Share',

  // --- digest --------------------------------------------------------------
  'digest.title': '{name} — the story of their learning',
  'digest.subtitle':
    'Sounds and words are the first chapter — every session also wove in spoken language, the wider world and a mission for home.',
  'digest.consentGiven': 'Voice consent: given {date}',
  'digest.consentMissing': 'Voice consent: not given — no audio is stored',
  'digest.phonics': 'Phonics knowledge',
  'digest.noPhonics': 'No reading yet — the first story will teach the first sounds.',
  'digest.levelLine': 'Level {level} · {count} decodable words unlocked',
  'digest.fluencyTrend': 'Fluency trend (words/min)',
  'digest.distressTitle': 'Worth a gentle conversation',
  'digest.level': 'Level {level}',
  'digest.mastered': 'Mastered',
  'digest.learning': 'Learning',
  'digest.reteach': 'Needs another look',
  'digest.sessions': 'Recent sessions',
  'digest.noSessions': 'No sessions yet — open a door with your child to begin.',
  'digest.miscues': 'Recent miscues',
  'digest.noMiscues': 'No miscues recorded — or none since the last session.',
  'digest.accentVariant': 'accent variant',
  'digest.audio': 'Hear the progress',
  'digest.noAudio':
    'No clips stored. Clips exist only when voice consent is on, and are deleted after 30 days.',
  'digest.whyThisStory': 'Why {name} got these stories',
  'digest.noStories': 'No stories generated yet.',
  'digest.reasoningTitle': 'Why the engine did what it did',
  'digest.noReasoning': 'No decisions recorded yet.',
  'digest.technicalDetail': 'Technical detail',
  'digest.checksPassed': 'Passed {count} checks',

  // --- First Words: code-switched coaching for the co-viewing adult --------
  // The TARGET WORD is always English -- that is what the child is learning.
  // Only the frame around it switches, which is exactly how a Pakistani adult
  // teaches a toddler in practice ("dekho -- ball!").
  'early.coachTitle': 'Say it together',
  'early.coachLook': 'Look — {word}!',
  'early.coachFind': 'Where is the {word}?',
  'early.coachPraise': 'Well done! {word}!',

  // --- the "why this story" explainer --------------------------------------
  'explain.storyChosen':
    'This story teaches the sound “{grapheme}” at level {level}, because that is the next sound in {name}’s scope.',
  'explain.storyReview':
    'It also brings back “{graphemes}” — sounds {name} met earlier that were due for review.',
  'explain.sourceGenerated': 'Written fresh for {name} by the story model, then checked.',
  'explain.sourceCache':
    'The model’s draft did not pass the checks, so {name} was given a hand-written story that did.',
  'explain.sourceFallback':
    'The model and the hand-written set were both unavailable, so a guaranteed-safe story was built from the word bank.',
  'explain.gateDecodability': 'Every word is one {name} can sound out with what she has been taught.',
  'explain.gateDecodabilityFailed':
    'Rejected: it contained words {name} has not been taught to decode ({detail}).',
  'explain.gateContentFilter': 'Nothing in it tripped the content filter.',
  'explain.gateContentFilterFailed': 'Rejected by the content filter ({detail}).',
  'explain.gatePageCount': 'It is the right length for {name}’s current level.',
  'explain.gatePageCountFailed': 'Rejected: wrong length ({detail}).',
  'explain.gateTargetDensity': 'The new sound appears often enough to actually teach it.',
  'explain.gateTargetDensityFailed': 'Rejected: the new sound appeared too rarely ({detail}).',
  'explain.gateReviewDensity': 'Older sounds appear often enough to keep them fresh.',
  'explain.gateReviewDensityFailed': 'Rejected: review sounds were under-used ({detail}).',
  'explain.gateUnknown': 'Passed an additional check ({check}).',
  'explain.gateUnknownFailed': 'Rejected by an additional check ({check}: {detail}).',
  'explain.generatorUnavailable': 'The story model could not be reached, so the ladder took over.',
  'explain.fallbackCache': 'Served a hand-written story that passes the same checks (“{detail}”).',
  'explain.fallbackDeterministic': 'Built a guaranteed-safe story from the word bank.',

  // --- reasoning timeline events -------------------------------------------
  'event.storyAccepted': 'A story passed every safety check and was shown.',
  'event.storyRejected': 'A generated story was rejected before {name} ever saw it.',
  'event.storyFallback': 'A checked, hand-written story was served instead.',
  'event.sessionCapped': 'The session reached its 15-minute limit and closed itself.',
  'event.sessionStarted': 'A reading session began.',
  'event.sessionClosed': 'A reading session ended.',
  'event.progressionAdvance': '{name} moved up a level after showing mastery.',
  'event.progressionReteach': 'A sound dropped below half-right, so it will be retaught.',
  'event.distressEscalated': 'Something {name} said was flagged for a grown-up.',
  'event.unknown': '{event}'
} as const;

export type MessageKey = keyof typeof en;

const ur: Record<MessageKey, string> = {
  'common.appName': 'قصہ',
  'common.backToDashboard': 'ڈیش بورڈ پر واپس',
  'common.loading': 'لوڈ ہو رہا ہے…',
  'common.language': 'زبان',
  'common.print': 'پرنٹ کریں',
  'common.share': 'شیئر کریں',

  'digest.title': '{name} کے سیکھنے کی کہانی',
  'digest.subtitle':
    'آوازیں اور الفاظ تو صرف پہلا باب ہیں — ہر نشست میں بولنے کی زبان، دنیا کی سمجھ اور گھر کے لیے ایک کام بھی شامل تھا۔',
  'digest.consentGiven': 'آواز کی اجازت: {date} کو دی گئی',
  'digest.consentMissing': 'آواز کی اجازت: نہیں دی گئی — کوئی آڈیو محفوظ نہیں ہوتی',
  'digest.phonics': 'آوازوں کی سمجھ',
  'digest.noPhonics': 'ابھی پڑھنا شروع نہیں ہوا — پہلی کہانی پہلی آوازیں سکھائے گی۔',
  'digest.levelLine': 'لیول {level} · {count} الفاظ پڑھنے کے قابل ہوئے',
  'digest.fluencyTrend': 'روانی کا رجحان (الفاظ فی منٹ)',
  'digest.distressTitle': 'ایک نرم گفتگو کی ضرورت',
  'digest.level': 'لیول {level}',
  'digest.mastered': 'مکمل سیکھ لیا',
  'digest.learning': 'سیکھ رہی ہے',
  'digest.reteach': 'دوبارہ دیکھنا ہوگا',
  'digest.sessions': 'حالیہ نشستیں',
  'digest.noSessions': 'ابھی کوئی نشست نہیں — اپنے بچے کے ساتھ ایک دروازہ کھولیں۔',
  'digest.miscues': 'حالیہ غلطیاں',
  'digest.noMiscues': 'کوئی غلطی درج نہیں — یا پچھلی نشست کے بعد سے کوئی نہیں۔',
  'digest.accentVariant': 'لہجے کا فرق',
  'digest.audio': 'پیش رفت سنیے',
  'digest.noAudio':
    'کوئی کلپ محفوظ نہیں۔ کلپ صرف اُس صورت میں رکھے جاتے ہیں جب آواز کی اجازت دی گئی ہو، اور ۳۰ دن بعد حذف ہو جاتے ہیں۔',
  'digest.whyThisStory': '{name} کو یہ کہانیاں کیوں ملیں',
  'digest.noStories': 'ابھی کوئی کہانی نہیں بنی۔',
  'digest.reasoningTitle': 'انجن نے جو کیا، کیوں کیا',
  'digest.noReasoning': 'ابھی کوئی فیصلہ درج نہیں۔',
  'digest.technicalDetail': 'تکنیکی تفصیل',
  'digest.checksPassed': '{count} جانچیں پاس کیں',

  'early.coachTitle': 'ساتھ مل کر بولیں',
  'early.coachLook': 'دیکھو — {word}!',
  'early.coachFind': '{word} کہاں ہے؟ ڈھونڈو!',
  'early.coachPraise': 'شاباش! {word}!',

  'explain.storyChosen':
    'یہ کہانی لیول {level} پر آواز “{grapheme}” سکھاتی ہے، کیونکہ {name} کے نصاب میں اگلی آواز یہی ہے۔',
  'explain.storyReview':
    'اس میں “{graphemes}” بھی دوبارہ آتی ہیں — وہ آوازیں جو {name} پہلے سیکھ چکی ہے اور اب دہرانے کا وقت تھا۔',
  'explain.sourceGenerated': '{name} کے لیے ماڈل نے نئی لکھی، پھر جانچی گئی۔',
  'explain.sourceCache':
    'ماڈل کی کہانی جانچ میں پوری نہیں اُتری، اس لیے {name} کو ہاتھ سے لکھی ہوئی وہ کہانی دی گئی جو پوری اُتری۔',
  'explain.sourceFallback':
    'ماڈل اور ہاتھ سے لکھی کہانیاں دونوں دستیاب نہیں تھیں، اس لیے لفظوں کے ذخیرے سے ایک محفوظ کہانی بنائی گئی۔',
  'explain.gateDecodability': 'ہر لفظ وہ ہے جسے {name} اپنی سیکھی ہوئی آوازوں سے پڑھ سکتی ہے۔',
  'explain.gateDecodabilityFailed':
    'مسترد: اس میں ایسے الفاظ تھے جو {name} نے پڑھنا نہیں سیکھے ({detail})۔',
  'explain.gateContentFilter': 'اس میں کوئی بات مواد کے فلٹر سے نہیں ٹکرائی۔',
  'explain.gateContentFilterFailed': 'مواد کے فلٹر نے مسترد کیا ({detail})۔',
  'explain.gatePageCount': 'یہ {name} کے موجودہ لیول کے لیے درست لمبائی کی ہے۔',
  'explain.gatePageCountFailed': 'مسترد: لمبائی غلط تھی ({detail})۔',
  'explain.gateTargetDensity': 'نئی آواز اتنی بار آتی ہے کہ واقعی سکھا سکے۔',
  'explain.gateTargetDensityFailed': 'مسترد: نئی آواز بہت کم بار آئی ({detail})۔',
  'explain.gateReviewDensity': 'پرانی آوازیں اتنی بار آتی ہیں کہ یاد رہیں۔',
  'explain.gateReviewDensityFailed': 'مسترد: دہرائی کی آوازیں کم استعمال ہوئیں ({detail})۔',
  'explain.gateUnknown': 'ایک اضافی جانچ بھی پاس کی ({check})۔',
  'explain.gateUnknownFailed': 'ایک اضافی جانچ نے مسترد کیا ({check}: {detail})۔',
  'explain.generatorUnavailable': 'کہانی کا ماڈل دستیاب نہیں تھا، اس لیے متبادل نظام نے کام سنبھالا۔',
  'explain.fallbackCache': 'ہاتھ سے لکھی وہ کہانی دی گئی جو انہی جانچوں سے گزرتی ہے (“{detail}”)۔',
  'explain.fallbackDeterministic': 'لفظوں کے ذخیرے سے ایک محفوظ کہانی بنائی گئی۔',

  'event.storyAccepted': 'ایک کہانی ہر حفاظتی جانچ سے گزری اور دکھائی گئی۔',
  'event.storyRejected': 'بنائی گئی ایک کہانی {name} کے دیکھنے سے پہلے ہی مسترد کر دی گئی۔',
  'event.storyFallback': 'اس کے بجائے ایک جانچی ہوئی، ہاتھ سے لکھی کہانی دی گئی۔',
  'event.sessionCapped': 'نشست ۱۵ منٹ کی حد پر پہنچی اور خود بند ہو گئی۔',
  'event.sessionStarted': 'پڑھنے کی ایک نشست شروع ہوئی۔',
  'event.sessionClosed': 'پڑھنے کی ایک نشست ختم ہوئی۔',
  'event.progressionAdvance': 'مہارت دکھانے پر {name} اگلے لیول پر چلی گئی۔',
  'event.progressionReteach': 'ایک آواز آدھے سے کم درست رہی، اس لیے دوبارہ سکھائی جائے گی۔',
  'event.distressEscalated': '{name} کی کہی ہوئی کوئی بات بڑوں کے لیے نشان زد کی گئی۔',
  'event.unknown': '{event}'
};

export const messages = { en, ur } as { en: Record<MessageKey, string>; ur: Record<MessageKey, string> };
