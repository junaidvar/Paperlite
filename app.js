/* PaperLite shared engine — loaded by every tool page.
   Each page contains only its own tool's markup; dnd() safely
   no-ops for tools not present on the current page. */
const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function setStatus(id,msg,cls){const e=document.getElementById('s-'+id);if(!e)return;
  e.textContent=msg;e.className='status '+(cls||'');}
function downloadFile(bytes,name,mime){const blob=new Blob([bytes],{type:mime});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();}
function download(bytes,name){downloadFile(bytes,name,'application/pdf');}

function dnd(dropId,inputId,handler){
  const d=document.getElementById(dropId),inp=document.getElementById(inputId);
  if(!d||!inp)return;
  d.addEventListener('dragover',e=>{e.preventDefault();d.classList.add('over')});
  d.addEventListener('dragleave',()=>d.classList.remove('over'));
  d.addEventListener('drop',e=>{e.preventDefault();d.classList.remove('over');handler(e.dataTransfer.files)});
  inp.addEventListener('change',()=>handler(inp.files));
}

/* ---------- MERGE ---------- */
let mergeFiles=[];
dnd('d-merge','f-merge',fs=>{for(const f of fs)if(f.type==='application/pdf')mergeFiles.push(f);renderMerge()});
function renderMerge(){const ul=document.getElementById('list-merge');ul.innerHTML='';
  mergeFiles.forEach((f,i)=>{const li=document.createElement('li');
    li.innerHTML=`<span>${i+1}. ${f.name}</span>`;
    const b=document.createElement('button');b.textContent='✕';b.onclick=()=>{mergeFiles.splice(i,1);renderMerge()};
    li.appendChild(b);ul.appendChild(li);});
  document.getElementById('btn-merge').disabled=mergeFiles.length<2;}
async function doMerge(){try{setStatus('merge','Merging…');
  const out=await PDFDocument.create();
  for(const f of mergeFiles){const src=await PDFDocument.load(await f.arrayBuffer());
    const pgs=await out.copyPages(src,src.getPageIndices());pgs.forEach(p=>out.addPage(p));}
  download(await out.save(),'merged.pdf');setStatus('merge','Done — downloaded merged.pdf','ok');
}catch(e){setStatus('merge','Error: '+e.message,'err')}}

/* ---------- SPLIT ---------- */
let splitFile=null;
dnd('d-split','f-split',fs=>{splitFile=fs[0];if(splitFile){
  document.getElementById('splitOpts').style.display='block';
  setStatus('split','Loaded: '+splitFile.name);}});
async function doSplitRange(){try{const src=await PDFDocument.load(await splitFile.arrayBuffer());
  const n=src.getPageCount();let a=+document.getElementById('sFrom').value,b=+document.getElementById('sTo').value;
  a=Math.max(1,a);b=Math.min(n,b);if(a>b){setStatus('split','Invalid range','err');return;}
  const out=await PDFDocument.create();const idx=[];for(let i=a-1;i<b;i++)idx.push(i);
  const pgs=await out.copyPages(src,idx);pgs.forEach(p=>out.addPage(p));
  download(await out.save(),`pages_${a}-${b}.pdf`);setStatus('split','Done','ok');
}catch(e){setStatus('split','Error: '+e.message,'err')}}
async function doSplitAll(){try{const src=await PDFDocument.load(await splitFile.arrayBuffer());
  const n=src.getPageCount();setStatus('split',`Preparing ${n} pages…`);
  const zip=new JSZip();
  for(let i=0;i<n;i++){const out=await PDFDocument.create();
    const [pg]=await out.copyPages(src,[i]);out.addPage(pg);
    zip.file(`page_${i+1}.pdf`,await out.save());
    setStatus('split',`Preparing… page ${i+1} of ${n}`);}
  const zipBytes=await zip.generateAsync({type:'uint8array'});
  const base=(splitFile.name||'split').replace(/\.pdf$/i,'');
  downloadFile(zipBytes,`${base}_pages.zip`,'application/zip');
  setStatus('split',`Done — ${n} pages in one zip file`,'ok');
}catch(e){setStatus('split','Error: '+e.message,'err')}}

/* ---------- IMG → PDF ---------- */
let imgFiles=[];
dnd('d-img','f-img',fs=>{for(const f of fs)if(f.type.startsWith('image/'))imgFiles.push(f);renderImg()});
function renderImg(){const ul=document.getElementById('list-img');ul.innerHTML='';
  imgFiles.forEach((f,i)=>{const li=document.createElement('li');li.innerHTML=`<span>${i+1}. ${f.name}</span>`;
    const b=document.createElement('button');b.textContent='✕';b.onclick=()=>{imgFiles.splice(i,1);renderImg()};
    li.appendChild(b);ul.appendChild(li);});
  document.getElementById('btn-img').disabled=imgFiles.length<1;}
async function doImg2Pdf(){try{setStatus('img','Building…');const out=await PDFDocument.create();
  for(const f of imgFiles){const buf=await f.arrayBuffer();
    const img=f.type==='image/png'?await out.embedPng(buf):await out.embedJpg(buf);
    const pg=out.addPage([img.width,img.height]);pg.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}
  download(await out.save(),'images.pdf');setStatus('img','Done — images.pdf','ok');
}catch(e){setStatus('img','Error: '+e.message,'err')}}

/* ---------- REMOVE PASSWORD (decrypt with known password) ---------- */
let unlockFile=null;
dnd('d-unlock','f-unlock',fs=>{unlockFile=fs[0];if(unlockFile)setStatus('unlock','Loaded: '+unlockFile.name);});

async function doUnlock(){
  try{
    const pw=document.getElementById('unlockPass').value;
    if(!unlockFile){setStatus('unlock','Choose a locked PDF first','err');return;}
    if(!pw){setStatus('unlock','Enter the password','err');return;}
    setStatus('unlock','Unlocking…');

    const src=new Uint8Array(await unlockFile.arrayBuffer());

    // pdf.js opens the encrypted PDF using the user-supplied password.
    let srcDoc;
    try{
      srcDoc=await pdfjsLib.getDocument({data:src.slice(0),password:pw}).promise;
    }catch(err){
      if(err && err.name==='PasswordException'){
        setStatus('unlock','That password is incorrect for this PDF.','err');return;
      }
      throw err;
    }

    // Rebuild a clean, unencrypted PDF by rasterising each decrypted page.
    // (Vector-faithful rebuild needs the page's original ops; rasterising is
    //  the reliable browser-only route and always produces an openable file.)
    const outDoc=await PDFDocument.create();
    const n=srcDoc.numPages;
    for(let i=1;i<=n;i++){
      setStatus('unlock',`Unlocking… page ${i} of ${n}`);
      const page=await srcDoc.getPage(i);
      const vp=page.getViewport({scale:2});            // 2x for decent quality
      const c=document.createElement('canvas');
      c.width=vp.width;c.height=vp.height;
      await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      const png=await new Promise(r=>c.toBlob(r,'image/png'));
      const buf=new Uint8Array(await png.arrayBuffer());
      const img=await outDoc.embedPng(buf);
      const pg=outDoc.addPage([page.getViewport({scale:1}).width,
                               page.getViewport({scale:1}).height]);
      pg.drawImage(img,{x:0,y:0,width:pg.getWidth(),height:pg.getHeight()});
    }
    download(await outDoc.save(),'unlocked.pdf');
    setStatus('unlock',`Done — unlocked.pdf (${n} page${n>1?'s':''}), no password required.`,'ok');
  }catch(e){setStatus('unlock','Error: '+e.message,'err');console.error(e);}
}

/* ---------- ROTATE ---------- */
let rotFile=null;
dnd('d-rot','f-rot',fs=>{rotFile=fs[0];if(rotFile){
  document.getElementById('rotOpts').style.display='flex';setStatus('rot','Loaded: '+rotFile.name);}});
async function doRotate(deg){try{const src=await PDFDocument.load(await rotFile.arrayBuffer());
  src.getPages().forEach(p=>{const cur=p.getRotation().angle;p.setRotation(degrees((cur+deg)%360))});
  download(await src.save(),'rotated.pdf');setStatus('rot','Done — rotated.pdf','ok');
}catch(e){setStatus('rot','Error: '+e.message,'err')}}

/* ---------- FILL FORM (the differentiator) ---------- */
let fillBytes=null,pdfDoc=null,curPage=1,totalPages=1,renderScale=1.4;
let fields=[]; // {el,text,page,type,fontFamily,fontPt}

// fillBytes is a plain Uint8Array we NEVER pass out directly.
// Each consumer (pdf.js, pdf-lib) gets its own fresh ArrayBuffer copy,
// because both libraries detach/transfer the buffer they're given.
function freshBytes(){
  const copy=new Uint8Array(fillBytes.length);
  copy.set(fillBytes);          // deep copy into a brand-new buffer
  return copy;
}

dnd('d-fill','f-fill',async fs=>{
  const f=fs[0];if(!f)return;
  const ab=await f.arrayBuffer();
  fillBytes=new Uint8Array(ab.byteLength);
  fillBytes.set(new Uint8Array(ab));          // own private master copy
  document.getElementById('editorWrap').style.display='block';
  document.getElementById('d-fill').style.display='none';
  pdfDoc=await pdfjsLib.getDocument({data:freshBytes()}).promise;
  totalPages=pdfDoc.numPages;curPage=1;
  await renderPage();
});

async function renderPage(){
  const page=await pdfDoc.getPage(curPage);
  const vp=page.getViewport({scale:renderScale});
  const canvas=document.getElementById('pdfCanvas');
  canvas.width=vp.width;canvas.height=vp.height;
  await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
  document.getElementById('pageInfo').textContent=`Page ${curPage} / ${totalPages}`;
  // show only this page's fields (use class, not inline display, so flex layout is preserved)
  fields.forEach(fl=>fl.el.style.display = (fl.page===curPage?'flex':'none'));
}
function changePage(d){const n=curPage+d;if(n<1||n>totalPages)return;curPage=n;renderPage();}

// ---- IMAGE / SIGNATURE field ----
(function wireImageInput(){
  const inp=document.getElementById('imgInput');
  if(!inp)return;
  inp.addEventListener('change',async ()=>{
    const f=inp.files[0];inp.value='';            // reset so same file can be re-picked
    if(!f)return;
    if(!/image\/(png|jpeg)/.test(f.type)){
      setStatus('fill','Please choose a PNG or JPG image','err');return;
    }
    const buf=new Uint8Array(await f.arrayBuffer());
    const dataUrl=await new Promise(res=>{
      const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(f);
    });
    // load to get natural aspect ratio so the placed box isn't distorted
    const im=new Image();
    im.onload=()=>addImageField({dataUrl,bytes:buf,
      isPng:f.type==='image/png',natW:im.width,natH:im.height});
    im.src=dataUrl;
  });
})();

function addImageField(imgData){
  const stage=document.getElementById('editorStage');
  const wrap=document.createElement('div');
  wrap.className='field';
  wrap.style.left='40px';wrap.style.top='40px';
  // start ~160px wide, height from the image's real aspect ratio
  const startW=160, ar=imgData.natH/imgData.natW || 0.4;
  wrap.style.width=startW+'px';
  wrap.style.height=Math.max(30,Math.round(startW*ar))+'px';

  const im=document.createElement('img');
  im.className='field-img';im.src=imgData.dataUrl;im.draggable=false;

  const del=document.createElement('button');
  del.className='field-del';del.textContent='✕';del.title='Delete this image';

  const grip=document.createElement('div');
  grip.className='field-grip';grip.title='Drag to resize';

  wrap.appendChild(im);wrap.appendChild(del);wrap.appendChild(grip);
  stage.appendChild(wrap);

  const rec={
    el:wrap,text:im,page:curPage,type:'image',
    imgBytes:imgData.bytes,isPng:imgData.isPng
  };
  fields.push(rec);

  del.addEventListener('click',ev=>{ev.stopPropagation();removeField(rec)});
  im.addEventListener('mousedown',()=>selectField(rec));
  makeInteractive(wrap,im,grip,rec);
  selectField(rec);
}

function addField(type){
  const stage=document.getElementById('editorStage');
  const wrap=document.createElement('div');
  wrap.className='field';
  wrap.style.left='40px';wrap.style.top='40px';
  wrap.style.width=(type==='check'?'36px':'150px');
  wrap.style.height=(type==='check'?'36px':'28px');

  const el=document.createElement('span');
  el.className='field-text';
  el.contentEditable='true';
  el.textContent=type==='check'?'✓':'';

  const del=document.createElement('button');
  del.className='field-del';del.textContent='✕';del.title='Delete this box';

  const grip=document.createElement('div');
  grip.className='field-grip';grip.title='Drag to resize';

  wrap.appendChild(el);wrap.appendChild(del);wrap.appendChild(grip);
  stage.appendChild(wrap);

  const rec={
    el:wrap,text:el,page:curPage,type,
    fontFamily:'Helvetica',
    fontPt: type==='check'? 14 : 11      // actual point size, MS Word default 11
  };
  fields.push(rec);

  del.addEventListener('click',ev=>{ev.stopPropagation();removeField(rec)});
  el.addEventListener('focus',()=>selectField(rec));
  el.addEventListener('mousedown',()=>selectField(rec));
  makeInteractive(wrap,el,grip,rec);
  fitText(rec);
  selectField(rec);
  el.focus();
}
function removeField(rec){rec.el.remove();fields=fields.filter(f=>f!==rec);
  if(activeField===rec){activeField=null;syncFontUI();}}

const SCREEN_FONT={Helvetica:'Arial, sans-serif',
                   TimesRoman:'"Times New Roman", serif',
                   Courier:'"Courier New", monospace'};

// Render text at its true point size, scaled to match the on-screen PDF zoom.
// Box size is independent of text size now (matches MS Word mental model).
function fitText(rec){
  const screenPx=rec.fontPt*renderScale;     // pt → on-screen px at current zoom
  rec.text.style.fontSize=screenPx+'px';
  rec.text.style.lineHeight=rec.el.offsetHeight+'px';
  rec.text.style.fontFamily=SCREEN_FONT[rec.fontFamily]||'Arial, sans-serif';
}

function makeInteractive(wrap,textEl,grip,rec){
  // ---- MOVE (drag the box body, not the text/handles) ----
  let mode=null,sx,sy,ox,oy,rw,rh;
  wrap.addEventListener('mousedown',e=>{
    if(e.target===textEl||e.target===grip||e.target.className==='field-del')return;
    mode='move';sx=e.clientX;sy=e.clientY;
    ox=parseInt(wrap.style.left)||0;oy=parseInt(wrap.style.top)||0;
    selectField(rec);e.preventDefault();
  });
  // ---- RESIZE (dedicated handler on the grip, fully isolated) ----
  grip.addEventListener('mousedown',e=>{
    mode='resize';sx=e.clientX;sy=e.clientY;
    rw=wrap.offsetWidth;rh=wrap.offsetHeight;
    selectField(rec);e.preventDefault();e.stopPropagation();
  });
  function onMove(e){
    if(mode==='move'){
      wrap.style.left=(ox+e.clientX-sx)+'px';
      wrap.style.top=(oy+e.clientY-sy)+'px';
    }else if(mode==='resize'){
      wrap.style.width=Math.max(28,rw+e.clientX-sx)+'px';
      wrap.style.height=Math.max(18,rh+e.clientY-sy)+'px';
      rec.text.style.lineHeight=wrap.offsetHeight+'px';   // keep vertical centring; text size unchanged
    }
  }
  function onUp(){mode=null;}
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);

  wrap.addEventListener('dblclick',e=>{if(e.target!==textEl)removeField(rec)});
  textEl.addEventListener('keydown',e=>{
    if(rec.type==='image')return;            // images have no editable text
    if((e.key==='Delete'||e.key==='Backspace') && textEl.textContent.trim()===''){
      e.preventDefault();removeField(rec);
    }
  });
}

// ---- active-field selection: only the active box shows its outline ----
let activeField=null;
function selectField(rec){
  activeField=rec;
  fields.forEach(f=>f.el.classList.toggle('active',f===rec));
  syncFontUI();
}
function syncFontUI(){
  const fs=document.getElementById('fontFamilySel');
  const sz=document.getElementById('fontSizeSel');
  // font controls only apply to editable text fields
  const isText = activeField && activeField.type!=='image' && activeField.type!=='check';
  fs.disabled=sz.disabled=!isText;
  if(isText){fs.value=activeField.fontFamily;
    sz.value=String(activeField.fontPt);}
}
function applyFontFamily(v){if(!activeField)return;activeField.fontFamily=v;fitText(activeField);}
function applyFontSize(v){if(!activeField)return;activeField.fontPt=+v;fitText(activeField);}

async function exportFilled(){
  try{
    if(!fields.length){setStatus('fill','Add a text box, checkmark or image first','err');return;}
    setStatus('fill','Generating…');
    const out=await PDFDocument.load(freshBytes());
    const fontMap={
      Helvetica:await out.embedFont(StandardFonts.Helvetica),
      TimesRoman:await out.embedFont(StandardFonts.TimesRoman),
      Courier:await out.embedFont(StandardFonts.Courier)
    };
    const pages=out.getPages();
    const canvas=document.getElementById('pdfCanvas');
    const origPage=curPage;

    for(const fl of fields){
      // images have no text content; only skip empty TEXT fields
      if(fl.type!=='image'){
        const raw=fl.text.textContent;
        if(!raw||!raw.trim())continue;
      }

      if(fl.page!==curPage){curPage=fl.page;await renderPage();}
      const cRect=canvas.getBoundingClientRect();
      const fRect=fl.el.getBoundingClientRect();
      const xPx=fRect.left-cRect.left;
      const yPx=fRect.top-cRect.top;

      const pg=pages[fl.page-1];
      const {width:pw,height:ph}=pg.getSize();
      const xRatio=xPx/canvas.width;
      const yRatio=yPx/canvas.height;
      const boxH=fRect.height, boxW=fRect.width;
      const pdfPerPx=ph/canvas.height;
      const boxTopPdf=ph-(yRatio*ph);
      const xLeft=xRatio*pw;

      if(fl.type==='image'){
        // Embed the original image bytes and draw at the box's exact
        // on-screen position and size, mapped into PDF units.
        const img = fl.isPng
          ? await out.embedPng(fl.imgBytes)
          : await out.embedJpg(fl.imgBytes);
        const wPdf = boxW*pdfPerPx;
        const hPdf = boxH*pdfPerPx;
        pg.drawImage(img,{
          x: xLeft,
          y: boxTopPdf - hPdf,
          width: wPdf,
          height: hPdf
        });
        continue;
      }

      if(fl.type==='check'){
        // The standard PDF fonts CANNOT encode the ✓ glyph (WinAnsi limitation),
        // so we draw the tick as two vector strokes instead — always works.
        const s=Math.min(boxW,boxH)*pdfPerPx*0.7;          // tick size in pt
        const cx=xLeft+(boxW*pdfPerPx)/2;
        const cy=boxTopPdf-(boxH*pdfPerPx)/2;
        const lw=Math.max(1.2,s*0.14);
        pg.drawLine({start:{x:cx-s*0.45,y:cy-s*0.02},end:{x:cx-s*0.08,y:cy-s*0.38},thickness:lw,color:rgb(0.08,0.08,0.08)});
        pg.drawLine({start:{x:cx-s*0.08,y:cy-s*0.38},end:{x:cx+s*0.5,y:cy+s*0.42},thickness:lw,color:rgb(0.08,0.08,0.08)});
        continue;
      }

      // Text field: strip any character the standard font can't encode,
      // so one stray glyph can never abort the whole download.
      const txt=raw.replace(/[^\x20-\x7E]/g,'').trim();
      if(!txt)continue;

      const fontSize=fl.fontPt||11;
      const font=fontMap[fl.fontFamily]||fontMap.Helvetica;
      const yPos=boxTopPdf-(boxH*pdfPerPx)/2-fontSize/2.8;

      pg.drawText(txt,{
        x:xLeft + 3,
        y:yPos,
        size:fontSize,font,color:rgb(0.08,0.08,0.08)
      });
    }
    if(curPage!==origPage){curPage=origPage;await renderPage();}
    download(await out.save(),'filled.pdf');
    setStatus('fill','Done — filled.pdf downloaded','ok');
  }catch(e){setStatus('fill','Error: '+e.message,'err');console.error(e);}
}

/* ---------- DOCX TO PDF (text extraction only — formatting is approximate) ---------- */
let docxFile=null;
dnd('d-docx','f-docx',fs=>{
  docxFile=fs[0];
  if(docxFile)setStatus('docx','Loaded: '+docxFile.name);
});

async function doDocxToPdf(){
  try{
    if(!docxFile){setStatus('docx','Choose a Word document first','err');return;}
    if(typeof mammoth==='undefined'){
      setStatus('docx','Conversion library failed to load — try again','err');return;
    }
    setStatus('docx','Extracting text…');
    const buf=await docxFile.arrayBuffer();
    const result=await mammoth.extractRawText({arrayBuffer:buf});
    const text=(result.value||'').trim();
    if(!text){setStatus('docx','No readable text found in this document','err');return;}

    setStatus('docx','Building PDF…');
    const out=await PDFDocument.create();
    const font=await out.embedFont(StandardFonts.Helvetica);
    const pageW=595, pageH=842, margin=50, fontSize=11, lineH=15;
    const maxWidth=pageW-margin*2;
    let page=out.addPage([pageW,pageH]);
    let y=pageH-margin;

    // Sanitize to WinAnsi-safe characters so the standard font won't reject anything
    const cleanText=text.replace(/[^\x20-\x7E\n]/g,' ');
    const paragraphs=cleanText.split(/\n+/);

    for(const para of paragraphs){
      if(!para.trim()){y-=lineH; continue;}
      const words=para.split(/\s+/);
      let line='';
      for(const w of words){
        const trial=line?line+' '+w:w;
        const width=font.widthOfTextAtSize(trial,fontSize);
        if(width<=maxWidth){line=trial;}
        else{
          if(y<margin+lineH){page=out.addPage([pageW,pageH]);y=pageH-margin;}
          page.drawText(line,{x:margin,y,size:fontSize,font,color:rgb(0.08,0.08,0.08)});
          y-=lineH;
          line=w;
        }
      }
      if(line){
        if(y<margin+lineH){page=out.addPage([pageW,pageH]);y=pageH-margin;}
        page.drawText(line,{x:margin,y,size:fontSize,font,color:rgb(0.08,0.08,0.08)});
        y-=lineH;
      }
      y-=lineH*0.4;       // small paragraph gap
    }

    download(await out.save(),docxFile.name.replace(/\.docx?$/i,'')+'.pdf');
    setStatus('docx','Done — PDF downloaded. Note: complex formatting (tables, images, exact fonts) is not preserved by this basic converter.','ok');
  }catch(e){setStatus('docx','Error: '+e.message,'err');console.error(e);}
}

/* ---------- EPUB TO PDF ---------- */
let epubFile=null;
dnd('d-epub','f-epub',fs=>{
  epubFile=fs[0];
  if(epubFile)setStatus('epub','Loaded: '+epubFile.name);
});

async function doEpubToPdf(){
  try{
    if(!epubFile){setStatus('epub','Choose an EPUB file first','err');return;}
    if(typeof JSZip==='undefined'){
      setStatus('epub','EPUB library failed to load — try again','err');return;
    }
    setStatus('epub','Reading EPUB…');
    const zip=await JSZip.loadAsync(await epubFile.arrayBuffer());

    // EPUBs follow a standard structure: META-INF/container.xml points to the
    // OPF manifest, which lists the spine (reading order) of XHTML chapters.
    const containerXml=await zip.file('META-INF/container.xml')?.async('string');
    if(!containerXml){setStatus('epub','Not a valid EPUB file','err');return;}
    const opfPath=(containerXml.match(/full-path=["']([^"']+)["']/)||[])[1];
    if(!opfPath){setStatus('epub','Could not find EPUB manifest','err');return;}
    const opfDir=opfPath.includes('/')?opfPath.replace(/\/[^/]+$/,'/'):'';
    const opfXml=await zip.file(opfPath)?.async('string');
    if(!opfXml){setStatus('epub','Could not read EPUB manifest file','err');return;}

    // Resolve a manifest href (which may be relative, use ./ or ../, or be
    // percent-encoded) against the OPF's own directory into a real zip path.
    function resolveEpubPath(dir,href){
      const clean=decodeURIComponent(href.split('#')[0]);
      const parts=(dir+clean).split('/');
      const out=[];
      for(const p of parts){
        if(p===''||p==='.')continue;
        if(p==='..'){out.pop();continue;}
        out.push(p);
      }
      return out.join('/');
    }
    // Look a resolved path up in the zip, falling back to a case-insensitive
    // match — some EPUB packagers are inconsistent about href casing.
    function findZipFile(path){
      const direct=zip.file(path);
      if(direct)return direct;
      const lower=path.toLowerCase();
      const hitKey=Object.keys(zip.files).find(k=>k.toLowerCase()===lower);
      return hitKey?zip.file(hitKey):null;
    }

    // Parse manifest: id -> href. Attribute order is NOT guaranteed by the
    // EPUB spec — Calibre and many other tools write href before id — so we
    // read each <item> tag's attributes independently rather than assuming
    // a fixed order. Handles both single- and double-quoted attributes.
    const manifest={};
    const itemRe=/<item\b([^>]*)>/g;
    let m; while((m=itemRe.exec(opfXml))!==null){
      const attrs=m[1];
      const idM=attrs.match(/\bid=["']([^"']+)["']/);
      const hrefM=attrs.match(/\bhref=["']([^"']+)["']/);
      if(idM&&hrefM)manifest[idM[1]]=hrefM[1];
    }
    const spineRe=/<itemref\s+[^>]*idref=["']([^"']+)["']/g;
    const order=[]; while((m=spineRe.exec(opfXml))!==null){
      if(manifest[m[1]])order.push(manifest[m[1]]);
    }
    if(!order.length){setStatus('epub','No readable chapters found — this EPUB\'s manifest could not be parsed','err');return;}

    setStatus('epub','Extracting text from chapters…');
    // Read each chapter file, strip HTML/CSS down to plain text
    const chapters=[];
    let unresolved=0;
    for(const href of order){
      const path=resolveEpubPath(opfDir,href);
      const file=findZipFile(path);
      if(!file){unresolved++;continue;}
      const html=await file.async('string');
      // crude but reliable: drop scripts/styles, then tags, decode common entities
      const text=html
        .replace(/<script[\s\S]*?<\/script>/gi,'')
        .replace(/<style[\s\S]*?<\/style>/gi,'')
        .replace(/<\/p>/gi,'\n\n')
        .replace(/<br\s*\/?>/gi,'\n')
        .replace(/<\/h[1-6]>/gi,'\n\n')
        .replace(/<[^>]+>/g,'')
        .replace(/&nbsp;/g,' ')
        .replace(/&amp;/g,'&')
        .replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>')
        .replace(/&quot;/g,'"')
        .replace(/&#39;/g,"'")
        .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n))
        .replace(/\n{3,}/g,'\n\n')
        .replace(/[^\x20-\x7E\n]/g,' ')
        .trim();
      if(text)chapters.push(text);
    }
    if(!chapters.length){
      setStatus('epub', unresolved
        ? `Could not read any chapter files (${unresolved} referenced but missing from the EPUB)`
        : 'No readable text found in EPUB','err');
      return;
    }

    setStatus('epub','Building PDF…');
    const out=await PDFDocument.create();
    const font=await out.embedFont(StandardFonts.TimesRoman);
    const pageW=595, pageH=842, margin=60, fontSize=12, lineH=17;
    const maxWidth=pageW-margin*2;
    let page=out.addPage([pageW,pageH]);
    let y=pageH-margin;

    for(let ci=0;ci<chapters.length;ci++){
      // start each chapter on a new page (except the first)
      if(ci>0){page=out.addPage([pageW,pageH]);y=pageH-margin;}
      const paragraphs=chapters[ci].split(/\n\n+/);
      for(const para of paragraphs){
        if(!para.trim())continue;
        const words=para.replace(/\s+/g,' ').trim().split(' ');
        let line='';
        for(const w of words){
          const trial=line?line+' '+w:w;
          const width=font.widthOfTextAtSize(trial,fontSize);
          if(width<=maxWidth){line=trial;}
          else{
            if(y<margin+lineH){page=out.addPage([pageW,pageH]);y=pageH-margin;}
            page.drawText(line,{x:margin,y,size:fontSize,font,color:rgb(0.08,0.08,0.08)});
            y-=lineH;
            line=w;
          }
        }
        if(line){
          if(y<margin+lineH){page=out.addPage([pageW,pageH]);y=pageH-margin;}
          page.drawText(line,{x:margin,y,size:fontSize,font,color:rgb(0.08,0.08,0.08)});
          y-=lineH;
        }
        y-=lineH*0.5;          // paragraph gap
      }
    }

    download(await out.save(),epubFile.name.replace(/\.epub$/i,'')+'.pdf');
    setStatus('epub',`Done — ${chapters.length} chapter${chapters.length>1?'s':''} converted to PDF.`,'ok');
  }catch(e){setStatus('epub','Error: '+e.message,'err');console.error(e);}
}
