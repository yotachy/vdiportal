#!/usr/bin/env python3
"""PotFlow 로컬 헬퍼 — 정적 서빙 + 재생/탐색/썸네일/문서저장."""
import os, sys, json, shutil, subprocess, hashlib, tempfile, math, base64, threading
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
SEARCH_ROOTS = []

# ── 재생 세션 추적 ────────────────────────────────────────
_PLAY_SEQ = 0
PLAYS = {}
_PLAYS_LOCK = threading.Lock()

def _register_play(procs, video):
    global _PLAY_SEQ
    with _PLAYS_LOCK:
        _PLAY_SEQ += 1
        token = str(_PLAY_SEQ)
        PLAYS[token] = {"procs": procs, "done": False, "video": video}
    def waiter():
        for p in procs:
            try:
                p.wait()
            except Exception:
                pass
        with _PLAYS_LOCK:
            if token in PLAYS:
                PLAYS[token]["done"] = True
    threading.Thread(target=waiter, daemon=True).start()
    return token

def play_done(token):
    with _PLAYS_LOCK:
        e = PLAYS.get(token)
        if e is None:
            return True
        if e["done"]:
            del PLAYS[token]
            return True
        return False

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

CONFIG_FILE = os.path.join(ROOT, "potflow-config.txt")

def _config_get(key):
    # potflow-config.txt 의 `key=경로` 한 줄 읽기(자동탐지 실패 시 수동 지정용)
    try:
        if os.path.isfile(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    s = line.strip()
                    if not s or s.startswith("#") or "=" not in s:
                        continue
                    k, _, v = s.partition("=")
                    if k.strip().lower() == key:
                        v = v.strip().strip('"').strip("'")
                        return v or None
    except OSError:
        pass
    return None

def find_potplayer():
    # 1) 환경변수/설정파일 우선  2) 흔한 설치경로+이름  3) PATH  4) 레지스트리 App Paths
    cand = os.environ.get("POTPLAYER_PATH") or _config_get("potplayer")
    if cand and os.path.isfile(cand):
        return cand
    names = ["PotPlayerMini64.exe", "PotPlayer64.exe", "PotPlayerMini.exe", "PotPlayer.exe"]
    subdirs = [os.path.join("DAUM", "PotPlayer"), os.path.join("DAUM", "PotPlayer64"),
               "PotPlayer", os.path.join("Kakao", "PotPlayer"), os.path.join("DAUM", "PotPlayerMini")]
    roots = [os.environ.get(ev) for ev in ("ProgramW6432", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")]
    for root in filter(None, roots):
        for sd in subdirs:
            for n in names:
                p = os.path.join(root, sd, n)
                if os.path.isfile(p):
                    return p
    for n in names:
        w = shutil.which(n)
        if w:
            return w
    try:
        import winreg
        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for n in names:
                try:
                    with winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths" + "\\" + n) as k:
                        val = winreg.QueryValueEx(k, None)[0]
                        if val and os.path.isfile(val):
                            return val
                except OSError:
                    continue
    except Exception:
        pass
    return None

def find_ffmpeg():
    cand = os.environ.get("FFMPEG_PATH") or _config_get("ffmpeg")
    if cand:
        if os.path.isfile(cand):
            return cand
        w = shutil.which(cand)
        if w:
            return w
    return shutil.which("ffmpeg")

def content_type_for(name):
    ext = os.path.splitext(name)[1].lower()
    return {".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
            ".mov": "video/quicktime", ".m4v": "video/mp4", ".avi": "video/x-msvideo",
            ".ts": "video/mp2t", ".ogv": "video/ogg", ".mpg": "video/mpeg",
            ".mpeg": "video/mpeg", ".flv": "video/x-flv", ".wmv": "video/x-ms-wmv"}.get(ext, "application/octet-stream")

SCANNED_DIRS = set()   # 사용자가 탐색기에서 연 폴더들 — /resolve가 OS 드롭 파일을 찾을 때 함께 뒤진다


def _common_media_roots():
    roots = []
    home = os.path.expanduser("~")
    for sub in ("Videos", "Movies", "Downloads", "Desktop", "Documents", "Pictures"):
        p = os.path.join(home, sub)
        if os.path.isdir(p):
            roots.append(p)
    return roots


def _dedup_roots(roots):
    """중복·상위폴더에 포함되는 하위폴더 제거(이중 탐색 방지)."""
    uniq, norm = [], []
    for r in roots:
        if not r or not os.path.isdir(r):
            continue
        rn = os.path.normcase(os.path.abspath(r))
        if any(rn == e or rn.startswith(e + os.sep) for e in norm):
            continue
        keep_u, keep_n = [], []
        for u_, n_ in zip(uniq, norm):
            if n_.startswith(rn + os.sep):
                continue
            keep_u.append(u_); keep_n.append(n_)
        keep_u.append(r); keep_n.append(rn)
        uniq, norm = keep_u, keep_n
    return uniq


def folder_pbf_count(folder, budget):
    """폴더(하위 포함) 안의 .pbf 개수. budget=[남은탐색] 공유 예산, 소진 시 -1(다수)."""
    cnt = 0
    try:
        for dp, dn, fns in os.walk(folder):
            for fn in fns:
                budget[0] -= 1
                if budget[0] < 0:
                    return -1
                if fn.lower().endswith(".pbf"):
                    cnt += 1
    except OSError:
        pass
    return cnt


def scan_tree(path, want_pbf=False):
    try:
        ap = os.path.abspath(path)
        if not os.path.isdir(ap):
            return {"ok": False, "error": "not a directory"}
        SCANNED_DIRS.add(ap)
        folders, files = [], []
        for name in sorted(os.listdir(ap), key=str.lower):
            fp = os.path.join(ap, name)
            if os.path.isdir(fp):
                folders.append({"name": name, "path": fp})
            else:
                ext_l = os.path.splitext(name)[1].lower()
                kind = "video" if ext_l in VIDEO_EXTS else ("pbf" if ext_l == ".pbf" else None)
                if not kind:
                    continue
                try:
                    size = os.path.getsize(fp)
                except OSError:
                    size = 0
                try:
                    mtime = os.path.getmtime(fp)
                except OSError:
                    mtime = 0
                files.append({"name": name, "path": fp, "size": size, "mtime": mtime,
                              "ext": ext_l.lstrip("."), "kind": kind})
        if want_pbf:
            budget = [12000]
            for f in folders:
                f["pbf"] = folder_pbf_count(f["path"], budget)
        parent = os.path.dirname(ap)
        return {"ok": True, "path": ap, "parent": parent if parent != ap else None,
                "folders": folders, "files": files}
    except OSError as e:
        return {"ok": False, "error": str(e)}

def resolve_path(name, size, roots, cap=20000):
    found = None
    matches = 0
    scanned = 0
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dp, dn, fns in os.walk(root):
            for fn in fns:
                scanned += 1
                if scanned > cap:
                    return (None, -1)
                if fn == name:
                    fp = os.path.join(dp, fn)
                    try:
                        if os.path.getsize(fp) != size:
                            continue
                    except OSError:
                        continue
                    matches += 1
                    if matches == 1:
                        found = fp
                    else:
                        return (None, matches)
    return (found, matches) if matches <= 1 else (None, matches)

def thumb_path_for(video_path):
    h = hashlib.md5(video_path.encode("utf-8")).hexdigest()
    return os.path.join(THUMB_DIR, h + ".jpg")

def ffmpeg_thumb_cmd(ffmpeg, video_path, out):
    return [ffmpeg, "-y", "-ss", "5", "-i", video_path,
            "-frames:v", "1", "-vf", "scale=320:-1", out]

def parse_pbf(text):
    out = []
    in_bm = False
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            in_bm = (s.lower() == "[bookmark]")
            continue
        if not in_bm or "=" not in s:
            continue
        _, _, val = s.partition("=")
        parts = val.split("*", 2)
        try:
            ms = int(parts[0])
        except (ValueError, IndexError):
            continue
        title = parts[1] if len(parts) > 1 else ""
        thumb = parts[2] if len(parts) > 2 and parts[2] else None
        out.append({"ms": ms, "title": title, "thumb": thumb})
    out.sort(key=lambda b: b["ms"])
    return out

def pbf_for_video(video_path):
    for c in (video_path + ".pbf", os.path.splitext(video_path)[0] + ".pbf"):
        if os.path.isfile(c):
            return c
    return None

def video_for_pbf(pbf_path):
    if not pbf_path.lower().endswith(".pbf"):
        return None
    cand = pbf_path[:-4]
    if os.path.isfile(cand) and os.path.splitext(cand)[1].lower() in VIDEO_EXTS:
        return cand
    base = os.path.splitext(os.path.basename(cand))[0].lower()
    d = os.path.dirname(pbf_path)
    try:
        for fn in sorted(os.listdir(d), key=str.lower):
            fp = os.path.join(d, fn)
            if (os.path.isfile(fp) and os.path.splitext(fn)[1].lower() in VIDEO_EXTS
                    and os.path.splitext(fn)[0].lower() == base):
                return fp
    except OSError:
        pass
    return None

def ffmpeg_thumb_at_cmd(ffmpeg, video_path, sec, out):
    return [ffmpeg, "-y", "-ss", str(sec), "-i", video_path,
            "-frames:v", "1", "-vf", "scale=320:-1", out]

def player_cmd(exe, path, seek=None):
    cmd = [exe, path]
    if seek is not None:
        cmd.append("/seek=" + str(seek))
    return cmd

def bookmark_thumb(video, ms, embedded):
    if embedded:
        # PotPlayer 내장 썸네일 base64 — 포맷을 매직바이트로 판별해 올바른 MIME로(무조건 jpeg 선언 시 PNG/BMP는 액박)
        try:
            raw = base64.b64decode(embedded + "=" * (-len(embedded) % 4))
        except Exception:
            return None
        if len(raw) < 8:
            return None
        if raw[:2] == b"\xff\xd8":
            mime = "jpeg"
        elif raw[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "png"
        elif raw[:2] == b"BM":
            mime = "bmp"
        elif raw[:6] in (b"GIF87a", b"GIF89a"):
            mime = "gif"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            mime = "webp"
        else:
            mime = "jpeg"
        return "data:image/" + mime + ";base64," + base64.b64encode(raw).decode()
    ff = find_ffmpeg()
    if not ff or not os.path.isfile(video):
        return None
    os.makedirs(THUMB_DIR, exist_ok=True)
    key = hashlib.md5((video + "@" + str(ms)).encode("utf-8")).hexdigest()
    out = os.path.join(THUMB_DIR, key + ".jpg")
    if os.path.isfile(out) and os.path.getsize(out) > 0:
        with open(out, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
    # 동시 요청 레이스 방지: 고유 임시 파일에 쓰고 os.replace로 원자적 이동
    fd, tmp = tempfile.mkstemp(suffix=".jpg", dir=THUMB_DIR)
    os.close(fd)
    try:
        result = subprocess.run(ffmpeg_thumb_at_cmd(ff, video, ms / 1000.0, tmp),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return None
    if result.returncode == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
        os.replace(tmp, out)
        with open(out, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
    try:
        if os.path.exists(tmp):
            os.remove(tmp)
    except OSError:
        pass
    return None

def _decode_pbf(raw):
    # PotPlayer .pbf는 UTF-16(BOM)·UTF-8(BOM)·UTF-8·CP949 등으로 저장될 수 있어 자동 감지
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")   # BOM으로 엔디안 자동판별·BOM 제거
    if raw[:3] == b"\xef\xbb\xbf":
        return raw.decode("utf-8-sig", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp949", errors="replace")

def list_bookmarks(path):
    if not path:
        return {"ok": False, "error": "path required"}
    if path.lower().endswith(".pbf"):
        pbf = path if os.path.isfile(path) else None
        video = video_for_pbf(path)
    else:
        video = path
        pbf = pbf_for_video(path)
    if not video or not os.path.isfile(video):
        return {"ok": False, "error": "video not found"}
    if not pbf:
        return {"ok": True, "video": video, "bookmarks": []}
    try:
        with open(pbf, "rb") as f:
            text = _decode_pbf(f.read())
    except OSError:
        return {"ok": True, "video": video, "bookmarks": []}
    bms = [{"ms": b["ms"], "title": b["title"],
            "thumb": bookmark_thumb(video, b["ms"], b["thumb"])} for b in parse_pbf(text)]
    return {"ok": True, "video": video, "bookmarks": bms}

def get_thumb(video_path):
    out = thumb_path_for(video_path)
    if os.path.isfile(out) and os.path.getsize(out) > 0:
        with open(out, "rb") as f:
            return f.read(), ""
    ff = find_ffmpeg()
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

def _monitors():
    try:
        import ctypes
        u = ctypes.windll.user32
        class RECT(ctypes.Structure):
            _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]
        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", RECT), ("rcWork", RECT), ("dwFlags", ctypes.c_ulong)]
        # 핸들(HMONITOR)은 64비트 포인터 — argtypes를 c_void_p로 지정하고 c_void_p로 감싸야
        # 기본 c_int 변환 시 나는 OverflowError(int too long)를 피할 수 있다.
        u.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MONITORINFO)]
        u.GetMonitorInfoW.restype = ctypes.c_int
        MONENUM = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)
        u.EnumDisplayMonitors.argtypes = [ctypes.c_void_p, ctypes.c_void_p, MONENUM, ctypes.c_void_p]
        u.EnumDisplayMonitors.restype = ctypes.c_int
        mons = []
        def cb(hMon, hdc, lprc, lparam):
            info = MONITORINFO(); info.cbSize = ctypes.sizeof(MONITORINFO)
            if u.GetMonitorInfoW(ctypes.c_void_p(hMon), ctypes.byref(info)):
                r = info.rcWork
                mons.append({"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top, "primary": bool(info.dwFlags & 1)})
            return 1
        u.EnumDisplayMonitors(None, None, MONENUM(cb), None)
        mons.sort(key=lambda m: (not m["primary"], m["x"], m["y"]))
        return mons or [{"x": 0, "y": 0, "w": 1920, "h": 1080, "primary": True}]
    except Exception:
        return [{"x": 0, "y": 0, "w": 1920, "h": 1080, "primary": True}]

def win_to_rect(win, monitors):
    if not monitors:
        return (0, 0, 100, 100)
    mi = win.get("mon", 0)
    if not isinstance(mi, int) or mi < 0 or mi >= len(monitors):
        mi = 0
    m = monitors[mi]
    x = int(m["x"] + float(win.get("x", 0)) * m["w"])
    y = int(m["y"] + float(win.get("y", 0)) * m["h"])
    w = max(1, int(float(win.get("w", 1)) * m["w"]))
    h = max(1, int(float(win.get("h", 1)) * m["h"]))
    return (x, y, w, h)

def build_play_rects(valid, monitors):
    prim = monitors[0]
    auto = tile_rects(len(valid), prim["w"], prim["h"])
    rects = []
    for i, it in enumerate(valid):
        w = it.get("win")
        if isinstance(w, dict):
            rects.append(win_to_rect(w, monitors))
        else:
            a = auto[i]
            rects.append((prim["x"] + a[0], prim["y"] + a[1], a[2], a[3]))
    return rects

def _player_windows():
    """현재 화면의 PotPlayer 본 재생창 hwnd 목록. 실행파일명(potplayer)으로 판별 —
    PotPlayer가 창을 실행 프로세스와 다른 PID(런처→브로커)로 띄워도 확실히 잡는다."""
    out = []
    try:
        import ctypes
        from ctypes import wintypes
        u = ctypes.windll.user32; k = ctypes.windll.kernel32
        u.IsWindowVisible.argtypes = [ctypes.c_void_p]; u.IsWindowVisible.restype = ctypes.c_int
        u.GetWindow.argtypes = [ctypes.c_void_p, ctypes.c_uint]; u.GetWindow.restype = ctypes.c_void_p
        u.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD)]; u.GetWindowThreadProcessId.restype = wintypes.DWORD
        u.GetWindowTextLengthW.argtypes = [ctypes.c_void_p]; u.GetWindowTextLengthW.restype = ctypes.c_int
        u.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.RECT)]; u.GetWindowRect.restype = ctypes.c_int
        k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]; k.OpenProcess.restype = wintypes.HANDLE
        k.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]; k.QueryFullProcessImageNameW.restype = wintypes.BOOL
        k.CloseHandle.argtypes = [wintypes.HANDLE]; k.CloseHandle.restype = wintypes.BOOL
        WNDENUM = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
        u.EnumWindows.argtypes = [WNDENUM, ctypes.c_void_p]; u.EnumWindows.restype = ctypes.c_int
        cache = {}
        def exe_of(pid):
            if pid in cache:
                return cache[pid]
            nm = ""
            h = k.OpenProcess(0x1000, False, pid)   # PROCESS_QUERY_LIMITED_INFORMATION
            if h:
                try:
                    buf = ctypes.create_unicode_buffer(1024); sz = wintypes.DWORD(1024)
                    if k.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(sz)):
                        nm = os.path.basename(buf.value).lower()
                finally:
                    k.CloseHandle(h)
            cache[pid] = nm; return nm
        def cb(hwnd, _):
            if not u.IsWindowVisible(ctypes.c_void_p(hwnd)):
                return 1
            if u.GetWindow(ctypes.c_void_p(hwnd), 4):   # GW_OWNER=4 — 소유창(대화상자/툴팁) 제외
                return 1
            if u.GetWindowTextLengthW(ctypes.c_void_p(hwnd)) <= 0:
                return 1
            r = wintypes.RECT(); u.GetWindowRect(ctypes.c_void_p(hwnd), ctypes.byref(r))
            if (r.right - r.left) < 200 or (r.bottom - r.top) < 150:   # 본 재생창만
                return 1
            pid = wintypes.DWORD(); u.GetWindowThreadProcessId(ctypes.c_void_p(hwnd), ctypes.byref(pid))
            if "potplayer" in exe_of(pid.value):
                out.append(int(hwnd))
            return 1
        u.EnumWindows(WNDENUM(cb), None)
    except Exception:
        pass
    return out


def arrange_windows(rects, pre):
    """새로 뜬 PotPlayer 창들(pre 스냅샷 제외)에 rect를 발견순으로 고유 배정하고 ~12초간 재적용."""
    try:
        import ctypes, time
        u = ctypes.windll.user32
        u.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]; u.ShowWindow.restype = ctypes.c_int
        u.SetWindowPos.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]; u.SetWindowPos.restype = ctypes.c_int
        preset = set(pre or [])
        assign = {}   # hwnd -> rect index (창마다 고유 rect)
        for _ in range(24):
            time.sleep(0.5)
            for hwnd in _player_windows():
                if hwnd in preset:
                    continue                          # 재생 전부터 떠 있던 창은 건드리지 않음
                if hwnd not in assign:
                    used = set(assign.values())
                    nxt = next((i for i in range(len(rects)) if i not in used), None)
                    if nxt is not None:
                        assign[hwnd] = nxt
            for hwnd, idx in assign.items():
                x, y, w, h = rects[idx]
                u.ShowWindow(ctypes.c_void_p(hwnd), 9)   # SW_RESTORE
                u.SetWindowPos(ctypes.c_void_p(hwnd), None, x, y, w, h, 0x0040)   # SWP_SHOWWINDOW
    except Exception:
        pass

def normalize_play_items(body):
    items = body.get("items")
    if isinstance(items, list) and items:
        out = []
        for it in items:
            if isinstance(it, dict) and it.get("path"):
                out.append({"path": it["path"], "seek": it.get("seek"), "win": it.get("win")})
        return out
    seek = body.get("seek")
    return [{"path": p, "seek": seek, "win": None} for p in body.get("paths", []) if p]

def launch_players(items):
    exe = find_potplayer()
    if not exe:
        return {"ok": False, "error": "PotPlayer를 찾을 수 없습니다 — 헬퍼 폴더의 potflow-config.txt에 potplayer=경로 를 지정하세요"}
    valid = [it for it in items if it.get("path") and os.path.isfile(it["path"])]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    monitors = _monitors()
    rects = build_play_rects(valid, monitors)
    pre = _player_windows() if os.name == "nt" else []   # 재생 전부터 떠 있던 PotPlayer 창(제외 대상)
    procs = []
    for it in valid:
        try:
            procs.append(subprocess.Popen(player_cmd(exe, it["path"], it.get("seek"))))
        except Exception:
            pass
    need = (len(valid) > 1) or any(isinstance(it.get("win"), dict) for it in valid)
    if os.name == "nt" and procs and need:
        threading.Thread(target=arrange_windows, args=(rects, pre), daemon=True).start()
    token = _register_play(procs, valid[0]["path"] if len(valid) == 1 else None)
    return {"ok": True, "launched": len(procs), "token": token}

def load_doc():
    if not os.path.isfile(DATA_FILE):
        return None
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None

def save_doc(doc):
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        return True
    except OSError:
        return False

def ping_payload():
    return {
        "ok": True,
        "potplayer": find_potplayer() is not None,
        "ffmpeg": find_ffmpeg() is not None,
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

    def _serve_file(self, path):
        if not path or not os.path.isfile(path):
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            size = os.path.getsize(path)
        except OSError:
            return self._send(404, {"ok": False, "error": "stat failed"})
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            try:
                s, _, e = rng[6:].partition("-")
                if s == "" and e != "":
                    start = max(0, size - int(e)); end = size - 1
                else:
                    if s:
                        start = int(s)
                    if e:
                        end = int(e)
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    return
                end = min(end, size - 1)
                status = 206
            except ValueError:
                start, end, status = 0, size - 1, 200
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type_for(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except Exception:
            pass

    def _host_ok(self):
        # DNS 리바인딩 방지: Host 헤더가 실제 바인딩된 127.0.0.1/localhost:PORT 가 아니면 거부
        try:
            port = self.server.server_address[1]
        except Exception:
            port = PORT
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        return self.headers.get("Host") in allowed

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, {"ok": False, "error": "forbidden host"})
        u = urlparse(self.path)
        if u.path == "/ping":
            return self._send(200, ping_payload())
        if u.path == "/tree":
            qs = parse_qs(u.query)
            want_pbf = qs.get("pbf", ["0"])[0] == "1"
            return self._send(200, scan_tree(qs.get("path", [ROOT])[0], want_pbf))
        if u.path == "/thumb":
            qs = parse_qs(u.query)
            data, err = get_thumb(qs.get("path", [""])[0])
            if data:
                return self._send(200, data, "image/jpeg", raw=True)
            return self._send(404, {"ok": False, "error": err})
        if u.path == "/doc":
            return self._send(200, load_doc())
        if u.path == "/bookmarks":
            qs = parse_qs(u.query)
            return self._send(200, list_bookmarks(qs.get("path", [""])[0]))
        if u.path == "/playdone":
            qs = parse_qs(u.query)
            return self._send(200, {"done": play_done(qs.get("token", [""])[0])})
        if u.path == "/monitors":
            return self._send(200, {"monitors": _monitors()})
        if u.path == "/file":
            return self._serve_file(parse_qs(u.query).get("path", [""])[0])
        # 정적 서빙
        rel = u.path.lstrip("/") or "potflow.html"
        fp = os.path.join(ROOT, rel)
        if os.path.isfile(fp) and os.path.commonpath([ROOT, os.path.abspath(fp)]) == ROOT:
            ctype = "text/html" if fp.endswith(".html") else "application/octet-stream"
            with open(fp, "rb") as f:
                return self._send(200, f.read(), ctype, raw=True)
        return self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self._host_ok():
            return self._send(403, {"ok": False, "error": "forbidden host"})
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
            return self._send(200, launch_players(normalize_play_items(body)))
        if u.path == "/doc":
            return self._send(200, {"ok": save_doc(body.get("doc", {}))})
        if u.path == "/resolve":
            name = body.get("name", "")
            if not name:
                return self._send(400, {"ok": False, "error": "name required"})
            base = body.get("base", "")
            if not isinstance(base, str):
                base = ""
            roots = _dedup_roots(([base] if base else []) + sorted(SCANNED_DIRS)
                                 + list(SEARCH_ROOTS) + _common_media_roots())
            path, matches = resolve_path(name, body.get("size", 0), roots, cap=60000)
            if matches == -1:
                return self._send(200, {"ok": False, "error": "too many files"})
            if path:
                return self._send(200, {"ok": True, "path": path})
            return self._send(200, {"ok": False, "matches": matches})
        return self._send(404, {"ok": False, "error": "not found"})

    def log_message(self, *a):
        pass

def make_server(port):
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)

if __name__ == "__main__":
    os.makedirs(THUMB_DIR, exist_ok=True)
    srv = make_server(PORT)
    url = f"http://localhost:{PORT}/potflow.html"
    _pp = find_potplayer()
    _ff = find_ffmpeg()
    print(f"PotFlow helper 실행 중 → {url}")
    print("PotPlayer: " + (_pp or "못 찾음 — potflow-config.txt 에 potplayer=경로 를 넣으세요"))
    print("ffmpeg   : " + (_ff or "못 찾음(썸네일 비활성, 선택사항)"))
    print("이 창을 켜 두세요. 종료: Ctrl+C 또는 창 닫기")
    # 브라우저를 올바른 주소로 자동 오픈(파일 더블클릭/공개주소 실수 방지). POTFLOW_NO_BROWSER=1 로 끔.
    if not os.environ.get("POTFLOW_NO_BROWSER"):
        def _open_browser():
            try:
                import time, webbrowser
                time.sleep(0.8)
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=_open_browser, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nPotFlow helper 종료")
