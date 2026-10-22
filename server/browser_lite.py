"""Root's authenticated, bounded proxy to Browser Lite's per-UID Unix agents.

No browser/website code or user file reads execute in this process.
"""
import collections
import contextlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import struct
import subprocess
import threading
import time

RUN_DIR=Path('/run/vibetop/browser-lite')
RUNTIME=Path(os.environ.get('VIBETOP_BROWSER_LITE_DIR','/opt/vibetop/browser-lite'))
MAX_REQ=256*1024
MAX_RESPONSE=16*1024*1024
_locks=collections.defaultdict(threading.Lock)
_slots_lock=threading.Lock()
_slots=collections.Counter()
_ALLOWED={'session','action','updates','ack','resource','pages'}


def unit(user):
    return 'vibetop-browserlite-'+str(pwd.getpwnam(user).pw_uid)+'.service'


def stop(user):
    """Reset/logout-all closes Lite pages, preserving the user's website profile."""
    with contextlib.suppress(OSError,subprocess.SubprocessError,KeyError):
        subprocess.run(['systemctl','stop',unit(user)],capture_output=True,timeout=15)


def _connect(user):
    pw=pwd.getpwnam(user)
    s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(23)
    try:
        s.connect(str(RUN_DIR/str(pw.pw_uid)/'agent.sock'))
        _,uid,_=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize('3i')))
        if uid!=pw.pw_uid:raise PermissionError('Browser Lite agent identity mismatch')
        return s
    except Exception:s.close();raise


def _call(user,body,timeout=23):
    with _connect(user) as sock:
        sock.settimeout(timeout);sock.sendall(json.dumps(body,separators=(',',':')).encode()+b'\n')
        sock.shutdown(socket.SHUT_WR);buf=bytearray()
        while len(buf)<=MAX_RESPONSE:
            part=sock.recv(65536)
            if not part:break
            buf.extend(part)
        if len(buf)>MAX_RESPONSE:raise ValueError('Browser Lite response too large')
        result=json.loads(buf)
        if not isinstance(result,dict):raise ValueError('Invalid agent response')
        return result


def _alive(user):
    try:return subprocess.run(['systemctl','is-active','--quiet',unit(user)],timeout=3).returncode==0
    except (OSError,subprocess.SubprocessError):return False


def _prepare(user):
    pw=pwd.getpwnam(user)
    RUN_DIR.mkdir(parents=True,exist_ok=True,mode=0o755)
    st=RUN_DIR.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:raise PermissionError('Invalid Browser Lite runtime directory')
    child=RUN_DIR/str(pw.pw_uid)
    try:child.mkdir(mode=0o700)
    except FileExistsError:pass
    st=child.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid not in (0,pw.pw_uid):raise PermissionError('Invalid Browser Lite user directory')
    os.chown(child,pw.pw_uid,pw.pw_gid);os.chmod(child,0o700)
    return child


def _caps(props):
    values={'MemoryMax':'2G','CPUQuota':'200%','TasksMax':'256'}
    def bytes_value(s):
        m=re.fullmatch(r'(\d+(?:\.\d+)?)([KMGT]?)',s,re.I)
        return float(m[1])*1024**('KMGT'.find(m[2].upper())+1) if m else float('inf')
    others=[]
    for i,p in enumerate(props):
        if p!='--property' or i+1>=len(props):continue
        name,_,value=props[i+1].partition('=')
        if name not in values:others+=['--property',props[i+1]];continue
        try:
            if name=='MemoryMax':smaller=bytes_value(value)<bytes_value(values[name])
            else:smaller=float(value.rstrip('%'))<float(values[name].rstrip('%'))
            if smaller:values[name]=value
        except ValueError:pass
    return [item for k,v in values.items() for item in ('--property',k+'='+v)]+others


def ensure(user,props):
    with _locks[user]:
        try:
            if _call(user,{'op':'health'},2).get('ok'):return
        except (OSError,ValueError):pass
        # A timeout cannot justify restarting a healthy browser with live forms.
        if _alive(user):return
        if not (RUNTIME/'manifest.json').is_file():raise RuntimeError('Browser Lite needs its optional runtime installed.')
        pw=pwd.getpwnam(user);child=_prepare(user)
        command=['systemd-run','--collect','--uid='+user,'--gid='+str(pw.pw_gid),
                 '--unit='+unit(user),'--property=WorkingDirectory='+pw.pw_dir,
                 '--setenv=HOME='+pw.pw_dir,'--setenv=PLAYWRIGHT_BROWSERS_PATH='+str(RUNTIME/'browsers')]
        command+=_caps(props)
        command+=[str(RUNTIME/'venv/bin/python'),str(RUNTIME/'backend/agent.py'),
                  '--sock',str(child/'agent.sock'),'--profile',str(Path(pw.pw_dir)/'.local/share/vibetop/browser-lite/profile')]
        result=subprocess.run(command,capture_output=True,timeout=30)
        if result.returncode:raise RuntimeError('Browser Lite could not start. Check its optional runtime installation.')
        for _ in range(30):
            try:
                if _call(user,{'op':'health'},1).get('ok'):return
            except (OSError,ValueError):pass
            time.sleep(.1)
        raise RuntimeError('Browser Lite is starting. Try reconnecting shortly.')


def handle(handler,user,props):
    path=handler.path.split('?',1)[0];op=path.removeprefix('/api/browser-lite/')
    if op not in _ALLOWED:return handler._json(404,{'ok':False,'message':'Unknown Browser Lite endpoint.'})
    if handler.command!='POST':return handler._json(405,{'ok':False,'message':'Use POST for Browser Lite requests.'})
    slot='poll' if op=='updates' else 'asset' if op=='resource' else 'action'
    limits={'poll':(3,24),'asset':(4,32),'action':(4,32)}
    with _slots_lock:
        if _slots[(user,slot)]>=limits[slot][0] or _slots[('*',slot)]>=limits[slot][1]:
            handler.send_response(503);handler.send_header('Retry-After','2');handler.send_header('Content-Length','0');handler.end_headers();return
        _slots[(user,slot)]+=1;_slots[('*',slot)]+=1
    try:
        try:length=int(handler.headers.get('Content-Length','0'))
        except ValueError:length=0
        if not 0<length<=MAX_REQ:return handler._json(413,{'ok':False,'message':'Invalid request size.'})
        handler.connection.settimeout(25)
        body=json.loads(handler.rfile.read(length))
        if not isinstance(body,dict):raise ValueError()
        body['op']=op
        if op in ('session','pages'):ensure(user,props)
        result=_call(user,body)
        status=200 if result.get('ok') else result.get('status',503)
        if status not in (200,400,404,409,413,415,422,429,503):status=503
        handler._json(status,result)
    except OSError:
        if op not in ('session','pages') and not _alive(user):
            handler._json(409,{'ok':False,'code':'expired','message':'Browser Lite session ended. Reconnect to restore your address.'})
        else:handler._json(503,{'ok':False,'code':'unavailable','message':'Browser Lite connection interrupted. Reconnect shortly.'})
    except (ValueError,RuntimeError,subprocess.SubprocessError):
        handler._json(503,{'ok':False,'code':'unavailable','message':'Browser Lite is unavailable. Install its runtime or reconnect shortly.'})
    finally:
        with _slots_lock:_slots[(user,slot)]-=1;_slots[('*',slot)]-=1
