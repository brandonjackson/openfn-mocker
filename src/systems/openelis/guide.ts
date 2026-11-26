import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openelis system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'OpenELIS Global',
  docs: 'https://docs.openfn.org/adaptors/packages/openelis-docs',
  blurb:
    'Laboratory information system (OpenELIS Global 2.x). Its FHIR R4 store under /fhir models lab work as ServiceRequests (orders), Specimens, Observations (results) and DiagnosticReports tied to a Patient; the webapp REST API under /api/OpenELIS-Global/rest takes order, patient and result entry (SamplePatientEntry, PatientManagement, LogbookResults) and serves lookups by accession number. Seeded with patient 1001 (NID12345) and order 0000000123.',
  auth: 'Basic / Bearer',
  examples: [
    { method: 'GET', path: '/fhir/ServiceRequest', label: 'Lab orders (ServiceRequest Bundle)' },
    { method: 'GET', path: '/fhir/DiagnosticReport/report-0001', label: 'A diagnostic report + results' },
    { method: 'GET', path: '/fhir/Observation', label: 'Result Observations' },
    {
      method: 'POST',
      path: '/fhir/ServiceRequest',
      label: 'Create a lab order',
      body: JSON.stringify({ resourceType: 'ServiceRequest', status: 'active', intent: 'order', subject: { reference: 'Patient/pat-0001' } }, null, 2),
    },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/TestCatalog', label: 'Test catalog (REST)' },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/patient-search-results?nationalID=NID12345', label: 'Search patients by national ID' },
    {
      method: 'POST',
      path: '/api/OpenELIS-Global/rest/PatientManagement',
      label: 'Register a patient',
      body: JSON.stringify({ patientUpdateStatus: 'ADD', firstName: 'Amina', lastName: 'Okafor', gender: 'F', birthDateForDisplay: '03/02/1988', nationalId: 'NID67890' }, null, 2),
    },
    {
      method: 'POST',
      path: '/api/OpenELIS-Global/rest/SamplePatientEntry',
      label: 'Create a lab order (patient + sample + tests)',
      body: JSON.stringify(
        {
          patientProperties: { patientUpdateStatus: 'UPDATE', patientPK: '1001' },
          sampleOrderItems: { labNo: '0000000200', receivedDateForDisplay: '01/07/2024', requesterSampleID: 'EMR-ORD-0002', priority: 'ROUTINE' },
          sampleXML: '<samples><sample sampleID="1" tests="201,310"/></samples>',
        },
        null,
        2,
      ),
    },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/order/search?labNumber=0000000123', label: 'Find an order by lab number' },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/patientByLabNumer?accessionNumber=0000000123', label: 'Patient for a lab number' },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/LogbookResults?testSectionId=36', label: 'Results awaiting entry (Hematology)' },
    {
      method: 'POST',
      path: '/api/OpenELIS-Global/rest/LogbookResults',
      label: 'Save a test result',
      body: JSON.stringify(
        { accessionNumber: '0000000123', testSectionId: '36', testResult: [{ accessionNumber: '0000000123', analysisId: '5002', testId: '202', resultValue: '6.2', resultType: 'N' }] },
        null,
        2,
      ),
    },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/AccessionValidation?testSectionId=36', label: 'Results awaiting validation' },
    { method: 'GET', path: '/api/OpenELIS-Global/rest/accession-results?accessionNumber=0000000123', label: 'Validated results for an accession' },
  ],
};
