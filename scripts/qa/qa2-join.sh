#!/bin/bash
# Usage: qa2-join.sh <session> <code> [display_name]
SESSION=$1
CODE=$2
NAME=$3
AB() { npx --yes agent-browser --session-name "$SESSION" "$@"; }
AB open "http://localhost:5173/classes" >/dev/null
sleep 2
# Click Join Class button
AB eval "(() => { const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Join Class'||b.textContent.trim()==='Join a Class'); if(b){b.click();return 'clicked';} return 'no'; })()" >/dev/null
sleep 1
# Fill code
AB eval "(() => { const i=document.querySelector('input[name=code]'); if(!i) return 'no-input'; i.focus(); i.value='$CODE'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'filled'; })()" >/dev/null
# Submit
AB eval "(() => { const forms=Array.from(document.querySelectorAll('form')); for(const f of forms) { if(f.querySelector('input[name=code]')) { f.requestSubmit(); return 'submitted'; } } return 'no-form'; })()" >/dev/null
sleep 3
URL=$(AB get url)
echo "URL=$URL"
# Check error message in dialog
AB eval "(() => { const d=document.body.innerText; const m=d.match(/(already a member[^\n]*|No class found[^\n]*|class has been archived[^\n]*|teacher of this[^\n]*|Failed to join[^\n]*)/); return m?m[0]:'no-error'; })()"

if [ -n "$NAME" ]; then
  sleep 1
  # Fill display name in welcome modal
  AB eval "(() => { const i=Array.from(document.querySelectorAll('input[type=text]')).find(i => !i.disabled); if(!i) return 'no-name-input'; i.focus(); i.value='$NAME'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'name-filled'; })()" >/dev/null
  AB eval "(() => { const btns=Array.from(document.querySelectorAll('button')); const b=btns.find(b=>{const t=b.textContent.trim();return t==='Save'||t==='Save name'||t==='Continue';}); if(b){b.click();return 'saved:'+b.textContent.trim();} return 'no-save'; })()"
  sleep 2
  AB eval "(() => { const btns=Array.from(document.querySelectorAll('button')); const b=btns.find(b=>b.textContent.trim()==='Got it!'||b.textContent.trim()==='Got it'); if(b){b.click();return 'dismissed';} return 'no-dismiss'; })()"
fi
