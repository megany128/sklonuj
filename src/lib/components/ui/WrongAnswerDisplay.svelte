<script lang="ts">
	let {
		userAnswer
	}: {
		userAnswer: string;
	} = $props();
</script>

<div
	role="alert"
	class="rounded-[20px] border-2 border-negative-stroke bg-negative-background px-5 py-3.5 text-center text-lg font-semibold text-negative-stroke"
>
	{userAnswer}
</div>
