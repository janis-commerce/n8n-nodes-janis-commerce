# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-11-10

### Fixed

- `JanisCommerce.node.json` codex now uses the npm package name as the `node`
  prefix (`@janiscommerce/n8n-nodes-janis-commerce.janisCommerce` instead of
  `n8n-nodes-base.janisCommerce`) and only supported community node
  categories (`Sales`, `Marketing & Content`), as required by the n8n
  verified-nodes review.

## [0.1.1] - 2026-09-01

### Security

- `JanisCommerceApi` credential now shows a `notice` at the top of the form
  telling the user to set **Allowed HTTP Request Domains** to **Specific
  Domains** with the Janis wildcards. Also documented in the README.
  n8n does not expose a programmatic default for that field, so the user
  must set it manually when creating the credential.

### Fixed

- `JanisCommerceTrigger` no longer sets `usableAsTool: true`. Trigger nodes
  cannot be invoked as AI tools and doing so pollutes the tool picker
  (blocked the n8n verified-nodes automated review).
- `JanisCommerceTrigger` now exposes `webhookMethods` (no-op
  `checkExists` / `create` / `delete`) so the node satisfies n8n's
  webhook-lifecycle rule. The Janis subscription is still created manually
  in the Janis UI — the methods are no-ops because there is nothing to
  register/verify/clean up on the third-party side.
- Icons now use themed variants (`{ light, dark }`) with distinct files,
  as required by `@n8n/community-nodes/icon-validation`.
- Credential file translated to English (comment header + property
  descriptions).

### Changed

- Aligned repo to `@n8n/node-cli` scaffold standard: added `.github/workflows/ci.yml`
  (lint + build on PR/push), `nodes/JanisCommerce/JanisCommerce.node.json` codex
  metadata (categories + doc URLs), and simplified `eslint.config.mjs` to the
  default `@n8n/node-cli/eslint` config.
- `JanisCommerceTrigger` now supports `Resource: Any (Router)` — accepts every
  event and, in Full Resource mode, wraps output with `_event` metadata for
  downstream Switch nodes.
- Trigger has 21 order events (`cancelationRejected` … `rescheduled`) with
  Resource → Event dependent selects.
- Errors thrown from the webhook path now use `NodeOperationError`.
- Package `author.email` set to `oss@janis.in`.

### Fixed

- `NodeConnectionTypes.Main` used instead of the string literal `'main'`.
- Description wording aligned with n8n community-node guidelines (Return All / Limit).

## [0.1.0] - 2026-08-17

### Added

- Initial release.
- `JanisCommerce` action node with resources: `Order`, `Product`, `Sku`,
  `SkuPrice`, `SkuStock`. Supports `get` (by ID) and `getAll` (paginated via
  `x-janis-page` / `x-janis-page-size`) following the `@janiscommerce/api-list`
  contract.
- `JanisCommerceTrigger` webhook trigger. Emits either the raw webhook payload
  or fetches the full resource from the origin service (`orderCancelled`,
  `productSaved`, `skuSaved`, `skuPriceUpdated`, `skuStockUpdated`).
- `JanisCommerceApi` credential (api-key + api-secret + client-code +
  environment). Environment resolves the domain base
  (`janis.in` / `janisqa.in` / `janisdev.in`); each operation declares its own
  subdomain (`oms`, `catalog`, `pricing`, `wms`).
