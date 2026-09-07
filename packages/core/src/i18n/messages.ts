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

  // --- certificate + sharing ------------------------------------------------
  'cert.title': 'Certificate of reading',
  'cert.awardedTo': 'Awarded to',
  'cert.achievement': 'for reaching level {level} and learning {count} sounds',
  'cert.soundsLearned': 'Sounds {name} can read',
  'cert.wordsRead': '{count} words read aloud',
  'cert.issued': 'Issued {date}',
  'cert.signature': 'Qissa — a living primer',
  'cert.open': 'Progress certificate',
  'cert.openHint': 'A printable page to put on the fridge.',
  'cert.notYet': 'Once {name} has read a first story, a certificate appears here.',
  'share.whatsapp': 'Share on WhatsApp',
  'share.message':
    '{name} is learning to read with Qissa — now at level {level}, with {count} sounds mastered and {words} words read aloud. 📖',

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
  'event.unknown': '{event}',

  // --- child setup (the world seed) ----------------------------------------
  'setup.title': "Set up your child's world",
  'setup.subtitle':
    'Five minutes now, stories forever. These details become the canon of every story Qissa tells.',
  'setup.childName': "Child's name",
  'setup.birthDate': 'Birth date',
  'setup.heroName': 'Story hero name',
  'setup.city': 'Your city',
  'setup.cityPlaceholder': 'Lahore',
  'setup.petName': 'Pet name',
  'setup.petKind': 'Pet kind',
  'setup.petKindPlaceholder': 'cat',
  'setup.optional': '(optional)',
  'setup.challenge': "Something they're working on",
  'setup.challengeHint': '(optional - shapes the first theme)',
  'setup.challengePlaceholder': 'starting a new school',
  'setup.consentLead': 'Voice consent.',
  'setup.consentBody':
    'I allow short reading clips to be kept for up to 30 days so I can hear progress in the digest. Without this, no audio is ever stored - reading still works fully.',
  'setup.saving': 'Saving...',
  'setup.submit': 'Create world',
  'setup.error': 'Could not save. Check the fields and try again.',
  // --- sign in / register --------------------------------------------------
  'login.pitchLine1': 'Not a reading app.',
  'login.pitchLine2': "Your child's first real book.",
  'login.pitchBody':
    'Living stories that teach sounds and words - and weave in numbers, colors, nature and feelings - built fresh for your child every time.',
  'login.illustrationAlt': 'A parent and child reading a storybook together',
  'login.promiseGate': 'Every story passes a safety and decodability gate',
  'login.promiseCap': 'Gentle session caps protect playtime',
  'login.promiseVoice': 'Voice stays private - your consent decides',
  'login.titleSignIn': 'Parent sign-in',
  'login.titleRegister': 'Create a parent account',
  'login.blurbSignIn':
    'One account for the grown-ups. Children never need a login - they just tap their story.',
  'login.blurbRegister':
    'Qissa accounts belong to the grown-up. Your child never signs in - they just tap their story.',
  'login.fullName': 'Your full name',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.passwordHint': '(10+ characters)',
  'login.birthDate': 'Your date of birth',
  'login.birthDateHint': "Yours, not your child's - accounts are for grown-ups.",
  'login.guardian':
    'I am the parent or legal guardian of the child who will use Qissa, and I consent to their use of it.',
  'login.busy': 'One moment...',
  'login.submitSignIn': 'Sign in',
  'login.submitRegister': 'Create account',
  'login.switchToRegister': 'New here? Create an account',
  'login.switchToSignIn': 'Already have an account? Sign in',
  // --- story archive -------------------------------------------------------
  'archive.title': 'Story archive',
  'archive.subtitle': 'Stored on this device only - this page works fully offline.',
  'archive.back': 'Back',
  'archive.empty': "Nothing here yet. Every story you serve is recorded automatically as it's read.",
  'archive.entryMeta': 'Level {level} · sound "{grapheme}" · served {when}',
  'archive.readAgain': 'Read again',
  // --- parent dashboard ----------------------------------------------------
  'dash.tagline': "Your child's living primer — {email}",
  'dash.signOut': 'Sign out',
  'dash.yourChildren': 'Your children',
  'dash.addChild': '+ Add child',
  'dash.noChildren': 'No children yet — set up a world and the first story will teach the first sounds.',
  'dash.phonicsLevel': 'Phonics level {level}',
  'dash.readTogether': 'Read together',
  'dash.progress': 'Progress',
  'dash.modesAndControls': 'Modes & controls',
  'dash.ageAndDoor': 'Age {age} · {door}',
  'dash.plusStoryTime': ' + Story Time',
  'dash.learningDoor': 'Learning door',
  'dash.doorAuto': 'Match age (recommended)',
  'dash.doorFirstWords': 'First Words (1-2)',
  'dash.doorLearnToRead': 'Learn to Read (3-6)',
  'dash.storyTime': 'Story Time',
  'dash.storyTimeHint': 'Narrated stories - listening & watching',
  'dash.storyTimePace': 'Story Time pace',
  'dash.paceFluent': 'Fluent - like a cartoon',
  'dash.paceSlow': 'Slow & gentle',
  'dash.lowBandwidth': 'Low-bandwidth mode',
  'dash.dailyCap': 'Daily session cap (minutes)',
  'dash.serverDefault': 'Server default',
  'dash.breadthTitle': 'More than letters - a whole primer',
  'dash.breadthIntro':
    'Reading is the engine. Every story also carries the wider world, in the picture walk, the art and the mission for home.',
  'dash.breadthSoundsName': 'Sounds & words',
  'dash.breadthSoundsHow': 'The engine: one new sound per story, every word decodable, gated for safety.',
  'dash.breadthSpokenName': 'Spoken language',
  'dash.breadthSpokenHow': 'A picture-walk builds rich vocabulary and meaning before the child reads.',
  'dash.breadthColorsName': 'Colors & numbers',
  'dash.breadthColorsHow': 'Woven into the picture talk and the art of each story, at the right moment.',
  'dash.breadthWorldName': 'The living world',
  'dash.breadthWorldHow': 'Animals, plants, weather and how things work fold naturally into each tale.',
  'dash.breadthFeelingsName': 'Feelings & character',
  'dash.breadthFeelingsHow': 'A rotating values curriculum - courage, kindness, patience - in every theme.',
  'dash.breadthHomeName': 'Home missions',
  'dash.breadthHomeHow': 'Every session ends with a real-world task the family does together.',
  'dash.demoControl': 'Demo control',
  'dash.storyArchive': 'Story archive',
  'dash.consentGiven': 'Voice consent: given',
  'dash.consentMissing': 'Voice consent: not given'
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

  'cert.title': 'پڑھنے کی سند',
  'cert.awardedTo': 'بنام',
  'cert.achievement': 'لیول {level} تک پہنچنے اور {count} آوازیں سیکھنے پر',
  'cert.soundsLearned': 'وہ آوازیں جو {name} پڑھ سکتی ہے',
  'cert.wordsRead': '{count} الفاظ بلند آواز میں پڑھے',
  'cert.issued': 'اجرا: {date}',
  'cert.signature': 'قصہ — ایک زندہ قاعدہ',
  'cert.open': 'پیش رفت کی سند',
  'cert.openHint': 'ایک قابلِ پرنٹ صفحہ، فریج پر لگانے کے لیے۔',
  'cert.notYet': '{name} کی پہلی کہانی پڑھنے کے بعد یہاں سند آ جائے گی۔',
  'share.whatsapp': 'واٹس ایپ پر شیئر کریں',
  'share.message':
    '{name} قصہ کے ساتھ پڑھنا سیکھ رہی ہے — اب لیول {level} پر، {count} آوازیں سیکھ لیں اور {words} الفاظ بلند آواز میں پڑھے۔ 📖',

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
  'event.unknown': '{event}',

  // --- child setup (the world seed) ----------------------------------------
  'setup.title': 'اپنے بچے کی دنیا بنائیں',
  'setup.subtitle':
    'ابھی پانچ منٹ، کہانیاں ہمیشہ کے لیے۔ یہ تفصیلات ہر کہانی کی بنیاد بن جاتی ہیں جو قصہ سناتا ہے۔',
  'setup.childName': 'بچے کا نام',
  'setup.birthDate': 'تاریخ پیدائش',
  'setup.heroName': 'کہانی کے ہیرو کا نام',
  'setup.city': 'آپ کا شہر',
  'setup.cityPlaceholder': 'لاہور',
  'setup.petName': 'پالتو جانور کا نام',
  'setup.petKind': 'کون سا جانور',
  'setup.petKindPlaceholder': 'بلی',
  'setup.optional': '(اختیاری)',
  'setup.challenge': 'کوئی بات جس پر وہ اِن دنوں کام کر رہے ہیں',
  'setup.challengeHint': '(اختیاری — پہلا تھیم اِسی سے بنتا ہے)',
  'setup.challengePlaceholder': 'نئے سکول کی شروعات',
  'setup.consentLead': 'آواز کی اجازت۔',
  'setup.consentBody':
    'میں اجازت دیتا ہوں کہ پڑھنے کے مختصر کلپ ۳۰ دن تک رکھے جائیں تاکہ میں ڈائجسٹ میں پیش رفت سن سکوں۔ اِس کے بغیر کوئی آواز محفوظ نہیں ہوتی — پڑھنا پھر بھی مکمل چلتا ہے۔',
  'setup.saving': 'محفوظ ہو رہا ہے…',
  'setup.submit': 'دنیا بنائیں',
  'setup.error': 'محفوظ نہیں ہو سکا۔ خانے دیکھ کر دوبارہ کوشش کریں۔',
  // --- sign in / register --------------------------------------------------
  'login.pitchLine1': 'یہ پڑھنے کی ایپ نہیں۔',
  'login.pitchLine2': 'یہ آپ کے بچے کی پہلی سچی کتاب ہے۔',
  'login.pitchBody':
    'جیتی جاگتی کہانیاں جو آوازیں اور الفاظ سکھاتی ہیں — اور ساتھ گنتی، رنگ، قدرت اور جذبات بھی — ہر بار آپ کے بچے کے لیے نئی۔',
  'login.illustrationAlt': 'ایک والد اور بچہ مل کر کہانی کی کتاب پڑھ رہے ہیں',
  'login.promiseGate': 'ہر کہانی حفاظت اور پڑھنے کی جانچ سے گزرتی ہے',
  'login.promiseCap': 'نرم وقت کی حد کھیل کے وقت کی حفاظت کرتی ہے',
  'login.promiseVoice': 'آواز نجی رہتی ہے — فیصلہ آپ کی اجازت کا ہے',
  'login.titleSignIn': 'والدین کا سائن اِن',
  'login.titleRegister': 'والدین کا اکاؤنٹ بنائیں',
  'login.blurbSignIn': 'ایک اکاؤنٹ بڑوں کے لیے۔ بچوں کو لاگ اِن کی ضرورت نہیں — وہ صرف اپنی کہانی پر ٹیپ کرتے ہیں۔',
  'login.blurbRegister': 'قصہ کے اکاؤنٹ بڑوں کے ہوتے ہیں۔ آپ کا بچہ سائن اِن نہیں کرتا — وہ صرف اپنی کہانی پر ٹیپ کرتا ہے۔',
  'login.fullName': 'آپ کا پورا نام',
  'login.email': 'ای میل',
  'login.password': 'پاس ورڈ',
  'login.passwordHint': '(کم از کم ۱۰ حروف)',
  'login.birthDate': 'آپ کی تاریخ پیدائش',
  'login.birthDateHint': 'آپ کی، بچے کی نہیں — اکاؤنٹ بڑوں کے لیے ہیں۔',
  'login.guardian': 'میں اُس بچے کا والد/والدہ یا قانونی سرپرست ہوں جو قصہ استعمال کرے گا، اور مجھے اِس کی اجازت ہے۔',
  'login.busy': 'ایک لمحہ…',
  'login.submitSignIn': 'سائن اِن',
  'login.submitRegister': 'اکاؤنٹ بنائیں',
  'login.switchToRegister': 'نئے ہیں؟ اکاؤنٹ بنائیں',
  'login.switchToSignIn': 'اکاؤنٹ موجود ہے؟ سائن اِن کریں',
  // --- story archive -------------------------------------------------------
  'archive.title': 'کہانیوں کا ذخیرہ',
  'archive.subtitle': 'صرف اِسی ڈیوائس پر محفوظ — یہ صفحہ بغیر انٹرنیٹ بھی مکمل چلتا ہے۔',
  'archive.back': 'واپس',
  'archive.empty': 'ابھی کچھ نہیں۔ جو کہانی بھی پڑھی جائے، وہ خود بخود یہاں محفوظ ہو جاتی ہے۔',
  'archive.entryMeta': 'لیول {level} · آواز ”{grapheme}“ · دی گئی {when}',
  'archive.readAgain': 'دوبارہ پڑھیں',
  // --- parent dashboard ----------------------------------------------------
  'dash.tagline': 'آپ کے بچے کا جیتا جاگتا پرائمر — {email}',
  'dash.signOut': 'سائن آؤٹ',
  'dash.yourChildren': 'آپ کے بچے',
  'dash.addChild': '+ بچہ شامل کریں',
  'dash.noChildren': 'ابھی کوئی بچہ نہیں — ایک دنیا بنائیں اور پہلی کہانی پہلی آوازیں سکھائے گی۔',
  'dash.phonicsLevel': 'فونکس لیول {level}',
  'dash.readTogether': 'ساتھ پڑھیں',
  'dash.progress': 'پیش رفت',
  'dash.modesAndControls': 'موڈز اور کنٹرول',
  'dash.ageAndDoor': 'عمر {age} · {door}',
  'dash.plusStoryTime': ' + کہانی کا وقت',
  'dash.learningDoor': 'سیکھنے کا دروازہ',
  'dash.doorAuto': 'عمر کے مطابق (تجویز کردہ)',
  'dash.doorFirstWords': 'پہلے الفاظ (۱–۲)',
  'dash.doorLearnToRead': 'پڑھنا سیکھیں (۳–۶)',
  'dash.storyTime': 'کہانی کا وقت',
  'dash.storyTimeHint': 'سنائی جانے والی کہانیاں — سننا اور دیکھنا',
  'dash.storyTimePace': 'کہانی کی رفتار',
  'dash.paceFluent': 'روانی سے — کارٹون کی طرح',
  'dash.paceSlow': 'آہستہ اور نرمی سے',
  'dash.lowBandwidth': 'کم ڈیٹا موڈ',
  'dash.dailyCap': 'روزانہ نشست کی حد (منٹ)',
  'dash.serverDefault': 'سرور کی طے شدہ حد',
  'dash.breadthTitle': 'صرف حروف نہیں — ایک مکمل پرائمر',
  'dash.breadthIntro':
    'پڑھنا اِس کا انجن ہے۔ ہر کہانی تصویر کی بات، آرٹ اور گھر کے کام کے ذریعے پوری دنیا بھی ساتھ لاتی ہے۔',
  'dash.breadthSoundsName': 'آوازیں اور الفاظ',
  'dash.breadthSoundsHow': 'انجن: ہر کہانی میں ایک نئی آواز، ہر لفظ پڑھنے کے قابل، حفاظت کے لیے جانچا ہوا۔',
  'dash.breadthSpokenName': 'بولی جانے والی زبان',
  'dash.breadthSpokenHow': 'پڑھنے سے پہلے تصویر کی بات ذخیرۂ الفاظ اور مطلب مضبوط کرتی ہے۔',
  'dash.breadthColorsName': 'رنگ اور گنتی',
  'dash.breadthColorsHow': 'ہر کہانی کی تصویر کی بات اور آرٹ میں، عین موقع پر شامل۔',
  'dash.breadthWorldName': 'جیتی جاگتی دنیا',
  'dash.breadthWorldHow': 'جانور، پودے، موسم اور چیزیں کیسے چلتی ہیں — سب کہانی میں قدرتی طور پر گھل جاتے ہیں۔',
  'dash.breadthFeelingsName': 'جذبات اور کردار',
  'dash.breadthFeelingsHow': 'اقدار کا گھومتا نصاب — ہمت، مہربانی، صبر — ہر تھیم میں۔',
  'dash.breadthHomeName': 'گھر کے مشن',
  'dash.breadthHomeHow': 'ہر نشست کے آخر میں ایک اصل کام جو گھر والے مل کر کرتے ہیں۔',
  'dash.demoControl': 'ڈیمو کنٹرول',
  'dash.storyArchive': 'کہانیوں کا ذخیرہ',
  'dash.consentGiven': 'آواز کی اجازت: دی گئی',
  'dash.consentMissing': 'آواز کی اجازت: نہیں دی گئی'
};

export const messages = { en, ur } as { en: Record<MessageKey, string>; ur: Record<MessageKey, string> };
