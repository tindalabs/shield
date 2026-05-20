# Contributing to Shield

Thank you for your interest in contributing! This document covers everything you need to get started.

## Development setup

Shield is a single-package TypeScript library. Node.js ≥ 18 and npm are required.

```bash
git clone https://github.com/tindalabs/shield.git
cd shield
npm install
npm run build
```

## Workflow

```bash
npm run build      # compile TypeScript → dist/
npm test           # run Jest test suite
npm run lint       # ESLint
npm run format     # Prettier
```

All three checks (`lint`, `test`, `build`) must pass before submitting a PR — they run automatically in CI.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes with tests where appropriate.
3. Run `npm run lint && npm test && npm run build` locally.
4. Open a PR against `main` with a clear description of what changed and why.

## Reporting bugs

Open a GitHub issue. Include: browser/Node version, a minimal reproduction, and the observed vs expected behaviour.

## Security vulnerabilities

**Do not open a public issue.** Email [ikerlaforga@gmail.com](mailto:ikerlaforga@gmail.com) instead. See [SECURITY.md](SECURITY.md).

## Code style

- TypeScript strict mode throughout.
- No runtime dependencies beyond `@opentelemetry/api` (peer dep).
- New strategies must extend `AbstractStrategy` and have a corresponding test file.

## License

By contributing you agree that your work will be released under the [MIT License](LICENSE).
