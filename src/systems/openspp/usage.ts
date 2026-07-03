import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openspp sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getGroup", signature: "getGroup(sppId, callback?)", description: "Fetch one group (household) registrant by its spp_id.",
    code: "getGroup('GRP_KAMARA01');", apiRef: "search-group" },
  { fn: "getIndividual", signature: "getIndividual(sppId, callback?)", description: "Fetch one individual registrant by its spp_id.",
    code: "getIndividual('IND_AMINA001');", apiRef: "search-individual" },
  { fn: "searchGroup", signature: "searchGroup(domain, options?, callback?)", description: "Search group registrants with an Odoo domain (adds is_group=true).",
    code: "searchGroup([['spp_id', 'ilike', 'GRP']], { limit: 10 });", apiRef: "search-group" },
  { fn: "searchIndividual", signature: "searchIndividual(domain, options?, callback?)", description: "Search individual registrants with an Odoo domain (adds is_group=false).",
    code: "searchIndividual([['gender', '=', 'Female']], { offset: 0 });", apiRef: "search-individual" },
  { fn: "createGroup", signature: "createGroup(data, callback?)", description: "Create a group (household) registrant; returns its new spp_id.",
    code: "createGroup({ name: 'Bangura Household', kind: 'Household' });", apiRef: "create-group" },
  { fn: "createIndividual", signature: "createIndividual(data, callback?)", description: "Create an individual registrant; returns its new spp_id.",
    code: "createIndividual({ name: 'Fatima Bangura', gender: 'Female' });", apiRef: "create-individual" },
  { fn: "updateGroup", signature: "updateGroup(sppId, data)", description: "Update a group registrant found by spp_id.",
    code: "updateGroup('GRP_KAMARA01', { name: 'Kamara Family' });", apiRef: "search-group" },
  { fn: "updateIndividual", signature: "updateIndividual(sppId, data)", description: "Update an individual registrant found by spp_id.",
    code: "updateIndividual('IND_AMINA001', { phone: '+23276000999' });", apiRef: "search-individual" },
  { fn: "getGroupMembers", signature: "getGroupMembers(sppId, options?, callback?)", description: "List the live members of a group (is_ended=false).",
    code: "getGroupMembers('GRP_KAMARA01', { limit: 20 });", apiRef: "group-members" },
  { fn: "addToGroup", signature: "addToGroup(groupSppId, individualSppId, role?)", description: "Add an individual to a group, optionally with a membership role.",
    code: "addToGroup('GRP_KAMARA01', 'IND_FATMATA1', 'Head');", apiRef: "group-members" },
  { fn: "removeFromGroup", signature: "removeFromGroup(groupSppId, individualSppId)", description: "End an individual's live membership in a group.",
    code: "removeFromGroup('GRP_KAMARA01', 'IND_MOHAMED1');", apiRef: "group-members" },
  { fn: "getProgram", signature: "getProgram(programId, callback?)", description: "Fetch one program by its program_id.",
    code: "getProgram('PROG_CT2024');", apiRef: "programs" },
  { fn: "getPrograms", signature: "getPrograms(options?, callback?)", description: "List all programs (supports offset/limit).",
    code: "getPrograms({ offset: 0 });", apiRef: "programs" },
  { fn: "enroll", signature: "enroll(sppId, programId)", description: "Enroll a registrant into a program (creates/updates the membership).",
    code: "enroll('GRP_KAMARA01', 'PROG_CT2024');", apiRef: "enrolments" },
  { fn: "unenroll", signature: "unenroll(sppId, programId)", description: "Remove a registrant from a program (marks the membership not-enrolled).",
    code: "unenroll('GRP_KAMARA01', 'PROG_CT2024');", apiRef: "enrolments" },
  { fn: "getEnrolledPrograms", signature: "getEnrolledPrograms(sppId, callback?)", description: "List the programs a registrant is enrolled in.",
    code: "getEnrolledPrograms('GRP_KAMARA01');", apiRef: "enrolments" },
  { fn: "getServicePoint", signature: "getServicePoint(sppId, callback?)", description: "Fetch one service point (pay point / agent) by spp_id.",
    code: "getServicePoint('SVP_BO01');", apiRef: "service-points" },
  { fn: "searchServicePoint", signature: "searchServicePoint(domain, options?, callback?)", description: "Search service points with an Odoo domain.",
    code: "searchServicePoint([['is_disabled', '=', false]]);", apiRef: "service-points" },
  { fn: "getArea", signature: "getArea(sppId, callback?)", description: "Fetch one area by spp_id.",
    code: "getArea('AREA_SL_BO');", apiRef: "areas" },
  { fn: "searchArea", signature: "searchArea(domain, options?, callback?)", description: "Search areas with an Odoo domain.",
    code: "searchArea([['code', 'ilike', 'SL']]);", apiRef: "areas" },
];
