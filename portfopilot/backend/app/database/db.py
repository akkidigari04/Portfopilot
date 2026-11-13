import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

ROOT = Path(__file__).resolve().parents[3]
DB_URL = os.getenv("PORTFOPILOT_DB", f"sqlite:///{ROOT / 'data/generated/portfopilot.db'}")


class Base(DeclarativeBase):
    pass


def make_engine(url: str = DB_URL, **kw):
    eng = create_engine(url, connect_args={"check_same_thread": False}, **kw)

    @event.listens_for(eng, "connect")
    def _fk(conn, _):
        cur = conn.cursor(); cur.execute("PRAGMA foreign_keys=ON"); cur.close()
    return eng


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
