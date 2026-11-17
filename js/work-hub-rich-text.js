"use strict";

(() => {
  const MARKER = "<!--WH_RICH_V1-->";
  const allowedTags = new Set(["P","DIV","BR","STRONG","B","EM","I","U","H2","H3","UL","OL","LI","TABLE","THEAD","TBODY","TR","TH","TD","A"]);
  const esc = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function safeHref(value){
    const href=String(value||"").trim();
    if(!href) return "";
    try{
      const url=new URL(href,window.location.origin);
      if(["http:","https:","mailto:"].includes(url.protocol)) return href;
    }catch{}
    return "";
  }

  function cleanNode(node,doc){
    if(node.nodeType===Node.TEXT_NODE) return doc.createTextNode(node.nodeValue||"");
    if(node.nodeType!==Node.ELEMENT_NODE) return doc.createDocumentFragment();
    const tag=String(node.tagName||"").toUpperCase();
    if(!allowedTags.has(tag)){
      const fragment=doc.createDocumentFragment();
      [...node.childNodes].forEach((child)=>fragment.appendChild(cleanNode(child,doc)));
      return fragment;
    }
    const el=doc.createElement(tag.toLowerCase());
    if(tag==="A"){
      const href=safeHref(node.getAttribute("href"));
      if(href){
        el.setAttribute("href",href);
        el.setAttribute("target","_blank");
        el.setAttribute("rel","noopener noreferrer");
      }
    }
    if(["TH","TD"].includes(tag)){
      const colspan=Math.max(1,Math.min(12,Number(node.getAttribute("colspan"))||1));
      const rowspan=Math.max(1,Math.min(50,Number(node.getAttribute("rowspan"))||1));
      if(colspan>1) el.setAttribute("colspan",String(colspan));
      if(rowspan>1) el.setAttribute("rowspan",String(rowspan));
    }
    [...node.childNodes].forEach((child)=>el.appendChild(cleanNode(child,doc)));
    return el;
  }

  function sanitizeHtml(html){
    const parser=new DOMParser();
    const source=parser.parseFromString("<div>"+String(html||"")+"</div>","text/html");
    const out=document.createElement("div");
    const root=source.body.firstElementChild;
    [...(root?.childNodes||[])].forEach((node)=>out.appendChild(cleanNode(node,document)));
    out.querySelectorAll("a:not([href])").forEach((a)=>a.replaceWith(...a.childNodes));
    return out.innerHTML;
  }

  function plainFromHtml(html){
    const div=document.createElement("div");
    div.innerHTML=sanitizeHtml(html);
    return (div.innerText||div.textContent||"").replace(/\u00a0/g," ").trim();
  }

  function isRich(value){ return String(value??"").startsWith(MARKER); }
  function storedHtml(value){ const text=String(value??""); return isRich(text)?text.slice(MARKER.length):""; }
  function plainToHtml(value){
    const text=String(value??"");
    if(!text) return "";
    return text.split(/\r?\n/).map((line)=>line?"<div>"+esc(line)+"</div>":"<div><br></div>").join("");
  }
  function render(value){
    const text=String(value??"");
    if(!text) return "";
    return isRich(text)?sanitizeHtml(storedHtml(text)):plainToHtml(text);
  }
  function getElement(target){
    if(!target) return null;
    return typeof target==="string"?document.getElementById(target):target;
  }
  function set(target,value){
    const el=getElement(target);
    if(!el) return;
    el.innerHTML=render(value);
    el.dataset.richReady="true";
  }
  function get(target){
    const el=getElement(target);
    if(!el) return "";
    const clean=sanitizeHtml(el.innerHTML);
    return plainFromHtml(clean)?MARKER+clean:"";
  }
  function plain(valueOrElement){
    const el=getElement(valueOrElement);
    if(el&&el.nodeType===Node.ELEMENT_NODE) return (el.innerText||el.textContent||"").replace(/\u00a0/g," ").trim();
    const value=String(valueOrElement??"");
    return isRich(value)?plainFromHtml(storedHtml(value)):value.trim();
  }
  function clear(target){
    const el=getElement(target);
    if(!el) return;
    el.innerHTML="";
    el.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function insertHtml(html){ document.execCommand("insertHTML",false,sanitizeHtml(html)); }
  function buildTable(rows){
    const maxCols=Math.max(...rows.map((row)=>row.length));
    const normalized=rows.map((row)=>Array.from({length:maxCols},(_,i)=>String(row[i]??"").trim()));
    const head=normalized[0];
    const body=normalized.slice(1);
    return "<table><thead><tr>"+head.map((cell)=>"<th>"+esc(cell)+"</th>").join("")+"</tr></thead><tbody>"+
      body.map((row)=>"<tr>"+row.map((cell)=>"<td>"+esc(cell)+"</td>").join("")+"</tr>").join("")+
      "</tbody></table><p><br></p>";
  }
  function tableRowsFromText(text){
    const lines=String(text||"").replace(/\r/g,"").split("\n").filter((line)=>line.trim()!=="");
    if(lines.length<2) return null;
    const rows=lines.map((line)=>line.split("\t"));
    return Math.max(...rows.map((row)=>row.length))>=2?rows:null;
  }
  function command(editor,cmd){
    editor.focus();
    if(cmd==="bold") document.execCommand("bold",false,null);
    else if(cmd==="italic") document.execCommand("italic",false,null);
    else if(cmd==="h2") document.execCommand("formatBlock",false,"h2");
    else if(cmd==="ul") document.execCommand("insertUnorderedList",false,null);
    else if(cmd==="ol") document.execCommand("insertOrderedList",false,null);
    else if(cmd==="link"){
      const href=prompt("Paste the link URL:");
      if(href&&safeHref(href)) document.execCommand("createLink",false,href);
    }else if(cmd==="table"){
      insertHtml("<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr></tbody></table><p><br></p>");
    }else if(cmd==="clear") document.execCommand("removeFormat",false,null);
    editor.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function enhance(wrapper){
    if(!wrapper||wrapper.dataset.richEnhanced==="true") return;
    const editor=wrapper.querySelector(".wh-rich-surface");
    if(!editor) return;
    wrapper.dataset.richEnhanced="true";
    wrapper.querySelectorAll("[data-rich-cmd]").forEach((button)=>{
      button.addEventListener("mousedown",(event)=>event.preventDefault());
      button.addEventListener("click",()=>command(editor,button.dataset.richCmd));
    });
    wrapper.querySelector("[data-rich-expand]")?.addEventListener("click",()=>{
      wrapper.classList.toggle("expanded");
      document.body.classList.toggle("wh-rich-expanded-open",wrapper.classList.contains("expanded"));
      editor.focus();
    });
    editor.addEventListener("paste",(event)=>{
      if(event.clipboardData?.files?.length) return;
      const rows=tableRowsFromText(event.clipboardData?.getData("text/plain")||"");
      if(!rows) return;
      event.preventDefault();
      insertHtml(buildTable(rows));
      editor.dispatchEvent(new Event("input",{bubbles:true}));
    });
  }
  function enhanceAll(root=document){ root.querySelectorAll?.(".wh-rich-editor").forEach(enhance); }
  function editorMarkup(id,placeholder="",compact=false){
    return '<div class="wh-rich-editor '+(compact?'compact':'')+'" data-editor-for="'+esc(id)+'">'+
      '<div class="wh-rich-toolbar">'+
      '<button type="button" class="ghost small" data-rich-cmd="bold" title="Bold"><strong>B</strong></button>'+
      '<button type="button" class="ghost small" data-rich-cmd="italic" title="Italic"><em>I</em></button>'+
      '<button type="button" class="ghost small" data-rich-cmd="h2" title="Heading">Heading</button>'+
      '<button type="button" class="ghost small" data-rich-cmd="ul" title="Bulleted list">• List</button>'+
      '<button type="button" class="ghost small" data-rich-cmd="ol" title="Numbered list">1. List</button>'+
      '<button type="button" class="ghost small" data-rich-cmd="link" title="Link">Link</button>'+
      '<button type="button" class="ghost small" data-rich-cmd="table" title="Insert table">Table</button>'+
      '<button type="button" class="ghost small" data-rich-cmd="clear" title="Clear formatting">Clear</button>'+
      '<button type="button" class="ghost small" data-rich-expand title="Expand editor">Expand</button>'+
      '</div>'+
      '<div id="'+esc(id)+'" class="wh-rich-surface" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="'+esc(placeholder)+'"></div>'+
      '<div class="wh-rich-helper">Paste rows from Sheets/Excel to automatically create a table.</div>'+
      '</div>';
  }

  const style=document.createElement("style");
  style.textContent=
    '.wh-rich-editor{border:1px solid #94a3b8;border-radius:10px;background:#fff;overflow:hidden}'+
    '.wh-rich-toolbar{display:flex;gap:5px;flex-wrap:wrap;padding:7px;background:#f8fafc;border-bottom:1px solid #dbe3ef}'+
    '.wh-rich-toolbar .small{padding:5px 8px;font-size:11px}.wh-rich-surface{min-height:130px;padding:10px 12px;outline:none;line-height:1.45;overflow:auto}'+
    '.wh-rich-editor.compact .wh-rich-surface{min-height:90px}.wh-rich-surface:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}'+
    '.wh-rich-surface h2{font-size:20px;margin:8px 0}.wh-rich-surface ul,.wh-rich-surface ol{padding-left:24px}'+
    '.wh-rich-surface table,.wh-rich-output table{border-collapse:collapse;width:auto;max-width:100%;margin:10px 0}'+
    '.wh-rich-surface th,.wh-rich-surface td,.wh-rich-output th,.wh-rich-output td{border:1px solid #94a3b8;padding:6px 10px;text-align:left;vertical-align:top}'+
    '.wh-rich-surface th,.wh-rich-output th{background:#f1f5f9;font-weight:850}.wh-rich-surface a,.wh-rich-output a{color:#2563eb;font-weight:700}'+
    '.wh-rich-helper{padding:5px 9px 7px;color:#64748b;font-size:10px;background:#fff}'+
    '.wh-rich-editor.expanded{position:fixed;inset:28px;z-index:7000;box-shadow:0 30px 80px rgba(15,23,42,.35);display:flex;flex-direction:column}'+
    '.wh-rich-editor.expanded .wh-rich-surface{flex:1;min-height:0;font-size:15px}body.wh-rich-expanded-open{overflow:hidden}'+
    '.wh-rich-output{white-space:normal;line-height:1.5}.wh-rich-output p,.wh-rich-output div{margin:0 0 8px}.wh-rich-output p:last-child,.wh-rich-output div:last-child{margin-bottom:0}';
  document.head.appendChild(style);

  const observer=new MutationObserver(()=>enhanceAll(document));
  observer.observe(document.body,{childList:true,subtree:true});
  enhanceAll(document);

  window.WorkHubRichText={marker:MARKER,sanitizeHtml,render,set,get,plain,clear,enhanceAll,editorMarkup};
})();
