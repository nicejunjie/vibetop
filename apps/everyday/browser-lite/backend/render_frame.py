#!/usr/bin/env python3
"""Generate the committed hash-protected frame. Tests guard exact script bytes."""
import base64
import hashlib
import re
from pathlib import Path
root=Path(__file__).resolve().parent.parent
script=(root/'browser-lite-renderer.js').read_text().replace('</script','<\\/script')
sha=base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
html=(root/'browser-lite-frame.src.html').read_text().replace('@SCRIPT_HASH@',sha).replace('@RENDERER@',script)
(root/'browser-lite-frame.html').write_text(html)
# Keep the toolbar's cached script tied to its actual bytes, including on
# ordinary installs that deliberately leave the desktop service worker alone.
toolbar=root/'browser-lite.html'
version=hashlib.sha256((root/'browser-lite.js').read_bytes()).hexdigest()[:12]
toolbar.write_text(re.sub(r'(/browser-lite\.js)(?:\?v=[a-f0-9]+)?',r'\1?v='+version,toolbar.read_text()))
