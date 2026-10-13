"""Root copies a build without following builder-controlled filesystem links.

No code is executed here. Publication validates the root-private copy, then
renames it into a content-addressed release directory. Activation is separate.
"""
import os
from pathlib import Path
import shutil
import stat
import tempfile

from browser_proxy_release import validate


def copy_build(source, destination, builder_uid):
    """Open every source entry relative to a pinned directory FD, without links."""
    count, size = 0, 0
    def check(metadata):
        if metadata.st_uid != builder_uid or metadata.st_mode & (stat.S_ISUID | stat.S_ISGID):
            raise PermissionError('Invalid Browser Lite build ownership or mode')
        if not stat.S_ISLNK(metadata.st_mode) and metadata.st_mode & 0o022:
            raise PermissionError('Browser Lite build is writable by another user')
    def copy_directory(fd, target):
        nonlocal count, size
        check(os.fstat(fd))
        for name in os.listdir(fd):
            count += 1
            if count > 100000:
                raise ValueError('Browser Lite build has too many entries')
            metadata = os.stat(name, dir_fd=fd, follow_symlinks=False)
            check(metadata)
            output = target / name
            if stat.S_ISLNK(metadata.st_mode):
                link = os.readlink(name, dir_fd=fd)
                if os.path.isabs(link):
                    raise PermissionError('Browser Lite build contains an absolute link')
                os.symlink(link, output)
            elif stat.S_ISDIR(metadata.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    output.mkdir(mode=0o755)
                    output.chmod(0o755)
                    copy_directory(child, output)
                finally:
                    os.close(child)
            elif stat.S_ISREG(metadata.st_mode):
                child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                try:
                    opened = os.fstat(child)
                    check(opened)
                    if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1:
                        raise PermissionError('Browser Lite build file changed type or shares an inode')
                    mode = 0o755 if opened.st_mode & 0o111 else 0o644
                    out = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
                    with os.fdopen(out, 'wb') as stream:
                        os.fchmod(stream.fileno(), mode)
                        while data := os.read(child, 1024 * 1024):
                            size += len(data)
                            if size > 2 * 1024 ** 3:
                                raise ValueError('Browser Lite build exceeds size limit')
                            stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                finally:
                    os.close(child)
            else:
                raise PermissionError('Browser Lite build contains a special file')
    source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        copy_directory(source_fd, Path(destination))
    finally:
        os.close(source_fd)


def publish(source, releases, builder_uid, *, node_version):
    if os.geteuid() != 0 or builder_uid == 0:
        raise PermissionError('Root must publish a nonroot build')
    releases = Path(releases)
    # All publication ancestors must be controlled by root; a writable staging
    # ancestor would let the builder exchange the destination during the copy.
    for path in (releases, *releases.parents):
        metadata = path.lstat()
        if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0
                or metadata.st_mode & 0o022):
            raise PermissionError('Invalid Browser Lite publication directory')
    stage = Path(tempfile.mkdtemp(prefix='.publish-', dir=releases))
    try:
        copy_build(source, stage, builder_uid)
        manifest = validate(stage, node_version=node_version)
        destination = releases / manifest['revision']
        if destination.exists() or destination.is_symlink():
            if validate(destination, node_version=node_version) != manifest:
                raise ValueError('Existing Browser Lite release manifest differs')
        else:
            stage.chmod(0o755)
            os.rename(stage, destination)
        directory_fd = os.open(releases, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return destination, manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage)
