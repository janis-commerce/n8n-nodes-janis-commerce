import { IDataObject } from 'n8n-workflow';

/**
 * Sample payloads per trigger event.
 *
 *  - `webhookPayload`: what Janis sends to the webhook endpoint.
 *  - `fullResource`:   what the trigger emits when Output = "Full Resource"
 *                      (i.e. the response of the GET to the origin service).
 *
 * All identifiers, names and dates are placeholders — the shape is real,
 * the data is not.
 */

export interface EventSamples {
	webhookPayload: IDataObject;
	fullResource: IDataObject;
}

// -------------------- Order samples --------------------

// Base order resource used to build the fullResource sample for every
// order-status event. Only `status` and `previousStatus` change per event.
const BASE_ORDER: IDataObject = {
	id: 'SAMPLE_ORDER_ID',
	commerceId: 'ORDER-000001',
	commerceSequentialId: 1,
	status: 'pending',
	previousStatus: null,
	sellerId: 'SAMPLE_SELLER_ID',
	carrierId: 'SAMPLE_CARRIER_ID',
	customerId: 'SAMPLE_CUSTOMER_ID',
	shippingType: 'delivery',
	shippingWarehouseId: 'SAMPLE_WAREHOUSE_ID',
	paymentSystemId: 'SAMPLE_PAYMENT_SYSTEM_ID',
	totals: {
		items: 2500,
		discount: 0,
		shipping: 500,
		total: 3000,
		currency: 'ARS',
	},
	items: [
		{
			skuId: 'SAMPLE_SKU_ID',
			referenceId: 'SKU-REF-001',
			quantity: 2,
			price: 1250,
			total: 2500,
		},
	],
	isInvoiced: false,
	refundsRequested: false,
	rescheduled: false,
	commerceDateCreated: '2026-08-15T10:00:00.000Z',
	deliveryDate: '2026-08-17T10:00:00.000Z',
	dateCreated: '2026-08-15T10:00:00.000Z',
	dateModified: '2026-08-16T20:00:00.000Z',
	userModified: 'SAMPLE_USER_ID',
};

// Build the { webhookPayload, fullResource } pair for an order-status event.
// `status` is the target status of the transition (what the OMS will store);
// `previousStatus` is the status the order was in right before the event.
const makeOrderSample = (
	eventName: string,
	status: string,
	previousStatus: string | null,
): EventSamples => ({
	webhookPayload: {
		service: 'oms',
		entity: 'order',
		eventName,
		eventDate: '2026-08-16T20:00:00.000Z',
		metadata: {
			id: 'SAMPLE_ORDER_ID',
			commerceId: 'ORDER-000001',
			status,
			previousStatus,
			dateCreated: '2026-08-15T10:00:00.000Z',
			dateModified: '2026-08-16T20:00:00.000Z',
		},
	},
	fullResource: {
		...BASE_ORDER,
		status,
		previousStatus,
	},
});

// -------------------- All samples --------------------

export const EVENT_SAMPLES: Record<string, EventSamples> = {
	// -------- Order events (21) --------
	cancelationRejected: makeOrderSample('cancelationRejected', 'pending', 'cancelationRequested'),
	cancelationRequested: makeOrderSample('cancelationRequested', 'cancelationRequested', 'ready'),
	canceled: makeOrderSample('canceled', 'canceled', 'ready'),
	complete: makeOrderSample('complete', 'complete', 'delivered'),
	delivered: makeOrderSample('delivered', 'delivered', 'inDelivery'),
	deliveryRescheduled: makeOrderSample('deliveryRescheduled', 'deliveryRescheduled', 'inDelivery'),
	inDelivery: makeOrderSample('inDelivery', 'inDelivery', 'readyForDelivery'),
	invoiced: makeOrderSample('invoiced', 'invoiced', 'readyForInvoice'),
	needsRepacking: makeOrderSample('needsRepacking', 'needsRepacking', 'picking'),
	needsRescheduling: makeOrderSample('needsRescheduling', 'needsRescheduling', 'inDelivery'),
	notDelivered: makeOrderSample('notDelivered', 'notDelivered', 'inDelivery'),
	partiallyPicked: makeOrderSample('partiallyPicked', 'partiallyPicked', 'picking'),
	picking: makeOrderSample('picking', 'picking', 'readyForPicking'),
	readyForDelivery: makeOrderSample('readyForDelivery', 'readyForDelivery', 'readyForInvoice'),
	readyForInvoice: makeOrderSample('readyForInvoice', 'readyForInvoice', 'picking'),
	readyForPicking: makeOrderSample('readyForPicking', 'readyForPicking', 'pending'),
	refundRejected: makeOrderSample('refundRejected', 'refundRejected', 'requestRefund'),
	refunded: makeOrderSample('refunded', 'refunded', 'requestRefund'),
	requestRefund: makeOrderSample('requestRefund', 'requestRefund', 'delivered'),
	requiresIntervention: makeOrderSample('requiresIntervention', 'requiresIntervention', 'picking'),
	rescheduled: makeOrderSample('rescheduled', 'rescheduled', 'inDelivery'),

	// -------- Catalog events --------
	productSaved: {
		webhookPayload: {
			service: 'catalog',
			entity: 'product',
			eventName: 'saved',
			eventDate: '2026-08-16T20:00:00.000Z',
			metadata: {
				id: 'SAMPLE_PRODUCT_ID',
				name: 'Sample Product',
				referenceId: 'PROD-REF-001',
				dateCreated: '2025-01-01T00:00:00.000Z',
				dateModified: '2026-08-16T20:00:00.000Z',
				userCreated: null,
				userModified: 'SAMPLE_USER_ID',
				eventType: 'updated',
			},
		},
		fullResource: {
			id: 'SAMPLE_PRODUCT_ID',
			name: 'Sample Product',
			referenceId: 'PROD-REF-001',
			brand: 'SAMPLE_BRAND_ID',
			category: 'SAMPLE_CATEGORY_ID',
			categoriesIds: ['SAMPLE_CATEGORY_ID'],
			description: 'Sample product description',
			shortDescription: '',
			title: '',
			status: 'active',
			slug: 'sample-product',
			isNew: false,
			mainImage: 'https://cdn.example.com/products/sample/main-thumb.webp',
			salesChannels: ['SAMPLE_SALES_CHANNEL_ID'],
			salesChannelsTotal: 1,
			salesChannelsTags: [],
			categoriesBySalesChannel: [],
			skus: [
				{
					id: 'SAMPLE_SKU_ID',
					referenceId: 'SKU-REF-001',
					name: 'Sample SKU',
					status: 'active',
					sellingMeasurementUnit: 'un',
					sellingUnitMultiplier: 1,
					unitMultiplier: 1,
					eans: [],
					groupsIds: [],
					measurementUnit: null,
					mainImage: 'https://cdn.example.com/skus/sample/main-thumb.webp',
				},
			],
			keywords: [],
			groupsIds: [],
			attributeSetId: null,
			commerceId: null,
			platformFields: {},
			savedToken: 'SAMPLE_TOKEN',
			taxCode: '',
			dateCreated: '2025-01-01T00:00:00.000Z',
			dateModified: '2026-08-16T20:00:00.000Z',
			userCreated: null,
			userModified: 'SAMPLE_USER_ID',
		},
	},

	skuSaved: {
		webhookPayload: {
			service: 'catalog',
			entity: 'sku',
			eventName: 'saved',
			eventDate: '2026-08-16T20:00:00.000Z',
			metadata: {
				id: 'SAMPLE_SKU_ID',
				product: 'SAMPLE_PRODUCT_ID',
				name: 'Sample SKU',
				referenceId: 'SKU-REF-001',
				dateCreated: '2025-01-01T00:00:00.000Z',
				dateModified: '2026-08-16T20:00:00.000Z',
				userCreated: null,
				userModified: 'SAMPLE_USER_ID',
			},
		},
		fullResource: {
			id: 'SAMPLE_SKU_ID',
			product: 'SAMPLE_PRODUCT_ID',
			name: 'Sample SKU',
			referenceId: 'SKU-REF-001',
			status: 'active',
			isNew: false,
			commerceId: null,
			sellingMeasurementUnit: 'un',
			sellingUnitMultiplier: 1,
			unitMultiplier: 1,
			measurementUnit: null,
			stockMeasurementUnit: null,
			modalType: null,
			commercialConditionId: '',
			manufacturerCode: '',
			normalizedName: 'sample sku',
			releaseDate: null,
			mainImage: 'https://cdn.example.com/skus/sample/main-thumb.webp',
			measures: { height: 1, width: 1, depth: 1, weight: 1 },
			packageMeasures: { height: 1, width: 1, depth: 1, weight: 1 },
			eans: [],
			groupsIds: [],
			savedToken: 'SAMPLE_TOKEN',
			dateCreated: '2025-01-01T00:00:00.000Z',
			dateModified: '2026-08-16T20:00:00.000Z',
			userCreated: null,
			userModified: 'SAMPLE_USER_ID',
		},
	},

	// -------- Pricing events --------
	skuPriceUpdated: {
		webhookPayload: {
			service: 'pricing',
			entity: 'skuPrice',
			eventName: 'updated',
			eventDate: '2026-08-16T20:00:00.000Z',
			metadata: {
				id: 'SAMPLE_SKU_PRICE_ID',
				sku: 'SAMPLE_SKU_ID',
				priceSheet: 'SAMPLE_PRICE_SHEET_ID',
				minQuantity: 1,
				price: 1250,
				listPrice: 1500,
				costPrice: 800,
				status: 'active',
				operation: 'update',
				dateFrom: '2026-08-01T00:00:00.000Z',
				dateTo: '2026-12-31T23:59:59.999Z',
				updateDate: '2026-08-16T20:00:00.000Z',
			},
		},
		fullResource: {
			sku: 'SAMPLE_SKU_ID',
			bestPrices: [
				{
					salesChannel: 'SAMPLE_SALES_CHANNEL_ID',
					price: 1250,
					listPrice: 1500,
					costPrice: 800,
					priceSheet: 'SAMPLE_PRICE_SHEET_ID',
					dateFrom: '2026-08-01T00:00:00.000Z',
					dateTo: '2026-12-31T23:59:59.999Z',
				},
			],
		},
	},

	// -------- WMS events --------
	skuStockUpdated: {
		webhookPayload: {
			service: 'wms',
			entity: 'stock',
			eventName: 'updated',
			eventDate: '2026-08-16T20:00:00.000Z',
			metadata: {
				sku: 'SAMPLE_SKU_ID',
				warehouse: 'SAMPLE_WAREHOUSE_ID',
				warehouseReferenceId: 'WH-01',
				available: 42,
				reserved: 3,
				total: 45,
				salesChannels: ['SAMPLE_SALES_CHANNEL_ID'],
				accountIds: ['SAMPLE_ACCOUNT_ID'],
				updateDate: '2026-08-16T20:00:00.000Z',
			},
		},
		fullResource: {
			sku: 'SAMPLE_SKU_ID',
			totalAvailable: 42,
			totalReserved: 3,
			warehouses: [
				{
					warehouse: 'SAMPLE_WAREHOUSE_ID',
					warehouseReferenceId: 'WH-01',
					available: 42,
					reserved: 3,
					total: 45,
					salesChannels: ['SAMPLE_SALES_CHANNEL_ID'],
				},
			],
		},
	},
};
