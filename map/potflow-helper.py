#!/usr/bin/env python3
"""PotFlow 로컬 헬퍼 — 정적 서빙 + 재생/탐색/썸네일/문서저장."""
import os, sys, json, shutil, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ── CONFIG ────────────────────────────────────────────────
PORT = 8770
POTPLAYER_PATH = os.environ.get("POTPLAYER_PATH") or r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
FFMPEG_PATH = os.environ.get("FFMPEG_PATH") or "ffmpeg"
ROOT = os.path.dirname(os.path.abspath(__file__))
THUMB_DIR = os.path.join(ROOT, "potflow_thumbs")
DATA_FILE = os.path.join(ROOT, "potflow_data.json")
VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".flv", ".m4v", ".ts", ".mpg", ".mpeg"}

def find_exe(candidates):
    for c in candidates:
        if not c:
            continue
        if os.path.isabs(c) and os.path.isfile(c):
            return c
        w = shutil.which(c)
        if w:
            return w
    return None

def ping_payload():
    return {
        "ok": True,
        "potplayer": find_exe([POTPLAYER_PATH]) is not None,
        "ffmpeg": find_exe([FFMPEG_PATH]) is not None,
    }

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json", raw=False):
        data = body if raw else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/ping":
            return self._send(200, ping_payload())
        # 정적 서빙
        rel = u.path.lstrip("/") or "potflow.html"
        fp = os.path.join(ROOT, rel)
        if os.path.isfile(fp) and os.path.commonpath([ROOT, os.path.abspath(fp)]) == ROOT:
            ctype = "text/html" if fp.endswith(".html") else "application/octet-stream"
            with open(fp, "rb") as f:
                return self._send(200, f.read(), ctype, raw=True)
        return self._send(404, {"ok": False, "error": "not found"})

    def log_message(self, *a):
        pass

def make_server(port):
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)

if __name__ == "__main__":
    os.makedirs(THUMB_DIR, exist_ok=True)
    srv = make_server(PORT)
    print(f"PotFlow helper: http://localhost:{PORT}/potflow.html")
    srv.serve_forever()
