# Contributing to Skloňuj

Thanks for your interest in contributing! Skloňuj is a Czech declension trainer built around Charles University's open-source [MorphoDiTa](https://ufal.mff.cuni.cz/morphodita) tool. Contributions are welcome, though the project direction is maintained by me — please open an issue before starting significant work so we can discuss whether it fits.

## Ways to Contribute

- **Bug reports** — if something declines incorrectly or behaves unexpectedly, please open an issue with the specific noun/sentence and what you expected vs. what happened
- **Noun/vocabulary data** — additions or corrections to the word lists, especially for underrepresented paradigms
- **New question types or exercise modes**
- **UI/UX improvements**
- **Translations or localization**

Currently, I am working on adding adjective-noun agreement exercises and regular practice reminders.

## Getting Started

1. Fork the repository
2. Create a new branch from `main`: `git checkout -b your-feature-name`
3. Make your changes
4. Open a pull request with a clear description of what you changed and why

All PRs targeting `main` require my approval before merging.

## CI Checks

All PRs must pass the following checks before they can be reviewed:

- **Lint and format check** — run `pnpm lint` and `pnpm format` locally before submitting
- **Type check** — ensure there are no TypeScript errors with `pnpm check`

If either check fails, the PR will not be merged. It's worth running these locally before opening a PR to save time.

## Guidelines

- Keep PRs focused — one feature or fix per PR
- If you're adding vocabulary data, please include a source
- For larger changes, open an issue first to discuss

## Questions

Feel free to open an issue or reach out to me at megan@meganyap.me if you have questions. Díky! 🇨🇿
