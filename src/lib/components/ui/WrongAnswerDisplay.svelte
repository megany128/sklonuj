<script lang="ts">
	let {
		userAnswer
	}: {
		userAnswer: string;
	} = $props();
</script>

<div
	class="rounded-xl border-2 border-red-400 bg-red-50 px-5 py-3.5 text-center text-lg font-medium text-red-700"
>
	{userAnswer}
</div>
