"""
Rapport HTTP Client
Handles authentication and hour registration via SAP OData API.
Uses Playwright for full browser automation to obtain session cookies.
"""

import datetime
import logging
import os
import time
from typing import Optional

from playwright.sync_api import sync_playwright, Page, BrowserContext

logger = logging.getLogger(__name__)

BASE_URL = "https://intranet.seidor.es"
LOGIN_URL = f"{BASE_URL}/sap/bc/ui2/flp#ZRAPPORTS_ENTRADA-display&/CopiarDias"
ODATA_URL = f"{BASE_URL}/sap/opu/odata/sap/ZSRV_RAPP_SRV/Z_SAVE_RAP_HSet"

# Fixed payload fields (now handled in RapportClient)
# Constants removed in favor of instance variables



def _hours_to_sap_duration(hours: int) -> str:
    """Convert integer hours to SAP duration format: P00DT08H00M00S"""
    return f"P00DT{hours:02d}H00M00S"


class RapportClient:
    """
    Client that uses Playwright to:
    1. Log into the Seidor intranet
    2. Capture session cookies + SAP passport
    3. Send POST requests to register hours via OData
    """

    def __init__(self, username: str, password: str, headless: bool = True, pernr: str = None, posid: str = None, descr: str = None):
        self.username = username
        self.password = password
        self.headless = headless
        
        # Use provided values or fall back to env or defaults
        self.pernr = pernr or os.getenv("PERNR", "65001734")
        self.posid = posid or os.getenv("POSID", "X19-80_CIESUR-OUT_003")
        self.descr = descr or os.getenv("DESCR", "Desarrollo y análisis de migración en diferentes proyectos, pivoteo con otros clientes.")

        self._playwright = None
        self._browser = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

        self._sap_passport: Optional[str] = None
        self._x_csrf_token: Optional[str] = None
        
        # Session cache path
        self.session_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs", f"session_{username}.json")

    # ──────────────────────────────────────────────
    # Persistence
    # ──────────────────────────────────────────────

    def _save_session(self):
        """Save cookies and CSRF token to a local file."""
        if not self._context:
            return
        
        try:
            state = {
                "cookies": self._context.cookies(),
                "token": self._x_csrf_token,
                "timestamp": time.time()
            }
            os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
            import json
            with open(self.session_file, "w") as f:
                json.dump(state, f)
            logger.info("Session saved to local storage.")
        except Exception as e:
            logger.error(f"Error saving session: {e}")

    def _load_session(self) -> bool:
        """Load cookies and CSRF token from local file. Returns True if loaded."""
        if not os.path.exists(self.session_file):
            return False
        
        try:
            import json
            with open(self.session_file, "r") as f:
                state = json.load(f)
            
            # Check for expiration (e.g., 12 hours)
            if time.time() - state.get("timestamp", 0) > 12 * 3600:
                logger.info("Cached session expired.")
                return False

            self._x_csrf_token = state.get("token")
            cookies = state.get("cookies", [])
            
            if not self._playwright:
                self._playwright = sync_playwright().start()
                self._browser = self._playwright.chromium.launch(headless=self.headless)
                
            self._context = self._browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/145.0.0.0 Safari/537.36"
                ),
                locale="es",
                timezone_id="America/Lima",
            )
            self._context.add_cookies(cookies)
            self._page = self._context.new_page()
            
            logger.info("Session loaded from local storage.")
            return True
        except Exception as e:
            logger.error(f"Error loading session: {e}")
            return False

    # ──────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────

    def login(self, force: bool = False):
        """Launch browser, log in, and capture required session data."""
        if not force and self._load_session():
            # Quick check if token is still valid by doing a small request
            try:
                # We can't easily check if the token is valid without a request.
                # We'll just trust the loaded session and retry if it fails in register_day.
                return
            except:
                pass

        logger.info(f"Starting Playwright login (headless={self.headless})...")
        if not self._playwright:
            self._playwright = sync_playwright().start()
        if not self._browser:
            self._browser = self._playwright.chromium.launch(
                headless=self.headless,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
        if not self._context:
            self._context = self._browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/145.0.0.0 Safari/537.36"
                ),
                locale="es",
                timezone_id="America/Lima",
            )
        if not self._page:
            self._page = self._context.new_page()

        logger.info("Navigating to login page...")
        self._page.goto(BASE_URL, wait_until="networkidle", timeout=60000)

        # check if already logged in (no username field)
        try:
            self._page.wait_for_selector("#USERNAME_FIELD-inner", timeout=5000)
            # Fill username
            logger.info("Filling credentials...")
            self._page.fill("#USERNAME_FIELD-inner", self.username)
            self._page.fill("#PASSWORD_FIELD-inner", self.password)

            # Click login button
            self._page.click(".sapMBtnContent.sapMLabelBold.sapUiSraDisplayBeforeLogin")
            logger.info("Login button clicked, waiting for navigation...")
            
            # Wait for Fiori Launchpad to load
            self._page.wait_for_load_state("networkidle", timeout=60000)
            time.sleep(3)  # Extra safety margin
        except:
            logger.info("Already logged in or login form not found.")

        # Navigate to the rapport page
        logger.info("Navigating to Rapport page...")
        self._page.goto(LOGIN_URL, wait_until="networkidle", timeout=60000)
        time.sleep(2)

        # Fetch CSRF token
        self._fetch_csrf_token()
        
        # Save session
        self._save_session()

        logger.info("Login successful.")

    def _fetch_csrf_token(self):
        """Fetch SAP CSRF token via a HEAD/GET request on the service document."""
        logger.info("Fetching CSRF token...")
        service_url = f"{BASE_URL}/sap/opu/odata/sap/ZSRV_RAPP_SRV/"
        response = self._page.request.get(
            service_url,
            headers={"x-csrf-token": "Fetch"},
        )
        self._x_csrf_token = response.headers.get("x-csrf-token")
        logger.info(f"CSRF token obtained: {self._x_csrf_token[:20] if self._x_csrf_token else 'None'}...")

    def register_day(self, date: datetime.date, hours: int = 8, description: str = None, retry: bool = True) -> bool:
        """
        Register hours for a single day by POSTing to the OData endpoint.

        Returns True on success, False on failure.
        """
        if not self._page:
            # Try loading session first if not logged in
            if not self._load_session():
                raise RuntimeError("Client not logged in. Call login() first.")

        date_str = f"{date.isoformat()}T00:00:00"
        duration = _hours_to_sap_duration(hours)
        final_descr = description or self.descr

        payload = {
            "IDatum": date_str,
            "IPernr": self.pernr,
            "ICopy": " ",
            "Z_SAVE_RAP_R": [],
            "Z_SAVE_RAP_P": [
                {
                    "Pernr": self.pernr,
                    "Usr": "",
                    "Datai1": date_str,
                    "Pos": "",
                    "Posid": self.posid,
                    "Refint": "",
                    "Subp": "",
                    "Tare": "",
                    "Ttar": "",
                    "Divi": "",
                    "Modul": "",
                    "Desp": "T",
                    "Situacion": "",
                    "Dura": duration,
                    "Descr": final_descr,
                    "Tip": "ZI",
                    "Luga": "",
                    "Emp": "",
                    "Km": "000000",
                    "Kmco": "0.0000",
                    "Importkm": "0.000",
                    "Auto": "0",
                    "Diet": "0",
                    "Avio": "0",
                    "Hotel": "0",
                    "Tren": "0",
                    "Taxi": "0",
                    "Park": "0",
                    "Otros": "0",
                    "Otrt": "",
                    "Total": "0.00",
                    "Waers": "EUR",
                    "Vernr": "",
                    "Verna": "",
                    "Kunnr": "",
                    "Name": "",
                    "Modificable": "",
                }
            ],
        }

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "dataserviceversion": "2.0",
            "maxdataserviceversion": "2.0",
            "x-requested-with": "XMLHttpRequest",
            "x-xhr-logon": 'accept="iframe,strict-window,window"',
            "origin": BASE_URL,
            "referer": f"{BASE_URL}/sap/bc/ui2/flp/?sap-client=100&sap-language=ES",
        }

        if self._x_csrf_token:
            headers["x-csrf-token"] = self._x_csrf_token

        logger.info(f"POSTing registration for {date.isoformat()}...")

        try:
            response = self._page.request.post(
                ODATA_URL,
                data=payload,
                headers=headers,
            )

            status = response.status
            logger.info(f"Response status: {status}")

            if status in (200, 201, 204):
                logger.info(f"Day {date.isoformat()} registered successfully.")
                return True
            elif status in (401, 403, 400) and retry:
                logger.warning(f"Registration failed with {status}. Attempting re-login and retry...")
                self.login(force=True)
                # Retry once
                return self.register_day(date, hours, description, retry=False)
            else:
                body = response.text()
                logger.error(f"Failed to register {date.isoformat()}: {status} — {body[:200]}")
                return False

        except Exception as exc:
            logger.error(f"Exception registering {date.isoformat()}: {exc}")
            if retry:
                logger.warning("Attempting re-login after exception...")
                self.login(force=True)
                return self.register_day(date, hours, description, retry=False)
            return False

    def close(self):
        """Clean up Playwright resources."""
        if self._page:
            try:
                self._page.close()
            except:
                pass
        if self._context:
            try:
                self._context.close()
            except:
                pass
        if self._browser:
            try:
                self._browser.close()
            except:
                pass
        if self._playwright:
            try:
                self._playwright.stop()
            except:
                pass
        logger.info("Browser session closed.")

