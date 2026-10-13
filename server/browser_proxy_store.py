"""Durable root identity metadata, separate from all website-owned files."""
import fcntl
import json
import os
import secrets
import stat


class IdentityStore:
    MAX_BYTES = 8 * 1024 * 1024

    def __init__(self, directory, *, owner=0):
        # The installer creates this directory under a trusted root-owned parent.
        self.owner = owner
        self.fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.lock_fd = None
        try:
            st = os.fstat(self.fd)
            if st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o700:
                raise PermissionError("Invalid browser identity directory")
            self.lock_fd = os.open("lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW,
                                   0o600, dir_fd=self.fd)
            self._check(self.lock_fd)
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                self.master = self._read("master", 32)
            except FileNotFoundError:
                # Never regenerate a lost signing key over existing identity state.
                try:
                    os.stat("state.json", dir_fd=self.fd, follow_symlinks=False)
                except FileNotFoundError:
                    pass
                else:
                    raise ValueError("Browser identity key is missing")
                self.master = secrets.token_bytes(32)
                self._write("master", self.master)
            if len(self.master) != 32:
                raise ValueError("Invalid browser identity key")
            try:
                self.state = json.loads(self._read("state.json", self.MAX_BYTES))
            except FileNotFoundError:
                self.state = None
        except BaseException:
            self.close()
            raise

    def _check(self, fd):
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != self.owner or stat.S_IMODE(st.st_mode) != 0o600:
            raise PermissionError("Invalid browser identity file")

    def _read(self, name, limit):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.fd)
        try:
            self._check(fd)
            if os.fstat(fd).st_size > limit:
                raise ValueError("Browser identity file is too large")
            with os.fdopen(fd, "rb", closefd=False) as stream:
                result = stream.read(limit + 1)
            if len(result) > limit:
                raise ValueError("Browser identity file is too large")
            return result
        finally:
            os.close(fd)

    def _write(self, name, value):
        temporary = "." + name + "." + secrets.token_hex(12)
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=self.fd)
        try:
            with os.fdopen(fd, "wb", closefd=False) as stream:
                stream.write(value)
                stream.flush()
                os.fsync(fd)
            os.rename(temporary, name, src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd)
        finally:
            os.close(fd)
            try:
                os.unlink(temporary, dir_fd=self.fd)
            except FileNotFoundError:
                pass

    def save(self, state):
        value = json.dumps(state, separators=(",", ":"), allow_nan=False).encode()
        if len(value) > self.MAX_BYTES:
            raise ValueError("Browser identity storage limit")
        self._write("state.json", value)

    def close(self):
        if self.lock_fd is not None:
            os.close(self.lock_fd)
            self.lock_fd = None
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
