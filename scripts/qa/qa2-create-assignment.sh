#!/bin/bash
# Usage: qa2-create-assignment.sh <session> <class_id> <title> <cases_csv> <drills_csv> <target> <due_offset_days_or_empty> [min_accuracy]
SESSION=$1
CLASS_ID=$2
TITLE=$3
CASES=$4
DRILLS=$5
TARGET=$6
DUE_OFFSET=$7
MIN_ACC=$8

AB() { npx --yes agent-browser --session-name "$SESSION" "$@"; }

AB open "http://localhost:5173/classes/$CLASS_ID/assignments/new" >/dev/null
sleep 2

# Fill title
AB eval "(() => { const i=document.querySelector('input#title, input[name=title]'); i.focus(); i.value='$TITLE'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'filled-title'; })()" >/dev/null

# Check cases
AB eval "(() => { const cases='$CASES'.split(','); cases.forEach(c => { const cb=document.querySelector('input[type=checkbox][name=selected_cases][value=\"'+c+'\"]'); if(cb && !cb.checked) cb.click(); }); return 'cases-checked'; })()" >/dev/null

# Check drill types
AB eval "(() => { const dts='$DRILLS'.split(','); dts.forEach(d => { const cb=document.querySelector('input[type=checkbox][name=selected_drill_types][value=\"'+d+'\"]'); if(cb && !cb.checked) cb.click(); }); return 'drills-checked'; })()" >/dev/null

# Set target
AB eval "(() => { const i=document.querySelector('input[name=target_questions]'); i.focus(); i.value='$TARGET'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'target-set'; })()" >/dev/null

# Set min accuracy if provided
if [ -n "$MIN_ACC" ]; then
  AB eval "(() => { const i=document.querySelector('input[name=min_accuracy]'); i.focus(); i.value='$MIN_ACC'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'minacc-set'; })()" >/dev/null
fi

# Set due date if provided
if [ -n "$DUE_OFFSET" ]; then
  AB eval "(() => { const d=new Date(); d.setUTCDate(d.getUTCDate()+($DUE_OFFSET)); d.setUTCHours(23,0,0,0); const s=d.toISOString().slice(0,16); const i=document.querySelector('input[name=due_date]'); i.focus(); i.value=s; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return 'due-set:'+s; })()"
fi

AB eval "document.querySelector('form').requestSubmit()" >/dev/null
sleep 3
URL=$(AB get url)
echo "URL=$URL"
# Extract assignment id
echo "$URL" | grep -oE 'assignments/[a-f0-9-]+' | head -1
