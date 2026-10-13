"""Bounded, dependency-free Browser Lite protocol/CSS helpers."""
import hashlib
import json
import re
from urllib.parse import urljoin, urlsplit

MAX_NODES = 20000
MAX_BASELINE = 8 * 1024 * 1024
CHUNK_BYTES = 256 * 1024
MAX_ASSET = 8 * 1024 * 1024
SAFE_MIME = ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
             'font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff',
             'application/x-font-ttf', 'application/vnd.ms-fontobject')

class LiteError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def validate_url(value):
    if not isinstance(value, str) or not value or len(value) > 8192:
        raise LiteError('url', 'Enter an HTTP or HTTPS address.')
    try:
        u = urlsplit(value)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
            raise ValueError()
        _ = u.port
    except ValueError:
        raise LiteError('url', 'Only HTTP and HTTPS addresses without embedded passwords are supported.') from None
    return value


def pack(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def chunks(records):
    result, chunk, size = [], [], 0
    for record in records:
        length = len(pack(record)) + 1
        if chunk and size + length > CHUNK_BYTES:
            result.append(chunk); chunk, size = [], 0
        chunk.append(record); size += length
    if chunk or not result:
        result.append(chunk)
    return result


def delta(old, new):
    """A flat keyed graph: changes are upserts; absent IDs are removals."""
    before = {n['id']: n for n in old}
    after = {n['id']: n for n in new}
    return {'put': [n for n in new if before.get(n['id']) != n],
            'remove': [n['id'] for n in old if n['id'] not in after]}


def css_unescape(value):
    def unescape(m):
        if m.group(1):
            n = int(m.group(1), 16)
            return chr(n) if 0 < n <= 0x10ffff else '\ufffd'
        return m.group(2) or ''
    return re.sub(r'\\(?:([0-9a-fA-F]{1,6})\s?|([^\r\n]))', unescape, value)


def css_quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\a ') + '"'


def css_tokens(text):
    """Scan URL/import tokens, respecting CSS strings, comments and escapes."""
    i, n = 0, len(text)
    def string_end(start):
        quote = text[start]; j = start + 1
        while j < n:
            if text[j] == '\\': j += 2
            elif text[j] == quote: return j + 1
            else: j += 1
        return n
    while i < n:
        if text.startswith('/*', i):
            end = text.find('*/', i + 2); i = n if end < 0 else end + 2; continue
        if text[i] in '\"\'': i = string_end(i); continue
        if text[i:i+7].lower() == '@import' and (i+7 == n or not text[i+7].isalnum()):
            start, j = i, i + 7; depth = 0
            while j < n:
                if text[j] in '\"\'': j = string_end(j); continue
                if text.startswith('/*', j):
                    end = text.find('*/', j+2); j = n if end < 0 else end+2; continue
                if text[j] == '(': depth += 1
                if text[j] == ')': depth -= 1
                if text[j] == ';' and depth == 0: j += 1; break
                j += 1
            yield ('import', start, j, text[i+7:j].rstrip(';').strip()); i = j; continue
        # Recognize escaped identifiers too; hostile URLs are ultimately also
        # blocked by frame CSP. Retained unknown CSS must never authorize fetch.
        if text[i].isalpha() or text[i] == '\\':
            j = i
            while j < n and (text[j].isalnum() or text[j] in '_-\\'):
                if text[j] == '\\':
                    j += 1
                    h = re.match(r'[0-9a-fA-F]{1,6}\s?', text[j:])
                    j += len(h[0]) if h else min(1,n-j)
                else: j += 1
            ident = css_unescape(text[i:j]).lower(); k = j
            while k < n and text[k].isspace(): k += 1
            if ident == 'url' and k < n and text[k] == '(':
                end = k + 1
                while end < n:
                    if text[end] in '\"\'': end = string_end(end); continue
                    if text[end] == '\\': end += 2; continue
                    if text[end] == ')': break
                    end += 1
                raw = text[k+1:end].strip()
                if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in '\"\'': raw = raw[1:-1]
                yield ('url', i, min(n,end+1), css_unescape(raw)); i = min(n,end+1); continue
            i = max(j, i+1); continue
        i += 1


def rewrite_css(text, base, register):
    out, pos = [], 0
    for kind, start, end, value in css_tokens(text):
        out.append(text[pos:start])
        if kind == 'import':
            out.append('/* imported separately by Browser Lite */')
        elif value.startswith('#'):
            out.append('url(' + css_quote(value) + ')')
        else:
            absolute = urljoin(base, value)
            rid = register(absolute)
            out.append('url(' + css_quote('lite-asset:' + rid if rid else 'data:,') + ')')
        pos = end
    out.append(text[pos:])
    return ''.join(out)


def import_spec(value, base):
    """Ordinary import URL and optional media; layer/supports explicitly unsupported."""
    if value.startswith(('"', "'")):
        quote = value[0]; j = 1
        while j < len(value):
            if value[j] == '\\': j += 2
            elif value[j] == quote: break
            else: j += 1
        url, media = css_unescape(value[1:j]), value[j+1:].strip()
    else:
        tokens = list(css_tokens(value))
        if not tokens or tokens[0][0] != 'url' or tokens[0][1] != 0: return None
        token = tokens[0]; url, media = token[3], value[token[2]:].strip()
    if re.search(r'\b(?:layer|supports)\b', media, re.I): return None
    try: return validate_url(urljoin(base,url)), media
    except LiteError: return None
