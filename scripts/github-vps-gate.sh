#!/usr/bin/env bash
set -euo pipefail

original_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "${original_command}" =~ ^scp\ -t\ (/tmp/churnshield-([0-9a-f]{40})\.tar\.gz)$ ]]; then
  exec /usr/bin/scp -t "${BASH_REMATCH[1]}"
fi

if [[ "${original_command}" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  release_sha="${BASH_REMATCH[1]}"
  archive_path="/tmp/churnshield-${release_sha}.tar.gz"
  release_dir="/opt/churnshield/releases/${release_sha}"

  [[ -f "${archive_path}" ]] || {
    echo "Release archive is missing" >&2
    exit 20
  }

  if [[ ! -d "${release_dir}" ]]; then
    install -d -m 755 "${release_dir}"
    tar -xzf "${archive_path}" -C "${release_dir}"
  fi

  exec /usr/bin/bash "${release_dir}/scripts/deploy-vps.sh" "${release_sha}"
fi

echo "This SSH key is restricted to GetChurnShield release deployment." >&2
exit 126
