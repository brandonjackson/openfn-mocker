import type { SystemGuide } from '../types.js';

/** URL-encode a Loopback `?filter=` JSON object, as the adaptor's get/upsert helpers send it. */
const filter = (f: unknown): string => encodeURIComponent(JSON.stringify(f));

const json = (body: unknown): string => JSON.stringify(body, null, 2);

/**
 * Sandbox guide for the godata system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 *
 * Examples follow the adaptor's flow per resource: list, look up with a
 * `?filter=` (what get* and the first half of upsert* send), then create (POST)
 * or update (PUT) — the two halves of upsert*. The read-by-id and count routes
 * are not called by the adaptor but are part of Go.Data's LoopBack API.
 */
export const guide: SystemGuide = {
  title: 'Go.Data',
  docs: 'https://docs.openfn.org/adaptors/packages/godata-docs',
  blurb:
    'WHO outbreak investigation platform. Token login via POST /users/login; list endpoints return bare arrays and a ?filter= JSON Loopback query looks records up. Outbreaks, cases, contacts, locations and reference-data are all served.',
  auth: 'Token via POST /users/login',
  examples: [
    {
      id: 'login',
      method: 'POST',
      path: '/users/login',
      label: 'Login: returns { id: <token> }',
      body: json({ email: 'api@who.int', password: 'mock' }),
    },

    // --- Outbreaks ---
    { id: 'list-outbreaks', method: 'GET', path: '/outbreaks', label: 'List outbreaks (bare array)' },
    {
      id: 'get-outbreak',
      method: 'GET',
      path: `/outbreaks?filter=${filter({ where: { name: 'COVID-19 Sierra Leone' } })}`,
      label: 'Find outbreaks by filter (getOutbreak)',
    },
    { method: 'GET', path: '/outbreaks/count', label: 'Count outbreaks' },
    { method: 'GET', path: '/outbreaks/ob-sl-covid19', label: 'Read one outbreak by id' },
    {
      id: 'create-outbreak',
      method: 'POST',
      path: '/outbreaks',
      label: 'Create an outbreak (upsertOutbreak, no match)',
      body: json({
        name: 'Ebola Sierra Leone',
        disease: 'LNG_REFERENCE_DATA_CATEGORY_DISEASE_EBOLA',
        startDate: '2024-03-01T00:00:00.000Z',
        countries: [{ id: 'LOC-SL' }],
      }),
    },
    {
      id: 'update-outbreak',
      method: 'PUT',
      path: '/outbreaks/ob-sl-covid19',
      label: 'Update an outbreak (upsertOutbreak, match found)',
      body: json({ description: 'National COVID-19 outbreak investigation (updated).' }),
    },

    // --- Cases ---
    { id: 'list-cases', method: 'GET', path: '/outbreaks/ob-sl-covid19/cases', label: 'Cases for an outbreak' },
    {
      id: 'get-case',
      method: 'GET',
      path: `/outbreaks/ob-sl-covid19/cases?filter=${filter({ where: { firstName: 'Jane' } })}`,
      label: 'Filter cases (?filter= Loopback where)',
    },
    { method: 'GET', path: '/outbreaks/ob-sl-covid19/cases/case-0001', label: 'Read one case by id' },
    {
      id: 'create-case',
      method: 'POST',
      path: '/outbreaks/ob-sl-covid19/cases',
      label: 'Create a case (upsertCase, no match)',
      body: json({ firstName: 'Sandbox', lastName: 'Case', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE' }),
    },
    {
      id: 'update-case',
      method: 'PUT',
      path: '/outbreaks/ob-sl-covid19/cases/case-0001',
      label: 'Update a case (upsertCase, match found)',
      body: json({ classification: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_PROBABLE' }),
    },

    // --- Contacts ---
    { id: 'list-contacts', method: 'GET', path: '/outbreaks/ob-sl-covid19/contacts', label: 'Contacts for an outbreak' },
    {
      id: 'get-contact',
      method: 'GET',
      path: `/outbreaks/ob-sl-covid19/contacts?filter=${filter({ where: { lastName: 'Sesay' } })}`,
      label: 'Filter contacts (getContact)',
    },
    { method: 'GET', path: '/outbreaks/ob-sl-covid19/contacts/cont-0001', label: 'Read one contact by id' },
    {
      id: 'create-contact',
      method: 'POST',
      path: '/outbreaks/ob-sl-covid19/contacts',
      label: 'Create a contact (upsertContact, no match)',
      body: json({ firstName: 'Sandbox', lastName: 'Contact', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_MALE' }),
    },
    {
      id: 'update-contact',
      method: 'PUT',
      path: '/outbreaks/ob-sl-covid19/contacts/cont-0001',
      label: 'Update a contact (upsertContact, match found)',
      body: json({ riskLevel: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_MEDIUM' }),
    },

    // --- Locations ---
    { id: 'list-locations', method: 'GET', path: '/locations', label: 'Location tree' },
    {
      id: 'get-location',
      method: 'GET',
      path: `/locations?filter=${filter({ where: { name: 'Bo District' } })}`,
      label: 'Find locations by filter (getLocation)',
    },
    { method: 'GET', path: '/locations/LOC-BO', label: 'Read one location by id' },
    {
      id: 'create-location',
      method: 'POST',
      path: '/locations',
      label: 'Create a location (upsertLocation, no match)',
      body: json({
        name: 'Kenema District',
        parentLocationId: 'LOC-SL',
        geographicalLevelId: 'LNG_REFERENCE_DATA_CATEGORY_LOCATION_GEOGRAPHICAL_LEVEL_ADMIN_LEVEL_1',
      }),
    },
    {
      id: 'update-location',
      method: 'PUT',
      path: '/locations/LOC-BO',
      label: 'Update a location (upsertLocation, match found)',
      body: json({ name: 'Bo District (updated)' }),
    },

    // --- Reference data ---
    { id: 'list-reference-data', method: 'GET', path: '/reference-data', label: 'List reference data' },
    {
      id: 'get-reference-data',
      method: 'GET',
      path: `/reference-data?filter=${filter({ where: { categoryId: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL' } })}`,
      label: 'Find reference data by category (getReferenceData)',
    },
    {
      method: 'GET',
      path: '/reference-data/LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_HIGH',
      label: 'Read one reference-data entry by id',
    },
    {
      id: 'create-reference-data',
      method: 'POST',
      path: '/reference-data',
      label: 'Create a reference-data entry (upsertReferenceData, no match)',
      body: json({ categoryId: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL', value: 'Low', active: true }),
    },
    {
      id: 'update-reference-data',
      method: 'PUT',
      path: '/reference-data/LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_HIGH',
      label: 'Update a reference-data entry (upsertReferenceData, match found)',
      body: json({ description: 'Close contact with a confirmed case' }),
    },
  ],
};
