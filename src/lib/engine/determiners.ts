import type {
	AdjectiveEntry,
	AdjectiveGenderKey,
	Case,
	CaseForms,
	Difficulty,
	DrillQuestion,
	Number_,
	Progress,
	SentenceTemplate,
	VariantForms,
	WordEntry
} from '../types';
import {
	ALL_ADJECTIVE_GENDER_KEYS,
	CASE_INDEX,
	CASE_LABELS,
	LEVEL_ORDER,
	isCase,
	isNumber
} from '../types';
import bankData from '../data/determiner_bank.json';
import templateData from '../data/determiner_templates.json';
import { getCandidates, loadTemplates, loadWordBank, pickWeightedTemplate } from './drill';
import type { FocusDef } from './focus';
import { getBlockedLemmaSet } from './lemma-blocks';
import { adjectiveCellKey, cellWeight, weightedPick } from './spacing';
import {
	generateAdjectiveSentenceDrill,
	getAdjectiveForm,
	getAdjectiveGenderKey,
	loadAdjectiveBank,
	weightedRandomAdjective
} from './adjective-drill';

/**
 * Possessives and the demonstrative: můj, tvůj, náš, váš, ten. They agree with
 * their noun in gender, number and case as adjectives do, so they are stored
 * in the adjective shape and asked through the adjective sentence drill: a
 * sentence with the noun already in it and a blank for the determiner.
 *
 * The five are a closed class, so the bank is written out by hand rather than
 * built by the MorphoDiTa pipeline. Where two forms are standard (moje / má,
 * moji / mou) the longer, everyday one is the answer shown and the short one
 * is accepted. The vocative slot repeats the nominative and is never asked.
 *
 * Two kinds of question. The `determiners` set (the Můj, tvůj, ten deck) has
 * its own sentences, each with its noun written in, and third-person subjects
 * on purpose: with "I" or "you" as the subject Czech wants svůj (Hledám svůj
 * klíč), which that deck doesn't teach. The `demonstratives` set (the Ten, ta,
 * to deck and setting) asks ten, tenhle and tento, which any subject takes, so
 * it borrows the noun sentences ("Bydlím v ___.") with a random noun the
 * sentence takes: "Bydlím v ___ domě." Every paradigm and category comes up,
 * and no sentence can be learnt by heart.
 */

/** Which sentences and words a determiner question comes from. */
export type DeterminerSet = NonNullable<FocusDef['source']>;

interface RawDeterminer {
	lemma: string;
	translation: string;
	difficulty: string;
	paradigmType: string;
	categories: string[];
	forms: Record<string, { sg: string[]; pl: string[] } | undefined>;
	variantForms: Record<
		string,
		{ sg?: Record<string, string[]>; pl?: Record<string, string[]> } | undefined
	>;
}

interface RawDeterminerTemplate {
	id: string;
	template: string;
	nounLemma: string;
	requiredCase: string;
	number: string;
	difficulty: string;
}

function isDifficulty(value: string): value is Difficulty {
	return value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2';
}

function toCaseForms(forms: string[], where: string): CaseForms {
	if (forms.length !== 7 || forms.some((f) => f.trim() === '')) {
		throw new Error(`${where}: expected 7 non-empty forms`);
	}
	return [forms[0], forms[1], forms[2], forms[3], forms[4], forms[5], forms[6]];
}

function toVariants(raw: Record<string, string[]> | undefined): VariantForms | undefined {
	if (!raw) return undefined;
	const out: VariantForms = {};
	for (const case_ of Object.values(CASE_INDEX)) {
		const forms = raw[String(case_)];
		if (forms && forms.length > 0) out[case_] = forms;
	}
	return out;
}

let cachedBank: AdjectiveEntry[] | null = null;

export function loadDeterminerBank(): AdjectiveEntry[] {
	if (cachedBank) return cachedBank;
	const raw: RawDeterminer[] = bankData;
	cachedBank = raw.map((entry) => {
		const { paradigmType, difficulty } = entry;
		if (paradigmType !== 'possessive' && paradigmType !== 'demonstrative') {
			throw new Error(`Determiner "${entry.lemma}": unknown type "${paradigmType}"`);
		}
		if (!isDifficulty(difficulty)) {
			throw new Error(`Determiner "${entry.lemma}": unknown difficulty "${difficulty}"`);
		}
		const formsFor = (key: AdjectiveGenderKey): { sg: CaseForms; pl: CaseForms } => {
			const forms = entry.forms[key];
			if (!forms) throw new Error(`Determiner "${entry.lemma}": no ${key} forms`);
			return {
				sg: toCaseForms(forms.sg, `${entry.lemma} ${key} sg`),
				pl: toCaseForms(forms.pl, `${entry.lemma} ${key} pl`)
			};
		};
		const variantForms: NonNullable<AdjectiveEntry['variantForms']> = {};
		for (const key of ALL_ADJECTIVE_GENDER_KEYS) {
			const variants = entry.variantForms[key];
			if (variants) {
				variantForms[key] = { sg: toVariants(variants.sg), pl: toVariants(variants.pl) };
			}
		}
		return {
			lemma: entry.lemma,
			translation: entry.translation,
			difficulty,
			paradigmType,
			categories: entry.categories,
			// Unused here: determiners are never matched to nouns by meaning.
			profile: 'quality',
			forms: {
				m_anim: formsFor('m_anim'),
				m_inanim: formsFor('m_inanim'),
				f: formsFor('f'),
				n: formsFor('n')
			},
			variantForms
		};
	});
	return cachedBank;
}

let cachedDeclinable: AdjectiveEntry[] | null = null;

/**
 * Adjectives and determiners together: every word with an adjective-shaped
 * table. Declension charts and the word lookup read this, so a determiner
 * question can show its table like any adjective.
 */
export function loadDeclinableBank(): AdjectiveEntry[] {
	cachedDeclinable ??= [...loadAdjectiveBank(), ...loadDeterminerBank()];
	return cachedDeclinable;
}

const GENDER_LABELS: Record<AdjectiveGenderKey, string> = {
	m_anim: 'masc. animate',
	m_inanim: 'masc. inanimate',
	f: 'feminine',
	n: 'neuter'
};

export interface DeterminerTemplate {
	id: string;
	template: SentenceTemplate;
	/** The noun written into the sentence, which the determiner agrees with. */
	noun: WordEntry;
}

function agreementLine(noun: WordEntry, case_: Case, number: Number_): string {
	const nounForm = noun.forms[number][CASE_INDEX[case_]];
	return `agrees with ${nounForm} · ${GENDER_LABELS[getAdjectiveGenderKey(noun)]} · ${CASE_LABELS[case_].toLowerCase()} ${number}`;
}

let cachedTemplates: DeterminerTemplate[] | null = null;

/** The Můj, tvůj, ten deck's own sentences. */
export function loadDeterminerTemplates(): DeterminerTemplate[] {
	if (cachedTemplates) return cachedTemplates;
	const nouns = new Map(loadWordBank().map((w) => [w.lemma, w]));
	const raw: RawDeterminerTemplate[] = templateData;
	cachedTemplates = raw.map((entry) => {
		const { requiredCase, number, difficulty } = entry;
		if (!isCase(requiredCase) || requiredCase === 'voc') {
			throw new Error(`Determiner template "${entry.id}": bad case "${requiredCase}"`);
		}
		if (!isNumber(number)) {
			throw new Error(`Determiner template "${entry.id}": bad number "${number}"`);
		}
		if (!isDifficulty(difficulty)) {
			throw new Error(`Determiner template "${entry.id}": bad difficulty "${difficulty}"`);
		}
		const noun = nouns.get(entry.nounLemma);
		if (!noun) {
			throw new Error(`Determiner template "${entry.id}": no noun "${entry.nounLemma}"`);
		}
		const template: SentenceTemplate = {
			id: entry.id,
			template: entry.template,
			lemmaCategory: 'general',
			requiredCase,
			number,
			trigger: '',
			why: agreementLine(noun, requiredCase, number),
			difficulty,
			nounLemma: entry.nounLemma,
			topics: ['determiners']
		};
		return { id: entry.id, template, noun };
	});
	return cachedTemplates;
}

// --- Ten, ta, to: noun sentences with a demonstrative in front -------------

/**
 * "Bratr je ___." asks for a predicate noun (Bratr je učitelem), which takes
 * no ten: *Bratr je tím učitelem.
 */
const PREDICATE_INSTRUMENTAL = /(^|\s)(je|být|stal|stala|zůstane)(\s+se)?\s+___/i;

/**
 * Whether a sentence's word list is one of these categories. A list template
 * (several categories) only counts when it is wholly inside them.
 */
function onlyCategories(template: SentenceTemplate, categories: readonly string[]): boolean {
	const cats = Array.isArray(template.lemmaCategory)
		? template.lemmaCategory
		: [template.lemmaCategory];
	return cats.every((c) => categories.includes(c));
}

/**
 * Whether a noun sentence reads right with ten in front of its noun. Left out:
 * the vocative (Ahoj, ___!), counting sentences (pět ___), a blank opening the
 * sentence (its ten would need a capital), predicate instrumentals, your own
 * body parts (Czech says "Myji si ruce", never *ty ruce), and points in time
 * ("Přijdu za den" is "in a day"; *za ten den* means something else). Whole
 * spans keep it: "Čekám celou tu noc" is everyday Czech.
 */
export function takesDemonstrative(template: SentenceTemplate): boolean {
	if (template.requiredCase === 'voc') return false;
	if (onlyCategories(template, ['body'])) return false;
	if (
		onlyCategories(template, ['time']) &&
		template.semanticTags?.includes('whole_span') !== true
	) {
		return false;
	}
	if (template.countContext !== undefined || template.topics?.includes('numbers')) return false;
	if (template.template.includes('{')) return false;
	if (template.template.trimStart().startsWith('___')) return false;
	return !(template.requiredCase === 'ins' && PREDICATE_INSTRUMENTAL.test(template.template));
}

const DEMONSTRATIVE_ID_PREFIX = 'dem:';

/** The noun sentence a frame was made from, under its own id. */
function originalTemplate(frame: SentenceTemplate): SentenceTemplate {
	return { ...frame, id: frame.id.slice(DEMONSTRATIVE_ID_PREFIX.length) };
}

/**
 * Whether a noun can stand in a frame with ten in front: not a place name
 * ("v té Praze" is marked, not neutral), and not a pair blocked for the ten
 * deck itself — `lemma_blocks.json` takes `dem:<id>` keys beside the noun
 * sentence's own, so a pairing that reads wrong only with ten can be blocked
 * there alone.
 */
function frameTakesNoun(frame: SentenceTemplate, noun: WordEntry): boolean {
	return (
		!noun.categories.includes('place_name') &&
		!getBlockedLemmaSet('sentence', frame.id).has(noun.lemma)
	);
}

const EVERY_LEVEL: Progress = {
	level: 'B2',
	caseScores: {},
	paradigmScores: {},
	lemmaScores: {},
	cellSchedule: {},
	lastSession: '',
	longestStreak: 0
};

let cachedFrames: SentenceTemplate[] | null = null;

/**
 * The noun sentences the Ten, ta, to deck asks, tagged with the deck. Their
 * ids are prefixed so they never collide with the noun questions' own. A
 * frame's level is the later of its own and its easiest noun's, so a level
 * only counts (and asks) frames it has a noun for; frames with no noun at
 * all are left out.
 */
export function demonstrativeFrames(): SentenceTemplate[] {
	if (cachedFrames) return cachedFrames;
	const frames: SentenceTemplate[] = [];
	for (const t of loadTemplates().filter(takesDemonstrative)) {
		const frame: SentenceTemplate = {
			...t,
			id: `${DEMONSTRATIVE_ID_PREFIX}${t.id}`,
			topics: ['demonstratives']
		};
		const nouns = getCandidates(t, EVERY_LEVEL).filter((w) => frameTakesNoun(frame, w));
		const easiest = LEVEL_ORDER.find((l) => nouns.some((w) => w.difficulty === l));
		if (!easiest) continue;
		const later =
			LEVEL_ORDER.indexOf(easiest) > LEVEL_ORDER.indexOf(t.difficulty) ? easiest : t.difficulty;
		frames.push({ ...frame, difficulty: later });
	}
	cachedFrames = frames;
	return frames;
}

/**
 * The nouns a frame can be asked with now: what the noun sentence itself
 * takes at the learner's level (categories, block lists, gender, and the
 * singular-first gate on plurals, from the memoized pools in `drill.ts`),
 * within the allowed difficulties and the caller's noun filter.
 */
function frameNouns(frame: SentenceTemplate, pick: DeterminerPick): WordEntry[] {
	const nounFilter = pick.nounFilter;
	return getCandidates(originalTemplate(frame), pick.progress, {
		skipSingularFirst: pick.skipSingularFirst
	}).filter(
		(w) =>
			pick.difficulties.includes(w.difficulty) &&
			frameTakesNoun(frame, w) &&
			(nounFilter === undefined || nounFilter(w))
	);
}

/**
 * A noun for the frame. Each gender is weighted by how due its demonstrative
 * cell is (the cells ten questions advance), so a gender the learner keeps
 * missing comes back sooner; within a gender the noun is uniform.
 */
function pickFrameNoun(
	nouns: WordEntry[],
	frame: SentenceTemplate,
	progress: Progress,
	random: () => number
): WordEntry | null {
	const byGender = new Map<AdjectiveGenderKey, WordEntry[]>();
	for (const noun of nouns) {
		const key = getAdjectiveGenderKey(noun);
		const group = byGender.get(key);
		if (group) group.push(noun);
		else byGender.set(key, [noun]);
	}
	if (byGender.size === 0) return null;
	const genders = [...byGender.keys()];
	const now = Date.now();
	const gender = weightedPick(
		genders,
		genders.map((g) =>
			cellWeight(
				progress.cellSchedule[
					adjectiveCellKey('demonstrative', g, frame.requiredCase, frame.number)
				],
				now
			)
		),
		random
	);
	const group = byGender.get(gender) ?? [];
	return group[Math.floor(random() * group.length)] ?? null;
}

/**
 * Both decks' sentences, each tagged with its deck, for counting and filtering
 * alongside the noun templates.
 */
export function determinerSentenceTemplates(): SentenceTemplate[] {
	return [...loadDeterminerTemplates().map((t) => t.template), ...demonstrativeFrames()];
}

/**
 * tenhle (everyday) and tento (formal) are ten plus -hle / -to in every form,
 * and mean much the same. The Ten, ta, to deck asks all three; the Můj, tvůj,
 * ten deck asks only ten. Wherever ten is asked, their forms count as right.
 */
const TEN_SYNONYMS: ReadonlySet<string> = new Set(['tenhle', 'tento']);

/** How often the Ten, ta, to deck asks each word: mostly ten, then the spoken tenhle. */
const DEMONSTRATIVE_WEIGHTS: Record<string, number> = { ten: 5, tenhle: 3, tento: 2 };

function pickDemonstrative(allowed: AdjectiveEntry[], random: () => number): AdjectiveEntry | null {
	const pool = allowed.filter((d) => d.paradigmType === 'demonstrative');
	if (pool.length === 0) return null;
	return weightedPick(
		pool,
		pool.map((d) => DEMONSTRATIVE_WEIGHTS[d.lemma] ?? 1),
		random
	);
}

/** A ten question that also accepts the same slot of tenhle and tento. */
function withTenSynonyms(question: DrillQuestion, determiner: AdjectiveEntry): DrillQuestion {
	if (determiner.lemma !== 'ten') return question;
	const gender = getAdjectiveGenderKey(question.word);
	const extra = loadDeterminerBank()
		.filter((d) => TEN_SYNONYMS.has(d.lemma))
		.map((d) => getAdjectiveForm(d, gender, question.case, question.number))
		.filter((f): f is string => f !== null);
	return { ...question, acceptedAnswers: [...(question.acceptedAnswers ?? []), ...extra] };
}

/**
 * Forms everyday spoken Czech uses in place of the written ones: těma for the
 * instrumental plural těmi (s těma holkama), ty for the masculine animate
 * plural ti (ty kluci), and tý for the feminine té (od tý holky), with the
 * same in tenhle. Tento is written Czech and has none. The answer shown stays
 * the written form, but the spoken one counts as right, with a note saying
 * it is colloquial. Each written form here is unique to its slot (té is only
 * feminine singular, ti only masculine animate plural), so the swap never
 * fires where the spoken form would be wrong.
 */
const COLLOQUIAL_FORMS: Readonly<Record<string, { form: string; example: string }>> = {
	těmi: { form: 'těma', example: 's těma holkama' },
	těmihle: { form: 'těmahle', example: 's těmahle holkama' },
	ti: { form: 'ty', example: 'ty kluci' },
	tihle: { form: 'tyhle', example: 'tyhle kluci' },
	té: { form: 'tý', example: 'od tý holky' },
	téhle: { form: 'týhle', example: 'od týhle holky' }
};

function colloquialNote(standard: string): string | null {
	const spoken = COLLOQUIAL_FORMS[standard];
	if (!spoken) return null;
	return `Spoken Czech often says ${spoken.form} (${spoken.example}); written Czech uses ${standard}.`;
}

/** A frame the filters allow (recently seen ones last), written out with a noun. */
function pickFrame(
	pick: DeterminerPick,
	fits: (t: SentenceTemplate) => boolean,
	random: () => number
): { template: SentenceTemplate; noun: WordEntry } | null {
	const frames = demonstrativeFrames().filter(fits);
	const frame = pickWeightedTemplate(
		frames,
		(t) => frameNouns(t, pick).length,
		pick.recentTemplateIds,
		random
	);
	if (!frame) return null;
	const noun = pickFrameNoun(frameNouns(frame, pick), frame, pick.progress, random);
	if (!noun) return null;
	const nounForm = noun.forms[frame.number][CASE_INDEX[frame.requiredCase]];
	return {
		noun,
		template: {
			...frame,
			template: frame.template.replace('___', `___ ${nounForm}`),
			why: `${agreementLine(noun, frame.requiredCase, frame.number)}\n${frame.why}`,
			nounLemma: noun.lemma
		}
	};
}

export interface DeterminerPick {
	/** Defaults to `determiners`; `demonstratives` asks ten, tenhle and tento. */
	set?: DeterminerSet;
	/** Only this word (mistake review re-asks the word that was missed). */
	lemma?: string;
	/** Ten questions only: the nouns allowed, e.g. a chapter's vocabulary. */
	nounFilter?: (noun: WordEntry) => boolean;
	/** Ten questions only: ask plurals without the A2 singular-first gate. */
	skipSingularFirst?: boolean;
	cases: readonly Case[];
	numbers: readonly Number_[];
	difficulties: readonly string[];
	progress: Progress;
	recentTemplateIds: readonly string[];
	random?: () => number;
}

/**
 * The next determiner question: a sentence the filters allow (recently seen
 * ones last), then the determiner whose cell is most due, as adjectives are
 * picked. Null when the filters leave no sentence.
 */
export function pickDeterminerQuestion(pick: DeterminerPick): DrillQuestion | null {
	const random = pick.random ?? Math.random;
	const set = pick.set ?? 'determiners';
	const fits = (t: SentenceTemplate) =>
		pick.cases.includes(t.requiredCase) &&
		pick.numbers.includes(t.number) &&
		pick.difficulties.includes(t.difficulty);
	const chosen =
		set === 'demonstratives'
			? pickFrame(pick, fits, random)
			: pickWeightedTemplate(
					loadDeterminerTemplates().filter((t) => fits(t.template)),
					() => 1,
					pick.recentTemplateIds,
					random
				);
	if (!chosen) return null;
	const { template, noun } = chosen;
	const allowed = loadDeterminerBank().filter(
		(d) =>
			pick.difficulties.includes(d.difficulty) &&
			(pick.lemma === undefined || d.lemma === pick.lemma)
	);
	let determiner: AdjectiveEntry | null;
	if (set === 'demonstratives') {
		determiner = pickDemonstrative(allowed, random);
	} else {
		const determiners = allowed.filter((d) => !TEN_SYNONYMS.has(d.lemma));
		determiner =
			determiners.length === 0
				? null
				: weightedRandomAdjective(
						determiners,
						pick.progress,
						template.requiredCase,
						template.number,
						noun,
						Date.now(),
						random
					);
	}
	if (!determiner) return null;
	const generated = generateAdjectiveSentenceDrill(template, determiner, noun);
	if (!generated) return null;
	const question = withTenSynonyms(generated, determiner);
	const standard = question.acceptedAnswers ?? [];
	// Where another form is standard too, say so: a learner who typed "mou"
	// and sees "moji" as the answer should know both are right.
	const notes: string[] = [];
	const others = standard.filter((f) => f !== question.correctAnswer);
	if (others.length > 0) notes.push(`Also correct: ${others.join(', ')}`);
	// Spoken forms count as right but are named as spoken, apart from the list.
	const colloquial = standard.flatMap((f) => {
		const spoken = COLLOQUIAL_FORMS[f];
		return spoken ? [spoken.form] : [];
	});
	const note = colloquialNote(question.correctAnswer);
	if (note) notes.push(note);
	if (notes.length === 0) return question;
	return {
		...question,
		acceptedAnswers: [...standard, ...colloquial],
		template: { ...template, why: [template.why, ...notes].join('\n') }
	};
}

/**
 * A missed determiner asked again in mistake review, in a fresh sentence (its
 * form depends on the noun, which a stored mistake doesn't keep). The mistake
 * may come from a higher level than the learner's current one, so no level
 * limit applies: every case, number and difficulty is open. Null when the
 * lemma isn't a determiner, or nothing fits the case and number.
 */
export function reviewDeterminerQuestion(
	lemma: string,
	case_: Case,
	number: Number_,
	progress: Progress
): DrillQuestion | null {
	const determiner = loadDeterminerBank().find((d) => d.lemma === lemma);
	if (!determiner) return null;
	return pickDeterminerQuestion({
		set: determiner.paradigmType === 'demonstrative' ? 'demonstratives' : 'determiners',
		lemma,
		cases: [case_],
		numbers: [number],
		difficulties: LEVEL_ORDER,
		// B2 opens every case and number, with no singular-first gate.
		progress: { ...progress, level: 'B2' },
		recentTemplateIds: []
	});
}
