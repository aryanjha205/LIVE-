from flask import Flask, render_template, jsonify, request, session
import requests
import re
import os
import random
import datetime
from pymongo import MongoClient
from flask_mail import Mail, Message

from dotenv import load_dotenv

# Load local .env if present
load_dotenv()

# --- CONFIGURATION ---
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')
app.secret_key = os.getenv("SECRET_KEY", "DEFAULT_SECRET_FOR_DEV")

# MongoDB Setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("WARNING: MONGO_URI not found in environment variables.")
    client = None
    db = None
else:
    client = MongoClient(MONGO_URI)
    db = client['live_plus']
    users_col = db['users']
    otps_col = db['otps']

# Email Setup
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_DEFAULT_SENDER'] = os.getenv("MAIL_USERNAME")

mail = Mail(app)

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
    if not db: return jsonify({"error": "System Configuration Error: MONGO_URI missing on Vercel."}), 503
    email = request.json.get('email', '').strip().lower()
    if not email: return jsonify({"error": "Email is required"}), 400
    
    otp = str(random.randint(100000, 999999))
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
    
    # Store OTP (overwrite if exists)
    otps_col.update_one({"_id": email}, {"$set": {"otp": otp, "expires_at": expires_at}}, upsert=True)
    
    try:
        msg = Message("Live+ Verification Code", recipients=[email])
        msg.body = f"Your verification code for Live+ is: {otp}. It will expire in 10 minutes."
        msg.html = render_template('otp_email.html', otp=otp)
        mail.send(msg)
        return jsonify({"message": "OTP sent successfully"})
    except Exception as e:
        print(f"Mail Error: {e}")
        return jsonify({"error": "Failed to send email"}), 500

@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    if not db: return jsonify({"error": "System Configuration Error: MONGO_URI missing on Vercel."}), 503
    email = request.json.get('email', '').strip().lower()
    otp = request.json.get('otp', '').strip()
    
    stored = otps_col.find_one({"_id": email})
    if not stored or stored['otp'] != otp:
        return jsonify({"error": "Invalid or expired OTP"}), 400
    
    if stored['expires_at'] < datetime.datetime.utcnow():
        return jsonify({"error": "OTP expired"}), 400
    
    # Check if user exists, create if not
    user = users_col.find_one({"_id": email})
    if not user:
        user = {
            "_id": email,
            "name": email.split('@')[0],
            "bio": "Watching Live+",
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=" + email,
            "favs": [],
            "created_at": datetime.datetime.utcnow()
        }
        users_col.insert_one(user)
    
    # Cleanup OTP
    otps_col.delete_one({"_id": email})
    
    return jsonify({
        "message": "Login successful",
        "user": {
            "name": user['name'],
            "email": user['_id'],
            "bio": user.get('bio', ''),
            "avatar": user.get('avatar', '')
        }
    })

@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    data = request.json
    email = data.get('email') # Should be from session in real app
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
