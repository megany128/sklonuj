#!/usr/bin/env bash
# Upload pre-generated TTS audio (static/audio/cs/**/*.mp3) to a Cloudflare R2
# bucket using `wrangler r2 object put`. Keys mirror the paths in
# static/audio/index.json (e.g. cs/ab/abcdef1234567890.mp3), so the client at
# src/lib/audio.ts can resolve them via PUBLIC_AUDIO_BASE_URL.
#
# wrangler uploads one object per invocation — we fan out with `xargs -P` to
# hide the per-call latency. 23k files will still take a while; rclone is
# faster if needed.

set -euo pipefail

usage() {
	cat >&2 <<'EOF'
usage: bash scripts/upload_audio_to_r2.sh <bucket-name> [--prefix <prefix>] [--new-only | --since <git-ref>]

env:
  CONCURRENCY   parallel upload count (default: 16)

Uploads static/audio/cs/**/*.mp3 to r2://<bucket-name>/<prefix><key>, where
<key> is the file path relative to static/audio/ (e.g. cs/ab/<hash>.mp3).
--since <git-ref> uploads just the files whose manifest entry is not in that
commit's static/audio/index.json — pass the last commit whose audio was
uploaded, so a 3k-file vocabulary delta doesn't re-push 26k objects.
--new-only is shorthand for --since HEAD (only useful before committing
the regenerated manifest).
index.json is NOT uploaded — the SvelteKit app serves it from the Pages
origin at /audio/index.json.
EOF
}

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

BUCKET="$1"
shift

PREFIX=""
SINCE=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--new-only)
			SINCE="HEAD"
			shift
			;;
		--since)
			if [[ $# -lt 2 ]]; then
				echo "error: --since requires a git ref" >&2
				exit 2
			fi
			SINCE="$2"
			shift 2
			;;
		--since=*)
			SINCE="${1#--since=}"
			shift
			;;
		--prefix)
			if [[ $# -lt 2 ]]; then
				echo "error: --prefix requires an argument" >&2
				exit 2
			fi
			PREFIX="$2"
			shift 2
			;;
		--prefix=*)
			PREFIX="${1#--prefix=}"
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "error: unknown argument: $1" >&2
			usage
			exit 2
			;;
	esac
done

# Normalize prefix: strip leading/trailing slashes, append single trailing slash
# iff non-empty. That way we can always do "${PREFIX}${rel}" without doubling
# slashes or forcing the caller to remember the convention.
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
if [[ -n "$PREFIX" ]]; then
	PREFIX="${PREFIX}/"
fi

CONCURRENCY="${CONCURRENCY:-16}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Resolve a wrangler executable. Prefer a locally installed devDep
# (node_modules/.bin/wrangler), fall back to whatever's on PATH. `pnpm dlx`
# is too slow here — 23k invocations would spend most of their time in dlx
# bookkeeping.
if [[ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]]; then
	WRANGLER="$REPO_ROOT/node_modules/.bin/wrangler"
elif command -v wrangler >/dev/null 2>&1; then
	WRANGLER="$(command -v wrangler)"
else
	cat >&2 <<'EOF'
error: wrangler not found

install one of:
  pnpm add -D wrangler        (recommended — local devDep, no global pollution)
  npm i -g wrangler           (global install)

then re-run this script. if you ran `pnpm dlx wrangler login` earlier, the
auth token is cached and will work with either install above.
EOF
	exit 1
fi

if [[ ! -d static/audio/cs ]]; then
	echo "error: static/audio/cs/ missing — run 'pnpm tts:generate' first" >&2
	exit 1
fi

# NUL-separated list of files to upload: everything on disk, or with
# --since just the manifest paths that ref's index.json doesn't have.
list_file="$(mktemp)"
if [[ -n "$SINCE" ]]; then
	if ! git rev-parse --verify --quiet "$SINCE^{commit}" >/dev/null; then
		echo "error: --since: unknown git ref '$SINCE'" >&2
		exit 2
	fi
	SINCE="$SINCE" python3 - >"$list_file" <<'PY'
import json, os, subprocess, sys
ref = os.environ["SINCE"]
old = json.loads(subprocess.check_output(["git", "show", f"{ref}:static/audio/index.json"]))["entries"]
new = json.load(open("static/audio/index.json", encoding="utf-8"))["entries"]
for text, rel in new.items():
    if text not in old:
        sys.stdout.write(f"static/audio/{rel}\0")
PY
else
	find static/audio/cs -type f -name '*.mp3' -print0 >"$list_file"
fi

total="$(tr -cd '\0' <"$list_file" | wc -c | tr -d ' ')"
if [[ "$total" -eq 0 ]]; then
	if [[ -n "$SINCE" ]]; then
		echo "nothing to do: every manifest entry is already in $SINCE's index.json"
		rm -f "$list_file"
		exit 0
	fi
	echo "error: no .mp3 files found under static/audio/cs/" >&2
	exit 1
fi

echo "uploading $total files to r2://${BUCKET}/${PREFIX} with concurrency=${CONCURRENCY}"

# Each worker appends a single byte after a successful upload; total progress
# is the file's byte count. POSIX guarantees atomicity for appends smaller than
# PIPE_BUF, so no lock is needed. This is portable (macOS lacks `flock`).
counter_file="$(mktemp)"
trap 'rm -f "$counter_file" "$list_file"' EXIT
: >"$counter_file"

export BUCKET PREFIX total counter_file WRANGLER

upload_one() {
	local f="$1"
	local rel="${f#static/audio/}"
	local key="${PREFIX}${rel}"
	local attempt

	# Retry transient R2 errors (we've seen occasional 500s). Backoff: 2s, 4s.
	# `--remote` is required — without it wrangler targets a local miniflare
	# simulation and silently succeeds without touching the real bucket.
	for attempt in 1 2 3; do
		if "$WRANGLER" r2 object put "${BUCKET}/${key}" \
			--file "$f" \
			--content-type "audio/mpeg" \
			--remote >/dev/null 2>&1; then
			break
		fi
		if (( attempt == 3 )); then
			echo "FAIL $key" >&2
			return 1
		fi
		sleep $((attempt * 2))
	done

	printf '.' >>"$counter_file"
	local n
	n="$(wc -c <"$counter_file" | tr -d ' ')"
	if (( n % 100 == 0 )) || (( n == total )); then
		printf 'uploaded %d / %d\n' "$n" "$total"
	fi
}

export -f upload_one

# -print0 / -0 keeps us safe on keys with spaces or oddball chars (the hash
# names shouldn't contain any, but defense in depth is cheap).
xargs -0 -n1 -P"$CONCURRENCY" -I{} bash -c 'upload_one "$@"' _ {} <"$list_file"

final="$(<"$counter_file")"
echo "done: ${final}/${total} files uploaded to r2://${BUCKET}/${PREFIX}"

if [[ "$final" -ne "$total" ]]; then
	echo "warning: count mismatch — some uploads may have failed, check stderr above" >&2
	exit 1
fi
