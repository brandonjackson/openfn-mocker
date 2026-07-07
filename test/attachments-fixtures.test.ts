import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  attachmentFixtures,
  exampleCsv,
  exampleXlsx,
  examplePng,
  examplePdf,
  exampleJpg,
  exampleTxt,
} from '../src/systems/shared/attachments.js';

/**
 * The shared dummy attachments (src/systems/shared/attachments.ts) carry their
 * bytes inline as base64 so seeds stay pure TypeScript. The exact same bytes are
 * mirrored as real, openable files under test/fixtures/attachments/. This guard
 * asserts the two never drift: if a fixture file is regenerated, the embedded
 * copy must be updated to match (and vice versa), so the inline data is always a
 * faithful mirror of the on-disk originals.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'attachments');

describe('shared attachment fixtures mirror test/fixtures/attachments/', () => {
  for (const fx of attachmentFixtures) {
    it(`${fx.filename}: embedded bytes match the on-disk file`, () => {
      const onDisk = readFileSync(join(fixturesDir, fx.filename));
      expect(Buffer.compare(fx.bytes(), onDisk)).toBe(0);
      expect(fx.size).toBe(onDisk.length);
    });

    it(`${fx.filename}: base64 and base64url encode the same bytes`, () => {
      expect(Buffer.from(fx.base64, 'base64').equals(fx.bytes())).toBe(true);
      expect(Buffer.from(fx.base64url, 'base64url').equals(fx.bytes())).toBe(true);
    });
  }

  it('exposes CSV, XLSX, PNG, PDF, JPEG, and TXT fixtures', () => {
    expect(attachmentFixtures.map((f) => f.filename)).toEqual([
      'example.csv',
      'example.xlsx',
      'example.png',
      'example.pdf',
      'example.jpg',
      'example.txt',
    ]);
    expect(exampleCsv.mimeType).toBe('text/csv');
    expect(exampleXlsx.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(examplePng.mimeType).toBe('image/png');
    expect(examplePdf.mimeType).toBe('application/pdf');
    expect(exampleJpg.mimeType).toBe('image/jpeg');
    expect(exampleTxt.mimeType).toBe('text/plain');
  });

  it('each fixture carries the correct file-type magic bytes', () => {
    // CSV / TXT decode to readable text.
    expect(exampleCsv.bytes().toString('utf-8')).toContain('Western Area');
    expect(exampleTxt.bytes().toString('utf-8')).toContain('OpenFn');
    // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
    expect([...examplePng.bytes().subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // XLSX is a ZIP: starts with "PK\x03\x04".
    expect([...exampleXlsx.bytes().subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // PDF starts with "%PDF-".
    expect(examplePdf.bytes().subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // JPEG starts with the SOI marker FF D8 FF and ends with EOI FF D9.
    expect([...exampleJpg.bytes().subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect([...exampleJpg.bytes().subarray(-2)]).toEqual([0xff, 0xd9]);
  });
});
