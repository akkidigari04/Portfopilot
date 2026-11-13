from datetime import datetime
from backend.app.models.models import AuditEvent


def log_event(db, event_type, entity_type, entity_id, actor="system", portfolio_id=None, payload=None, now=None):
    """Append-only audit write (DB triggers block UPDATE/DELETE)."""
    ev = AuditEvent(event_type=event_type, entity_type=entity_type, entity_id=entity_id, actor=actor,
                    portfolio_id=portfolio_id, payload=payload or {}, created_at=now or datetime.utcnow())
    db.add(ev)
    return ev
