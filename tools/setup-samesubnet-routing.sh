#!/usr/bin/env bash
# Fix a host that reaches ONE LAN subnet through TWO+ interfaces (e.g. ethernet +
# WiFi both on 192.168.x): ARP flux + asymmetric routing break long-lived
# WebSockets (vibetop terminals / Browser) ~10s in, for some clients only. See
# the "Dual-homed deploy host" gotcha in ../CLAUDE.md.
#
# It installs two host-local pieces (NOT managed by deploy.sh — re-run this after
# a reinstall):
#   1. ARP-flux sysctls: each IP is answered only on its own NIC.
#   2. A NetworkManager dispatcher doing source-based policy routing so a reply
#      leaves on the SAME interface the request arrived on. It AUTO-DETECTS
#      ip/subnet/gateway and uses one routing table per interface (100 + ifindex),
#      so it is network- and interface-agnostic and survives DHCP/subnet changes.
#
# Idempotent. Run as root:  sudo ./tools/setup-samesubnet-routing.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root: sudo $0" >&2; exit 1; }

SYSCTL=/etc/sysctl.d/99-vibetop-arp.conf
DISP=/etc/NetworkManager/dispatcher.d/50-vibetop-samesubnet-routing
SKIP_RE='^(lo|docker|veth|br-|virbr)'

cat > "$SYSCTL" <<'EOF'
# vibetop: stop ARP flux on a host with multiple NICs on the same LAN subnet —
# each interface answers ARP only for its own IP and announces the matching
# source, so clients/switch learn a stable MAC per IP. Pairs with the policy-
# routing dispatcher (50-vibetop-samesubnet-routing).
net.ipv4.conf.all.arp_ignore = 1
net.ipv4.conf.all.arp_announce = 2
net.ipv4.conf.default.arp_ignore = 1
net.ipv4.conf.default.arp_announce = 2
EOF
sysctl --system >/dev/null

cat > "$DISP" <<'EOF'
#!/bin/sh
# vibetop: make a host that's dual-homed on one subnet answer THROUGH THE INCOMING
# NIC. A reply is routed by the address the client connected to — which equals the
# interface it arrived on, once ARP flux is stopped — so replies leave on the same
# NIC, no asymmetric routing. Pure iproute2 (no iptables/firewall changes), so it
# can't clash with other software. Network-agnostic: auto-detects IP/subnet/
# gateway; one routing table per interface (100 + ifindex). Re-applied on every
# NetworkManager up/dhcp event.
IFACE="$1"; ACTION="$2"
case "$IFACE" in lo|""|docker*|veth*|br-*|virbr*) exit 0 ;; esac
IDX=$(cat "/sys/class/net/$IFACE/ifindex" 2>/dev/null) || exit 0
TABLE=$((100 + IDX)); PRIO=$TABLE
case "$ACTION" in
  up|dhcp4-change)
    IPCIDR=$(ip -4 -o addr show dev "$IFACE" scope global 2>/dev/null | awk '{print $4; exit}')
    [ -n "$IPCIDR" ] || exit 0
    IP=${IPCIDR%/*}
    NET=$(ip -4 route show dev "$IFACE" scope link 2>/dev/null | awk 'NR==1{print $1}')
    GW=$(ip -4 route show default dev "$IFACE" 2>/dev/null | awk '{print $3; exit}')
    [ -n "$NET" ] && ip route replace "$NET" dev "$IFACE" src "$IP" table "$TABLE"
    [ -n "$GW" ]  && ip route replace default via "$GW" dev "$IFACE" table "$TABLE"
    while ip rule del priority "$PRIO" 2>/dev/null; do :; done
    ip rule add priority "$PRIO" from "$IP" table "$TABLE"
    ;;
  down)
    while ip rule del priority "$PRIO" 2>/dev/null; do :; done
    ip route flush table "$TABLE" 2>/dev/null || true
    ;;
esac
exit 0
EOF
chmod 755 "$DISP"; chown root:root "$DISP"

# Drop any earlier host-specific copies (the original z20 install) so they can't
# double up or leave stale rules behind.
rm -f /etc/sysctl.d/99-z20-arp-flux.conf \
      /etc/NetworkManager/dispatcher.d/50-z20-samesubnet-routing
for p in 100 200; do
  while ip rule del priority "$p" 2>/dev/null; do :; done
  ip route flush table "$p" 2>/dev/null || true
done

# NetworkManager only fires the dispatcher on events, so apply it now for every
# currently-up real interface.
for IFACE in $(ls /sys/class/net | grep -vE "$SKIP_RE"); do
  [ "$(cat "/sys/class/net/$IFACE/operstate" 2>/dev/null)" = up ] && "$DISP" "$IFACE" up || true
done

echo "installed: $SYSCTL"
echo "installed: $DISP"
echo "active source-routing rules:"
ip rule show | grep -E 'lookup 1[0-9][0-9]' || echo "  (none — single-homed host, nothing to route)"
