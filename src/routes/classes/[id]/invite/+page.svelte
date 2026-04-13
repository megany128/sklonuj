<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import TeacherFeedback from '$lib/components/ui/TeacherFeedback.svelte';

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
		const val: unknown = page.data.classData;
		if (isRecord(val) && typeof val.id === 'string' && typeof val.class_code === 'string') {
			return {
				id: val.id,
				class_code: val.class_code,
				name: typeof val.name === 'string' ? val.name : ''
			};
		}
		return null;
	});

	// Local override so the displayed code updates immediately after a
	// successful regenerate, without waiting for a full page reload.
	let overriddenClassCode = $state<string | null>(null);
	let displayedClassCode = $derived(overriddenClassCode ?? classData?.class_code ?? '');

	$effect(() => {
		const serverCode = classData?.class_code;
		if (overriddenClassCode !== null && serverCode === overriddenClassCode) {
			overriddenClassCode = null;
		}
	});

	let invitations = $derived.by(() => {
		const val: unknown = page.data.invitations;
		return isInvitationArray(val) ? val : [];
	});

	let formResult = $derived(page.form);
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
	let confirmingRegenerate = $state(false);
	let regenerateSuccess = $state(false);

	function copyCode() {
		if (!displayedClassCode) return;
		navigator.clipboard.writeText(displayedClassCode);
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
		if (status === 'pending') return 'text-warning-text';
		if (status === 'accepted') return 'text-positive-stroke';
		if (status === 'expired') return 'text-text-subtitle';
		return 'text-text-subtitle';
	}
</script>

<svelte:head>
	<title>Invite Students - Skloňuj</title>
</svelte:head>

<NavBar user={page.data.user} onSignIn={() => goto(resolve('/auth'))} />

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
						{displayedClassCode}
					</span>
					<button
						type="button"
						onclick={copyCode}
						class="cursor-pointer rounded-xl border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						{codeCopied ? 'Copied!' : 'Copy'}
					</button>
					{#if confirmingRegenerate}
						<form
							method="POST"
							action={resolve(`/classes/${classData.id}?/regenerateCode`)}
							use:enhance={() => {
								return async ({ result, update }) => {
									confirmingRegenerate = false;
									if (result.type === 'success') {
										regenerateSuccess = true;
										if (isRecord(result.data) && typeof result.data.classCode === 'string') {
											overriddenClassCode = result.data.classCode;
										}
										setTimeout(() => {
											regenerateSuccess = false;
										}, 2000);
									}
									await update();
								};
							}}
						>
							<button
								type="submit"
								class="cursor-pointer rounded-xl border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
							>
								Confirm
							</button>
						</form>
						<button
							type="button"
							onclick={() => (confirmingRegenerate = false)}
							class="cursor-pointer rounded-xl border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Cancel
						</button>
					{:else}
						<button
							type="button"
							title="Regenerate class code"
							aria-label="Regenerate class code"
							onclick={() => (confirmingRegenerate = true)}
							class="inline-flex cursor-pointer items-center justify-center rounded-full p-1.5 text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
						>
							{#if regenerateSuccess}
								<Check class="h-4 w-4 text-positive-stroke" aria-hidden="true" />
							{:else}
								<RefreshCw class="h-4 w-4" aria-hidden="true" />
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<!-- Email invite form -->
			<h2 class="mb-2 text-sm font-semibold text-text-default">Or invite by email</h2>

			{#if errorMessage}
				<div
					class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
				>
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div
					class="mb-4 rounded-xl border border-positive-stroke/30 bg-positive-background px-4 py-3 text-sm text-positive-stroke"
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
						class="self-end rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
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
							<div class="flex items-center gap-2">
								<span class="text-xs font-medium {statusColor(inv.status)}">
									{statusLabel(inv.status)}
								</span>
								{#if inv.status === 'expired'}
									<form method="POST" use:enhance>
										<input type="hidden" name="emails" value={inv.email} />
										<button
											type="submit"
											class="cursor-pointer rounded-lg border border-card-stroke px-2 py-0.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
										>
											Re-send
										</button>
									</form>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		<TeacherFeedback context="Invite Students" />
	</div>
{/if}
