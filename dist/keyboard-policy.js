// Keyboard events from extensions and older input bridges may omit key.
// SPDX-License-Identifier: GPL-2.0-or-later
export function eventKey(event){
 if(typeof event?.key==='string'&&event.key)return event.key;
 const code=typeof event?.code==='string'?event.code:'';
 if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();
 if(/^Digit[0-9]$/.test(code))return code.slice(5);
 if(code==='Space')return ' ';
 if(/^(F([1-9]|1[0-2])|Tab|Enter|Escape|Backspace|Delete|Arrow(Up|Down|Left|Right))$/.test(code))return code;
 const legacy=event?.keyCode||event?.which;
 if(legacy>=65&&legacy<=90)return String.fromCharCode(legacy).toLowerCase();
 if(legacy>=112&&legacy<=123)return 'F'+(legacy-111);
 return ({9:'Tab',13:'Enter',27:'Escape',32:' '})[legacy]||'';
}
export function browserKeepsKey(event){
 const key=eventKey(event),lower=key.toLowerCase(),mod=event?.ctrlKey||event?.metaKey;
 return !key||event?.isComposing||['Dead','Process','Unidentified'].includes(key)||['F11','F12'].includes(key)||(mod&&['r','q','w','t','n'].includes(lower))||(mod&&event?.shiftKey&&['i','j','c'].includes(lower));
}
export function isPrintableKey(event){const key=eventKey(event);return Array.from(key).length===1&&!event?.ctrlKey&&!event?.metaKey;}
