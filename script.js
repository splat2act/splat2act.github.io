/* Splat2Act: self-contained, dependency-free interactions. */
'use strict';
document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const saveData = Boolean(navigator.connection?.saveData);
const header = document.querySelector('.site-header');
const progress = document.querySelector('.reading-progress');
const navLinks = [...document.querySelectorAll('.desktop-nav a')];
const navSections = navLinks.map(link => document.querySelector(link.getAttribute('href')));
const revealObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  }
}, {threshold: 0.08, rootMargin: '0px 0px -25px 0px'});
document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));

let scrollPending = false;
function updateScroll() {
  const total = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${total > 0 ? Math.min(1, window.scrollY / total) : 0})`;
  header.classList.toggle('scrolled', window.scrollY > 25);
  updateNavigation();
  scrollPending = false;
}
window.addEventListener('scroll', () => {
  if (!scrollPending) {scrollPending = true; requestAnimationFrame(updateScroll);}
}, {passive: true});
window.addEventListener('resize', updateScroll, {passive: true});
updateScroll();

const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
function closeMenu() {mobileNav.hidden = true; menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Open navigation');}
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  mobileNav.hidden = !open;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {if (event.key === 'Escape') closeMenu();});
window.matchMedia('(min-width: 601px)').addEventListener('change', event => {if (event.matches) closeMenu();});

function updateNavigation() {
  const position = window.scrollY + window.innerHeight * 0.35;
  let current = '';
  for (const section of navSections) if (section.offsetTop <= position) current = section.id;
  navLinks.forEach(link => {const active = link.hash === `#${current}`; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');});
}
const sectionObserver = new IntersectionObserver(updateNavigation, {rootMargin: '-10% 0px -50% 0px', threshold: 0});
navSections.forEach(section => sectionObserver.observe(section));

/* Load only approaching media, and play only media actually on screen. */
const videos = [...document.querySelectorAll('video')];
const videoVisibility = new Map();
function loadVideo(video) {
  if (video.dataset.loaded) return;
  for (const source of video.querySelectorAll('source[data-src]')) {source.src = source.dataset.src; delete source.dataset.src;}
  video.dataset.loaded = 'true';
  video.load();
}
function videoIsVisible(video) {return Boolean(videoVisibility.get(video) && video.getClientRects().length && !document.hidden && !document.body.classList.contains('dialog-open'));}
function attemptPlay(video, userInitiated = false) {
  if (!userInitiated && (reducedMotion.matches || saveData || video.dataset.userPaused || !videoIsVisible(video))) return;
  loadVideo(video);
  const result = video.play();
  if (result?.catch) result.catch(() => updateVideoButton(video));
}
function updateVideoButton(video) {
  const button = video.closest('[data-video-frame], .object-stage')?.querySelector('.video-toggle');
  if (!button) return;
  if (!button.dataset.description) button.dataset.description = button.getAttribute('aria-label').replace(/^(Play|Pause) /, '');
  button.setAttribute('aria-label', `${video.paused ? 'Play' : 'Pause'} ${button.dataset.description}`);
  button.setAttribute('aria-pressed', String(!video.paused));
  button.querySelector('use').setAttribute('href', video.paused ? '#icon-play' : '#icon-pause');
}
const videoLoadObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting && !saveData) {loadVideo(entry.target); videoLoadObserver.unobserve(entry.target);}
}, {rootMargin: '150px', threshold: 0});
const videoPlayObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    videoVisibility.set(entry.target, entry.isIntersecting);
    if (entry.isIntersecting) attemptPlay(entry.target); else entry.target.pause();
  }
}, {threshold: 0.18});
for (const video of videos) {
  videoLoadObserver.observe(video); videoPlayObserver.observe(video);
  video.addEventListener('play', () => updateVideoButton(video));
  video.addEventListener('pause', () => updateVideoButton(video));
  video.addEventListener('timeupdate', () => {
    const bar = video.closest('[data-video-frame]')?.querySelector('.video-progress');
    if (bar && Number.isFinite(video.duration) && video.duration > 0) bar.style.transform = `scaleX(${video.currentTime / video.duration})`;
  });
  const button = video.closest('[data-video-frame], .object-stage')?.querySelector('.video-toggle');
  button?.addEventListener('click', () => {
    if (video.paused) {delete video.dataset.userPaused; attemptPlay(video, true);} else {video.dataset.userPaused = 'true'; video.pause();}
  });
}
document.addEventListener('visibilitychange', () => videos.forEach(video => {if (document.hidden) video.pause(); else attemptPlay(video);}));
reducedMotion.addEventListener('change', () => videos.forEach(video => {if (reducedMotion.matches) video.pause(); else attemptPlay(video);}));

document.querySelectorAll('[data-object-view]').forEach(button => button.addEventListener('click', () => {
  const photos = button.dataset.objectView === 'photo';
  document.querySelectorAll('[data-object-view]').forEach(item => {const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected));});
  document.querySelectorAll('.object-item').forEach(item => {
    item.querySelector('.object-photo').hidden = !photos;
    const video = item.querySelector('.object-model');
    video.hidden = photos;
    item.querySelector('.object-play').hidden = photos;
    if (photos) video.pause(); else attemptPlay(video);
  });
}));

/* One accessible viewer for the original figures and fullscreen fallbacks. */
const dialog = document.querySelector('#media-dialog');
const dialogContent = document.querySelector('#dialog-content');
let previouslyPlaying = [];
function openViewer(content, caption) {
  previouslyPlaying = videos.filter(video => !video.paused);
  previouslyPlaying.forEach(video => video.pause());
  dialogContent.replaceChildren(content);
  document.querySelector('#dialog-caption').textContent = caption;
  document.body.classList.add('dialog-open');
  dialog.showModal();
  document.querySelector('#close-dialog').focus();
}
document.querySelectorAll('[data-figure]').forEach(button => button.addEventListener('click', () => {
  const img = document.createElement('img'); img.src = button.dataset.figure; img.alt = button.dataset.caption;
  openViewer(img, button.dataset.caption);
}));
document.querySelectorAll('.video-expand').forEach(button => button.addEventListener('click', async () => {
  const frame = button.closest('[data-video-frame]'); const video = frame.querySelector('video');
  if (frame.requestFullscreen) {try {await frame.requestFullscreen(); return;} catch { /* Native fullscreen may be unavailable in an embedded preview. */ }}
  loadVideo(video);
  const expandedVideo = document.createElement('video');
  expandedVideo.src = video.querySelector('source').src;
  expandedVideo.controls = true; expandedVideo.muted = true; expandedVideo.playsInline = true; expandedVideo.loop = true;
  expandedVideo.addEventListener('loadedmetadata', () => {expandedVideo.currentTime = video.currentTime; expandedVideo.play().catch(() => {});}, {once: true});
  openViewer(expandedVideo, video.getAttribute('aria-label'));
}));
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {if (event.target === dialog) {const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();}});
dialog.addEventListener('close', () => {
  dialogContent.querySelector('video')?.pause(); dialogContent.replaceChildren(); document.body.classList.remove('dialog-open');
  previouslyPlaying.forEach(video => attemptPlay(video)); previouslyPlaying = [];
});

/* Exact percentages from the paper. The visual bars have a 0–100% scale. */
const color = {broad: '#abc4dc', personal: '#9391c3', sim: '#a2bed8', real: '#8989ba', other: '#c7d6e5', office: '#9391c3', multi: '#acc7da', base: '#d2d8e4'};
let currentStudy = 'adaptation';
const sceneSelect = document.querySelector('#scene-select');
const studyTabs = [...document.querySelectorAll('[data-study]')];
function row(label, value, tint, group = '') {return {label, value, tint, group};}
function getStudy(study, scene) {
  const office = scene === 'office';
  const name = office ? 'Office' : 'Conference';
  const count = office ? '40 configurations · 21 easy + 19 hard' : '35 configurations · 18 easy + 17 hard';
  if (study === 'adaptation') {
    const values = office ? [0,45,40,62.5,37.5,47.5] : [0,42.9,17.1,37.1,40,51.4];
    return {title:`Pickup success in ${name}`, subtitle:count, number:office?'+17.5':'+8.6', unit:'pp', index:'01',
      heading:office?'A better starting point for personalization.':'Diverse scenes support transfer.',
      copy:office?'On Office, broad adaptation in the deployment scene followed by personalization reaches 62.5% success — 17.5 percentage points above direct personalization from the pretrained model.':'On Conference, Multi1k followed by scene personalization reaches 51.4% success — 8.6 percentage points above direct personalization. The best broad adaptation source differs by scene.',
      caveat:'Broad adaptation does not uniformly help: Office1k + Conference personalization scores below direct personalization.',
      legend:[['Before personalization',color.broad],['Personalized',color.personal]],
      note:'Stage 1 uses 1,024 broad demonstrations. Stage 2 uses 504 Office or 500 Conference demonstrations. Success is pooled over easy and hard tasks.',
      rows:[row('Pretrained π₀.₅',values[0],color.base),row('Direct personalization',values[1],color.personal),row('Office1k · Stage 1',values[2],color.broad),row('Office1k + personal.',values[3],color.personal),row('Multi1k · Stage 1',values[4],color.broad),row('Multi1k + personal.',values[5],color.personal)]};
  }
  if (study === 'scene') {
    const vals = office ? [[45,22.5],[62.5,15],[47.5,25]] : [[42.9,14.3],[37.1,17.1],[51.4,37.1]];
    const groups = ['Direct personalization','Office1k ancestry','Multi1k ancestry'];
    return {title:`Scene alignment in ${name}`,subtitle:count,number:office?'+47.5':'+28.6',unit:'pp',index:'02',
      heading:'The deployment scene is part of the task.',
      copy:office?'With Office1k ancestry, personalizing to Office yields 62.5% success on Office; personalizing to Conference yields 15.0%. Familiar objects alone do not replace scene alignment.':'For direct personalization, matching Conference yields 42.9% success; personalizing to Office yields 14.3%. Matching the deployment scene improves performance for all three ancestries.',
      caveat:'Scene-matched policies win in all six comparisons. This comparison changes scene appearance, support geometry, and configuration coverage together.',
      legend:[['Matched scene',color.personal],['Other scene',color.other]],
      note:'All bars show Stage 2 policies. The same target identities are used in both scenes; evaluation configurations are disjoint from training.',
      rows:vals.flatMap((v,i)=>[row('Matched scene',v[0],color.personal,groups[i]),row('Other scene',v[1],color.other,groups[i])])};
  }
  if (study === 'transfer') return {title:'From simulation to the real robot',subtitle:'Office · the same 12-task subset',number:'2.8',unit:'pp gap',index:'03',
    heading:'Simulation-trained behavior transfers.',
    copy:'The Office1k-based personalized policy reaches 66.7% in simulation and 63.9% on Stretch 3. The Multi1k-based policy reaches 50.0% and 58.3%, respectively.',
    caveat:'Two personalized policies are evaluated. Each has 12 simulated episodes and 36 real attempts, with three attempts per real task.',
    legend:[['Simulation',color.sim],['Real robot',color.real]],
    note:'Each policy is evaluated on the same object–receptacle–difficulty cells. Real-world success requires target pickup and policy termination.',
    rows:[row('Simulation',66.7,color.sim,'Office1k + Office personalization'),row('Real robot',63.9,color.real,'Office1k + Office personalization'),row('Simulation',50,color.sim,'Multi1k + Office personalization'),row('Real robot',58.3,color.real,'Multi1k + Office personalization')]};
  return {title:'Transfer to unseen lab tables',subtitle:'18 real attempts per policy, per table',number:'22–33',unit:'%',index:'04',
    heading:'A new scene is still a real challenge.',
    copy:'Office-personalized policies drop substantially on unseen black and yellow tables. Their ordering reverses between the two receptacles, so neither broad adaptation source is a consistent winner.',
    caveat:'The same three targets are tested in easy and hard conditions, with three attempts per configuration. These results support deployment-specific personalization.',
    legend:[['Office1k ancestry',color.office],['Multi1k ancestry',color.multi]],
    note:'Both policies receive Stage 2 personalization in Office. The black table is closer to Office in height and appearance; the yellow table has a larger shift.',
    rows:[row('Office1k + personal.',33.3,color.office,'Black table'),row('Multi1k + personal.',22.2,color.multi,'Black table'),row('Office1k + personal.',22.2,color.office,'Yellow table'),row('Multi1k + personal.',27.8,color.multi,'Yellow table')]};
}
function renderStudy() {
  const data = getStudy(currentStudy, sceneSelect.value);
  document.querySelector('#chart-title').textContent = data.title;
  document.querySelector('#chart-subtitle').textContent = data.subtitle;
  document.querySelector('#scene-select-label').hidden = ['transfer','unseen'].includes(currentStudy);
  document.querySelector('#chart-note').textContent = data.note;
  document.querySelector('#finding-index').textContent = `FINDING ${data.index}`;
  const number = document.querySelector('#finding-number'); number.replaceChildren(document.createTextNode(data.number));
  const unit = document.createElement('span'); unit.textContent = data.unit; number.append(unit);
  document.querySelector('#finding-title').textContent = data.heading;
  document.querySelector('#finding-copy').textContent = data.copy;
  document.querySelector('#finding-caveat').textContent = data.caveat;
  const legend = document.querySelector('#chart-legend'); legend.replaceChildren();
  for (const [label,tint] of data.legend) {const span=document.createElement('span');const dot=document.createElement('i');dot.style.setProperty('--bar-color',tint);span.append(dot,document.createTextNode(label));legend.append(span);}
  const chart = document.querySelector('#result-chart'); chart.replaceChildren();
  let lastGroup = '';
  for (const [index,item] of data.rows.entries()) {
    if (item.group && item.group !== lastGroup) {const group=document.createElement('p');group.className='chart-group-label';group.textContent=item.group;group.setAttribute('aria-hidden','true');chart.append(group);lastGroup=item.group;}
    const element = document.createElement('div'); element.className='chart-row'; element.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.className='chart-row-label';label.textContent=item.label;
    const track = document.createElement('div');track.className='chart-track';track.style.setProperty('--value',String(item.value));track.style.setProperty('--bar-color',item.tint);track.style.setProperty('--row-index',String(index));
    const bar = document.createElement('div');bar.className='chart-bar';const value=document.createElement('span');value.className='chart-value';value.textContent=`${item.value.toFixed(1)}%`;track.append(bar,value);element.append(label,track);chart.append(element);
  }
  const axis = document.createElement('div');axis.className='chart-axis';axis.setAttribute('aria-hidden','true');axis.append(document.createElement('span'));const ticks=document.createElement('div');ticks.className='chart-axis-labels';
  for (const n of [0,25,50,75,100]) {const tick=document.createElement('span');tick.textContent=String(n);ticks.append(tick);}axis.append(ticks);chart.append(axis);
  const axisTitle = document.createElement('p');axisTitle.className='chart-axis-title';axisTitle.textContent='Pickup success (%)';axisTitle.setAttribute('aria-hidden','true');chart.append(axisTitle);
  const table = document.createElement('table');table.className='sr-only';const caption=document.createElement('caption');caption.textContent=`${data.title}. ${data.subtitle}`;table.append(caption);const tableHead=document.createElement('thead');const headerRow=document.createElement('tr');for (const text of ['Condition','Pickup success']) {const th=document.createElement('th');th.scope='col';th.textContent=text;headerRow.append(th);}tableHead.append(headerRow);table.append(tableHead);const tbody=document.createElement('tbody');
  for (const item of data.rows) {const tr=document.createElement('tr');const th=document.createElement('th');th.scope='row';th.textContent=(item.group?`${item.group}: `:'')+item.label;const td=document.createElement('td');td.textContent=`${item.value.toFixed(1)}%`;tr.append(th,td);tbody.append(tr);}table.append(tbody);chart.append(table);
}
function selectStudy(tab, moveFocus = false) {
  currentStudy=tab.dataset.study;
  studyTabs.forEach(item=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;});
  document.querySelector('#result-panel').setAttribute('aria-labelledby',tab.id);
  renderStudy(); if(moveFocus) tab.focus();
}
studyTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectStudy(tab));
  tab.addEventListener('keydown',event=>{
    let next;if(event.key==='ArrowRight')next=(index+1)%studyTabs.length;if(event.key==='ArrowLeft')next=(index-1+studyTabs.length)%studyTabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=studyTabs.length-1;
    if(next!==undefined){event.preventDefault();selectStudy(studyTabs[next],true);}
  });
});
sceneSelect.addEventListener('change',renderStudy);
renderStudy();

/* Clipboard has a selection fallback for file:// and older browsers. */
const copyButton = document.querySelector('#copy-citation');
copyButton.addEventListener('click',async()=>{
  const text=document.querySelector('#bibtex').textContent.trim();let success=false;
  try {if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(text);success=true;}} catch { /* Use local fallback below. */ }
  if(!success){const textarea=document.createElement('textarea');textarea.value=text;textarea.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(textarea);textarea.select();try{success=document.execCommand('copy');}catch{}textarea.remove();copyButton.focus();}
  if(success){copyButton.querySelector('use').setAttribute('href','#icon-check');copyButton.querySelector('span').textContent='Copied';document.querySelector('#copy-status').textContent='Citation copied to clipboard.';setTimeout(()=>{copyButton.querySelector('use').setAttribute('href','#icon-copy');copyButton.querySelector('span').textContent='Copy citation';},2400);}
  else {const range=document.createRange();range.selectNodeContents(document.querySelector('#bibtex'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('#copy-status').textContent='Citation selected. Use your browser’s copy command.';}
});

/* A sparse Gaussian field quietly echoes the method, away from the title. */
const canvas=document.querySelector('#splat-field');const context=canvas.getContext('2d');let fieldFrame=0;let heroVisible=true;let points=[];let fieldWidth=0;let fieldHeight=0;
let randomSeed=27;function random(){randomSeed=(randomSeed*16807)%2147483647;return(randomSeed-1)/2147483646;}
function resizeField(){const ratio=Math.min(window.devicePixelRatio||1,1.5);fieldWidth=canvas.clientWidth;fieldHeight=canvas.clientHeight;canvas.width=fieldWidth*ratio;canvas.height=fieldHeight*ratio;context.setTransform(ratio,0,0,ratio,0,0);randomSeed=27;points=Array.from({length:118},(_,index)=>{const side=index<59?0:1;const a=random()*Math.PI*2;const r=Math.sqrt(random());return{x:(side?fieldWidth*.89:fieldWidth*.11)+Math.cos(a)*r*fieldWidth*.1,y:175+Math.sin(a)*r*130,radius:random()*2.5+.5,phase:random()*6.28,side,alpha:random()*.15+.035};});}
function drawField(time){context.clearRect(0,0,fieldWidth,fieldHeight);for(const point of points){const drift=Math.sin(time*.0003+point.phase)*5;context.beginPath();context.ellipse(point.x+drift,point.y+Math.cos(time*.0002+point.phase)*4,point.radius*1.7,point.radius,-.5,0,Math.PI*2);context.fillStyle=point.side?`rgba(135,125,181,${point.alpha})`:`rgba(100,153,185,${point.alpha})`;context.fill();}if(heroVisible&&!document.hidden&&!reducedMotion.matches)fieldFrame=requestAnimationFrame(drawField);else fieldFrame=0;}
function startField(){if(!fieldFrame&&!reducedMotion.matches&&!document.hidden&&heroVisible)fieldFrame=requestAnimationFrame(drawField);}
resizeField();window.addEventListener('resize',()=>{resizeField();startField();},{passive:true});
new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;startField();},{threshold:0}).observe(document.querySelector('.hero'));
document.addEventListener('visibilitychange',startField);reducedMotion.addEventListener('change',startField);startField();
