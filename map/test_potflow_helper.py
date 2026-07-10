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

def test_scan_tree_includes_pbf_and_kind(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"x")
    (tmp_path / "a.mp4.pbf").write_text("[Bookmark]\n0=1000*x*")
    r = helper.scan_tree(str(tmp_path))
    kinds = {f["name"]: f["kind"] for f in r["files"]}
    assert kinds.get("a.mp4") == "video"
    assert kinds.get("a.mp4.pbf") == "pbf"

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

def test_parse_pbf_basic():
    text = "[Bookmark]\n0=305000*둘째*\n1=5000*첫째*QUJD\nbad line\n[Other]\n2=999*무시*"
    r = helper.parse_pbf(text)
    assert [b["ms"] for b in r] == [5000, 305000]           # ms 오름차순, [Other] 섹션 제외
    assert r[0]["title"] == "첫째" and r[0]["thumb"] == "QUJD"
    assert r[1]["title"] == "둘째" and r[1]["thumb"] is None

def test_pbf_video_resolution(tmp_path):
    vid = tmp_path / "movie.mkv"; vid.write_bytes(b"x")
    # <video>.pbf 형태
    p1 = tmp_path / "movie.mkv.pbf"; p1.write_text("[Bookmark]\n0=1000*a*")
    assert helper.pbf_for_video(str(vid)) == str(p1)
    assert helper.video_for_pbf(str(p1)) == str(vid)
    # <basename>.pbf 형태
    p1.unlink(); p2 = tmp_path / "movie.pbf"; p2.write_text("[Bookmark]\n0=1000*a*")
    assert helper.pbf_for_video(str(vid)) == str(p2)
    assert helper.video_for_pbf(str(p2)) == str(vid)
    # pbf 없음
    p2.unlink(); assert helper.pbf_for_video(str(vid)) is None

def test_player_and_ffmpeg_cmds():
    assert helper.player_cmd("pot.exe", "v.mp4") == ["pot.exe", "v.mp4"]
    assert helper.player_cmd("pot.exe", "v.mp4", 90) == ["pot.exe", "v.mp4", "/seek=90"]
    c = helper.ffmpeg_thumb_at_cmd("ffmpeg", "v.mkv", 5.0, "o.jpg")
    assert c[0] == "ffmpeg" and "v.mkv" in c and c[-1] == "o.jpg" and "-frames:v" in c

def test_bookmark_thumb_embedded():
    # 내장 base64 있으면 그대로 data URL 로 감싼다 (ffmpeg 불필요)
    assert helper.bookmark_thumb("v.mp4", 1000, "QUJD") == "data:image/jpeg;base64,QUJD"

def test_list_bookmarks_no_pbf(tmp_path):
    vid = tmp_path / "m.mp4"; vid.write_bytes(b"x")
    r = helper.list_bookmarks(str(vid))
    assert r["ok"] is True and r["video"] == str(vid) and r["bookmarks"] == []

def test_list_bookmarks_with_pbf(tmp_path):
    vid = tmp_path / "m.mp4"; vid.write_bytes(b"x")
    (tmp_path / "m.mp4.pbf").write_text("[Bookmark]\n0=2000*씬*QUJD")
    r = helper.list_bookmarks(str(vid))
    assert r["ok"] is True and len(r["bookmarks"]) == 1
    b = r["bookmarks"][0]
    assert b["ms"] == 2000 and b["title"] == "씬"
    assert b["thumb"] == "data:image/jpeg;base64,QUJD"   # 내장 썸네일 사용(ffmpeg 없이)

def test_play_done_lifecycle():
    helper.PLAYS.clear()
    helper.PLAYS["t1"] = {"procs": [], "done": False, "video": "v"}
    assert helper.play_done("t1") is False          # 아직 진행 중
    helper.PLAYS["t1"]["done"] = True
    assert helper.play_done("t1") is True            # 완료 → True 반환 + 제거
    assert "t1" not in helper.PLAYS
    assert helper.play_done("t1") is True            # 미존재 → True(정리됨)

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

def test_normalize_play_items():
    assert helper.normalize_play_items({"items":[{"path":"a.mp4","seek":5},{"path":"b.mkv"}]}) == \
        [{"path":"a.mp4","seek":5,"win":None},{"path":"b.mkv","seek":None,"win":None}]
    assert helper.normalize_play_items({"paths":["a.mp4","b.mkv"],"seek":9}) == \
        [{"path":"a.mp4","seek":9,"win":None},{"path":"b.mkv","seek":9,"win":None}]
    assert helper.normalize_play_items({"paths":["a.mp4"]}) == [{"path":"a.mp4","seek":None,"win":None}]
    assert helper.normalize_play_items({}) == []

def test_win_to_rect_multimon():
    mons=[{"x":0,"y":0,"w":1920,"h":1080,"primary":True},{"x":1920,"y":0,"w":1280,"h":720,"primary":False}]
    assert helper.win_to_rect({"mon":1,"x":0.5,"y":0,"w":0.5,"h":1}, mons)==(2560,0,640,720)
    assert helper.win_to_rect({"mon":9,"x":0,"y":0,"w":1,"h":1}, mons)==(0,0,1920,1080)

def test_build_play_rects_mixed():
    mons=[{"x":0,"y":0,"w":1000,"h":800,"primary":True}]
    valid=[{"path":"a","win":{"mon":0,"x":0,"y":0,"w":.5,"h":1}},{"path":"b"}]
    r=helper.build_play_rects(valid, mons)
    assert r[0]==(0,0,500,800) and len(r)==2 and r[1][2]>0

def test_content_type_for():
    assert helper.content_type_for("a.mp4") == "video/mp4"
    assert helper.content_type_for("a.MKV") == "video/x-matroska"
    assert helper.content_type_for("a.xyz") == "application/octet-stream"

def test_file_serving_range(tmp_path):
    import http.client, threading
    from urllib.parse import quote
    f = tmp_path / "v.mp4"; f.write_bytes(b"0123456789")
    srv = helper.make_server(0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        c.request("GET", "/file?path=" + quote(str(f)),
                  headers={"Host": f"localhost:{port}", "Range": "bytes=2-5"})
        r = c.getresponse(); body = r.read()
        assert r.status == 206 and body == b"2345"
        assert r.getheader("Content-Range") == "bytes 2-5/10"
    finally:
        srv.shutdown()

def test_file_serving_suffix_range(tmp_path):
    import http.client, threading
    from urllib.parse import quote
    f = tmp_path / "v.mp4"; f.write_bytes(b"0123456789")
    srv = helper.make_server(0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        c.request("GET", "/file?path=" + quote(str(f)),
                  headers={"Host": f"localhost:{port}", "Range": "bytes=-3"})
        r = c.getresponse(); body = r.read()
        assert r.status == 206 and body == b"789"
        assert r.getheader("Content-Range") == "bytes 7-9/10"
    finally:
        srv.shutdown()

def test_normalize_carries_win():
    out=helper.normalize_play_items({"items":[{"path":"a","seek":3,"win":{"mon":0,"x":0,"y":0,"w":1,"h":1}}]})
    assert out[0]["win"]=={"mon":0,"x":0,"y":0,"w":1,"h":1} and out[0]["seek"]==3
    out2=helper.normalize_play_items({"paths":["a"]})
    assert out2[0]["win"] is None
