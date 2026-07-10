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
