import importlib.util, pathlib
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

def test_scan_tree_missing_path():
    r = helper.scan_tree("/no/such/path/xyz-123")
    assert r["ok"] is False
