import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenLMIS seed (logistics-management Digital Public Good). Seeds programs,
 * facilities, orderables (products) and a requisition — the OpenLMIS v3
 * reference-data + requisition resources the openlmis adaptor reads and writes.
 * OpenLMIS ids are uuids and paginated endpoints use the Spring Data
 * `{ content, totalElements, ... }` page envelope.
 *
 * Record shapes follow the vendor's own RAML/JSON-Schema definitions (the
 * referencedata service's `facility.json`, `geographicZone.json`,
 * `geographicLevel.json` and `orderable.json`), so the required properties are
 * all present: a Facility carries `type`, `active`, `enabled` and a
 * `geographicZone` with `code` + `level`; an Orderable carries `productCode`,
 * `netContent`, `packRoundingThreshold` and `roundToZero`.
 */

export const IDS = {
  programEpi: '10845cb9-d365-4aaa-badd-b4fa39c6a26a',
  programEssMeds: '418bdc1d-c303-4bd0-b2d3-d8901150a983',
  facilityBo: 'e6799d64-d10d-4011-b8c2-0e4d4a3f0000',
  facilityNgelehun: 'a6799d64-d10d-4011-b8c2-0e4d4a3f0001',
  orderableAct: 'cd9e1412-8703-40e1-8b3c-0e4d4a3f0100',
  orderableRdt: 'cd9e1412-8703-40e1-8b3c-0e4d4a3f0101',
  facilityTypeWarehouse: 'ac1d268b-ce10-455f-bf87-9c667da8f060',
  facilityTypeHealthCenter: 'ac1d268b-ce10-455f-bf87-9c667da8f061',
  facilityOperatorMoh: '9456c3e9-c4a6-4a28-9e08-47ceb16a4121',
  geoLevelDistrict: '5ef1b2a4-6a49-4c1b-8f6a-0e4d4a3f0200',
  geoZoneBo: '4f9b1f2a-f2b5-4a3a-9b58-0e4d4a3f0201',
};

/** The district Bo sits in — the vendor schema requires `code` and `level`. */
const geographicZoneBo = {
  id: IDS.geoZoneBo,
  code: 'BO',
  name: 'Bo',
  level: {
    id: IDS.geoLevelDistrict,
    code: 'District',
    name: 'District',
    levelNumber: 3,
  },
  catchmentPopulation: 574201,
  latitude: 7.9647,
  longitude: -11.7383,
};

/** A facility's supported program, as the referencedata service returns it. */
function supportedProgram(program: { id: string; code: string; name: string }) {
  return {
    id: program.id,
    code: program.code,
    name: program.name,
    programActive: true,
    periodsSkippable: false,
    showNonFullSupplyTab: true,
    supportActive: true,
    supportLocallyFulfilled: false,
    supportStartDate: '2019-01-01',
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const programs = [
    {
      id: IDS.programEpi,
      code: 'PRG002',
      name: 'EPI',
      description: 'Expanded Programme on Immunization',
      active: true,
      periodsSkippable: false,
      showNonFullSupplyTab: false,
      enableDatePhysicalStockCountCompleted: true,
    },
    {
      id: IDS.programEssMeds,
      code: 'PRG001',
      name: 'Essential Meds',
      description: 'Essential medicines programme',
      active: true,
      periodsSkippable: true,
      showNonFullSupplyTab: true,
      enableDatePhysicalStockCountCompleted: true,
    },
  ];
  for (const p of programs) store.create('programs', p.id, p);

  const facilityOperator = {
    id: IDS.facilityOperatorMoh,
    code: 'moh',
    name: 'Ministry of Health',
    description: 'Public sector facilities operated by the Ministry of Health',
    displayOrder: 1,
  };

  const facilities = [
    {
      id: IDS.facilityBo,
      code: 'FAC001',
      name: 'Bo District Medical Store',
      description: 'District warehouse supplying health facilities across Bo',
      geographicZone: geographicZoneBo,
      type: {
        id: IDS.facilityTypeWarehouse,
        code: 'warehouse',
        name: 'Warehouse',
        description: 'Storage and distribution point',
        displayOrder: 1,
        active: true,
      },
      operator: facilityOperator,
      active: true,
      goLiveDate: '2019-01-01',
      comment: 'Seeded reference-data facility',
      enabled: true,
      openLmisAccessible: true,
      supportedPrograms: programs.map(supportedProgram),
    },
    {
      id: IDS.facilityNgelehun,
      code: 'FAC002',
      name: 'Ngelehun CHC',
      description: 'Community health centre in Badjia chiefdom',
      geographicZone: geographicZoneBo,
      type: {
        id: IDS.facilityTypeHealthCenter,
        code: 'health_center',
        name: 'Health Center',
        description: 'Service delivery point',
        displayOrder: 2,
        active: true,
      },
      operator: facilityOperator,
      active: true,
      goLiveDate: '2019-01-01',
      comment: 'Seeded reference-data facility',
      enabled: true,
      openLmisAccessible: true,
      supportedPrograms: programs.map(supportedProgram),
    },
  ];
  for (const f of facilities) store.create('facilities', f.id, f);

  const orderables = [
    {
      id: IDS.orderableAct,
      productCode: 'C100',
      fullProductName: 'Artemether/Lumefantrine 20/120mg',
      description: 'Artemisinin-based combination therapy, 24-tablet blister',
      netContent: 1,
      packRoundingThreshold: 1,
      roundToZero: false,
      programs: [
        {
          programId: IDS.programEssMeds,
          orderableDisplayCategoryId: '15b8ef1f-3c1d-4f0f-9b0e-0e4d4a3f0300',
          orderableCategoryDisplayName: 'Antimalarials',
          orderableCategoryDisplayOrder: 1,
          dosesPerPatient: 24,
          active: true,
          fullSupply: true,
          displayOrder: 1,
          pricePerPack: 5.2,
        },
      ],
      identifiers: {},
      extraData: {},
      meta: { versionNumber: 1, lastUpdated: '2024-01-15T09:00:00Z' },
    },
    {
      id: IDS.orderableRdt,
      productCode: 'C200',
      fullProductName: 'Malaria RDT',
      description: 'Rapid diagnostic test for malaria, pack of 25',
      netContent: 25,
      packRoundingThreshold: 5,
      roundToZero: true,
      programs: [
        {
          programId: IDS.programEssMeds,
          orderableDisplayCategoryId: '15b8ef1f-3c1d-4f0f-9b0e-0e4d4a3f0301',
          orderableCategoryDisplayName: 'Diagnostics',
          orderableCategoryDisplayOrder: 2,
          dosesPerPatient: 1,
          active: true,
          fullSupply: true,
          displayOrder: 2,
          pricePerPack: 12.5,
        },
      ],
      identifiers: {},
      extraData: {},
      meta: { versionNumber: 1, lastUpdated: '2024-01-15T09:00:00Z' },
    },
  ];
  for (const o of orderables) store.create('orderables', o.id, o);

  const reqId = randomUUID();
  store.create('requisitions', reqId, {
    id: reqId,
    status: 'INITIATED',
    emergency: false,
    program: { id: IDS.programEpi, name: 'EPI' },
    facility: { id: IDS.facilityNgelehun, name: 'Ngelehun CHC' },
    processingPeriod: { name: 'March 2024', startDate: '2024-03-01', endDate: '2024-03-31' },
    requisitionLineItems: [
      { orderable: { id: IDS.orderableAct }, requestedQuantity: 500, approvedQuantity: null },
      { orderable: { id: IDS.orderableRdt }, requestedQuantity: 300, approvedQuantity: null },
    ],
  });
}
