import {
	IWebhookFunctions,
	ITriggerFunctions,
	ITriggerResponse,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
	IHttpRequestMethods,
	INodeProperties,
	INodePropertyOptions,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { EVENT_SAMPLES } from './samples';

type JanisEnvironment = 'prod' | 'qa' | 'beta';

const DOMAIN_BY_ENV: Record<JanisEnvironment, string> = {
	prod: 'janis.in',
	qa: 'janisqa.in',
	beta: 'janisdev.in',
};

// Order events (21). Every one triggers a status change in the OMS and — when
// Output = Full Resource — the trigger fetches GET /api/order/{metadata.id}.
const ORDER_EVENTS: { value: string; name: string; description: string }[] = [
	{ value: 'cancelationRejected', name: 'Cancelation Rejected', description: 'A cancelation request was rejected' },
	{ value: 'cancelationRequested', name: 'Cancelation Requested', description: 'A cancelation was requested' },
	{ value: 'canceled', name: 'Canceled', description: 'The order was canceled' },
	{ value: 'complete', name: 'Complete', description: 'The order was marked as complete' },
	{ value: 'delivered', name: 'Delivered', description: 'The order was delivered' },
	{ value: 'deliveryRescheduled', name: 'Delivery Rescheduled', description: 'The delivery of the order was rescheduled' },
	{ value: 'inDelivery', name: 'In Delivery', description: 'The order is out for delivery' },
	{ value: 'invoiced', name: 'Invoiced', description: 'The order was invoiced' },
	{ value: 'needsRepacking', name: 'Needs Repacking', description: 'The order needs to be repacked' },
	{ value: 'needsRescheduling', name: 'Needs Rescheduling', description: 'The order needs to be rescheduled' },
	{ value: 'notDelivered', name: 'Not Delivered', description: 'The order was not delivered' },
	{ value: 'partiallyPicked', name: 'Partially Picked', description: 'The order was partially picked' },
	{ value: 'picking', name: 'Picking', description: 'The order is being picked' },
	{ value: 'readyForDelivery', name: 'Ready for Delivery', description: 'The order is ready to be delivered' },
	{ value: 'readyForInvoice', name: 'Ready for Invoice', description: 'The order is ready to be invoiced' },
	{ value: 'readyForPicking', name: 'Ready for Picking', description: 'The order is ready to be picked' },
	{ value: 'refundRejected', name: 'Refund Rejected', description: 'A refund request was rejected' },
	{ value: 'refunded', name: 'Refunded', description: 'The order was refunded' },
	{ value: 'requestRefund', name: 'Request Refund', description: 'A refund was requested for the order' },
	{ value: 'requiresIntervention', name: 'Requires Intervention', description: 'The order requires manual intervention' },
	{ value: 'rescheduled', name: 'Rescheduled', description: 'The order was rescheduled' },
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
): INodePropertyOptions[] =>
	items.map(({ value, name, description }) => ({
		name,
		value,
		action: `On ${name.toLowerCase()}`,
		description,
	}));

// One notice per event, showing the shape of what will arrive on the webhook
// AND the shape of what the trigger emits when Output = "Full Resource".
const buildSampleNotices = (): INodeProperties[] => {
	const notices: INodeProperties[] = [];
	for (const [eventValue, sample] of Object.entries(EVENT_SAMPLES)) {
		notices.push({
			displayName:
				`<b>Sample — Webhook Payload</b><br>` +
				`<pre style="white-space:pre-wrap">${JSON.stringify(sample.webhookPayload, null, 2)}</pre>`,
			name: `samplePayload_${eventValue}`,
			type: 'notice',
			default: '',
			displayOptions: {
				show: { event: [eventValue], outputMode: ['webhookPayload'] },
			},
		});
		notices.push({
			displayName:
				`<b>Sample — Full Resource</b><br>` +
				`<pre style="white-space:pre-wrap">${JSON.stringify(sample.fullResource, null, 2)}</pre>`,
			name: `sampleFullResource_${eventValue}`,
			type: 'notice',
			default: '',
			displayOptions: {
				show: { event: [eventValue], outputMode: ['fullResource'] },
			},
		});
	}
	return notices;
};

// TODO(verified): implement `webhookMethods` (checkExists/create/delete) that
// call Janis' own webhook-management endpoints (POST/GET/DELETE /order-hook,
// and equivalents for catalog/pricing/wms) so activating the workflow
// auto-registers the hook in Janis and deactivating removes it. Today users
// create the subscription in Janis manually and paste the n8n webhook URL —
// documented in the README. Once implemented, remove the eslint-disable below.
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete -- manual setup documented in README
export class JanisCommerceTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Janis Commerce Trigger',
		name: 'janisCommerceTrigger',
		// eslint-disable-next-line @n8n/community-nodes/icon-prefer-themed-variants -- single-file icon works on both themes
		icon: 'file:janisCommerce.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["event"]}}',
		description: 'Starts a workflow when a Janis Commerce webhook arrives',
		defaults: { name: 'Janis Commerce Trigger' },
		usableAsTool: true,
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
				options: toOptions(ORDER_EVENTS),
			},

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

			// Sample payloads (one notice per event × outputMode, shown when both match)
			...buildSampleNotices(),

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

	// When the user hits "Execute step" in the editor (manual test mode) without
	// a real webhook arriving, emit the sample of the selected event. Lets you
	// design downstream nodes without needing a live event from Janis.
	// Router mode ("Any") emits the canceled sample as a representative event —
	// the user can rerun manually to test the Switch with other events.
	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const resource = this.getNodeParameter('resource') as string;
		const outputMode = this.getNodeParameter('outputMode') as string;
		const event =
			resource === 'any' ? 'canceled' : (this.getNodeParameter('event') as string);
		const sample = EVENT_SAMPLES[event];

		const manualTriggerFunction = async () => {
			if (!sample) return;
			const base =
				outputMode === 'fullResource' ? sample.fullResource : sample.webhookPayload;
			// Router mode wraps `_event` metadata (matches the runtime shape).
			const data =
				resource === 'any' && outputMode === 'fullResource'
					? {
							...base,
							_event: {
								eventName: event,
								entity: sample.webhookPayload.entity,
								service: sample.webhookPayload.service,
								eventDate: sample.webhookPayload.eventDate,
							},
						}
					: base;
			this.emit([this.helpers.returnJsonArray([data])]);
		};

		return { manualTriggerFunction };
	}
}
