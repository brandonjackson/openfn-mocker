import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import awsS3 from '../src/systems/aws-s3/plugin.js';

const config = { port: 0 };
const host = 'mock-bucket.s3.us-east-1.amazonaws.com';

describe('aws-s3', () => {
  it('lists objects under a prefix as ListObjectsV2 XML', async () => {
    const { app } = await createSystemServer(awsS3, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/?list-type=2&prefix=submissions/2026-11-01/', headers: { host } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.body).toContain('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(res.body).toContain('<Name>mock-bucket</Name>');
    expect(res.body).toContain('<KeyCount>2</KeyCount>');
    expect(res.body).toContain('<Key>submissions/2026-11-01/visit-0001.json</Key>');
    expect(res.body).not.toContain('visit-0003');
    await app.close();
  });

  it('pages with max-keys and NextContinuationToken', async () => {
    const { app } = await createSystemServer(awsS3, config, { logLevel: 'silent' });
    const first = await app.inject({ method: 'GET', url: '/?list-type=2&max-keys=2' });
    expect(first.body).toContain('<IsTruncated>true</IsTruncated>');
    const token = /<NextContinuationToken>([^<]+)</.exec(first.body)![1];
    const second = await app.inject({ method: 'GET', url: `/?list-type=2&max-keys=10&continuation-token=${token}` });
    expect(second.body).toContain('<IsTruncated>false</IsTruncated>');
    expect(second.body).toContain('<KeyCount>3</KeyCount>');
    await app.close();
  });

  it('round-trips a JSON object with a slash-separated key, keeping the bytes raw', async () => {
    const { app } = await createSystemServer(awsS3, config, { logLevel: 'silent' });
    const body = JSON.stringify({ visitId: 'visit-0004' });
    const put = await app.inject({
      method: 'PUT',
      url: '/submissions/2026-11-03/visit-0004.json?x-id=PutObject',
      headers: { host, 'content-type': 'application/json' },
      payload: body,
    });
    expect(put.statusCode).toBe(200);
    expect(put.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
    const get = await app.inject({ method: 'GET', url: '/submissions/2026-11-03/visit-0004.json?x-id=GetObject', headers: { host } });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('application/json');
    expect(get.headers.etag).toBe(put.headers.etag);
    expect(get.body).toBe(body);
    await app.close();
  });

  it('answers a missing key with an S3 NoSuchKey error', async () => {
    const { app } = await createSystemServer(awsS3, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/nope.json?x-id=GetObject' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('<Code>NoSuchKey</Code>');
    expect(res.body).toContain('<Key>nope.json</Key>');
    await app.close();
  });

  it('keeps buckets apart by virtual-hosted Host header', async () => {
    const { app } = await createSystemServer(awsS3, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/?list-type=2', headers: { host: 'other-bucket.s3.eu-west-1.amazonaws.com' } });
    expect(res.body).toContain('<Name>other-bucket</Name>');
    expect(res.body).toContain('<KeyCount>0</KeyCount>');
    await app.close();
  });
});
