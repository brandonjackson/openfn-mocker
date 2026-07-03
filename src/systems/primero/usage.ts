import type { UsageExample } from '../types.js';

/**
 * Usage examples for the primero sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getCases", signature: "getCases(query, options, callback?)", description: "Fetch cases from Primero, optionally filtered by query params.",
    code: "getCases({ remote: true, sex: 'female' });", apiRef: "ex1" },
  { fn: "createCase", signature: "createCase(params, callback?)", description: "Create a new case; the server assigns a CP-YYYY-NNN display id.",
    code: "createCase({ data: { age: 16, sex: 'female', name: 'Edwine Edgemont' } });", apiRef: "ex6" },
  { fn: "updateCase", signature: "updateCase(id, params, callback?)", description: "Update an existing case by id; subforms merge.",
    code: "updateCase('a4d1f9c2-3b7e-4e18-9c2a-8f6b1d0e5a73', { data: { age: 17 } });" },
  { fn: "upsertCase", signature: "upsertCase(params, callback?)", description: "Create or update a case, matched by one or more external id fields.",
    code: "upsertCase({\n  externalIds: ['case_id'],\n  data: { case_id: 'CP-2026-041', age: 20, status: 'open' },\n});" },
  { fn: "getReferrals", signature: "getReferrals(params, callback?)", description: "Fetch referrals for one case, looked up by record id or case id.",
    code: "getReferrals({ id: 'CP-2024-001' });" },
  { fn: "createReferrals", signature: "createReferrals(params, callback?)", description: "Bulk-refer one or more cases to a single user.",
    code: "createReferrals({\n  data: { ids: ['a4d1f9c2-3b7e-4e18-9c2a-8f6b1d0e5a73'], transitioned_to: 'primero_cp' },\n});" },
  { fn: "updateReferral", signature: "updateReferral(params, callback?)", description: "Update a single referral on a case, looked up by record/case id.",
    code: "updateReferral({ caseId: 'CP-2026-014', id: 'referral-1', data: { notes: 'Updated' } });" },
  { fn: "getForms", signature: "getForms(query, callback?)", description: "Fetch form definitions accessible to the user, optionally by module.",
    code: "getForms({ module_id: 'primeromodule-cp' });", apiRef: "ex3" },
  { fn: "getLookups", signature: "getLookups(query, callback?)", description: "Fetch a paginated list of lookup values.",
    code: "getLookups({ per: 50, page: 1 });", apiRef: "ex4" },
  { fn: "getLocations", signature: "getLocations(query, callback?)", description: "Fetch a paginated location hierarchy.",
    code: "getLocations({ page: 1, per: 20 });", apiRef: "ex5" },
  { fn: "http.get", signature: "http.get(path, options?)", description: "Low-level GET against the /api/v2 base; here the case list.",
    code: "http.get('/cases');", apiRef: "ex1" },
  { fn: "http.post", signature: "http.post(path, data, options?)", description: "Low-level POST; the body is sent wrapped in a { data } envelope.",
    code: "http.post('cases', { age: 16, sex: 'female', name: 'Edwine Edgemont' });", apiRef: "ex6" },
  { fn: "http.patch", signature: "http.patch(path, data, options?)", description: "Low-level PATCH of one case by record id; nested data merges.",
    code: "http.patch('cases/a4d1f9c2-3b7e-4e18-9c2a-8f6b1d0e5a73', { age: 17 });" },
];
