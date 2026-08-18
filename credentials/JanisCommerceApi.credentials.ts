import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credenciales para consumir la API de Janis Commerce (usadas por las Actions).
 * Janis autentica con api-key + api-secret + client-code en headers.
 *
 * El `environment` (prod/qa/beta) se resuelve acá y define el dominio base.
 * Cada nodo/operation define internamente el `service` (subdominio) y el path,
 * de forma que una única credential sirve para todos los servicios de Janis
 * dentro del mismo environment.
 *
 * NOTA: el Trigger node usa credenciales AWS (no estas), porque escucha el
 * topic SNS del OMS directamente (cross-account).
 */
export class JanisCommerceApi implements ICredentialType {
	name = 'janisCommerceApi';

	displayName = 'Janis Commerce API';

	documentationUrl = 'https://docs.janis.in';

	icon = 'file:../nodes/JanisCommerce/janisCommerce.svg' as const;

	properties: INodeProperties[] = [
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
			description: 'Código de cliente de Janis (header janis-client)',
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
			description: 'Environment de Janis. Define el dominio base (janis.in / janisqa.in / janisdev.in).',
		},
	];

	// Inyecta los headers de autenticación de Janis en cada request.
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

	// Test de credenciales: lista de órdenes del OMS del environment seleccionado.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{"https://oms." + ({prod: "janis.in", qa: "janisqa.in", beta: "janisdev.in"})[$credentials.environment]}}',
			url: '/api/order',
			method: 'GET',
		},
	};
}
