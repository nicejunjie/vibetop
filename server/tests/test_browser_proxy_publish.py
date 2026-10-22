import os
from pathlib import Path

import pytest
from browser_proxy_publish import copy_build


def tree(tmp_path):
    source, target = tmp_path / 'build', tmp_path / 'copy'
    source.mkdir(mode=0o755)
    target.mkdir(mode=0o700)
    return source, target


def test_copy_preserves_internal_links_but_never_shared_inodes(tmp_path):
    source, target = tree(tmp_path)
    (source / 'module').mkdir(mode=0o755)
    code = source / 'module' / 'code.js'
    code.write_text('code')
    code.chmod(0o644)
    (source / 'entry.js').symlink_to('module/code.js')
    copy_build(source, target, os.getuid())
    assert (target / 'entry.js').is_symlink()
    assert (target / 'entry.js').read_text() == 'code'
    assert (target / 'module/code.js').stat().st_ino != code.stat().st_ino


@pytest.mark.parametrize('kind', ['fifo', 'absolute-link', 'hardlink', 'writable', 'directory-link'])
def test_copy_rejects_unsafe_source_entries(tmp_path, kind):
    source, target = tree(tmp_path)
    if kind == 'fifo':
        os.mkfifo(source / 'entry')
    elif kind == 'absolute-link':
        (source / 'entry').symlink_to('/etc/passwd')
    elif kind == 'directory-link':
        (source / 'entry').symlink_to('/etc', target_is_directory=True)
    else:
        item = source / 'entry'
        item.write_text('data')
        item.chmod(0o644)
        if kind == 'hardlink':
            os.link(item, tmp_path / 'external')
        else:
            item.chmod(0o666)
    with pytest.raises(PermissionError):
        copy_build(source, target, os.getuid())


def test_source_directory_cannot_be_a_symlink(tmp_path):
    source, target = tree(tmp_path)
    link = tmp_path / 'link'
    link.symlink_to(source, target_is_directory=True)
    with pytest.raises(OSError):
        copy_build(link, target, os.getuid())


def test_wrong_builder_identity_is_rejected(tmp_path):
    source, target = tree(tmp_path)
    with pytest.raises(PermissionError):
        copy_build(source, target, os.getuid() + 1)


def test_restrictive_root_umask_does_not_make_release_unreadable(tmp_path):
    source, target = tree(tmp_path)
    (source / 'module').mkdir(mode=0o755)
    item = source / 'module' / 'code.js'
    item.write_text('code')
    item.chmod(0o644)
    previous = os.umask(0o077)
    try:
        copy_build(source, target, os.getuid())
    finally:
        os.umask(previous)
    assert (target / 'module').stat().st_mode & 0o777 == 0o755
    assert (target / 'module/code.js').stat().st_mode & 0o777 == 0o644
