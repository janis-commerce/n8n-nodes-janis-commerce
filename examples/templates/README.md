# Public templates for n8n.io

Two templates ready to submit at [creators.n8n.io/templates](https://creators.n8n.io/templates).

| File | Style | Best for |
|------|-------|----------|
| `template-a-all-in-one.json` | Single workflow. Trigger + Switch + inline handler branches. | Users who want a plug-and-play example — download, install the community node, import, tweak the 3 handler branches. |
| `template-b-router.json` | Router-only. Points to 3 subworkflows the user must create. | Users who want to build modular integrations with independent, versionable subworkflows. |

## Submission — Template A (all-in-one)

**Title**
```
Janis Commerce — Webhook Router (All-in-One)
```

**Description** (markdown, paste into the portal)
```
Receive every webhook Janis Commerce sends (orders, products, SKUs, prices, stock) on ONE URL, fetch the full resource from the origin service, and route it to per-event handlers with a Switch node. All in a single workflow.

**Why this pattern**
- **1 subscription per microservice** in Janis (OMS / Catalog / Pricing / WMS) instead of one per event.
- **Full Resource** fetched by the trigger — handlers receive the full order/product/SKU without another API call.
- **All logic on one canvas** — easy to inspect, easy to modify.

**How it works**
1. The `Janis Commerce Trigger` node (Resource: Any) exposes a webhook URL and fetches the full resource whenever an event arrives.
2. The Switch node routes each event by `{{ $json._event.eventName }}`.
3. Each branch has a Set placeholder — replace with your business logic (Slack, HTTP Request, DB, etc.).

**Setup (2 minutes)**
1. Install the community node `@janiscommerce/n8n-nodes-janis-commerce` (Settings → Community Nodes).
2. Connect a `Janis Commerce API` credential to the trigger.
3. Activate the workflow — copy the webhook URL n8n shows.
4. In Janis, create ONE webhook subscription per microservice pointing at that URL with all events enabled.

**Events supported**
Order (20): cancelationRejected, cancelationRequested, canceled, complete, delivered, deliveryRescheduled, inDelivery, invoiced, needsRepacking, needsRescheduling, notDelivered, partiallyPicked, picking, readyForDelivery, readyForInvoice, readyForPicking, refundRejected, refunded, requestRefund, rescheduled.
Catalog: productSaved, skuSaved. Pricing: skuPriceUpdated. WMS: skuStockUpdated.

**Extending**
Duplicate a Switch rule, change the `eventName`, wire the new output to a new Set node.
```

**Tags** (up to 5)
```
janis-commerce, ecommerce, oms, webhook, community-node
```

**Categories**: Marketing (or Sales), IT Ops

**Attach**: `template-a-all-in-one.json`

---

## Submission — Template B (router-only)

**Title**
```
Janis Commerce — Webhook Router (Modular Subflows)
```

**Description**
```
Receive every Janis Commerce webhook on ONE URL, then dispatch each event to a dedicated subworkflow you own and maintain independently. The Router fetches the full resource once; each subflow receives the full object without re-fetching.

**Why this pattern**
- **1 subscription per microservice** in Janis (not per event).
- **N independent subworkflows** — each event is a workflow you can version, deactivate, or share separately.
- **Full Resource fetched once** by the Router — subflows are pure business logic, no API calls back to Janis.

**How it works**
```
Janis (1 subscription per MS)
    │
    ▼
POST /webhook/janis-webhook       ← this Router
    │
[Switch by eventName]
    ├── canceled       → Execute Workflow → "OMS · Canceled"
    ├── readyForPicking→ Execute Workflow → "OMS · Ready For Picking"
    └── productSaved   → Execute Workflow → "Catalog · Product Saved"
```

**Setup**
This template imports 1 workflow — the Router. You need to create the subworkflows yourself:

1. Install community node `@janiscommerce/n8n-nodes-janis-commerce`.
2. Create a subworkflow with `Execute Workflow Trigger` (inputSource: passthrough) + your business logic.
3. In the Router, open each `Run · …` node and select the corresponding subworkflow from the picker.
4. Connect your `Janis Commerce API` credential to the trigger.
5. Activate the subworkflows first, then the Router.
6. In Janis, create ONE webhook subscription per MS pointing at the Router's URL.

**When to use this vs the all-in-one template**
Use this pattern when different teams/repos own different subflows, or when you want to version-control each event handler separately. Use the all-in-one template if you're prototyping or if a single canvas is enough.
```

**Tags**
```
janis-commerce, ecommerce, oms, webhook, community-node
```

**Attach**: `template-b-router.json`

---

## Prerequisites for both templates

n8n rejects templates that reference community nodes NOT verified in n8n.
Before submitting, the community node itself must be verified at
[creators.n8n.io/nodes](https://creators.n8n.io/nodes). Until then the
template can only be shared via GitHub / direct import, not on n8n.io.

## Verification workflow

1. Publish `@janiscommerce/n8n-nodes-janis-commerce` to npm (workflow in
   `.github/workflows/publish.yml`).
2. Submit the community node for verification at the Creator Portal.
3. **After** the node is verified, submit both templates.

## Local testing before submitting

```bash
# Import each template to your local n8n and try executing manually
docker compose exec n8n-main n8n import:workflow \
  --input=/host_mnt/private/var/www/janiscommerce/n8n-nodes-janis-commerce/examples/templates/template-a-all-in-one.json
```

Or from the UI: `⋮` → `Import from File` → pick the JSON.
