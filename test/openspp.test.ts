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

  // ---- Full adaptor-surface coverage ------------------------------------
  // Each block mirrors how the openspp adaptor's odoo-await calls actually
  // query Odoo, so exercising these proves the mock supports the function.

  it('getGroup / getIndividual: looks a registrant up by spp_id', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    // getGroup(spp_id) -> searchRead res.partner by spp_id + is_group + is_registrant.
    const group = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'search_read',
      [[['is_registrant', '=', true], ['is_group', '=', true], ['spp_id', '=', 'GRP_KAMARA01']]],
      { fields: ['name', 'spp_id'] },
    ]);
    const groups = responseValue(group.body);
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Kamara Household');

    // getIndividual(spp_id) -> same, is_group false.
    const indiv = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'search_read',
      [[['is_registrant', '=', true], ['is_group', '=', false], ['spp_id', '=', 'IND_AMINA001']]],
      { fields: ['name'] },
    ]);
    expect(responseValue(indiv.body)[0].name).toBe('Amina Kamara');
    await app.close();
  });

  it('getGroupMembers: search group id then filter memberships by group + is_ended', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    // First the adaptor `search`es res.partner for the group's integer id.
    const found = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'search',
      [[['is_group', '=', true], ['is_registrant', '=', true], ['spp_id', '=', 'GRP_KAMARA01']]],
    ]);
    const groupId = responseValue(found.body)[0];
    expect(groupId).toBe(1);
    // Then searchRead g2p.group.membership filtered on is_ended=false and group=id.
    const members = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.group.membership', 'search_read',
      [[['is_ended', '=', false], ['group', '=', groupId]]],
      { fields: ['individual', 'kind', 'individual_gender'] },
    ]);
    const rows = responseValue(members.body);
    expect(rows.length).toBe(2);
    expect(rows.map((r: any) => r.individual[1]).sort()).toEqual(['Amina Kamara', 'Mohamed Kamara']);
    await app.close();
  });

  it('getEnrolledPrograms: resolves the dotted domain partner_id.spp_id', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const memberships = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.program_membership', 'search_read',
      [[['partner_id.spp_id', '=', 'GRP_KAMARA01']]],
      { fields: ['program_id'] },
    ]);
    const rows = responseValue(memberships.body);
    expect(rows.length).toBe(1);
    expect(rows[0].program_id[0]).toBe(10); // Cash Transfer 2024
    await app.close();
  });

  it('enroll: finds membership by partner_id.spp_id + program_id.program_id, updates state', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    // enroll(spp_id, program_id) searchReads with two dotted conditions.
    const found = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.program_membership', 'search_read',
      [[['partner_id.spp_id', '=', 'GRP_KAMARA01'], ['program_id.program_id', '=', 'PROG_CT2024']]],
      { fields: ['partner_id', 'program_id', 'state'] },
    ]);
    const rows = responseValue(found.body);
    expect(rows.length).toBe(1);
    const updated = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.program_membership', 'write', [rows[0].id, { state: 'enrolled' }],
    ]);
    expect(responseValue(updated.body)).toBe(true);
    await app.close();
  });

  it('addToGroup: matches an existing membership via group.spp_id + individual.spp_id', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const res = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.group.membership', 'search_read',
      [[['group.spp_id', '=', 'GRP_KAMARA01'], ['individual.spp_id', '=', 'IND_AMINA001'], ['is_ended', '=', false]]],
      { fields: ['id', 'kind'], limit: 1 },
    ]);
    expect(responseValue(res.body).length).toBe(1);
    await app.close();
  });

  it('getProgram / getPrograms: query g2p.program by program_id and unfiltered', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const one = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.program', 'search_read',
      [[['program_id', '=', 'PROG_CT2024']]], { fields: ['name', 'program_id'] },
    ]);
    expect(responseValue(one.body)[0].name).toBe('Cash Transfer 2024');
    const all = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'g2p.program', 'search_read', [[]], { fields: ['name', 'program_id'] },
    ]);
    expect(responseValue(all.body).length).toBe(2);
    await app.close();
  });

  it('getArea / getServicePoint: query spp models by spp_id', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const area = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'spp.area', 'search_read', [[['spp_id', '=', 'AREA_SL_BO']]], { fields: ['name', 'code'] },
    ]);
    expect(responseValue(area.body)[0].name).toBe('Bo District');
    const svp = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'spp.service.point', 'search_read',
      [[['spp_id', '=', 'SVP_BO01']]], { fields: ['name', 'area_id', 'is_disabled'] },
    ]);
    expect(responseValue(svp.body)[0].name).toBe('Bo Pay Point');
    await app.close();
  });

  it('search_count returns the number of matching records', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const count = await rpc(app, '/xmlrpc/2/object', 'execute_kw', [
      'db', 2, 'pass', 'res.partner', 'search_count', [[['is_group', '=', false]]],
    ]);
    expect(responseValue(count.body)).toBe(3); // three seeded individuals
    await app.close();
  });
});
