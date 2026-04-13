# React Performance Patterns for Federated Search

Cherry-picked from [Vercel React Best Practices](https://github.com/vercel-labs/react-best-practices).
Each section maps to a specific rule ID.

## 1. Parallel async requests (`async-parallel`, CRITICAL)

Fire all source queries concurrently. Sequential fetches create waterfalls
that make the dropdown feel sluggish.

```tsx
// Bad: sequential — each source waits for the previous
const products = await fetchProducts(query)
const categories = await fetchCategories(query)
const brands = await fetchBrands(query)

// Good: parallel — all sources fire at once
const [products, categories, brands] = await Promise.all([
  fetchProducts(query),
  fetchCategories(query),
  fetchBrands(query),
])
```

With React Query / SWR, parallelism is automatic — each hook fires
independently:

```tsx
function useSearchSources(query: string) {
  const products = useQuery({ queryKey: ['products', query], queryFn: () => searchProducts(query) })
  const categories = useQuery({ queryKey: ['categories', query], queryFn: () => searchCategories(query) })
  const brands = useQuery({ queryKey: ['brands', query], queryFn: () => searchBrands(query) })
  return { products, categories, brands }
}
```

## 2. Partial dependencies (`async-dependencies`, CRITICAL)

When some sources depend on others (e.g., fetch brand first, then filter
products by brand), use promise chaining to start independent work early:

```tsx
const brandPromise = fetchBrand(query)
const categoryPromise = fetchCategories(query) // independent, starts immediately
const productPromise = brandPromise.then(brand => fetchProducts(query, brand.id))

const [brand, categories, products] = await Promise.all([
  brandPromise,
  categoryPromise,
  productPromise,
])
```

## 3. Suspense boundaries per group (`async-suspense-boundaries`, HIGH)

Wrap each result group in its own Suspense boundary so fast sources render
without waiting for slow ones:

```tsx
function SearchDropdown({ query }: { query: string }) {
  return (
    <div role="listbox">
      <Suspense fallback={<GroupSkeleton label="Products" />}>
        <ProductResults query={query} />
      </Suspense>
      <Suspense fallback={<GroupSkeleton label="Categories" />}>
        <CategoryResults query={query} />
      </Suspense>
      <Suspense fallback={<GroupSkeleton label="Brands" />}>
        <BrandResults query={query} />
      </Suspense>
    </div>
  )
}
```

This gives the user immediate feedback from whichever backend responds
first, while slower groups show loading skeletons.

## 4. Keep the input responsive (`rerender-use-deferred-value`, MEDIUM)

The search input must stay snappy even when results are loading. Use
`useDeferredValue` so the query used for fetching lags behind the
displayed input:

```tsx
function FederatedSearch() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  return (
    <>
      <input
        role="combobox"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div style={{ opacity: isStale ? 0.7 : 1 }}>
        <SearchDropdown query={deferredQuery} />
      </div>
    </>
  )
}
```

## 5. Request deduplication (`client-swr-dedup`, MEDIUM-HIGH)

With multiple components reading the same source, SWR/React Query
deduplicates automatically. If the user types "des" then "desk",
the "des" results are already cached:

```tsx
// Multiple components can call this — only one request fires
function useProductSearch(query: string) {
  return useSWR(
    query.length >= 2 ? `/api/products?q=${query}` : null,
    fetcher,
    { dedupingInterval: 300 }
  )
}
```

## 6. Debounce the query

Don't fire on every keystroke. Debounce 150-300ms:

```tsx
function useDebouncedValue<T>(val: T, ms = 200): T {
  const [debounced, setDebounced] = useState(val)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(val), ms)
    return () => clearTimeout(id)
  }, [val, ms])
  return debounced
}
```

Combine with `useDeferredValue` — debounce prevents network spam,
deferred value prevents render blocking:

```tsx
const [query, setQuery] = useState('')
const debounced = useDebouncedValue(query, 200)
const deferred = useDeferredValue(debounced)
// deferred is what you pass to search hooks
```
