# Scrapers

Fetching metadata from external sources. Two mostly-separate systems live here: the
YAML-configured **scraper** system for arbitrary websites, and the **stash-box** client for
structured metadata repositories.

Key files: [`pkg/scraper/`](../../pkg/scraper/),
[`pkg/stashbox/`](../../pkg/stashbox/),
[`internal/identify/`](../../internal/identify/).

## Scrapers

### The cache

`scraper.Cache` ([`cache.go`](../../pkg/scraper/cache.go)) is the entry point. It loads
every `.yml` in the scrapers directory on startup and on `RefreshScraperCache()`, and
exposes:

```go
ScrapeName(ctx, id, query, type)     // search by name
ScrapeFragment(ctx, id, input)       // refine from a partial object
ScrapeURL(ctx, url, type)            // scrape a specific URL
ScrapeID(ctx, scraperID, id, type)   // scrape an entity already in the database
```

The `Cache` also holds a shared `*http.Client` configured with the scraper timeout, proxy
settings, and a cookie jar.

### Definitions

A scraper is a `Definition` ([`definition.go`](../../pkg/scraper/definition.go)) declaring
which *operations* it supports:

```yaml
name: Example
sceneByURL:
  - action: scrapeXPath
    url: [example.com/scene/]
    scraper: sceneScraper
performerByName:
  action: scrapeXPath
  queryURL: https://example.com/search?q={}
  scraper: performerSearch
xPathScrapers:
  sceneScraper:
    scene:
      Title: //h1/text()
      Date:
        selector: //span[@class="date"]/text()
        postProcess:
          - parseDate: 2006-01-02
```

Operations are named by what they scrape and how it's identified:
`{scene,performer,gallery,image,group}By{URL,Name,Fragment,QueryFragment}`. Not every
scraper supports every combination — `ScraperSpec.SupportedScrapes` is what the UI uses to
decide which buttons to show.

### Backends

| `action:` | Implementation | Notes |
|---|---|---|
| `scrapeXPath` | [`xpath.go`](../../pkg/scraper/xpath.go) | HTML via XPath |
| `scrapeJson` | [`json.go`](../../pkg/scraper/json.go) | JSON via GJSON paths |
| `scrapeXPath` + `queryURL` | | search-then-scrape |
| `scrapeScript` | [`script.go`](../../pkg/scraper/script.go) | external process, JSON on stdio |
| `stash` | [`stash.go`](../../pkg/scraper/stash.go) | another Stash instance |

`driver: chromeDOM` / `chromeXHR` routes the fetch through headless Chrome (CDP) for
JavaScript-rendered pages. The CDP path is configured globally and may be a local binary
or a remote websocket — `isCDPPathHTTP` / `isCDPPathWS` decide which.

XPath and JSON scrapers share the "mapped" machinery
([`mapped.go`](../../pkg/scraper/mapped.go)): a map of model field → selector, plus
optional post-processing.

### Post-processing

Per-field transformation pipeline in
[`mapped_postprocessing.go`](../../pkg/scraper/mapped_postprocessing.go). Each entry is
applied in order to the extracted string:

| Action | Effect |
|---|---|
| `parseDate` | Parse with a Go layout string, emit ISO |
| `subtractDays` | Relative-date handling |
| `replace` | Regex replace list |
| `map` | Literal value → value lookup |
| `subScraper` | Follow a link and scrape *that* page for this field |
| `feetToCm`, `lbToKg` | Unit conversion |
| `javascript` | Arbitrary JS via `goja` |

`subScraper` is the one to watch: it issues an extra HTTP request per field per result, so
a search returning 20 results with a sub-scraped field makes 20 extra requests.

### Global post-scrape

Separately from per-field post-processing, `postScraper`
([`postprocessing.go`](../../pkg/scraper/postprocessing.go)) runs over the assembled
result and does the work that needs database access:

- Match scraped studio/performer/tag names against existing entities so the UI can offer
  "link to existing" instead of "create new".
- Filter tags against the configured exclude patterns.
- Normalise career length, measurements, and similar performer fields.
- Recurse into related entities (a scraped scene's performers, studio, groups).

This is why `Cache` needs a `Repository` at all — the scraping itself is stateless, but
resolving names to existing IDs is not.

### Adding a scrape target

If you're adding a *field*: extend the `Scraped<Entity>` model in `pkg/models`, add it to
the mapped scraper's known attributes, expose it in the GraphQL scraped type, and handle it
in the UI's scrape-result dialog. Field names in YAML map to model field names.

If you're adding a *backend*, implement the `scraper` interface and register it in
`Definition`'s action dispatch.

## stash-box

[`pkg/stashbox`](../../pkg/stashbox/) talks to stash-box instances — shared, structured
metadata databases with stable IDs (`stash_ids`).

The client is generated: `graphql/stash-box/*.graphql` + [`.gqlgenc.yml`](../../.gqlgenc.yml)
→ `pkg/stashbox/graphql/generated_*.go`, via `make generate-stash-box-client`. Don't
hand-edit those.

Unlike YAML scrapers, stash-box gives:

- **Stable identifiers.** `stash_ids` on an entity record where it came from, enabling
  re-sync and duplicate detection across libraries.
- **Fingerprint search.** Query by phash/oshash rather than by name — this is what makes
  bulk identification work.
- **Draft submission.** [`draft.go`](../../pkg/stashbox/draft.go) submits scenes and
  performers back upstream.

Multiple instances can be configured; each is an endpoint + API key, indexed by position.
`scraper.Source` carries either a `StashBoxIndex`/`StashBoxEndpoint` or a `ScraperID` —
never both.

## Identify

[`internal/identify/`](../../internal/identify/) is the orchestration layer that turns
scraped data into applied changes. It runs as a [job](jobs-and-tasks.md).

The interesting part is per-field merge policy. For each field the user configures a
strategy:

- `IGNORE` — never touch
- `OVERWRITE` — always take the scraped value
- `MERGE` — union for list fields (tags, performers); scraped-wins-if-empty for scalars

Sources are tried in configured order, and options can be overridden per source. So "use
stash-box, but if it has no studio fall back to this scraper, and never overwrite my
ratings" is expressible.

`identify.SceneIdentifier` holds this logic; the field-level rules are in
`internal/identify/scene.go` and the option resolution in `options.go`. If you're changing
how a scraped field gets applied, that's where it lives — not in the scraper.

## Autotag

[`internal/autotag/`](../../internal/autotag/) is unrelated to scraping despite often being
discussed alongside it. It matches *existing* performer/studio/tag names against file paths
and titles, using the word-boundary matching in [`pkg/match`](../../pkg/match/).

Most of its tests are integration tests behind the `integration` build tag.

## Gotchas

- **Scraper YAML is user-editable and community-maintained.** Changing the schema breaks
  hundreds of third-party scrapers in the community repository. Additive changes only.
- **No sandbox for `scrapeScript` or the `javascript` post-processor.** Both run with the
  Stash process's privileges.
- **Scraping happens outside transactions.** It's network I/O; see
  [jobs and tasks](jobs-and-tasks.md#interaction-with-the-single-write-connection).
- **Test with a real scraper definition.** The unit tests in `xpath_test.go` and
  `mapped_test.go` cover the mapping machinery, not end-to-end behaviour.
