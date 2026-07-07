import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';
import { exampleJpg } from '../shared/attachments.js';

/**
 * UNICEF InForm seed (KoboToolbox/KPI-based). One deployed form plus a couple of
 * submissions so getForms / getSubmissions return data on boot, one media
 * (attachment) record so getAttachmentMetadata resolves, and a matching `files`
 * record carrying the real attachment bytes so downloadAttachment resolves. The
 * bytes reuse the shared dummy JPEG (see src/systems/shared/attachments.ts).
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const forms = [
    {
      id: '6225',
      name: 'Household Survey',
      asset_type: 'survey',
      deployment__active: true,
      has_deployment: true,
      date_created: nowIso(),
    },
  ];
  for (const f of forms) store.create('forms', f.id, f);

  const submissions = [
    { _id: '7783155', _submission_time: nowIso(), _xform_id_string: '6225', name: 'Ada', age: 36 },
    { _id: '7783156', _submission_time: nowIso(), _xform_id_string: '6225', name: 'Grace', age: 41 },
  ];
  for (const s of submissions) store.create('submissions', s._id, s);

  const media = [
    { id: '621985', filename: 'photo.jpg', mimetype: 'image/jpeg', instance: '7783155' },
  ];
  for (const m of media) store.create('media', m.id, m);

  // Downloadable attachment bytes, keyed by the same id as the media metadata.
  // downloadAttachment('621985') reads GET files/:id (which redirects to the
  // bytes) and returns them; the bytes reuse the shared dummy JPEG.
  store.create('files', '621985', {
    id: '621985',
    filename: 'photo.jpg',
    mimetype: exampleJpg.mimeType,
    size: exampleJpg.size,
    base64: exampleJpg.base64,
  });
}
