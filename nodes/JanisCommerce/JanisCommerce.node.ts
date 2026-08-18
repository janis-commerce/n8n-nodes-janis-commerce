import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestMethods,
	IDataObject,
	IHttpRequestOptions,
	NodeConnectionTypes,
} from 'n8n-workflow';

/**
 * Janis Commerce — Action node.
 *
 * URL resolution: the credential only defines the `environment`. Each operation
 * declares its `service` (subdomain) + `path` and we build the URL as
 * `https://{service}.{domain(env)}{path}`.
 *
 * "Get Many" ops follow the `@janiscommerce/api-list` contract:
 *   - filters:      qs `filters[<field>]=<value>` (deep object)
 *   - sort:         qs `sortBy=<field>&sortDirection=asc|desc`
 *   - pagination:   headers `x-janis-page` + `x-janis-page-size`
 *   - total header: `x-janis-total` in the response
 */

type JanisEnvironment = 'prod' | 'qa' | 'beta';

const DOMAIN_BY_ENV: Record<JanisEnvironment, string> = {
	prod: 'janis.in',
	qa: 'janisqa.in',
	beta: 'janisdev.in',
};

const buildBaseUrl = (env: JanisEnvironment, service: string): string =>
	`https://${service}.${DOMAIN_BY_ENV[env]}`;

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 100;

// Known Order list filters. Free-form filters go through Additional Filters.
const ORDER_KNOWN_FILTERS = [
	'commerceId',
	'commerceIdSearch',
	'commerceSequentialId',
	'commerceSequentialIdSearch',
	'orderGroupId',
	'status',
	'customerId',
	'customerEmail',
	'sellerId',
	'carrierId',
	'shippingWarehouseId',
	'shippingType',
	'paymentSystemId',
	'isInvoiced',
	'refundsRequested',
	'rescheduled',
] as const;

const PRODUCT_KNOWN_FILTERS = ['referenceId', 'brand', 'category', 'status'] as const;
const SKU_KNOWN_FILTERS = ['referenceId', 'product', 'status'] as const;

interface AdditionalFilter {
	field: string;
	value: string;
}

export class JanisCommerce implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Janis Commerce',
		name: 'janisCommerce',
		// eslint-disable-next-line @n8n/community-nodes/icon-prefer-themed-variants -- single-file icon works on both themes
		icon: 'file:janisCommerce.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Janis Commerce API',
		defaults: { name: 'Janis Commerce' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'janisCommerceApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Order', value: 'order' },
					{ name: 'Product', value: 'product' },
					{ name: 'Sku', value: 'sku' },
					{ name: 'Sku Price', value: 'skuPrice' },
					{ name: 'Sku Stock', value: 'skuStock' },
				],
				default: 'order',
			},

			// -------------------- Operations --------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['order'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get an order',
						description: 'Get an order by ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many orders',
						description: 'Get a list of orders',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['product'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a product',
						description: 'Get a product by ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many products',
						description: 'Get a list of products',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['sku'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a sku',
						description: 'Get a SKU by ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many skus',
						description: 'Get a list of SKUs',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['skuPrice'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get sku prices by sku',
						description: 'Get all prices of a SKU by SKU ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many sku prices',
						description: 'Get a list of SKU prices (requires SKU IDs)',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['skuStock'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get sku stock by sku',
						description: 'Get the stock information of a SKU by SKU ID',
					},
				],
				default: 'get',
			},

			// -------------------- GET one — Order --------------------
			{
				displayName: 'Order ID',
				name: 'orderId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['order'], operation: ['get'] } },
			},

			// -------------------- GET one — Product --------------------
			{
				displayName: 'Product ID',
				name: 'productId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['product'], operation: ['get'] } },
			},

			// -------------------- GET one — Sku --------------------
			{
				displayName: 'Sku ID',
				name: 'skuId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['sku'], operation: ['get'] } },
			},

			// -------------------- GET one — Sku Price (by skuId) --------------------
			{
				displayName: 'Sku ID',
				name: 'skuId',
				type: 'string',
				required: true,
				default: '',
				description: 'The SKU ID whose prices you want to retrieve',
				displayOptions: { show: { resource: ['skuPrice'], operation: ['get'] } },
			},
			{
				displayName: 'Sales Channel ID',
				name: 'salesChannel',
				type: 'string',
				default: '',
				description: 'Optional sales channel filter',
				displayOptions: { show: { resource: ['skuPrice'], operation: ['get'] } },
			},

			// -------------------- GET one — Sku Stock (by skuId) --------------------
			{
				displayName: 'Sku ID',
				name: 'skuId',
				type: 'string',
				required: true,
				default: '',
				description: 'The SKU ID whose stock you want to retrieve',
				displayOptions: { show: { resource: ['skuStock'], operation: ['get'] } },
			},
			{
				displayName: 'Sales Channel ID',
				name: 'salesChannel',
				type: 'string',
				default: '',
				description: 'Optional sales channel filter',
				displayOptions: { show: { resource: ['skuStock'], operation: ['get'] } },
			},
			{
				displayName: 'Include Warehouse Data',
				name: 'warehouseData',
				type: 'boolean',
				default: false,
				description: 'Whether to include extended warehouse information in the response',
				displayOptions: { show: { resource: ['skuStock'], operation: ['get'] } },
			},

			// -------------------- GET MANY — Return All + Limit (shared) --------------------
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: { resource: ['order', 'product', 'sku', 'skuPrice'], operation: ['getAll'] },
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['order', 'product', 'sku', 'skuPrice'],
						operation: ['getAll'],
						returnAll: [false],
					},
				},
			},

			// -------------------- GET MANY — Order Filters --------------------
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
				options: [
					{ displayName: 'Carrier ID', name: 'carrierId', type: 'string', default: '' },
					{
						displayName: 'Commerce ID',
						name: 'commerceId',
						type: 'string',
						default: '',
						description: 'Exact match',
					},
					{
						displayName: 'Commerce ID (Partial)',
						name: 'commerceIdSearch',
						type: 'string',
						default: '',
						description: 'Partial / substring match',
					},
					{
						displayName: 'Commerce Sequential ID',
						name: 'commerceSequentialId',
						type: 'string',
						default: '',
						description: 'Exact match',
					},
					{
						displayName: 'Commerce Sequential ID (Partial)',
						name: 'commerceSequentialIdSearch',
						type: 'string',
						default: '',
						description: 'Partial / substring match',
					},
					{
						displayName: 'Created From',
						name: 'commerceDateCreatedFrom',
						type: 'dateTime',
						default: '',
						description: 'Start of commerceDateCreated range',
					},
					{
						displayName: 'Created To',
						name: 'commerceDateCreatedTo',
						type: 'dateTime',
						default: '',
						description: 'End of commerceDateCreated range',
					},
					{ displayName: 'Customer Email', name: 'customerEmail', type: 'string', default: '' },
					{ displayName: 'Customer ID', name: 'customerId', type: 'string', default: '' },
					{
						displayName: 'Delivery Date From',
						name: 'deliveryDateFrom',
						type: 'dateTime',
						default: '',
						description: 'Start of deliveryDate range',
					},
					{
						displayName: 'Delivery Date To',
						name: 'deliveryDateTo',
						type: 'dateTime',
						default: '',
						description: 'End of deliveryDate range',
					},
					{ displayName: 'Is Invoiced', name: 'isInvoiced', type: 'boolean', default: false },
					{ displayName: 'Order Group ID', name: 'orderGroupId', type: 'string', default: '' },
					{ displayName: 'Payment System ID', name: 'paymentSystemId', type: 'string', default: '' },
					{ displayName: 'Refunds Requested', name: 'refundsRequested', type: 'boolean', default: false },
					{ displayName: 'Rescheduled', name: 'rescheduled', type: 'boolean', default: false },
					{ displayName: 'Seller ID', name: 'sellerId', type: 'string', default: '' },
					{
						displayName: 'Shipping Type',
						name: 'shippingType',
						type: 'options',
						default: 'delivery',
						options: [
							{ name: 'Delivery', value: 'delivery' },
							{ name: 'Drive Through', value: 'drive_through' },
							{ name: 'Express Delivery', value: 'express_delivery' },
							{ name: 'Store Pickup', value: 'store_pickup' },
						],
					},
					{ displayName: 'Shipping Warehouse ID', name: 'shippingWarehouseId', type: 'string', default: '' },
					{ displayName: 'Status', name: 'status', type: 'string', default: '' },
				],
			},

			// -------------------- GET MANY — Product Filters --------------------
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
				options: [
					{ displayName: 'Reference ID', name: 'referenceId', type: 'string', default: '' },
					{ displayName: 'Brand', name: 'brand', type: 'string', default: '' },
					{ displayName: 'Category', name: 'category', type: 'string', default: '' },
					{ displayName: 'Status', name: 'status', type: 'string', default: '' },
				],
			},

			// -------------------- GET MANY — Sku Filters --------------------
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['sku'], operation: ['getAll'] } },
				options: [
					{ displayName: 'Reference ID', name: 'referenceId', type: 'string', default: '' },
					{
						displayName: 'Product ID',
						name: 'product',
						type: 'string',
						default: '',
						description: 'Filter SKUs belonging to a given product',
					},
					{ displayName: 'Status', name: 'status', type: 'string', default: '' },
				],
			},

			// -------------------- GET MANY — Sku Price Filters (skuIds REQUIRED) --------------------
			{
				displayName: 'Sku IDs',
				name: 'skuIds',
				type: 'string',
				required: true,
				default: '',
				description:
					'Comma-separated list of SKU IDs (required by the sku-price list endpoint)',
				displayOptions: { show: { resource: ['skuPrice'], operation: ['getAll'] } },
			},
			{
				displayName: 'Sales Channels IDs',
				name: 'salesChannelsIds',
				type: 'string',
				default: '',
				description: 'Optional comma-separated list of sales channel IDs to filter',
				displayOptions: { show: { resource: ['skuPrice'], operation: ['getAll'] } },
			},
			{
				displayName: 'Add Sales Channels',
				name: 'addSalesChannels',
				type: 'boolean',
				default: true,
				description: 'Whether to include the sales channels in the response',
				displayOptions: { show: { resource: ['skuPrice'], operation: ['getAll'] } },
			},

			// -------------------- Additional Filters (Order/Product/Sku) --------------------
			{
				displayName: 'Additional Filters',
				name: 'additionalFilters',
				type: 'fixedCollection',
				placeholder: 'Add Additional Filter',
				default: {},
				typeOptions: { multipleValues: true },
				description:
					'Free-form filters. Sent as filters[field]=value. Override known filters if the name repeats.',
				displayOptions: {
					show: { resource: ['order', 'product', 'sku'], operation: ['getAll'] },
				},
				options: [
					{
						name: 'filter',
						displayName: 'Filter',
						values: [
							{ displayName: 'Field', name: 'field', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},

			// -------------------- Sort — Order --------------------
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				default: '',
				displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
				options: [
					{ name: '(Default)', value: '' },
					{ name: 'Commerce Date Created', value: 'commerceDateCreated' },
					{ name: 'Commerce ID', value: 'commerceId' },
					{ name: 'Delivery Estimate Date', value: 'shippings.deliveryEstimateDate' },
					{ name: 'ID', value: 'id' },
					{ name: 'Status', value: 'status' },
				],
			},

			// -------------------- Sort — Product --------------------
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				default: '',
				displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
				options: [
					{ name: '(Default)', value: '' },
					{ name: 'Date Created', value: 'dateCreated' },
					{ name: 'Date Modified', value: 'dateModified' },
					{ name: 'ID', value: 'id' },
					{ name: 'Name', value: 'name' },
					{ name: 'Reference ID', value: 'referenceId' },
				],
			},

			// -------------------- Sort — Sku --------------------
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				default: '',
				displayOptions: { show: { resource: ['sku'], operation: ['getAll'] } },
				options: [
					{ name: '(Default)', value: '' },
					{ name: 'Date Created', value: 'dateCreated' },
					{ name: 'Date Modified', value: 'dateModified' },
					{ name: 'ID', value: 'id' },
					{ name: 'Reference ID', value: 'referenceId' },
				],
			},

			// -------------------- Sort Direction (shared) --------------------
			{
				displayName: 'Sort Direction',
				name: 'sortDirection',
				type: 'options',
				default: 'desc',
				displayOptions: {
					show: { resource: ['order', 'product', 'sku'], operation: ['getAll'] },
					hide: { sortBy: [''] },
				},
				options: [
					{ name: 'Ascending', value: 'asc' },
					{ name: 'Descending', value: 'desc' },
				],
			},

			// -------------------- Options (page size + metadata) --------------------
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: { resource: ['order', 'product', 'sku'], operation: ['getAll'] },
				},
				options: [
					{
						displayName: 'Page Size',
						name: 'pageSize',
						type: 'number',
						default: DEFAULT_PAGE_SIZE,
						typeOptions: { minValue: 1, maxValue: MAX_PAGE_SIZE },
						description: `Items per request when paginating (max ${MAX_PAGE_SIZE})`,
					},
					{
						displayName: 'Include Response Metadata',
						name: 'includeResponseHeaders',
						type: 'boolean',
						default: false,
						description:
							'Whether to add _meta.pagination { page, pageSize, totalItems, totalPages } to each item',
					},
				],
			},
		],
		};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('janisCommerceApi');
		const env = credentials.environment as JanisEnvironment;

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			// -------------------- GET one --------------------
			if (operation === 'get') {
				if (resource === 'order') {
					const orderId = this.getNodeParameter('orderId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'oms'),
							url: `/api/order/${orderId}`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'product') {
					const productId = this.getNodeParameter('productId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'catalog'),
							url: `/api/product/${productId}`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'sku') {
					const skuId = this.getNodeParameter('skuId', i) as string;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'catalog'),
							url: `/api/sku/${skuId}`,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'skuPrice') {
					const skuId = this.getNodeParameter('skuId', i) as string;
					const salesChannel = this.getNodeParameter('salesChannel', i, '') as string;
					const qs: IDataObject = {};
					if (salesChannel) qs.salesChannel = salesChannel;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'pricing'),
							url: `/api/sku-price/${skuId}`,
							qs,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'skuStock') {
					const skuId = this.getNodeParameter('skuId', i) as string;
					const salesChannel = this.getNodeParameter('salesChannel', i, '') as string;
					const warehouseData = this.getNodeParameter('warehouseData', i, false) as boolean;
					const qs: IDataObject = {};
					if (salesChannel) qs.salesChannel = salesChannel;
					if (warehouseData) qs.warehouseData = true;
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'wms'),
							url: `/api/sku-stock/${skuId}`,
							qs,
							json: true,
						},
					);
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}
			}

			// -------------------- GET MANY --------------------
			if (operation === 'getAll') {
				// Sku Price GetMany has a distinct contract (no filters[], required skuIds, no pagination headers).
				if (resource === 'skuPrice') {
					const skuIds = (this.getNodeParameter('skuIds', i) as string)
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
					const salesChannelsIdsRaw = this.getNodeParameter('salesChannelsIds', i, '') as string;
					const salesChannelsIds = salesChannelsIdsRaw
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
					const addSalesChannels = this.getNodeParameter('addSalesChannels', i, true) as boolean;

					const qs: IDataObject = {
						skuIds: skuIds.join(','),
						addSalesChannels,
					};
					if (salesChannelsIds.length) qs.salesChannelsIds = salesChannelsIds.join(',');

					const response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						{
							method: 'GET' as IHttpRequestMethods,
							baseURL: buildBaseUrl(env, 'pricing'),
							url: '/api/sku-price',
							qs,
							json: true,
						},
					)) as IDataObject | IDataObject[];

					const items = Array.isArray(response) ? response : [response];
					for (const item of items) {
						returnData.push({ json: item, pairedItem: { item: i } });
					}
					continue;
				}

				// Standard api-list flow: Order / Product / Sku
				const listConfig = getListConfig(resource);
				if (!listConfig) continue;

				const returnAll = this.getNodeParameter('returnAll', i) as boolean;
				const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
				const filtersRaw = this.getNodeParameter('filters', i, {}) as IDataObject;
				const additionalFilters =
					((this.getNodeParameter('additionalFilters', i, {}) as IDataObject).filter as
						| AdditionalFilter[]
						| undefined) ?? [];
				const sortBy = this.getNodeParameter('sortBy', i, '') as string;
				const sortDirection = this.getNodeParameter('sortDirection', i, 'desc') as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const pageSize = Math.min(
					(options.pageSize as number) || DEFAULT_PAGE_SIZE,
					MAX_PAGE_SIZE,
				);
				const includeMeta = Boolean(options.includeResponseHeaders);

				const filters = buildFilters(listConfig.knownFilters, filtersRaw, additionalFilters);
				const qs: IDataObject = {};
				if (Object.keys(filters).length) qs.filters = filters;
				if (sortBy) {
					qs.sortBy = sortBy;
					qs.sortDirection = sortDirection;
				}

				let page = 1;
				let totalItems: number | undefined;
				let collected = 0;

				while (collected < limit) {
					const remaining = limit - collected;
					const currentPageSize = Math.min(pageSize, remaining);

					const requestOptions: IHttpRequestOptions = {
						method: 'GET' as IHttpRequestMethods,
						baseURL: buildBaseUrl(env, listConfig.service),
						url: listConfig.path,
						qs,
						headers: {
							'x-janis-page': String(page),
							'x-janis-page-size': String(currentPageSize),
						},
						json: true,
						returnFullResponse: true,
					};

					const fullResponse = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'janisCommerceApi',
						requestOptions,
					)) as { body: unknown; headers: Record<string, string | string[]> };

					const pageItems = Array.isArray(fullResponse.body)
						? (fullResponse.body as IDataObject[])
						: [fullResponse.body as IDataObject];

					if (totalItems === undefined) {
						const totalHeader = fullResponse.headers['x-janis-total'];
						const totalStr = Array.isArray(totalHeader) ? totalHeader[0] : totalHeader;
						totalItems = totalStr !== undefined ? Number(totalStr) : undefined;
					}

					const totalPages =
						totalItems !== undefined ? Math.ceil(totalItems / pageSize) : undefined;

					for (const item of pageItems) {
						if (collected >= limit) break;
						const json = includeMeta
							? {
									...item,
									_meta: {
										pagination: {
											page,
											pageSize: currentPageSize,
											totalItems,
											totalPages,
										},
									},
								}
							: item;
						returnData.push({ json, pairedItem: { item: i } });
						collected++;
					}

					if (pageItems.length < currentPageSize) break;
					if (totalItems !== undefined && collected >= totalItems) break;
					if (collected >= limit) break;

					page++;
				}
			}
		}

		return [returnData];
	}
}

// -------------------- helpers --------------------

interface ListConfig {
	service: string;
	path: string;
	knownFilters: readonly string[];
}

function getListConfig(resource: string): ListConfig | null {
	if (resource === 'order') {
		return { service: 'oms', path: '/api/order', knownFilters: ORDER_KNOWN_FILTERS };
	}
	if (resource === 'product') {
		return { service: 'catalog', path: '/api/product', knownFilters: PRODUCT_KNOWN_FILTERS };
	}
	if (resource === 'sku') {
		return { service: 'catalog', path: '/api/sku', knownFilters: SKU_KNOWN_FILTERS };
	}
	return null;
}

// Translate known filters + free-form filters into the shape expected by
// api-list (`filters` as a deep object, with date ranges nested as sub-objects
// for Order lists).
function buildFilters(
	knownFields: readonly string[],
	known: IDataObject,
	additional: AdditionalFilter[],
): IDataObject {
	const out: IDataObject = {};

	for (const field of knownFields) {
		const value = known[field];
		if (value === undefined || value === '' || value === null) continue;
		out[field] = value;
	}

	// Order-specific date ranges
	const createdFrom = known.commerceDateCreatedFrom as string | undefined;
	const createdTo = known.commerceDateCreatedTo as string | undefined;
	if (createdFrom || createdTo) {
		const range: IDataObject = {};
		if (createdFrom) range.from = createdFrom;
		if (createdTo) range.to = createdTo;
		out.commerceDateCreatedRange = range;
	}

	const deliveryFrom = known.deliveryDateFrom as string | undefined;
	const deliveryTo = known.deliveryDateTo as string | undefined;
	if (deliveryFrom || deliveryTo) {
		const range: IDataObject = {};
		if (deliveryFrom) range.from = deliveryFrom;
		if (deliveryTo) range.to = deliveryTo;
		out.deliveryDateRange = range;
	}

	for (const f of additional) {
		if (!f?.field) continue;
		out[f.field] = f.value;
	}

	return out;
}
