#!/usr/bin/env python3
"""
TutorBase local dev server
Run: python3 serve.py
Then open: http://localhost:3000
On your phone: http://YOUR_COMPUTER_IP:3000
"""
import http.server, socketserver, os, sys

PORT = 3000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Required for PWA service worker scope
        self.send_header('Service-Worker-Allowed', '/')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, format, *args):
        pass  # Suppress request logs

print(f"\n  TutorBase is running!")
print(f"  Local:   http://localhost:{PORT}")
print(f"\n  To open on your phone:")
print(f"  1. Make sure your phone is on the same Wi-Fi")

# Try to get local IP
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    ip = s.getsockname()[0]
    s.close()
    print(f"  2. Open http://{ip}:{PORT} in Safari (iPhone) or Chrome (Android)")
except:
    print(f"  2. Find your computer's IP and open http://YOUR_IP:{PORT}")

print(f"\n  Press Ctrl+C to stop\n")

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
