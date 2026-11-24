import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"

# Fake data the mock backend will hand back, shaped exactly like Code.gs's
# real responses, so every page's render function gets real-looking input.
SAMPLE_ANALYSIS = {
    "overallScore": 61,
    "categories": {
        "alignment": {"score": 70, "severity": "mild", "summary": "Slight crowding on lower front teeth."},
        "decayCavities": {"score": 55, "severity": "moderate", "summary": "Possible early decay on a molar."},
        "gumHealth": {"score": 60, "severity": "mild", "summary": "Slight redness near the gumline."},
        "enamelWear": {"score": 75, "severity": "mild", "summary": "Minor wear on biting edges."},
        "stainingColor": {"score": 50, "severity": "moderate", "summary": "Noticeable yellowing."},
    },
    "rootCanalRiskFlag": True,
    "rootCanalRiskNote": "A dark discoloration on the lower-left molar is worth having checked soon.",
    "detectedIssues": ["Visible plaque buildup near gumline", "Mild yellow staining"],
    "recommendedProductTags": ["whitening kit", "sensitivity toothpaste"],
    "professionalAdviceNote": "This is an AI screening, not a diagnosis.",
    "photoQualityWarning": None,
}

SAMPLE_QUESTIONS = [
    {"id": "age", "text": "What is your age?", "type": "number", "options": [], "category": "age",
     "dependsOnId": "", "dependsOnValue": "", "active": True, "order": 1},
    {"id": "gum_bleeding", "text": "Do your gums bleed when you brush or floss?", "type": "single_choice",
     "options": ["Never", "Sometimes", "Often"], "category": "gum_bleeding", "dependsOnId": "", "dependsOnValue": "", "active": True, "order": 2},
    {"id": "root_canal", "text": "Have you ever had a root canal treatment?", "type": "yes_no", "options": [],
     "category": "root_canal_history", "dependsOnId": "", "dependsOnValue": "", "active": True, "order": 3},
    {"id": "root_canal_detail", "text": "Which tooth, and roughly how long ago?", "type": "text", "options": [],
     "category": "root_canal_detail", "dependsOnId": "root_canal", "dependsOnValue": "Yes", "active": True, "order": 4},
]

SAMPLE_ANSWERS = [
    {"questionId": "age", "text": "What is your age?", "value": "29"},
    {"questionId": "gum_bleeding", "text": "Do your gums bleed when you brush or floss?", "value": "Often"},
    {"questionId": "root_canal", "text": "Have you ever had a root canal treatment?", "value": "Yes"},
    {"questionId": "root_canal_detail", "text": "Which tooth, and roughly how long ago?", "value": "Lower left molar, 2 years ago"},
]

SAMPLE_LEAD = {
    "leadId": "lead123",
    "timestamp": "2026-09-21T10:00:00.000Z",
    "name": "Jane Test",
    "phone": "+911234567890",
    "email": "jane@test.com",
    "refSource": "insta",
    "photoUrls": [],
    "oralHealthScore": 61,
    "analysis": SAMPLE_ANALYSIS,
    "assessmentAnswers": SAMPLE_ANSWERS,
    "riskScore": 56,
    "temperature": "hot",
    "status": "new",
    "notes": "",
}

SAMPLE_SETTINGS = {
    "brandName": "Bright Smile Dental",
    "adminUsername": "admin",
    "openaiConfigured": True,
    "openaiModel": "gpt-4o",
    "driveFolderUrl": "https://drive.google.com/drive/folders/fake",
    "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/fake",
}

SAMPLE_LINKS = [{"code": "insta", "label": "Instagram bio", "createdAt": "2026-09-20T00:00:00.000Z"}]


def make_handler(route, request):
    body = json.loads(request.post_data or "{}")
    action = body.get("action")
    payload = body.get("payload") or {}
    resp = {"ok": True}

    if action == "ping":
        resp = {"ok": True}
    elif action == "getBrand":
        resp = {"brandName": "Bright Smile Dental"}
    elif action == "getPublicQuestions":
        resp = {"questions": SAMPLE_QUESTIONS}
    elif action == "analyze":
        resp = {"analysisToken": "tok123", "analysis": SAMPLE_ANALYSIS, "oralHealthScore": 61}
    elif action == "submit":
        resp = {"leadId": "lead123"}
    elif action == "getReport":
        resp = {"lead": SAMPLE_LEAD}
    elif action == "adminLogin":
        if payload.get("username") == "admin" and payload.get("password") == "changeme123":
            resp = {"token": "faketoken.sig", "username": "admin"}
        else:
            resp = {"error": "Invalid username or password."}
    elif action == "adminMe":
        resp = {"authenticated": True, "username": "admin"}
    elif action == "getLeads":
        resp = {"leads": [SAMPLE_LEAD]}
    elif action == "updateLead":
        resp = {"ok": True}
    elif action == "getAdminQuestions":
        resp = {"questions": SAMPLE_QUESTIONS}
    elif action == "saveQuestions":
        resp = {"ok": True}
    elif action == "getSettings":
        resp = {"settings": SAMPLE_SETTINGS}
    elif action == "saveSettings":
        resp = {"settings": SAMPLE_SETTINGS}
    elif action == "testOpenAIKey":
        resp = {"ok": True}
    elif action == "getLinks":
        resp = {"links": SAMPLE_LINKS}
    elif action == "saveLink":
        resp = {"links": SAMPLE_LINKS}
    elif action == "deleteLink":
        resp = {"links": []}
    elif action == "changeAdminAccount":
        resp = {"settings": SAMPLE_SETTINGS, "errors": None}
    else:
        resp = {"error": "Unknown action in mock: " + str(action)}

    route.fulfill(status=200, content_type="application/json", body=json.dumps(resp))


def run():
    errors_by_page = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def test_page(path, pre_js=None, label=None):
            label = label or path
            page = browser.new_page()
            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: console_errors.append("PAGEERROR: " + str(exc)))
            page.route("**/mock-api", make_handler)

            # serve a fake config.js pointing at our mock endpoint instead of the real one
            page.route(
                "**/assets/js/config.js",
                lambda route: route.fulfill(
                    status=200, content_type="application/javascript",
                    body="window.APP_CONFIG = { API_URL: '%s/mock-api' };" % BASE
                )
            )
            if pre_js:
                page.add_init_script(pre_js)
            page.goto(BASE + "/" + path, wait_until="networkidle")
            page.wait_for_timeout(500)
            errors_by_page[label] = console_errors
            page.close()

        # public pages
        test_page("index.html")
        test_page("test.html")
        test_page("report.html?id=lead123")

        # admin pages (inject a fake token so requireAdminAuth() passes)
        admin_pre = "localStorage.setItem('dental_admin_token','faketoken.sig');"
        test_page("admin-login.html")
        test_page("admin-dashboard.html", admin_pre)
        test_page("admin-lead.html?id=lead123", admin_pre)
        test_page("admin-questions.html", admin_pre)
        test_page("admin-links.html", admin_pre)
        test_page("admin-settings.html", admin_pre)

        browser.close()

    ok = True
    for label, errs in errors_by_page.items():
        if errs:
            ok = False
            print("❌ %s" % label)
            for e in errs:
                print("     " + e)
        else:
            print("✅ %s" % label)
    sys.exit(0 if ok else 1)


run()
