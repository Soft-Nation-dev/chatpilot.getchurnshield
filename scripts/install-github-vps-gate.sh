#!/usr/bin/env bash
set -euo pipefail

staged_gate="/tmp/github-vps-gate.sh"
staged_key="/tmp/github-actions-deploy.pub"
gate_path="/usr/local/sbin/churnshield-github-gate"
authorized_keys="/root/.ssh/authorized_keys"

[[ -f "${staged_gate}" ]] || { echo "Staged gate is missing" >&2; exit 30; }
[[ -f "${staged_key}" ]] || { echo "Staged public key is missing" >&2; exit 31; }

install -m 755 "${staged_gate}" "${gate_path}"
install -d -m 700 /root/.ssh
touch "${authorized_keys}"

replacement="$(mktemp /root/.ssh/authorized_keys.XXXXXX)"
grep -v ' github-actions-chatpilot$' "${authorized_keys}" > "${replacement}" || true
printf 'restrict,command="%s" ' "${gate_path}" >> "${replacement}"
cat "${staged_key}" >> "${replacement}"
chmod 600 "${replacement}"
mv -f "${replacement}" "${authorized_keys}"

rm -f "${staged_gate}" "${staged_key}"
echo "Restricted GitHub deployment key installed."
