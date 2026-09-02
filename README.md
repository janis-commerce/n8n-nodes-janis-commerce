# n8n-nodes-janis-commerce

n8n community node for [Janis Commerce](https://janis.in). Connect your
n8n workflows to Janis: consume the REST API of every service (Orders,
Products, SKUs, Prices, Stock) and react to platform events via webhooks.

Package: `@janiscommerce/n8n-nodes-janis-commerce`

## What's inside

- **Action node — `Janis Commerce`**: consume the Janis Commerce REST API
  (Order, Product, SKU, SKU Price, SKU Stock). Supports single-resource
  `Get` and paginated `Get Many` operations following the
  `@janiscommerce/api-list` contract (`x-janis-page` /
  `x-janis-page-size` / `x-janis-total`).
- **Trigger node — `Janis Commerce Trigger`**: exposes a public webhook URL
  that receives Janis events. Filter by resource + event, or use
  *Any (Router)* to receive every event and dispatch downstream with a
  Switch node. Emits either the raw webhook payload or, in *Full Resource*
  mode, fetches the full entity from the origin service using the
  credential.
- **Credential — `Janis Commerce API`**: API key + secret + client code +
  environment (`prod` / `qa` / `beta`). One credential works for every
  Janis service in the same environment.

## Installation

### In a hosted n8n instance (v1.94+)

Open **Settings → Community Nodes**, click **Install**, and paste:

```
@janiscommerce/n8n-nodes-janis-commerce
```

The three items above will appear in the nodes panel next to the built-in
n8n nodes.

### In a self-hosted n8n instance

Mount the built package into the n8n container's custom-extensions path.
Example for `docker-compose`:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    environment:
      N8N_CUSTOM_EXTENSIONS: /home/node/custom/dist
    volumes:
      - /path/to/n8n-nodes-janis-commerce:/home/node/custom:ro
```

Clone this repo, run `npm install && npm run build` before starting the
stack — n8n loads the `dist/` folder at boot.

## Credential setup

Create a **Janis Commerce API** credential and fill in:

| Field | Description |
|---|---|
| API Key | The `janis-api-key` value provided by Janis |
| API Secret | The `janis-api-secret` value provided by Janis |
| Client Code | The tenant code (`janis-client` header) |
| Environment | `prod`, `qa`, or `beta` |

The credential injects these headers on every request:

| Header | Source |
|---|---|
| `janis-api-key` | `apiKey` |
| `janis-api-secret` | `apiSecret` |
| `janis-client` | `clientCode` |

> **⚠ Security recommendation.** In the credential form, set **Allowed HTTP
> Request Domains** to **Specific Domains** and paste:
> `*.janis.in, *.*.janis.in, *.janisqa.in, *.*.janisqa.in, *.janisdev.in, *.*.janisdev.in`.
> This restricts the credential (when used from the built-in HTTP Request
> node) so it can only reach Janis domains. Without it, any user with
> access to the workflow could send the `janis-api-key` / `janis-api-secret`
> to arbitrary URLs.

The `environment` field resolves the base domain per service:

| Environment | Base domain |
|---|---|
| `prod` | `janis.in` |
| `qa` | `janisqa.in` |
| `beta` | `janisdev.in` |

Each operation declares its subdomain (`oms`, `catalog`, `pricing`,
`wms`), so a single credential covers every service in the same
environment. The credential test hits `GET https://oms.<domain>/api/order`
in the selected environment.

## Action node — `Janis Commerce`

| Resource | Operation | Origin service | Endpoint |
|---|---|---|---|
| Order | Get | `oms` | `GET /api/order/{id}` |
| Order | Get Many | `oms` | `GET /api/order` |
| Product | Get | `catalog` | `GET /api/product/{id}` |
| Product | Get Many | `catalog` | `GET /api/product` |
| Sku | Get | `catalog` | `GET /api/sku/{id}` |
| Sku | Get Many | `catalog` | `GET /api/sku` |
| Sku Price | Get | `pricing` | `GET /api/sku-price/{skuId}` |
| Sku Price | Get Many | `pricing` | `GET /api/sku-price` (requires `skuIds`) |
| Sku Stock | Get | `wms` | `GET /api/sku-stock/{skuId}` |

**Filters** are sent as `filters[<field>]=<value>` (deep object). Order
lists also support date-range sub-objects (`commerceDateCreatedRange`,
`deliveryDateRange`). Free-form filters are available under **Additional
Filters** for every list.

**Sort** uses `sortBy=<field>` + `sortDirection=asc|desc`.

**Pagination** uses `x-janis-page` / `x-janis-page-size` headers and
reads the total from the `x-janis-total` response header. Enable
**Return All** to paginate until the total is reached, or set a **Limit**.

## Trigger node — `Janis Commerce Trigger`

Registers a public webhook URL. Point Janis Commerce webhooks at that URL
and pick the event in the node.

### Resource + Event

Pick a specific resource to filter one event, or **Any (Router)** to
accept every event and dispatch downstream with a **Switch** node.

**Order events** (21 in total, all resolved to `GET /api/order/{id}` on
`oms` in Full Resource mode):

`canceled`, `cancelationRequested`, `cancelationRejected`, `complete`,
`delivered`, `deliveryRescheduled`, `inDelivery`, `invoiced`,
`needsRepacking`, `needsRescheduling`, `notDelivered`, `partiallyPicked`,
`picking`, `readyForDelivery`, `readyForInvoice`, `readyForPicking`,
`refunded`, `refundRejected`, `requestRefund`, `requiresIntervention`,
`rescheduled`.

**Other resources**:

| Resource | Event | Origin service | ID path in payload |
|---|---|---|---|
| Product | `saved` | `catalog` | `metadata.id` |
| Sku | `saved` | `catalog` | `metadata.id` |
| Sku Price | `updated` | `pricing` | `metadata.sku` |
| Sku Stock | `updated` | `wms` | `metadata.sku` |

### Output modes

- **Webhook Payload** — emit the raw JSON body sent by Janis.
- **Full Resource** — take the ID from the payload (path resolved
  automatically per event), `GET` the entity from the origin service
  using the credential, and emit the full object.

In **Any (Router)** mode with Full Resource, the fetched object also
includes an `_event` field with `eventName`, `entity`, `service`, and
`eventDate` — use it in a downstream `Switch` node to dispatch to
subflows.

### Sample payloads

Each event ships with a sample of both the raw webhook body and the
fetched full resource. Hit **Execute step** on the trigger in the
editor: it emits the sample of the selected event to the output panel
(pretty-printed and drag-and-drop into downstream nodes with
expressions). No real webhook needed to design the flow.

### Authentication (optional)

Enable **Header Auth** to require a shared-secret header. Requests
without the expected header value are rejected with `401`.

### Webhook lifecycle

The trigger exposes a public webhook URL but does **not** auto-register
the corresponding subscription in Janis today. Create the subscription
in the Janis UI (or via `POST /api/subscription` on the webhooks
service) and paste the n8n webhook URL as the endpoint.

## Development

Requirements: Node 20.15+ (see `.nvmrc`), npm 10+.

```bash
npm install
npm run dev      # n8n-node dev  → live-reload against a local n8n instance
npm run build    # n8n-node build → dist/ + icons
npm run lint     # n8n-node lint
npm run lint:fix # n8n-node lint --fix
```

## License

[MIT](./LICENSE.md) &copy; Janis Commerce
