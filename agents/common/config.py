"""Runtime configuration, read from the environment (see .env.example).

Credentials are never defaulted to a placeholder that would let a fetch "succeed"
against nothing. A missing key raises at the point of use with an error naming
exactly where to go get it — a silent fall back to sample data is the specific
failure mode this Phase 1 slice exists to rule out.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class MissingCredential(RuntimeError):
    """Raised when an agent needs a key that hasn't been configured."""


@dataclass(frozen=True)
class _Credential:
    env_var: str
    signup_url: str
    what_for: str

    def require(self) -> str:
        value = os.environ.get(self.env_var, "").strip()
        if not value:
            raise MissingCredential(
                f"{self.env_var} is not set — needed for {self.what_for}.\n"
                f"Get one (free) at: {self.signup_url}\n"
                f"Then add it to .env at the repo root."
            )
        return value

    def is_set(self) -> bool:
        return bool(os.environ.get(self.env_var, "").strip())


DATA_GOV_IN = _Credential(
    env_var="DATA_GOV_IN_API_KEY",
    signup_url="https://www.data.gov.in/ (register, then My Account -> API key)",
    what_for="CPCB real-time AQI, the primary air quality source",
)

AQICN = _Credential(
    env_var="AQICN_TOKEN",
    signup_url="https://aqicn.org/data-platform/token/",
    what_for="AQICN station AQI, the gap-filler where no CPCB station is nearby",
)

OPENAQ = _Credential(
    env_var="OPENAQ_API_KEY",
    signup_url="https://explore.openaq.org/register",
    what_for="the 30-day historical trend (neither CPCB nor AQICN serve history)",
)


def database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://neighbour:neighbour@localhost:5433/neighbour_trust",
    )


# H3 resolution 9 per docs/strategy.md. At India's latitudes a res-9 cell is
# roughly 0.1 km² — about a city block, which is the grain a buyer thinks in
# ("this street" vs "this suburb") and fine enough that a locality is a handful
# of cells rather than one.
H3_RESOLUTION = 9
