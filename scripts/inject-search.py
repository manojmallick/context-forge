#!/usr/bin/env python3
"""Inject SigMap docs search into all 6 HTML pages."""
import sys

SEARCH_BLOCK = r"""<!-- SigMap docs search — v1.5 -->
<style>
.cf-search-btn{background:none;border:1px solid var(--line2);border-radius:7px;padding:0 10px;height:32px;cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--t2);font-size:12px;font-family:inherit;transition:.15s;flex-shrink:0}
.cf-search-btn:hover{border-color:var(--p);color:var(--pd)}
.cf-search-btn kbd{font-size:10px;opacity:.6;font-family:'IBM Plex Mono',monospace}
#cf-search-overlay{display:none;position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);padding:80px 20px 20px}
#cf-search-overlay.open{display:flex;flex-direction:column;align-items:center}
#cf-search-box{width:100%;max-width:620px;background:var(--s2);border:1px solid var(--line2);border-radius:12px;overflow:hidden}
#cf-search-input{width:100%;padding:14px 16px;background:none;border:none;outline:none;font-size:16px;color:var(--t1);font-family:inherit}
#cf-search-input::placeholder{color:var(--t3)}
#cf-search-results{max-height:60vh;overflow-y:auto;border-top:1px solid var(--line)}
.cf-result{padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--line);transition:.12s}
.cf-result:hover{background:var(--pl)}
.cf-result-title{font-size:14px;color:var(--t1);font-weight:500}
.cf-result-snippet{font-size:12px;color:var(--t2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-no-results{padding:20px 16px;color:var(--t3);font-size:13px;text-align:center}
.cf-highlight{background:var(--al);color:var(--ad);border-radius:3px;padding:0 2px}
</style>
<div id="cf-search-overlay" role="dialog" aria-modal="true" aria-label="Search documentation">
  <div id="cf-search-box">
    <input id="cf-search-input" type="text" placeholder="Search docs\u2026 (Esc to close)" autocomplete="off" spellcheck="false">
    <div id="cf-search-results"></div>
  </div>
</div>
<script>
(function(){
  'use strict';
  var overlay=document.getElementById('cf-search-overlay');
  var inp=document.getElementById('cf-search-input');
  var results=document.getElementById('cf-search-results');
  var navLinks=document.querySelector('.nav-links');
  if(navLinks){
    var btn=document.createElement('button');
    btn.className='cf-search-btn';
    btn.setAttribute('aria-label','Search documentation');
    btn.title='Search docs (/)';
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><kbd>/</kbd>';
    btn.addEventListener('click',openSearch);
    var gh=navLinks.querySelector('.nav-gh');
    navLinks.insertBefore(btn,gh||null);
  }
  function openSearch(){overlay.classList.add('open');inp.focus();inp.select();}
  function closeSearch(){overlay.classList.remove('open');clearHL();results.innerHTML='';inp.value='';}
  document.addEventListener('keydown',function(e){
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();openSearch();}
    if(e.key==='Escape')closeSearch();
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)closeSearch();});
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function hl(text,q){
    if(!q)return esc(text);
    var i=text.toLowerCase().indexOf(q);
    if(i<0)return esc(text);
    return esc(text.slice(0,i))+'<mark class="cf-highlight">'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length));
  }
  var hlEls=[];
  function clearHL(){hlEls.forEach(function(el){el.style.outline='';el.style.outlineOffset='';});hlEls=[];}
  var idx=null;
  function buildIdx(){
    var items=[],lastH=null,lastEl=null;
    document.querySelectorAll('h1,h2,h3,h4,p,li').forEach(function(el){
      var t=el.tagName.toLowerCase();
      if(t==='h1'||t==='h2'||t==='h3'||t==='h4'){lastH=el.textContent.trim();lastEl=el;items.push({el:el,title:lastH,snippet:''});}
      else if(lastH){var tx=el.textContent.trim();if(tx.length>20)items.push({el:lastEl,title:lastH,snippet:tx.slice(0,120)});}
    });
    return items;
  }
  inp.addEventListener('input',function(){
    if(!idx)idx=buildIdx();
    var q=inp.value.toLowerCase().trim();
    if(!q){results.innerHTML='';clearHL();return;}
    var seen=new Set();
    var hits=idx.filter(function(it){
      var k=(it.el?it.el.id:'')||it.title;
      if(seen.has(k))return false;
      var m=(it.title+' '+it.snippet).toLowerCase().indexOf(q)>=0;
      if(m)seen.add(k);
      return m;
    }).slice(0,12);
    clearHL();
    if(!hits.length){results.innerHTML='<div class="cf-no-results">No results for \u201c'+esc(inp.value)+'\u201d</div>';return;}
    results.innerHTML='';
    hits.forEach(function(hit){
      var d=document.createElement('div');
      d.className='cf-result';
      d.innerHTML='<div class="cf-result-title">'+hl(hit.title,q)+'</div>'+(hit.snippet?'<div class="cf-result-snippet">'+hl(hit.snippet,q)+'</div>':'');
      d.addEventListener('click',function(){
        closeSearch();
        hit.el.scrollIntoView({behavior:'smooth',block:'start'});
        hit.el.style.outline='2px solid var(--a)';hit.el.style.outlineOffset='4px';
        hlEls.push(hit.el);
        setTimeout(function(){clearHL();},2000);
      });
      results.appendChild(d);
    });
  });
})();
</script>
"""

pages = [
    'docs/index.html',
    'docs/quick-start.html',
    'docs/strategies.html',
    'docs/languages.html',
    'docs/roadmap.html',
    'docs/repomix.html',
]

for p in pages:
    txt = open(p, encoding='utf-8').read()
    if 'cf-search-overlay' in txt:
        print(f'  SKIP  {p} (already patched)')
        continue
    new = txt.replace('\n</body>\n</html>', '\n' + SEARCH_BLOCK + '</body>\n</html>', 1)
    if new == txt:
        print(f'  FAIL  {p} (pattern not found)', file=sys.stderr)
        sys.exit(1)
    open(p, 'w', encoding='utf-8').write(new)
    print(f'  DONE  {p}')
