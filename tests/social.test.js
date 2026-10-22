import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createPureServer } from '../server/index.js';

test('timeline, reels, comments, likes, profile bio and pure qr', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pure-social-test-'));
  const aiCalls = [];
  const { app, close } = createPureServer({
    dataDir: dir,
    scan: false,
    studioFetch: async (url, init={}) => {
      if (url.endsWith('/api/tags')) return new Response(JSON.stringify({models:[{name:'tiny-test',size:1}]}), {status:200,headers:{'Content-Type':'application/json'}});
      if (url.endsWith('/api/show')) return new Response(JSON.stringify({capabilities:['completion']}), {status:200,headers:{'Content-Type':'application/json'}});
      if (url.endsWith('/api/chat')) { aiCalls.push(JSON.parse(init.body).messages); return new Response(JSON.stringify({message:{content:'PURE AI ตอบกลับในไทม์ไลน์'}}), {status:200,headers:{'Content-Type':'application/json'}}); }
      throw Error('unexpected test request');
    },
    gemini: {
      scan: () => {},
      status: () => ({ configured: true }),
      generate: async () => ({ text: 'PURE AI ตอบกลับในไทม์ไลน์' })
    }
  });

  const http = createServer(app);
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const port = http.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Register User 1 & User 2
    const reg1 = await fetch(`${base}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'social_user1', name: 'User One', password: 'password123' })
    });
    assert.equal(reg1.status, 201);
    const cookie1 = reg1.headers.get('set-cookie');
    const u1 = (await reg1.json()).user;

    const reg2 = await fetch(`${base}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'social_user2', name: 'User Two', password: 'password123' })
    });
    assert.equal(reg2.status, 201);
    const cookie2 = reg2.headers.get('set-cookie');
    const u2 = (await reg2.json()).user;

    // 2. Test /api/qr generates a valid PNG
    const qrRes = await fetch(`${base}/api/qr`, { headers: { Cookie: cookie1 } });
    assert.equal(qrRes.status, 200);
    assert.equal(qrRes.headers.get('content-type'), 'image/png');
    const qrBuf = Buffer.from(await qrRes.arrayBuffer());
    assert.ok(qrBuf.length > 100);
    // Check PNG magic bytes: 137 80 78 71 (0x89 'P' 'N' 'G')
    assert.equal(qrBuf[0], 0x89);
    assert.equal(qrBuf[1], 0x50);
    assert.equal(qrBuf[2], 0x4e);
    assert.equal(qrBuf[3], 0x47);

    // 3. Test Bio update
    const bioRes = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
      body: JSON.stringify({ bio: 'Hello from PURE Timeline!' })
    });
    assert.equal(bioRes.status, 200);

    const profRes = await fetch(`${base}/api/profiles/${u1.id}`, { headers: { Cookie: cookie2 } });
    assert.equal(profRes.status, 200);
    const prof = (await profRes.json()).profile;
    assert.equal(prof.bio, 'Hello from PURE Timeline!');

    // 4. Test Create Text Post with AI
    const post1Form = new FormData();
    post1Form.append('text', 'สวัสดีไทม์ไลน์ PURE!');
    post1Form.append('ai', 'true');
    post1Form.append('clientId', 'client-post-1');

    const post1Res = await fetch(`${base}/api/posts`, {
      method: 'POST',
      headers: { Cookie: cookie1 },
      body: post1Form
    });
    assert.equal(post1Res.status, 201);
    const post1 = (await post1Res.json()).post;
    assert.equal(post1.text, 'สวัสดีไทม์ไลน์ PURE!');
    assert.equal(post1.kind, 'text');

    // 5. Test Feed listing
    const feedRes = await fetch(`${base}/api/posts`, { headers: { Cookie: cookie2 } });
    assert.equal(feedRes.status, 200);
    const feed = await feedRes.json();
    assert.ok(feed.posts.length >= 1);
    assert.equal(feed.posts[0].id, post1.id);

    // 6. Test Like Post
    const likeRes = await fetch(`${base}/api/posts/${post1.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: JSON.stringify({ liked: true })
    });
    assert.equal(likeRes.status, 200);
    const likedPost = (await likeRes.json()).post;
    assert.equal(likedPost.likes, 1);
    assert.equal(likedPost.liked, true);

    // 7. Test Comment Post and sender profile imagery.
    const commentAvatar = new FormData();
    commentAvatar.append('image', new Blob([Buffer.from([255,216,255,217])], {type:'image/jpeg'}), 'comment-avatar.jpg');
    assert.equal((await fetch(`${base}/api/profile/media/avatar`, {method:'POST',headers:{Cookie:cookie2},body:commentAvatar})).status, 200);
    const cmtRes = await fetch(`${base}/api/posts/${post1.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: JSON.stringify({ text: 'ยินดีด้วยครับ!', clientId: 'client-cmt-1' })
    });
    assert.equal(cmtRes.status, 200);

    const getCmts = await fetch(`${base}/api/posts/${post1.id}/comments`, { headers: { Cookie: cookie1 } });
    assert.equal(getCmts.status, 200);
    const cmts = await getCmts.json();
    assert.ok(cmts.comments.some(c => c.text === 'ยินดีด้วยครับ!'));
    const comment = cmts.comments.find(c => c.text === 'ยินดีด้วยครับ!');
    assert.match(comment.avatar, /\/media\/avatar/);
    const nestedCommentRes = await fetch(`${base}/api/posts/${post1.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
      body: JSON.stringify({ text: '@social_user2 ตอบกลับแล้ว', clientId: 'client-cmt-reply-1', parentId: comment.id })
    });
    assert.equal(nestedCommentRes.status, 200);
    const replyList = await (await fetch(`${base}/api/posts/${post1.id}/comments`, { headers: { Cookie: cookie2 } })).json();
    const reply = replyList.comments.find(c => c.text === '@social_user2 ตอบกลับแล้ว');
    assert.equal(reply.parent_id, comment.id);
    assert.equal(reply.replyTo.handle, 'social_user2');
    const contextualMention = await fetch(`${base}/api/posts/${post1.id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: JSON.stringify({ text: '@pure ช่วยตอบว่าชอบส่วนไหน?', clientId: 'contextual-pure-mention', parentId: comment.id })
    });
    assert.equal(contextualMention.status, 200);
    const contextualCall = aiCalls.at(-1);
    assert.ok(contextualCall.some(m => m.content === 'ช่วยตอบว่าชอบส่วนไหน?'));
    const aiContext = contextualCall.map(m => m.content).join('\n');
    assert.match(aiContext, /สวัสดีไทม์ไลน์ PURE!/);
    assert.match(aiContext, /@social_user2 ตอบกลับแล้ว/);
    assert.match(aiContext, /@pure ช่วยตอบว่าชอบส่วนไหน\?/);

    const followRes = await fetch(`${base}/api/profiles/${u1.id}/follow`, { method: 'POST', headers: { Cookie: cookie2 } });
    assert.equal(followRes.status, 200);
    const followedProfile = await (await fetch(`${base}/api/profiles/${u1.id}`, { headers: { Cookie: cookie2 } })).json();
    assert.equal(followedProfile.profile.followers, 1);
    assert.equal(followedProfile.profile.isFollowing, true);
    const unfollowRes = await fetch(`${base}/api/profiles/${u1.id}/follow`, { method: 'DELETE', headers: { Cookie: cookie2 } });
    assert.equal(unfollowRes.status, 200);
    assert.equal((await unfollowRes.json()).followers, 0);

    // Reactions are distinct per user and can be changed or removed.
    const react = async (path, reaction) => fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
      body: JSON.stringify({ reaction })
    });
    let reactionRes = await react(`/api/posts/${post1.id}/react`, 'love');
    assert.equal(reactionRes.status, 200);
    let reactedPost = (await reactionRes.json()).post;
    assert.equal(reactedPost.myReaction, 'love');
    assert.equal(reactedPost.reactions.find(r => r.reaction === 'love').count, 1);
    reactionRes = await react(`/api/posts/${post1.id}/react`, 'laugh');
    reactedPost = (await reactionRes.json()).post;
    assert.equal(reactedPost.myReaction, 'laugh');
    assert.equal(reactedPost.reactions.some(r => r.reaction === 'love'), false);
    reactionRes = await react(`/api/posts/${post1.id}/react`, null);
    reactedPost = (await reactionRes.json()).post;
    assert.equal(reactedPost.myReaction, null);

    const commentReactionRes = await react(`/api/posts/${post1.id}/comments/${comment.id}/react`, 'love');
    assert.equal(commentReactionRes.status, 200);
    const reactedComment = (await commentReactionRes.json()).comment;
    assert.equal(reactedComment.myReaction, 'love');
    assert.equal(reactedComment.reactions.find(r => r.reaction === 'love').count, 1);
    const commentAfterReaction = await (await fetch(`${base}/api/posts/${post1.id}/comments`, {headers:{Cookie:cookie1}})).json();
    assert.equal(commentAfterReaction.comments.find(c => c.id === comment.id).reactions.find(r => r.reaction === 'love').count, 1);

    // 8. Test Video Reel Upload with MP4 magic bytes
    const mp4Head = Buffer.alloc(32);
    mp4Head.writeUInt32BE(32, 0);
    mp4Head.write('ftyp', 4, 4, 'ascii');
    mp4Head.write('mp42', 8, 4, 'ascii');
    const reelBlob = new Blob([mp4Head], { type: 'video/mp4' });
    const reelForm = new FormData();
    reelForm.append('text', 'คลิปสั้นแรกบน PURE!');
    reelForm.append('clientId', 'client-reel-1');
    reelForm.append('media', reelBlob, 'test-reel.mp4');

    const reelRes = await fetch(`${base}/api/posts`, {
      method: 'POST',
      headers: { Cookie: cookie1 },
      body: reelForm
    });
    assert.equal(reelRes.status, 201);
    const reelPost = (await reelRes.json()).post;
    assert.equal(reelPost.kind, 'reel');
    assert.ok(reelPost.media.includes('/media'));

    // Verify media can be fetched
    const mediaRes = await fetch(`${base}${reelPost.media}`, { headers: { Cookie: cookie2 } });
    assert.equal(mediaRes.status, 200);
    assert.equal(mediaRes.headers.get('content-type'), 'video/mp4');

    // 9. Test Admin Privileges: Auto-accept friend & Direct messaging without prior friend status
    // Register User 3 (Admin) and User 4 (Regular)
    const regAdmin = await fetch(`${base}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'super_admin', name: 'Super Admin', password: 'password123' })
    });
    assert.equal(regAdmin.status, 201);
    const cookieAdmin = regAdmin.headers.get('set-cookie');
    const uAdmin = (await regAdmin.json()).user;

    // Promote uAdmin to admin in db
    const { run: dbRun } = app.locals.db || {};
    // If not on app.locals, promote via overview/role or direct update
    // We can also test user search
    const regNormal = await fetch(`${base}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'target_user', name: 'Target User', password: 'password123' })
    });
    assert.equal(regNormal.status, 201);
    const cookieNormal = regNormal.headers.get('set-cookie');
    const uNormal = (await regNormal.json()).user;

    // Test Search User (partial match by name or handle)
    const searchRes = await fetch(`${base}/api/users?q=target`, { headers: { Cookie: cookieAdmin } });
    assert.equal(searchRes.status, 200);
    const searchUsers = (await searchRes.json()).users;
    assert.ok(searchUsers.some(u => u.handle === 'target_user'));

    // Promote to admin in DB: update users set role='admin'
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(dir, 'pure.db'));
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(uAdmin.id);
    db.close();

    // Verify admin can add normal user with immediate 'accepted' status
    const addRes = await fetch(`${base}/api/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
      body: JSON.stringify({ id: uNormal.id })
    });
    assert.equal(addRes.status, 200);
    const addData = await addRes.json();
    assert.equal(addData.status, 'accepted');

    // Admin can message someone directly
    const msgRes = await fetch(`${base}/api/messages/${uNormal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
      body: JSON.stringify({ text: 'สวัสดีจากแอดมิน!', clientId: 'admin-msg-1' })
    });
    assert.equal(msgRes.status, 201);

    // Normal user can read and reply to admin without friendship restriction
    const replyRes = await fetch(`${base}/api/messages/${uAdmin.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieNormal },
      body: JSON.stringify({ text: 'สวัสดีครับแอดมิน!', clientId: 'user-reply-1' })
    });
    assert.equal(replyRes.status, 201);

    // 10. Test Delete Post
    const delRes = await fetch(`${base}/api/posts/${post1.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie1 }
    });
    assert.equal(delRes.status, 200);

    const delReelRes = await fetch(`${base}/api/posts/${reelPost.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie1 }
    });
    assert.equal(delReelRes.status, 200);

    const checkFeed = await fetch(`${base}/api/posts`, { headers: { Cookie: cookie2 } });
    const emptyFeed = await checkFeed.json();
    assert.equal(emptyFeed.posts.length, 0);

  } finally {
    await close();
    await new Promise(r => http.close(r));
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
