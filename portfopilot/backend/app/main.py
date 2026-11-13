from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.routes import router
from backend.app.database.db import engine, Base
from backend.app.models import models  # noqa: F401

app = FastAPI(title="PortfoPilot API", version="1.0.0",
              description="Educational portfolio rebalancing simulation. Not financial advice.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
Base.metadata.create_all(engine)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
