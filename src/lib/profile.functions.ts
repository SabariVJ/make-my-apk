import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SavedProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  updatedAt: string;
}

export interface SaveProfileInput {
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  avatarUrl?: string | null;
  avatarChanged?: boolean;
}

/** Persist the authenticated user's editable profile fields through the
 * database RPC. The RPC validates the avatar namespace and never accepts XP,
 * membership or role fields from the client. */
export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SaveProfileInput) => input)
  .handler(async ({ context, data }): Promise<SavedProfile> => {
    // The generated types intentionally lag additive SQL migrations; this RPC
    // has a fixed, audited output shape and is safe to cast locally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data: rows, error } = await client.rpc("svj_update_my_profile", {
      p_display_name: data.displayName,
      p_username: data.username,
      p_bio: data.bio ?? null,
      p_location: data.location ?? null,
      p_avatar_url: data.avatarUrl ?? null,
      p_avatar_changed: data.avatarChanged ?? false,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error("Your profile could not be saved. Please retry.");
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      location: row.location,
      updatedAt: row.updated_at,
    };
  });
