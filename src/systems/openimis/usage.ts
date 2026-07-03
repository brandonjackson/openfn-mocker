import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openimis sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getFHIR", signature: "getFHIR(path, params, callback = s => s)", description: "Fetch insurees as a FHIR Patient Bundle from OpenIMIS.",
    code: "getFHIR('Patient');", apiRef: "ex1" },
  { fn: "getFHIR (by id)", signature: "getFHIR(path, params, callback = s => s)", description: "Fetch a single insuree (FHIR Patient) by its resource id.",
    code: "getFHIR('Patient/insuree-0001');", apiRef: "ex2" },
  { fn: "getFHIR (Contract)", signature: "getFHIR(path, params, callback = s => s)", description: "Fetch policies as FHIR Contract resources.",
    code: "getFHIR('Contract');", apiRef: "ex3" },
  { fn: "getFHIR (Claim)", signature: "getFHIR(path, params, callback = s => s)", description: "Fetch claims as FHIR Claim resources.",
    code: "getFHIR('Claim');", apiRef: "ex4" },
];
