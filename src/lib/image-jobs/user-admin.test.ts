import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { listAdminUserQuotas } from "./user-admin.ts";

function toSql(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  const sql = (async <T>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1] ?? ""}`;
    }
    return run<T>(text, values);
  }) as Sql;
  sql.query = run;
  return sql;
}

const NOW = Date.parse("2026-11-19T04:00:00.000Z");
const YESTERDAY = Date.parse("2026-11-18T04:00:00.000Z");

async function seed() {
  const pg = new PGlite();
  await pg.exec(`
    create table "user" (
      "id" text primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" boolean not null,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );
    create table "session" (
      "id" text primary key,
      "updatedAt" timestamptz not null,
      "userId" text not null references "user" ("id")
    );
    create table image_jobs (
      user_id text,
      created_at timestamptz
    );
    create table user_daily_caps (
      user_id text primary key references "user" ("id"),
      cap integer not null
    );
    create table user_boost_balances (
      user_id text primary key references "user" ("id"),
      balance integer not null
    );
    create table image_quota_days (
      user_id text not null,
      beijing_day date not null,
      used integer not null default 0,
      primary key (user_id, beijing_day)
    );
    create table user_boost_ledger (
      id bigserial primary key,
      user_id text not null references "user" ("id"),
      kind text not null,
      amount integer not null,
      created_at timestamptz not null,
      admin_id text,
      note text not null default ''
    );
  `);
  const users: Array<[string, string, string]> = [
    ["u-boost", "100%_off", "boost@ex.com"],
    ["u-wild", "100XXoff", "wild@ex.com"],
    ["u-under", "a_b", "under@ex.com"],
    ["u-letter", "axb", "letter@ex.com"],
    ["u-pack", "加量", "pack@ex.com"],
    ["u-plain", "plain", "plain@ex.com"],
  ];
  for (const [id, name, email] of users) {
    await pg.query(
      `insert into "user" ("id", "name", "email", "emailVerified") values ($1, $2, $3, false)`,
      [id, name, email],
    );
  }
  await pg.query(
    `insert into image_quota_days (user_id, beijing_day, used) values ('u-boost', '2026-11-19', 2)`,
  );
  await pg.query(
    `insert into user_boost_ledger (user_id, kind, amount, created_at, admin_id, note)
     values
       ('u-boost', 'debit', 3, to_timestamp($1), null, 'job_today'),
       ('u-boost', 'debit', 4, to_timestamp($2), null, 'job_yesterday'),
       ('u-boost', 'grant', 9, to_timestamp($1), 'admin-1', '试用客户'),
       ('u-pack', 'debit', 1, to_timestamp($1), null, 'job_pack')`,
    [NOW / 1000, YESTERDAY / 1000],
  );
  return toSql(pg);
}

describe("admin user list", () => {
  it("counts today's 加量包 debits in 今日用量, and not grants or yesterday", async () => {
    const sql = await seed();
    const users = await listAdminUserQuotas(sql, {
      query: "",
      now: NOW,
      globalCap: 30,
    });
    const used = Object.fromEntries(users.map((user) => [user.id, user.used]));
    assert.equal(used["u-boost"], 5);
    assert.equal(used["u-pack"], 1);
    assert.equal(used["u-plain"], 0);
  });

  it("treats % and _ in a name or email search as literals", async () => {
    const sql = await seed();
    const percent = await listAdminUserQuotas(sql, {
      query: "100%_",
      now: NOW,
      globalCap: 30,
    });
    assert.deepEqual(
      percent.map((user) => user.id),
      ["u-boost"],
    );
    const underscore = await listAdminUserQuotas(sql, {
      query: "_",
      now: NOW,
      globalCap: 30,
    });
    assert.deepEqual(
      underscore.map((user) => user.id).sort(),
      ["u-boost", "u-under"],
    );
  });
});
