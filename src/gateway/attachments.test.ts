import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { dataUrlToRawFile } from './attachments.js';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('attachments: base64 data URL 解码为 RawFileLike', async () => {
  const file = dataUrlToRawFile({
    name: 'shot.png',
    type: 'image/png',
    dataUrl: PNG_DATA_URL,
  });
  assert.equal(file.name, 'shot.png');
  assert.equal(file.type, 'image/png');
  assert.ok(file.size > 0);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
});

test('attachments: 非法 data URL 抛错', () => {
  assert.throws(
    () =>
      dataUrlToRawFile({
        name: 'bad.txt',
        type: 'text/plain',
        dataUrl: 'not-a-data-url',
      }),
    /base64 data URL/,
  );
});
