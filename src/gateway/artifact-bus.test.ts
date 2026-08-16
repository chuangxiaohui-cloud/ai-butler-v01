import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { publishArtifactEvent, subscribeArtifactEvents } from './artifact-bus.js';

test('artifact-bus: 订阅/发布/退订', () => {
  const events: string[] = [];
  const unsubscribe = subscribeArtifactEvents((event) => {
    events.push(`${event.type}:${event.data.at ?? ''}`);
  });
  publishArtifactEvent('files_changed', { at: 1 });
  assert.deepEqual(events, ['files_changed:1']);
  unsubscribe();
  publishArtifactEvent('files_changed', { at: 2 });
  assert.deepEqual(events, ['files_changed:1']);
});
