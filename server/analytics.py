"""
Shared PostHog analytics client.

Initialise once at import time; call posthog_client.shutdown() on app exit.
"""

import atexit

from posthog import Posthog

from . import config

posthog_client: Posthog | None = None

if config.POSTHOG_PROJECT_TOKEN:
    posthog_client = Posthog(
        api_key=config.POSTHOG_PROJECT_TOKEN,
        host=config.POSTHOG_HOST,
        enable_exception_autocapture=True,
    )
    atexit.register(posthog_client.shutdown)
