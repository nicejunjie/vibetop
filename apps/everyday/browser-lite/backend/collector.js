/* Runs only in the remote Chromium. Website data is untrusted at every boundary. */
(() => {
  const key = __BRIDGE_LITERAL__;
  const ids = new WeakMap(), nodes = new Map();
  let serial = 0, dirty = true, previousProps = '', previousMeta = '', previousStyles = '';
  const idOf = node => { if (!ids.has(node)) { ids.set(node, ++serial); nodes.set(serial, node); } return ids.get(node); };
  const skipped = new Set(['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TEMPLATE']);
  new MutationObserver(() => { dirty = true; }).observe(document, { subtree:true, childList:true, attributes:true, characterData:true });
  document.addEventListener('input', () => { dirty = true; }, true);
  document.addEventListener('change', () => { dirty = true; }, true);
  function snapshot(force) {
    const fields = [];
    for (const [id, n] of nodes) {
      if (!n.isConnected) { nodes.delete(id); continue; }
      if (n.nodeType === 1 && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) {
        fields.push([id, n.type === 'password' ? null : n.value, n.checked, n.selectedIndex]);
      }
    }
    const props = JSON.stringify(fields), meta = JSON.stringify([location.href, document.title]);
    const styleState=JSON.stringify(Array.from(document.styleSheets,s=>[s.href,s.disabled,s.media.mediaText]).slice(0,100));
    if (!force && !dirty && props === previousProps && meta === previousMeta && styleState===previousStyles) return null;
    dirty = false; previousProps = props; previousMeta = meta;previousStyles=styleState;
    const out = [], stack = [{n:document.body, parent:0, index:0}];
    while (stack.length) {
      const {n,parent,index} = stack.pop(); if (!n) continue;
      if (n.nodeType !== 1 && n.nodeType !== 3) continue;
      if (n.nodeType === 1 && skipped.has(n.tagName)) continue;
      if (out.length >= 20000) return {tooLarge:true};
      const id = idOf(n);
      if (n.nodeType === 3 && n.textContent.length>100000)return {tooLarge:true};
      if (n.nodeType === 3) { out.push({id,parent,index,tag:'#text',text:n.textContent}); continue; }
      const attrs = {};
      for (const a of n.attributes) { if (a.name.length < 80 && a.value.length < 12000) attrs[a.name] = a.value; }
      // Relative references must use the website's effective base, not Vibetop.
      for (const a of ['src','poster']) if (attrs[a]) { try { attrs[a] = new URL(attrs[a], document.baseURI).href; } catch (_) { delete attrs[a]; } }
      if(n.type==='password')delete attrs.value;
      const record = {id,parent,index,tag:n.tagName.toLowerCase(),attrs};
      if (n.tagName === 'IMG' && n.currentSrc) record.attrs.src = n.currentSrc;
      delete record.attrs.srcset;
      if (attrs.style) record.styleBase = document.baseURI;
      if (/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(n.tagName)) {
        record.props = {checked:!!n.checked, selected:!!n.selected, selectedIndex:n.selectedIndex};
        if (n.type !== 'password') record.props.value = n.value;
      }
      if (n.shadowRoot || /^(IFRAME|FRAME|CANVAS|VIDEO|AUDIO|OBJECT|EMBED|SVG)$/i.test(n.tagName)) {
        record.unsupported = n.shadowRoot ? 'Embedded component' : n.tagName.toLowerCase();
        record.height = Math.min(600, Math.max(44, n.getBoundingClientRect().height)); out.push(record); continue;
      }
      if (n.isContentEditable) record.unsupported = 'Rich text editing';
      out.push(record);
      const children = Array.from(n.childNodes);
      for (let i=children.length-1;i>=0;i--) stack.push({n:children[i],parent:id,index:i});
    }
    const anchor=document.elementFromPoint(20,Math.min(50,innerHeight-1));
    const scroll={anchor:anchor?idOf(anchor):0,offset:anchor?anchor.getBoundingClientRect().top:0,ratio:scrollY/Math.max(1,document.scrollingElement.scrollHeight-innerHeight),x:scrollX};
    return {nodes:out,url:location.href,title:document.title,base:document.baseURI,scroll,styleState,htmlAttrs:Object.fromEntries(Array.from(document.documentElement.attributes,a=>[a.name,a.value]))};
  }
  window[key] = {snapshot, get(id) { const n=nodes.get(id); return n && n.isConnected ? n : null; },
    scroll(id, anchor, offset, ratio, x) {
      const n=id ? nodes.get(id) : document.scrollingElement;
      if (!n) return;
      const a=nodes.get(anchor);
      const current=n===document.scrollingElement ? 0 : n.getBoundingClientRect().top;
      if (a && a.isConnected) n.scrollTop += a.getBoundingClientRect().top-current-offset;
      else n.scrollTop=Math.max(0,Math.min(1,ratio))*(n.scrollHeight-n.clientHeight);
      n.scrollLeft=Math.max(0,x||0);
    }
  };
})();
