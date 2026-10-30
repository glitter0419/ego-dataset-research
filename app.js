'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-US'),hours=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),pct=n=>(n*100).toFixed(1)+'%';
const colors={jd:'#207e91',es:'#da8b49'},names={jd:'JD1w',es:'EgoSuite'};
const state={view:'explore',dataset:'all',mode:'instruction',q:'',sort:'hours',page:1};
let meta=null,db={},allRows={task:[],instruction:[]},filtered=[],detail=null,detailList=[],detailLimit=60,lastFocus=null;
const pageSize=25;
let previewVersion=0,previewTimer=null,previewSample=0,previewTotal=3,previewConfig=null;
function badge(id){return `<span class="badge ${id==='es'?'es-badge':''}"><i class="dot ${id}"></i>${names[id]}</span>`;}
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,2600);}
function selected(){return meta?meta.datasets.filter(d=>state.dataset==='all'||state.dataset===d.id):[];}
function syncUrl(){const p=new URLSearchParams();for(const k of ['view','dataset','mode','q','sort'])if(state[k])p.set(k,state[k]);history.replaceState(null,'','#'+p.toString());}
function readUrl(){const p=new URLSearchParams(location.hash.slice(1));if(['explore','language','method'].includes(p.get('view')))state.view=p.get('view');if(['all','jd','es'].includes(p.get('dataset')))state.dataset=p.get('dataset');if(['task','instruction'].includes(p.get('mode')))state.mode=p.get('mode');if(['hours','sources','windows','name'].includes(p.get('sort')))state.sort=p.get('sort');state.q=p.get('q')||'';}
function matcher(query){const alternatives=query.trim().toLocaleLowerCase().split('|').map(x=>x.trim().split(/\s+/).filter(Boolean)).filter(a=>a.length);return s=>!alternatives.length||alternatives.some(a=>a.every(w=>s.includes(w)));}
function metric(label,value,note,unit){return `<article class="metric"><div class="metric-label">${label}<span>${unit}</span></div><strong>${value}</strong><small>${note}</small></article>`;}
function renderMetrics(){if(!meta)return;const ds=selected(),sum=k=>ds.reduce((a,d)=>a+d[k],0);$('#metrics').innerHTML=[metric('源数据时长',hours(sum('hours')),'按帧数与原始 FPS 估算','HOURS'),metric('来源集数',fmt(sum('sources')),'正式包范围 · train + val','SOURCES'),metric('原始 task 标签',fmt(sum('tasks')),'保留原名，未合并同义变体','TASKS'),metric('实际任务指令',fmt(sum('instructions')),'各库内精确去重，跨库不合并','INSTRUCTIONS')].join('');}
function renderState(){
 $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
 for(const v of ['explore','language','method'])$('#'+v+'View').hidden=state.view!==v;
 $$('#datasetTabs button').forEach(b=>b.classList.toggle('selected',b.dataset.ds===state.dataset));
 $$('#modeTabs button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.mode));
 $('#search').placeholder=state.mode==='task'?'搜索 task 名称，例如 Clean chairs、pen、fold':'搜索实际指令，例如 wipe、cup、fold clothes';
 $('#nameHeader').textContent=state.mode==='task'?'原始任务名称 / Task':'实际训练指令 / Instruction';
 $('#linkHeader').innerHTML=state.mode==='task'?'Instructions <small>关联指令数</small>':'Tasks <small>关联任务数</small>';
 $('#search').value=state.q;$('#sort').value=state.sort;renderMetrics();
 if(state.view==='language')renderLanguage();
 if(state.view==='explore')renderTable();
 syncUrl();
}
function renderTable(){
 const pred=matcher(state.q);filtered=allRows[state.mode].filter(r=>(state.dataset==='all'||r.ds===state.dataset)&&pred(r.search));
 const key={hours:'h',sources:'n',windows:'w'}[state.sort];filtered.sort((a,b)=>state.sort==='name'?a.name.localeCompare(b.name):(b[key]-a[key]||b.n-a.n||a.name.localeCompare(b.name)));
 state.page=Math.max(1,Math.min(state.page,Math.ceil(filtered.length/pageSize)||1));const sum=filtered.reduce((a,r)=>({n:a.n+r.n,h:a.h+r.h,w:a.w+r.w}),{n:0,h:0,w:0});
 const kind=state.mode==='task'?'task 标签':'条精确指令';
 $('#resultSummary').innerHTML=`<span><i class="match-dot"></i>匹配 <strong>${fmt(filtered.length)}</strong> ${kind}${state.q?' · '+esc(state.q):''}</span><span>合计 <strong>${hours(sum.h)} h</strong> · <strong>${fmt(sum.n)}</strong> 集 · ${fmt(sum.w)} 个有效窗口</span>`;
 const slice=filtered.slice((state.page-1)*pageSize,state.page*pageSize),maxH=filtered[0]&&Math.max(...filtered.slice(0,200).map(r=>r.h));
 $('#rows').innerHTML=slice.length?slice.map((r,i)=>`<tr tabindex="0" role="button" aria-label="查看${esc(r.name)}详情" data-ds="${r.ds}" data-id="${r.id}"><td>${(state.page-1)*pageSize+i+1}</td><td><div class="row-title">${esc(r.name)}</div>${r.cn?`<span class="row-sub">${esc(r.cn)}</span>`:''}</td><td>${badge(r.ds)}</td><td class="numeric"><span class="hour-num">${hours(r.h)}</span><div class="mini-track"><i style="width:${Math.min(100,r.h/(maxH||1)*100)}%"></i></div></td><td class="numeric">${fmt(r.n)}</td><td class="numeric">${fmt(r.links)}</td><td class="arrow">↗</td></tr>`).join(''):'<tr><td colspan="7" class="empty">没有找到匹配记录。试试更短的关键词，或点击“清除筛选”。</td></tr>';
 $('#pageInfo').textContent=filtered.length?`显示 ${fmt((state.page-1)*pageSize+1)}–${fmt(Math.min(state.page*pageSize,filtered.length))} / ${fmt(filtered.length)} 条 · 点击行查看关联明细`:'0 条结果';
 $('#pageNumber').textContent=`${state.page} / ${Math.ceil(filtered.length/pageSize)||1}`;$('#prev').disabled=state.page<=1;$('#next').disabled=state.page*pageSize>=filtered.length;$('#export').disabled=!filtered.length;
 renderTopChart();
}
function renderTopChart(){const top=[...filtered].sort((a,b)=>b.h-a.h).slice(0,8),max=top[0]?.h||1;$('#topChartTitle').textContent=state.mode==='task'?'Task source hours · Top 8':'Instruction source hours · Top 8';$('#topChart').innerHTML=top.length?top.map(r=>`<div class="bar-row" title="${esc(r.name)}"><span class="bar-label">${esc(r.name)}</span><span class="bar-track"><i style="width:${r.h/max*100}%;background:${colors[r.ds]}"></i></span><span class="bar-val">${hours(r.h)} h</span></div>`).join(''):'<p class="muted">无匹配数据</p>';}
function csvDownload(filename,headers,rows){
 const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const str='\ufeff'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([str],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openDetail(ds,kind,id){
 const data=db[ds],row=data[kind+'Rows'][id];if(!row)return;resetPreview();lastFocus=document.activeElement;detail={ds,kind,id,row};detailLimit=60;$('#detailSearch').value='';
 $('#detailBadge').innerHTML=badge(ds);$('#detailType').textContent=kind==='task'?'ORIGINAL TASK / 原始任务':'ACTUAL INSTRUCTION / 实际指令';$('#detailTitle').textContent=row.name;
 $('#detailSubtitle').textContent=row.cn||'按 task 与实际指令的对应关系统计';
 $('#detailMetrics').innerHTML=`<div><strong>${hours(row.h)}</strong><small>Source hours / 源小时</small></div><div><strong>${fmt(row.n)}</strong><small>Sources / 来源集数</small></div><div><strong>${fmt(row.links)}</strong><small>${kind==='task'?'Instructions / 关联指令':'Tasks / 关联任务'}</small></div>`;
 $('#detailRelationTitle').textContent=kind==='task'?'这个 task 实际使用的全部指令':'这条指令实际关联的全部 task';
 const indices=(kind==='task'?data.taskEdges:data.promptEdges)[id];
 detailList=indices.map(idx=>{const e=data.edges[idx],other=kind==='task'?data.instructionRows[e[1]]:data.taskRows[e[0]];return {...other,n:e[2],h:e[3],w:e[4],trainN:e[5],trainH:e[6],otherKind:kind==='task'?'instruction':'task'};}).sort((a,b)=>b.h-a.h);
 $('#overlay').hidden=false;document.body.style.overflow='hidden';$('.drawer').scrollTop=0;renderDetailRows();$('#closeDetail').focus();
}
function renderDetailRows(){const pred=matcher($('#detailSearch').value);const list=detailList.filter(r=>pred(r.search));const max=list[0]?.h||1;$('#detailRows').innerHTML=list.length?list.slice(0,detailLimit).map(r=>`<article class="detail-row" role="button" tabindex="0" data-other="${r.otherKind}" data-id="${r.id}" aria-label="探索${esc(r.name)}"><div class="detail-row-name">${esc(r.name)} <span class="arrow">↗</span></div>${r.cn?`<small class="muted">${esc(r.cn)}</small>`:''}<div class="detail-row-meta"><span><strong>${hours(r.h)} h</strong> · ${fmt(r.n)} 集</span><span>${pct(r.h/detail.row.h)} 时长 · train ${fmt(r.trainN)} 集</span></div><div class="mini-track"><i style="width:${r.h/max*100}%;background:${colors[detail.ds]}"></i></div></article>`).join(''):'<p class="empty">没有匹配的关联条目</p>';
 $('#moreDetail').hidden=list.length<=detailLimit;$('#moreDetail').textContent=`继续加载 · 已显示 ${Math.min(detailLimit,list.length)} / ${fmt(list.length)}`;
}
function closeDetail(){if($('#overlay').hidden)return;resetPreview();$('#overlay').hidden=true;document.body.style.overflow='';if(lastFocus&&document.contains(lastFocus))lastFocus.focus();detail=null;}
function resetPreview(){
 previewVersion++;clearTimeout(previewTimer);previewSample=0;previewTotal=3;const video=$('#detailVideo');video.pause();video.removeAttribute('src');video.load();video.hidden=true;$('#previewInfo').hidden=true;$('#previewInfo').textContent='';$('#previewStatus').textContent='';$('#loadPreview').disabled=false;$('#loadPreview').textContent='▶ 加载视频样例';$('#nextPreview').disabled=true;
}
async function requestPreview(next=false){
 if(!detail)return;clearTimeout(previewTimer);const version=++previewVersion,target={ds:detail.ds,kind:detail.kind,id:detail.id};
 if(next)previewSample=(previewSample+1)%previewTotal;
 const video=$('#detailVideo');video.pause();video.removeAttribute('src');video.load();video.hidden=true;$('#previewInfo').hidden=true;$('#loadPreview').disabled=true;$('#nextPreview').disabled=true;$('#previewStatus').textContent='正在读取样例…';const started=Date.now();
 function fail(msg){if(version!==previewVersion)return;$('#previewStatus').textContent=msg;$('#loadPreview').disabled=false;$('#loadPreview').textContent='重新加载样例';$('#nextPreview').disabled=previewTotal<=1;}
 async function consume(d){
  if(version!==previewVersion)return;
  if(d.status==='ready'){
   previewTotal=d.total_samples;video.src=d.video_url;video.muted=true;video.hidden=false;video.load();$('#previewStatus').textContent=`样例 ${d.sample+1} / ${d.total_samples} · ${d.view}`;
   const dims=d.width&&d.height?` · ${d.width} × ${d.height}`:'';
   $('#previewInfo').innerHTML=`<strong>对应 task：</strong>${esc(d.task)}<br>源视频 ${Number(d.source_duration_s).toFixed(2)} 秒；当前展示 ${Number(d.preview_start_s).toFixed(2)}–${(Number(d.preview_start_s)+Number(d.preview_duration_s)).toFixed(2)} 秒。原速、15fps、无声${dims}。`;
   $('#previewInfo').hidden=false;$('#loadPreview').textContent='重新加载样例';$('#loadPreview').disabled=false;$('#nextPreview').disabled=previewTotal<=1;return;
  }
  if(!['queued','processing'].includes(d.status)){fail(d.message||'样例暂时无法读取，请稍后重试');return;}
  if(Date.now()-started>115000){fail('准备时间较长，请稍后重新加载');return;}
  $('#previewStatus').textContent=d.message||'正在生成低清预览…';
  previewTimer=setTimeout(async()=>{try{const r=await fetch('/api/preview/status?key='+encodeURIComponent(d.key),{cache:'no-store'});await consume(await r.json());}catch(e){fail('网络读取失败，请重新加载样例');}},1800);
 }
 try{
  if(location.hostname==='glitter0419.github.io'){
   $('#previewStatus').innerHTML='视频预览请使用 <a href="http://116.198.42.84:18045/" target="_blank" rel="noopener">IP地址版本 ↗</a>。此备用地址仅提供统计。';$('#loadPreview').disabled=false;return;
  }
  if(!previewConfig){const r=await fetch('/api/preview/config',{cache:'no-store'});previewConfig=await r.json();}
  if(version!==previewVersion)return;
  if(!previewConfig.enabled){fail('此地址尚未启用视频预览');return;}
  const r=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset:target.ds,kind:target.kind,item:target.id,sample:previewSample})});await consume(await r.json());
 }catch(e){fail('视频服务暂时无法连接，请稍后重试');}
}
function legend(){return `<div class="legend">${selected().map(d=>`<span><i class="dot ${d.id}"></i>${d.name}</span>`).join('')}</div>`;}
function comparisonBars(labels,getValues,max=0){const ds=selected();const values=labels.map(label=>ds.map(d=>getValues(d,label)));max=max||Math.max(...values.flat(),1);return legend()+labels.map((label,j)=>`<div class="comparison-row"><div class="comparison-name">${esc(label)}</div><div class="compare-bars">${ds.map((d,i)=>`<div class="compare-bar" title="${d.name}: ${values[j][i].toFixed(2)}%"><i style="width:${values[j][i]/max*84}%;background:${colors[d.id]}"></i><span>${values[j][i].toFixed(1)}%</span></div>`).join('')}</div></div>`).join('');}
function renderLanguage(){if(!meta)return;const ds=selected();$('#languageStats').innerHTML=ds.map(d=>{const l=d.language;return `<article class="card language-stat"><h3>${badge(d.id)} <span class="muted">真实任务指令</span></h3>${[['去重指令种数',fmt(d.instructions)],['仅在1条来源出现的指令',`${fmt(l.singleton)} 条 / ${pct(l.singleton/d.instructions)}`],['这些单来源指令覆盖的来源占比',pct(l.singleton_source_share)],['前10 / 前100条指令覆盖来源',`${pct(l.top10)} / ${pct(l.top100)}`],['来源加权句长中位数 / P90',`${l.word_p50} / ${l.word_p90} words`],['训练子集内指令种数',fmt(d.train_instructions)]].map(([k,v])=>`<div class="statline"><span>${k}</span><strong>${v}</strong></div>`).join('')}</article>`;}).join('');
 const bins=['1 source','2–5 sources','6–20 sources','21–100 sources','101+ sources'];$('#reuseChart').innerHTML=comparisonBars(bins,(d,l)=>100*d.language.frequency_bins[bins.indexOf(l)]/d.instructions,100);
 $('#lengthChart').innerHTML=lengthSvg(ds);
 const words=['wipe','clean','organize','put','place','take','move','open','remove','restock'];$('#wordChart').innerHTML=comparisonBars(words,(d,w)=>100*(Object.fromEntries(d.language.first_words)[w]||0)/d.sources);
 const obs=['cloth / wipe','table / desk','shelf / rack','cup / bottle','box / container','paper / document','bag','drawer / cabinet'];$('#objectChart').innerHTML=comparisonBars(obs,(d,o)=>100*(Object.fromEntries(d.language.objects)[o]||0)/d.sources);
}
function lengthSvg(ds){const width=480,height=250,L=38,R=14,T=20,B=40,iw=width-L-R,ih=height-T-B;let max=0;for(const d of ds)max=Math.max(max,...Object.values(d.language.length_hist).map(v=>v/d.sources*100));max=Math.ceil(max/5)*5;let grid='';for(let i=0;i<=4;i++){const y=T+ih-i/4*ih;grid+=`<line x1="${L}" y1="${y}" x2="${width-R}" y2="${y}" stroke="#e4e9e1"/><text x="${L-7}" y="${y+3}" text-anchor="end" fill="#849084" font-size="9">${(max*i/4).toFixed(0)}</text>`;}for(let n=0;n<=70;n+=10){const x=L+n/70*iw;grid+=`<text x="${x}" y="${height-B+19}" text-anchor="middle" fill="#849084" font-size="9">${n}</text>`;}
 const lines=ds.map(d=>{const hist=d.language.length_hist,pts=Array.from({length:71},(_,n)=>`${L+n/70*iw},${T+ih-(hist[n]||0)/d.sources*100/max*ih}`).join(' ');return `<polyline points="${pts}" fill="none" stroke="${colors[d.id]}" stroke-width="2"/>`;}).join('');return legend()+`<svg class="line-chart" role="img" aria-label="按来源加权的指令词数分布" viewBox="0 0 ${width} ${height}">${grid}${lines}<text x="${width/2}" y="${height-3}" fill="#718188" font-size="10" text-anchor="middle">Words per instruction</text><text x="${L}" y="10" fill="#718188" font-size="9">Share of sources (%)</text></svg>`;
}
async function loadDataset(d){const res=await fetch(`data/${d.id}.json`);if(!res.ok)throw new Error(`${d.name} 数据读取失败 (${res.status})`);const data=await res.json();data.taskRows=data.tasks.map((a,id)=>({ds:d.id,kind:'task',id,name:a[0],cn:a[1],category:a[2],n:a[3],h:a[4],w:a[5],links:a[6],search:(a[0]+' '+a[1]).toLocaleLowerCase()}));data.instructionRows=data.instructions.map((a,id)=>({ds:d.id,kind:'instruction',id,name:a[0],cn:'',n:a[1],h:a[2],w:a[3],links:a[4],search:a[0].toLocaleLowerCase()}));data.taskEdges=Array.from({length:data.tasks.length},()=>[]);data.promptEdges=Array.from({length:data.instructions.length},()=>[]);data.edges.forEach((e,i)=>{data.taskEdges[e[0]].push(i);data.promptEdges[e[1]].push(i);});
 if(data.taskRows.reduce((n,r)=>n+r.n,0)!==d.sources||data.instructionRows.reduce((n,r)=>n+r.n,0)!==d.sources)throw new Error(`${d.name} 来源数量与快照不符`);
 db[d.id]=data;allRows.task.push(...data.taskRows);allRows.instruction.push(...data.instructionRows);return d.name;
}
function bindEvents(){
 $$('.nav').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;renderState();});$('#methodLink').onclick=()=>{state.view='method';renderState();$('#methodView').scrollIntoView({behavior:'smooth'});};
 $('.brand').onclick=e=>{e.preventDefault();Object.assign(state,{view:'explore',dataset:'all',mode:'instruction',q:'',sort:'hours',page:1});renderState();window.scrollTo({top:0,behavior:'smooth'});};
 $$('#datasetTabs button').forEach(b=>b.onclick=()=>{state.dataset=b.dataset.ds;state.page=1;renderState();});
 $$('#modeTabs button').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.page=1;renderState();});
 $('#search').addEventListener('input',()=>{clearTimeout(bindEvents.searchTimer);bindEvents.searchTimer=setTimeout(()=>{state.q=$('#search').value;state.page=1;renderTable();syncUrl();},170);});
 $('#sort').onchange=()=>{state.sort=$('#sort').value;state.page=1;renderTable();syncUrl();};
 $$('.quick-queries button[data-query]').forEach(b=>b.onclick=()=>{state.q=b.dataset.query;state.page=1;renderState();});$('#reset').onclick=()=>{state.q='';state.page=1;renderState();};
 $('#prev').onclick=()=>{state.page--;renderTable();$('.explorer').scrollIntoView({behavior:'smooth',block:'start'});};$('#next').onclick=()=>{state.page++;renderTable();$('.explorer').scrollIntoView({behavior:'smooth',block:'start'});};
 $('#rows').addEventListener('click',e=>{const tr=e.target.closest('tr[data-id]');if(tr)openDetail(tr.dataset.ds,state.mode,+tr.dataset.id);});
 $('#rows').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const tr=e.target.closest('tr[data-id]');if(tr){e.preventDefault();openDetail(tr.dataset.ds,state.mode,+tr.dataset.id);}}});
 $('#closeDetail').onclick=closeDetail;$('#overlay').onclick=e=>{if(e.target===$('#overlay'))closeDetail();};$('#detailSearch').addEventListener('input',()=>{detailLimit=60;renderDetailRows();});$('#moreDetail').onclick=()=>{detailLimit+=60;renderDetailRows();};
 $('#loadPreview').onclick=()=>requestPreview(false);$('#nextPreview').onclick=()=>requestPreview(true);
 $('#detailRows').addEventListener('click',e=>{const r=e.target.closest('[data-other]');if(r)openDetail(detail.ds,r.dataset.other,+r.dataset.id);});$('#detailRows').addEventListener('keydown',e=>{if(e.key==='Enter'){const r=e.target.closest('[data-other]');if(r)openDetail(detail.ds,r.dataset.other,+r.dataset.id);}});
 $('#export').onclick=()=>{csvDownload(`EgoData_${state.dataset}_${state.mode}_20261030.csv`,['dataset','kind','name','source_hours','sources','valid_windows','related_items'],filtered.map(r=>[names[r.ds],r.kind,r.name,r.h,r.n,r.w,r.links]));toast(`已导出全部 ${fmt(filtered.length)} 条匹配结果`);};
 $('#exportDetail').onclick=()=>{const pred=matcher($('#detailSearch').value);const rows=detailList.filter(r=>pred(r.search));csvDownload(`EgoData_${detail.ds}_relations_20261030.csv`,['dataset','selected_type','selected_name','related_type','related_name','intersection_source_hours','intersection_sources','valid_windows','train_sources','train_source_hours'],rows.map(r=>[names[detail.ds],detail.kind,detail.row.name,r.otherKind,r.name,r.h,r.n,r.w,r.trainN,r.trainH]));toast('已导出逐对关系明细');};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();if(e.key==='/'&&$('#overlay').hidden&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();state.view='explore';renderState();$('#search').focus();}if(e.key==='Tab'&&!$('#overlay').hidden){const nodes=[...$('.drawer').querySelectorAll('button:not([hidden]),input,[tabindex="0"]')].filter(n=>n.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
}
async function main(){
 readUrl();bindEvents();renderState();
 try{const r=await fetch('data/meta.json');if(!r.ok)throw new Error('统计元数据加载失败');meta=await r.json();renderMetrics();$('#loadStatus').innerHTML='<i class="loading-spinner"></i>正在读取完整指令与关联统计…';let finished=0;await Promise.all(meta.datasets.map(async d=>{await loadDataset(d);finished++;$('#loadStatus').innerHTML=`<i class="loading-spinner"></i>已读取 ${finished}/2 个数据集…`;}));$('#loadStatus').textContent='完整统计已就绪 · 所有搜索均在浏览器内完成';renderState();window.__atlasReady=true;
 }catch(e){$('#loadStatus').textContent='加载失败，可刷新重试';$('#rows').innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}。请刷新页面重试。</td></tr>`;console.error(e);}
}
main();
