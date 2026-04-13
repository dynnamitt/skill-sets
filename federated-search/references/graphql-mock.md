# Quick GraphQL Mock Server for Federated Search

A minimal Node.js GraphQL server serving static JSON data. Useful for
prototyping the frontend without a real backend. Each entity type is a
separate query — mirroring the federated search pattern where the frontend
fires N parallel requests.

## Setup

```bash
mkdir search-mock && cd search-mock
npm init -y
npm i @apollo/server graphql
```

## Schema + server in one file

```js
// server.js
import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'

// --- Static data (replace with your domain) ---

const products = [
  { id: 'p1', name: 'Wireless Keyboard', sku: 'KB-001', type: 'ELECTRONICS' },
  { id: 'p2', name: 'Standing Desk', sku: 'DSK-042', type: 'FURNITURE' },
  { id: 'p3', name: 'USB-C Hub', sku: 'HUB-007', type: 'ELECTRONICS' },
  { id: 'p4', name: 'Desk Lamp', sku: 'LMP-019', type: 'FURNITURE' },
]

const categories = [
  { id: 'c1', name: 'Electronics', slug: 'electronics', parent: 'ROOT' },
  { id: 'c2', name: 'Furniture', slug: 'furniture', parent: 'ROOT' },
  { id: 'c3', name: 'Accessories', slug: 'accessories', parent: 'ELECTRONICS' },
]

const brands = [
  { id: 'b1', name: 'Acme', code: 'ACM' },
  { id: 'b2', name: 'Globex', code: 'GLX' },
  { id: 'b3', name: 'Initech', code: 'ITC' },
]

// --- Schema ---

const typeDefs = `#graphql
  type Product  { id: ID!, name: String!, sku: String!, type: String! }
  type Category { id: ID!, name: String!, slug: String!, parent: String! }
  type Brand    { id: ID!, name: String!, code: String! }

  type Query {
    searchProducts(q: String!, limit: Int = 5): [Product!]!
    searchCategories(q: String!, limit: Int = 5): [Category!]!
    searchBrands(q: String!, limit: Int = 5): [Brand!]!
  }
`

// --- Resolvers ---

const match = (fields, q) => item =>
  fields.some(f => item[f].toLowerCase().includes(q.toLowerCase()))

const resolvers = {
  Query: {
    searchProducts: (_, { q, limit }) =>
      products.filter(match(['name', 'sku'], q)).slice(0, limit),
    searchCategories: (_, { q, limit }) =>
      categories.filter(match(['name', 'slug'], q)).slice(0, limit),
    searchBrands: (_, { q, limit }) =>
      brands.filter(match(['name', 'code'], q)).slice(0, limit),
  },
}

// --- Start ---

const srv = new ApolloServer({ typeDefs, resolvers })
const { url } = await startStandaloneServer(srv, { listen: { port: 4000 } })
console.log(`Mock search API at ${url}`)
```

Add `"type": "module"` to package.json, then:

```bash
node server.js
```

Apollo Sandbox opens at `http://localhost:4000` for interactive queries.

## Example query (what the frontend fires in parallel)

```graphql
# These three run as separate requests, not one batched query,
# so each group can render as soon as its response arrives.

# Request 1
query SearchProducts($q: String!) {
  searchProducts(q: $q, limit: 5) { id name sku type }
}

# Request 2
query SearchCategories($q: String!) {
  searchCategories(q: $q, limit: 5) { id name slug parent }
}

# Request 3
query SearchBrands($q: String!) {
  searchBrands(q: $q, limit: 5) { id name code }
}
```

Variables: `{ "q": "desk" }`

## Simulating slow responses

Add artificial delay to test the lazy-loading UX:

```js
const delay = ms => new Promise(r => setTimeout(r, ms))

const resolvers = {
  Query: {
    searchProducts: async (_, { q, limit }) => {
      await delay(100)  // fast
      return products.filter(match(['name', 'sku'], q)).slice(0, limit)
    },
    searchCategories: async (_, { q, limit }) => {
      await delay(800)  // slow — tests skeleton/suspense
      return categories.filter(match(['name', 'slug'], q)).slice(0, limit)
    },
    searchBrands: async (_, { q, limit }) => {
      await delay(300)  // medium
      return brands.filter(match(['name', 'code'], q)).slice(0, limit)
    },
  },
}
```

This lets you see groups appear one by one — products first, then
brands, then categories — validating that your Suspense boundaries
and loading states work correctly.

## React hooks (client side)

Using Apollo Client with separate queries per group:

```tsx
const SEARCH_PRODUCTS = gql`
  query SearchProducts($q: String!) {
    searchProducts(q: $q, limit: 5) { id name sku type }
  }
`

function useSearchSources(query: string) {
  const skip = query.length < 2
  const products = useQuery(SEARCH_PRODUCTS, { variables: { q: query }, skip })
  const categories = useQuery(SEARCH_CATEGORIES, { variables: { q: query }, skip })
  const brands = useQuery(SEARCH_BRANDS, { variables: { q: query }, skip })

  return [
    { label: 'Products', ...products },
    { label: 'Categories', ...categories },
    { label: 'Brands', ...brands },
  ]
}
```

Each `useQuery` fires independently — Apollo Client handles caching
and dedup. The component re-renders as each response arrives, which
maps perfectly to the per-group Suspense pattern.
