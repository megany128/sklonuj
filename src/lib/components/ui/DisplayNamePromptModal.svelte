<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import UserCircle from '@lucide/svelte/icons/user-circle';

	let displayName = $state('');
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = displayName.trim();
		if (trimmed.length === 0 || saving) return;
		saving = true;
		errorMessage = null;
		try {
			const res = await fetch('/api/profile/display-name', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ display_name: trimmed })
			});
			if (!res.ok) {
				let msg = 'Could not save your name. Please try again.';
				try {
					const data: unknown = await res.json();
					if (
						typeof data === 'object' &&
						data !== null &&
						'message' in data &&
						typeof (data as { message: unknown }).message === 'string'
					) {
						msg = (data as { message: string }).message;
					}
				} catch {
					// Non-JSON error response — keep default message.
				}
				errorMessage = msg;
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Failed to save display name:', err);
			errorMessage = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="display-name-prompt-title"
>
	<div class="w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl">
		<div class="mb-4 text-center">
			<div
				class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emphasis/10"
			>
				<UserCircle class="size-7 text-emphasis" aria-hidden="true" />
			</div>
			<h2 id="display-name-prompt-title" class="text-lg font-semibold text-text-default">
				What should we call you?
			</h2>
			<p class="mt-2 text-sm text-text-subtitle">
				Add a display name so your progress, leaderboard rankings, and reactions show up correctly.
			</p>
		</div>

		<form onsubmit={handleSubmit}>
			<label for="layout_display_name" class="mb-1 block text-sm font-medium text-text-default">
				Display name
			</label>
			<input
				type="text"
				id="layout_display_name"
				name="display_name"
				bind:value={displayName}
				required
				maxlength={50}
				placeholder="Your name"
				autocomplete="name"
				class="mb-2 w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
			/>
			{#if errorMessage}
				<p class="mb-2 text-xs text-negative-stroke">{errorMessage}</p>
			{/if}
			<button
				type="submit"
				disabled={saving || displayName.trim().length === 0}
				class="mt-2 w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</form>
	</div>
</div>
