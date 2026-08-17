# The query and filter system

How a filter object from the UI becomes SQL. This is the densest, least obvious subsystem
in the backend, and the one where a plausible-looking change most often produces subtly
wrong results.

Key files: [`query.go`](../../pkg/sqlite/query.go), [`filter.go`](../../pkg/sqlite/filter.go),
[`criterion_handlers.go`](../../pkg/sqlite/criterion_handlers.go),
[`<entity>_filter.go`](../../pkg/sqlite/scene_filter.go),
[`filter_hierarchical.go`](../../pkg/sqlite/filter_hierarchical.go).

## The pipeline

```
models.SceneFilterType          GraphQL input: the user's filter
        │
        ▼
sceneFilterHandler              scene_filter.go — maps fields → handlers
        │  .handle(ctx, f)
        ▼
compoundHandler{...}            a flat list of criterionHandlers, one per field
        │  each calls f.addWhere / addHaving / addJoin / addWith
        ▼
filterBuilder                   accumulates clauses + joins, with a sub-filter chain
        │  query.addFilter(f)
        ▼
queryBuilder                    merges into columns/from/joins/where/having/with + args
        │  .toSQL()
        ▼
SQL string + positional args
```

Two builders, and the distinction matters:

- **`filterBuilder`** — one per filter *expression*. Understands AND/OR/NOT nesting via a
  linked sub-filter. Produces clause fragments.
- **`queryBuilder`** — one per *query*. Owns the SELECT/FROM, join deduplication,
  sort/pagination, and the final argument ordering.

## Entry point

`SceneStore.makeQuery` shows the whole assembly:

```go
query := sceneRepository.newQuery()
distinctIDs(&query, sceneTable)        // SELECT DISTINCT scenes.id FROM scenes

if q := findFilter.Q; q != nil && *q != "" {
    query.addJoins(/* files, folders, fingerprints, markers */)
    query.parseQueryString(searchColumns, *q)
}

filter := filterBuilderFromHandler(ctx, &sceneFilterHandler{sceneFilter: sceneFilter})
if err := query.addFilter(filter); err != nil { return nil, err }

if err := qb.setSceneSort(&query, findFilter); err != nil { return nil, err }
query.sortAndPagination += getPagination(findFilter)
```

Note `distinctIDs` — the query selects **only distinct IDs**. Joining to many-to-many
tables multiplies rows, and the DISTINCT is the only thing keeping counts correct. Any
change that adds a column to the main filter query risks breaking that; see the aggregate
discussion below.

## Criterion handlers

A handler is anything that can add clauses to a `filterBuilder`:

```go
type criterionHandler interface {
    handle(ctx context.Context, f *filterBuilder)
}
type criterionHandlerFunc func(ctx context.Context, f *filterBuilder)
type compoundHandler []criterionHandler    // runs each in turn
```

`<entity>_filter.go` maps each filter field to a handler:

```go
func (qb *sceneFilterHandler) criterionHandler() criterionHandler {
    return compoundHandler{
        intCriterionHandler(sceneFilter.ID, "scenes.id", nil),
        stringCriterionHandler(sceneFilter.Title, "scenes.title"),
        pathCriterionHandler(sceneFilter.Path, "folders.path", "files.basename", qb.addFoldersTable),
        boolCriterionHandler(sceneFilter.Organized, "scenes.organized", nil),
        floatIntCriterionHandler(sceneFilter.Duration, "video_files.duration", qb.addVideoFilesTable),
        // ...
    }
}
```

Every handler is nil-safe: it checks `if c != nil` and does nothing when the criterion
wasn't supplied. So the compound list is evaluated in full on every query, and only the
populated criteria contribute clauses.

The third argument to most handlers is an **`addJoinFn`** — a callback that adds whatever
join the column needs. `floatIntCriterionHandler(..., "video_files.duration",
qb.addVideoFilesTable)` only joins `video_files` if the duration criterion is actually
present. This lazy-join pattern is why filtering on 3 of 40 possible fields doesn't
produce 40 joins.

### Shared handler types

| Handler | Purpose |
|---|---|
| `stringCriterionHandler` | LIKE / regex / null, with `TRIM()`-aware null checks |
| `stringNoTrimCriterionHandler` | same, but empty string ≠ null |
| `intCriterionHandler`, `floatCriterionHandler` | numeric comparisons |
| `floatIntCriterionHandler` | int criterion against a float column (durations) |
| `boolCriterionHandler` | |
| `pathCriterionHandler` | splits path vs basename matching |
| `dateCriterionHandler`, `timestampCriterionHandler` | |
| `enumCriterionHandler` | |
| `resolutionCriterionHandler`, `orientationCriterionHandler` | derived from width/height |
| `joinedMultiCriterionHandlerBuilder` | many-to-many via a join table |
| `multiCriterionHandlerBuilder` | direct FK |
| `hierarchicalMultiCriterionHandlerBuilder` | recursive parent/child (tags, studios) |
| `countCriterionHandlerBuilder` | "has N related items" |
| `stashIDCriterionHandler`, `phashDistanceCriterionHandler` | |

## Modifiers are where the complexity lives

`CriterionModifier` values (`INCLUDES`, `INCLUDES_ALL`, `EQUALS`, `EXCLUDES`, `IS_NULL`,
`NOT_NULL`, `MATCHES_REGEX`, …) each translate to structurally different SQL, not just a
different operator.

`joinedMultiCriterionHandlerBuilder.handler` is the clearest example — "scenes with tags":

- **`INCLUDES`** — inner join, `WHERE tag_id IN (...)`. Any match.
- **`INCLUDES_ALL`** — same WHERE, plus `HAVING count(distinct tag_id) IS <n>`. The
  HAVING is what turns "any" into "all", and it's why `queryBuilder` has a separate
  having-clause bucket at all.
- **`EQUALS`** — the above *and* a correlated subquery asserting the total tag count on
  the scene equals `n`. Exactly these tags and no others.
- **`EXCLUDES`** — rewritten at the top of the handler into `INCLUDES_ALL` with the values
  moved into `Excludes`, which then emits `id NOT IN (SELECT ... )`. A separate
  uncorrelated subquery, not a join.
- **`IS_NULL` / `NOT_NULL`** — left join + `IS NULL`, or inner join + `IS NOT NULL`, and
  returns early before any of the above.
- **`NOT_EQUALS`** — explicitly unsupported; sets an error on the filter.

The join *type* flips with the modifier throughout the codebase:

```go
joinType := joinTypeInner
if sceneFilter.Oshash.Modifier == models.CriterionModifierIsNull {
    joinType = joinTypeLeft     // need the row to survive the join to test for NULL
}
```

Getting this wrong yields a filter that silently returns fewer rows than it should — an
inner join drops exactly the rows an `IS NULL` test is looking for.

## Join deduplication

Joins are added by alias, and duplicates are merged rather than repeated
([`filter.go`](../../pkg/sqlite/filter.go)):

```go
func (j *joins) addUnique(newJoin join) bool {
    for i, jj := range *j {
        if jj.equals(newJoin) {                 // compares alias(), not table
            if !newJoin.sort && jj.sort {
                (*j)[i].sort = false            // promote sort-only → real join
            }
            if newJoin.getJoinType() == joinTypeInner && jj.getJoinType() == joinTypeLeft {
                (*j)[i].joinType = joinTypeInner // inner wins over left
            }
            return false
        }
    }
    *j = append(*j, newJoin)
    return true
}
```

Three merge rules, all deliberate:

1. **Identity is the alias**, not the table. Joining `files` twice under different aliases
   is fine and intended (e.g. `fingerprints_oshash` vs `fingerprints_md5`).
2. **`sort` joins are weaker.** A join added only to support ORDER BY is skipped when
   building the count query (`joins.toSQL(includeSortPagination=false)`), because sorting
   doesn't affect a count. If a real filter later needs the same join, the flag is cleared.
3. **Inner wins over left.** If any criterion requires the row to exist, that constraint
   applies to the whole query.

## AND / OR / NOT nesting

`filterBuilder` supports one sub-filter, forming a chain:

```go
type filterBuilder struct {
    subFilter   *filterBuilder
    subFilterOp string          // "AND" | "OR" | "AND NOT"
    ...
}
```

`generateWhereClauses` ANDs the local clauses together, then combines with the sub-filter
using the operator. Setting a second sub-filter is an error (`errSubFilterAlreadySet`).

The subtlety is in `or()`:

```go
func (f *filterBuilder) or(o *filterBuilder) {
    f.subFilter = o
    f.subFilterOp = orOp
    // #6914 - joined tables are inner joins by default, but if this is an OR filter,
    // they need to be left joins
    f.innerJoinsToLeftJoins()
    o.innerJoinsToLeftJoins()
}
```

Joins are hoisted to the top level of the query, but OR semantics are expressed in the
WHERE clause. If branch A requires an inner join and the user asks for `A OR B`, that
inner join would eliminate rows matching only B — *before* the WHERE clause is evaluated.
Demoting to left joins fixes it. This is a genuine footgun: **any new criterion handler
that adds an inner join must work correctly when demoted to a left join.**

Validation rejects mixing operators at one level:

```go
func validateFilterCombination[T any](sf models.OperatorFilter[T]) error
// AND+OR, AND+NOT, OR+NOT are all illegal in the same filter object
```

## Hierarchical criteria

Tags and studios form parent/child trees, and "include children" means recursive
traversal. `getHierarchicalValues` in
[`criterion_handlers.go`](../../pkg/sqlite/criterion_handlers.go) generates a recursive CTE
and then collapses it into a literal `VALUES` list:

```sql
WITH RECURSIVE items AS (
    SELECT id as root_id, id as item_id, 0 as depth FROM tags WHERE id IN (?, ?)
    UNION
    SELECT p.root_id, c.child_id, depth + 1 FROM tags_relations AS c
      INNER JOIN items as p ON c.parent_id = p.item_id
    WHERE depth < 3
)
SELECT 'VALUES' || GROUP_CONCAT('(' || root_id || ', ' || item_id || ')') FROM items
```

The result is a string like `VALUES(1,1),(1,5),(1,9)` that gets embedded into the outer
query as a derived table.

Two shortcuts worth knowing:

- **`depth == 0`** (don't recurse) skips the query entirely and builds `VALUES(id,id)`
  directly from the input — but only if every value parses as an integer. A non-numeric
  value falls back to running the query.
- **`depth == -1`** means unlimited; the `WHERE depth < n` condition is omitted.
- If the CTE returns nothing, it falls back to the identity `VALUES` list so the outer
  query stays valid.

The `root_id`/`item_id` pairing is what lets `INCLUDES_ALL` work: the HAVING counts
distinct `root_id`s matched, so matching two children of the same requested parent counts
once, not twice.

## Sorting and pagination

Appended as a raw string to `queryBuilder.sortAndPagination`:

```go
func getPaginationSQL(page, perPage int) string {
    page = (page - 1) * perPage
    return " LIMIT " + strconv.Itoa(perPage) + " OFFSET " + strconv.Itoa(page) + " "
}
```

Values are `strconv`-formatted ints, not bound parameters — safe because they're already
typed as ints, but don't extend this with string interpolation of user input.

`setSceneSort` handles the sort column. Sort columns needing a join use `joinSort`, which
marks the join `sort: true` so it's dropped from count queries.

`findFilter.IsGetAll()` (per-page `-1`) returns `" "` — no LIMIT at all.

## Argument ordering

`queryBuilder` keeps four separate argument slices, concatenated in a fixed order:

```go
func (qb queryBuilder) allArgs() []interface{} {
    var args []interface{}
    args = append(args, qb.withArgs...)
    args = append(args, qb.joinArgs...)
    args = append(args, qb.whereArgs...)
    args = append(args, qb.havingArgs...)
    return args
}
```

This must match the order the `?` placeholders appear in the generated SQL: `WITH ...
SELECT ... JOIN ... WHERE ... HAVING ...`. Adding a clause to the wrong bucket — say,
calling `addArg` (where) for an argument used in a HAVING clause — produces mismatched
placeholders. Symptoms are wrong results or `sql: expected N arguments`.

## Aggregates

`queryGroupedFields` wraps the filter query to compute totals:

```go
aggregateQuery.from = fmt.Sprintf("(%s) as temp", query.toSQL(false))
aggregateQuery.addColumn("COUNT(DISTINCT temp.id) as total")
aggregateQuery.addColumn("SUM(temp.duration) as duration")
```

The inner query is built with `includeSortPagination = false` — totals cover the whole
result set, not the current page.

The `#5503` fix is instructive: when summing duration or size, the file ID is added as a
column to the inner query, because `SELECT DISTINCT` over `(id, duration)` would collapse
two files of identical duration on the same scene into one row and undercount the total.

## Free-text search

`parseQueryString` handles the `q` parameter via `models.ParseSearchString`, supporting
required terms, excluded terms, and any-of sets:

```go
for _, t := range specs.MustHave {
    // (col1 LIKE ? OR col2 LIKE ? OR ...)
}
for _, t := range specs.MustNot {
    // coalesce(col) NOT LIKE ?   — per column, ANDed
}
for _, set := range specs.AnySets {
    // (col1 LIKE ? OR col1 LIKE ? OR col2 LIKE ? ...)
}
```

`coalesce()` on the MustNot path is important — `NULL NOT LIKE 'x'` is NULL, not true, so
without it rows with a null column would be excluded from negated searches.

For scenes, the searched columns are title, details, the concatenated folder+basename
path, fingerprints, and marker titles — which is why the `q` branch adds five joins
unconditionally.

## Adding a new filter criterion

1. Add the field to the GraphQL `<Entity>FilterType` in
   [`graphql/schema/types/`](../../graphql/schema/types/), run `make generate-backend`.
2. Add a handler to the `compoundHandler` in `pkg/sqlite/<entity>_filter.go`. Reuse a
   shared handler if the shape fits; supply an `addJoinFn` if the column needs a join.
3. If it needs a new join, add an `add<X>Table` method following the existing ones, and
   check that it behaves correctly when demoted to a left join by `or()`.
4. Add an integration test in `pkg/sqlite/<entity>_test.go`. Cover **each modifier**
   separately — they generate structurally different SQL, so testing `INCLUDES` tells you
   nothing about `EXCLUDES`.
5. Frontend: a criterion class in
   [`ui/v2.5/src/models/list-filter/criteria/`](../../ui/v2.5/src/models/list-filter/criteria/)
   and registration in the entity's filter options.

## Debugging

Set the log level to Trace. `pkg/sqlite/tx.go` logs every statement with its arguments and
duration; anything over 200ms is logged at Debug as `SLOW SQL`. That's usually the fastest
route from "this filter returns the wrong rows" to the actual generated SQL.
