# 03 — The query & filter engine

Every list screen in Stash — scenes, images, galleries, performers, studios, tags, groups,
markers — is served by this one engine. It is hand-rolled SQL string assembly, it is the
densest code in the repo, and it is where most subtle bugs live. Understand it once and
list-related work becomes routine.

## The two-phase query

A list query never selects entity columns. It selects **IDs only**, then hydrates.

```
  findScenes(scene_filter: {...}, filter: {sort, page, per_page, q})
        │
        ▼
  SceneStore.Query()                              pkg/sqlite/scene.go:1063
        │
        ├─ makeQuery()  ──────────► builds a queryBuilder  (SELECT DISTINCT scenes.id ...)
        │
        ├─ queryGroupedFields() ──► COUNT / SUM(duration) / SUM(size) aggregates
        │
        └─ query.findIDs()      ──► []int{ 12, 44, 7, ... }   ← ordered, paginated
                                            │
                                            ▼
                          models.SceneQueryResult{ IDs: [...] }
                                            │
                          Resolve(ctx) ─────┘   → SceneStore.FindMany(ids) → []*Scene
```

Why: the filter can require joins that multiply rows (a scene with 5 tags produces 5 rows).
Selecting `DISTINCT id` collapses that correctly; selecting columns would not, and would
also make `LIMIT` wrong. `distinctIDs()` (`pkg/sqlite/sql.go:19`) sets this up.

⚠️ **Consequence:** the result order comes from the ID query, and `FindMany` must preserve
it. If you write a new list endpoint, don't re-sort after hydration.

## The three types you need

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ queryBuilder            pkg/sqlite/query.go                             │
  │   The finished statement. Owns columns, FROM, joins, WHERE/HAVING/WITH  │
  │   clause strings, their args (in strict order), and sortAndPagination.  │
  │   Terminal ops: findIDs(), executeFind(), executeCount()                │
  └───────────────────────────────▲─────────────────────────────────────────┘
                                  │  query.addFilter(filter)
  ┌───────────────────────────────┴─────────────────────────────────────────┐
  │ filterBuilder           pkg/sqlite/filter.go:194                        │
  │   An accumulator + ONE optional sub-filter, combined with AND/OR/AND NOT│
  │   addWhere / addHaving / addWith / addInnerJoin / addLeftJoin           │
  │   Carries an error state (setError) so failures propagate lazily.       │
  └───────────────────────────────▲─────────────────────────────────────────┘
                                  │  handler.handle(ctx, f)
  ┌───────────────────────────────┴─────────────────────────────────────────┐
  │ criterionHandler        pkg/sqlite/criterion_handlers.go:16             │
  │   interface { handle(ctx, *filterBuilder) }                             │
  │   criterionHandlerFunc — a func adapter                                 │
  │   compoundHandler      — a []criterionHandler run in sequence           │
  └─────────────────────────────────────────────────────────────────────────┘
```

## How a filter is assembled

`pkg/sqlite/scene_filter.go` is the reference implementation. The shape is identical for
every entity.

```
  sceneFilterHandler{ sceneFilter }.handle(ctx, f)
        │
        ├─ validate()              reject illegal AND/OR/NOT combinations
        │
        ├─ f.handleCriterion(ctx, qb.criterionHandler())
        │        │
        │        └─ compoundHandler{                       ← one entry PER FILTER FIELD
        │               intCriterionHandler(sf.ID, "scenes.id", nil),
        │               stringCriterionHandler(sf.Title, "scenes.title"),
        │               pathCriterionHandler(sf.Path, "folders.path", "files.basename", qb.addFoldersTable),
        │               qb.tagsCriterionHandler(sf.Tags),
        │               ...
        │           }
        │
        └─ if sceneFilter.SubFilter() != nil:
               handleSubFilter(ctx, subHandler, f, sceneFilter.OperatorFilter)
                     │
                     └─► builds a NESTED filterBuilder and attaches it via f.and/f.or/f.not
```

### Sub-filters: the recursion

`SceneFilterType` embeds `OperatorFilter[SceneFilterType]` with `AND`, `OR`, `NOT` fields.
Exactly one may be set (`validateFilterCombination`, `filter.go:18`). This gives arbitrary
boolean nesting:

```
   scene_filter: {
     rating100: { value: 80, modifier: GREATER_THAN },
     OR: {
       tags: { value: ["3"], modifier: INCLUDES },
       OR: { studios: { value: ["9"], modifier: INCLUDES } }
     }
   }

                    filterBuilder (rating clause)
                          │ subFilterOp = "OR"
                          ▼
                    filterBuilder (tags clause)
                          │ subFilterOp = "OR"
                          ▼
                    filterBuilder (studios clause)
```

Rendered by `generateWhereClauses()` (`filter.go:388`) into
`(rating) OR ((tags) OR ((studios)))`.

⚠️ **A `filterBuilder` has exactly ONE sub-filter slot.** Calling `and()` twice sets
`errSubFilterAlreadySet`. Chains are linear, not trees — the *nesting* provides the tree.

### The OR/join trap (#6914)

This is the subtlest rule in the engine. `filter.go:255`:

```go
func (f *filterBuilder) or(o *filterBuilder) {
    // ...
    f.innerJoinsToLeftJoins()
    o.innerJoinsToLeftJoins()
}
```

Why: a criterion like "has tag X" adds an **INNER JOIN** on `scenes_tags`. Under AND
semantics that's correct — the row must have a tag. But under OR ("has tag X **or** rating
> 80"), the inner join would eliminate every untagged scene *before* the OR is evaluated,
so untagged high-rated scenes vanish.

```
   AND: scenes INNER JOIN scenes_tags ...  WHERE (tag=X) AND (rating>80)     ✔ correct
   OR:  scenes INNER JOIN scenes_tags ...  WHERE (tag=X) OR  (rating>80)     ✘ drops untagged
   OR:  scenes LEFT  JOIN scenes_tags ...  WHERE (tag=X) OR  (rating>80)     ✔ correct
```

**If you write a new criterion handler that adds an inner join, this is handled for you** —
as long as you go through `filterBuilder`. If you concatenate a join into the
`queryBuilder` directly, you've bypassed the fix.

### Join deduplication

`joins.addUnique` (`filter.go:150`) keys joins on **alias** (or table name if unaliased).
Adding the same alias twice is a no-op, with two merge rules:

- inner beats left (a later INNER JOIN upgrades an existing LEFT JOIN)
- non-sort beats sort (a join needed for filtering stops being sort-only)

This is why many handlers can each say "I need `scenes_files` joined" without producing
duplicate joins. It's also why **alias naming matters**: two different joins that happen to
share an alias will silently collapse into one. Look at `scene_filter.go:62-95` — the
oshash/md5/phash handlers each alias `files_fingerprints` distinctly
(`fingerprints_oshash`, `fingerprints_md5`, `fingerprints_phash`) precisely because they
need three separate joins to the same table.

### Sort-only joins

`join.sort = true` marks a join needed only for `ORDER BY`. `joins.toSQL(includeSortPagination)`
skips those when building the **count** query (`filter.go:198`), because counting doesn't
need to sort. Small optimisation, but it means the count query and the ID query can have
different FROM clauses — worth knowing when you're comparing them in a log.

## Criterion handler catalogue

`pkg/sqlite/criterion_handlers.go` — the reusable building blocks. Pick the closest one
before writing a new one.

| Handler | For | Notes |
|---|---|---|
| `stringCriterionHandler` | text columns | trims input; handles `MATCHES_REGEX`, `INCLUDES`, `EQUALS`, `IS_NULL`… |
| `stringNoTrimCriterionHandler` | text where whitespace is meaningful | |
| `pathCriterionHandler` | file paths | splits path vs basename across `folders`/`files` |
| `intCriterionHandler` / `floatCriterionHandler` | numeric | supports `BETWEEN` via `value`+`value2` |
| `boolCriterionHandler` | booleans | |
| `enumCriterionHandler` | fixed value sets | |
| `resolutionCriterionHandler` | video resolution buckets | compares against height/width columns |
| `orientationCriterionHandler` | portrait/landscape/square | derived from height vs width |
| `multiCriterionHandlerBuilder` | M:N with a direct FK | |
| `joinedMultiCriterionHandlerBuilder` | M:N **through a join table** | the common case: tags, performers |
| `hierarchicalMultiCriterionHandlerBuilder` | self-hierarchies (tags, studios) | recursive CTE, depth-limited |
| `joinedHierarchicalMultiCriterionHandlerBuilder` | hierarchy **through** a join table | scene→tags including child tags |
| `countCriterionHandlerBuilder` | `*_count` filters | emits `HAVING count(...)` |
| `stringListCriterionHandlerBuilder` | list-of-strings columns (URLs, aliases) | |
| `phashDistanceCriterionHandler` | perceptual hash proximity | |

### The `INCLUDES` vs `INCLUDES_ALL` vs `EXCLUDES` semantics

From `joinedMultiCriterionHandlerBuilder.handler` (`criterion_handlers.go:425`) and
`addHierarchicalConditionClauses` (`criterion_handlers.go:775`):

```
  INCLUDES      →  WHERE  join.foreign_id IS NOT NULL       (any of)
  INCLUDES_ALL  →  WHERE  join.foreign_id IS NOT NULL
                   HAVING count(distinct join.foreign_id) = <len(values)>   (all of)
  EXCLUDES      →  WHERE  join.foreign_id IS NULL           (none of)
  IS_NULL       →  LEFT JOIN + WHERE fk IS NULL             (no relationship at all)
  NOT_NULL      →  INNER JOIN + WHERE fk IS NOT NULL
```

⚠️ `EXCLUDES` is rewritten internally: the handler converts it to `INCLUDES_ALL` with the
values moved into `Excludes` (`criterion_handlers.go:459`). If you're reading a SQL log
and can't find your EXCLUDES, that's why.

⚠️ `HAVING` forces a `GROUP BY <table>.id` — see `buildQueryBody`
(`pkg/sqlite/repository.go:155`). Any handler that adds a `HAVING` changes the shape of the
whole query. That's fine, but it means aggregate-based filters can't be freely mixed with
some window-function tricks.

### Hierarchical filters (tags and studios)

Tags and studios form trees. "Find scenes tagged X" usually means "tagged X **or any
descendant of X**". `pkg/sqlite/filter_hierarchical.go:59` generates a recursive CTE:

```sql
WITH RECURSIVE parents AS (
    SELECT parent_id AS root_id, child_id AS item_id, 0 AS depth
      FROM tags_relations WHERE parent_id IN (?)
  UNION
    SELECT root_id, child_id, depth + 1
      FROM tags_relations INNER JOIN parents ON item_id = parent_id
     WHERE depth < ?          -- omitted entirely when depth = -1 (unlimited)
)
```

`depth` comes from the criterion (`HierarchicalMultiCriterionInput.Depth`):
`-1` = unlimited, `0` = exact match only, `n` = n levels down.

⚠️ `EQUALS` / `NOT_EQUALS` are rejected for hierarchical criteria
(`criterion_handlers.go:794`) — they're meaningless against a set expansion.

⚠️ The CTE is emitted via `addWith` / `addRecursiveWith`, and `recursiveWith` is a **single
flag on the whole query**. One recursive CTE makes the entire `WITH` clause `WITH
RECURSIVE`, which is legal SQL and harmless.

## Argument ordering — the invisible landmine

The builder concatenates SQL strings and collects `?` arguments in **four separate slices**,
then flattens them (`query.go:31`):

```go
func (qb queryBuilder) allArgs() []interface{} {
    args = append(args, qb.withArgs...)     // 1. WITH
    args = append(args, qb.joinArgs...)     // 2. JOIN ... ON
    args = append(args, qb.whereArgs...)    // 3. WHERE
    args = append(args, qb.havingArgs...)   // 4. HAVING
    return args
}
```

This order **must** match the textual order of `?` placeholders in the final SQL:

```
   WITH <with clauses>  SELECT ... FROM ... <joins>  WHERE ...  GROUP BY ...  HAVING ...
        └─ withArgs           └─ joinArgs        └─ whereArgs           └─ havingArgs
```

⚠️ **If you add a `?` to a clause, you must add its argument to the matching slice** —
`addArg` goes to `whereArgs`, `addHavingArg` to `havingArgs`. Getting this wrong doesn't
produce a syntax error; it produces a query that runs and returns *wrong rows*, because
SQLite binds positionally. Symptoms: filters that seem to apply the wrong value, or
"argument count mismatch" only when a particular combination of filters is active.

When debugging, the error messages from `executeFindQuery`
(`pkg/sqlite/repository.go:188`) include both the full SQL and the args — read them.

## Count vs find

`executeFindQuery` (`repository.go:167`) runs **two** queries:

```
  idsQuery   = WITH… SELECT DISTINCT scenes.id FROM … WHERE … HAVING … ORDER BY … LIMIT …
  countQuery = WITH… SELECT COUNT(*) as count FROM ( <same, minus sort/pagination> ) as temp
```

The count wraps the ID query as a subquery named `temp` (`buildCountQuery`,
`repository.go:65`). This is why the count is always exact and always correct with
`DISTINCT` and `HAVING` — but also why it costs roughly as much as the find. Aggregates
(total duration, total size) are a *third* query, built in `queryGroupedFields`.

If a list screen feels slow, it's usually three queries, not one.

## Sorting

`getSort(sort, direction, tableName)` — `pkg/sqlite/sql.go:92`. Special cases in order:

```
  "<rel>_count"      →  ORDER BY COUNT(distinct <rel>.id)      (requires the join to exist)
  "filesize"         →  ORDER BY <table>.size
  "random_<seed>"    →  deterministic pseudo-random permutation of id, seeded
  "random"           →  same, with a fresh random seed
  "name" | "title"   →  ORDER BY col COLLATE NATURAL_CI        (natural, case-insensitive)
  default            →  ORDER BY <table>.<sort>
                        (a sort containing "." is used verbatim — that's how you sort on a
                         joined column, e.g. "files.duration")
```

`NATURAL_CI` is a custom collation registered in `pkg/sqlite/driver.go` — it makes
"Scene 2" sort before "Scene 10". Use it for any new user-facing name column.

The **random seed** is the reason "Random" ordering is stable across pagination: the UI
generates a seed once (`ListFilterModel.setRandomSeed`) and passes `random_<seed>`, so
page 2 continues the same permutation instead of reshuffling.

⚠️ Entity-specific sorts are added *before* the generic fallback in each store's
`set<Entity>Sort` (e.g. `SceneStore.setSceneSort`, `pkg/sqlite/scene.go:1193`). That's
where you add a sort that needs a join — and you must mark the join `sort: true`.

## Free-text search (`q`)

`makeQuery` (`scene.go:1013`) handles `findFilter.Q` separately from the structured filter:
it force-joins files, folders, fingerprints and markers, then calls
`query.parseQueryString(searchColumns, q)` across:

```
  scenes.title, scenes.details,
  folders.path || '/' || files.basename,
  files_fingerprints.fingerprint,
  scene_markers.title
```

⚠️ These joins are added to the `queryBuilder` **unconditionally when `q` is set**, not via
`filterBuilder`. They're plain joins, so they don't participate in the OR/left-join fix.
That's safe today because `q` is always ANDed with everything else — but it's a
constraint to remember if you ever make `q` part of the boolean tree.

## Adding a new filter — the checklist

Say you want to filter scenes by a new `my_field` column.

```
 1. graphql/schema/types/scene.graphql
        add  my_field: StringCriterionInput   to SceneFilterType

 2. make generate-backend
        regenerates internal/api/generated_models.go → models.SceneFilterType gains MyField

 3. pkg/sqlite/scene_filter.go
        add to the compoundHandler in criterionHandler():
            stringCriterionHandler(sceneFilter.MyField, "scenes.my_field"),

 4. If it needs a join, write a small method on sceneFilterHandler:
        func (qb *sceneFilterHandler) myFieldCriterionHandler(c *models.StringCriterionInput) criterionHandlerFunc {
            return func(ctx context.Context, f *filterBuilder) {
                if c == nil { return }
                f.addInnerJoin("other_table", "", "other_table.scene_id = scenes.id")
                stringCriterionHandler(c, "other_table.col")(ctx, f)
            }
        }

 5. Frontend: ui/v2.5/src/models/list-filter/criteria/  + register in scenes.ts   (doc 05)

 6. Test: pkg/sqlite/scene_test.go — the filter tests are table-driven and thorough.
        Add cases for each modifier you support, INCLUDING the null/not-null pair.
```

⚠️ Step 6 is not optional in practice. `pkg/sqlite/*_test.go` are integration tests against
a real temporary SQLite database (`setup_test.go`), and they are the only thing that
catches argument-ordering bugs. Run them with `make it`.
