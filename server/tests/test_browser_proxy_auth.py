import copy
import pytest
from browser_proxy_auth import BrowserAuthority, unique_cookie


def authority():
    clock = [1000]
    auth = BrowserAuthority(b"a" * 32, "realms.example.com", "https://browser-lite.example.com",
                            ["https://vibetop.example.com"], now=lambda: clock[0])
    return auth, clock


def lease(auth, uid=1000, user="alice", token="main-a"):
    handoff = auth.begin(uid, user, token, 90000, "https://vibetop.example.com", expected_epoch=0)
    return auth.redeem(handoff, "https://vibetop.example.com", "iframe", "navigate")


def test_device_capabilities_are_purpose_user_and_profile_bound():
    auth, _ = authority()
    a, b = lease(auth), lease(auth, 1001, "bob", "main-b")
    for role in ("ui", "content", "relay"):
        token = auth.mint(role, a)
        assert auth.verify(token, role, 1000)["lease"] == a
        with pytest.raises(ValueError):
            auth.verify(token, role, 1001)
        for other in {"ui", "content", "relay", "entry"} - {role}:
            with pytest.raises(ValueError):
                auth.verify(token, other, 1000)
        with pytest.raises(ValueError):
            auth.verify(token[:-2] + "aa", role, 1000)
    assert auth.verify(auth.mint("ui", b), "ui")["uid"] == 1001


def test_one_device_logout_does_not_revoke_another_device():
    auth, _ = authority()
    a, b = lease(auth), lease(auth, token="main-b")
    first, second = auth.mint("relay", a), auth.mint("relay", b)
    auth.revoke_session("main-a")
    with pytest.raises(ValueError):
        auth.verify(first, "relay")
    assert auth.verify(second, "relay")["lease"] == b


def test_logout_all_revokes_capabilities_but_preserves_realm_and_engine_identity():
    auth, _ = authority()
    a = lease(auth)
    token, before = auth.mint("content", a), auth.realm_config(1000)
    auth.revoke_user(1000)
    with pytest.raises(ValueError):
        auth.verify(token, "content")
    after = auth.realm_config(1000)
    assert before["secret"] == after["secret"]
    assert before["engineSessionId"] == after["engineSessionId"]
    assert after["epoch"] == before["epoch"] + 1


def test_bootstrap_requires_exact_source_and_is_one_use():
    auth, _ = authority()
    ticket = auth.begin(1000, "alice", "main-a", 90000, "https://vibetop.example.com", expected_epoch=0)
    with pytest.raises(ValueError):
        auth.redeem(ticket, "https://content.example.com", "iframe", "navigate")
    with pytest.raises(ValueError):
        auth.redeem(ticket, "https://vibetop.example.com", "empty", "cors")
    a = auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    with pytest.raises(ValueError):
        auth.redeem(ticket, "https://vibetop.example.com", "iframe", "navigate")
    renewal = auth.begin(1000, "alice", "main-a", 90000, "https://vibetop.example.com", expected_epoch=0)
    assert auth.redeem(renewal, auth.ui_origin, "empty", "cors") == a


def test_entry_permit_is_host_ticket_source_bound_and_cannot_reissue_cookies():
    auth, _ = authority()
    a = lease(auth)
    host = "bl-u1000-" + "a" * 32 + ".realms.example.com"
    ticket = "x" * 43
    permit = auth.entry_permit("https://" + host + "/__vt/entry?ticket=" + ticket, a)
    for wrong_host, wrong_ticket, referer in [(host.replace("1000", "1001"), ticket, auth.ui_origin),
                                             (host, "y" * 43, auth.ui_origin), (host, ticket, "https://evil.example.com")]:
        with pytest.raises(ValueError):
            auth.consume_entry(permit, wrong_host, wrong_ticket, referer, "iframe", "navigate")
    assert auth.consume_entry(permit, host, ticket, auth.ui_origin, "iframe", "navigate")["lease"] == a
    with pytest.raises(ValueError):
        auth.consume_entry(permit, host, ticket, auth.ui_origin, "iframe", "navigate")
    restored = BrowserAuthority(auth.master, auth.domain, auth.ui_origin, auth.main_origins,
                                state=copy.deepcopy(auth.state), now=auth.now)
    with pytest.raises(ValueError):
        restored.consume_entry(permit, host, ticket, auth.ui_origin, "iframe", "navigate")


@pytest.mark.parametrize("entry", ["http://bl-u1000-" + "a" * 32 + ".realms.example.com/__vt/entry?ticket=" + "x" * 43,
                                  "https://evil.example.com/__vt/entry?ticket=" + "x" * 43,
                                  "https://bl-u1001-" + "a" * 32 + ".realms.example.com/__vt/entry?ticket=" + "x" * 43,
                                  "https://bl-u1000-" + "a" * 32 + ".realms.example.com/api/login?ticket=" + "x" * 43])
def test_untrusted_daemon_cannot_sign_arbitrary_entry_addresses(entry):
    auth, _ = authority()
    with pytest.raises(ValueError):
        auth.entry_permit(entry, lease(auth))


def test_expiry_and_external_main_session_revocation():
    auth, clock = authority()
    a = lease(auth)
    token = auth.mint("ui", a, 10)
    clock[0] += 10
    with pytest.raises(ValueError):
        auth.verify(token, "ui")
    token = auth.mint("ui", a)
    auth.main_epoch = lambda user: 1
    with pytest.raises(ValueError):
        auth.verify(token, "ui")


def test_duplicate_cookie_and_unknown_hostname_fail_closed():
    assert unique_cookie("a=1; browser=good; browser=bad", "browser") is None
    auth, _ = authority()
    for host in ("example.com", "bl-u01000-" + "a" * 32 + ".realms.example.com",
                 "bl-u1000-" + "a" * 32 + ".realms.example.com.evil", "bl-u1000-" + "a" * 32 + ".realms.example.com:443"):
        with pytest.raises(ValueError):
            auth.host_uid(host)


def test_logout_between_main_auth_and_bootstrap_cannot_create_lease():
    auth, _ = authority()
    auth.main_epoch = lambda user: 1
    with pytest.raises(ValueError, match="revoked"):
        auth.begin(1000, "alice", "old-main-session", 90000, "https://vibetop.example.com", expected_epoch=0)
    assert not auth.state["leases"]


def test_device_logout_blocks_already_authenticated_delayed_bootstrap():
    auth, _ = authority()
    lease(auth)
    auth.revoke_session("main-a")
    with pytest.raises(ValueError, match="revoked"):
        lease(auth)
    restored = BrowserAuthority(auth.master, auth.domain, auth.ui_origin, auth.main_origins,
                                state=copy.deepcopy(auth.state), now=auth.now)
    with pytest.raises(ValueError, match="revoked"):
        lease(restored)
    assert lease(restored, token="new-login")


@pytest.mark.parametrize("domain,ui,main", [
    ("example.com", "https://bl-ui.example.com", "https://vibetop.example.com"),
    ("example.com", "https://browser-lite.example.com", "https://bl-u0-00000000000000000000000000000000.example.com"),
    ("example.com", "https://example.com", "https://vibetop.example.com"),
    ("realms.example.com", "https://realms.example.com", "https://vibetop.example.com"),
])
def test_trusted_hosts_cannot_occupy_the_realm_namespace(domain, ui, main):
    with pytest.raises(ValueError, match="realm namespace"):
        BrowserAuthority(b"a" * 32, domain, ui, [main])


def test_single_label_realms_share_the_parent_domain_with_trusted_hosts():
    # Free Cloudflare certificates cover one level only, so production realms are
    # bl-u<uid>-<hash>.nicejunjie.com beside vibetop/browser-lite.nicejunjie.com.
    authority = BrowserAuthority(b"a" * 32, "example.com", "https://browser-lite.example.com",
                                 ["https://vibetop.example.com"])
    assert authority.host_uid("bl-u1000-" + "a" * 32 + ".example.com") == 1000
    with pytest.raises(ValueError, match="Unknown browser host"):
        authority.host_uid("vibetop.example.com")
