<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	interface InvitationRow {
		id: string;
		email: string;
		status: string;
		createdAt: string;
		expiresAt: string;
	}

	function isInvitationArray(v: unknown): v is InvitationRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) => isRecord(item) && typeof item.id === 'string' && typeof item.email === 'string'
		);
	}

	let classData = $derived.by(() => {
		const val: unknown = $page.data.classData;
		if (isRecord(val) && typeof val.id === 'string' && typeof val.class_code === 'string') {
			return {
				id: val.id,
				class_code: val.class_code,
				name: typeof val.name === 'string' ? val.name : ''
			};
		}
		return null;
	});

	let invitations = $derived.by(() => {
		const val: unknown = $page.data.invitations;
		return isInvitationArray(val) ? val : [];
	});

	let formResult = $derived($page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string' && !formResult.success) {
			return formResult.message;
		}
		return null;
	});
	let successMessage = $derived.by(() => {
		if (
			isRecord(formResult) &&
			formResult.success === true &&
			typeof formResult.message === 'string'
		) {
			return formResult.message;
		}
		return null;
	});

	let codeCopied = $state(false);
	let submitting = $state(false);

	function copyCode() {
		if (!classData) return;
		navigator.clipboard.writeText(classData.class_code);
		codeCopied = true;
		setTimeout(() => {
			codeCopied = false;
		}, 2000);
	}

	function statusLabel(status: string): string {
		if (status === 'pending') return 'Pending';
		if (status === 'accepted') return 'Accepted';
		if (status === 'expired') return 'Expired';
		return status;
	}

	function statusColor(status: string): string {
		if (status === 'pending') return 'text-yellow-600';
		if (status === 'accepted') return 'text-green-600';
		if (status === 'expired') return 'text-text-subtitle';
		return 'text-text-subtitle';
	}
</script>

<svelte:head>
	<title>Invite Students - Skloňuj</title>
</svelte:head>

<NavBar user={$page.data.user} />

{#if classData}
	<div class="mx-auto max-w-lg px-4 py-8">
		<a
			href={resolve(`/classes/${classData.id}`)}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to {classData.name}
		</a>

		<div class="mb-6 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<h1 class="mb-4 text-xl font-semibold text-text-default">Invite Students</h1>

			<!-- Share code section -->
			<div class="mb-6 rounded-xl bg-shaded-background p-4">
				<p class="mb-2 text-sm text-text-subtitle">Share this class code with students:</p>
				<div class="flex items-center gap-2">
					<span class="font-mono text-2xl font-bold tracking-widest text-text-default">
						{classData.class_code}
					</span>
					<button
						type="button"
						onclick={copyCode}
						class="cursor-pointer rounded-full border border-card-stroke px-3 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						{codeCopied ? 'Copied!' : 'Copy'}
					</button>
				</div>
			</div>

			<!-- Email invite form -->
			<h2 class="mb-2 text-sm font-semibold text-text-default">Or invite by email</h2>

			{#if errorMessage}
				<div class="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div
					class="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700"
				>
					{successMessage}
				</div>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
			>
				<div class="flex flex-col gap-2">
					<textarea
						name="emails"
						required
						placeholder="student1@example.com, student2@example.com"
						rows={3}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					></textarea>
					<p class="text-xs text-text-subtitle">
						Separate multiple emails with commas or newlines.
					</p>
					<button
						type="submit"
						disabled={submitting}
						class="self-end rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity disabled:opacity-50"
					>
						{submitting ? 'Sending...' : 'Send Invites'}
					</button>
				</div>
			</form>
		</div>

		<!-- Pending invitations -->
		{#if invitations.length > 0}
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-3 text-sm font-semibold text-text-default">
					Invitations ({invitations.length})
				</h2>
				<div class="space-y-2">
					{#each invitations as inv (inv.id)}
						<div
							class="flex items-center justify-between rounded-xl bg-shaded-background px-3 py-2"
						>
							<span class="text-sm text-text-default">{inv.email}</span>
							<span class="text-xs font-medium {statusColor(inv.status)}">
								{statusLabel(inv.status)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
