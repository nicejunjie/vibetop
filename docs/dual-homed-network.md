# Dual-homed network (two NICs on one subnet)

A host connected to the **same LAN subnet through two interfaces at once** (typically
**Ethernet + WiFi**) is "dual-homed on one subnet." It's a deceptively broken setup:
the host has two IPs in the same range, and packets/keepalives can take asymmetric
paths. The classic symptom in vibetop is a **terminal/Browser that connects, then
drops on a fixed ~10s cycle ("can't type") for some clients but not others** — it's
path-dependent, so it masquerades as a browser/app bug. (Full incident write-up and
the diagnosis steps are in the "Dual-homed deploy host" gotcha in
[`../CLAUDE.md`](../CLAUDE.md).)

This document covers how it behaves on **Linux** (the deploy host) and **Windows**,
and how to make dual networking work — ideally **without** any per-host OS tweaks.

---

## Why it breaks

With two interfaces on one subnet:

- **ARP flux** — by default the host may answer ARP requests for *both* its IPs on
  *both* NICs, so a client (and the switch) can learn the "wrong" MAC for an IP. The
  L2 path then flaps.
- **Asymmetric routing** — a connection that *arrives* on NIC-B may have its replies
  *sent* out NIC-A (whichever the routing table prefers), so return packets and
  keepalives go astray and the connection dies at a TCP/WS timeout (~10s).

Whether a given client is hit depends on which IP/MAC it resolved — which is why it
looks random and hits "some devices, not others."

---

## Linux (the deploy host, e.g. z20)

Linux is the platform that bites you here, because its defaults are permissive:
`arp_ignore=0` / `arp_announce=0` (ARP flux) and a single main routing table that
sends all replies out the lowest-metric interface (asymmetry).

**Fix without ongoing fiddling:** run the repo helper —

```bash
sudo ./tools/setup-samesubnet-routing.sh
```

It sets `arp_ignore=1` / `arp_announce=2` (each IP answered only on its own NIC) and
installs a NetworkManager dispatcher that does **source-based policy routing** (one
routing table per interface, each defaulting out its own interface) so replies leave
on the interface they arrived on. It **auto-detects IP/subnet/gateway** (no hardcoded
addresses), is idempotent, and re-applies on every up/DHCP event. Re-run it after a
reinstall — it isn't part of `deploy.sh`.

---

## Windows

**Good news: a dual-homed Windows host usually "just works"** for inbound services,
because Windows already defaults to the behavior we have to configure by hand on
Linux:

- **Strong host model** (default since Vista). A packet is only accepted on the
  interface that owns the destination IP, and a reply is sent *from* the interface
  that owns the source IP. This is exactly the symmetric reply-path that Linux needs
  policy routing to achieve — so Windows largely avoids the asymmetric-routing flap.
- **No ARP flux by default.** Each IP is answered on its own interface (equivalent to
  Linux `arp_ignore=1` / `arp_announce=2`).
- **Automatic interface metrics.** Windows ranks interfaces by link speed, so 1 GbE
  Ethernet gets a lower metric than WiFi and is preferred for outbound traffic.

So you generally **do not** need a Windows equivalent of the Linux routing script.

### As a *client* (e.g. a laptop reaching the server)
A dual-homed Windows client picks the lowest-metric interface for a new connection and
keeps that connection on it (strong host model), so it's fine. In the vibetop incident
the broken host was the **Linux server**, not the Windows client — a dual-homed client
was never the problem.

### Remaining soft gotchas on Windows
- The host may **register both IPs in DNS**, so clients can reach either address;
  prefer connecting by a fixed IP or pin DNS to the wired one.
- **Outbound source IP** follows the metric (lowest-metric interface wins) — relevant
  if a service binds to "all" and a peer keys off the source IP.

### Detecting it on Windows
```powershell
ipconfig                                   # two adapters with IPs in the same subnet?
route print                                # two routes/interfaces for the same network
Get-NetIPInterface -AddressFamily IPv4 | Sort-Object InterfaceMetric   # the metrics
Get-NetIPConfiguration
```

### Controlling it on Windows (no registry hacks)
- **Set explicit interface metrics** so the preferred adapter wins deterministically:
  Adapter → IPv4 → Advanced → uncheck "Automatic metric" and set Ethernet low (e.g.
  10), WiFi higher (e.g. 50). Or:
  ```powershell
  Set-NetIPInterface -InterfaceAlias "Ethernet" -InterfaceMetric 10
  Set-NetIPInterface -InterfaceAlias "Wi-Fi"    -InterfaceMetric 50
  ```
- **Disable the redundant adapter** when it isn't needed: Device Manager, or
  `Disable-NetAdapter -Name "Wi-Fi"`.
- **Put the two NICs on different subnets/VLANs** (cleanest — see below).

---

## Making dual networking work *without* OS tweaks

The same-subnet condition is the root problem; the tweak-free options all avoid it:

1. **Different subnets / VLANs (best).** Put Ethernet on the main LAN and WiFi on a
   guest SSID or a separate VLAN. Different subnets are handled natively by both Linux
   and Windows — no ARP flux, no asymmetry, nothing to configure. The host is reachable
   on both, each by its own IP.
2. **Failover only — don't run both at once.** Keep Ethernet live and make WiFi a
   manual/auto-only-when-Ethernet-down backup (NetworkManager `connection.autoconnect
   no` + a high metric on Linux; a high interface metric / "connect automatically"
   off on Windows). Normally single-homed, so nothing to patch.
3. **Bonding/teaming** for true link redundancy — but only for **two Ethernet links to
   the same switch** (active-backup or LACP). Ethernet + WiFi cannot be bonded.
4. **Single-home.** On an always-wired desktop, just use Ethernet and turn WiFi off.

If you *insist* on both NICs on one subnet simultaneously, that's the one case that
needs host configuration: trivial on Windows (it's mostly default), and the
`tools/setup-samesubnet-routing.sh` script on Linux.
