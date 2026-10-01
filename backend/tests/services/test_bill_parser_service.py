from datetime import date
from typing import Any

import pytest

from app.services import bill_parser_service


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-09-30", date(2026, 9, 30)),
        ("30/09/2026", date(2026, 9, 30)),
        # Day-first: 11 December, not November 12.
        ("11/12/2026", date(2026, 12, 11)),
        ("30-09-2026", date(2026, 9, 30)),
        ("30.09.2026", date(2026, 9, 30)),
        ("30/09/26", date(2026, 9, 30)),
        (" 30/09/2026 ", date(2026, 9, 30)),
        (date(2026, 9, 30), date(2026, 9, 30)),
        # Only valid month-first - unreadable, never guessed.
        ("09/30/2026", None),
        ("31/31/2026", None),
        ("hier", None),
        (20260930, None),
        (None, None),
    ],
)
def test_parse_date(value: Any, expected: date | None) -> None:
    assert bill_parser_service._parse_date(value) == expected


def test_clean_nulls_replaces_null_strings_including_in_line_items() -> None:
    result: dict[str, Any] = {
        "invoice_number": "null",
        "payment_method": " None ",
        "address": "",
        "vendor_name_raw": "Intermarché",
        "total_amount": 7.34,
        "line_items": [{"description": "Pain", "common_name": "NULL", "line_total": 1.2}],
    }
    bill_parser_service._clean_nulls(result)
    assert result == {
        "invoice_number": None,
        "payment_method": None,
        "address": None,
        "vendor_name_raw": "Intermarché",
        "total_amount": 7.34,
        "line_items": [{"description": "Pain", "common_name": None, "line_total": 1.2}],
    }


def test_normalize_parser_result_caps_confidence_and_names_unreadable_dates() -> None:
    result = bill_parser_service._normalize_parser_result(
        {"issue_date": "31/31/2026", "due_date": "11/12/2026", "confidence": 0.95}
    )
    assert result["issue_date"] is None
    assert result["due_date"] == "2026-12-11"
    assert result["confidence"] == bill_parser_service.UNREADABLE_DATE_CONFIDENCE_CAP
    assert result["confidence"] < bill_parser_service.LOW_CONFIDENCE_FLOOR
    assert [entry["field"] for entry in result["uncertain_fields"]] == ["issue_date"]
    assert "31/31/2026" in result["uncertain_fields"][0]["reason"]
