import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the erpnext system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'ERPNext / Frappe',
  docs: 'https://docs.openfn.org/adaptors/packages/erpnext-docs',
  blurb:
    'Open-source ERP built on the Frappe framework. Every record is a "document" of a DocType (Customer, Item, ...) reached over the REST API: /api/resource/<DocType> for lists and creates, /api/resource/<DocType>/<name> for read/update/delete, and /api/method/frappe.client.get_count for counts. Resource responses wrap the document in a { data } envelope; get_count and delete reply with { message }. Auth is a token header (apiKey:apiSecret), accept-all here.',
  auth: 'Token (apiKey:apiSecret)',
  examples: [
    { id: 'list', method: 'GET', path: '/api/resource/Customer', label: 'List Customer documents (getList)' },
    {
      id: 'create',
      method: 'POST',
      path: '/api/resource/Customer',
      label: 'Create a Customer (create)',
      body: JSON.stringify({ customer_name: 'Gamma Distributors', customer_type: 'Company', customer_group: 'Commercial', territory: 'Nigeria' }, null, 2),
    },
    { id: 'read', method: 'GET', path: '/api/resource/Customer/CUST-0001', label: 'Read one Customer (read)' },
    {
      id: 'update',
      method: 'PUT',
      path: '/api/resource/Customer/CUST-0001',
      label: 'Update a Customer (update)',
      body: JSON.stringify({ customer_group: 'Non Profit' }, null, 2),
    },
    { id: 'delete', method: 'DELETE', path: '/api/resource/Customer/CUST-0002', label: 'Delete a Customer (deleteRecord)' },
    { id: 'count', method: 'GET', path: '/api/method/frappe.client.get_count?doctype=Customer', label: 'Count Customer documents (getCount)' },
  ],
};
