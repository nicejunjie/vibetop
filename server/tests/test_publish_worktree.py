"""publish-worktree.sh carries the shared home checkout forward after a push.

Releases are committed in worktrees, so nothing else moves home `main`; it used
to sit on an old release while later sessions edited on top of it."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
ENV = {'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@t', 'GIT_COMMITTER_NAME': 't',
       'GIT_COMMITTER_EMAIL': 't@t', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1',
       'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/nonexistent'}


def git(cwd, *args):
    return subprocess.run(['git', '-C', str(cwd), *args], env=ENV, check=True,
                          capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repos(tmp_path):
    origin, home = tmp_path / 'origin.git', tmp_path / 'home'
    git(tmp_path, 'init', '-q', '--bare', '-b', 'main', str(origin))
    git(tmp_path, 'clone', '-q', str(origin), str(home))
    (home / 'tools').mkdir()
    shutil.copy(ROOT / 'tools/publish-worktree.sh', home / 'tools/publish-worktree.sh')
    (home / 'a.txt').write_text('one\n')
    (home / 'b.txt').write_text('one\n')
    git(home, 'add', '-A'); git(home, 'commit', '-qm', 'base'); git(home, 'push', '-q', 'origin', 'main')
    work = tmp_path / 'work'
    git(home, 'worktree', 'add', '-q', '-b', 'work/x', str(work), 'origin/main')
    (work / 'a.txt').write_text('two\n')
    git(work, 'commit', '-qam', 'release')
    return home, work


def publish(work):
    return subprocess.run(['bash', 'tools/publish-worktree.sh'], cwd=work, env=ENV,
                          capture_output=True, text=True)


def test_clean_home_is_fast_forwarded(repos):
    home, work = repos
    result = publish(work)
    assert result.returncode == 0, result.stderr
    assert git(home, 'rev-parse', 'HEAD') == git(work, 'rev-parse', 'HEAD')
    assert (home / 'a.txt').read_text() == 'two\n'


def test_copy_of_the_release_is_dropped_and_unrelated_edits_kept(repos):
    home, work = repos
    (home / 'a.txt').write_text('two\n')      # the copy the release was made from
    git(home, 'add', 'a.txt')                  # even when staged
    (home / 'b.txt').write_text('mine\n')     # unrelated work in progress
    result = publish(work)
    assert result.returncode == 0, result.stderr
    assert git(home, 'rev-parse', 'HEAD') == git(work, 'rev-parse', 'HEAD')
    assert git(home, 'status', '--porcelain') == 'M b.txt'
    assert (home / 'b.txt').read_text() == 'mine\n'


def test_different_edit_to_a_released_file_is_never_overwritten(repos):
    home, work = repos
    (home / 'a.txt').write_text('other\n')
    result = publish(work)
    assert result.returncode == 0, 'the push succeeded; the home sync only warns'
    assert 'update it by hand' in result.stderr
    assert (home / 'a.txt').read_text() == 'other\n'
    assert git(home, 'rev-parse', 'HEAD') != git(work, 'rev-parse', 'HEAD')


def test_home_with_its_own_commits_is_left_alone(repos):
    home, work = repos
    (home / 'b.txt').write_text('local\n')
    git(home, 'commit', '-qam', 'local')
    before = git(home, 'rev-parse', 'HEAD')
    result = publish(work)
    assert result.returncode == 0
    assert 'not on origin/main' in result.stderr
    assert git(home, 'rev-parse', 'HEAD') == before
