import importlib.util, os, pathlib
spec = importlib.util.spec_from_file_location("helper", pathlib.Path(__file__).parent / "potflow-helper.py")
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)

def test_find_exe_returns_none_for_missing():
    assert helper.find_exe(["definitely-not-a-real-exe-xyz"]) is None

def test_find_exe_finds_python():
    import sys
    assert helper.find_exe([sys.executable]) == sys.executable

def test_ping_payload_shape():
    p = helper.ping_payload()
    assert p["ok"] is True
    assert set(p) == {"ok", "potplayer", "ffmpeg"}
    assert isinstance(p["potplayer"], bool) and isinstance(p["ffmpeg"], bool)

def test_scan_tree_lists_videos_and_folders(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "a.mp4").write_bytes(b"x")
    (tmp_path / "note.txt").write_text("no")
    r = helper.scan_tree(str(tmp_path))
    assert r["ok"] is True
    assert [f["name"] for f in r["folders"]] == ["sub"]
    assert [f["name"] for f in r["files"]] == ["a.mp4"]
    assert r["files"][0]["size"] == 1

def test_scan_tree_includes_mtime_and_ext(tmp_path):
    f = tmp_path / "clip.MP4"
    f.write_bytes(b"xy")
    import os
    os.utime(str(f), (1000000000, 1700000000))  # atime, mtime
    r = helper.scan_tree(str(tmp_path))
    fe = r["files"][0]
    assert fe["ext"] == "mp4"
    assert abs(fe["mtime"] - 1700000000) < 2

def test_scan_tree_missing_path():
    r = helper.scan_tree("/no/such/path/xyz-123")
    assert r["ok"] is False

def test_thumb_path_stable_and_in_dir():
    p1 = helper.thumb_path_for(r"D:\v\a.mkv")
    p2 = helper.thumb_path_for(r"D:\v\a.mkv")
    assert p1 == p2 and p1.endswith(".jpg")
    assert os.path.abspath(helper.THUMB_DIR) in os.path.abspath(p1)
    assert helper.thumb_path_for(r"D:\v\b.mkv") != p1

def test_ffmpeg_thumb_cmd_shape():
    cmd = helper.ffmpeg_thumb_cmd("ffmpeg", "a.mkv", "out.jpg")
    assert cmd[0] == "ffmpeg" and "a.mkv" in cmd and cmd[-1] == "out.jpg"
    assert "-frames:v" in cmd and "1" in cmd

def test_tile_rects_counts():
    assert len(helper.tile_rects(1, 1920, 1080)) == 1
    assert len(helper.tile_rects(4, 1920, 1080)) == 4
    for r in helper.tile_rects(4, 1920, 1080):
        assert len(r) == 4 and all(isinstance(v, int) for v in r)

def test_tile_rects_two_side_by_side():
    rects = helper.tile_rects(2, 1000, 800)
    assert rects[0][0] == 0 and rects[1][0] == 500  # x 좌/우
    assert rects[0][2] == 500 and rects[1][2] == 500  # 각 폭 절반

def test_tile_rects_full_when_one():
    assert helper.tile_rects(1, 1000, 800)[0] == (0, 0, 1000, 800)

def test_save_and_load_doc(tmp_path, monkeypatch):
    f = tmp_path / "d.json"
    monkeypatch.setattr(helper, "DATA_FILE", str(f))
    assert helper.load_doc() is None
    assert helper.save_doc({"canvases": [1, 2]}) is True
    assert helper.load_doc() == {"canvases": [1, 2]}

def test_tile_rects_covers_full_screen_odd_dims():
    for n in (3, 4, 5, 9, 16):
        for W, H in ((1366, 768), (1921, 1081)):
            rects = helper.tile_rects(n, W, H)
            # right edge of the widest-reaching tile == W, bottom edge == H
            assert max(x + w for (x, y, w, h) in rects) == W
            assert max(y + h for (x, y, w, h) in rects) == H

def test_resolve_path_unique(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "movie.mkv").write_bytes(b"12345")   # size 5
    path, matches = helper.resolve_path("movie.mkv", 5, [str(tmp_path)])
    assert matches == 1 and path.endswith("movie.mkv")

def test_resolve_path_none_and_ambiguous(tmp_path):
    (tmp_path / "a").mkdir(); (tmp_path / "b").mkdir()
    (tmp_path / "a" / "dup.mp4").write_bytes(b"xxxxx")  # size 5
    (tmp_path / "b" / "dup.mp4").write_bytes(b"xxxxx")  # size 5
    assert helper.resolve_path("dup.mp4", 5, [str(tmp_path)]) == (None, 2)
    assert helper.resolve_path("missing.mp4", 5, [str(tmp_path)]) == (None, 0)
    # 크기 불일치는 매칭 아님
    assert helper.resolve_path("dup.mp4", 999, [str(tmp_path)]) == (None, 0)

def test_host_header_guard_blocks_dns_rebinding():
    import threading, http.client
    srv = helper.make_server(0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        conn.request("GET", "/ping", headers={"Host": "evil.com"})
        r = conn.getresponse()
        assert r.status == 403
        r.read()
        conn.close()

        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        conn.request("GET", "/ping", headers={"Host": f"127.0.0.1:{port}"})
        r = conn.getresponse()
        assert r.status == 200
        r.read()
        conn.close()
    finally:
        srv.shutdown()
        srv.server_close()
        t.join(timeout=5)
