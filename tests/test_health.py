"""GET /api/health - Cloud Run's startup probe (rav.yaml gcp_deploy)."""

from backend import main


async def test_health_is_a_get_route_that_answers_without_the_database():
    route = next(r for r in main.app.routes if getattr(r, "path", None) == "/api/health")
    assert route.methods == {"GET"}
    # Called without the app's startup (database warm-up): it never needs the database.
    assert await route.endpoint() == {"ok": True}
