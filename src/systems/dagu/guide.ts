import type { SystemGuide } from '../types.js';
import { SEEDED_PRESCRIPTION_GUID } from './seed.js';

/**
 * Sandbox guide for the dagu system (DAGU, Ethiopia's pharmacy dispensing
 * tool). Paths are exactly the ones `@openfn/language-dagu` calls: the login
 * handshake plus the four dispensing-unit and patient paths from its examples.
 * The adaptor writes them relative ('DispensingUnit/...') and joins them onto
 * baseUrl, so on the sandbox they sit at the system root.
 */
export const guide: SystemGuide = {
  title: 'DAGU',
  docs: 'https://docs.openfn.org/adaptors/packages/dagu-docs',
  blurb:
    "DAGU, Ethiopia's facility pharmacy management and dispensing tool (not the Dagu workflow engine). The adaptor logs in with POST /account/login, then sends the returned token.access_token as a Bearer token on generic get / post / request calls. Responses use a { result, message, model } envelope, and history endpoints page DataTables-style (start, length, draw).",
  auth: 'Bearer (from /account/login)',
  examples: [
    {
      id: 'login',
      method: 'POST',
      path: '/account/login',
      label: 'Log in and get the access token the adaptor sends as Bearer',
      body: JSON.stringify({ username: 'admin', password: 'password' }, null, 2),
    },
    {
      id: 'stockOutReport',
      method: 'GET',
      path: '/DispensingUnit/Dashboard/StockOutReport',
      label: 'Stock-out report: items the dispensing unit has run out of',
    },
    {
      id: 'requestHistory',
      method: 'POST',
      path: '/DispensingUnit/Request/History',
      label: "First page of the dispensing unit's requisitions to the store",
      body: JSON.stringify({ start: 0, length: 5, draw: 1, search: {} }, null, 2),
    },
    {
      id: 'checkPrescription',
      method: 'POST',
      path: '/Patient/CheckPrescription',
      label: 'Check a prescription row before dispensing',
      body: JSON.stringify({ prescriptionRowGuid: SEEDED_PRESCRIPTION_GUID }, null, 2),
    },
    {
      id: 'prescriptionHistory',
      method: 'POST',
      path: '/Patient/Prescription/History',
      label: 'Page through patient prescription history',
      body: JSON.stringify({ start: 0, length: 10, draw: 1, additionalParameters: { filter: [] } }, null, 2),
    },
  ],
};
