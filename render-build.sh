#!/usr/bin/env bash
set -euo pipefail

: "${NOVEXA_API_BASE:=}"
python3 - "$NOVEXA_API_BASE" <<'PY'
from pathlib import Path
import json, sys
base = sys.argv[1].strip().rstrip('/')
p = Path("js/runtime-config.js")
text = p.read_text()
# Keep the source safe; inject only the Render build-time API origin.
line = f"  const configured = {json.dumps(base)};"
text = text.replace("  const configured = String(window.NOVEXA_API_BASE || '').trim().replace(/\/$/, '');", line)
p.write_text(text)
print("Novexa frontend configured with API base:", base or "(same origin)")
PY
