import pytest
from browser_proxy_deploy import Activation


def fixture(tmp_path, failure=None):
    config, site, journal = (tmp_path / name for name in ('config', 'site', 'journal'))
    config.write_bytes(b'old config')
    site.write_bytes(b'old site')
    events = []
    failed = False
    def callback(name):
        def call():
            nonlocal failed
            events.append((name, config.read_bytes(), site.read_bytes()))
            if name == failure and not failed:
                failed = True
                raise RuntimeError('injected ' + name)
        return call
    activation = Activation(config=config, site=site, journal=journal,
        validate_nginx=callback('validate'), reload_nginx=callback('reload'),
        restart_manager=callback('restart'), health=callback('health'))
    return activation, events


def test_activation_validates_before_commit_and_restarts_after_reload(tmp_path):
    activation, events = fixture(tmp_path)
    assert activation.activate(b'new config', b'new site') == {'changed': True, 'pending': False}
    assert events == [('validate', b'old config', b'new site'), ('reload', b'new config', b'new site'),
                      ('restart', b'new config', b'new site'), ('health', b'new config', b'new site')]
    assert not activation.journal.exists()
    events.clear()
    assert activation.activate(b'new config', b'new site')['changed'] is False
    assert not events


@pytest.mark.parametrize('failure', ['validate', 'reload', 'restart', 'health'])
def test_failed_activation_restores_both_files_and_refreshes_manager(tmp_path, failure):
    activation, events = fixture(tmp_path, failure)
    with pytest.raises(RuntimeError, match='injected'):
        activation.activate(b'new config', b'new site')
    assert activation.config.read_bytes() == b'old config'
    assert activation.site.read_bytes() == b'old site'
    assert events[-2:] == [('restart', b'old config', b'old site'), ('health', b'old config', b'old site')]
    assert not activation.journal.exists()


def test_revision_only_change_does_not_reload_nginx(tmp_path):
    activation, events = fixture(tmp_path)
    activation.activate(b'new config', b'old site')
    assert [name for name, *_ in events] == ['validate', 'restart', 'health']


def test_update_defers_parent_restart_and_retains_recovery_journal(tmp_path):
    activation, events = fixture(tmp_path)
    assert activation.activate(b'new config', b'new site', defer_manager=True)['pending']
    assert [name for name, *_ in events] == ['validate', 'reload']
    assert activation.journal.exists()
    activation.finish()
    assert events[-1][0] == 'health' and not activation.journal.exists()


def test_interrupted_update_recovers_on_next_installer_run(tmp_path):
    activation, events = fixture(tmp_path)
    def crash():
        raise KeyboardInterrupt('simulated process death')
    activation.reload_nginx = crash
    with pytest.raises(KeyboardInterrupt):
        activation.activate(b'new config', b'new site')
    assert activation.journal.exists()
    activation.reload_nginx = lambda: events.append(('recovered reload',))
    assert activation.recover()
    assert activation.config.read_bytes() == b'old config'
    assert activation.site.read_bytes() == b'old site'
    assert not activation.recover()


def test_pending_update_cannot_be_confirmed_by_old_manager_or_replaced(tmp_path):
    activation, events = fixture(tmp_path)
    activation.activate(b'new config', b'new site', defer_manager=True)
    def old_manager():
        raise RuntimeError('manager still has old config hash')
    activation.health = old_manager
    with pytest.raises(RuntimeError, match='pending'):
        activation.recover()
    with pytest.raises(RuntimeError, match='pending'):
        activation.activate(b'other config', b'other site')
    assert activation.config.read_bytes() == b'new config'
    assert activation.journal.exists()
    activation.health = lambda: None  # Watchdog now observes exact candidate hash.
    assert activation.recover()
    assert not activation.journal.exists()


def test_failed_restore_retains_journal_for_repair_and_retry(tmp_path):
    activation, events = fixture(tmp_path)
    activation.activate(b'new config', b'new site', defer_manager=True)
    def broken_external_config():
        raise RuntimeError('missing TLS certificate')
    activation.validate_nginx = broken_external_config
    with pytest.raises(RuntimeError, match='certificate'):
        activation.rollback()
    assert activation.journal.exists()
    assert activation.config.read_bytes() == b'old config'
    activation.validate_nginx = lambda: None
    activation.rollback()
    assert not activation.journal.exists()


def test_finish_before_manager_adoption_rolls_back_instead_of_reporting_success(tmp_path):
    activation, events = fixture(tmp_path)
    activation.activate(b'new config', b'new site', defer_manager=True)
    def health():
        if activation.config.read_bytes() == b'new config':
            raise RuntimeError('manager still has old config hash')
    activation.health = health
    with pytest.raises(RuntimeError, match='old config'):
        activation.finish()
    assert activation.config.read_bytes() == b'old config'
    assert not activation.journal.exists()


def test_disabled_configuration_health_requires_absent_runtime(monkeypatch):
    import urllib.error
    import urllib.request
    import browser_proxy_deploy
    monkeypatch.setattr(browser_proxy_deploy, 'read_regular', lambda path: b'{"enabled":false}')
    def disabled(*args, **kwargs):
        raise urllib.error.HTTPError('http://127.0.0.1', 404, 'disabled', {}, None)
    monkeypatch.setattr(urllib.request, 'urlopen', disabled)
    browser_proxy_deploy.production_activation().health()


def test_hash_match_from_old_process_cannot_confirm_adoption(tmp_path):
    activation, events = fixture(tmp_path)
    identity = ['old-process']
    activation.manager_instance = lambda: identity[0]
    activation.activate(b'new config', b'new site', defer_manager=True)
    # Health succeeds, e.g. old code lazily loaded the new config. Still pending.
    with pytest.raises(RuntimeError, match='pending'):
        activation.recover_pending()
    assert activation.journal.exists()
    identity[0] = 'new-process'
    activation.recover_pending()
    assert not activation.journal.exists()
