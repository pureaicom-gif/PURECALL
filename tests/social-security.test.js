import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPureServer } from '../server/index.js';

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pure-social-security-'));
  const server = createPureServer({ dataDir: dir, scan: false, gemini: { status: () => ({ configured: false }), scan: async () => {} } });
  await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.http.address().port}`;
  t.after(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = (cookie, path, method = 'GET', body, extra = {}) => fetch(base + path, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  });
  const users = [];
  for (let i = 0; i < 3; i++) {
    const response = await request(null, '/api/register', 'POST', { handle: `security_${i}`, name: `User ${i}`, password: 'fixture-password-123' });
    assert.equal(response.status, 201);
    users.push({ ...(await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] });
  }
  const post = async (user, text, clientId, media) => {
    const form = new FormData(); form.append('text', text); form.append('clientId', clientId);
    if (media) form.append('media', new Blob([media], { type: 'video/mp4' }), 'clip.mp4');
    return request(user.cookie, '/api/posts', 'POST', form);
  };
  return { ...server, dir, request, users, post };
}

test('post edits are owner-only; comments may be removed by their author or post owner', async t => {
  const { request, users: [owner, friend, stranger], post } = await fixture(t);
  const p = (await (await post(owner, 'Original', 'edit-1')).json()).post;
  assert.equal((await request(friend.cookie, `/api/posts/${p.id}`, 'PATCH', { text: 'Hijacked' })).status, 403);
  assert.equal((await request(owner.cookie, `/api/posts/${p.id}`, 'PATCH', { text: '   ' })).status, 400);
  const edited = await request(owner.cookie, `/api/posts/${p.id}`, 'PATCH', { text: 'Updated' });
  assert.equal(edited.status, 200); assert.equal((await edited.json()).post.text, 'Updated');
  for (const actor of [friend, owner]) {
    assert.equal((await request(friend.cookie, `/api/posts/${p.id}/comments`, 'POST', { text: 'Comment', clientId: `comment-${actor.id}` })).status, 200);
    const comments = (await (await request(owner.cookie, `/api/posts/${p.id}/comments`)).json()).comments;
    const id = comments.at(-1).id;
    assert.equal((await request(stranger.cookie, `/api/posts/${p.id}/comments/${id}`, 'DELETE')).status, 403);
    assert.equal((await request(actor.cookie, `/api/posts/${p.id}/comments/${id}`, 'DELETE')).status, 200);
    assert.equal((await request(actor.cookie, `/api/posts/${p.id}/comments/${id}`, 'DELETE')).status, 404);
  }
});

test('reel streaming supports ranges, requires auth, and respects blocks in both directions', async t => {
  const { request, users: [owner, viewer], post } = await fixture(t);
  const media = Buffer.alloc(128); media.writeUInt32BE(128); media.write('ftypmp42', 4);
  const p = (await (await post(owner, 'Video', 'reel-range', media)).json()).post;
  assert.equal((await request(null, p.media)).status, 401);
  const range = await request(viewer.cookie, p.media, 'GET', undefined, { Range: 'bytes=8-23' });
  assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), 'bytes 8-23/128');
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), media.subarray(8, 24));
  assert.match(range.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await request(viewer.cookie, p.media, 'GET', undefined, { Range: 'bytes=999-1000' })).status, 416);
  const other = (await (await post(viewer, 'Other video', 'other-reel', media)).json()).post;
  assert.equal((await request(viewer.cookie, `/api/block/${owner.id}`, 'POST', {})).status, 200);
  for (const [user, hidden, author] of [[viewer, p, owner], [owner, other, viewer]]) {
    assert.equal((await request(user.cookie, hidden.media)).status, 404);
    assert.equal((await request(user.cookie, `/api/profiles/${author.id}`)).status, 404);
    assert.equal((await request(user.cookie, `/api/posts/${hidden.id}/comments`)).status, 404);
    const feed = await (await request(user.cookie, '/api/posts')).json();
    assert.ok(!feed.posts.some(row => row.id === hidden.id));
  }
});

test('search is literal and retries do not duplicate posts, comments, or uploaded files', async t => {
  const { request, dir, users: [owner, viewer], post } = await fixture(t);
  const media = Buffer.alloc(32); media.writeUInt32BE(32); media.write('ftypmp42', 4);
  const first = (await (await post(owner, 'Unique Needle 100%', 'retry', media)).json()).post;
  const retry = await post(owner, 'Changed retry', 'retry', media);
  assert.equal(retry.status, 200); assert.equal((await retry.json()).post.id, first.id);
  assert.equal(readdirSync(join(dir, 'uploads')).filter(name => name.startsWith('post-')).length, 1);
  await post(owner, 'Something else', 'different');
  for (const q of ['needle', '100%']) {
    const result = await (await request(viewer.cookie, `/api/posts?q=${encodeURIComponent(q)}`)).json();
    assert.deepEqual(result.posts.map(p => p.id), [first.id]);
  }
  const missing = await (await request(viewer.cookie, '/api/posts?q=_')).json();
  assert.equal(missing.posts.length, 0);
  for (let i = 0; i < 2; i++) assert.equal((await request(viewer.cookie, `/api/posts/${first.id}/comments`, 'POST', { text: 'Only once', clientId: 'retry-comment' })).status, 200);
  const comments = await (await request(owner.cookie, `/api/posts/${first.id}/comments`)).json();
  assert.equal(comments.comments.length, 1);
});
