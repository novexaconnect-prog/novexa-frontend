(() => {
  const $=id=>document.getElementById(id); let user=null; let exams=[]; let tasks=[]; let events=[]; let flashcards=[]; let flashcardReviews=[];
  const modal=$('dashboardModal'), modalContent=$('modalContent');
  let pet={name:'Nova',emoji:'🦊'};
  function openModal(html){modalContent.innerHTML=html;modal.hidden=false} function closeModal(){modal.hidden=true}
  document.querySelectorAll('[data-close-modal]').forEach(x=>x.onclick=closeModal);
  function name(){const m=user?.user_metadata||{};return m.full_name||m.name||user?.email?.split('@')[0]||'Student'}
  const educationalQuotes = [
    ['Okay, lock in. One focused session can change the whole vibe of your revision.', 'Tiny W today. Future-you gets the marks.'],
    ['No cap: understanding the method beats memorising one random answer.', 'Ask me to explain the why, then cook the question yourself.'],
    ['You do not need a perfect study day. You need one real win.', 'Pick one topic, finish one task, keep the streak alive.'],
    ['Active recall is the cheat code: close the notes and see what your brain actually knows.', 'If you cannot retrieve it, that is your next revision target.'],
    ['Past papers are not scary. They are basically the map showing you where the marks are.', 'Attempt → mark → fix → run it back.'],
    ['If a question cooked you yesterday, run it again today. That is literally progress.', 'Mistakes are data. Use them.'],
    ['Main-character study arc: less rereading, more doing.', 'One worked example, one recall check, one exam question.'],
    ['Your brain is not behind. It is training. Keep stacking reps.', 'Consistency is low-key the biggest academic flex.'],
    ['Do not wait for motivation. Start for ten minutes and let momentum handle the rest.', 'Ten focused minutes > zero perfect minutes.'],
    ['You are allowed to find a topic hard. You are not allowed to leave it mysterious.', 'Ask your AI study buddy and break it down step by step.']
  ];
  async function loadPetIdentity(){
    try{
      const result=await window.supabaseClient.from('pets').select('pet_type,pet_name').eq('user_id',user.id).maybeSingle();
      const emoji={fox:'🦊',cat:'🐱',panda:'🐼',owl:'🦉',dog:'🐶',rabbit:'🐰',tiger:'🐯',lion:'🦁',koala:'🐨',penguin:'🐧'};
      if(result.data) pet={name:String(result.data.pet_name||'Nova').trim().slice(0,24)||'Nova',emoji:emoji[result.data.pet_type]||'🦊'};
    }catch(error){console.warn('Dashboard pet identity:',error.message)}
    const avatar=$('dashboardPetAvatar'), nameEl=$('dashboardPetName'), narrator=$('dashboardPetNarrator');
    if(avatar) avatar.textContent=pet.emoji;
    if(nameEl) nameEl.textContent=pet.name;
    if(narrator) narrator.textContent=`${pet.name} · Your personal AI study buddy`;
  }
  function renderDailyQuote(){
    const quote=$('dailyQuote'), source=$('dailyQuoteSource');
    if(!quote||!source)return;
    const localDate=new Date(); localDate.setHours(0,0,0,0); const day=Math.floor(localDate.getTime()/86400000);
    const [text,caption]=educationalQuotes[Math.abs(day)%educationalQuotes.length];
    quote.textContent=`“${text}”`;
    source.textContent=`${pet.name} says · ${caption} 🐾`;
  }
  // Tasks and exams are calendar commitments, not UTC instants. Keep the
  // YYYY-MM-DD portion exactly as supplied by the database/form and never
  // round-trip it through Date#toISOString(), which can shift a day.
  function calendarDateKey(value){const match=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);return match?`${match[1]}-${match[2]}-${match[3]}`:''}
  function parseDateOnly(value){const match=calendarDateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));d.setHours(0,0,0,0);return d}
  function fmtDate(d){const parsed=parseDateOnly(d);return parsed?new Intl.DateTimeFormat('en-US',{weekday:'short',day:'numeric',month:'short'}).format(parsed):'—'}
  function localDateKey(date=new Date()){
    const d=new Date(date);
    d.setHours(0,0,0,0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dateDiffDays(dateKey){
    const target=parseDateOnly(dateKey);
    if(!target)return NaN;
    const today=parseDateOnly(localDateKey());
    return Math.round((target.getTime()-today.getTime())/86400000);
  }
  function taskTimeKey(value){const match=String(value||'').trim().match(/^([01]\d|2[0-3]):([0-5]\d)/);return match?`${match[1]}:${match[2]}`:''}
  function fmtTaskTime(value){const key=taskTimeKey(value);if(!key)return '';const [hour,minute]=key.split(':').map(Number);const suffix=hour>=12?'PM':'AM';const display=hour%12||12;return `${display}:${String(minute).padStart(2,'0')} ${suffix}`}
  function compareTodayTasks(a,b){const aTime=taskTimeKey(a.scheduled_time),bTime=taskTimeKey(b.scheduled_time);if(aTime&&bTime)return aTime.localeCompare(bTime)||String(a.created_at||'').localeCompare(String(b.created_at||''));if(aTime)return -1;if(bTime)return 1;return String(a.created_at||'').localeCompare(String(b.created_at||''))}
  function setFormError(form,message){
    let box=form.querySelector('.dashboard-form-error');
    if(!box){box=document.createElement('div');box.className='dashboard-form-error';form.prepend(box);}
    box.textContent=message; box.hidden=!message;
  }
  function renderTasks(){
    const list=$('planList');
    const today=localDateKey();
    const todays=tasks.filter(t=>calendarDateKey(t.due_date)===today).sort(compareTodayTasks).slice(0,5);
    list.innerHTML=todays.length?todays.map(t=>`
      <div class="plan-row ${t.completed?'completed':''}" data-task="${t.id}">
        <span class="${t.completed?'check-circle':'empty-circle'}">${t.completed?'✓':''}</span>
        <div class="plan-info">
          <strong>${escapeHtml(t.title)}</strong>
          <small>${escapeHtml(t.subject||'Study task')}${fmtTaskTime(t.scheduled_time)?` · ${fmtTaskTime(t.scheduled_time)}`:''}</small>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="plan-status"><b>${t.completed?'Completed':'Pending'}</b><small>${t.due_date?fmtDate(t.due_date):'Today'}</small></span>
          <button class="icon-button delete-task" data-delete-task="${t.id}" title="Delete task" style="color:#ef4444;background:transparent;border:0;cursor:pointer;padding:4px"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
        </div>
      </div>`).join(''):'<div class="dashboard-empty">No tasks for today. <button id="inlineAddTask">Add a study task →</button></div>';
    
    list.querySelectorAll('[data-task]').forEach(r=>r.onclick=(e)=>{
      if(e.target.closest('.delete-task')) return;
      const t=tasks.find(x=>x.id===r.dataset.task);
      if(!t)return;
      window.supabaseClient.from('planner_tasks').update({completed:!t.completed}).eq('id',t.id).select().single().then(({data,error})=>{
        if(!error){tasks=tasks.map(x=>x.id===t.id?data:x);render();}
      });
    });

    list.querySelectorAll('[data-delete-task]').forEach(b=>b.onclick=async(e)=>{
      e.stopPropagation();
      const id=b.dataset.deleteTask;
      if(!confirm('Delete this task?')) return;
      const {error}=await window.supabaseClient.from('planner_tasks').delete().eq('id',id);
      if(!error){tasks=tasks.filter(x=>x.id!==id);render();}
    });
    
    $('inlineAddTask')?.addEventListener('click',addTask);
    if(window.lucide) window.lucide.createIcons();
  }
  function renderExams(){
    const list=$('examList');
      const upcoming=exams.filter(e=>dateDiffDays(e.exam_date)>=0).sort((a,b)=>calendarDateKey(a.exam_date).localeCompare(calendarDateKey(b.exam_date))).slice(0,4);
    $('examCount').textContent=upcoming.length;
    list.innerHTML=upcoming.length?upcoming.map((e,i)=>`
      <div class="exam-row">
        <span class="exam-date ${i%3===1?'orange':i%3===2?'':'blue'}">
          <b>${(parseDateOnly(e.exam_date)||new Date()).toLocaleDateString('en-US',{month:'short'}).toUpperCase()}</b>
          <strong>${(parseDateOnly(e.exam_date)||new Date()).getDate()}</strong>
        </span>
        <div style="flex:1">
          <strong>${escapeHtml(e.title)}</strong>
          <small>${escapeHtml(e.board||e.subject||'Exam')}</small>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="days-left"><b>${Math.max(0,dateDiffDays(e.exam_date))}</b><small>${dateDiffDays(e.exam_date)===0?'today':'days left'}</small></span>
          <button class="icon-button delete-exam" data-delete-exam="${e.id}" title="Delete exam" style="color:#ef4444;background:transparent;border:0;cursor:pointer;padding:4px"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
        </div>
      </div>`).join(''):'<div class="dashboard-empty">No upcoming exams. <button id="inlineAddExam">Add your first exam →</button></div>';
    
    list.querySelectorAll('[data-delete-exam]').forEach(b=>b.onclick=async(e)=>{
      const id=b.dataset.deleteExam;
      if(!confirm('Delete this exam?')) return;
      const {error}=await window.supabaseClient.from('exams').delete().eq('id',id);
      if(!error){exams=exams.filter(x=>x.id!==id);render();}
    });
    
    $('inlineAddExam')?.addEventListener('click',addExam);
    if(window.lucide) window.lucide.createIcons();
  }
  function renderActivity(){const days=[0,0,0,0,0,0,0];events.forEach(e=>{const d=new Date(e.created_at).getDay();days[(d+6)%7]+=Number(e.minutes||0)/60});const max=Math.max(...days,2);$('activityBars').innerHTML=days.map((v,i)=>`<div class="bar-item"><span class="bar" style="height:${Math.max(v?8:3,(v/max)*100)}%"></span><small>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small></div>`).join('');$('weeklyValue').textContent=`${Math.round(days.reduce((a,b)=>a+b,0)*60)}m`;}
  let focusUiTimer=null;
  function renderFocusCard(){
    const manager=window.NovexaFocus;
    const bar=$('focusProgressBar'), label=$('focusProgressLabel'), start=$('continueButton'), stop=$('focusStopButton'), open=$('focusOpenButton');
    if(!manager || !bar || !label || !start) return;
    const state=manager.get();
    if(!state){
      bar.style.width='0%'; label.textContent='Nothing tracked yet'; start.textContent='Start'; start.hidden=false; stop?.setAttribute('hidden',''); open?.setAttribute('hidden','');
      return;
    }
    const duration=Math.max(1,Number(state.duration||manager.DEFAULT_DURATION));
    const remaining=Math.max(0,Number(state.remaining||0));
    const percent=Math.max(0,Math.min(100,((duration-remaining)/duration)*100));
    bar.style.width=`${percent.toFixed(2)}%`;
    label.textContent=state.running ? `${manager.format(remaining)} remaining · ${Math.round(percent)}% complete` : (remaining<=0 ? 'Session complete' : `${manager.format(remaining)} remaining · Paused`);
    if(state.running){
      start.textContent='Open';
      start.hidden=false;
      if(open) open.hidden=true;
      if(stop) stop.hidden=false;
    }else if(remaining>0 && state.startedAt){
      start.textContent='Resume'; start.hidden=false; if(open) open.hidden=false; if(stop) stop.hidden=false;
    }else{
      start.textContent='Start'; start.hidden=false; if(open) open.hidden=true; if(stop) stop.hidden=true;
    }
  }
  function wireFocusCard(){
    const manager=window.NovexaFocus; if(!manager) return;
    const start=$('continueButton'), stop=$('focusStopButton'), open=$('focusOpenButton');
    const refresh=()=>renderFocusCard();
    start?.addEventListener('click',()=>{ const state=manager.get(); if(state?.running){ location.href='focus.html'; return; } manager.start(state?.remaining||state?.duration||manager.DEFAULT_DURATION); refresh(); });
    stop?.addEventListener('click',()=>{ manager.reset(manager.get()?.duration||manager.DEFAULT_DURATION); refresh(); });
    open?.addEventListener('click',()=>{ location.href='focus.html'; });
    window.addEventListener('novexa-focus-change',refresh);
    window.addEventListener('novexa-focus-complete',refresh);
    clearInterval(focusUiTimer); focusUiTimer=setInterval(refresh,250); refresh();
  }
  function renderActiveRecall(){const now=Date.now();const due=flashcards.filter(card=>!card.next_review_at||new Date(card.next_review_at).getTime()<=now).length;const deckCount=new Set(flashcards.map(card=>card.deck_id)).size;$('dueDeckCards').textContent=due;$('dueDeckSummary').textContent=due?`${due} card${due===1?'':'s'} due across ${deckCount} deck${deckCount===1?'':'s'}`:(deckCount?'All deck cards are scheduled':'Create your first deck with AI');}
  function render(){ renderFocusCard(); $('headingName').textContent=name();renderDailyQuote();$('todayDate').textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());$('goalValue').textContent=tasks.filter(t=>t.completed).length;$('goalBar').style.width=`${Math.min(100,tasks.length?tasks.filter(t=>t.completed).length/tasks.length*100:0)}%`;const streak=calcStreak();$('streakValue').textContent=streak;renderTasks();renderExams();renderActivity();renderActiveRecall();}
  function calcStreak(){const dates=new Set([...events.map(e=>localDateKey(e.created_at)),...flashcardReviews.map(r=>localDateKey(r.reviewed_at))]);let n=0,d=new Date();d.setHours(0,0,0,0);while(dates.has(localDateKey(d))){n++;d.setDate(d.getDate()-1)}return n}
  function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  async function addExam(){
    const today=localDateKey();
    openModal(`<h2>Add an exam</h2><form id="examForm" class="modal-form"><label>Exam name<input id="exTitle" required maxlength="120" placeholder="e.g. Mathematics P4"></label><label>Subject<input id="exSubject" maxlength="80" placeholder="Mathematics"></label><label>Board<input id="exBoard" maxlength="80" placeholder="Edexcel IAS"></label><label>Exam date<input id="exDate" type="date" min="${today}" required></label><div class="dashboard-form-hint">Choose today or a future date. You can edit or delete the exam later.</div><button class="modal-action" type="submit">Save exam</button></form>`);
    $('examForm').onsubmit=async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const button=form.querySelector('button[type="submit"]');
      setFormError(form,'');
      const title=$('exTitle').value.trim(), subject=$('exSubject').value.trim(), board=$('exBoard').value.trim(), examDate=$('exDate').value;
      if(!title){setFormError(form,'Enter an exam name.');$('exTitle').focus();return}
      if(!examDate||dateDiffDays(examDate)<0){setFormError(form,'Please choose today or a future exam date.');$('exDate').focus();return}
      button.disabled=true;button.textContent='Saving…';
      try{
        const payload={user_id:user.id,title,subject,board,exam_date:examDate};
        const {data,error}=await window.supabaseClient.from('exams').insert(payload).select().single();
        if(error)throw error;
        exams.push(data); closeModal(); render();
      }catch(error){setFormError(form,error?.message||'We could not save that exam. Please try again.');button.disabled=false;button.textContent='Save exam';}
    }
  }

  async function addTask(){
    const today=localDateKey();
    openModal(`<h2>Add a study task</h2><form id="taskForm" class="modal-form"><label>Task title<input id="tTitle" required maxlength="160" placeholder="e.g. Review Organic Chemistry"></label><label>Subject<input id="tSubject" maxlength="80" placeholder="Chemistry"></label><label>Due date<input id="tDate" type="date" min="${today}" value="${today}"></label><label>Time <small>(optional)</small><input id="tTime" type="time"></label><div class="dashboard-form-hint">Tasks are calendar dates. Tasks dated today appear in Today’s Study Plan, with timed tasks first.</div><button class="modal-action" type="submit">Save task</button></form>`);
    $('taskForm').onsubmit=async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const button=form.querySelector('button[type="submit"]');
      setFormError(form,'');
      const title=$('tTitle').value.trim(), subject=$('tSubject').value.trim(), dueDate=calendarDateKey($('tDate').value)||today, scheduledTime=taskTimeKey($('tTime').value);
      if(!title){setFormError(form,'Enter a task title.');$('tTitle').focus();return}
      if(dateDiffDays(dueDate)<0){setFormError(form,'Please choose today or a future due date.');$('tDate').focus();return}
      button.disabled=true;button.textContent='Saving…';
      try{
        const payload={user_id:user.id,title,subject:subject||null,due_date:dueDate,scheduled_time:scheduledTime||null,completed:false};
        let result=await window.supabaseClient.from('planner_tasks').insert(payload).select().single();
        // Older/partially migrated databases may not have scheduled_time yet.
        // Retry once without it so task creation itself never fails because of an
        // optional time column; the migration included in this release adds the
        // column for installations that want timed tasks.
        if(result.error && /scheduled_time|schema cache|column/i.test(String(result.error.message||''))) {
          const legacyPayload={user_id:user.id,title,subject:subject||null,due_date:dueDate,completed:false};
          result=await window.supabaseClient.from('planner_tasks').insert(legacyPayload).select().single();
          if(result.error && scheduledTime) {
            setFormError(form,'The task was created, but this database needs the latest Novexa planner migration before a time can be saved.');
          }
        }
        if(result.error)throw result.error;
        if(result.data) tasks.push(result.data);
        closeModal(); render();
      }catch(error){setFormError(form,error?.message||'We could not save that task. Please try again.');button.disabled=false;button.textContent='Save task';}
    }
  }

  async function load(){
    const [ex,t,ev,cards,reviews]=await Promise.all([
      window.supabaseClient.from('exams').select('*').eq('user_id',user.id).order('exam_date'),
      window.supabaseClient.from('planner_tasks').select('id,title,subject,due_date,completed,created_at').eq('user_id',user.id).order('due_date'),
      window.supabaseClient.from('study_events').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(300),
      window.supabaseClient.from('flashcards').select('id,deck_id,next_review_at').eq('user_id',user.id),
      window.supabaseClient.from('flashcard_review_history').select('reviewed_at').eq('user_id',user.id).order('reviewed_at',{ascending:false}).limit(300)
    ]);
    exams=ex.data||[]; tasks=t.data||[]; events=ev.data||[]; flashcards=cards.data||[]; flashcardReviews=reviews.data||[];
    // Optional timed-task column: load it only when the schema supports it. This prevents the dashboard from producing a 400 when an older Supabase schema has not yet added scheduled_time.
    if(!t.error){
      try{
        const timed=await window.supabaseClient.from('planner_tasks').select('id,scheduled_time').eq('user_id',user.id).in('id',tasks.map(x=>x.id).filter(Boolean));
        if(!timed.error){ const byId=new Map((timed.data||[]).map(row=>[String(row.id),row.scheduled_time])); tasks=tasks.map(row=>({...row,scheduled_time:byId.get(String(row.id))||null})); }
      }catch(_){}
    }
    if(ex.error||t.error||ev.error||cards.error||reviews.error){ const problems=[ex.error,t.error,ev.error,cards.error,reviews.error].filter(Boolean); if(problems.length) console.warn('Dashboard data issue:',problems.map(e=>e?.message||e).join(' | ')); }
    render();
  }
  async function credits(){
    const renderCredits = (d) => {
      const isPro = d?.plan === 'pro' || d?.unlimited === true;
      const upgradeCard=$('dashboardUpgradeCard');
      if(upgradeCard) upgradeCard.hidden=isPro;
      const planAction=$('aiPlanAction');
      if(isPro){
        $('aiScore').textContent=Number(d?.usageUnitsRemaining ?? d?.credits ?? 50).toLocaleString();
        $('aiPlan').textContent='Pro · 50 AI usage units/day';
        if(planAction){planAction.textContent='Manage Pro plan';planAction.href='payment.html';planAction.classList.add('is-pro');planAction.hidden=true}
      }else{
        const limit=5;
        const remaining=Number.isFinite(Number(d?.credits)) ? Math.max(0,Math.min(Number(d.credits),limit)) : limit;
        $('aiScore').textContent=remaining.toLocaleString();
        $('aiPlan').textContent=`Basic · ${limit.toLocaleString()} AI usage units/day`;
        if(planAction){planAction.textContent='Upgrade to Pro';planAction.href='payment.html';planAction.classList.remove('is-pro');planAction.hidden=false}
      }
    };
    try{
      const base=(location.hostname==='localhost'||location.hostname==='127.0.0.1') && location.port!=='3000' ? 'http://localhost:3000' : '';
      const r=await window.NovexaAuth.authorizedFetch(`${base}/api/ai/credits`,{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(r.ok){ renderCredits(d); return; }
      // Never downgrade a known Pro user to Basic because the billing API is
      // temporarily unavailable. Read the user's own profile as a safe UI
      // fallback; the server remains the source of truth for AI consumption.
      const profile=await window.supabaseClient.from('profiles').select('plan,trial_ends_at,ai_daily_units_remaining').eq('user_id',user.id).maybeSingle();
      const pro=profile.data?.plan==='pro';
      renderCredits(pro ? {plan:'pro',usageUnitsRemaining:50,limit:50} : {plan:'basic',usageUnitsRemaining:5,limit:5});
    }catch(e){
      try{
        const profile=await window.supabaseClient.from('profiles').select('plan,trial_ends_at,ai_daily_units_remaining').eq('user_id',user.id).maybeSingle();
        const pro=profile.data?.plan==='pro';
        renderCredits(pro ? {plan:'pro',usageUnitsRemaining:50,limit:50} : {plan:'basic',usageUnitsRemaining:5,limit:5});
      }catch(_){ renderCredits({plan:'basic',usageUnitsRemaining:5,limit:5}); }
    }
  }
  function wire(){
    document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>location.href=b.dataset.route);
    $('suggestionButton').onclick=()=>location.href='ai.html';
    wireFocusCard();
    $('reviewDueButton').onclick=()=>location.href='flashcards.html?due=1';
    $('addExamButton').onclick=addExam;
    $('addTaskButton').onclick=addTask;
    $('dateButton').onclick=()=>openModal(`<h2>Dashboard data</h2><p>Add exams in the Upcoming Exams card, create tasks in Study Planner, and use Focus Mode to start recording real study activity.</p>`);
    const prem = $('premiumButton');
    if(prem) prem.onclick=()=>location.href='payment.html';
    const dashboardUpgradeButton=$('dashboardUpgradeButton');
    if(dashboardUpgradeButton) dashboardUpgradeButton.onclick=()=>location.href='payment.html';
  }
  async function init(){
    try{
      if(!window.supabaseClient) throw new Error('Supabase client did not load.');
      const activeSession = await (window.NovexaAuth?.waitForSession(8000) || (async()=>{const r=await window.supabaseClient.auth.getSession();return r.data?.session||null;})());
      if(!activeSession?.user){ location.replace('login.html'); return; }
      user=activeSession.user;
      wire();
      await loadPetIdentity();
      render();
      await Promise.all([load(),credits()]);
    }catch(error){
      console.error('Dashboard auth initialization failed:',error);
      const message=document.createElement('div');
      message.className='dashboard-auth-error';
      message.innerHTML='<strong>We could not restore your session.</strong><br>Please refresh once. If the problem continues, sign in again.';
      document.querySelector('.dashboard-main')?.prepend(message);
    }
  }
  init();
})();
