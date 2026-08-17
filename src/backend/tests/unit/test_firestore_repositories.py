"""Firestore repository behaviour, against an in-memory fake client.

The point is not to test Firestore — it is to test the code around it: the
bounding-box maths in `search_nearby`, the longitude refinement that Firestore
cannot do server-side, and the document/entity mapping on the way in and out.
None of that was covered, and all of it is arithmetic that can be silently wrong.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.domain.entities import Activity, Route, User
from src.domain.value_objects import Coordinates
from src.infrastructure.database.repositories import (
    FirestoreActivityRepository,
    FirestoreRouteRepository,
    FirestoreUserRepository,
)


# ── A minimal async Firestore stand-in ─────────────────────────────────────────


class FakeSnapshot:
    def __init__(self, data: dict | None):
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return self._data


class FakeDocument:
    def __init__(self, store: dict, doc_id: str):
        self._store = store
        self._id = doc_id

    async def get(self) -> FakeSnapshot:
        return FakeSnapshot(self._store.get(self._id))

    async def set(self, data: dict) -> None:
        self._store[self._id] = data

    async def delete(self) -> None:
        self._store.pop(self._id, None)


class FakeQuery:
    """Applies the same filters Firestore would, in memory."""

    def __init__(self, store: dict, filters: list | None = None):
        self._store = store
        self._filters = filters or []

    def where(self, filter=None):  # noqa: A002 - mirrors the Firestore signature
        return FakeQuery(self._store, [*self._filters, filter])

    def limit(self, n: int):
        return self

    @staticmethod
    def _read(doc: dict, path: str):
        value = doc
        for part in path.split("."):
            value = value.get(part) if isinstance(value, dict) else None
        return value

    def _matches(self, doc: dict) -> bool:
        for f in self._filters:
            actual = self._read(doc, f.field_path)
            op, expected = f.op_string, f.value
            if actual is None:
                return False
            if op == "==" and actual != expected:
                return False
            if op == ">=" and not actual >= expected:
                return False
            if op == "<=" and not actual <= expected:
                return False
        return True

    async def stream(self):
        for doc in list(self._store.values()):
            if self._matches(doc):
                yield FakeSnapshot(doc)


class FakeCollection:
    def __init__(self, store: dict):
        self._store = store

    def document(self, doc_id: str) -> FakeDocument:
        return FakeDocument(self._store, doc_id)

    def where(self, filter=None):  # noqa: A002
        return FakeQuery(self._store, [filter])

    def limit(self, n: int):
        return FakeQuery(self._store)

    async def stream(self):
        async for s in FakeQuery(self._store).stream():
            yield s


class FakeClient:
    def __init__(self):
        self.stores: dict[str, dict] = {}

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.stores.setdefault(name, {}))


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def db() -> FakeClient:
    return FakeClient()


def make_route(lat: float, lon: float, **kwargs) -> Route:
    defaults = dict(
        id=uuid4(),
        name="Route",
        activity_type="hike",
        distance=10000.0,
        elevation_gain=400.0,
        latitude=lat,
        longitude=lon,
        difficulty_score=50.0,
    )
    defaults.update(kwargs)
    return Route(**defaults)


# ── Route repository ───────────────────────────────────────────────────────────


class TestFirestoreRouteRepository:
    async def test_saved_route_round_trips_unchanged(self, db):
        repo = FirestoreRouteRepository(db)
        route = make_route(14.6, 121.0, name="Ridge Trail")

        await repo.save(route)
        loaded = await repo.get_by_id(route.id)

        assert loaded is not None
        assert loaded.id == route.id
        assert loaded.name == "Ridge Trail"
        assert loaded.latitude == pytest.approx(14.6)
        assert loaded.longitude == pytest.approx(121.0)

    async def test_missing_route_is_none_not_an_error(self, db):
        assert await FirestoreRouteRepository(db).get_by_id(uuid4()) is None

    async def test_deleted_route_is_gone(self, db):
        repo = FirestoreRouteRepository(db)
        route = make_route(14.6, 121.0)
        await repo.save(route)

        assert await repo.delete(route.id) is True
        assert await repo.get_by_id(route.id) is None

    async def test_search_nearby_finds_a_route_inside_the_radius(self, db):
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.600, 121.000, name="Close"))

        found = await repo.search_nearby(
            Coordinates(latitude=14.601, longitude=121.001), radius_meters=5000
        )
        assert [r.name for r in found] == ["Close"]

    async def test_search_nearby_excludes_a_route_outside_the_radius(self, db):
        """The bounding box is square and the radius is a circle, so the exact
        distance refinement in Python is what actually enforces the radius."""
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.6, 121.0, name="Near"))
        await repo.save(make_route(20.0, 121.0, name="Far"))

        found = await repo.search_nearby(
            Coordinates(latitude=14.6, longitude=121.0), radius_meters=10_000
        )
        assert [r.name for r in found] == ["Near"]

    async def test_search_nearby_refines_longitude_that_firestore_cannot_filter(
        self, db
    ):
        """Firestore allows a range filter on one field only, so latitude is
        filtered server-side and longitude in Python. A route at the same
        latitude but a distant longitude must still be excluded."""
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.6, 121.0, name="Here"))
        await repo.save(make_route(14.6, 130.0, name="East"))

        found = await repo.search_nearby(
            Coordinates(latitude=14.6, longitude=121.0), radius_meters=20_000
        )
        assert [r.name for r in found] == ["Here"]

    async def test_search_nearby_filters_by_activity_type(self, db):
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.6, 121.0, name="Hike", activity_type="hike"))
        await repo.save(make_route(14.6, 121.0, name="Bike", activity_type="bike"))

        found = await repo.search_nearby(
            Coordinates(latitude=14.6, longitude=121.0),
            radius_meters=10_000,
            activity_type="bike",
        )
        assert [r.name for r in found] == ["Bike"]

    async def test_search_nearby_applies_a_difficulty_ceiling(self, db):
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.6, 121.0, name="Easy", difficulty_score=20.0))
        await repo.save(make_route(14.6, 121.0, name="Brutal", difficulty_score=95.0))

        found = await repo.search_nearby(
            Coordinates(latitude=14.6, longitude=121.0),
            radius_meters=10_000,
            max_difficulty=50.0,
        )
        assert [r.name for r in found] == ["Easy"]

    async def test_search_nearby_honours_the_limit(self, db):
        repo = FirestoreRouteRepository(db)
        for i in range(10):
            await repo.save(make_route(14.6, 121.0, name=f"R{i}"))

        found = await repo.search_nearby(
            Coordinates(latitude=14.6, longitude=121.0), radius_meters=10_000, limit=3
        )
        assert len(found) == 3

    async def test_longitude_box_widens_toward_the_poles(self, db):
        """Meridians converge, so a fixed radius spans more degrees of longitude
        at high latitude. Without the cos(latitude) scaling, a high-latitude
        search would miss routes that are genuinely within range."""
        repo = FirestoreRouteRepository(db)
        # ~50 km east at latitude 60, where 1 degree of longitude is ~55 km.
        await repo.save(make_route(60.0, 0.9, name="North-east"))

        found = await repo.search_nearby(
            Coordinates(latitude=60.0, longitude=0.0), radius_meters=60_000
        )
        assert [r.name for r in found] == ["North-east"]

    async def test_get_by_name_returns_every_match(self, db):
        repo = FirestoreRouteRepository(db)
        await repo.save(make_route(14.6, 121.0, name="Twin"))
        await repo.save(make_route(15.0, 121.0, name="Twin"))
        await repo.save(make_route(15.0, 121.0, name="Other"))

        assert len(await repo.get_by_name("Twin")) == 2

    async def test_get_by_name_with_no_match_is_empty(self, db):
        assert await FirestoreRouteRepository(db).get_by_name("Nope") == []


# ── Activity repository ────────────────────────────────────────────────────────


class TestFirestoreActivityRepository:
    def _activity(self, user_id: UUID, **kwargs) -> Activity:
        defaults = dict(
            id=uuid4(),
            user_id=user_id,
            activity_type="run",
            start_date=datetime.now(UTC),
            distance=5000.0,
            duration=1800,
        )
        defaults.update(kwargs)
        return Activity(**defaults)

    async def test_saved_activity_round_trips(self, db):
        repo = FirestoreActivityRepository(db)
        uid = uuid4()
        act = self._activity(uid, distance=12345.0)

        await repo.save(act)
        loaded = await repo.get_by_id(act.id)

        assert loaded is not None
        assert loaded.id == act.id
        assert loaded.user_id == uid
        assert loaded.distance == pytest.approx(12345.0)

    async def test_missing_activity_is_none(self, db):
        assert await FirestoreActivityRepository(db).get_by_id(uuid4()) is None

    async def test_deleted_activity_is_gone(self, db):
        repo = FirestoreActivityRepository(db)
        act = self._activity(uuid4())
        await repo.save(act)

        await repo.delete(act.id)
        assert await repo.get_by_id(act.id) is None


# ── User repository ────────────────────────────────────────────────────────────


class TestFirestoreUserRepository:
    async def test_saved_user_round_trips(self, db):
        repo = FirestoreUserRepository(db)
        user = User(id=uuid4(), email="a@example.com", username="a")

        await repo.save(user)
        loaded = await repo.get_by_id(user.id)

        assert loaded is not None
        assert loaded.email == "a@example.com"
        assert loaded.username == "a"

    async def test_missing_user_is_none(self, db):
        assert await FirestoreUserRepository(db).get_by_id(uuid4()) is None

    async def test_deleted_user_is_gone(self, db):
        repo = FirestoreUserRepository(db)
        user = User(id=uuid4(), email="a@example.com", username="a")
        await repo.save(user)

        await repo.delete(user.id)
        assert await repo.get_by_id(user.id) is None
