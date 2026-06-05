#!/usr/bin/env bash
# Auto-restart wrapper for the browser application inside xpra.
# install.sh renders @BROWSER_CMD@ before deploying.
set -u
while true; do
    @BROWSER_CMD@
    sleep 2
done
