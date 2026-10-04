# shellcheck shell=bash
# The deployment preflight. Component installers own their dependency lists;
# --deps-only stops before deploying app files, secrets, or service units.
vt_install_dependencies() {
    local dry="$1" tool spec
    local commands=() missing=() flags=()
    (( dry )) && flags=(--dry-run)
    echo '== checking base dependencies =='
    # Include tools used by installers and by the manager at runtime, even if
    # they happen to be present in most full desktop distributions.
    for spec in curl:curl git:git rsync:rsync wget:wget sudo:sudo \
                python3:python3 openssl:openssl ip:iproute2 ps:procps \
                flock:util-linux find:findutils tar:tar gzip:gzip \
                systemctl:systemd useradd:passwd; do
        tool="${spec%%:*}"
        commands+=("$tool")
        command -v "$tool" >/dev/null 2>&1 || missing+=("${spec#*:}")
    done
    [ -s /etc/ssl/certs/ca-certificates.crt ] || [ -s /etc/pki/tls/certs/ca-bundle.crt ] || missing+=(ca-certificates)
    if [ "$VT_FAMILY" = rhel ] && command -v getenforce >/dev/null 2>&1; then
        command -v semanage >/dev/null 2>&1 || missing+=(policycoreutils-python-utils)
        command -v setsebool >/dev/null 2>&1 || missing+=(policycoreutils)
    fi
    if (( dry )); then
        echo "+ install missing prerequisites: ${missing[*]:-none}"
    else
        if [ ${#missing[@]} -gt 0 ]; then
            vt_pkg_refresh
            vt_pkg_install "${missing[@]}"
        fi
        vt_require_commands "${commands[@]}"
    fi

    # Use the invoking account here: the service account and /opt tree are
    # created only AFTER every enabled component's dependencies succeed.
    env INSTALL_DEPS=1 "$REPO_DIR/server/install.sh" --deps-only "${flags[@]}"
    if (( DO_BROWSER )); then
        env INSTALL_DEPS=1 "$REPO_DIR/apps/everyday/browser/install.sh" --deps-only "${flags[@]}"
    fi
    if (( DO_FILES )); then
        env INSTALL_DEPS=1 "$REPO_DIR/apps/everyday/files/install.sh" --deps-only "${flags[@]}"
    fi
    if (( DO_OFFICE )); then
        env INSTALL_DEPS=1 "$REPO_DIR/apps/everyday/office/install.sh" --deps-only "${flags[@]}"
    fi
    if (( DO_TUNNEL )); then
        env INSTALL_DEPS=1 "$REPO_DIR/tunnel/install.sh" --deps-only "${flags[@]}"
    fi
    echo '== all enabled component dependencies ready =='
}
