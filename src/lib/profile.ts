import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { ProfileRecord } from "@/lib/types";

type ProfileRow = {
  display_name: string;
  title: string;
  bio: string;
  updated_at: string | null;
};

function toRecord(row: ProfileRow | undefined): ProfileRecord {
  if (!row) {
    return { displayName: "", title: "", bio: "", updatedAt: null };
  }
  return {
    displayName: row.display_name,
    title: row.title,
    bio: row.bio,
    updatedAt: row.updated_at,
  };
}

function parseProfileInput(input: {
  displayName: string;
  title: string;
  bio: string;
}): { displayName: string; title: string; bio: string } {
  const displayName = input.displayName.trim();
  const title = input.title.trim();
  const bio = input.bio.trim();
  if (!displayName) throw new Error("请填写显示名称");
  if (displayName.length > 40) throw new Error("显示名称最多 40 字");
  if (title.length > 40) throw new Error("头衔最多 40 字");
  if (bio.length > 200) throw new Error("简介最多 200 字");
  return { displayName, title, bio };
}

export const getProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProfileRecord> => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select display_name, title, bio, updated_at::text as updated_at
      from profiles
      where user_id = ${context.userId}
    `;
    return toRecord(rows[0]);
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseProfileInput)
  .handler(async ({ context, data }): Promise<ProfileRecord> => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      insert into profiles (user_id, display_name, title, bio, updated_at)
      values (${context.userId}, ${data.displayName}, ${data.title}, ${data.bio}, now())
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        title = excluded.title,
        bio = excluded.bio,
        updated_at = now()
      returning display_name, title, bio, updated_at::text as updated_at
    `;
    return toRecord(rows[0]);
  });
