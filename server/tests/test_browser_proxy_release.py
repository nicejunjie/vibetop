import json
import os
from pathlib import Path

import pytest
from browser_proxy_release import tree_digest, validate


def bundle(tmp_path):
    root = tmp_path / "release"
    root.mkdir(mode=0o755)
    for name in ("runtime.cjs", "egress.cjs", "wrapper.html", "wrapper.css", "wrapper.js", "ui-session.js", "trusted-controller.js", "package.json", "pnpm-lock.yaml"):
        (root / name).write_text("fixture")
        (root / name).chmod(0o644)
    modules = root / "node_modules"
    modules.mkdir(mode=0o755)
    (modules / "dependency").symlink_to("../runtime.cjs")
    manifest = {"protocol": 1, "nodeVersion": "v22.0.0", "revision": tree_digest(root)}
    (root / "release.json").write_text(json.dumps(manifest))
    (root / "release.json").chmod(0o644)
    return root


def test_safe_internal_pnpm_links_and_content_verification(tmp_path):
    root = bundle(tmp_path)
    assert validate(root, owner=os.getuid(), node_version="v22.99.0")["revision"]
    (root / "wrapper.js").write_text("changed after test")
    with pytest.raises(ValueError, match="contents"):
        validate(root, owner=os.getuid())


@pytest.mark.parametrize("kind", ["escape", "absolute", "hardlink", "fifo", "setuid", "writable"])
def test_bundle_rejects_unsafe_objects(tmp_path, kind):
    root = bundle(tmp_path)
    item = root / "unsafe"
    if kind == "escape":
        (tmp_path / "outside").write_text("secret")
        item.symlink_to("../outside")
    elif kind == "absolute":
        item.symlink_to(root / "runtime.cjs")
    elif kind == "hardlink":
        os.link(root / "runtime.cjs", item)
    elif kind == "fifo":
        os.mkfifo(item)
    else:
        item.write_text("bad mode")
        item.chmod(0o4755 if kind == "setuid" else 0o666)
    with pytest.raises(PermissionError):
        tree_digest(root)


def test_manifest_and_runtime_version_fail_closed(tmp_path):
    root = bundle(tmp_path)
    with pytest.raises(ValueError, match="Node version changed"):
        validate(root, owner=os.getuid(), node_version="v24.1.0")
    (root / "release.json").unlink()
    (root / "release.json").symlink_to(root / "package.json")
    with pytest.raises(OSError):
        validate(root, owner=os.getuid())
