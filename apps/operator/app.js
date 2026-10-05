const $=id=>document.getElementById(id),mib=n=>(Number(n||0)/1048576).toFixed(1)+' MiB';
const date=value=>value?new Date(value).toLocaleString():'Not observed';
async function refresh(){try{
 const response=await fetch('/status',{cache:'no-store'});if(!response.ok)throw new Error('Status unavailable');const s=await response.json(),c=s.catalog||{},saved=s.savedSites||{},storage=saved.storage||{};
 $('freshness').textContent='Updated '+date(s.at)+(Date.now()-Date.parse(s.at)>120000?' · Status is stale':'');
 $('metrics').replaceChildren();
 for(const [label,value,detail] of [['Retained names',s.retainedNames||0,'Dated name observations'],['Ready versions',saved.ready||0,'Within the saved static scope'],['Pinned storage',mib(storage.bytes),'Limit '+mib(storage.maxBytes)],['Process memory',mib(s.memory?.rss),'Resident process memory']]){const card=document.createElement('div');card.className='metric';const a=document.createElement('span'),b=document.createElement('strong'),d=document.createElement('span');a.textContent=label;b.textContent=value;d.textContent=detail;card.append(a,b,d);$('metrics').append(card);}
 $('sources').textContent=`Registry last scanned: ${date(c.catalog?.registryAt)}. Raw discovery: ${s.discovery?.phase||'not running'}. Saved copies remain available when upstream sources fail.`;
 $('queue').textContent=`${s.search?.entries||0} searchable entry pages / ${s.search?.limit||256} maximum · ${c.queued||0} queued objects · ${c.pendingGraphs||0} unfinished file lists · Daily catalog traffic ${mib(c.dayResponseBytes)} / ${mib(c.maxDailyResponseBytes)}.`;
 $('issue').textContent=[c.catalogError,c.lastError,c.preparation?.error,c.catalog?.registryError].filter(Boolean).join(' · ')||'No current preparation error reported.';
 $('sites').replaceChildren();for(const row of saved.sites||[]){const tr=document.createElement('tr');for(const value of [row.name,`${row.saved}/${row.total}`,date(row.observedAt),row.update?`Update ${row.update.saved}/${row.update.total} · ${row.update.status}`:row.status]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('sites').append(tr);}
 if(!saved.sites?.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='No retained site versions yet.';tr.append(td);$('sites').append(tr);}
 }catch(error){$('freshness').textContent=error.message;}}
void refresh();setInterval(refresh,10000);
