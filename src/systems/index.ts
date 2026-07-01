import type { MockSystemPlugin } from './types.js';
import dhis2 from './dhis2/plugin.js';
import commcare from './commcare/plugin.js';
import openmrs from './openmrs/plugin.js';
import fhir from './fhir/plugin.js';
import httpGeneric from './http-generic/plugin.js';
import kobotoolbox from './kobotoolbox/plugin.js';
import primero from './primero/plugin.js';
import mailgun from './mailgun/plugin.js';
import twilio from './twilio/plugin.js';
import airtable from './airtable/plugin.js';

/** Registry of all mock system plugins, keyed by system name (== config key). */
export const plugins: Record<string, MockSystemPlugin> = {
  dhis2,
  commcare,
  openmrs,
  fhir,
  'http-generic': httpGeneric,
  kobotoolbox,
  primero,
  mailgun,
  twilio,
  airtable,
};
