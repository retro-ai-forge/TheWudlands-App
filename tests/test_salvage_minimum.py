"""Worn-item salvage minimum (backend/recycling.py resolve_salvage_preview,
data/item-conditions.json "salvageMinimum"): a damaged or broken item whose
recipe holds more than that condition's minRawUnits raw units gives back at
least `units` of its most common raw material, even when the condition
penalty leaves nothing."""

import pytest

from backend import item_condition, recycling

CHARACTER = {"profession": {}, "gear": {"items": []}, "crafting": {}}
MINIMUM = item_condition.SALVAGE_MINIMUM
TIER = 2


def _preview(family, condition, count=1):
    return recycling.resolve_salvage_preview(family, TIER, CHARACTER, {}, [], count, condition=condition)


def _family(low: int, high: float) -> str:
    """The first recipe whose raw total per item is above `low` and at most `high`."""
    for family in sorted(recycling._RECIPES_BY_FAMILY):
        try:
            total = sum(m.total_units for m in _preview(family, "new"))
        except ValueError:
            continue
        if low < total <= high:
            return family
    raise AssertionError(f"no recipe with {low} < raw <= {high}")


@pytest.mark.parametrize("condition", ["damaged", "broken"])
def test_a_big_enough_recipe_gives_at_least_one_of_its_most_common_raw(condition):
    rule = MINIMUM[condition]
    materials = _preview(_family(rule["minRawUnits"], float("inf")), condition)
    common = max(materials, key=lambda m: m.total_units)
    assert common.recovered_units >= rule["units"]
    assert all(m.minimum_bonus == 0 for m in materials if m is not common)
    assert recycling.flatten_recovery(materials)  # something to hand back


@pytest.mark.parametrize("condition", ["damaged", "broken"])
def test_a_small_recipe_gets_no_minimum(condition):
    materials = _preview(_family(0, MINIMUM[condition]["minRawUnits"]), condition)
    assert all(m.minimum_bonus == 0 for m in materials)


def test_thresholds_are_15_for_damaged_and_50_for_broken():
    assert MINIMUM["damaged"] == {"minRawUnits": 15, "units": 1}
    assert MINIMUM["broken"] == {"minRawUnits": 50, "units": 1}
    # a recipe between the two: damaged gets the minimum, broken does not
    family = _family(15, 50)
    assert any(m.minimum_bonus for m in _preview(family, "damaged"))
    assert not any(m.minimum_bonus for m in _preview(family, "broken"))


def test_new_and_used_items_get_no_minimum():
    family = _family(MINIMUM["broken"]["minRawUnits"], float("inf"))
    for condition in ("new", "used"):
        assert all(m.minimum_bonus == 0 for m in _preview(family, condition))


def test_minimum_counts_per_item():
    family = _family(MINIMUM["broken"]["minRawUnits"], float("inf"))
    common = max(_preview(family, "broken", count=3), key=lambda m: m.total_units)
    assert common.recovered_units >= 3


def test_a_higher_yield_is_not_cut_back(monkeypatch):
    family = _family(MINIMUM["broken"]["minRawUnits"], float("inf"))
    monkeypatch.setattr(recycling, "resolve_yield", lambda *a, **k: recycling.YieldBreakdown(25, 30, 30, 6))
    common = max(_preview(family, "broken"), key=lambda m: m.total_units)
    assert common.minimum_bonus == 0 and common.recovered_units > 1
