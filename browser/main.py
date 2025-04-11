# server.py
import uuid
from flask import Flask, request, jsonify, Response, send_file
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

app = Flask(__name__)

# In‑memory store of browser sessions
sessions = {}

def get_driver():
    opts = Options()
    opts.headless = True
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)

@app.route('/session', methods=['POST'])
def create_session():
    """Start a new headless‐Chrome session."""
    driver = get_driver()
    session_id = str(uuid.uuid4())
    sessions[session_id] = driver
    return jsonify({"session_id": session_id})

@app.route('/navigate', methods=['POST'])
def navigate():
    """
    JSON: { session_id: str, url: str }
    """
    data = request.get_json()
    driver = sessions.get(data['session_id'])
    if not driver:
        return jsonify({"error": "Invalid session"}), 400
    driver.get(data['url'])
    return jsonify({"status": "ok"})

@app.route('/click', methods=['POST'])
def click():
    """
    JSON: { session_id: str, selector: str }
    """
    data = request.get_json()
    driver = sessions.get(data['session_id'])
    if not driver:
        return jsonify({"error": "Invalid session"}), 400
    el = driver.find_element(By.CSS_SELECTOR, data['selector'])
    el.click()
    return jsonify({"status": "ok"})

@app.route('/input', methods=['POST'])
def send_keys():
    """
    JSON: { session_id: str, selector: str, text: str }
    """
    data = request.get_json()
    driver = sessions.get(data['session_id'])
    if not driver:
        return jsonify({"error": "Invalid session"}), 400
    el = driver.find_element(By.CSS_SELECTOR, data['selector'])
    el.clear()
    el.send_keys(data['text'])
    return jsonify({"status": "ok"})

@app.route('/render', methods=['GET'])
def render_html():
    """
    Query string: ?session_id=...
    Returns the current page_source
    """
    session_id = request.args.get('session_id')
    driver = sessions.get(session_id)
    if not driver:
        return "Invalid session", 400
    return Response(driver.page_source, mimetype='text/html')

@app.route('/screenshot', methods=['GET'])
def screenshot():
    """
    Query string: ?session_id=...
    Returns a PNG screenshot
    """
    session_id = request.args.get('session_id')
    driver = sessions.get(session_id)
    if not driver:
        return "Invalid session", 400
    png = driver.get_screenshot_as_png()
    return Response(png, mimetype='image/png')

@app.route('/quit', methods=['POST'])
def quit_session():
    """
    JSON: { session_id: str }
    """
    data = request.get_json()
    driver = sessions.pop(data['session_id'], None)
    if not driver:
        return jsonify({"error": "Invalid session"}), 400
    driver.quit()
    return jsonify({"status": "quit"})

@app.route('/')
def index():
    return send_file('templates/index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
