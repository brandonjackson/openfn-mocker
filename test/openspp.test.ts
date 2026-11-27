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

describe('openspp (REST API v2, adaptor 4.x)', () => {
  const NAT = 'urn:openspp:vocab:id-type#national_id';
  const HH = 'urn:openspp:vocab:id-type#household_id';
  const auth = { authorization: 'Bearer t' };
  const enc = encodeURIComponent;

  it('issues a client-credentials token without a bearer', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent', autoAuth: false });
    const res = await app.inject({ method: 'POST', url: '/api/v2/spp/oauth/token', payload: { grant_type: 'client_credentials', client_id: 'a', client_secret: 'b' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    await app.close();
  });

  it('rejects resource requests without a bearer token', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent', autoAuth: false });
    const res = await app.inject({ method: 'GET', url: '/api/v2/spp/Individual' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('reads an individual by system|value and searches with the SearchResult envelope', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const one = await app.inject({ method: 'GET', url: `/api/v2/spp/Individual/${enc(`${NAT}|SL-1001`)}`, headers: auth });
    expect(one.statusCode).toBe(200);
    expect(one.json().name.given).toBe('Amina');
    expect(one.json().groupMembership[0].group.reference).toBe(`Group/${HH}|HH-KAM-01`);
    const search = await app.inject({ method: 'GET', url: `/api/v2/spp/Individual?group=${enc(`${HH}|HH-KAM-01`)}&membership-role=head`, headers: auth });
    expect(search.json().meta).toEqual({ total: 1, count: 1, offset: 0 });
    expect(search.json().data[0].identifier[0].value).toBe('SL-1001');
    await app.close();
  });

  it('adds a member (409 on repeat) and ends a membership', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const url = `/api/v2/spp/Group/${enc(`${HH}|HH-SES-01`)}/$add-member`;
    const payload = { entity: { reference: `Individual/${NAT}|SL-1004` } };
    expect((await app.inject({ method: 'POST', url, payload, headers: auth })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url, payload, headers: auth })).statusCode).toBe(409);
    const rm = await app.inject({ method: 'POST', url: url.replace('$add-member', '$remove-member'), payload, headers: auth });
    expect(rm.json()).toMatchObject({ status: 'inactive' });
    expect(rm.json().endedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await app.close();
  });

  it('merge-patches with null clearing a field', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const url = `/api/v2/spp/Individual/${enc(`${NAT}|SL-1002`)}`;
    const res = await app.inject({ method: 'PATCH', url, payload: { telecom: null, birthDate: '1982-05-15' }, headers: auth });
    expect(res.json().birthDate).toBe('1982-05-15');
    expect(res.json().telecom).toBeUndefined();
    expect(res.json().meta.versionId).toBe('2');
    await app.close();
  });

  it('enrolls, then exits a membership via PUT by beneficiary identifier', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const program = { reference: 'Program/urn:openspp:program|school-feeding' };
    const beneficiary = { reference: `Individual/${NAT}|SL-1004` };
    const created = await app.inject({ method: 'POST', url: '/api/v2/spp/ProgramMembership', payload: { program, beneficiary, status: 'enrolled' }, headers: auth });
    expect(created.statusCode).toBe(201);
    const put = await app.inject({ method: 'PUT', url: `/api/v2/spp/ProgramMembership/${enc(`${NAT}|SL-1004`)}`, payload: { program, beneficiary, status: 'exited' }, headers: auth });
    expect(put.json()).toMatchObject({ status: 'exited' });
    await app.close();
  });

  it('searches service points as a searchset Bundle', async () => {
    const { app } = await createSystemServer(openspp, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/spp/ServicePoint?country=SL', headers: auth });
    expect(res.json()).toMatchObject({ resourceType: 'Bundle', type: 'searchset', total: 2 });
    await app.close();
  });
});
