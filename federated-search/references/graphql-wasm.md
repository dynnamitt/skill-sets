# Rust/WASM GraphQL Engines for Browser-Side Execution

Running the GraphQL engine inside the browser eliminates server roundtrips
for prototyping and enables offline-first scenarios. Three Rust options exist
at different maturity levels.

## 1. Exograph (production-ready, batteries-included)

The most complete solution. Compiles a full GraphQL runtime + Postgres
(via [pglite](https://pglite.dev)) to WASM. Runs entirely in-browser
with no server after initial asset load.

**What runs in WASM:**
- Tree-sitter parser + typechecker
- GraphQL query engine (translates GraphQL to SQL)
- PostgreSQL (pglite — Postgres compiled to WASM, in-memory)

**Use for federated search prototyping:**
- Define your entity types in an Exograph model
- The playground auto-generates GraphQL queries, mutations, and a schema
- Pre-populate with sample data, execute queries in-browser via GraphiQL
- Share prototypes as GitHub gists — no deploy needed

```
# Example Exograph model
@postgres
module ProductModule {
  @access(true)
  type Product {
    @pk id: Int = autoIncrement()
    name: String
    sku: String
    productType: String
  }
}
```

**Links:**
- [Playground (runs in browser)](https://exograph.dev/playground)
- [GraphQL Server in the Browser using WASM](https://exograph.dev/blog/playground)
- [GraphQL at the Edge with WASM — GraphQLConf 2024](https://graphql.org/conf/2024/schedule/b3cdfe65307832887ded26a9270d1295/)
- [Edge latency explorations (Cloudflare Workers)](https://exograph.dev/blog/wasm-pg-explorations-1)

**Also deploys to Cloudflare Workers** — same WASM binary runs at the edge
with real Postgres, so a prototype can graduate to production without a rewrite.

## 2. Juniper (compiles to wasm32, DIY integration)

The established Rust GraphQL server library. Compiles to `wasm32-unknown-unknown`
and is verified in CI. No built-in browser integration — you wire it up yourself.

**Status:** Compiles and passes `cargo check --target wasm32-unknown-unknown`.
Core crate + codegen work. No official browser examples.

**How to use in browser:**
1. Define schema with Juniper's derive macros
2. Use `execute_sync()` for sync execution (simpler in WASM)
3. Expose via `wasm-bindgen` as a JS-callable function
4. Call from your React app instead of `fetch()`

```rust
use juniper::{graphql_object, EmptyMutation, EmptySubscription, RootNode};
use wasm_bindgen::prelude::*;

struct Query;

#[graphql_object]
impl Query {
    fn search_products(q: String) -> Vec<Product> {
        PRODUCTS.iter()
            .filter(|v| v.name.to_lowercase().contains(&q.to_lowercase()))
            .cloned()
            .collect()
    }
}

#[wasm_bindgen]
pub fn execute_query(query: &str, variables: &str) -> String {
    let schema = RootNode::new(Query, EmptyMutation::new(), EmptySubscription::new());
    let (result, _errors) = juniper::execute_sync(query, None, &schema, &vars, &ctx).unwrap();
    serde_json::to_string(&result).unwrap()
}
```

**Caveats:**
- `chrono` and `time` features pull in `js-sys` — pin dependency versions
  or disable default features if targeting non-browser WASM
- No built-in DB layer — you provide static data or hook up an in-memory store
- Async execution needs a WASM-compatible runtime (`wasm-bindgen-futures`)

**Links:**
- [juniper on GitHub](https://github.com/graphql-rust/juniper)
- [WASM support issue #218](https://github.com/graphql-rust/juniper/issues/218)

## 3. async-graphql (feasible, not officially supported)

The high-performance async GraphQL library. WASM support is "totally doable"
per the maintainer but not officially documented or tested.

**Status:** Community discussion, no official examples. Needs a
WASM-compatible async runtime (`wasm-bindgen-futures`).

**Links:**
- [async-graphql on GitHub](https://github.com/async-graphql/async-graphql)
- [WASM discussion #888](https://github.com/async-graphql/async-graphql/discussions/888)

## 4. graphql-client (client only, not an engine)

Not a server/executor — this is a **typed GraphQL client** for Rust that
compiles to WASM. Useful for making GraphQL requests _from_ browser WASM
code, not for _executing_ queries locally.

Mentioned for completeness — if your WASM app needs to call an external
GraphQL API, this is the tool.

**Links:**
- [graphql-client on GitHub](https://github.com/graphql-rust/graphql-client)
- [graphql_client 0.6 — to the browser and beyond](https://dev.to/tomhoule/graphqlclient-06-to-the-browser-and-beyond-3cb8)

## Decision guide

| Need | Use |
|------|-----|
| Quick prototype with real SQL | **Exograph** playground — zero setup |
| Offline-first with in-browser DB | **Exograph** + pglite WASM |
| Custom schema logic in Rust | **Juniper** + `wasm-bindgen` + static data |
| Edge deployment (Cloudflare Workers) | **Exograph** — same binary runs at edge |
| Just a mock for frontend dev | `references/graphql-mock.md` (Node + Apollo) is simpler |

## The federated search angle

For prototyping federated search without any server:

1. Compile separate Juniper/Exograph resolvers per entity type to WASM
2. Each `useQuery` hook calls into a WASM function instead of `fetch()`
3. Results still arrive independently (each WASM call is a separate promise)
4. The Suspense/streaming UX works identically — the browser just happens
   to be both client and server

This is useful for demos, offline mode, and environments where you
can't run a backend. For production, the Node mock or real backend
is more practical unless you're deploying to Cloudflare Workers.
