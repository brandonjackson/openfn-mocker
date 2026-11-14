import type { UsageExample } from '../types.js';
import { SEEDED_PRESCRIPTION_GUID } from './seed.js';

/**
 * Usage examples for the dagu sandbox "Usage" tab, one per call the adaptor's
 * own JSDoc shows. Signatures are from @openfn/language-dagu's ast.json:
 * get(path, options), post(path, body, options) and
 * request(method, path, body, options). Paths are relative; the adaptor logs in
 * first (POST /account/login) and joins them onto configuration.baseUrl.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options?)',
    description: "Fetch the dispensing unit's stock-out report.",
    code: "get('DispensingUnit/Dashboard/StockOutReport');",
    apiRef: 'stockOutReport',
  },
  {
    fn: 'post',
    signature: 'post(path, body, options?)',
    description: 'Check a prescription row before dispensing it.',
    code: `post('Patient/CheckPrescription', { prescriptionRowGuid: '${SEEDED_PRESCRIPTION_GUID}' });`,
    apiRef: 'checkPrescription',
  },
  {
    fn: 'post',
    signature: 'post(path, body, options?)',
    description: "Page through patient prescription history, sent as a form body ({ contentType: 'form' }).",
    code: "post(\n  'Patient/Prescription/History',\n  { start: 0, length: 10, draw: 1, additionalParameters: { filter: [] } },\n  { contentType: 'form' }\n);",
    apiRef: 'prescriptionHistory',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options?)',
    description: "Search the dispensing unit's requisition history.",
    code: "request('POST', 'DispensingUnit/Request/History', { search: {} });",
    apiRef: 'requestHistory',
  },
];
