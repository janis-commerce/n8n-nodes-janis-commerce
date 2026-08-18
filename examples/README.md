# Router pattern — starter templates

Four workflow JSONs that implement the recommended integration pattern:

- **1 subscription per microservice in Janis** → 1 webhook URL in n8n → the
  Router does `Full Resource` fetching once and dispatches to per-event
  subflows via the Switch node.

```
Janis  ──── POST /webhook/janis-webhook ────►  Janis Router
                                                    │
                                    (Switch by eventName)
                                                    │
                        ┌───────────────┬───────────────┬──────────────┐
                        ▼               ▼               ▼              ▼
                 OMS · Canceled  OMS · Ready4Pick  Cat · ProdSaved  Unmatched
                 (subworkflow)   (subworkflow)     (subworkflow)     (NoOp)
```

## Files

| File | Purpose |
|------|---------|
| `janis-router.json` | The dispatcher. Webhook trigger (`resource: any`, `outputMode: fullResource`) + Switch + 3 Execute-Workflow branches |
| `oms-canceled.json` | Subflow — receives an already-loaded order after `canceled` |
| `oms-ready-for-picking.json` | Subflow — receives an already-loaded order after `readyForPicking` |
| `catalog-product-saved.json` | Subflow — receives an already-loaded product after `productSaved` |

## Import order (important)

1. **Import the 3 subflows first** (Router references them by `workflowId`).
2. Open each subflow → copy its **workflow ID** from the URL bar (the
   segment after `/workflow/`).
3. **Import `janis-router.json`**.
4. Open the Router → for each `Run …` node, replace
   `REPLACE_WITH_ID_OF_…` with the ID copied in step 2 (or use the
   workflow-picker dropdown in the UI, which is easier).
5. In the trigger node `Janis Webhook (Any Event)`, connect your
   `Janis Commerce API` credential (create one if you don't have it yet
   — needs `apiKey`, `apiSecret`, `clientCode`, `environment`).
6. **Activate all 4 workflows** (subflows first, Router last).

## Import in n8n

- **UI** — top-right menu (`⋮`) → **Import from File** → pick the JSON.
- **CLI** (self-hosted only):
  ```bash
  docker compose exec n8n-main n8n import:workflow --input=/path/to/file.json
  ```

## Configure Janis

In each microservice you care about (OMS, Catalog, Pricing, WMS), create a
single webhook subscription pointing at the Router's webhook URL — enable
every event the microservice emits, no need for multiple subscriptions.

The Router picks the correct origin service from `eventName` and fetches the
full entity before dispatching.

## Adding a new event

1. Create a new subflow with an `Execute Workflow Trigger`.
2. In the Router:
   - Add a new rule to the **Switch** (`{{ $json._event.eventName }} equals your-event`).
   - Add an **Execute Workflow** node pointing to the new subflow.
3. Connect the new Switch output to the new Execute Workflow node.

You do **not** need to change anything in Janis — the subscription already
delivers every event; the Router just gains a new route.
