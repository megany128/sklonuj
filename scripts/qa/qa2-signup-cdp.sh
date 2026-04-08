#!/bin/bash
# qa2-signup-cdp.sh <cdp_port> <email> [password]
PORT=$1
EMAIL=$2
PW=${3:-'QA2Test!234'}
AB() { npx --yes agent-browser --cdp "$PORT" "$@"; }
AB open "http://localhost:5173/auth" >/dev/null
sleep 1
AB eval "(() => { const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(\"Don't have\")); if(btn){btn.click();return 'toggled';} return 'no'; })()" >/dev/null
sleep 1
AB eval "(() => { const e=document.querySelector('input[type=email]'); const p=document.querySelector('input[type=password]'); e.focus(); e.value='$EMAIL'; e.dispatchEvent(new Event('input',{bubbles:true})); p.focus(); p.value='$PW'; p.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form').requestSubmit(); return 'submitted'; })()" >/dev/null
sleep 4
AB get url
