# 0008 — Search suggestions are built in the UI from tiered find* queries

Date: 2026-11-15 · Status: accepted

## Context
The scene list's search suggests studios, performers and tags as you type. A server
endpoint (one resolver that ranks names across kinds) would rank better and be one round
trip, but it is fork server code in the request path, more surface to carry through every
upstream sync. The existing `findStudios` / `findPerformers` / `findTags` already take a
name regex and `q`, and on the dev library the whole set of up to 14 lookups answers in
35–70ms.

## Decision
Suggestions are UI-only: one GraphQL document, `FindSearchSuggestions`
(`ui/v2.5/graphql/queries/search-suggestions.graphql`), aliases each kind into tiers
(exact name, prefix, word start, then `q`), and `List/ToolbarSearchSuggestions.tsx` merges
them, first 5 per kind.

## Consequences
- No server change, nothing for upstream sync to conflict with.
- Ranking is coarse: tier, then scene count. Fuzzy matching or cross-kind ranking would
  need the server endpoint this rules out for now.
- Each new kind adds 3–4 lookups to the query. Groups were considered and declined.
- Measured on the dev library, not production's; if suggestions ever feel slow there,
  time `FindSearchSuggestions` first before reaching for a server endpoint.
