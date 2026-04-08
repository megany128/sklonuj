#!/bin/bash
# qa2-signin-parallel.sh <chrome_port> <email>
PORT=$1
EMAIL=$2
PW='QA2Test!234'
DAEMON_PORT=$((4848+PORT-9250))
AB() { AGENT_BROWSER_DAEMON_PORT=$DAEMON_PORT npx --yes agent-browser --cdp $PORT "$@"; }
AB open "http://localhost:5173/auth" >/dev/null
sleep 1
AB eval "(() => { const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Already have')); if(btn){btn.click();return 'switched';} return 'login'; })()" >/dev/null
sleep 1
AB eval "(() => { const e=document.querySelector('input[type=email]'); const p=document.querySelector('input[type=password]'); e.focus(); e.value='$EMAIL'; e.dispatchEvent(new Event('input',{bubbles:true})); p.focus(); p.value='$PW'; p.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form').requestSubmit(); return 'submitted'; })()" >/dev/null
sleep 5
AB get url
AB eval "(() => { const t=document.body.innerText; const m=t.match(/claude-qa2-[a-z0-9-]+@sklonuj.test/); return m?m[0]:'NO_EMAIL'; })()"
