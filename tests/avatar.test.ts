// ============================================================================
// Signed-avatar reference tests.
//
// The `avatars` bucket is private, so every stored avatar reference must be
// normalized back to its Storage object path and re-signed with
// createSignedUrl() before it can render. These tests lock down the
// classification rules: storage references (public-style URLs, signed URLs,
// bare paths) are extracted; external/data URLs pass through; junk falls back.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avatarInitials, classifyAvatarRef, resolveLoginAvatar } from "../src/lib/avatar";

const UID = "11111111-2222-3333-4444-555555555555";

describe("classifyAvatarRef — storage references", () => {
  it("extracts the object path from a public-style storage URL", () => {
    const ref = `https://oltmnrkceodpyqznfhjb.supabase.co/storage/v1/object/public/avatars/${UID}/avatar.webp`;
    const result = classifyAvatarRef(ref);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.webp`);
    assert.equal(result.direct, null);
  });

  it("extracts the object path from a public-style URL with a query string", () => {
    const ref = `https://oltmnrkceodpyqznfhjb.supabase.co/storage/v1/object/public/avatars/${UID}/avatar.webp?foo=bar`;
    const result = classifyAvatarRef(ref);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.webp`);
  });

  it("re-signs the object path from an already-signed URL", () => {
    const ref = `https://oltmnrkceodpyqznfhjb.supabase.co/storage/v1/object/sign/avatars/${UID}/avatar.webp?token=abc123`;
    const result = classifyAvatarRef(ref);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.webp`);
  });

  it("accepts a bare avatars/<uid>/<file> path", () => {
    const result = classifyAvatarRef(`avatars/${UID}/avatar.png`);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.png`);
  });

  it("accepts a leading-slash avatars/<uid>/<file> path", () => {
    const result = classifyAvatarRef(`/avatars/${UID}/avatar.jpg`);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.jpg`);
  });

  it("accepts a public/avatars/<uid>/<file> path", () => {
    const result = classifyAvatarRef(`public/avatars/${UID}/avatar.jpg`);
    assert.equal(result.kind, "storage");
    assert.equal(result.path, `avatars/${UID}/avatar.jpg`);
  });

  it("rejects an empty storage path after extraction", () => {
    const result = classifyAvatarRef("https://x.supabase.co/storage/v1/object/public/avatars/");
    assert.equal(result.kind, "none");
  });
});

describe("classifyAvatarRef — direct references", () => {
  it("passes data URLs through untouched", () => {
    const ref = "data:image/png;base64,iVBORw0KGgo=";
    const result = classifyAvatarRef(ref);
    assert.equal(result.kind, "direct");
    assert.equal(result.direct, ref);
  });

  it("passes external https URLs through (Google avatar, preset images)", () => {
    const ref = "https://images.unsplash.com/photo-1535713875002?w=400";
    const result = classifyAvatarRef(ref);
    assert.equal(result.kind, "direct");
    assert.equal(result.direct, ref);
  });
});

describe("classifyAvatarRef — missing or junk", () => {
  it("returns none for null, undefined and empty strings", () => {
    for (const ref of [null, undefined, "", "   "]) {
      const result = classifyAvatarRef(ref);
      assert.equal(result.kind, "none");
      assert.equal(result.path, null);
      assert.equal(result.direct, null);
    }
  });

  it("returns none for unreadable values so surfaces render initials", () => {
    const result = classifyAvatarRef("not-a-real-reference");
    assert.equal(result.kind, "none");
  });
});

describe("avatarInitials", () => {
  it("returns the first letter uppercased", () => {
    assert.equal(avatarInitials("vikram"), "V");
    assert.equal(avatarInitials("Sabari VJ"), "S");
  });

  it("falls back to V for missing names", () => {
    assert.equal(avatarInitials(null), "V");
    assert.equal(avatarInitials(""), "V");
  });
});

describe("resolveLoginAvatar — server is authoritative", () => {
  const serverAvatar = "https://x.supabase.co/storage/v1/object/public/avatars/uid/avatar.webp";
  const cachedAvatar = "https://images.unsplash.com/photo-cached";
  const googleAvatar = "https://lh3.googleusercontent.com/photo-google";

  it("prefers the server-stored avatar over cache and Google metadata", () => {
    const result = resolveLoginAvatar({
      serverAvatarUrl: serverAvatar,
      cachedAvatar,
      googleAvatar,
      hasCachedAccount: true,
      defaultAvatar: "default",
    });
    assert.equal(result, serverAvatar);
  });

  it("does not let Google metadata overwrite a cached custom avatar when the server lookup fails", () => {
    const result = resolveLoginAvatar({
      serverAvatarUrl: null,
      cachedAvatar,
      googleAvatar,
      hasCachedAccount: true,
      defaultAvatar: "default",
    });
    assert.equal(result, cachedAvatar);
  });

  it("uses Google metadata only when there is no cached account at all", () => {
    const result = resolveLoginAvatar({
      serverAvatarUrl: null,
      cachedAvatar: "default",
      googleAvatar,
      hasCachedAccount: false,
      defaultAvatar: "default",
    });
    assert.equal(result, googleAvatar);
  });

  it("falls back to the default placeholder when nothing else exists", () => {
    const result = resolveLoginAvatar({
      serverAvatarUrl: null,
      cachedAvatar: null,
      googleAvatar: null,
      hasCachedAccount: false,
      defaultAvatar: "default",
    });
    assert.equal(result, "default");
  });

  it("uses the default placeholder for a cached account with no avatar instead of resurrecting Google", () => {
    const result = resolveLoginAvatar({
      serverAvatarUrl: null,
      cachedAvatar: null,
      googleAvatar,
      hasCachedAccount: true,
      defaultAvatar: "default",
    });
    assert.equal(result, "default");
  });
});
