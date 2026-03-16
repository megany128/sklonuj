<script lang="ts">
	import { CASE_COLORS, CASE_NUMBER } from '$lib/types';
	import type { Case } from '$lib/types';

	let {
		alwaysExpanded = false
	}: {
		alwaysExpanded?: boolean;
	} = $props();

	let expanded = $state(false);

	interface CaseInfo {
		key: Case;
		name: string;
		question: string;
		mnemonic: string;
		description: string;
		example: string;
		exampleTranslation: string;
	}

	const cases: CaseInfo[] = [
		{
			key: 'nom',
			name: 'Nominative',
			question: 'Kdo? Co? (Who? What?)',
			mnemonic: 'The subject — who or what does the action.',
			description:
				'The default/dictionary form. Used for the subject of a sentence and after "to je" (this is).',
			example: 'Pes běží.',
			exampleTranslation: 'The dog is running.'
		},
		{
			key: 'gen',
			name: 'Genitive',
			question: 'Koho? Čeho? (Of whom? Of what?)',
			mnemonic: 'Possession, absence, origin — think "of" or "from".',
			description:
				"Used after do/z/od/bez/u and for possession (kniha matky = mother's book). Also for quantities and negation.",
			example: 'Jdu do města.',
			exampleTranslation: "I'm going to the city."
		},
		{
			key: 'dat',
			name: 'Dative',
			question: 'Komu? Čemu? (To whom? To what?)',
			mnemonic: 'The receiver — who gets something or benefits.',
			description:
				'Used for indirect objects (giving/telling someone). After k/ke. With verbs like pomáhat, věřit, volat.',
			example: 'Dám knihu bratrovi.',
			exampleTranslation: "I'll give the book to my brother."
		},
		{
			key: 'acc',
			name: 'Accusative',
			question: 'Koho? Co? (Whom? What?)',
			mnemonic: 'The direct object — what the action is done to.',
			description:
				'Used for direct objects (I see X, I want X). After na (motion), pro, přes. The most common case after nominative.',
			example: 'Vidím kočku.',
			exampleTranslation: 'I see the cat.'
		},
		{
			key: 'voc',
			name: 'Vocative',
			question: 'Addressing someone directly',
			mnemonic: 'Calling out — "Hey, ...!"',
			description:
				'Used when directly addressing someone. Often in greetings, commands, or getting attention. The only case not governed by prepositions.',
			example: 'Petře, pojď sem!',
			exampleTranslation: 'Petr, come here!'
		},
		{
			key: 'loc',
			name: 'Locative',
			question: 'O kom? O čem? (About whom? About what?)',
			mnemonic: 'Location and topic — where something is or what you talk about.',
			description:
				'Always used with a preposition (v, na, o, po, při). Never appears alone. Expresses location or topic of discussion.',
			example: 'Bydlím v Praze.',
			exampleTranslation: 'I live in Prague.'
		},
		{
			key: 'ins',
			name: 'Instrumental',
			question: 'Kým? Čím? (By whom? By/with what?)',
			mnemonic: 'The tool, companion, or means — "with" or "by".',
			description:
				'Used after s/se (with), za, pod, nad, před, mezi. Also after být for professions (Je lékařem = He is a doctor).',
			example: 'Jedu autem.',
			exampleTranslation: "I'm going by car."
		}
	];
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="case-guide-panel"
		>
			<span class="font-semibold">Case guide</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
	{/if}

	<div
		id="case-guide-panel"
		class={alwaysExpanded ? '' : 'overflow-hidden transition-all duration-300 ease-in-out'}
		style={alwaysExpanded
			? undefined
			: `max-height: ${expanded ? '2000px' : '0px'}; opacity: ${expanded ? '1' : '0'}`}
	>
		<div
			class="space-y-2 {alwaysExpanded
				? ''
				: 'mt-2 rounded-[24px] border border-card-stroke bg-card-bg p-4'}"
		>
			{#each cases as c (c.name)}
				<div class="rounded-[24px] border-2 border-shaded-background p-4">
					<div class="flex items-start gap-2.5">
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white {CASE_COLORS[
								c.key
							].bg}"
						>
							{CASE_NUMBER[c.key]}
						</span>
						<div class="min-w-0">
							<span class="{CASE_COLORS[c.key].text} font-semibold">{c.name}</span>
							<p class="text-sm text-text-subtitle">
								{c.question}
							</p>
							<p class="mt-1 text-sm font-semibold text-text-default">
								{c.mnemonic}
							</p>
							<p class="mt-0.5 text-sm text-text-subtitle">
								{c.description}
							</p>
							<p class="mt-1.5 text-sm">
								<span class="font-semibold text-text-default">{c.example}</span>
								<span class="ml-1 text-text-subtitle">&mdash; {c.exampleTranslation}</span>
							</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
