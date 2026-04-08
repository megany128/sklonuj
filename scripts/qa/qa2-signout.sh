#!/bin/bash
AB() { npx --yes agent-browser "$@"; }
# Click profile menu, then sign out
AB open "http://localhost:5173/" >/dev/null
sleep 1
AB eval "(() => { const b=document.querySelector('button[aria-label=\"Profile menu\"]'); if(b){b.click();return 'clicked';} return 'no'; })()" >/dev/null
sleep 1
AB eval "(() => { const btns=Array.from(document.querySelectorAll('button,a')); const b=btns.find(b=>b.textContent.trim().toLowerCase()==='sign out'||b.textContent.trim().toLowerCase()==='log out'); if(b){b.click();return 'signed-out';} return 'no'; })()" >/dev/null
sleep 2
AB get url
