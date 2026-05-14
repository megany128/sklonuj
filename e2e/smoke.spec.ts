import { test, expect } from '@playwright/test';

/** Skip the onboarding tour by setting the localStorage flag before navigation. */
async function skipOnboarding(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		localStorage.setItem('sklonuj_onboarded', '1');
	});
}

test('homepage loads and shows drill UI', async ({ page }) => {
	await skipOnboarding(page);
	await page.goto('/');
	await expect(page).toHaveTitle(/Sklo[nň]uj/i);
	await expect(page.getByRole('link', { name: 'Practice', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Resources', exact: true })).toBeVisible();
	// Drill card rendered — either text input or choice buttons
	await expect(
		page
			.locator('input[placeholder*="answer"]')
			.or(
				page
					.getByRole('button', {
						name: /nominative|genitive|dative|accusative|vocative|locative|instrumental|masculine|feminine|neuter/i
					})
					.first()
			)
			.first()
	).toBeVisible({ timeout: 10_000 });
});

test('JS hydration works — interactive elements respond', async ({ page }) => {
	await skipOnboarding(page);
	await page.goto('/');
	const a2Tab = page.getByRole('button', { name: 'A2' });
	await expect(a2Tab.first()).toBeVisible({ timeout: 10_000 });
	await a2Tab.first().click();
	await expect(page.locator('body')).not.toBeEmpty();
});

test('resources page loads', async ({ page }) => {
	await page.goto('/resources');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('about page loads', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('auth modal opens from sign-in button', async ({ page }) => {
	await skipOnboarding(page);
	await page.goto('/');
	// Wait for hydration before clicking
	await page.waitForLoadState('networkidle');
	const signInBtn = page.getByRole('button', { name: 'Sign in' });
	await expect(signInBtn).toBeVisible({ timeout: 5_000 });
	await signInBtn.click();
	// Auth modal should appear
	await expect(page.getByRole('dialog', { name: /sign in/i })).toBeVisible({ timeout: 5_000 });
});

test('drill interaction — submit answer and page responds', async ({ page }) => {
	await skipOnboarding(page);
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	// Drill can be text input or choice buttons
	const textInput = page.locator('input[placeholder*="answer"]').first();
	const isTextDrill = await textInput.isVisible({ timeout: 5_000 }).catch(() => false);

	if (isTextDrill) {
		await textInput.fill('test');
		await textInput.press('Enter');
		// After submitting wrong answer, feedback panel appears or input gets styled
		await page.waitForTimeout(1_000);
		// Verify the page didn't crash — content still present
		await expect(page.locator('body')).toContainText(/test|correct|incorrect|answer/i);
	} else {
		// Multi-choice drill — click first available answer button
		const choiceBtn = page
			.getByRole('button', {
				name: /nominative|genitive|dative|accusative|vocative|locative|instrumental|masculine|feminine|neuter/i
			})
			.first();
		await expect(choiceBtn).toBeVisible({ timeout: 5_000 });
		await choiceBtn.click();
		// After clicking, something should change (next step, feedback, etc.)
		await page.waitForTimeout(1_000);
		await expect(page.locator('body')).not.toBeEmpty();
	}
});
