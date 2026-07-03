import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openspp from '../src/systems/openspp/plugin.js';
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
  // Reuse the parser by wrapping the response as a fake call.
  const root = parseMethodCall(
    xml.replace('<methodResponse>', '<methodCall><methodName>r</methodName>').replace('</methodResponse>', '</methodCall>')
  );
  return root.params[0];
}

describe('openspp (Odoo XML-RPC)', () => {
  it('xmlrpc codec round-trips values', () => {
    const doc = serializeResponse({ a: 1, b: [true, 'x', 2.5], c: null });
    expect(responseValue(doc)).toEqual({ a: 1, b: [true, 'x', 2.5], c: null });
  });

  it('common.version returns a server version', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const { status, body } = await rpc(app, '/xmlrpc/2/common', 'version', []);
    expect(status).toBe(200);
    expect(responseValue(body).server_version).toBe('16.0');
    await app.close();
  });

  it('common.authenticate returns a uid', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const { body } = await rpc(app, '/xmlrpc/2/common', 'authenticate', ['db', 'user', 'pass', {}]);
    expect(responseValue(body)).toBe(2);
    await app.close();
  });

  it('object.execute_kw search_read filters res.partner by domain', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const { body } = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'search_read', [[['is_group', '=', true]]], { fields: ['name', 'is_group'] },
    ]);
    const rows = responseValue(body);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2); // two seeded households
    expect(rows.every((r: any) => r.is_group === true)).toBe(true);
    await app.close();
  });

  it('object.execute_kw create then read a new partner', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const created = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'create', [{ name: 'New Registrant', is_group: false }],
    ]);
    const id = responseValue(created.body);
    expect(typeof id).toBe('number');
    const read = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'read', [[id]], { fields: ['name'] },
    ]);
    expect(responseValue(read.body)[0].name).toBe('New Registrant');
    await app.close();
  });
});
