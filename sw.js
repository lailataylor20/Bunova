/* Bunova service worker.
   What it does: keeps the app itself (one HTML file, icons, manifest) so Bunova opens instantly and works offline, and keeps
   the Russian audio clips you have already heard so they replay offline.
   What it never does: it cannot read or change your progress or settings (those live in localStorage, which a service
   worker has no access to), it never deletes anything but its own old copies of the app, and it never caches errors. */
const BUILD='1269155212';
const SHELL='bunova-shell-'+BUILD, AUDIO='bunova-audio-v1', FONTS='bunova-fonts-v1';
const AUDIO_MAX=400;
const SHELL_FILES=['/','/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon-180.png','/favicon-32.png'];

self.addEventListener('install',e=>{e.waitUntil((async()=>{
 const c=await caches.open(SHELL);
 /* the page itself must be stored; the other files are best effort, so one missing icon can never block an update */
 const r=await fetch('/',{cache:'reload'});if(!r.ok)throw new Error('page not available');
 await c.put('/',r.clone());await c.put('/index.html',r);
 await Promise.all(SHELL_FILES.slice(1).map(async u=>{try{const x=await fetch(u,{cache:'reload'});if(x.ok)await c.put(u,x);}catch(_){}}));
 self.skipWaiting();})());});

self.addEventListener('activate',e=>{e.waitUntil((async()=>{
 const keep=new Set([SHELL,AUDIO,FONTS]);
 for(const k of await caches.keys())if(k.startsWith('bunova-')&&!keep.has(k))await caches.delete(k);   /* only Bunova's own old app copies */
 if(self.registration.navigationPreload){try{await self.registration.navigationPreload.enable();}catch(_){}}
 await self.clients.claim();})());});

async function trim(name,max){const c=await caches.open(name),ks=await c.keys();for(let i=0;i<ks.length-max;i++)await c.delete(ks[i]);}

/* open the app: network first (so updates arrive), the stored copy when offline or slow */
async function page(e){
 const c=await caches.open(SHELL);
 const fresh=(async()=>{const pre=e.preloadResponse?await e.preloadResponse:null;const r=pre||await fetch(e.request);
  if(r&&r.ok&&new URL(e.request.url).pathname==='/'){c.put('/',r.clone());c.put('/index.html',r.clone());}return r;})();
 try{return await Promise.race([fresh,new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')),4000))]);}
 catch(_){fresh.catch(()=>{});return (await c.match('/'))||(await c.match('/index.html'))||fresh;}
}
/* audio: a clip never changes, so a stored one is used straight away */
async function audio(req){
 const c=await caches.open(AUDIO),hit=await c.match(req);if(hit)return hit;
 const r=await fetch(req);
 if(r.ok&&r.status===200&&/^audio\//.test(r.headers.get('content-type')||'')){c.put(req,r.clone()).then(()=>trim(AUDIO,AUDIO_MAX)).catch(()=>{});}
 return r;
}
async function swr(name,req){
 const c=await caches.open(name),hit=await c.match(req);
 const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r;}).catch(()=>null);
 return hit||(await net)||Response.error();
}

self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET'||req.headers.has('range'))return;
 const u=new URL(req.url);
 if(u.origin===location.origin){
  if(req.mode==='navigate'){e.respondWith(page(e));return;}
  if(u.pathname==='/api/tts'){e.respondWith(audio(req).catch(()=>Response.error()));return;}
  if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/.netlify/')||u.pathname==='/sw.js')return;
  e.respondWith(swr(SHELL,req));return;
 }
 if(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com'){e.respondWith(swr(FONTS,req));}
});
