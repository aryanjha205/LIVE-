from flask import Flask, render_template, jsonify, request
import requests
import re

app = Flask(__name__)

# URL of the M3U playlist
PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u"

def parse_m3u(file_content):
    channels = []
    current_channel = {}
    
    # Regex for parsing EXTINF metadata
    # Format: #EXTINF:-1 tvg-id="..." tvg-logo="..." group-title="...",Channel Name
    extinf_re = re.compile(r'#EXTINF:(-?\d+)(.*),(.*)')
    # Regex for key-value pairs in EXTINF: tvg-logo="url"
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
                current_channel["logo"] = logo_match.group(1) if logo_match else "https://via.placeholder.com/150?text=TV"
                
                group_match = group_re.search(line)
                current_channel["group"] = group_match.group(1) if group_match else "General"
                
        elif line.startswith("http"):
            current_channel["url"] = line
            channels.append(current_channel)
            current_channel = {}
            
    return channels

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
    app.run(debug=True, port=5000)
