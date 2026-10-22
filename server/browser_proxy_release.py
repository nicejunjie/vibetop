"""Validate immutable Browser Lite bundles before root publishes or runs them."""
import hashlib
import json
import os
from pathlib import Path
import stat


PROTOCOL = 1


def tree_digest(directory, *, owner=None):
    """Hash actual files, retaining safe internal pnpm symlinks without following.

    The root installer must run this on its private copied tree. Checking an
    unprivileged staging tree alone is not proof of the bytes being installed.
    """
    root = Path(directory).resolve(strict=True)
    digest = hashlib.sha256()
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in sorted(directories + files):
            path = Path(parent) / name
            relative = path.relative_to(root).as_posix()
            if relative == "release.json":
                continue
            metadata = path.lstat()
            if owner is not None and metadata.st_uid != owner:
                raise PermissionError("Browser release has an unexpected owner")
            if metadata.st_mode & (stat.S_ISUID | stat.S_ISGID):
                raise PermissionError("Browser release contains privileged mode bits")
            if not stat.S_ISLNK(metadata.st_mode) and metadata.st_mode & 0o022:
                raise PermissionError("Browser release is writable by another user")
            if stat.S_ISLNK(metadata.st_mode):
                target = os.readlink(path)
                if os.path.isabs(target) or not path.resolve(strict=True).is_relative_to(root):
                    raise PermissionError("Browser release symlink escapes its directory")
                value = b"link\0" + target.encode()
            elif stat.S_ISDIR(metadata.st_mode):
                value = b"directory"
            elif stat.S_ISREG(metadata.st_mode):
                if metadata.st_nlink != 1:
                    raise PermissionError("Browser release file shares an external inode")
                with path.open("rb") as stream:
                    value = b"file\0" + bytes([bool(metadata.st_mode & 0o111)]) + hashlib.file_digest(stream, "sha256").digest()
            else:
                raise PermissionError("Browser release contains a special file")
            digest.update(relative.encode() + b"\0" + value + b"\0")
        directories.sort()
    return digest.hexdigest()


def validate_ancestors(directory):
    for path in (Path(directory), *Path(directory).parents):
        metadata = path.lstat()
        if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0
                or metadata.st_mode & 0o022):
            raise PermissionError("Browser release ancestor is not controlled by root")


def validate(directory, *, owner=0, node_version=None):
    root = Path(directory)
    metadata = root.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != owner or metadata.st_mode & 0o022:
        raise PermissionError("Invalid Browser Lite release directory")
    manifest_path = root / "release.json"
    fd = os.open(manifest_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        metadata = os.fstat(fd)
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != owner
                or metadata.st_nlink != 1 or metadata.st_mode & 0o022 or metadata.st_size > 8192):
            raise PermissionError("Invalid Browser Lite release manifest")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            manifest = json.load(stream)
    finally:
        os.close(fd)
    if manifest.get("protocol") != PROTOCOL or not str(manifest.get("nodeVersion", "")).startswith("v22."):
        raise ValueError("Unsupported Browser Lite runtime protocol or Node version")
    if node_version is not None and node_version.split(".")[0] != manifest["nodeVersion"].split(".")[0]:
        raise ValueError("Browser Lite Node version changed; rebuild its runtime")
    if manifest.get("revision") != tree_digest(root, owner=owner):
        raise ValueError("Browser Lite release contents do not match their manifest")
    for name in ("runtime.cjs", "egress.cjs", "wrapper.html", "wrapper.css", "wrapper.js", "ui-session.js", "trusted-controller.js", "package.json", "pnpm-lock.yaml"):
        if not (root / name).is_file():
            raise ValueError("Browser Lite release is incomplete")
    return manifest
