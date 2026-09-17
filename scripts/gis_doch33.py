#!/usr/bin/env python3
"""
mg2.gis-net.co.il - Doch33 Report Scraper
Gets planning information (מידע תכנוני) HTML report for any parcel.
Works on all mg2.gis-net.co.il sites (NessZiona, Akko, etc.)

Install: pip install playwright
Setup:   playwright install chromium
Usage:
  python scripts/gis_doch33.py NessZiona 3636 208
  python scripts/gis_doch33.py Akko 10780 1
  python scripts/gis_doch33.py NessZiona 3636 208 --output C:\\reports
"""

import argparse
import json
import os
import time

from playwright.sync_api import sync_playwright


class GisDoch33:
    """Scraper for mg2.gis-net.co.il Doch33 planning reports"""

    BASE = "https://mg2.gis-net.co.il"

    def __init__(self, site_name, output_dir="output", headless=True):
        self.site_name = site_name
        self.gis_url = f"{self.BASE}/{site_name}Gis/"
        self.api_base = f"{self.BASE}/{site_name}Api"
        self.output_dir = output_dir
        self.headless = headless
        self.proj_id = None
        self.token = None
        self.session_id = None
        os.makedirs(output_dir, exist_ok=True)

    def run(self, gush, helka):
        """Full flow: open browser -> login -> search -> get report -> save HTML"""
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            self.page = browser.new_page()

            print(f"\n{'=' * 50}")
            print(f"  Site: {self.site_name} | Gush: {gush} | Helka: {helka}")
            print(f"{'=' * 50}\n")

            # Step 1: Load the GIS page (gets WAF cookies)
            print("[1] Loading GIS page...")
            self.page.goto(self.gis_url, wait_until="networkidle", timeout=30000)
            time.sleep(2)

            # Close any welcome dialogs
            self._close_dialogs()

            # Step 2: Read config from the page
            print("[2] Reading config...")
            self._read_config()

            # Step 3: Get token
            print("[3] Getting token...")
            self._get_token()

            # Step 4: Get map session
            print("[4] Getting map session...")
            self._get_session()

            # Step 5: Search by gush/helka
            print("[5] Searching gush/helka...")
            search_results = self._search(gush, helka)
            if not search_results:
                print("[!] No results found. Trying via UI...")
                search_results = self._search_via_ui(gush, helka)

            # Step 6: Get qId and report
            if search_results:
                saved = self._get_reports(search_results, gush, helka)
                print(f"\n[OK] Saved {len(saved)} report(s)")
                for report_path in saved:
                    print(f"     {report_path}")
            else:
                print("[!] No results found for this gush/helka")

            browser.close()

    def _close_dialogs(self):
        """Close any popup dialogs on the page"""
        try:
            # Click "אישור" (OK) button if present
            btn = self.page.locator("button:has-text('אישור')")
            if btn.count() > 0:
                btn.first.click()
                time.sleep(0.5)

            # Click "לא" (No) for restore dialog
            btn = self.page.locator("button:has-text('לא')")
            if btn.count() > 0:
                btn.first.click()
                time.sleep(0.5)
        except Exception:
            pass

    def _read_config(self):
        """Read projId and API URLs from app.config.json"""
        config = self.page.evaluate(
            """() => {
            return fetch(document.baseURI + 'assets/appConfig/app.config.json?v=15')
                .then(r => r.json())
                .then(c => ({
                    projId: c.projId,
                    mapApiUrl: c.mapApiUrl,
                    appApiUrl: c.appApiUrl,
                    authApiUrl: c.authApiUrl,
                    ProjName: c.ProjName
                }))
        }"""
        )

        self.proj_id = config["projId"]
        self.map_api = config.get("mapApiUrl", f"{self.api_base}/api/map/")
        self.app_api = config.get("appApiUrl", f"{self.api_base}/api/app/")
        self.auth_api = config.get("authApiUrl", f"{self.api_base}/api/auth/")
        print(f"     projId={self.proj_id}, name={config.get('ProjName', '?')}")

    def _get_token(self):
        """Get anonymous JWT token"""
        # First try: read from localStorage (page may have already logged in)
        self.token = self.page.evaluate(
            f"() => localStorage.getItem('{self.proj_id}_access_token')"
        )
        if self.token:
            print("     Token found in localStorage")
            return

        # Second try: AnonymousLogin
        result = self.page.evaluate(
            f"""() => {{
            return fetch('{self.auth_api}AnonymousLogin?projId={self.proj_id}')
                .then(r => r.text())
        }}"""
        )
        if result and not result.startswith("<!"):
            self.token = result.strip('"')
            print("     Token from AnonymousLogin")
            return

        # Third try: UserLogin with empty credentials
        result = self.page.evaluate(
            f"""() => {{
            return fetch('{self.auth_api}UserLogin', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{userName:'', userPassword:'', projId:{self.proj_id}}})
            }}).then(r => r.text())
        }}"""
        )
        if result and not result.startswith("<!"):
            self.token = result.strip('"')
            print("     Token from UserLogin")

        # Wait for page to get its own token
        if not self.token or self.token == '"IsLoginFailed"':
            time.sleep(3)
            self.token = self.page.evaluate(
                f"() => localStorage.getItem('{self.proj_id}_access_token')"
            )
            if self.token:
                print("     Token from localStorage (after wait)")

    def _get_session(self):
        """Get MapGuide session from FirstLoadingMap"""
        result = self.page.evaluate(
            f"""() => {{
            return fetch('{self.map_api}FirstLoadingMap', {{
                method: 'POST',
                headers: {{
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('{self.proj_id}_access_token')
                }},
                body: JSON.stringify({{projId:{self.proj_id}, MapSession:''}})
            }}).then(r => r.json())
        }}"""
        )

        if isinstance(result, dict) and "sessionId" in result:
            self.session_id = result["sessionId"]
            print(f"     Session: {self.session_id[:30]}...")

    def _search(self, gush, helka):
        """Search by gush/helka via API (runs inside browser to bypass WAF)"""
        # First get the search definition
        searches = self.page.evaluate(
            f"""() => {{
            return fetch('{self.app_api}GetAllSearches?projId={self.proj_id}', {{
                headers: {{'Authorization': 'Bearer ' + localStorage.getItem('{self.proj_id}_access_token')}}
            }}).then(r => r.json())
        }}"""
        )

        if not isinstance(searches, list):
            print(f"     GetAllSearches failed: {str(searches)[:100]}")
            return None

        # Find gush/helka search
        search_id = None
        search_form_name = None
        block_field = None
        parcel_field = None

        for search in searches:
            title = search.get("title", "")
            if "גוש" in title and "חלקה" in title:
                search_id = search["searchId"]
                form = search.get("dynamicForm", {})
                search_form_name = form.get("name", f"searches{search_id}")

                for row in form.get("rows", []):
                    for field in row.get("fields", []):
                        name = field.get("name", "").lower()
                        if "block" in name:
                            block_field = field["name"]
                        elif "parcel" in name:
                            parcel_field = field["name"]
                break

        if not search_id:
            print("     No gush/helka search found!")
            return None

        print(f"     searchId={search_id}, form={search_form_name}")
        print(f"     fields: {block_field}={gush}, {parcel_field}={helka}")

        # Make the search call FROM the browser (bypasses WAF)
        result = self.page.evaluate(
            f"""() => {{
            var body = {{
                searchId: {search_id},
                data: {{}}
            }};
            body.data['{search_form_name}'] = {{}};
            body.data['{search_form_name}']['{block_field}'] = '{gush}';
            body.data['{search_form_name}']['{parcel_field}'] = '{helka}';
            return fetch('{self.map_api}GetObjectsBySearch', {{
                method: 'POST',
                headers: {{
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('{self.proj_id}_access_token')
                }},
                body: JSON.stringify(body)
            }}).then(r => r.text())
              .then(t => {{
                  try {{ return JSON.parse(t); }}
                  catch {{ return t; }}
              }})
        }}"""
        )

        # Check if WAF blocked it
        if isinstance(result, str) and "DOCTYPE" in result:
            print("     WAF blocked search API call")
            return None

        if isinstance(result, str) and "error" in result.lower():
            print(f"     Search error: {result[:200]}")
            return None

        print(f"     Search returned: {str(result)[:100]}")
        return result

    def _search_via_ui(self, gush, helka):
        """Fallback: use the UI to search"""
        print("     Using UI navigation...")

        # Click on חיפושים
        self.page.click("text=חיפושים")
        time.sleep(1)

        # Click on גוש חלקה
        try:
            self.page.click("text=גוש חלקה")
            time.sleep(1)
        except Exception:
            print("     Could not find 'גוש חלקה' link")
            return None

        # Fill gush field
        gush_input = self.page.locator("input[placeholder='גוש']")
        if gush_input.count() == 0:
            gush_input = self.page.locator(
                "label:has-text('גוש') + div input, label:has-text('גוש') ~ input"
            )
        gush_input.first.fill(str(gush))
        time.sleep(0.5)

        # Fill helka field
        helka_input = self.page.locator("input[placeholder='חלקה']")
        if helka_input.count() == 0:
            helka_input = self.page.locator(
                "label:has-text('חלקה') + div input, label:has-text('חלקה') ~ input"
            )
        helka_input.first.fill(str(helka))
        time.sleep(0.5)

        # Click search button
        self.page.click("button:has-text('חיפוש')")
        time.sleep(3)

        # Click on "מידע תכנוני" if available
        try:
            self.page.click("text=מידע תכנוני", timeout=5000)
            time.sleep(2)
        except Exception:
            pass

        # Click on "דף מידע"
        try:
            # Wait for new tab (report opens in new tab)
            with self.page.context.expect_page(timeout=10000) as new_page_info:
                self.page.click("text=דף מידע", timeout=5000)

            new_page = new_page_info.value
            new_page.wait_for_load_state("networkidle")
            html = new_page.content()
            filename = f"Doch33_{self.site_name}_{gush}_{helka}.html"
            filepath = os.path.join(self.output_dir, filename)

            with open(filepath, "w", encoding="utf-8") as file:
                file.write(html)

            print(f"     Saved via UI: {filepath}")
            return [{"_saved_via_ui": filepath}]
        except Exception as exc:
            print(f"     UI method failed: {exc}")
            return None

    def _get_reports(self, results, gush, helka):
        """Get Doch33 report HTML for each result"""
        saved = []

        if isinstance(results, list) and len(results) > 0:
            if "_saved_via_ui" in results[0]:
                return [results[0]["_saved_via_ui"]]

        # Results can be various formats
        items = results if isinstance(results, list) else [results]

        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue

            # Try to get qId from GetLandUseObj
            q_id = None
            lu_result = self.page.evaluate(
                f"""() => {{
                return fetch('{self.app_api}GetLandUseObj', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('{self.proj_id}_access_token')
                    }},
                    body: JSON.stringify({json.dumps(item)})
                }}).then(r => r.text())
                  .then(t => {{ try {{ return JSON.parse(t); }} catch {{ return t; }} }})
            }}"""
            )

            if isinstance(lu_result, dict):
                q_id = lu_result.get("qId") or lu_result.get("QId") or lu_result.get("id")
                if not q_id:
                    # Look in nested structures
                    for key in ["lotsList", "lots", "items"]:
                        if key in lu_result and isinstance(lu_result[key], list):
                            for lot in lu_result[key]:
                                q_id = lot.get("qId") or lot.get("QId") or lot.get("id")
                                if q_id:
                                    break

            elif isinstance(lu_result, list) and lu_result:
                q_id = lu_result[0].get("qId") or lu_result[0].get("QId")

            # Also try directly from the search result
            if not q_id:
                q_id = item.get("qId") or item.get("QId") or item.get("id") or item.get("Id")

            # Try objectId as qId
            if not q_id:
                q_id = item.get("objectId") or item.get("ObjectId") or item.get("OBJECTID")

            if q_id:
                print(f"     qId={q_id} - getting report...")
                filepath = self._download_report(q_id, gush, helka, index)
                if filepath:
                    saved.append(filepath)
            else:
                print(f"     No qId found for item {index}")
                print(f"     LandUseObj response: {str(lu_result)[:200]}")

        return saved

    def _download_report(self, q_id, gush, helka, index=0):
        """Download Doch33 report HTML"""
        # GetDoch33Report returns a temp filename
        result = self.page.evaluate(
            f"""() => {{
            var url = '{self.app_api}GetDoch33Report'
                + '?qId={q_id}&qNum=&searchBy=lot'
                + '&ApplicantName=&RequestNumber=&ApplicantAddress='
                + '&SumPaid=&OrderNumber=&PaymentDate=&Warning=0'
                + '&projId={self.proj_id}';
            return fetch(url, {{
                headers: {{'Authorization': 'Bearer ' + localStorage.getItem('{self.proj_id}_access_token')}}
            }}).then(r => r.text())
        }}"""
        )

        if not result or "DOCTYPE" in result:
            print("     GetDoch33Report failed")
            return None

        # Result is a filename like "xxxDoch33.html"
        temp_file = result.strip('"').strip()
        if not temp_file.endswith(".html"):
            print(f"     Unexpected response: {temp_file[:100]}")
            return None

        # Download the HTML
        html_url = f"{self.api_base}/TempFiles/{temp_file}"
        html = self.page.evaluate(
            f"""() => {{
            return fetch('{html_url}').then(r => r.text())
        }}"""
        )

        if not html or "waf_reject" in html:
            print("     Failed to download HTML")
            return None

        # Save
        suffix = f"_{index}" if index > 0 else ""
        filename = f"Doch33_{self.site_name}_{gush}_{helka}{suffix}.html"
        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as file:
            file.write(html)

        return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Download Doch33 planning reports from mg2.gis-net.co.il"
    )
    parser.add_argument("site", help="Site name (e.g. NessZiona, Akko, HofAshkelon)")
    parser.add_argument("gush", help="Block number (גוש)")
    parser.add_argument("helka", help="Parcel number (חלקה)")
    parser.add_argument("--output", default="output", help="Output directory")
    parser.add_argument("--visible", action="store_true", help="Show browser window")

    args = parser.parse_args()
    scraper = GisDoch33(args.site, args.output, headless=not args.visible)
    scraper.run(args.gush, args.helka)


if __name__ == "__main__":
    main()
