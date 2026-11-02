# GitHub Repository Guide

This document contains the repository metadata, publishing checklist, and
release template for TickerDock.

## Repository Identity

| Field | Suggested value |
| --- | --- |
| Display name | `TickerDock` |
| Repository name | `ticker-dock` |
| Short description | `A compact, always-on-top desktop ticker for A-shares and US stocks.` |
| Primary language | `TypeScript` |
| Default branch | `main` |
| License | Choose one before the first public release |

Suggested GitHub topics:

```text
tauri
react
rust
typescript
desktop-widget
stock-market
stock-ticker
a-shares
us-stocks
windows
```

Suggested social preview text:

```text
TickerDock - A compact A-share and US stock ticker for your desktop.
```

## About Section

Use this text in the GitHub **About** panel:

```text
A compact, always-on-top desktop ticker for A-shares and US stocks.
Built with Tauri, React, TypeScript, and Rust.
```

Leave the website field empty until the project has a documentation page or
download page.

## README Assets

Before the first public release, add real application screenshots:

```text
docs/screenshots/full-view.png
docs/screenshots/compact-view.png
```

Recommended screenshot rules:

- Use a neutral desktop background.
- Show the full view and the compact pill separately.
- Avoid exposing unrelated desktop windows, account names, or notifications.
- Keep the images readable at GitHub's content width.

After adding the files, insert a screenshot section near the top of both
README files.

## Before the First Public Push

1. Select an open-source license and add a `LICENSE` file.
2. Confirm that `node_modules/`, `dist/`, `src-tauri/target/`, and
   `src-tauri/gen/` are not tracked.
3. Remove local absolute paths, credentials, logs, and private screenshots.
4. Run `npm run lint`, `npm run test`, `npm run build`, and the Rust tests.
5. Verify both README files and all relative links render correctly.
6. Check that the repository description and topics are filled in.
7. Create the first release only after the source tree and documentation pass
   review.

## Release Checklist

The release workflow in `.github/workflows/release.yml` runs automatically
when a version tag is pushed. Before creating the tag:

1. Update the version in `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit the version change and push it to the default branch.
3. Create and push the matching tag:

   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```

The workflow performs these checks and actions:

- Reject tags that are not in `vMAJOR.MINOR.PATCH` format.
- Reject tags when the version does not match all project manifests.
- Run frontend lint, unit tests, and the production build.
- Run the Rust test suite.
- Build the Tauri Windows bundles.
- Create a published GitHub Release and attach the installer assets.

Then:

1. Test the release executable on a clean Windows account if possible.
2. Verify A-share, sector, and US market switching.
3. Verify US holidays and early-close behavior.
4. Verify watchlist persistence and compact-view persistence.
5. Generate checksums for release artifacts.
6. Review the automatically generated release notes and attached assets.

The current build is unsigned unless a Windows code-signing certificate is
configured. Add signing secrets to the release workflow before distributing
installers widely.

## Release Notes Template

```markdown
# TickerDock v0.1.0

The first public TickerDock release.

## Highlights

- Compact desktop ticker for A-shares and US stocks
- Full and pill-sized views
- Stock and sector watchlists
- Market-session aware refresh intervals
- US holiday and early-close support

## Installation

Download the Windows installer from the release assets and run it.

## Notes

- Market data may be delayed and is not investment advice.
- A-share holiday-calendar support is planned for a future release.

**Full changelog:** compare this tag with the previous tag.
```

## Privacy and Security

TickerDock does not require an account and stores watchlists and view settings
in local WebView storage. The app sends network requests to public market-data
providers for quotes, intraday charts, and sector data.

Do not add API keys to the repository. If a future data provider requires a
key, document the required environment variables and keep the actual values
outside version control.
