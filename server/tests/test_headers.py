"""Content-Disposition: one constructor, and it cannot split a response.

A Linux filename may contain CR and LF, and BaseHTTPRequestHandler.send_header
does not reject control characters — it latin-1 encodes whatever it is handed.
Interpolating a raw basename into a quoted filename= therefore let a crafted
name emit extra response-header lines. On the public /s/ share path an
authenticated user could mint a capability URL that served that response to
somebody else, so this is not merely a local curiosity.
"""
import http.client
import io
import re

import pytest


@pytest.fixture
def cd(mgr):
    return mgr._content_disposition


# ---- the injection itself --------------------------------------------------

@pytest.mark.parametrize("evil", [
    "report\r\nX-Audit: injected.pdf",
    "report\rX-Audit: injected.pdf",
    "report\nX-Audit: injected.pdf",
    "a\r\n\r\n<html>owned</html>",
    "\r\nSet-Cookie: vt_session=forged",
])
def test_no_filename_can_emit_a_second_header_line(cd, evil):
    """The header value must be a single line whatever the file is called."""
    v = cd(evil)
    assert "\r" not in v and "\n" not in v
    # and it must survive the actual encoder without becoming two lines
    assert len(f"Content-Disposition: {v}\r\n".encode("latin-1").split(b"\r\n")) == 2


def test_the_header_still_parses_as_one_header(mgr):
    """Belt and braces: feed a crafted name through Python's own header parser
    and assert nothing extra appeared."""
    v = mgr._content_disposition("x\r\nX-Injected: 1.txt")
    msg = http.client.parse_headers(
        io.BytesIO(f"Content-Disposition: {v}\r\n\r\n".encode("latin-1")))
    assert list(msg.keys()) == ["Content-Disposition"]
    assert "X-Injected" not in msg


@pytest.mark.parametrize("ch", ['"', "\\", ";", ","])
def test_separators_cannot_escape_the_quoted_fallback(cd, ch):
    """A quote or semicolon in the ASCII fallback would end the quoted string or
    start a new parameter."""
    fb = re.search(r'filename="([^"]*)"', cd(f"a{ch}b.txt")).group(1)
    assert ch not in fb


# ---- and it is still a useful header --------------------------------------

def test_the_real_name_survives_in_filename_star(cd):
    """The sanitised fallback is for ancient clients; every modern browser reads
    filename*, so the true name (CJK, emoji, spaces) must be preserved there."""
    v = cd("季度报告 2026.docx")
    assert "filename*=UTF-8''%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A%202026.docx" in v


def test_inline_and_attachment_dispositions(cd):
    assert cd("a.jpg", inline=True).startswith("inline;")
    assert cd("a.jpg").startswith("attachment;")


def test_a_path_is_reduced_to_its_basename(cd):
    """Every caller passes something path-shaped at least once; a traversal
    sequence must not reach the client as a suggested save name."""
    assert 'filename="passwd"' in cd("/home/alice/../../etc/passwd")


def test_an_empty_or_unnameable_file_still_gets_a_name(cd):
    for bad in ("", None, "/", "\r\n", "…"):
        v = cd(bad)
        assert 'filename=""' not in v, bad
        assert v.startswith("attachment; filename=")


def test_a_very_long_name_is_bounded(cd):
    """Header lines are not unbounded; an 8k filename is a bad response even
    when it is not an injection."""
    fb = re.search(r'filename="([^"]*)"', cd("a" * 9000 + ".txt")).group(1)
    assert len(fb) <= 255


# ---- every download path goes through it ----------------------------------

def test_no_download_path_builds_the_header_by_hand():
    """The bug was five hand-rolled interpolations, three of which stripped only
    double quotes. New download endpoints must reuse the constructor."""
    import pathlib
    src = pathlib.Path(__file__).parents[1].joinpath("terminal-manager.py").read_text()
    body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
    for hit in re.finditer(r'send_header\(\s*"Content-Disposition",\s*(.*?)\)\n',
                           body, re.S):
        arg = hit.group(1).strip()
        assert arg.startswith("_content_disposition(") or arg == '"inline"', \
            f"hand-built Content-Disposition: {arg[:80]}"
