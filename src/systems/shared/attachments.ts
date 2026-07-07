/**
 * Dummy attachment fixtures, shared by every mock system that returns file
 * attachments (Gmail messages today; Mailgun/Inform/Google Drive and friends
 * can reuse them next). Three tiny but genuinely valid example files — a CSV, a
 * single-sheet XLSX, and a 4x4 PNG — so a workflow that downloads an attachment
 * has something faithful to decode, regardless of the content type it asks for.
 *
 * The bytes are carried inline as base64 so seeds stay pure TypeScript: no
 * runtime `fs`, so they compile into `dist/`, ship in the Docker image, and are
 * deterministic across dev/test/prod. The exact same bytes are mirrored as real,
 * openable files under `test/fixtures/attachments/`, and
 * `test/attachments-fixtures.test.ts` asserts the two never drift — so the
 * embedded copy stays a faithful mirror of the on-disk originals.
 */

/** One dummy file, in every shape a mock or adaptor might need it. */
export interface AttachmentFixture {
  /** Suggested filename, e.g. `example.csv` (what a message part advertises). */
  filename: string;
  /** MIME type for the file's own content type. */
  mimeType: string;
  /** Raw byte length — what an attachment's `size` field reports. */
  size: number;
  /** Standard base64 of the raw bytes (matches `test/fixtures/attachments/`). */
  base64: string;
  /** Gmail-style URL-safe base64 (base64url) — what the real API returns. */
  base64url: string;
  /** The raw bytes as a Buffer (a fresh copy each call). */
  bytes(): Buffer;
}

/** Build a fixture from its standard-base64 payload, deriving the rest. */
function fixture(filename: string, mimeType: string, base64: string): AttachmentFixture {
  const buf = Buffer.from(base64, 'base64');
  return {
    filename,
    mimeType,
    size: buf.length,
    base64,
    base64url: buf.toString('base64url'),
    bytes: () => Buffer.from(base64, 'base64'),
  };
}

/**
 * `example.csv` — a small, human-readable CSV.
 * ```
 * id,name,coverage
 * 1,Western Area,0.91
 * 2,Bo,0.87
 * 3,Kenema,0.83
 * ```
 */
export const exampleCsv = fixture(
  'example.csv',
  'text/csv',
  'aWQsbmFtZSxjb3ZlcmFnZQoxLFdlc3Rlcm4gQXJlYSwwLjkxCjIsQm8sMC44NwozLEtlbmVtYSwwLjgzCg=='
);

/** `example.xlsx` — a minimal but valid single-sheet OOXML workbook. */
export const exampleXlsx = fixture(
  'example.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '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' +
    'AAUABQBFAQAA5AQAAAAA'
);

/** `example.png` — a valid 4x4 RGBA PNG (a small solid-colour image). */
export const examplePng = fixture(
  'example.png',
  'image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mMwTjvzHxkzkC4AAP6wJkF0' +
    'YaNSAAAAAElFTkSuQmCC'
);

/** `example.pdf` — a minimal but valid single-page PDF ("OpenFn mock example.pdf"). */
export const examplePdf = fixture(
  'example.pdf',
  'application/pdf',
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5' +
    'cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVu' +
    'dCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAv' +
    'RjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1MyA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDIw' +
    'IDQwIFRkIChPcGVuRm4gbW9jayBleGFtcGxlLnBkZikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBl' +
    'IC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAw' +
    'MCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAow' +
    'MDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDQgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+' +
    'CnN0YXJ0eHJlZgo0MTQKJSVFT0YK'
);

/** `example.jpg` — a valid minimal baseline JPEG (a small solid-colour image). */
export const exampleJpg = fixture(
  'example.jpg',
  'image/jpeg',
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1R' +
    'V19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgED' +
    'AwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RF' +
    'RkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJ' +
    'ytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACv/2Q=='
);

/** `example.txt` — a tiny plain-text file. */
export const exampleTxt = fixture(
  'example.txt',
  'text/plain',
  'T3BlbkZuIG1vY2tlciBkdW1teSBhdHRhY2htZW50LgpUaGlzIGlzIGEgcGxhaW4tdGV4dCBleGFtcGxlIGZpbGUuCg=='
);

/** Every dummy attachment fixture, keyed by filename, for iteration in seeds/tests. */
export const attachmentFixtures: AttachmentFixture[] = [
  exampleCsv,
  exampleXlsx,
  examplePng,
  examplePdf,
  exampleJpg,
  exampleTxt,
];
