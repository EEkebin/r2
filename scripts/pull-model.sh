#!/usr/bin/env bash
# Pull R2's model into the ollama container's volume. Safe to re-run.
set -euo pipefail

MODEL="${OLLAMA_MODEL:-huihui_ai/qwen3-vl-abliterated:8b}"

CID="$(podman ps --filter "ancestor=docker.io/ollama/ollama:latest" --format '{{.ID}}' | head -n1)"
if [ -z "${CID}" ]; then
  echo "ollama container is not running. Start it first: podman-compose up -d" >&2
  exit 1
fi

echo "Pulling ${MODEL} into ollama container ${CID} ..."
podman exec "${CID}" ollama pull "${MODEL}"
echo "Done. Installed models:"
podman exec "${CID}" ollama list
