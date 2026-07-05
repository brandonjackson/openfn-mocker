import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import odoo from '../src/systems/odoo/plugin.js';
import { parseMethodCall, serializeResponse, serializeValue } from '../src/systems/shared/xmlrpc.js';

const config = { port: 0 };

/** Build an XML-RPC methodCall document for the given method + params. */
function call(methodName: string, params: any[]): string {
  const body = params.map((p: any) => `<param>${serializeValue(p)}</param>`).join('');
  return `<?xml version="1.0"?><methodCall><methodName>${methodName}</methodName><params>${body}</params></methodCall>`;
}

async function rpc(app: any, url: string, methodName: string, params: any[]): Promise<any> {
  const res = await app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'text/xml' },
    payload: call(methodName, params),
  });
  return { status: res.statusCode, body: res.body };
}

/** Extract the single return value from a methodResponse document. */
function responseValue(xml: string): any {
  const root = parseMethodCall(
    xml.replace('<methodResponse>', '<methodCall><methodName>r</methodName>').replace('</methodResponse>', '</methodCall>')
  );
  return root.params[0];
}

describe('odoo (Odoo XML-RPC)', () => {
  it('common.version returns a server version', async () => {
    const { app } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const { status, body } = await rpc(app, '/xmlrpc/2/common', 'version', []);
    expect(status).toBe(200);
    expect(responseValue(body).server_version).toBe('16.0');
    await app.close();
  });

  it('common.authenticate returns a uid', async () => {
    const { app } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const { body } = await rpc(app, '/xmlrpc/2/common', 'authenticate', ['odoo', 'admin', 'mock', {}]);
    expect(responseValue(body)).toBe(2);
    await app.close();
  });

  it('search_read filters res.partner by domain (searchReadRecord)', async () => {
    const { app } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const { body } = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'res.partner', 'search_read', [[['is_company', '=', true]]], { fields: ['name', 'is_company'] },
    ]);
    const rows = responseValue(body);
    expect(rows.length).toBe(2); // two seeded companies
    expect(rows.every((r: any) => r.is_company === true)).toBe(true);
    await app.close();
  });

  it('search returns matching record ids (searchRecord)', async () => {
    const { app } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const { body } = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'res.partner', 'search', [[['is_company', '=', false]]],
    ]);
    const ids = responseValue(body);
    expect(ids).toEqual([3]); // the one seeded individual contact
    await app.close();
  });

  it('create then read a new partner (create + read)', async () => {
    const { app } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const created = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'res.partner', 'create', [{ name: 'Gamma Distributors', is_company: true }],
    ]);
    const id = responseValue(created.body);
    expect(typeof id).toBe('number');
    const read = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'res.partner', 'read', [[id]], { fields: ['name'] },
    ]);
    expect(responseValue(read.body)[0].name).toBe('Gamma Distributors');
    await app.close();
  });

  it('write updates and unlink deletes (update + deleteRecord)', async () => {
    const { app, store } = await createSystemServer(odoo, config, { logLevel: 'silent' });
    const wrote = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'res.partner', 'write', [[1], { phone: '+1-202-555-0199' }],
    ]);
    expect(responseValue(wrote.body)).toBe(true);
    expect(store.get('res.partner', '1').phone).toBe('+1-202-555-0199');

    const removed = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'odoo', 2, 'mock', 'crm.lead', 'unlink', [[11]],
    ]);
    expect(responseValue(removed.body)).toBe(true);
    expect(store.get('crm.lead', '11')).toBeUndefined();
    await app.close();
  });
});
