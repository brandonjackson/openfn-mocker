import type { SystemGuide } from '../types.js';
import { serializeValue } from '../shared/xmlrpc.js';

const XML = 'text/xml';

/** Build an XML-RPC methodCall document (keeps the Odoo examples readable). */
function xmlrpcCall(method: string, params: any[]): string {
  return (
    '<?xml version="1.0"?><methodCall><methodName>' +
    method +
    '</methodName><params>' +
    params.map((p) => '<param>' + serializeValue(p) + '</param>').join('') +
    '</params></methodCall>'
  );
}

/** Build an Odoo `execute_kw` methodCall body for the (XML-RPC) mock. */
function odooExecuteKw(model: string, method: string, args: any[], kwargs: Record<string, any> = {}): string {
  return xmlrpcCall('execute_kw', ['odoo', 2, 'mock', model, method, args, kwargs]);
}

/**
 * Sandbox guide for the odoo system: its blurb and the runnable example requests
 * shown on the sandbox "API" tab. Co-located with this system's seed data and
 * imported onto the plugin (`MockSystemPlugin.guide`); rendered by the sandbox and
 * referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'Odoo',
  docs: 'https://docs.openfn.org/adaptors/packages/odoo-docs',
  blurb:
    'Open-source ERP/CRM. The adaptor speaks Odoo XML-RPC (/xmlrpc/2/common to authenticate, /xmlrpc/2/object to execute_kw) via odoo-await. Records live in models like res.partner, crm.lead and product.product; many2one fields are [id, label] pairs and searches use Odoo domains. create/read/update/deleteRecord map to Odoo create/read/write/unlink, and searchRecord/searchReadRecord to search/search_read. Requests and responses are XML.',
  auth: 'Odoo authenticate (XML-RPC)',
  examples: [
    {
      id: 'authenticate',
      method: 'POST',
      path: '/xmlrpc/2/common',
      label: 'authenticate → uid (login)',
      contentType: XML,
      body: xmlrpcCall('authenticate', ['odoo', 'admin', 'mock', {}]),
    },
    {
      id: 'search-partners',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search res.partner → record ids (searchRecord)',
      contentType: XML,
      body: odooExecuteKw('res.partner', 'search', [[['is_company', '=', true]]]),
    },
    {
      id: 'search-read-partners',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read res.partner with a domain (searchReadRecord)',
      contentType: XML,
      body: odooExecuteKw('res.partner', 'search_read', [[['customer_rank', '>', 0]]], {
        fields: ['name', 'email', 'city'],
        limit: 10,
      }),
    },
    {
      id: 'create-partner',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'create a res.partner (create)',
      contentType: XML,
      body: odooExecuteKw('res.partner', 'create', [
        { name: 'Gamma Distributors', is_company: true, email: 'sales@gamma.example' },
      ]),
    },
    {
      id: 'read-partner',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'read one res.partner by id (read)',
      contentType: XML,
      body: odooExecuteKw('res.partner', 'read', [[1]], { fields: ['name', 'email', 'phone'] }),
    },
    {
      id: 'write-partner',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'write (update) a res.partner (update)',
      contentType: XML,
      body: odooExecuteKw('res.partner', 'write', [[1], { phone: '+1-202-555-0199' }]),
    },
    {
      id: 'delete-lead',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'unlink (delete) a crm.lead (deleteRecord)',
      contentType: XML,
      body: odooExecuteKw('crm.lead', 'unlink', [[11]]),
    },
    {
      id: 'search-read-leads',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read crm.lead opportunities',
      contentType: XML,
      body: odooExecuteKw('crm.lead', 'search_read', [[['type', '=', 'opportunity']]], {
        fields: ['name', 'partner_id', 'expected_revenue'],
      }),
    },
  ],
};
