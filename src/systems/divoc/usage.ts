import type { UsageExample } from '../types.js';

/**
 * Usage examples for the divoc sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  {
    fn: 'certifyVaccination',
    signature: 'certifyVaccination(data, callback = s => s)',
    description: 'Certify a vaccination by POSTing a certification request to DIVOC (/v1/certify).',
    code:
      "certifyVaccination({\n" +
      "  preEnrollmentCode: 'PEC-2001',\n" +
      "  recipient: { name: 'Amara Okafor', contact: ['tel:+250788000001'], dob: '1988-04-12', gender: 'Female' },\n" +
      "  vaccination: { name: 'COVISHIELD', batch: 'B-4120', dose: 1, totalDoses: 2, date: '2026-06-01T09:00:00.000Z' },\n" +
      "  vaccinator: { name: 'Dr. Jean Uwimana' },\n" +
      "  facility: { name: 'Kigali District Hospital' },\n" +
      "});",
    apiRef: 'certify',
  },
];
