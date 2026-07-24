# Disposable vibetop instance for e2e tests — the REAL stack via deploy.sh, in a
# throwaway systemd container. Runs --no-browser --no-office so it's lean and
# container-friendly (no xpra/Chromium snap/Docker-in-Docker): nginx + the manager
# + ttyd + FileBrowser, which is everything the shell smoke suite drives. The
# heavy canvas apps are tested at the API seam, so they aren't needed here.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
# systemd as PID 1 so the manager's systemd units (and per-user systemd-run) work.
RUN apt-get update && apt-get install -y --no-install-recommends \
        systemd systemd-sysv sudo ca-certificates curl git rsync procps iproute2 \
        python3 nginx \
    # nginx must be RUNNING before deploy.sh's installers (they only *reload* it,
    # assuming apt already started it — true on a real host boot, not in a
    # container). Enable it so systemd starts it at boot, before firstboot deploys;
    # otherwise the first install.sh reload fails and deploy.sh aborts (set -e)
    # before landing/install.sh ever deploys the shell.
    && systemctl enable nginx \
    && rm -rf /var/lib/apt/lists/* \
    # Trim systemd units that are pointless in a container.
    && find /etc/systemd/system /lib/systemd/system \
        \( -name 'systemd-udevd*' -o -name 'systemd-modules-load*' \
           -o -name 'sys-kernel-*' \) -exec ln -sf /dev/null {} \; 2>/dev/null || true

# A real login user that owns the deploy + runs the desktop as themselves. Given
# passwordless sudo (deploy.sh shells out to sudo) and a known password (so PAM
# form-login also works if a test wants it). This is APP_USER, and — with
# VIBETOP_ADMINS unset — the default admin, so a minted cookie for it is an admin.
ARG E2E_USER=e2e
ARG E2E_PASS=e2e-passw0rd
RUN useradd -m -s /bin/bash "$E2E_USER" \
    && echo "$E2E_USER:$E2E_PASS" | chpasswd \
    && echo "$E2E_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$E2E_USER \
    && chmod 0440 /etc/sudoers.d/$E2E_USER \
    && loginctl enable-linger "$E2E_USER" 2>/dev/null || true

# The repo (build context is the repo root — see run.sh).
COPY --chown=e2e:e2e . /home/e2e/vibetop
RUN chown -R e2e:e2e /home/e2e/vibetop

# firstboot: run deploy.sh once, as the e2e user, after systemd is up.
COPY tests/e2e/docker/firstboot.sh /usr/local/bin/vibetop-firstboot.sh
COPY tests/e2e/docker/firstboot.service /etc/systemd/system/vibetop-firstboot.service
RUN chmod +x /usr/local/bin/vibetop-firstboot.sh \
    && systemctl enable vibetop-firstboot.service

EXPOSE 80
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
