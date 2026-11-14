import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';
import { exampleJpg } from '../shared/attachments.js';

/**
 * UNICEF InForm seed (InForm runs Ona's onadata, so records use its shapes:
 * numeric formid / _id / attachment ids, plain arrays for list endpoints). One deployed form plus a couple of
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
      formid: 6225,
      id_string: 'household_survey',
      title: 'Household Survey',
      name: 'Household Survey',
      url: 'https://data.inform.unicef.org/api/v1/forms/6225',
      owner: 'https://data.inform.unicef.org/api/v1/users/unicef',
      downloadable: true,
      num_of_submissions: 2,
      date_created: nowIso(),
    },
  ];
  for (const f of forms) store.create('forms', String(f.formid), f);

  const submissions = [
    { _id: 7783155, _xform_id: 6225, _submission_time: nowIso(), _xform_id_string: 'household_survey', name: 'Ada', age: 36 },
    { _id: 7783156, _xform_id: 6225, _submission_time: nowIso(), _xform_id_string: 'household_survey', name: 'Grace', age: 41 },
  ];
  for (const s of submissions) store.create('submissions', String(s._id), s);

  const media = [
    { id: 621985, filename: 'photo.jpg', mimetype: 'image/jpeg', instance: 7783155, xform: 6225 },
  ];
  for (const m of media) store.create('media', String(m.id), m);

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
