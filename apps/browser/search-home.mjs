export const HOME='arnsui://app/welcome.html';
export function homeQuery(raw){
 try{const u=new URL(raw);if(u.protocol!=='arnsui:'||u.hostname!=='app'||u.port||u.username||u.password||u.pathname!=='/welcome.html'||u.hash||raw.length>2200)return null;
  if([...u.searchParams.keys()].some(k=>k!=='q')||u.searchParams.getAll('q').length>1)return null;
  const q=u.searchParams.get('q')||'';return q.length<=160?q:null;
 }catch{return null;}
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s).toISOString().slice(0,16).replace('T',' ')+' UTC':'Not downloaded';
export function renderSearchHome(template,result){
 const r=result,items=r.hits.map(row=>`<article class="search-result"><p class="result-address">ar://${escape(row.name)}</p><h3><a href="ar://${escape(row.name)}">${escape(row.title||row.name)}</a></h3><p class="excerpt">${escape(row.excerpt)}</p><p class="availability">${row.localReady?'Saved on this device':row.availability==='prepared'?'Site copy reported by peer':'Entry page indexed · other files may be missing'}</p><p class="result-dates">Name observed: ${escape(date(row.observedAt))} · Page indexed: ${escape(date(row.indexedAt))}</p></article>`).join('');
 const search=`<form class="search-form" method="get" action="${HOME}" role="search"><label class="sr-only" for="mesh-query">Search indexed ArNS sites</label><div class="search-input"><input id="mesh-query" name="q" type="search" maxlength="160" value="${escape(r.query)}" placeholder="Search indexed ArNS sites…" required><button type="submit">Search Mesh <span aria-hidden="true">↗</span></button></div></form>`;
 const refresh=`<a class="refresh-catalogue" href="arnsui://app/search-refresh">${r.syncing?'Updating catalogue…':'Refresh catalogue'}</a>`;
 const count=`<p class="catalogue-status">${r.entries} indexed site${r.entries===1?'':'s'}</p>`;
 const heading=r.query?`<div class="catalogue-head"><h2 id="results-title">${r.total} result${r.total===1?'':'s'} for “${escape(r.query)}”</h2>${refresh}</div>${count}`:`<div class="catalogue-summary">${count}${refresh}</div>`;
 const results=`<section class="search-results" ${r.query?'aria-labelledby="results-title"':'aria-label="Search catalogue"'}>${heading}${!r.sources?'<p class="search-notice"><a href="arnsui://app/connect">Connect to Mesh</a> to download a search catalogue.</p>':''}${r.error?'<p class="search-notice">Catalogue update unavailable. Your last downloaded catalogue is still searchable.</p>':''}${r.query&&!r.total&&r.sources?'<p class="search-notice">No match in this catalogue. Try another word, or open a known ArNS name in the address bar.</p>':''}${items}${r.total>30?'<p class="result-limit">Showing the first 30 results. Add another word to narrow your search.</p>':''}<details class="catalogue-details"><summary>${r.query?'About these results':'Catalogue details'}</summary><p>${r.sources} trusted publisher${r.sources===1?'':'s'} · Catalogue: ${escape(date(r.generatedAt))}</p><p>Your search words stay on this device. This catalogue covers a limited set of indexed entry pages; a missing result does not mean the site does not exist. Dates and availability are reports from your trusted publisher. Opening a result checks the name and files again; missing files and external services may still prevent a complete page.</p></details></section>`;
 return template.replace('<body>',r.query?'<body class="searching">':'<body>').replace('<!-- MESH_SEARCH -->',search).replace('<!-- MESH_RESULTS -->',results);
}
