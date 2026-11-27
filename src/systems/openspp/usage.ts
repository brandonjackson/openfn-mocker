import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openspp sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 *
 * These target @openfn/language-openspp 4.x, which calls the REST API v2
 * (/api/v2/spp). Identifiers are `system|value` external identifiers; see seed.ts.
 */
const IND = 'urn:openspp:vocab:id-type#national_id';
const HH = 'urn:openspp:vocab:id-type#household_id';
const PROG = 'urn:openspp:program';

export const usage: UsageExample[] = [
  { fn: 'getIndividual', signature: 'getIndividual(id, options?)', description: 'Read one individual by external identifier (system|value).',
    code: `getIndividual('${IND}|SL-1001');`, apiRef: 'read-individual' },
  { fn: 'searchIndividual', signature: 'searchIndividual(query, options?)', description: 'Search individuals; results in state.data, paging in state.response.page.',
    code: `searchIndividual({ name: 'Kamara' }, { count: 10 });`, apiRef: 'search-individual' },
  { fn: 'createIndividual', signature: 'createIndividual(data)', description: 'Create an individual with at least one identifier.',
    code: `createIndividual({
  identifier: [{ system: '${IND}', value: 'SL-2001' }],
  name: { family: 'Bangura', given: 'Fatima' },
  birthDate: '1992-04-11',
  gender: { coding: [{ system: 'urn:iso:std:iso:5218', code: '2' }] },
});`, apiRef: 'create-individual' },
  { fn: 'updateIndividual', signature: 'updateIndividual(id, data, options?)', description: 'Merge-patch an individual: omitted fields stay, null clears.',
    code: `updateIndividual('${IND}|SL-1003', { birthDate: '1990-02-21' });`, apiRef: 'patch-individual' },
  { fn: 'getGroup', signature: 'getGroup(id, options?)', description: 'Read one group (household) by external identifier.',
    code: `getGroup('${HH}|HH-KAM-01');`, apiRef: 'read-group' },
  { fn: 'searchGroup', signature: 'searchGroup(query, options?)', description: 'Search groups by name, identifier or type.',
    code: `searchGroup({ name: 'Household' }, { count: 20 });`, apiRef: 'search-group' },
  { fn: 'createGroup', signature: 'createGroup(data)', description: 'Create a group (household).',
    code: `createGroup({
  identifier: [{ system: '${HH}', value: 'HH-BAN-01' }],
  name: 'Bangura Household',
  groupType: 'household',
});`, apiRef: 'create-group' },
  { fn: 'updateGroup', signature: 'updateGroup(id, data, options?)', description: 'Merge-patch a group.',
    code: `updateGroup('${HH}|HH-KAM-01', { name: 'Kamara Family' });`, apiRef: 'patch-group' },
  { fn: 'getGroupMembers', signature: 'getGroupMembers(groupId, options?)', description: 'List the individuals in a group, optionally by role.',
    code: `getGroupMembers('${HH}|HH-KAM-01', { role: 'head' });`, apiRef: 'group-members' },
  { fn: 'addToGroup', signature: 'addToGroup(groupId, individualId, role?, options?)', description: 'Add an individual to a group with a role (409 if already a member).',
    code: `addToGroup('${HH}|HH-SES-01', '${IND}|SL-1004', 'child');`, apiRef: 'add-member' },
  { fn: 'removeFromGroup', signature: 'removeFromGroup(groupId, individualId, options?)', description: "End an individual's membership of a group.",
    code: `removeFromGroup('${HH}|HH-KAM-01', '${IND}|SL-1002', { reason: 'Moved out' });`, apiRef: 'remove-member' },
  { fn: 'getProgram', signature: 'getProgram(id)', description: 'Read one program by identifier.',
    code: `getProgram('${PROG}|cash-transfer-2024');`, apiRef: 'read-program' },
  { fn: 'getPrograms', signature: 'getPrograms(options?)', description: 'List programs (cursor-paged with count/lastId).',
    code: `getPrograms({ targetType: 'group', count: 10 });`, apiRef: 'search-program' },
  { fn: 'getEnrolledPrograms', signature: 'getEnrolledPrograms(beneficiary)', description: "A registrant's enrolled ProgramMemberships.",
    code: `getEnrolledPrograms('Group/${HH}|HH-KAM-01');`, apiRef: 'search-membership' },
  { fn: 'enroll', signature: 'enroll(beneficiary, programId, options?)', description: 'Enroll a registrant in a program (creates the membership if needed).',
    code: `enroll('Individual/${IND}|SL-1004', '${PROG}|school-feeding');`, apiRef: 'create-membership' },
  { fn: 'unenroll', signature: 'unenroll(beneficiary, programId, options?)', description: 'Set an enrolled membership to exited.',
    code: `unenroll('Group/${HH}|HH-KAM-01', '${PROG}|cash-transfer-2024', { exitDate: '2026-09-30' });`, apiRef: 'update-membership' },
  { fn: 'getServicePoint', signature: 'getServicePoint(name)', description: 'Read a service point by its name.',
    code: `getServicePoint('Bo Pay Point');`, apiRef: 'read-service-point' },
  { fn: 'searchServicePoint', signature: 'searchServicePoint(query, options?)', description: 'Search service points (Bundle envelope).',
    code: `searchServicePoint({ country: 'SL', contractActive: true });`, apiRef: 'search-service-point' },
  { fn: 'request', signature: 'request(method, path, body?, options?)', description: 'Call any REST API v2 path (relative to /api/v2/spp).',
    code: `request('GET', '/Individual/${encodeURIComponent(`${IND}|SL-1001`)}/groups');`, apiRef: 'individual-groups' },
];
