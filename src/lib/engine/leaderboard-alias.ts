/**
 * Pseudonymous display names for the global weekly leaderboard. Shared by the
 * server (every entry it returns) and the client (the viewer's own placeholder
 * row when the streamed payload predates their guest cookie), so the same id
 * always shows the same name. Pure module with no deps.
 *
 * Names are a Czech adjective plus a Czech noun — food, folklore, pastimes —
 * with the adjective agreeing in gender (Statečná Svíčková, Ospalé Kuře), so
 * every name quietly shows the -ý / -á / -é rule. `aliasGloss` gives the
 * English and a line of background for the hover.
 */

type Gender = 'm' | 'f' | 'n';

/** Kitchen words only go on dishes that are really made that way. */
type Kitchen = 'crunchy' | 'fried' | 'smoked' | 'pickled' | 'homemade' | 'yesterday';

interface AliasNoun {
	cz: string;
	gender: Gender;
	en: string;
	note: string;
	kitchen: readonly Kitchen[];
	/** Adjective stems that make no sense with this noun. */
	refuses?: readonly string[];
}

interface AliasAdjective {
	/** Hard adjectives: stem without -ý/-á/-é. Soft adjectives: the full form. */
	stem: string;
	en: string;
	soft: boolean;
	/** Set for kitchen words, which only pair with dishes that list them. */
	kitchen: Kitchen | null;
}

const NOUNS: readonly AliasNoun[] = [
	{
		cz: 'knedlík',
		gender: 'm',
		en: 'Dumpling',
		note: 'The bread dumpling, sliced into rounds and served next to anything with a sauce. Half of Czech cooking leans on it.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'utopenec',
		gender: 'm',
		en: 'Drowned Man',
		note: 'A fat sausage stuffed with onion and chili and left to pickle in a jar on the bar. The name comes from how it looks floating in there. A beer snack.',
		kitchen: ['homemade']
	},
	{
		cz: 'hermelín',
		gender: 'm',
		en: 'Hermelín',
		note: 'Czech camembert. The pub version sits in oil with garlic, onion and chili for a week, and you eat it with bread and beer.',
		kitchen: ['pickled', 'fried', 'smoked']
	},
	{
		cz: 'smažák',
		gender: 'm',
		en: 'Fried Cheese',
		note: 'A thick slab of cheese, breaded and fried, with fries and tartar sauce. Every school canteen and beer garden serves it.',
		kitchen: ['crunchy', 'homemade']
	},
	{
		cz: 'bramborák',
		gender: 'm',
		en: 'Potato Pancake',
		note: 'Grated potato with garlic and marjoram, fried flat until the edges crackle.',
		kitchen: ['crunchy', 'homemade']
	},
	{
		cz: 'rohlík',
		gender: 'm',
		en: 'Bread Roll',
		note: 'The plain crescent roll that costs a few crowns and turns up at every breakfast and snack.',
		kitchen: ['crunchy', 'yesterday']
	},
	{
		cz: 'párek',
		gender: 'm',
		en: 'Frankfurter',
		note: 'Usually eaten as párek v rohlíku: a hot sausage pushed into a hollowed-out roll with mustard.',
		kitchen: ['homemade']
	},
	{
		cz: 'guláš',
		gender: 'm',
		en: 'Goulash',
		note: 'Thick beef stew with paprika and onion, mopped up with dumplings or bread. Everyone agrees it tastes better the next day.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'langoš',
		gender: 'm',
		en: 'Fried Flatbread',
		note: 'Deep-fried dough rubbed with garlic and topped with ketchup and cheese. Summer food at the lake or the pool.',
		kitchen: ['crunchy']
	},
	{
		cz: 'koláč',
		gender: 'm',
		en: 'Kolache',
		note: 'Round pastry with poppy seed, tvaroh or plum jam in the middle. Weddings need them by the hundred.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'chlebíček',
		gender: 'm',
		en: 'Open Sandwich',
		note: 'A slice of bread piled with potato salad, ham, egg and a pickle. It appears at every party and office birthday.',
		kitchen: ['yesterday']
	},
	{
		cz: 'perník',
		gender: 'm',
		en: 'Gingerbread',
		note: 'Spiced honey cake. The town of Pardubice is famous for it.',
		kitchen: ['homemade']
	},
	{
		cz: 'trdelník',
		gender: 'm',
		en: 'Chimney Cake',
		note: 'Dough wrapped round a spit, baked and rolled in sugar. Sold on every Prague corner, though few Czechs grew up eating it.',
		kitchen: ['crunchy'],
		refuses: ['moravsk']
	},
	{
		cz: 'kapr',
		gender: 'm',
		en: 'Carp',
		note: 'Christmas Eve dinner, fried, with potato salad. Some families still keep a live carp in the bathtub for a few days first.',
		kitchen: ['fried', 'smoked']
	},
	{
		cz: 'krtek',
		gender: 'm',
		en: 'Mole',
		note: 'The little cartoon mole with the big eyes, loved by every Czech child since the 1950s.',
		kitchen: []
	},
	{
		cz: 'vodník',
		gender: 'm',
		en: 'Water Goblin',
		note: 'He lives in the pond, wears a green coat that drips from one tail, and keeps the souls of the drowned under upturned teacups.',
		kitchen: []
	},
	{
		cz: 'golem',
		gender: 'm',
		en: 'Golem',
		note: 'The clay giant of Prague legend, said to sleep in the attic of the Old-New Synagogue.',
		kitchen: [],
		refuses: ['moravsk']
	},
	{
		cz: 'skřítek',
		gender: 'm',
		en: 'Pixie',
		note: 'A little house or forest sprite, the one who gets blamed when your keys go missing.',
		kitchen: []
	},
	{
		cz: 'houbař',
		gender: 'm',
		en: 'Mushroom Hunter',
		note: 'Mushroom picking is close to a national obsession. After a good rain whole families head to the woods at dawn with baskets and pocket knives, the news reports when the mushrooms are up, and nobody will tell you where their secret spot is.',
		kitchen: []
	},
	{
		cz: 'chalupář',
		gender: 'm',
		en: 'Cottager',
		note: 'Czechs have one of the highest rates of weekend cottages in the world. Come Friday the cities empty out as people drive to the chalupa to garden, fix the roof, chop wood and grill with the neighbours.',
		kitchen: []
	},
	{
		cz: 'svíčková',
		gender: 'f',
		en: 'Svíčková',
		note: 'Beef in a creamy root-vegetable sauce with dumplings, cranberries and a swirl of whipped cream. The Sunday lunch at grandma’s.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'buchta',
		gender: 'f',
		en: 'Sweet Bun',
		note: 'Yeast buns filled with jam, poppy seed or tvaroh, baked packed together in one tray and pulled apart warm.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'tlačenka',
		gender: 'f',
		en: 'Head Cheese',
		note: 'Pressed pork in jelly, sliced and doused with vinegar and raw onion. A pub snack for the brave.',
		kitchen: ['homemade']
	},
	{
		cz: 'bábovka',
		gender: 'f',
		en: 'Bundt Cake',
		note: 'A tall cake baked in a fluted ring tin, often marbled with cocoa. Every grandmother has her own recipe.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'kremrole',
		gender: 'f',
		en: 'Cream Horn',
		note: 'A flaky pastry tube stuffed with whipped cream or meringue, sold in every cukrárna.',
		kitchen: ['crunchy', 'homemade']
	},
	{
		cz: 'polévka',
		gender: 'f',
		en: 'Soup',
		note: 'A proper Czech lunch starts with one, even in summer.',
		kitchen: ['homemade', 'yesterday']
	},
	{
		cz: 'kulajda',
		gender: 'f',
		en: 'Kulajda',
		note: 'Creamy South Bohemian soup with mushrooms, potatoes, lots of dill and a soft egg that breaks into the bowl.',
		kitchen: ['homemade'],
		refuses: ['moravsk']
	},
	{
		cz: 'česnečka',
		gender: 'f',
		en: 'Garlic Soup',
		note: 'Garlic broth with potatoes, cheese and croutons. The national hangover cure.',
		kitchen: ['homemade']
	},
	{
		cz: 'palačinka',
		gender: 'f',
		en: 'Crêpe',
		note: 'A thin pancake rolled round jam and topped with whipped cream.',
		kitchen: ['homemade']
	},
	{
		cz: 'vánočka',
		gender: 'f',
		en: 'Christmas Bread',
		note: 'A tall braided loaf with raisins and almonds, baked for Christmas.',
		kitchen: ['homemade'],
		refuses: ['vánoční']
	},
	{
		cz: 'houba',
		gender: 'f',
		en: 'Mushroom',
		note: 'What the houbař brings home. Fried in breadcrumbs, pickled in jars, or dried on strings above the stove.',
		kitchen: ['fried', 'pickled']
	},
	{
		cz: 'chalupa',
		gender: 'f',
		en: 'Cottage',
		note: 'The family’s country cottage, often in the family for generations. Summers, weekends and holidays all end up there.',
		kitchen: []
	},
	{
		cz: 'rusalka',
		gender: 'f',
		en: 'Water Nymph',
		note: 'A spirit of lakes and rivers, best known from the opera where she sings her song to the moon.',
		kitchen: []
	},
	{
		cz: 'bludička',
		gender: 'f',
		en: 'Will-o’-the-Wisp',
		note: 'A little light over the marsh at night that leads travellers off the path.',
		kitchen: []
	},
	{
		cz: 'kuře',
		gender: 'n',
		en: 'Chicken',
		note: 'Roast chicken with potatoes, or breaded and fried. Sunday food.',
		kitchen: ['fried', 'smoked']
	},
	{
		cz: 'vajíčko',
		gender: 'n',
		en: 'Egg',
		note: 'The everyday word, with the diminutive. Pubs sell pickled ones from a jar next to the utopenci.',
		kitchen: ['pickled']
	},
	{
		cz: 'cukroví',
		gender: 'n',
		en: 'Christmas Cookies',
		note: 'Ten or more kinds of tiny cookies, baked weeks before Christmas and kept in tins.',
		kitchen: ['homemade'],
		refuses: ['vánoční']
	},
	{
		cz: 'rajče',
		gender: 'n',
		en: 'Tomato',
		note: 'Red, round, and in parts of Moravia also called paradajka.',
		kitchen: []
	},
	{
		cz: 'zelí',
		gender: 'n',
		en: 'Sauerkraut',
		note: 'The third part of vepřo knedlo zelo: roast pork, dumplings and cabbage, the national dish.',
		kitchen: ['homemade']
	},
	{
		cz: 'lečo',
		gender: 'n',
		en: 'Lečo',
		note: 'Peppers, tomatoes and onion stewed together, often with eggs or sausage stirred in.',
		kitchen: ['homemade']
	},
	{
		cz: 'jablíčko',
		gender: 'n',
		en: 'Little Apple',
		note: 'The diminutive of jablko. Children’s songs are full of them.',
		kitchen: ['crunchy']
	},
	{
		cz: 'strašidlo',
		gender: 'n',
		en: 'Spook',
		note: 'A ghost. Every castle has one, and the tour guide will tell you about it.',
		kitchen: []
	},
	{
		cz: 'sluníčko',
		gender: 'n',
		en: 'Little Sun',
		note: 'The sun, made small and sweet. Also what you call someone who cheers you up.',
		kitchen: []
	}
];

const ADJECTIVES: readonly AliasAdjective[] = [
	{ stem: 'vesel', en: 'Cheerful', soft: false, kitchen: null },
	{ stem: 'statečn', en: 'Brave', soft: false, kitchen: null },
	{ stem: 'ospal', en: 'Sleepy', soft: false, kitchen: null },
	{ stem: 'hladov', en: 'Hungry', soft: false, kitchen: null },
	{ stem: 'mlsn', en: 'Sweet-Toothed', soft: false, kitchen: null },
	{ stem: 'tajemn', en: 'Mysterious', soft: false, kitchen: null },
	{ stem: 'kouzeln', en: 'Magical', soft: false, kitchen: null },
	{ stem: 'bystr', en: 'Quick-Witted', soft: false, kitchen: null },
	{ stem: 'zvědav', en: 'Curious', soft: false, kitchen: null },
	{ stem: 'usměvav', en: 'Smiling', soft: false, kitchen: null },
	{ stem: 'nebojácn', en: 'Fearless', soft: false, kitchen: null },
	{ stem: 'šikovn', en: 'Handy', soft: false, kitchen: null },
	{ stem: 'rozvern', en: 'Playful', soft: false, kitchen: null },
	{ stem: 'moravsk', en: 'Moravian', soft: false, kitchen: null },
	{ stem: 'nedělní', en: 'Sunday', soft: true, kitchen: null },
	{ stem: 'vánoční', en: 'Christmas', soft: true, kitchen: null },
	{ stem: 'křupav', en: 'Crunchy', soft: false, kitchen: 'crunchy' },
	{ stem: 'smažen', en: 'Fried', soft: false, kitchen: 'fried' },
	{ stem: 'uzen', en: 'Smoked', soft: false, kitchen: 'smoked' },
	{ stem: 'nakládan', en: 'Pickled', soft: false, kitchen: 'pickled' },
	{ stem: 'domácí', en: 'Homemade', soft: true, kitchen: 'homemade' },
	{ stem: 'včerejší', en: 'Yesterday’s', soft: true, kitchen: 'yesterday' }
];

const HARD_ENDING: Record<Gender, string> = { m: 'ý', f: 'á', n: 'é' };

function adjectiveForm(adj: AliasAdjective, gender: Gender): string {
	return adj.soft ? adj.stem : adj.stem + HARD_ENDING[gender];
}

function fits(adj: AliasAdjective, noun: AliasNoun): boolean {
	if (noun.refuses?.includes(adj.stem)) return false;
	return adj.kitchen === null || noun.kitchen.includes(adj.kitchen);
}

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function czechName(adj: AliasAdjective, noun: AliasNoun): string {
	return `${capitalize(adjectiveForm(adj, noun.gender))} ${capitalize(noun.cz)}`;
}

/** Deterministic alias from a UUID — same ID always produces the same name. */
export function generateAlias(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = (hash * 31 + userId.charCodeAt(i)) | 0;
	}
	const h = hash >>> 0;
	const noun = NOUNS[h % NOUNS.length];
	const pool = ADJECTIVES.filter((adj) => fits(adj, noun));
	const adj = pool[Math.floor(h / NOUNS.length) % pool.length];
	return czechName(adj, noun);
}

export interface AliasGloss {
	/** "Moravian Drowned Man" */
	english: string;
	/** A line or two about the noun. */
	note: string;
}

let glossByName: Map<string, AliasGloss> | null = null;

/** English and background for a generated alias, or null for any other name. */
export function aliasGloss(name: string): AliasGloss | null {
	if (!glossByName) {
		glossByName = new Map();
		for (const noun of NOUNS) {
			for (const adj of ADJECTIVES) {
				if (!fits(adj, noun)) continue;
				glossByName.set(czechName(adj, noun), {
					english: `${adj.en} ${noun.en}`,
					note: noun.note
				});
			}
		}
	}
	return glossByName.get(name) ?? null;
}

/** Every alias `generateAlias` can return. For tests and audits. */
export function allAliases(): string[] {
	const out: string[] = [];
	for (const noun of NOUNS) {
		for (const adj of ADJECTIVES) {
			if (fits(adj, noun)) out.push(czechName(adj, noun));
		}
	}
	return out;
}
