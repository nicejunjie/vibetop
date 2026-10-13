#!/usr/bin/env python3
"""Build an isolated rewrite bundle as the trusted code owner, never as root.

This publishes no services, nginx configuration or website state. The root
installer must copy the result privately and verify that copy before activation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from browser_proxy_release import PROTOCOL, tree_digest, validate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pnpm-js", type=Path, help="Pinned pnpm 10.18.3 entry point; used only with --download")
    parser.add_argument("--download", action="store_true", help="Explicitly allow fetching frozen dependencies")
    parser.add_argument("--reuse", type=Path, help="Verified installed bundle to reuse without network access")
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error("Build as APP_USER, not root")
    os.umask(0o022)
    if args.output.exists() or args.output.is_symlink():
        parser.error("Output already exists; use a new staging path")
    if args.download == bool(args.reuse):
        parser.error("Choose either --download or --reuse")
    node = "/usr/bin/node"
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if not version.startswith("v22."):
        parser.error("Browser Lite requires Node 22")
    source = Path(__file__).with_name("proxy")
    if args.download:
        if not args.pnpm_js:
            parser.error("--download requires --pnpm-js")
        pnpm_version = subprocess.check_output([node, str(args.pnpm_js.resolve()), "--version"], text=True).strip()
        if pnpm_version != "10.18.3":
            parser.error("pnpm must be exactly 10.18.3")
    else:
        # Reuse only a complete, content-verified root-owned release. No shared
        # store or hard links: compatibility patches must not mutate old code.
        validate(args.reuse, owner=0, node_version=version)
        for name in ("package.json", "pnpm-lock.yaml"):
            if (source / name).read_bytes() != (args.reuse / name).read_bytes():
                parser.error("Dependencies changed; explicitly build with --download")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".vt-browser-build-", dir=args.output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        for item in source.iterdir():
            if item.is_file() and (item.suffix in (".cjs", ".js", ".css", ".html") or item.name in ("package.json", "pnpm-lock.yaml")):
                shutil.copyfile(item, stage / item.name)
        if args.download:
            subprocess.run([node, str(args.pnpm_js.resolve()), "install", "--frozen-lockfile", "--ignore-scripts",
                            "--package-import-method=copy", "--store-dir=" + str(Path(temporary) / "store")], cwd=stage, check=True)
        else:
            shutil.copytree(args.reuse / "node_modules", stage / "node_modules", symlinks=True)
        subprocess.run([node, "build-engine.cjs"], cwd=stage, check=True)
        tests = sorted(path.name for path in stage.iterdir() if path.name.endswith((".test.cjs", ".test.js")))
        subprocess.run([node, "--test", *tests], cwd=stage, check=True)
        # Ship licenses carried by dependency packages. Keep source patches so
        # an offline upgrade is reproducible, but omit test fixtures from code.
        for name in tests:
            (stage / name).unlink()
        manifest = {"protocol": PROTOCOL, "nodeVersion": version, "pnpmVersion": "10.18.3",
                    "lockDigest": hashlib.sha256((stage / "pnpm-lock.yaml").read_bytes()).hexdigest(),
                    "revision": tree_digest(stage)}
        (stage / "release.json").write_text(json.dumps(manifest, sort_keys=True) + "\n")
        validate(stage, owner=os.getuid(), node_version=version)
        os.rename(stage, args.output)
        print(json.dumps({"output": str(args.output), "revision": manifest["revision"]}))


if __name__ == "__main__":
    main()
