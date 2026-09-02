import {
	IWebhookFunctions,
	INodeType,
	INodeProperties,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
	IHttpRequestMethods,
	INodePropertyOptions,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

type JanisEnvironment = 'prod' | 'qa' | 'beta';

const DOMAIN_BY_ENV: Record<JanisEnvironment, string> = {
	prod: 'janis.in',
	qa: 'janisqa.in',
	beta: 'janisdev.in',
};

// Order events (20). Every one triggers a status change in the OMS and — when
// Output = Full Resource — the trigger fetches GET /api/order/{metadata.id}.
//
// The list is aligned with janis-oms-service/webhooks/triggers.yml (the source
// of truth of what OMS actually emits). `docOperationId` follows the official
// naming convention `order<CamelCasedEventName>Webhook`. Some links will 404
// on docs.janis.in until the OMS team merges the fixes tracked in the "Fix
// OMS order webhook schemas" bug — see the task list.
const ORDER_EVENTS: {
	value: string;
	name: string;
	description: string;
	docOperationId: string;
}[] = [
	{ value: 'cancelationRejected', name: 'Cancelation Rejected', description: 'A cancelation request was rejected', docOperationId: 'orderCancelationRejectedWebhook' },
	{ value: 'cancelationRequested', name: 'Cancelation Requested', description: 'A cancelation was requested', docOperationId: 'orderCancelationRequestedWebhook' },
	{ value: 'canceled', name: 'Canceled', description: 'The order was canceled', docOperationId: 'orderCanceledWebhook' },
	{ value: 'complete', name: 'Complete', description: 'The order was marked as complete', docOperationId: 'orderCompleteWebhook' },
	{ value: 'delivered', name: 'Delivered', description: 'The order was delivered', docOperationId: 'orderDeliveredWebhook' },
	{ value: 'deliveryRescheduled', name: 'Delivery Rescheduled', description: 'The delivery of the order was rescheduled', docOperationId: 'orderDeliveryRescheduledWebhook' },
	{ value: 'inDelivery', name: 'In Delivery', description: 'The order is out for delivery', docOperationId: 'orderInDeliveryWebhook' },
	{ value: 'invoiced', name: 'Invoiced', description: 'The order was invoiced', docOperationId: 'orderInvoicedWebhook' },
	{ value: 'needsRepacking', name: 'Needs Repacking', description: 'The order needs to be repacked', docOperationId: 'orderNeedsRepackingWebhook' },
	{ value: 'needsRescheduling', name: 'Needs Rescheduling', description: 'The order needs to be rescheduled', docOperationId: 'orderNeedsReschedulingWebhook' },
	{ value: 'notDelivered', name: 'Not Delivered', description: 'The order was not delivered', docOperationId: 'orderNotDeliveredWebhook' },
	{ value: 'partiallyPicked', name: 'Partially Picked', description: 'The order was partially picked', docOperationId: 'orderPartiallyPickedWebhook' },
	{ value: 'picking', name: 'Picking', description: 'The order is being picked', docOperationId: 'orderPickingWebhook' },
	{ value: 'readyForDelivery', name: 'Ready for Delivery', description: 'The order is ready to be delivered', docOperationId: 'orderReadyForDeliveryWebhook' },
	{ value: 'readyForInvoice', name: 'Ready for Invoice', description: 'The order is ready to be invoiced', docOperationId: 'orderReadyForInvoiceWebhook' },
	{ value: 'readyForPicking', name: 'Ready for Picking', description: 'The order is ready to be picked', docOperationId: 'orderReadyForPickingWebhook' },
	{ value: 'refundRejected', name: 'Refund Rejected', description: 'A refund request was rejected', docOperationId: 'orderRefundRejectedWebhook' },
	{ value: 'refunded', name: 'Refunded', description: 'The order was refunded', docOperationId: 'orderRefundedWebhook' },
	{ value: 'requestRefund', name: 'Request Refund', description: 'A refund was requested for the order', docOperationId: 'orderRequestRefundWebhook' },
	{ value: 'rescheduled', name: 'Rescheduled', description: 'The order was rescheduled', docOperationId: 'orderRescheduledWebhook' },
];

// Per-event fetch config for the "Full Resource" output mode.
// `idPath` is the dot-path inside the webhook body where the ID needed by the
// GET lives. For order-status events the id is at `metadata.id`; for sku-price
// and sku-stock the useful id is the related skuId (`metadata.sku`).
const EVENT_FETCH: Record<
	string,
	{ service: string; idPath: string; path: (id: string) => string }
> = {
	// Order events — all resolve to GET /api/order/{id} against oms.
	...Object.fromEntries(
		ORDER_EVENTS.map(({ value }) => [
			value,
			{ service: 'oms', idPath: 'metadata.id', path: (id: string) => `/api/order/${id}` },
		]),
	),
	// Catalog / pricing / wms events.
	productSaved: {
		service: 'catalog',
		idPath: 'metadata.id',
		path: (id) => `/api/product/${id}`,
	},
	skuSaved: {
		service: 'catalog',
		idPath: 'metadata.id',
		path: (id) => `/api/sku/${id}`,
	},
	skuPriceUpdated: {
		service: 'pricing',
		idPath: 'metadata.sku',
		path: (id) => `/api/sku-price/${id}`,
	},
	skuStockUpdated: {
		service: 'wms',
		idPath: 'metadata.sku',
		path: (id) => `/api/sku-stock/${id}`,
	},
};

const getValueAtPath = (obj: IDataObject, path: string): unknown => {
	const parts = path.split('.').filter(Boolean);
	let cur: unknown = obj;
	for (const p of parts) {
		if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
		cur = (cur as IDataObject)[p];
	}
	return cur;
};

const toOptions = (
	items: { value: string; name: string; description: string }[],
	entityLabel: string,
): INodePropertyOptions[] =>
	items.map(({ value, name, description }) => ({
		name,
		value,
		action: `On ${entityLabel.toLowerCase()} ${name.toLowerCase()}`,
		description,
	}));

// Redoc anchor for an OMS order webhook operation.
const orderWebhookDocUrl = (operationId: string): string =>
	`https://docs.janis.in/v2/service/oms#tag/Order-Webhooks/operation/${operationId}`;

// One notice per order event with a direct link to the official Janis docs.
// Each is gated by displayOptions so only the matching one shows up.
const buildOrderDocNotices = (): INodeProperties[] =>
	ORDER_EVENTS.map(
		({ value, docOperationId }): INodeProperties => ({
			displayName:
				`See the official Janis <a href="${orderWebhookDocUrl(docOperationId)}" target="_blank"><b>${value}</b> webhook docs</a>. ` +
				`The JSON shown there is an example of the payload this trigger will receive.`,
			name: `${value}DocNotice`,
			type: 'notice',
			default: '',
			displayOptions: { show: { resource: ['order'], event: [value] } },
		}),
	);

export class JanisCommerceTrigger implements INodeType {
	// Webhook lifecycle: today the user creates the subscription in Janis
	// manually (documented in the README) and pastes n8n's webhook URL, so
	// there is nothing to register/verify/clean up on the third-party side.
	// We still expose the three methods as no-ops so n8n treats the trigger
	// as fully managed and stops warning about a missing lifecycle.
	webhookMethods = {
		default: {
			checkExists: async () => true,
			create: async () => true,
			delete: async () => true,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'Janis Commerce Trigger',
		name: 'janisCommerceTrigger',
		icon: { light: 'file:janisCommerce.svg', dark: 'file:janisCommerce.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["event"]}}',
		description: 'Starts a workflow when a Janis Commerce webhook arrives',
		defaults: { name: 'Janis Commerce Trigger' },
		// Trigger nodes cannot be invoked as AI tools — leave the flag explicitly
		// disabled. Cast is only needed because n8n-workflow types the field as
		// `true | UsableAsToolDescription | undefined`, but the community-nodes
		// lint rule requires the property to be present.
		usableAsTool: false as unknown as true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'janisCommerceApi',
				required: true,
				displayOptions: { show: { outputMode: ['fullResource'] } },
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: '={{$parameter["responseMode"]}}',
				path: 'janis-webhook',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'order',
				description:
					'Choose a specific resource to filter one event, or "Any" to receive every event from Janis (recommended for router workflows with a Switch downstream)',
				options: [
					{
						name: 'Any (Router)',
						value: 'any',
						description:
							'Accept every event Janis sends (order, product, sku, sku price, sku stock). Use in a router workflow that dispatches to subflows with a Switch node.',
					},
					{ name: 'Order', value: 'order' },
					{ name: 'Product', value: 'product' },
					{ name: 'Sku', value: 'sku' },
					{ name: 'Sku Price', value: 'skuPrice' },
					{ name: 'Sku Stock', value: 'skuStock' },
				],
			},

			// -------- Notice for "Any" mode --------
			{
				displayName:
					'Router mode: this trigger accepts every event Janis emits. ' +
					'When Output = Full Resource, it resolves the origin service from ' +
					'<code>eventName</code> and fetches the full resource before emitting. ' +
					'Route downstream with a <b>Switch</b> node on ' +
					'<code>{{ $json.eventName }}</code> or ' +
					'<code>{{ $json._event.eventName }}</code> (Full Resource wraps the ' +
					'fetched object under <code>_event</code>).',
				name: 'anyNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { resource: ['any'] } },
			},

			// -------- Event (Order) --------
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'canceled',
				displayOptions: { show: { resource: ['order'] } },
				options: toOptions(ORDER_EVENTS, 'Order'),
			},

			// -------- Per-event payload doc links (Order) --------
			// One notice per order event, gated by displayOptions to show only
			// the matching one. Each links to the official Janis reference for
			// that webhook so the user sees the exact payload shape.
			...buildOrderDocNotices(),

			// -------- Event (Product) --------
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'productSaved',
				displayOptions: { show: { resource: ['product'] } },
				options: [
					{
						name: 'Saved',
						value: 'productSaved',
						action: 'On product saved',
						description: 'Triggers when a product is created or updated in Janis',
					},
				],
			},

			// -------- Event (Sku) --------
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'skuSaved',
				displayOptions: { show: { resource: ['sku'] } },
				options: [
					{
						name: 'Saved',
						value: 'skuSaved',
						action: 'On sku saved',
						description: 'Triggers when a SKU is created or updated in Janis',
					},
				],
			},

			// -------- Event (Sku Price) --------
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'skuPriceUpdated',
				displayOptions: { show: { resource: ['skuPrice'] } },
				options: [
					{
						name: 'Updated',
						value: 'skuPriceUpdated',
						action: 'On sku price updated',
						description: 'Triggers when a SKU price is updated in Janis',
					},
				],
			},

			// -------- Event (Sku Stock) --------
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				noDataExpression: true,
				default: 'skuStockUpdated',
				displayOptions: { show: { resource: ['skuStock'] } },
				options: [
					{
						name: 'Updated',
						value: 'skuStockUpdated',
						action: 'On sku stock updated',
						description: 'Triggers when a SKU stock is updated in Janis',
					},
				],
			},

			{
				displayName: 'Output',
				name: 'outputMode',
				type: 'options',
				default: 'fullResource',
				description: 'What the trigger emits when the webhook is received',
				options: [
					{
						name: 'Full Resource (Fetched From Janis)',
						value: 'fullResource',
						description:
							'Take the identifier from the payload, GET the resource from Janis with the credential, and emit the full object',
					},
					{
						name: 'Webhook Payload',
						value: 'webhookPayload',
						description: 'Emit the raw payload sent by Janis',
					},
				],
			},

			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				default: 'none',
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Header Auth', value: 'headerAuth' },
				],
			},
			{
				displayName: 'Header Name',
				name: 'headerName',
				type: 'string',
				default: 'x-janis-webhook-token',
				description: 'Header that the sender must include to authenticate',
				displayOptions: { show: { authentication: ['headerAuth'] } },
			},
			{
				displayName: 'Header Value',
				name: 'headerValue',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Expected header value. The request is rejected with 401 if it does not match.',
				displayOptions: { show: { authentication: ['headerAuth'] } },
			},
			{
				displayName: 'Response Mode',
				name: 'responseMode',
				type: 'options',
				default: 'onReceived',
				options: [
					{
						name: 'Immediately',
						value: 'onReceived',
						description: 'Respond with 200 as soon as the request is received',
					},
					{
						name: 'When Last Node Finishes',
						value: 'lastNode',
						description: 'Respond when the workflow finishes executing',
					},
				],
			},
			{
				displayName: 'Include Request Headers',
				name: 'includeHeaders',
				type: 'boolean',
				default: false,
				description:
					'Whether to include the request headers in the output under `_headers` (only when Output = Webhook Payload)',
				displayOptions: { show: { outputMode: ['webhookPayload'] } },
			},
		],
		};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const authentication = this.getNodeParameter('authentication') as string;
		const req = this.getRequestObject();
		const res = this.getResponseObject();

		if (authentication === 'headerAuth') {
			const headerName = (this.getNodeParameter('headerName') as string).toLowerCase();
			const expected = this.getNodeParameter('headerValue') as string;
			const actual = req.headers[headerName];
			const actualStr = Array.isArray(actual) ? actual[0] : actual;
			if (actualStr !== expected) {
				res.status(401).json({ error: 'Unauthorized' });
				return { noWebhookResponse: true };
			}
		}

		const body = this.getBodyData() as IDataObject;
		const outputMode = this.getNodeParameter('outputMode') as string;
		const resource = this.getNodeParameter('resource') as string;

		if (outputMode === 'webhookPayload') {
			const includeHeaders = this.getNodeParameter('includeHeaders') as boolean;
			const payload: IDataObject = includeHeaders
				? { ...body, _headers: req.headers as unknown as IDataObject }
				: body;
			return { workflowData: [this.helpers.returnJsonArray([payload])] };
		}

		// Full Resource: for a specific resource use the configured `event`;
		// for "Any" use whatever eventName arrived in the webhook body.
		const event =
			resource === 'any'
				? String((body.eventName as string) ?? '')
				: (this.getNodeParameter('event') as string);

		const fetchConfig = EVENT_FETCH[event];
		if (!fetchConfig) {
			// Unknown event on Router mode — fall back to raw payload so downstream
			// can still route/filter without losing the request.
			if (resource === 'any') {
				return { workflowData: [this.helpers.returnJsonArray([body])] };
			}
			throw new NodeOperationError(
				this.getNode(),
				`Event "${event}" does not support Full Resource output.`,
			);
		}

		const id = getValueAtPath(body, fetchConfig.idPath);
		if (id === undefined || id === null || id === '') {
			throw new NodeOperationError(
				this.getNode(),
				`Full Resource output: no ID found at "${fetchConfig.idPath}" in the webhook payload.`,
			);
		}

		const credentials = await this.getCredentials('janisCommerceApi');
		const env = credentials.environment as JanisEnvironment;
		const baseURL = `https://${fetchConfig.service}.${DOMAIN_BY_ENV[env]}`;

		const fetched = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'janisCommerceApi',
			{
				method: 'GET' as IHttpRequestMethods,
				baseURL,
				url: fetchConfig.path(String(id)),
				json: true,
			},
		)) as IDataObject;

		// Router mode wraps `_event` metadata so downstream (Switch, Execute
		// Workflow) can dispatch by eventName / entity. Specific-resource mode
		// keeps emitting the plain object for backwards compatibility.
		if (resource === 'any') {
			const emitted: IDataObject = {
				...fetched,
				_event: {
					eventName: event,
					entity: body.entity,
					service: body.service,
					eventDate: body.eventDate,
				},
			};
			return { workflowData: [this.helpers.returnJsonArray([emitted])] };
		}

		return { workflowData: [this.helpers.returnJsonArray([fetched])] };
	}
}
