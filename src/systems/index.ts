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
// Popular commercial + DPG systems that expose a configurable base URL, so the
// real adaptor can be pointed at the mock and driven end to end.
import mpesa from './mpesa/plugin.js';
import flutterwave from './flutterwave/plugin.js';
import monnify from './monnify/plugin.js';
import mtnMomo from './mtn-momo/plugin.js';
import erpnext from './erpnext/plugin.js';
import odoo from './odoo/plugin.js';
import vtiger from './vtiger/plugin.js';
import maximo from './maximo/plugin.js';
import satusehat from './satusehat/plugin.js';
import senaite from './senaite/plugin.js';
import msupply from './msupply/plugin.js';
import ocl from './ocl/plugin.js';
import divoc from './divoc/plugin.js';
import lamisplus from './lamisplus/plugin.js';
import etMfr from './et-mfr/plugin.js';
import resourcemap from './resourcemap/plugin.js';
import ghanaNia from './ghana-nia/plugin.js';
import ghanaBdr from './ghana-bdr/plugin.js';
import wigalSms from './wigal-sms/plugin.js';
import progres from './progres/plugin.js';
// Third expansion: more systems OpenFn has adaptors for, chosen to maximise the
// adaptor-function surface each mock exercises (payments, CRM/ERP, cloud drives,
// registries, messaging, LLMs and data platforms).
import salesforce from './salesforce/plugin.js';
import mailchimp from './mailchimp/plugin.js';
import surveycto from './surveycto/plugin.js';
import collections from './collections/plugin.js';
import memento from './memento/plugin.js';
import asana from './asana/plugin.js';
import inform from './inform/plugin.js';
import sunbirdRc from './sunbird-rc/plugin.js';
import ibipimo from './ibipimo/plugin.js';
import msgraph from './msgraph/plugin.js';
import stripe from './stripe/plugin.js';
import googledrive from './googledrive/plugin.js';
import zata from './zata/plugin.js';
import azureStorage from './azure-storage/plugin.js';
import beyonic from './beyonic/plugin.js';
import dagu from './dagu/plugin.js';
import gemini from './gemini/plugin.js';
import googlesheets from './googlesheets/plugin.js';
import pesapal from './pesapal/plugin.js';
import openfn from './openfn/plugin.js';

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
  // Popular systems with a configurable base URL (payments, ERP/CRM, health,
  // registries, gov-ID & messaging) added in the second expansion.
  mpesa,
  flutterwave,
  monnify,
  'mtn-momo': mtnMomo,
  erpnext,
  odoo,
  vtiger,
  maximo,
  satusehat,
  senaite,
  msupply,
  ocl,
  divoc,
  lamisplus,
  'et-mfr': etMfr,
  resourcemap,
  'ghana-nia': ghanaNia,
  'ghana-bdr': ghanaBdr,
  'wigal-sms': wigalSms,
  progres,
  // Third expansion (see imports above).
  salesforce,
  mailchimp,
  surveycto,
  collections,
  memento,
  asana,
  inform,
  'sunbird-rc': sunbirdRc,
  ibipimo,
  msgraph,
  stripe,
  googledrive,
  zata,
  'azure-storage': azureStorage,
  beyonic,
  dagu,
  gemini,
  googlesheets,
  pesapal,
  openfn,
};
