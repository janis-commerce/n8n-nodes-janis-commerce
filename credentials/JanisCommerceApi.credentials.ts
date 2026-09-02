import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credentials used by the Janis Commerce action node to consume the Janis
 * Commerce REST API. Janis authenticates with api-key + api-secret +
 * client-code headers.
 *
 * The `environment` (prod/qa/beta) is resolved here and determines the base
 * domain. Each node/operation declares its own `service` (subdomain) and
 * path, so a single credential works for every service inside the same
 * environment.
 *
 * The trigger node also uses this credential when Output = "Full Resource"
 * to fetch the resource from the origin service after a webhook arrives.
 */
export class JanisCommerceApi implements ICredentialType {
	name = 'janisCommerceApi';

	displayName = 'Janis Commerce API';

	documentationUrl = 'https://docs.janis.in';

	icon = 'file:../nodes/JanisCommerce/janisCommerce.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName:
				'For security, set <b>Allowed HTTP Request Domains</b> (below) to ' +
				'<b>Specific Domains</b> and paste: <code>*.janis.in, *.*.janis.in, ' +
				'*.janisqa.in, *.*.janisqa.in, *.janisdev.in, *.*.janisdev.in</code>. ' +
				'This prevents the API key/secret from being used against non-Janis ' +
				'URLs from the built-in HTTP Request node.',
			name: 'securityNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Client Code',
			name: 'clientCode',
			type: 'string',
			default: '',
			required: true,
			description: 'Janis client (tenant) code — sent as the `janis-client` header',
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Production', value: 'prod' },
				{ name: 'QA', value: 'qa' },
				{ name: 'Beta', value: 'beta' },
			],
			default: 'prod',
			required: true,
			description:
				'Janis environment. Determines the base domain (janis.in / janisqa.in / janisdev.in).',
		},
	];

	// Inject Janis auth headers on every request.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'janis-api-key': '={{$credentials.apiKey}}',
				'janis-api-secret': '={{$credentials.apiSecret}}',
				'janis-client': '={{$credentials.clientCode}}',
			},
		},
	};

	// Credential test: hits the OMS list endpoint on the selected environment.
	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{"https://oms." + ({prod: "janis.in", qa: "janisqa.in", beta: "janisdev.in"})[$credentials.environment]}}',
			url: '/api/order',
			method: 'GET',
		},
	};
}
