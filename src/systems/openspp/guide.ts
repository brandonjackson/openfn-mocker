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
    'Social-protection registry built on Odoo. The adaptor speaks Odoo XML-RPC (/xmlrpc/2/common + /xmlrpc/2/object): individuals and group households live in res.partner (looked up by their spp_id), with g2p.program enrolments, group memberships and spp.area/spp.service.point. Requests and responses are XML; the mock resolves Odoo domains including dotted relational paths like partner_id.spp_id. Every adaptor function below is covered — see the Usage tab.',
  auth: 'Odoo authenticate (XML-RPC)',
  examples: [
    {
      id: 'authenticate',
      method: 'POST',
      path: '/xmlrpc/2/common',
      label: 'authenticate → uid (login)',
      contentType: XML,
      body: xmlrpcCall('authenticate', ['openspp', 'admin', 'mock', {}]),
    },
    {
      id: 'search-group',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read group registrants (res.partner, is_group=true) — getGroup / searchGroup',
      contentType: XML,
      body: oddoExecuteKw(
        'res.partner',
        'search_read',
        [[['is_registrant', '=', true], ['is_group', '=', true]]],
        { fields: ['name', 'spp_id', 'kind', 'area_id'] }
      ),
    },
    {
      id: 'search-individual',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read individuals (res.partner, is_group=false) — getIndividual / searchIndividual',
      contentType: XML,
      body: oddoExecuteKw(
        'res.partner',
        'search_read',
        [[['is_registrant', '=', true], ['is_group', '=', false]]],
        { fields: ['name', 'spp_id', 'gender', 'birthdate'] }
      ),
    },
    {
      id: 'create-individual',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'create an individual registrant (res.partner) — createIndividual',
      contentType: XML,
      body: oddoExecuteKw('res.partner', 'create', [
        { name: 'Fatima Bangura', is_registrant: true, is_group: false, gender: 'Female', birthdate: '1994-03-08' },
      ]),
    },
    {
      id: 'create-group',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'create a group registrant (res.partner) — createGroup',
      contentType: XML,
      body: oddoExecuteKw('res.partner', 'create', [
        { name: 'Bangura Household', is_registrant: true, is_group: true, kind: 'Household' },
      ]),
    },
    {
      id: 'group-members',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read live memberships (g2p.group.membership, is_ended=false) — getGroupMembers / addToGroup',
      contentType: XML,
      body: oddoExecuteKw(
        'g2p.group.membership',
        'search_read',
        [[['is_ended', '=', false], ['group', '=', 1]]],
        { fields: ['individual', 'kind', 'individual_gender', 'start_date'] }
      ),
    },
    {
      id: 'programs',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read programs (g2p.program) — getProgram / getPrograms',
      contentType: XML,
      body: oddoExecuteKw('g2p.program', 'search_read', [[]], { fields: ['name', 'program_id', 'state'] }),
    },
    {
      id: 'enrolments',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: "search_read enrolments via dotted domain partner_id.spp_id — enroll / unenroll / getEnrolledPrograms",
      contentType: XML,
      body: oddoExecuteKw(
        'g2p.program_membership',
        'search_read',
        [[['partner_id.spp_id', '=', 'GRP_KAMARA01']]],
        { fields: ['partner_id', 'program_id', 'state'] }
      ),
    },
    {
      id: 'service-points',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read service points (spp.service.point) — getServicePoint / searchServicePoint',
      contentType: XML,
      body: oddoExecuteKw('spp.service.point', 'search_read', [[]], {
        fields: ['name', 'spp_id', 'area_id', 'is_disabled'],
      }),
    },
    {
      id: 'areas',
      method: 'POST',
      path: '/xmlrpc/2/object',
      label: 'search_read areas (spp.area) — getArea / searchArea',
      contentType: XML,
      body: oddoExecuteKw('spp.area', 'search_read', [[]], { fields: ['name', 'spp_id', 'code', 'parent_id'] }),
    },
  ],
};
