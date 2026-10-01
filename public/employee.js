(() => {
  'use strict';
  let data = {attendance:[],performances:[],leaves:[],clients:[],messages:[],privateMessages:[],todayAttendance:null};
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opt={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{'Accept':'application/json',...(opt.headers||{})},signal:controller.signal,...opt});
      const ct=r.headers.get('content-type')||'';
      const d=ct.includes('application/json')?await r.json():{message:await r.text()};
      if(!r.ok) throw new Error(d.message||`Request failed (${r.status})`);
      return d;
    }catch(e){
      if(e.name==='AbortError') throw new Error('The attendance server took too long to respond. Please try again.');
      throw e;
    }finally{clearTimeout(timer)}
  }
  function note(msg,good=false){const n=$('#note');if(n)n.innerHTML=`<div class="notice ${good?'success':'danger'}">${esc(msg)}</div>`;}

  function openEmployeeImageViewer(src, alt='Profile picture'){
    if(!src) return;
    let modal=document.getElementById('employeeImageViewer');
    if(!modal){
      modal=document.createElement('div'); modal.id='employeeImageViewer'; modal.className='employee-image-viewer';
      modal.innerHTML='<div class="employee-image-viewer-backdrop"></div><div class="employee-image-viewer-dialog" role="dialog" aria-modal="true" aria-label="Expanded profile picture"><button type="button" class="employee-image-viewer-close" aria-label="Close">×</button><img class="employee-image-viewer-image" alt=""></div>';
      document.body.appendChild(modal);
      const close=()=>{modal.classList.remove('is-open');document.body.classList.remove('employee-image-viewer-open');};
      modal.querySelector('.employee-image-viewer-backdrop').addEventListener('click',close);
      modal.querySelector('.employee-image-viewer-close').addEventListener('click',close);
      modal._close=close;
    }
    modal.querySelector('.employee-image-viewer-image').src=src;
    modal.querySelector('.employee-image-viewer-image').alt=alt;
    modal.classList.add('is-open'); document.body.classList.add('employee-image-viewer-open');
  }

  function renderProfile(user){const img=$('#myProfileImage'),ph=$('#myProfilePlaceholder'),btn=$('#addProfilePhotoBtn'),noteEl=$('#profilePhotoNote');if(!img||!ph)return;if(user?.profileImageUrl){img.src=user.profileImageUrl+`?v=${Date.now()}`;img.hidden=false;img.classList.add('js-employee-image-zoom');img.style.cursor='zoom-in';ph.hidden=true;if(btn){btn.disabled=true;btn.textContent='Profile Picture Added';}if(noteEl)noteEl.textContent='Your profile picture is set. Only an administrator can update it.';}else{img.hidden=true;ph.hidden=false;if(btn){btn.disabled=false;btn.textContent='Add Profile Picture';}if(noteEl)noteEl.textContent='Add your picture once. After it is added, only an administrator can replace it.';}}
  async function compressProfileImage(file){if(!file)return file;const maxBytes=2*1024*1024;if(file.size<=maxBytes)return file;const bitmap=await createImageBitmap(file);const maxSide=1600;const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.82));if(!blob||blob.size>maxBytes)throw new Error('Please choose a smaller profile picture (maximum 2 MB after compression).');return new File([blob],'profile.jpg',{type:'image/jpeg'});} async function uploadProfilePhoto(){const input=$('#profilePhotoInput');if(!input?.files?.[0])return;const btn=$('#addProfilePhotoBtn');if(btn)btn.disabled=true;try{const file=await compressProfileImage(input.files[0]);const fd=new FormData();fd.append('photo',file);const d=await api('/api/users/me/photo',{method:'POST',body:fd,headers:{Accept:'application/json'}});data.user=d.user;renderProfile(d.user);note(d.message,true);}catch(e){note(e.message);if(btn)btn.disabled=false;}finally{input.value='';}}
  function renderAttendance(){
    const rows=$('#attendance'); if(!rows)return;
    const counted=(data.attendance||[]).filter(a=>['present','late','half-day','absent'].includes(a.status));
    const attended=counted.reduce((sum,a)=>sum+(['present','late'].includes(a.status)?1:(a.status==='half-day'?0.5:0)),0);
    const pctEl=$('#attendancePct'); if(pctEl)pctEl.textContent=counted.length?((attended/counted.length)*100).toFixed(1)+'%':'—';
    rows.innerHTML=(data.attendance||[]).map(a=>{
      const sessions=Array.isArray(a.sessions)?a.sessions:[];
      const sessionText=sessions.length?sessions.map((x,i)=>`Session ${i+1}: ${new Date(x.checkIn).toLocaleTimeString()} – ${x.checkOut?new Date(x.checkOut).toLocaleTimeString():'Active'} (${esc(duration(x.durationSeconds))})`).join('<br>'):'—';
      return `<tr><td>${esc(a.date)}</td><td>${esc(a.status)}</td><td>${sessionText}</td><td><strong>${esc(a.totalWorkingDuration||a.workingDuration||'0h 00m')}</strong>${a.status==='half-day'?`<br><small>Credited: ${esc(a.creditedWorkingDuration||'0h 00m')}</small>`:''}${a.overtimeSeconds>0?`<br><small>OT: ${esc(a.overtime||'0h 00m')}</small>`:''}</td></tr>`;
    }).join('')||'<tr><td colspan="4">No attendance yet.</td></tr>';
  }
  function duration(sec){const t=Math.max(0,Math.floor(Number(sec)||0)),h=Math.floor(t/3600),m=Math.floor((t%3600)/60);return `${h}h ${String(m).padStart(2,'0')}m`;}
  function updateAttendanceButtons(){
    const a=data.todayAttendance,inBtn=$('#checkInBtn'),outBtn=$('#checkOutBtn'),status=$('#todayAttendanceStatus');
    const sessions=Array.isArray(a?.sessions)?a.sessions:[]; const open=sessions.find(x=>!x.checkOut);
    if(status){ if(!a)status.textContent='Not checked in today'; else if(open)status.textContent=`Checked in at ${new Date(open.checkIn).toLocaleTimeString()} (active session ${sessions.findIndex(x=>x===open)+1})`; else if(sessions.length)status.textContent=`${a.status==='half-day'?'Half-day attendance. ':''}Checked out. ${sessions.length} session${sessions.length===1?'':'s'} completed.`; else status.textContent=`Today: ${a.status}`; }
    if(inBtn) inBtn.disabled=!!open || a?.status==='leave' || a?.status==='absent';
    if(outBtn) outBtn.disabled=!open;
  }
  async function loadToday(){
    try{
      const d=await api('/api/workspace/employee/today-attendance');
      data.todayAttendance=d.attendance||null; updateAttendanceButtons(); return true;
    }catch(e){
      const status=$('#todayAttendanceStatus'); if(status)status.textContent='Attendance status unavailable';
      note(e.message); return false;
    }
  }
  async function loadDashboard(){
    try{
      const d=await api('/api/workspace/employee/dashboard'); data={...data,...d};
      if($('#welcome'))$('#welcome').innerHTML=`<span class="welcome-person">${d.user?.profileImageUrl?`<img class="welcome-avatar" src="${esc(d.user.profileImageUrl)}?v=${Date.now()}" alt="">`:'<span class="welcome-avatar placeholder">👤</span>'}<span>Welcome, ${esc(d.user?.name||'Employee')}</span></span>`; renderProfile(d.user);
      if($('#workSchedule')){const sch=d.schedule||{enabled:true,checkInTime:'09:00',graceMinutes:10,checkOutTime:'18:00'};$('#workSchedule').textContent=sch.enabled===false?'No fixed attendance time: you may Check In and Check Out anytime. Multiple sessions follow your assigned daily session limit.':`Your schedule: first check-in opens at ${sch.checkInTime} IST · ${sch.graceMinutes} min grace · Check out anytime after check-in (employee controlled).`;}
      if($('#present'))$('#present').textContent=(d.attendance||[]).length;
      if($('#score'))$('#score').textContent=d.performances?.[0]?d.performances[0].overallScore+'/100':'—';
      if($('#leaveCount'))$('#leaveCount').textContent=(d.leaves||[]).length;
      if($('#clientCount'))$('#clientCount').textContent=(d.clients||[]).length;
      if($('#todayLoginDuration'))$('#todayLoginDuration').textContent=d.todayWorkingDuration||'0h 00m';
      renderAttendance(); updateAttendanceButtons();
      if($('#performance'))$('#performance').innerHTML=(d.performances||[]).map(p=>`<div class="card"><b>${esc(p.overallScore)}/100</b><p>Attendance ${esc(p.attendanceScore)} · Quality ${esc(p.workQuality)} · Punctuality ${esc(p.punctuality)} · Client handling ${esc(p.clientHandling)}</p><small>${esc(p.remarks||'No remarks')}</small></div>`).join('')||'<p class="muted">No performance review yet.</p>';
      if($('#clients'))$('#clients').innerHTML=(d.clients||[]).map(c=>`<tr><td>${esc(c.companyName)}</td><td>${esc(c.service)}</td><td>${esc(c.contactPerson)}<br>${esc(c.phone||c.email||'')}</td></tr>`).join('')||'<tr><td colspan="3">No assigned clients.</td></tr>';
      if($('#leaves'))$('#leaves').innerHTML=(d.leaves||[]).map(l=>`<div class="card" style="margin-bottom:8px"><b>${l.type==='emergency'?'Emergency':'Advance'} Leave</b> <span class="badge">${esc(l.status)}</span><p>${new Date(l.fromDate).toLocaleDateString()} – ${new Date(l.toDate).toLocaleDateString()}</p><small>${esc(l.reason)}</small></div>`).join('')||'<p class="muted">No leave requests.</p>';
      renderMessages('#privateMessages',d.privateMessages);renderMessages('#publicMessages',d.messages);
      return true;
    }catch(e){note('Employee data could not be loaded: '+e.message);return false;}
  }
  function renderMessages(sel,arr){const el=$(sel);if(!el)return;el.innerHTML=(arr||[]).slice().reverse().map(m=>`<div class="msg"><b>${esc(m.sender?.name||'Admin')}</b><br><p>${esc(m.body)}</p><small>${m.createdAt?new Date(m.createdAt).toLocaleString():''}</small></div>`).join('')||'<p class="muted">No messages yet.</p>';}
  let localPublicIpCache = null;
  async function getLocalPublicIp(){
    if(localPublicIpCache) return localPublicIpCache;
    try{
      const r=await fetch('https://api.ipify.org?format=json',{cache:'no-store'});
      if(!r.ok) throw new Error('Public IP lookup failed');
      const d=await r.json();
      const ip=String(d.ip||'').trim();
      if(ip) localPublicIpCache=ip;
    }catch(_e){}
    return localPublicIpCache || '';
  }
  async function checkIn(){
    const b=$('#checkInBtn'); if(b)b.disabled=true;
    note('Checking office network and recording check-in…');
    try{
      const publicIp=await getLocalPublicIp();
      const headers=publicIp?{'X-Local-Public-IP':publicIp}:{};
      const r=await api('/api/workspace/employee/check-in',{method:'POST',headers});
      data.todayAttendance=r.attendance||null;note(r.message||'Check-in recorded successfully.',true);await Promise.all([loadToday(),loadDashboard()]);
    }
    catch(e){note(e.message);await loadToday();}
  }
  async function checkOut(){
    const b=$('#checkOutBtn'); if(b)b.disabled=true;
    note('Checking office network and recording check-out…');
    try{
      const publicIp=await getLocalPublicIp();
      const headers=publicIp?{'X-Local-Public-IP':publicIp}:{};
      const r=await api('/api/workspace/employee/check-out',{method:'POST',headers});
      data.todayAttendance=r.attendance||null;
      note(r.message||'Check-out recorded successfully.',true);
      await Promise.all([loadToday(),loadDashboard()]);
    }catch(e){note(e.message);await loadToday();}
  }
  async function send(form,channel){const body=new FormData(form).get('body');try{await api('/api/workspace/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,channel})});form.reset();note('Message sent.',true);await loadDashboard()}catch(e){note(e.message)}}
  function init(){
    $('#myProfileImage')?.addEventListener('click',()=>{const img=$('#myProfileImage');if(img&&!img.hidden)openEmployeeImageViewer(img.currentSrc||img.src,'My profile picture');});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const m=$('#employeeImageViewer');if(m?.classList.contains('is-open'))m._close?.();}});
    $('#checkInBtn')?.addEventListener('click',checkIn);$('#checkOutBtn')?.addEventListener('click',checkOut);$('#addProfilePhotoBtn')?.addEventListener('click',()=>$('#profilePhotoInput')?.click());$('#profilePhotoInput')?.addEventListener('change',uploadProfilePhoto);
    $('#leaveForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/workspace/employee/leave',{method:'POST',body:new FormData(e.target)});note('Leave request submitted.',true);e.target.reset();await loadDashboard()}catch(x){note(x.message)}});
    $('#privateForm')?.addEventListener('submit',e=>{e.preventDefault();send(e.target,'private')});
    $('#publicForm')?.addEventListener('submit',e=>{e.preventDefault();send(e.target,'public')});

    // Employee portal navigation: every button is functional and scrolls to its real section.
    // Keep the active state synchronized with the section currently in view.
    const navButtons=[...document.querySelectorAll('.portal-nav-btn[data-scroll-target]')];
    const navSections=navButtons.map(btn=>document.getElementById(btn.dataset.scrollTarget)).filter(Boolean);
    const setActiveNav=(id)=>navButtons.forEach(btn=>btn.classList.toggle('active',btn.dataset.scrollTarget===id));
    navButtons.forEach(btn=>btn.addEventListener('click',()=>{
      const target=document.getElementById(btn.dataset.scrollTarget);
      if(!target)return;
      setActiveNav(target.id);
      target.scrollIntoView({behavior:'smooth',block:'start'});
    }));
    if('IntersectionObserver' in window && navSections.length){
      const observer=new IntersectionObserver(entries=>{
        const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if(visible) setActiveNav(visible.target.id);
      },{rootMargin:'-120px 0px -55% 0px',threshold:[0.05,0.25,0.5]});
      navSections.forEach(section=>observer.observe(section));
    }
    $('#logout')?.addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'})}finally{location.href=(data.user?.employeeType==='intern'?'/intern-login':'/employee-login')}});
    loadToday();loadDashboard();
    // Non-disruptive attendance polling: refresh only the small attendance state.
    // Rebuilding the whole dashboard every 30s caused visible flicker/scroll jumps
    // and could interrupt forms/messages while an employee was working.
    setInterval(()=>{
      const active=document.activeElement;
      const editing=active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      if(!document.hidden && !editing) loadToday();
    },30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
