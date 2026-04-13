# Relationship-Aware Resolvers

Federated search groups often span entities with **parent/child/sibling
relationships**. A naive "one resolver per flat entity" approach breaks
as soon as a filter field lives on a different entity than the one being
searched. Interview the data model thoroughly before writing resolvers.

## The problem

Given three entity types with relationships:

```
Product  ──hasOne──▶  Category  ◀──hasMany──  Brand
                       │
                 type: "ELECTRONICS"
```

A filter like `type:Electronics` lives on **Category**. If the Product
resolver only matches against its own fields (`name`, `sku`), it can
never filter by `type` without joining through Category. The Brand
resolver has the same problem if brands relate to categories.

**Symptom:** `type:Electronics` returns correct Categories but zero
Products and all Brands. The resolver was string-matching "electronics"
against Product.name instead of joining through the relationship.

## Data model interview checklist

Before writing resolvers, map out for every `field:value` filter prefix:

1. **Which entity owns this field?** (e.g. `type` lives on Category)
2. **Which entities need it?** (Products, Brands — anything the user
   expects to narrow down when they type `type:Electronics`)
3. **What is the join path?** (Product → Category via `categoryId`,
   Brand → Category via `categories[]` array)
4. **Which direction?** Forward join (child → parent) or reverse join
   (parent surfaces when child matches)?
5. **Where does the FK live?** On the child? On the parent as an ID
   array? Through a join table? This determines the lookup data
   structure and the SQL shape.

```
Entity ownership matrix — fill this out per filterable field:

| Filter field | Owner entity | Entities that need it | Join path              |
|-------------|-------------|----------------------|------------------------|
| type        | Category    | Product, Brand        | Product.categoryId → C |
| brand       | Brand       | Product              | Product.brandCode → B  |
| status      | Product     | (self)               | direct — no join       |
```

## Three resolver join patterns

### 1. Forward join (child → parent field)

The child entity references a parent but doesn't own the filter field.
Build a lookup from the parent, then resolve in the child's filter.

```js
// Lookup: parent name → parent object
const catByName = Object.fromEntries(
  categories.map(c => [c.name, c])
)

// Product resolver joins UP through Category for `type` filter
searchProducts: ({ q, type }) => {
  const { tokens, mode } = modeFrom(q, type)
  return products.filter(p => {
    if (mode) {
      const cat = catByName[p.categoryName]
      if (!cat || !cat.type.toLowerCase().startsWith(mode)) return false
    }
    return matchAll(tokens, p.name, p.sku)
  })
}
```

**SQL equivalent:**
```sql
SELECT p.* FROM product p
  JOIN category c ON c.id = p.category_id
WHERE c.type ILIKE 'electronics%'
  AND (p.name ILIKE '%desk%' OR p.sku ILIKE '%desk%')
```

### 2. Reverse join (parent surfaces when child matches)

A search for "KB-001" (a Product SKU) should also surface the parent
Category in its group. The Category resolver matches its own fields
**OR** checks if any child Product matches.

```js
// Collect parent names reachable from matching children
const catNamesFromProducts = tokens =>
  tokens.length
    ? new Set(
        products
          .filter(p => matchAll(tokens, p.name, p.sku))
          .map(p => p.categoryName)
      )
    : new Set()

searchCategories: ({ q, type }) => {
  const { tokens, mode } = modeFrom(q, type)
  const fromProducts = catNamesFromProducts(tokens)
  return categories.filter(c => {
    if (mode && !c.type.toLowerCase().startsWith(mode)) return false
    return matchAll(tokens, c.name, c.slug) || fromProducts.has(c.name)
  })
}
```

**SQL equivalent:**
```sql
SELECT c.* FROM category c
WHERE (c.name ILIKE '%kb-001%' OR c.slug ILIKE '%kb-001%')
   OR EXISTS (
     SELECT 1 FROM product p
     WHERE p.category_id = c.id
       AND (p.name ILIKE '%kb-001%' OR p.sku ILIKE '%kb-001%')
   )
```

### 3. Sibling join (child → parent → parent's collection)

Brands relate to Categories, and Categories own Products. A search
matching a Product should also surface the Brand (via Category). This
chains: match Products → find their Categories → find Brands linked
to those Categories.

```js
searchBrands: ({ q, type }) => {
  const { tokens, mode } = modeFrom(q, type)
  // Reuse the same Category matcher (forward + reverse joins)
  const matchedCats = matchCategories(tokens, mode, catNamesFromProducts(tokens))
  const reachableBrandCodes = new Set(
    matchedCats.flatMap(c => c.brands ?? [])
  )
  return brands.filter(b => {
    if (mode && !reachableBrandCodes.has(b.code)) return false
    return matchAll(tokens, b.name, b.code) || reachableBrandCodes.has(b.code)
  })
}
```

## Extract shared helpers to avoid duplication

When multiple resolvers traverse the same relationship graph, the same
filter logic gets copy-pasted. Extract three helpers:

```js
// 1. Parse query + resolve filter from prefix or GraphQL arg
const modeFrom = (q, override) => {
  const { filters, tokens } = parseQuery(q)
  return { tokens, mode: override || filters.find(f => f.field === 'type')?.val }
}

// 2. Reverse join: which parent names are reachable from matching children?
const catNamesFromProducts = tokens =>
  tokens.length
    ? new Set(
        products
          .filter(p => matchAll(tokens, p.name, p.sku))
          .map(p => p.categoryName)
      )
    : new Set()

// 3. Match parent entities (used by Category resolver AND Brand resolver)
const matchCategories = (tokens, mode, catNames) =>
  categories.filter(c => {
    if (mode && !c.type.toLowerCase().startsWith(mode)) return false
    return matchAll(tokens, c.name, c.slug) || catNames.has(c.name)
  })
```

The Category resolver becomes a one-liner. The Brand resolver reuses
`matchCategories` output to find reachable brands. No duplication.

## Guard: empty tokens and reverse joins

When `tokens` is empty (pure filter query like `type:Electronics`),
`matchAll([], ...)` returns `true` for everything. The reverse-join
set would contain **all** parent names — making the join a no-op that
adds all parents regardless of the filter.

Always guard:
```js
const catNamesFromProducts = tokens =>
  tokens.length ? new Set(/* ... */) : new Set()
```

## Key takeaway

**The relationship graph determines resolver complexity, not the number
of entity types.** Flat, independent entities need flat resolvers. The
moment a filter field is owned by a different entity, every resolver
that needs that filter must join through the owner. Map the
relationships first — write resolvers second.
