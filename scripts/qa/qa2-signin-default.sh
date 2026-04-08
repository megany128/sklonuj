#!/bin/bash
EMAIL=$1
PW='QA2Test!234'
AB() { npx --yes agent-browser "$@"; }
AB open "http://localhost:5173/auth" >/dev/null
sleep 1
AB eval "(() => { const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Already have')); if(btn){btn.click();return 'switched';} return 'login'; })()" >/dev/null
sleep 1
AB eval "(() => { const e=document.querySelector('input[type=email]'); const p=document.querySelector('input[type=password]'); e.focus(); e.value='$EMAIL'; e.dispatchEvent(new Event('input',{bubbles:true})); p.focus(); p.value='$PW'; p.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('form').requestSubmit(); return 'submitted'; })()" >/dev/null
sleep 4
AB get url
