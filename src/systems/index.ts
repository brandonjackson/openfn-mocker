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
import godata from './godata/plugin.js';
import rapidpro from './rapidpro/plugin.js';
import odk from './odk/plugin.js';
import openlmis from './openlmis/plugin.js';
import openimis from './openimis/plugin.js';
import openspp from './openspp/plugin.js';
import opencrvs from './opencrvs/plugin.js';
import openelis from './openelis/plugin.js';
import cht from './cht/plugin.js';
import openhim from './openhim/plugin.js';
import openboxes from './openboxes/plugin.js';
import ihris from './ihris/plugin.js';

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
  // Additional Digital Public Goods OpenFn has adaptors for.
  godata,
  rapidpro,
  odk,
  openlmis,
  openimis,
  openspp,
  opencrvs,
  openelis,
  cht,
  openhim,
  openboxes,
  ihris,
};
