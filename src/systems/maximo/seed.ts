import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * IBM Maximo seed. Maximo exposes business objects through OSLC "object
 * structures" (os) such as `mxasset` (assets) and `mxwo` (work orders). Records
 * here live in a store collection named after the object structure and are keyed
 * by their business key (assetnum / wonum) so the /oslc/os/<os>/<id> paths resolve
 * on first boot. Each carries a `href` like a real lean OSLC member.
 */

/** A relative lean-member href, e.g. /maximo/oslc/os/mxasset/A11430. */
function href(os: string, id: string): string {
  return `/maximo/oslc/os/${os}/${id}`;
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const assets = [
    { assetnum: '11430', description: 'Centrifugal Pump 100 GPM', status: 'OPERATING', siteid: 'BEDFORD', location: 'BR300', assettype: 'PRODUCTION' },
    { assetnum: '13120', description: 'Cold Chain Refrigerator', status: 'OPERATING', siteid: 'NAIROBI', location: 'CLINIC-A', assettype: 'FIXED' },
  ];
  for (const a of assets) {
    store.create('mxasset', a.assetnum, { ...a, href: href('mxasset', a.assetnum) });
  }

  const workorders = [
    { wonum: '1001', description: 'Quarterly pump inspection', status: 'WAPPR', siteid: 'BEDFORD', assetnum: '11430', worktype: 'PM' },
    { wonum: '1002', description: 'Repair refrigerator compressor', status: 'APPR', siteid: 'NAIROBI', assetnum: '13120', worktype: 'CM' },
  ];
  for (const w of workorders) {
    store.create('mxwo', w.wonum, { ...w, href: href('mxwo', w.wonum) });
  }
}
