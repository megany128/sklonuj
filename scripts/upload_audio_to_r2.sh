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
usage: bash scripts/upload_audio_to_r2.sh <bucket-name> [--prefix <prefix>]

env:
  CONCURRENCY   parallel upload count (default: 16)

Uploads static/audio/cs/**/*.mp3 to r2://<bucket-name>/<prefix><key>, where
<key> is the file path relative to static/audio/ (e.g. cs/ab/<hash>.mp3).
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
while [[ $# -gt 0 ]]; do
	case "$1" in
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

if ! command -v wrangler >/dev/null 2>&1; then
	echo "error: wrangler not found on PATH" >&2
	echo "install with: pnpm dlx wrangler login   (or: npm i -g wrangler)" >&2
	exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ ! -d static/audio/cs ]]; then
	echo "error: static/audio/cs/ missing — run 'pnpm tts:generate' first" >&2
	exit 1
fi

total="$(find static/audio/cs -type f -name '*.mp3' -print0 | tr -cd '\0' | wc -c | tr -d ' ')"
if [[ "$total" -eq 0 ]]; then
	echo "error: no .mp3 files found under static/audio/cs/" >&2
	exit 1
fi

echo "uploading $total files to r2://${BUCKET}/${PREFIX} with concurrency=${CONCURRENCY}"

# A tmp counter file lets the parallel workers report progress without clashing.
# We update it with a short flock to avoid torn reads when two uploads finish
# in the same millisecond.
counter_file="$(mktemp)"
trap 'rm -f "$counter_file" "$counter_file.lock"' EXIT
printf '0' >"$counter_file"

export BUCKET PREFIX total counter_file

# The worker script is self-contained so xargs can exec it per-file without
# re-parsing this file. We keep the heredoc small and stick to POSIX-ish bash.
upload_one() {
	local f="$1"
	local rel="${f#static/audio/}"
	local key="${PREFIX}${rel}"

	if ! wrangler r2 object put "${BUCKET}/${key}" \
		--file "$f" \
		--content-type "audio/mpeg" >/dev/null; then
		echo "FAIL $key" >&2
		return 1
	fi

	# Bump counter under a flock. Report progress every 100 files.
	(
		flock 9
		local n
		n="$(<"$counter_file")"
		n=$((n + 1))
		printf '%s' "$n" >"$counter_file"
		if (( n % 100 == 0 )) || (( n == total )); then
			printf 'uploaded %d / %d\n' "$n" "$total"
		fi
	) 9>"$counter_file.lock"
}

export -f upload_one

# -print0 / -0 keeps us safe on keys with spaces or oddball chars (the hash
# names shouldn't contain any, but defense in depth is cheap).
find static/audio/cs -type f -name '*.mp3' -print0 \
	| xargs -0 -n1 -P"$CONCURRENCY" -I{} bash -c 'upload_one "$@"' _ {}

final="$(<"$counter_file")"
echo "done: ${final}/${total} files uploaded to r2://${BUCKET}/${PREFIX}"

if [[ "$final" -ne "$total" ]]; then
	echo "warning: count mismatch — some uploads may have failed, check stderr above" >&2
	exit 1
fi
