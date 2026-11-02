# TickerDock

> A compact, always-on-top market ticker for A-shares and US stocks.

English | [简体中文](README.zh-CN.md)

TickerDock is a small Windows desktop widget built with Tauri, React, and Rust.
It keeps the current market quote within reach without opening a browser or a
full brokerage application.

## Highlights

- Two desktop layouts: a full `388 x 106` view and a compact `244 x 52` pill.
- Automatic A-share and US market switching based on Beijing time.
- Manual modes for A-shares, A-share sectors, and US stocks.
- Intraday sparkline, latest price, signed percentage change, and daily range.
- Watchlist management with local persistence and automatic rotation.
- A-share industry and concept sector ranking from Eastmoney.
- US market holiday and early-close calendar support.
- Refresh intervals: 5 seconds while live, 60 seconds while closed, and a
  15-second retry after request failures.
- Tencent quote data fetched through the Rust backend to avoid browser CORS
  restrictions.

## Views

The full view shows price, change percentage, daily range, the current item
index, market status, and watchlist controls.

The compact pill shows only the item name, intraday trend, and signed
percentage change. Move the pointer over the pill to reveal the expand button,
then click it to return to the full view. The selected view is remembered
between restarts.

## Tech Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust
- Vitest and Testing Library

## Requirements

- Windows 10 or Windows 11 for the desktop build
- Node.js 20 or newer
- Rust 1.90 or newer
- Microsoft C++ Build Tools and WebView2

## Development

Install dependencies:

```powershell
npm install
```

Run the desktop application:

```powershell
npm run desktop
```

Run the browser preview with built-in demo quotes:

```powershell
npm run dev
```

The browser preview does not call the Tauri backend and is intended only for
UI development.

## Build

Build a Windows installer:

```powershell
npm run desktop:build
```

Build the release executable without creating an installer:

```powershell
npx tauri build --no-bundle
```

The default release output is written under
`src-tauri/target/release/` and installer bundles are written under
`src-tauri/target/release/bundle/`.

## Releases

The application version is `0.1.0`. A GitHub release is built and published
automatically when a matching SemVer tag is pushed:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The release workflow verifies that the tag matches the versions in
`package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`,
runs the frontend and Rust test suites, builds the Windows installers, and
attaches them to the GitHub Release.

## Tests

Run the normal checks:

```powershell
npm run lint
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

The live API integration tests are ignored by default:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
```

The ignored tests access real market data endpoints. Run them only when
network access and live data are acceptable.

## Watchlists

- Open the add field from the `+` button and enter a stock code.
- A-share symbols support `600519`, `000001`, `300750`, `430047`, and
  `sh600519`.
- US symbols support `AAPL`, `usAAPL`, `TSLA`, and similar forms.
- Up to 20 symbols can be stored for each market.
- Open the list button to switch symbols or remove one.
- Removal requires a second confirmation action, and the final symbol cannot
  be removed.

## Sectors

- Open the sectors tab and use `+` to search for an industry or concept.
- Examples include `银行`, `券商`, and `BK1283`.
- Pinned sectors are shown before the daily ranking and are marked as watched.
- Up to 12 sectors can be pinned.
- The sector catalog is fetched from Eastmoney and cached for 10 minutes.

## Local Data

The application has no account system and stores preferences in local webview
storage:

| Key | Purpose |
| --- | --- |
| `stock-widget.watchlists.v1` | Stock watchlists by market |
| `stock-widget.sectors.v1` | Pinned A-share sectors |
| `stock-widget.view.v1` | Full or compact view selection |

The `stock-widget.*` prefixes are retained for compatibility with data created
before the project was named TickerDock.

## Project Structure

```text
.
|-- src/
|   |-- components/          Quote row and sparkline components
|   |-- lib/                 Market sessions, quote loading, and view state
|   |-- App.tsx              Main desktop widget UI
|   `-- App.css              Window and widget styling
|-- src-tauri/
|   |-- src/quotes.rs        Tencent quote API and parsing
|   |-- src/intraday.rs      Intraday data and parsing
|   |-- src/sectors.rs       Eastmoney sector data and parsing
|   |-- capabilities/        Tauri permission declarations
|   `-- tauri.conf.json      Window and bundle configuration
|-- docs/
|   `-- GITHUB.md            GitHub repository and release checklist
|-- .github/
|   `-- workflows/release.yml Automated GitHub Release workflow
|-- README.zh-CN.md          Simplified Chinese documentation
`-- package.json
```

## Data Sources and Limitations

TickerDock uses public market interfaces that may be delayed, rate-limited, or
changed without notice. The data is suitable for casual monitoring only and is
not investment advice.

Current known limitations:

- A-share holidays are not yet included; A-share sessions currently exclude
  weekends only.
- US holiday and early-close handling is implemented with the US market
  calendar.
- The desktop build is developed and tested primarily on Windows.
- Public quote endpoints may occasionally fail or return incomplete data.

## Contributing

Issues and pull requests are welcome. Before submitting a change:

1. Keep the change focused on one feature or fix.
2. Run `npm run lint`, `npm run test`, and `npm run build`.
3. Update the English and Chinese documentation when behavior changes.
4. Do not commit generated build output, local editor settings, or API
   credentials.

## License

No open-source license has been selected yet. Until a `LICENSE` file is added,
the source is not granted for redistribution or reuse outside this repository.
