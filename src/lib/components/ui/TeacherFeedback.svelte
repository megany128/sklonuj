<script lang="ts">
	import MessageSquare from '@lucide/svelte/icons/message-square';

	interface Props {
		context?: string;
	}

	const { context = '' }: Props = $props();

	let mailto = $derived(
		`mailto:may52@cornell.edu?subject=${encodeURIComponent(`Sklonuj Teacher Feedback${context ? ` — ${context}` : ''}`)}`
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- mailto: link, not an internal route -->
<div class="mt-8 border-t border-card-stroke pt-4 text-center">
	<a
		href={mailto}
		class="inline-flex items-center gap-1.5 text-xs text-text-subtitle transition-colors hover:text-text-default"
	>
		<MessageSquare size={14} />
		Have feedback or a feature request? Let me know!
	</a>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
