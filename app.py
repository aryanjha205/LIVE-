from flask import Flask, render_template, jsonify, request, session
import requests
import re
import os
import random
import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pymongo import MongoClient
from dotenv import load_dotenv

# Load local .env if present
load_dotenv()

# --- CONFIGURATION ---
# In root app.py, folders are adjacent
app = Flask(__name__, 
            template_folder='templates', 
            static_folder='static')
app.secret_key = os.getenv("SECRET_KEY", "DEFAULT_SECRET_FOR_DEV")

# MongoDB Setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("WARNING: MONGO_URI not found.")
    db = None
else:
    try:
        # User selection timeout helps identify connection issues immediately
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client['live_plus']
        # Preliminary check
        client.admin.command('ping')
    except Exception as e:
        print(f"DATABASE CONNECTION ERROR: {e}")
        db = None

# Define collections safely
users_col = db['users'] if db is not None else None
otps_col = db['otps'] if db is not None else None

# Email Setup Variables from Env
MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = "".join(os.getenv("MAIL_PASSWORD", "").split())
MAIL_SERVER = 'smtp.gmail.com'
MAIL_PORT = 587

PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u"

# Helper: Parse M3U
def parse_m3u(file_content):
    channels = []
    current_channel = {}
    extinf_re = re.compile(r'#EXTINF:(-?\d+)(.*),(.*)')
    logo_re = re.compile(r'tvg-logo="([^"]+)"')
    group_re = re.compile(r'group-title="([^"]+)"')
    lines = file_content.splitlines()
    for i in range(len(lines)):
        line = lines[i].strip()
        if line.startswith("#EXTINF:"):
            match = extinf_re.match(line)
            if match:
                current_channel["name"] = match.group(3).strip()
                logo_match = logo_re.search(line)
                current_channel["logo"] = logo_match.group(1) if logo_match else ""
                group_match = group_re.search(line)
                current_channel["group"] = group_match.group(1) if group_match else "General"
        elif line.startswith("http"):
            current_channel["url"] = line
            channels.append(current_channel)
            current_channel = {}
    return channels

# --- AUTH ROUTES ---

@app.route('/api/auth/send-otp', methods=['POST'])
def send_otp():
    try:
        if db is None: return jsonify({"error": "Config Error: MONGO_URI missing on Vercel"}), 503
        if not MAIL_USERNAME: return jsonify({"error": "Config Error: MAIL_USERNAME missing"}), 503
        
        email = request.json.get('email', '').strip().lower()
        if not email: return jsonify({"error": "Email is required"}), 400
        
        otp = str(random.randint(100000, 999999))
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
        
        otps_col.update_one({"_id": email}, {"$set": {"otp": otp, "expires_at": expires_at}}, upsert=True)
        
        # Using smtplib directly for stability in serverless environments
        try:
            msg = MIMEMultipart()
            msg['From'] = MAIL_USERNAME
            msg['To'] = email
            msg['Subject'] = f"Verification Code: {otp}"
            
            body = f"Your Live+ code: {otp}"
            html = render_template('otp_email.html', otp=otp)
            
            msg.attach(MIMEText(body, 'plain'))
            msg.attach(MIMEText(html, 'html'))
            
            server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
            server.set_debuglevel(1)
            server.starttls()
            server.login(MAIL_USERNAME, MAIL_PASSWORD)
            server.send_message(msg)
            server.quit()
            
            return jsonify({"message": "OTP sent successfully"})
        except Exception as e:
            print(f"SMTP ERROR: {e}")
            return jsonify({"error": f"Mail failed: {str(e)}"}), 500
            
    except Exception as e:
        print(f"GENERAL ERROR in send_otp: {e}")
        return jsonify({"error": f"General Error: {str(e)}"}), 500

@app.errorhandler(500)
def handle_500(e):
    return jsonify({"error": f"System 500 Error: {str(e)}"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({"error": f"Unhandled Exception: {str(e)}"}), 500

@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    try:
        if db is None: return jsonify({"error": "System Configuration Error: MONGO_URI missing on Vercel."}), 503
        email = request.json.get('email', '').strip().lower()
        otp = request.json.get('otp', '').strip()
        
        stored = otps_col.find_one({"_id": email})
        if not stored or str(stored.get('otp')) != otp:
             return jsonify({"error": "Invalid or expired OTP"}), 400
        
        # Ensure UTC comparison
        if stored.get('expires_at') < datetime.datetime.utcnow():
            return jsonify({"error": "OTP expired"}), 400
        
        user = users_col.find_one({"_id": email})
        if not user:
            user = {
                "_id": email,
                "name": email.split('@')[0],
                "bio": "Watching Live+",
                "avatar": f"https://api.dicebear.com/7.x/avataaars/svg?seed={email}",
                "favs": [],
                "created_at": datetime.datetime.utcnow()
            }
            users_col.insert_one(user)
        
        otps_col.delete_one({"_id": email})
        
        return jsonify({
            "message": "Login successful",
            "user": {
                "name": user.get('name', 'User'),
                "email": user.get('_id', email),
                "bio": user.get('bio', ''),
                "avatar": user.get('avatar', f"https://api.dicebear.com/7.x/avataaars/svg?seed={email}")
            }
        })
    except Exception as e:
        print(f"VERIFY OTP ERROR: {e}")
        return jsonify({"error": f"Verification Crash: {str(e)}"}), 500

@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    if db is None: return jsonify({"error": "Database unavailable"}), 503
    data = request.json
    email = data.get('email')
    if not email: return jsonify({"error": "Unauthorized"}), 401
    update_data = {
        "name": data.get('name'),
        "bio": data.get('bio'),
        "avatar": data.get('avatar')
    }
    users_col.update_one({"_id": email}, {"$set": update_data})
    return jsonify({"message": "Profile updated successfully"})

# --- MAIN ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/channels')
def get_channels():
    try:
        response = requests.get(PLAYLIST_URL, timeout=10)
        channels = parse_m3u(response.text)
        return jsonify(channels)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/service-worker.js')
def sw():
    return app.send_static_file('service-worker.js')

@app.route('/manifest.json')
def manifest():
    return app.send_static_file('manifest.json')

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, port=port)
