export const cleanSearchText=(s,n)=>String(s??'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,n).trim();
export const searchKeywords=words=>[...new Set((Array.isArray(words)?words:[]).slice(0,32).map(x=>cleanSearchText(x,48)).filter(Boolean))].slice(0,12);
