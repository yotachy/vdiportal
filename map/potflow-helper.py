#!/usr/bin/env python3
"""PotFlow 로컬 헬퍼 — 정적 서빙 + 재생/탐색/썸네일/문서저장."""
import os, sys, json, shutil, subprocess, hashlib, tempfile, math
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

def scan_tree(path):
    try:
        ap = os.path.abspath(path)
        if not os.path.isdir(ap):
            return {"ok": False, "error": "not a directory"}
        folders, files = [], []
        for name in sorted(os.listdir(ap), key=str.lower):
            fp = os.path.join(ap, name)
            if os.path.isdir(fp):
                folders.append({"name": name, "path": fp})
            elif os.path.splitext(name)[1].lower() in VIDEO_EXTS:
                try:
                    size = os.path.getsize(fp)
                except OSError:
                    size = 0
                files.append({"name": name, "path": fp, "size": size})
        parent = os.path.dirname(ap)
        return {"ok": True, "path": ap, "parent": parent if parent != ap else None,
                "folders": folders, "files": files}
    except OSError as e:
        return {"ok": False, "error": str(e)}

def thumb_path_for(video_path):
    h = hashlib.md5(video_path.encode("utf-8")).hexdigest()
    return os.path.join(THUMB_DIR, h + ".jpg")

def ffmpeg_thumb_cmd(ffmpeg, video_path, out):
    return [ffmpeg, "-y", "-ss", "5", "-i", video_path,
            "-frames:v", "1", "-vf", "scale=320:-1", out]

def get_thumb(video_path):
    out = thumb_path_for(video_path)
    if os.path.isfile(out) and os.path.getsize(out) > 0:
        with open(out, "rb") as f:
            return f.read(), ""
    ff = find_exe([FFMPEG_PATH])
    if not ff or not os.path.isfile(video_path):
        return None, "ffmpeg or video missing"
    os.makedirs(THUMB_DIR, exist_ok=True)
    # 동시 요청 레이스 방지: 고유 임시 파일에 쓰고 os.replace로 원자적 이동
    fd, tmp = tempfile.mkstemp(suffix=".jpg", dir=THUMB_DIR)
    os.close(fd)
    try:
        result = subprocess.run(ffmpeg_thumb_cmd(ff, video_path, tmp),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    except Exception as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return None, str(e)
    if result.returncode == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
        os.replace(tmp, out)
        with open(out, "rb") as f:
            return f.read(), ""
    try:
        if os.path.exists(tmp):
            os.remove(tmp)
    except OSError:
        pass
    return None, "thumb failed"

def tile_rects(n, screen_w, screen_h):
    n = max(1, n)
    if n == 1:
        return [(0, 0, screen_w, screen_h)]
    if n == 2:
        w = screen_w // 2
        return [(0, 0, w, screen_h), (w, 0, screen_w - w, screen_h)]
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    cw, ch = screen_w // cols, screen_h // rows
    rects = []
    for i in range(n):
        r, c = divmod(i, cols)
        x = c * cw
        y = r * ch
        # 마지막 열/행이 정수 나눗셈 나머지를 흡수 → 화면 전체 커버(우/하단 슬리버 없음)
        w = (screen_w - c * cw) if c == cols - 1 else cw
        h = (screen_h - r * ch) if r == rows - 1 else ch
        rects.append((x, y, w, h))
    return rects

def _screen_size():
    try:
        import ctypes
        u = ctypes.windll.user32
        return u.GetSystemMetrics(0), u.GetSystemMetrics(1)
    except Exception:
        return 1920, 1080

def arrange_windows(pids, rects):
    try:
        import ctypes, time
        from ctypes import wintypes
        u = ctypes.windll.user32
        time.sleep(1.2)  # 창이 뜰 시간
        want = {pid: rects[i] for i, pid in enumerate(pids) if i < len(rects)}
        placed = {}
        EnumProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def cb(hwnd, _):
            if not u.IsWindowVisible(hwnd):
                return True
            pid = wintypes.DWORD()
            u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value in want and pid.value not in placed:
                x, y, w, h = want[pid.value]
                u.SetWindowPos(hwnd, 0, x, y, w, h, 0x0040)  # SWP_SHOWWINDOW
                placed[pid.value] = True
            return True
        u.EnumWindows(EnumProc(cb), 0)
    except Exception:
        pass

def launch_players(paths):
    exe = find_exe([POTPLAYER_PATH])
    if not exe:
        return {"ok": False, "error": "PotPlayer not found"}
    valid = [p for p in paths if p and os.path.isfile(p)]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    sw, sh = _screen_size()
    rects = tile_rects(len(valid), sw, sh)
    pids = []
    for p in valid:
        try:
            proc = subprocess.Popen([exe, p])
            pids.append(proc.pid)
        except Exception:
            pass
    if os.name == "nt" and len(pids) > 1:
        import threading
        threading.Thread(target=arrange_windows, args=(pids, rects), daemon=True).start()
    return {"ok": True, "launched": len(pids)}

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
        if u.path == "/tree":
            qs = parse_qs(u.query)
            return self._send(200, scan_tree(qs.get("path", [ROOT])[0]))
        if u.path == "/thumb":
            qs = parse_qs(u.query)
            data, err = get_thumb(qs.get("path", [""])[0])
            if data:
                return self._send(200, data, "image/jpeg", raw=True)
            return self._send(404, {"ok": False, "error": err})
        # 정적 서빙
        rel = u.path.lstrip("/") or "potflow.html"
        fp = os.path.join(ROOT, rel)
        if os.path.isfile(fp) and os.path.commonpath([ROOT, os.path.abspath(fp)]) == ROOT:
            ctype = "text/html" if fp.endswith(".html") else "application/octet-stream"
            with open(fp, "rb") as f:
                return self._send(200, f.read(), ctype, raw=True)
        return self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) or b"{}"
        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
            return self._send(400, {"ok": False, "error": "invalid JSON body"})
        if not isinstance(body, dict):
            return self._send(400, {"ok": False, "error": "invalid JSON body"})
        if u.path == "/play":
            return self._send(200, launch_players(body.get("paths", [])))
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
