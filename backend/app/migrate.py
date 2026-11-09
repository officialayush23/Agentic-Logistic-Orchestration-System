"""Apply pending SQL migrations and the Buyer Shield demo config at startup.

Every file is idempotent (`if not exists` / upserts), and each migration is
recorded in `app_migrations`, so a restart never re-applies one. Which files
run is explicit (AUTO_MIGRATIONS): migrations applied before this runner
existed are left alone.
"""
from __future__ import annotations

import logging
import os
import pathlib

from .core import as_system, db_conn

log = logging.getLogger("disruptionops.migrate")
ROOT = pathlib.Path(__file__).resolve().parents[2] / "supabase"
AUTO = [m.strip() for m in os.getenv("AUTO_MIGRATIONS", "0011_paypal_finance_and_projects,0012_buyer_shield_and_agents,0013_chargebacks").split(",") if m.strip()]
SHIELD_SEED = ROOT / "seed_buyer_shield.sql"


async def run() -> list[str]:
    applied: list[str] = []
    async with as_system():
        async with db_conn() as conn:
            await conn.execute("""create table if not exists app_migrations (
                                      name text primary key, applied_at timestamptz not null default now())""")
            done = {r["name"] for r in await conn.fetch("select name from app_migrations")}
            for name in AUTO:
                if name in done:
                    continue
                f = ROOT / "migrations" / f"{name}.sql"
                if not f.exists():
                    log.warning("migration %s not found", f)
                    continue
                async with conn.transaction():
                    await conn.execute(f.read_text(encoding="utf-8"))
                    await conn.execute("insert into app_migrations (name) values ($1)", name)
                applied.append(name)
                log.info("applied migration %s", name)
            if applied or not await conn.fetchval("select exists (select 1 from bom_lines)"):
                await seed_shield(conn)
                applied.append("seed_buyer_shield")
    return applied


async def seed_shield(conn) -> None:
    if SHIELD_SEED.exists():
        await conn.execute(SHIELD_SEED.read_text(encoding="utf-8"))
