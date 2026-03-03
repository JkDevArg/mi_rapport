"""
Rapport Scheduler
Runs the hour registration automatically every Friday at 20:00 Peru time (UTC-5).
Uses APScheduler with the America/Lima timezone.
"""

import logging
import datetime
from typing import Callable

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

PERU_TZ = pytz.timezone("America/Lima")


class RapportScheduler:
    """
    Background scheduler that triggers the rapport registration
    every Friday at 20:00 Peru time.
    """

    def __init__(self, callback: Callable):
        """
        :param callback: Function to call on schedule trigger.
        """
        self._callback = callback
        self._scheduler = BackgroundScheduler(timezone=PERU_TZ)

    def start(self):
        """Configure and start the scheduler."""
        # Every Friday (day_of_week=4) at 20:00 Peru time
        trigger = CronTrigger(
            day_of_week="fri",
            hour=20,
            minute=0,
            second=0,
            timezone=PERU_TZ,
        )
        self._scheduler.add_job(
            func=self._run_job,
            trigger=trigger,
            id="rapport_weekly",
            name="Rapport Weekly Registration",
            replace_existing=True,
            misfire_grace_time=3600,  # Allow up to 1h late execution
        )
        self._scheduler.start()

        next_run = self._scheduler.get_job("rapport_weekly").next_run_time
        logger.info(f"Scheduler started. Next run: {next_run.strftime('%A %d/%m/%Y %H:%M %Z')}")

    def _run_job(self):
        """Execute the registered callback job."""
        now = datetime.datetime.now(tz=PERU_TZ)
        logger.info(f"⏰ Scheduler triggered at {now.strftime('%A %d/%m/%Y %H:%M %Z')}")
        try:
            self._callback()
        except Exception as exc:
            logger.error(f"Scheduler job failed: {exc}")

    def get_next_run(self) -> datetime.datetime | None:
        """Return the next scheduled run time."""
        job = self._scheduler.get_job("rapport_weekly")
        return job.next_run_time if job else None

    def stop(self):
        """Shutdown the scheduler."""
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("Scheduler stopped.")
