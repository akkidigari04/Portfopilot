import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from backend.app.data.generator import generate
from backend.app.database.db import make_engine, get_db


@pytest.fixture(scope="session")
def built(tmp_path_factory):
    d = tmp_path_factory.mktemp("gen")
    r = generate("test", 20261022, d / "g", d / "gt")
    return r


@pytest.fixture()
def db(built):
    eng = make_engine(f"sqlite:///{built['db_path']}")
    s = sessionmaker(bind=eng, expire_on_commit=False)()
    yield s
    s.close(); eng.dispose()


@pytest.fixture()
def client(built, monkeypatch):
    from backend.app.main import app
    eng = make_engine(f"sqlite:///{built['db_path']}"); S = sessionmaker(bind=eng, expire_on_commit=False)

    def _db():
        s = S()
        try: yield s
        finally: s.close()
    app.dependency_overrides[get_db] = _db
    yield TestClient(app)
    app.dependency_overrides.clear(); eng.dispose()


def make_inp(**kw):
    inp = {"portfolio_id": "PORT-INV-000001-01", "risk_category": "Balanced", "as_of": date(2026, 10, 22), "cash": 10000.0,
           "holdings": {"INS-000001": 600, "INS-000002": 300},
           "targets": {"Equity": 50.0, "Fixed Income": 40.0, "Real Estate": 0, "Commodities": 0, "Alternatives": 0, "Cash": 10.0},
           "instruments": {"INS-000001": {"asset_class": "Equity", "liquidity_tier": "High", "restricted": False, "symbol": "EQ1", "name": "Eq1"},
                           "INS-000002": {"asset_class": "Fixed Income", "liquidity_tier": "High", "restricted": False, "symbol": "FI1", "name": "Fi1"},
                           "INS-000003": {"asset_class": "Equity", "liquidity_tier": "High", "restricted": False, "symbol": "EQ2", "name": "Eq2"},
                           "INS-000004": {"asset_class": "Fixed Income", "liquidity_tier": "High", "restricted": False, "symbol": "FI2", "name": "Fi2"}},
           "prices": {i: {"price": 100.0, "date": date(2026, 10, 22)} for i in ("INS-000001", "INS-000002", "INS-000003", "INS-000004")}}
    inp.update(kw); return inp
