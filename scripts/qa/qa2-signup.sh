#!/bin/bash
SESSION=$1
EMAIL=$2
PW='QA2Test!234'
AB() { npx --yes agent-browser --session-name "$SESSION" "$@"; }
AB open "http://localhost:5173/auth" >/dev/null
sleep 1
# Click "Sign up" toggle
AB eval "(() => { const btns=Array.from(document.querySelectorAll('button')); const t=btns.find(b => b.textContent.includes(\"Don't have an account\")); if (t) { t.click(); return 'toggled'; } return 'no-toggle'; })()" >/dev/null
sleep 1
AB eval "(() => { const e=document.querySelector('input[type=email]'); const p=document.querySelector('input[type=password]'); e.focus(); e.value='$EMAIL'; e.dispatchEvent(new Event('input',{bubbles:true})); p.focus(); p.value='$PW'; p.dispatchEvent(new Event('input',{bubbles:true})); return 'filled'; })()" >/dev/null
AB eval "document.querySelector('form').requestSubmit()" >/dev/null
sleep 4
AB get url
