from flask import Flask, render_template, jsonify, request, session
import requests
import re
import os
import random
import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
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
channels_col = db['channels'] if db is not None else None

# Email Setup Variables from Env
MAIL_USERNAME = os.getenv("MAIL_USERNAME")
MAIL_PASSWORD = "".join(os.getenv("MAIL_PASSWORD", "").split())
MAIL_SERVER = 'smtp.gmail.com'
MAIL_PORT = 587

PLAYLIST_URL = "https://iptv-org.github.io/iptv/countries/in.m3u"
CHANNELS_CACHE = []
CACHE_TIME = 0

# Helper: Parse M3U
def parse_m3u(file_content):
    channels = []
    lines = file_content.splitlines()
    current = {}
    
    for line in lines:
        line = line.strip()
        if not line: continue
        
        if line.startswith("#EXTINF:"):
            # Robust parsing for logo and group
            current = {"logo": "", "group": "General", "name": "Unnamed", "headers": {}}
            
            # Extract attributes using regex
            logo_match = re.search(r'tvg-logo="([^"]+)"', line)
            if logo_match: current["logo"] = logo_match.group(1)
            
            group_match = re.search(r'group-title="([^"]+)"', line)
            if group_match: current["group"] = group_match.group(1).split(';')[0].strip()
            
            # Name is always after the last comma
            parts = line.split(',')
            if len(parts) > 1:
                current["name"] = parts[-1].strip()
        
        elif line.startswith("#EXTVLCOPT:"):
            # Handle user-agent and referer options
            ua_match = re.search(r'http-user-agent=([^ ]+)', line)
            if ua_match and current:
                current["headers"]["User-Agent"] = ua_match.group(1)
            ref_match = re.search(r'http-referrer=([^ ]+)', line)
            if ref_match and current:
                current["headers"]["Referer"] = ref_match.group(1)
                
        elif line.startswith("http") and current:
            # Filter for HTTPS to prevent mixed content issues on Vercel/HTTPS
            if line.startswith("https://"):
                current["url"] = line
                if current["name"] != "Unnamed":
                    channels.append(current)
            current = {}
            
    return channels

# --- AUTH ROUTES ---

@app.route('/api/auth/send-otp', methods=['POST'])
def send_otp():
    try:
        if db is None: return jsonify({"error": "Config Error: MONGO_URI missing on Vercel"}), 503
        if not MAIL_USERNAME: return jsonify({"error": "Config Error: MAIL_USERNAME missing"}), 503
        if not MAIL_PASSWORD: return jsonify({"error": "Config Error: MAIL_PASSWORD missing"}), 503
        
        email = request.json.get('email', '').strip().lower()
        if not email: return jsonify({"error": "Email is required"}), 400
        
        otp = str(random.randint(100000, 999999))
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
        
        otps_col.update_one({"_id": email}, {"$set": {"otp": otp, "expires_at": expires_at}}, upsert=True)
        
        # Using smtplib directly for stability in serverless environments
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = f"Live+ <{MAIL_USERNAME}>"
            msg['To'] = email
            msg['Subject'] = f"{otp} is your Live+ verification code"
            
            body = f"Your Live+ verification code: {otp}\n\nThis code expires in 10 minutes."
            html = render_template('otp_email.html', otp=otp)
            
            msg.attach(MIMEText(body, 'plain'))
            msg.attach(MIMEText(html, 'html'))
            
            server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
            server.set_debuglevel(1)
            server.starttls()
            server.login(MAIL_USERNAME, MAIL_PASSWORD)
            server.send_message(msg)
            server.quit()
            
            print(f"OTP SUCCESSFULLY SENT TO: {email}")
            return jsonify({"message": "OTP sent successfully"})
        except Exception as e:
            print(f"SMTP ERROR for {email}: {e}")
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
        is_new_user = False
        if not user:
            is_new_user = True
            user = {
                "_id": email,
                "name": email.split('@')[0],
                "bio": "Watching Live+",
                "age": "",
                "avatar": f"https://api.dicebear.com/7.x/avataaars/svg?seed={email}",
                "favs": [],
                "created_at": datetime.datetime.utcnow()
            }
            users_col.insert_one(user)
        
        otps_col.delete_one({"_id": email})
        
        return jsonify({
            "message": "Login successful",
            "is_new_user": is_new_user,
            "user": {
                "name": user.get('name', 'User'),
                "email": user.get('_id', email),
                "bio": user.get('bio', ''),
                "age": user.get('age', ''),
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
        "age": data.get('age'),
        "avatar": data.get('avatar')
    }
    users_col.update_one({"_id": email}, {"$set": update_data})
    return jsonify({"message": "Profile updated successfully"})

# --- MAIN ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('icon-192.png')

@app.route('/api/channels')
def get_channels():
    global CHANNELS_CACHE, CACHE_TIME
    try:
        now = time.time()
        
        # 1. Check local global cache (fastest)
        if CHANNELS_CACHE and (now - CACHE_TIME < 300): # 5 mins locally
            return jsonify(CHANNELS_CACHE)

        # 2. Check MongoDB cache (persistent across Vercel cold starts)
        if channels_col is not None:
            cache_doc = channels_col.find_one({"_id": "cache"})
            if cache_doc:
                last_update = cache_doc.get('time', 0)
                # If cache is valid (less than 1 hour old)
                if (now - last_update < 3600) and cache_doc.get('data'):
                    CHANNELS_CACHE = cache_doc['data']
                    CACHE_TIME = last_update
                    return jsonify(CHANNELS_CACHE)
        
        # 3. If no cache or cache expired, fetch from source
        print("Fetching fresh channels from source...")
        response = requests.get(PLAYLIST_URL, timeout=15)
        if not response.ok:
             if CHANNELS_CACHE: return jsonify(CHANNELS_CACHE)
             return jsonify([{"name": "Server Maintenance", "group": "System", "url": "", "logo": ""}])
            
        parsed = parse_m3u(response.text)
        if not parsed:
             if CHANNELS_CACHE: return jsonify(CHANNELS_CACHE)
             return jsonify([{"name": "Unavailable", "group": "System", "url": "", "logo": ""}])
             
        CHANNELS_CACHE = parsed[:1000]
        CACHE_TIME = now
        
        # Update MongoDB for next cold start
        if channels_col is not None:
            channels_col.update_one(
                {"_id": "cache"}, 
                {"$set": {"data": CHANNELS_CACHE, "time": CACHE_TIME}}, 
                upsert=True
            )
            
        return jsonify(CHANNELS_CACHE)
    except Exception as e:
        print(f"FETCH ERROR: {e}")
        if CHANNELS_CACHE: return jsonify(CHANNELS_CACHE)
        return jsonify({"error": "Gateway Timeout. Please reload app."}), 500

@app.route('/service-worker.js')
def sw():
    return app.send_static_file('service-worker.js')

@app.route('/manifest.json')
def manifest():
    return app.send_static_file('manifest.json')

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, port=port)
