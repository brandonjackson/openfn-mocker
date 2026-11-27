import type { SystemGuide } from '../types.js';
import { serializeValue } from '../shared/xmlrpc.js';

const XML = 'text/xml';

/** Build an XML-RPC methodCall document (keeps the OpenSPP examples readable). */
function xmlrpcCall(method: string, params: any[]): string {
  return (
    '<?xml version="1.0"?><methodCall><methodName>' +
    method +
    '</methodName><params>' +
    params.map((p) => '<param>' + serializeValue(p) + '</param>').join('') +
    '</params></methodCall>'
  );
}

/** Build an Odoo `execute_kw` methodCall body for the OpenSPP (XML-RPC) mock. */
function oddoExecuteKw(model: string, method: string, args: any[], kwargs: Record<string, any> = {}): string {
  return xmlrpcCall('execute_kw', ['openspp', 2, 'mock', model, method, args, kwargs]);
}

/**
 * Sandbox guide for the openspp system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenSPP',
  docs: 'https://docs.openfn.org/adaptors/packages/openspp-docs',
  blurb:
    'Social-protection registry built on Odoo. Adaptor 4.x calls the REST API v2 under /api/v2/spp: an OAuth client-credentials token from /oauth/token, then Individual, Group (with $add-member / $remove-member), Program, ProgramMembership and ServicePoint, all addressed by external identifier system|value (URL-encoded). Searches return { data, meta, links } (ServicePoint: a searchset Bundle); errors are { detail }. The Odoo XML-RPC API that adaptor 3.x used (/xmlrpc/2/common + /xmlrpc/2/object, res.partner / g2p.* / spp.* models) is still served for jobs pinned to 3.x. Every 4.x adaptor function is covered on the Usage tab.',
  auth: 'OAuth 2.0 client credentials (Bearer)',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: '/api/v2/spp/oauth/token',
      label: 'Get a bearer token (client credentials) — every 4.x job starts here',
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: 'mock-client', client_secret: 'mock-secret' }, null, 2),
    },
    { id: 'read-individual', method: 'GET', path: '/api/v2/spp/Individual/urn%3Aopenspp%3Avocab%3Aid-type%23national_id%7CSL-1001', label: 'Read an individual by identifier — getIndividual' },
    { id: 'search-individual', method: 'GET', path: '/api/v2/spp/Individual?name=Kamara&_count=10', label: 'Search individuals ({ data, meta, links }) — searchIndividual' },
    {
      id: 'create-individual',
      method: 'POST',
      path: '/api/v2/spp/Individual',
      label: 'Create an individual — createIndividual',
      body: JSON.stringify({
        identifier: [{ system: 'urn:openspp:vocab:id-type#national_id', value: 'SL-2001' }],
        name: { family: 'Bangura', given: 'Fatima' },
        birthDate: '1992-04-11',
        gender: { coding: [{ system: 'urn:iso:std:iso:5218', code: '2' }] },
      }, null, 2),
    },
    { id: 'patch-individual', method: 'PATCH', path: '/api/v2/spp/Individual/urn%3Aopenspp%3Avocab%3Aid-type%23national_id%7CSL-1003', label: 'Merge-patch an individual — updateIndividual', body: JSON.stringify({ birthDate: '1990-02-21' }, null, 2) },
    { id: 'individual-groups', method: 'GET', path: '/api/v2/spp/Individual/urn%3Aopenspp%3Avocab%3Aid-type%23national_id%7CSL-1001/groups', label: "An individual's groups (reverse lookup) — request()" },
    { id: 'read-group', method: 'GET', path: '/api/v2/spp/Group/urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01', label: 'Read a household — getGroup' },
    { id: 'search-group', method: 'GET', path: '/api/v2/spp/Group?name=Household', label: 'Search groups — searchGroup' },
    {
      id: 'create-group',
      method: 'POST',
      path: '/api/v2/spp/Group',
      label: 'Create a household — createGroup',
      body: JSON.stringify({ identifier: [{ system: 'urn:openspp:vocab:id-type#household_id', value: 'HH-BAN-01' }], name: 'Bangura Household', groupType: 'household' }, null, 2),
    },
    { id: 'patch-group', method: 'PATCH', path: '/api/v2/spp/Group/urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01', label: 'Merge-patch a group — updateGroup', body: JSON.stringify({ name: 'Kamara Family' }, null, 2) },
    { id: 'group-members', method: 'GET', path: '/api/v2/spp/Individual?group=urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01&membership-role=head', label: 'Members of a group, by role — getGroupMembers' },
    {
      id: 'add-member',
      method: 'POST',
      path: '/api/v2/spp/Group/urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-SES-01/$add-member',
      label: 'Add a member with a role — addToGroup',
      body: JSON.stringify({ entity: { reference: 'Individual/urn:openspp:vocab:id-type#national_id|SL-1004' }, role: { coding: [{ system: 'urn:openspp:vocab:group-membership-type', code: 'child' }] } }, null, 2),
    },
    {
      id: 'remove-member',
      method: 'POST',
      path: '/api/v2/spp/Group/urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01/$remove-member',
      label: 'End a membership — removeFromGroup',
      body: JSON.stringify({ entity: { reference: 'Individual/urn:openspp:vocab:id-type#national_id|SL-1002' }, reason: 'Moved out' }, null, 2),
    },
    { id: 'read-program', method: 'GET', path: '/api/v2/spp/Program/urn%3Aopenspp%3Aprogram%7Ccash-transfer-2024', label: 'Read a program — getProgram' },
    { id: 'search-program', method: 'GET', path: '/api/v2/spp/Program?_count=10', label: 'List programs (cursor: _lastId) — getPrograms' },
    { id: 'search-membership', method: 'GET', path: '/api/v2/spp/ProgramMembership?beneficiary=Group%2Furn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01&status=enrolled', label: "A registrant's enrolments — getEnrolledPrograms / enroll / unenroll" },
    {
      id: 'create-membership',
      method: 'POST',
      path: '/api/v2/spp/ProgramMembership',
      label: 'Enroll a registrant — enroll',
      body: JSON.stringify({ program: { reference: 'Program/urn:openspp:program|school-feeding' }, beneficiary: { reference: 'Individual/urn:openspp:vocab:id-type#national_id|SL-1001' }, status: 'enrolled' }, null, 2),
    },
    {
      id: 'update-membership',
      method: 'PUT',
      path: '/api/v2/spp/ProgramMembership/urn%3Aopenspp%3Avocab%3Aid-type%23household_id%7CHH-KAM-01',
      label: 'Exit a membership — unenroll',
      body: JSON.stringify({ program: { reference: 'Program/urn:openspp:program|cash-transfer-2024' }, beneficiary: { reference: 'Group/urn:openspp:vocab:id-type#household_id|HH-KAM-01' }, status: 'exited', enrollmentDate: '2024-02-01', exitDate: '2026-09-30' }, null, 2),
    },
    { id: 'read-service-point', method: 'GET', path: '/api/v2/spp/ServicePoint/Bo%20Pay%20Point', label: 'Read a service point by name — getServicePoint' },
    { id: 'search-service-point', method: 'GET', path: '/api/v2/spp/ServicePoint?country=SL&contractActive=true', label: 'Search service points (searchset Bundle) — searchServicePoint' },
    {
      id: 'rpc-authenticate',
      method: 'POST',
      path: '/xmlrpc/2/common',
      label: 'authenticate → uid (login) (adaptor 3.x)',
      contentType: XML,
      body: xmlrpcCall('authenticate', ['openspp', 'admin', 'mock', {}]),
    },
    {
      id: 'rpc-search-group',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read group registrants (res.partner, is_group=true) — getGroup / searchGroup (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw(
        'res.partner',
        'search_read',
        [[['is_registrant', '=', true], ['is_group', '=', true]]],
        { fields: ['name', 'spp_id', 'kind', 'area_id'] }
      ),
    },
    {
      id: 'rpc-search-individual',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read individuals (res.partner, is_group=false) — getIndividual / searchIndividual (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw(
        'res.partner',
        'search_read',
        [[['is_registrant', '=', true], ['is_group', '=', false]]],
        { fields: ['name', 'spp_id', 'gender', 'birthdate'] }
      ),
    },
    {
      id: 'rpc-create-individual',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'create an individual registrant (res.partner) — createIndividual (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw('res.partner', 'create', [
        { name: 'Fatima Bangura', is_registrant: true, is_group: false, gender: 'Female', birthdate: '1994-03-08' },
      ]),
    },
    {
      id: 'rpc-create-group',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'create a group registrant (res.partner) — createGroup (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw('res.partner', 'create', [
        { name: 'Bangura Household', is_registrant: true, is_group: true, kind: 'Household' },
      ]),
    },
    {
      id: 'rpc-group-members',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read live memberships (g2p.group.membership, is_ended=false) — getGroupMembers / addToGroup (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw(
        'g2p.group.membership',
        'search_read',
        [[['is_ended', '=', false], ['group', '=', 1]]],
        { fields: ['individual', 'kind', 'individual_gender', 'start_date'] }
      ),
    },
    {
      id: 'rpc-programs',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read programs (g2p.program) — getProgram / getPrograms (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw('g2p.program', 'search_read', [[]], { fields: ['name', 'program_id', 'state'] }),
    },
    {
      id: 'rpc-enrolments',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: "search_read enrolments via dotted domain partner_id.spp_id — enroll / unenroll / getEnrolledPrograms (adaptor 3.x)",
      contentType: XML,
      body: oddoExecuteKw(
        'g2p.program_membership',
        'search_read',
        [[['partner_id.spp_id', '=', 'GRP_KAMARA01']]],
        { fields: ['partner_id', 'program_id', 'state'] }
      ),
    },
    {
      id: 'rpc-service-points',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read service points (spp.service.point) — getServicePoint / searchServicePoint (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw('spp.service.point', 'search_read', [[]], {
        fields: ['name', 'spp_id', 'area_id', 'is_disabled'],
      }),
    },
    {
      id: 'rpc-areas',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read areas (spp.area) — getArea / searchArea (adaptor 3.x)',
      contentType: XML,
      body: oddoExecuteKw('spp.area', 'search_read', [[]], { fields: ['name', 'spp_id', 'code', 'parent_id'] }),
    },
  ],
};
