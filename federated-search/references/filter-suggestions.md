# Optional Filter Suggestions Block

An additional dropdown group — shown above entity results — that suggests
`field:value` filter prefixes when the user's free text matches a known
enum value. Gated by a toggle so the UX stays clean when not needed.

```
[x] Enable filter suggestions
┌─────────────────────────────────────┐
│ SUGGESTED FILTERS                   │
│  type:Electronics                   │
│  type:Electronics → Accessories     │
├─────────────────────────────────────┤
│ PRODUCTS        (filtered by type)  │
│  Wireless Keyboard  KB-001          │
│  USB-C Hub          HUB-007         │
├─────────────────────────────────────┤
│ CATEGORIES                          │
│  Electronics                        │
│  Accessories                        │
├─────────────────────────────────────┤
│ BRANDS                              │
│  ...                                │
└─────────────────────────────────────┘
```

## Concepts

**Enum registry** — a map of field names to their known values, derived
from the data at load time. Any number of enum fields can be registered:

```js
const enums = {
  type:   [...new Set(products.map(p => p.type))],     // ['ELECTRONICS', 'FURNITURE']
  parent: [...new Set(categories.map(c => c.parent))], // ['ROOT', 'ELECTRONICS']
}
```

**Query parser** — splits the raw input into structured `{ filters, tokens }`:

```
"elec desk" → { filters: [], tokens: ['elec', 'desk'] }
"type:Electronics desk" → { filters: [{field:'type', val:'electronics'}], tokens: ['desk'] }
```

**AND tokenization** — spaces split free text into tokens; every token
must match at least one searchable field per item.

**Filter suggestion** — when a free-text token is a prefix of a known
enum value, offer to replace it with a `field:value` filter.

## Core functions

### `parseQuery(raw, enums)`

Splits input on whitespace. Tokens containing `:` where the prefix is a
key in `enums` become filters; the rest are free-text tokens.

```js
function parseQuery(raw, enums) {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  const filters = [], tokens = []
  for (const p of parts) {
    const col = p.indexOf(':')
    if (col > 0) {
      const field = p.slice(0, col)
      if (enums[field]) {
        filters.push({ field, val: p.slice(col + 1).toLowerCase() })
        continue
      }
    }
    tokens.push(p.toLowerCase())
  }
  return { filters, tokens }
}
```

### `matchAll(tokens, ...fields)`

AND-match: every token must appear as a substring in at least one field.

```js
const matchAll = (tokens, ...fields) =>
  tokens.length === 0 ||
  tokens.every(t => fields.some(f => f?.toLowerCase().includes(t)))
```

### `suggestFilters(tokens, enums)`

Match free-text tokens against enum values. Returns deduplicated
suggestions with a reference to which token triggered the match.

```js
function suggestFilters(tokens, enums) {
  const seen = new Set()
  const hits = []
  for (const t of tokens) {
    for (const [field, vals] of Object.entries(enums)) {
      for (const v of vals) {
        const key = `${field}:${v}`
        if (v.toLowerCase().startsWith(t) && !seen.has(key)) {
          seen.add(key)
          hits.push({ field, value: v, matchedToken: t })
        }
      }
    }
  }
  return hits
}
```

### Applying filters in resolvers

Resolvers receive the raw query string, parse it, and apply filters as
exact-match predicates before AND-matching remaining free-text tokens:

```js
searchProducts: (_, { q, type }) => {
  const { filters, tokens } = parseQuery(q, enums)
  const mode = type || filters.find(f => f.field === 'type')?.val
  return products.filter(p => {
    if (mode && !p.type.toLowerCase().startsWith(mode)) return false
    return matchAll(tokens, p.name, p.sku)
  })
}
```

Resolvers for entities that don't have the filtered field simply ignore
it and apply only free-text AND matching:

```js
searchBrands: (_, { q }) => {
  const { tokens } = parseQuery(q, enums)
  return brands.filter(b => matchAll(tokens, b.name, b.code))
}
```

## Suggestion click: cursor-aware token replacement

When the user clicks a suggestion, replace the matching token nearest
to the cursor position — not the first occurrence:

```js
function replaceToken(inputEl, matched, replacement) {
  const raw = inputEl.value
  const cursor = inputEl.selectionStart ?? raw.length

  const parts = [...raw.matchAll(/\S+/g)].map(m => ({
    text: m[0], start: m.index, end: m.index + m[0].length,
  }))

  let best = -1, bestDist = Infinity
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].text.toLowerCase() !== matched) continue
    const dist = Math.abs(cursor - (parts[i].start + parts[i].end) / 2)
    if (dist < bestDist) { bestDist = dist; best = i }
  }

  if (best >= 0) {
    const p = parts[best]
    inputEl.value = raw.slice(0, p.start) + replacement + raw.slice(p.end)
  } else {
    inputEl.value = (raw.trimEnd() + ' ' + replacement).trimStart()
  }
}
```

## Dropdown open/close with DOM replacement

When a suggestion click triggers a re-search, the listbox DOM is
replaced. The click target becomes detached before the document-level
click-outside handler fires, causing a false "outside click" that
hides the dropdown.

Fix with a timestamp guard — a common pattern in Radix UI and
Headless UI:

```js
let lastSearchAt = 0

function search(term) {
  lastSearchAt = Date.now()
  // ... rebuild listbox ...
}

document.addEventListener('click', e => {
  if (Date.now() - lastSearchAt < 50) return  // search just replaced DOM
  if (!e.target.closest('.search-root')) closeDropdown()
})
```

## Enter key behavior

Enter should only close the dropdown and select when there is a clear
target:

| State | Enter behavior |
|-------|---------------|
| Arrow-highlighted entity | Select → close, show detail |
| Arrow-highlighted filter suggestion | Apply filter → re-search, stay open |
| No highlight, exactly 1 entity result | Auto-select that entity |
| No highlight, 0 or 2+ entities | No-op |

```js
if (e.key === 'Enter') {
  e.preventDefault()
  if (activeIdx >= 0) {
    select(flatItems[activeIdx])
  } else {
    const entities = listbox.querySelectorAll('.result-item:not(.filter-suggestion)')
    if (entities.length === 1) select(entities[0])
  }
}
```

## Gating with a toggle

The filter suggestions block adds cognitive load. Gate it behind an
opt-in control (checkbox, toggle, keyboard shortcut) so the default
search stays simple:

```html
<label class="filter-toggle">
  <input type="checkbox" id="filter-toggle" />
  Enable filter suggestions
</label>
```

In the search function, only run `suggestFilters()` and render the
suggestion group when the toggle is checked.

## Adding more enum fields

The pattern scales to any number of fields. Register them in `enums`
and they automatically become suggestible and parseable:

```js
const enums = {
  type:     ['ELECTRONICS', 'FURNITURE'],
  parent:   ['ROOT', 'ELECTRONICS'],
  brand:    ['ACM', 'GLX', 'ITC'],
  status:   ['ACTIVE', 'DISCONTINUED'],
}
```

Typing `"a"` with suggestions enabled would show:
- `type:ACTIVE` (if status is registered as `type` — use distinct names)
- `parent:... ` — no match
- `brand:ACM`
- `status:ACTIVE`
