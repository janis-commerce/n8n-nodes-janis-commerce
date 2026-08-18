# @janiscommerce/n8n-nodes-janis-commerce

n8n community node for [Janis Commerce](https://janis.in). Provides:

- **Action node — `Janis Commerce`**: consume the Janis Commerce REST API
  (Order, Product, SKU, SKU Price, SKU Stock). Supports single-resource GET
  and paginated list operations following the `@janiscommerce/api-list`
  contract (`x-janis-page` / `x-janis-page-size` / `x-janis-total`).
- **Trigger node — `Janis Commerce Trigger`**: exposes a public webhook URL
  that receives Janis events. Emits either the raw webhook payload or, when
  set to *Full Resource*, fetches the full entity from the origin service
  using the credential.
- **Credential — `Janis Commerce API`**: API key + secret + client code +
  environment (`prod` / `qa` / `beta`).

[Installation](#installation) &middot;
[Credential](#credential) &middot;
[Nodes](#nodes) &middot;
[Development](#development) &middot;
[Release](#release)

## Installation

### Verified community node (once published & verified)

In n8n **v1.94+**, open **Settings → Community Nodes**, click *Install*, and
enter `@janiscommerce/n8n-nodes-janis-commerce`. Verified nodes also appear in
the nodes panel search alongside built-in nodes.

### Self-hosted (before publication or for development)

Mount the built package into the n8n container's custom-extensions path.
The `janis-ipaas-service` compose file already does this by mounting a
relative path into `/home/node/custom`:

```yaml
# janis-ipaas-service/docker-compose.yml
volumes:
  - ../janiscommerce/n8n-nodes-janis-commerce:/home/node/custom:ro
environment:
  N8N_CUSTOM_EXTENSIONS: /home/node/custom/dist
```

Run `npm install && npm run build` in this repo before starting the compose
stack — n8n loads the `dist/` folder.

## Credential

The `Janis Commerce API` credential injects the following headers on every
request:

| Header | Source |
|--------|--------|
| `janis-api-key` | `apiKey` |
| `janis-api-secret` | `apiSecret` |
| `janis-client` | `clientCode` |

The `environment` field resolves the domain base:

| Environment | Base domain |
|-------------|-------------|
| `prod` | `janis.in` |
| `qa` | `janisqa.in` |
| `beta` | `janisdev.in` |

Each operation declares its subdomain (`oms`, `catalog`, `pricing`, `wms`),
so a single credential works for every service in the same environment.

The credential-test hits `GET https://oms.<domain>/api/order` in the selected
environment.

## Nodes

### Janis Commerce (action)

| Resource | Operation | Origin service | Endpoint |
|----------|-----------|----------------|----------|
| Order | Get | `oms` | `GET /api/order/{id}` |
| Order | Get Many | `oms` | `GET /api/order` |
| Product | Get | `catalog` | `GET /api/product/{id}` |
| Product | Get Many | `catalog` | `GET /api/product` |
| Sku | Get | `catalog` | `GET /api/sku/{id}` |
| Sku | Get Many | `catalog` | `GET /api/sku` |
| Sku Price | Get | `pricing` | `GET /api/sku-price/{skuId}` |
| Sku Price | Get Many | `pricing` | `GET /api/sku-price` (requires `skuIds`) |
| Sku Stock | Get | `wms` | `GET /api/sku-stock/{skuId}` |

**Filters** are sent as `filters[<field>]=<value>` (deep object). Order lists
also support date-range sub-objects (`commerceDateCreatedRange`,
`deliveryDateRange`). Free-form filters are available under **Additional
Filters**.

**Sort** uses `sortBy=<field>` + `sortDirection=asc|desc`.

**Pagination** uses `x-janis-page` / `x-janis-page-size` headers and reads
the total from the `x-janis-total` response header. Enable *Return All* to
paginate until the total is reached, or set a Limit.

### Janis Commerce Trigger (webhook)

Registers a public webhook URL. Point Janis Commerce webhooks at that URL
and pick the event in the node.

| Event | Origin service | ID path in payload |
|-------|----------------|--------------------|
| `orderCancelled` | `oms` | `metadata.id` |
| `productSaved` | `catalog` | `metadata.id` |
| `skuSaved` | `catalog` | `metadata.id` |
| `skuPriceUpdated` | `pricing` | `metadata.sku` |
| `skuStockUpdated` | `wms` | `metadata.sku` |

**Output modes**:

- **Webhook Payload** — emit the raw JSON body sent by Janis.
- **Full Resource** — take the ID from the payload, `GET` the entity from the
  origin service using the credential, and emit the full object.

**Authentication** (optional): shared-secret header validation. Reject
requests with `401` unless the configured header matches the expected value.

## Development

Requirements: Node 20.15+ (see `.nvmrc`), npm 10+.

```bash
npm install
npm run dev      # n8n-node dev  → live-reload against a local n8n instance
npm run build    # n8n-node build → dist/ + icons
npm run lint     # n8n-node lint
npm run lint:fix # n8n-node lint --fix
```

## Release

Releases go out via `.github/workflows/publish.yml` on tag push
(`0.1.0`, `1.2.3`, …).

Locally:

```bash
npm run release   # release-it: lint + build + bump + changelog + tag + push
```

The workflow uses **npm OIDC Trusted Publishing** (no long-lived tokens) and
publishes with `--provenance`. Trusted publisher setup on npmjs.com:

- **Repository owner**: `janis-commerce`
- **Repository name**: `n8n-nodes-janis-commerce`
- **Workflow name**: `publish.yml`
- **Environment**: *(leave blank)*

## Known limitations / TODO

- **Webhook auto-registration** — the Trigger node exposes a webhook URL but
  does NOT auto-create the corresponding subscription in Janis. Users must
  manually create the `order-hook` (or the equivalent per microservice) via
  Janis' API/UI and paste the n8n webhook URL. `webhookMethods` (checkExists /
  create / delete) is on the roadmap; once implemented, activating the
  workflow will register the hook on Janis and deactivating will remove it.

## Verification (n8n Creator Portal)

To have this package listed as **verified** in the n8n nodes panel, submit it
at [creators.n8n.io/nodes](https://creators.n8n.io/nodes) after publishing to
npm. The package already meets the mandatory technical criteria:

- Scoped name under `@janiscommerce/n8n-nodes-*`.
- `n8n-community-node-package` keyword.
- `n8n.strict: true`.
- MIT license.
- Zero runtime dependencies.
- `package.json.repository.url` matches the GitHub repo.
- Published via GitHub Actions with npm provenance (required from
  2026-05-01).

## License

[MIT](./LICENSE.md) &copy; Janis Commerce
