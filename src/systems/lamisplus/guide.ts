import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the lamisplus system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'LAMISPlus',
  docs: 'https://docs.openfn.org/adaptors/packages/lamisplus-docs',
  blurb:
    'HIV electronic medical record (Nigeria). Log in with email + password at /core/api/v1/auth/login to get an accessToken, then read patients from the EHR plugin API. getPatients returns the { data: { patients } } envelope; the generic get/post/request functions target any relative path.',
  auth: 'Bearer token (email/password login)',
  examples: [
    {
      id: 'login',
      method: 'POST',
      path: '/core/api/v1/auth/login',
      label: 'Log in (returns accessToken)',
      body: JSON.stringify({ email: 'admin@lamisplus.org', password: 'secret' }, null, 2),
    },
    { id: 'patients', method: 'GET', path: '/plugin/ehr/api/v1/patient', label: 'List patients (getPatients)' },
    { id: 'patient', method: 'GET', path: '/plugin/ehr/api/v1/patient/1', label: 'Fetch one patient (get)' },
    {
      id: 'create',
      method: 'POST',
      path: '/plugin/ehr/api/v1/patient',
      label: 'Create a patient (post)',
      body: JSON.stringify({ firstName: 'Sandbox', surname: 'Patient', sex: 'FEMALE', dateOfBirth: '1995-05-05' }, null, 2),
    },
  ],
};
