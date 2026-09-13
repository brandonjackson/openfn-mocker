import type { UsageExample } from '../types.js';

/**
 * Usage examples for the divoc sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 *
 * `certifyVaccination` posts its argument verbatim, and the vendor's vaccination
 * API types the /v1/certify body as an ARRAY of certification requests — so the
 * snippet passes an array, even for a single recipient. (The adaptor's own JSDoc
 * example passes a bare object; this mock accepts either, the real API does not.)
 */
export const usage: UsageExample[] = [
  {
    fn: 'certifyVaccination',
    signature: 'certifyVaccination(data, callback = s => s)',
    description:
      'Certify one or more vaccinations by POSTing an array of certification requests to DIVOC (/v1/certify).',
    code:
      "certifyVaccination([\n" +
      "  {\n" +
      "    preEnrollmentCode: 'PEC-2001',\n" +
      "    recipient: { name: 'Amara Okafor', contact: ['tel:+250788000001'], dob: '1988-04-12', gender: 'Female' },\n" +
      "    vaccination: { name: 'COVISHIELD', batch: 'B-4120', dose: 1, totalDoses: 2, date: '2026-06-01T09:00:00.000Z' },\n" +
      "    vaccinator: { name: 'Dr. Jean Uwimana' },\n" +
      "    facility: { name: 'Kigali District Hospital' },\n" +
      "  },\n" +
      "]);",
    apiRef: 'certify',
  },
];
