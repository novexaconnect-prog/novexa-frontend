(() => {
  const $ = id => document.getElementById(id);
  const els = {
    list: $('notesList'), count: $('notesCount'), status: $('notesStatus'), search: $('noteSearch'),
    subjectFilter: $('subjectFilter'), qualificationFilter: $('qualificationFilter'), sort: $('sortFilter'),
    modal: $('noteModal'), form: $('noteForm'), id: $('noteId'), title: $('noteTitle'), subject: $('noteSubject'),
    qualification: $('noteQualification'), tags: $('noteTags'), body: $('noteBody'), file: $('noteFile'),
    selectedFile: $('selectedFile'), fileLabel: $('fileLabel'), error: $('noteFormError'),
    save: $('saveNoteButton'), deleteButton: $('deleteNoteButton'), popular: $('popularSubjects'),
    recent: $('recentUploads')
  };

  let user = null;
  let notes = [];
  let selectedFile = null;
  let activeTab = 'mine';
  let saving = false;

  // Compatibility with older Novexa Notes tables that used `content` instead of `body`.
  const isMissingBodyColumn = error => /body.*column.*notes.*schema cache|column .*body.*notes|could not find.*body/i.test(String(error?.message || error || ''));
  const normalizeNote = note => note ? ({ ...note, body: note.body ?? note.content ?? note.note_content ?? '' }) : note;
  const normalizeNotes = list => (Array.isArray(list) ? list : []).map(normalizeNote);
  const schemaMigrationMessage = 'Your Notes database is using an older schema. Run backend/supabase/notes_migration_fix.sql in Supabase SQL Editor, then refresh.';
  // Local fallback keeps Notes usable when an older Supabase schema/cache rejects a write.
  // Supabase remains the primary store; this fallback is per-browser and never exposes a file publicly.
  const LOCAL_DB = 'novexa_notes_local_v2';
  const LOCAL_STORE = 'files';
  function localOpenDb() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(LOCAL_DB,1);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(LOCAL_STORE)) db.createObjectStore(LOCAL_STORE); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function localPut(key,value){ const db=await localOpenDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction(LOCAL_STORE,'readwrite'); tx.objectStore(LOCAL_STORE).put(value,key); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }
  async function localGet(key){ const db=await localOpenDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction(LOCAL_STORE,'readonly'); const r=tx.objectStore(LOCAL_STORE).get(key); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
  async function localDelete(key){ const db=await localOpenDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction(LOCAL_STORE,'readwrite'); tx.objectStore(LOCAL_STORE).delete(key); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }
  function localNotesKey(){ return `notes_${user?.id || 'guest'}`; }
  function readLocalNotes(){ try{return JSON.parse(localStorage.getItem(localNotesKey())||'[]')}catch(_){return []} }
  function writeLocalNotes(list){ localStorage.setItem(localNotesKey(),JSON.stringify(list)); }
  async function saveLocalNote(note,file){
    const now=new Date().toISOString(); const list=readLocalNotes(); const id=note.id || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record={...note,id,user_id:user.id,created_at:note.created_at||now,updated_at:now,storage:note.storage || 'local'};
    if(file && record.storage === 'local'){ const fileId=`file-${id}`; await localPut(fileId,{blob:file,name:file.name,type:file.type,size:file.size}); record.file_path=fileId; record.file_name=file.name; record.file_type=file.type; record.file_size=file.size; }
    const idx=list.findIndex(n=>n.id===id); if(idx>=0) list[idx]=record; else list.unshift(record); writeLocalNotes(list); return record;
  }
  function getLocalNotes(){ return normalizeNotes(readLocalNotes()); }


  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;'
  }[char]));

  const formatDate = value => {
    try {
      return new Intl.DateTimeFormat('en', { day:'numeric', month:'short', year:'numeric' }).format(new Date(value));
    } catch (_) { return 'Recently'; }
  };

  const fileKind = note => {
    const type = note?.file_type || '';
    const name = note?.file_name || '';
    if (type.startsWith('image/')) return 'image';
    if (/\.pdf$/i.test(name) || type === 'application/pdf') return 'pdf';
    if (/\.docx?$/i.test(name)) return 'doc';
    return 'text';
  };

  const iconFor = kind => {
    const map = {
      pdf: '<i data-lucide="file-digit"></i>',
      doc: '<i data-lucide="file-text"></i>',
      image: '<i data-lucide="image"></i>',
      text: '<i data-lucide="align-left"></i>'
    };
    return map[kind] || '<i data-lucide="file"></i>';
  };

  function setStatus(text, error = false) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.style.color = error ? '#c94747' : '';
  }

  function resetFileUI(note = null) {
    selectedFile = null;
    if (els.file) els.file.value = '';
    if (els.fileLabel) els.fileLabel.textContent =
      note?.file_name ? `Replace ${note.file_name}` : 'Attach a PDF, Word file, image or text file';
    if (els.selectedFile) {
      els.selectedFile.hidden = !note?.file_name;
      els.selectedFile.textContent = note?.file_name ? `Current file: ${note.file_name}` : '';
    }
  }

  function openModal(note = null) {
    if (!els.modal) return;
    if (els.error) els.error.textContent = '';
    if (els.id) els.id.value = note?.id || '';
    if (els.title) els.title.value = note?.title || '';
    if (els.subject) els.subject.value = note?.subject || '';
    if (els.qualification) els.qualification.value = note?.qualification || 'Other';
    if (els.tags) els.tags.value = Array.isArray(note?.tags) ? note.tags.join(', ') : (note?.tags || '');
    if (els.body) els.body.value = note?.body || '';
    $('noteModalTitle').textContent = note ? 'Edit note' : 'Create a note';
    if (els.save) els.save.textContent = note ? 'Save changes' : 'Save note';
    if (els.deleteButton) {
      els.deleteButton.hidden = !note;
      els.deleteButton.style.display = note ? 'block' : 'none';
    }
    resetFileUI(note);
    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => els.title?.focus(), 50);
  }

  function closeModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function getFiltered() {
    const q = els.search?.value?.trim().toLowerCase() || '';
    let result = notes.filter(note => {
      const hay = [
        note.title, note.subject, note.qualification, note.body,
        Array.isArray(note.tags) ? note.tags.join(' ') : ''
      ].join(' ').toLowerCase();

      return (activeTab === 'saved' ? Boolean(note.is_saved) : true)
        && (!q || hay.includes(q))
        && (!els.subjectFilter?.value || note.subject === els.subjectFilter.value)
        && (!els.qualificationFilter?.value || note.qualification === els.qualificationFilter.value);
    });

    if (els.sort?.value === 'title') {
      result.sort((a,b) => String(a.title).localeCompare(String(b.title)));
    } else {
      result.sort((a,b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      if (els.sort?.value === 'oldest') result.reverse();
    }
    return result;
  }

  function render() {
    const filtered = getFiltered();
    if (els.count) els.count.textContent = `${filtered.length} note${filtered.length === 1 ? '' : 's'}`;
    if (window.lucide) window.lucide.createIcons();

    if (!filtered.length) {
      els.list.innerHTML = `
        <div class="empty-notes">
          <div class="empty-icon"><i data-lucide="notebook-pen" aria-hidden="true"></i></div>
          <h2>${notes.length ? 'No notes match your filters' : 'Your study space is empty'}</h2>
          <p>${notes.length
            ? 'Try a different search, subject or qualification.'
            : 'Create your first note or upload your study material. It will stay attached to your account after you sign out.'}</p>
          <button class="notes-primary" id="emptyCreate" type="button">＋ ${notes.length ? 'Create note' : 'Create your first note'}</button>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      $('emptyCreate')?.addEventListener('click', () => openModal());
    } else {
      els.list.innerHTML = filtered.map((note, i) => {
        const kind = fileKind(note);
        const tags = Array.isArray(note.tags) ? note.tags.slice(0,4) : [];
        const preview = note.body || (note.file_name ? `Uploaded file: ${note.file_name}` : 'No preview available.');
        return `
          <article class="note-card" style="animation-delay:${Math.min(i,8)*35}ms">
            <div class="note-file-icon ${kind}">${iconFor(kind)}</div>
            <div class="note-main">
              <h3>${escapeHtml(note.title)}</h3>
              <div class="note-meta">
                <span>${escapeHtml(note.subject || 'General')}</span><span>•</span>
                <span>${escapeHtml(note.qualification || 'Other')}</span>
                ${note.file_name ? `<span>•</span><span>${escapeHtml(note.file_name)}</span>` : ''}
              </div>
              <div class="note-preview">${escapeHtml(preview)}</div>
              <div class="note-date">
                Updated ${formatDate(note.updated_at || note.created_at)}
                ${tags.map(tag => `<span class="note-tag">${escapeHtml(tag)}</span>`).join(' ')}
              </div>
            </div>
            <div class="note-actions">
              <button class="note-save" data-save="${note.id}" type="button" title="${note.is_saved ? 'Remove from saved' : 'Save note'}"><i data-lucide="${note.is_saved ? 'star' : 'star'}" class="${note.is_saved ? 'filled' : ''}"></i></button>
              <button class="note-action note-action-open" data-open="${note.id}" type="button"><i data-lucide="external-link"></i><span>Open note</span></button>
              <button class="note-action note-action-more" data-edit="${note.id}" type="button" aria-label="Edit note" title="Edit note"><i data-lucide="more-horizontal"></i></button>
            </div>
          </article>`;
      }).join('');

      els.list.querySelectorAll('[data-open]').forEach(btn => {
        btn.addEventListener('click', () => openStoredNote(btn.dataset.open));
      });
      els.list.querySelectorAll('[data-save]').forEach(btn => {
        btn.addEventListener('click', () => toggleSaved(btn.dataset.save));
      });
      els.list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => openModal(notes.find(note => note.id === btn.dataset.edit)));
      });
    }

    renderSidebars();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderSidebars() {
    const counts = {};
    notes.forEach(note => {
      const subject = note.subject || 'General';
      counts[subject] = (counts[subject] || 0) + 1;
    });

    const subjects = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8);
    if (!els.popular || !els.recent || !els.subjectFilter) return;
    els.popular.innerHTML = subjects.length
      ? subjects.map(([subject,count]) => `<button type="button" data-subject="${escapeHtml(subject)}">${escapeHtml(subject)} · ${count}</button>`).join('')
      : '<span style="font-size:10px;color:#9699ad">Your subjects will appear here.</span>';

    els.popular.querySelectorAll('[data-subject]').forEach(btn => {
      btn.addEventListener('click', () => {
        els.subjectFilter.value = btn.dataset.subject;
        render();
      });
    });

    const recent = notes.slice().sort((a,b) =>
      new Date(b.created_at) - new Date(a.created_at)
    ).slice(0,5);

    els.recent.innerHTML = recent.length
      ? recent.map(note => `
        <div class="recent-upload">
          <div class="recent-upload-icon">${iconFor(fileKind(note))}</div>
          <div><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.subject || 'General')} · ${formatDate(note.created_at)}</small></div>
        </div>`).join('')
      : '<span style="font-size:10px;color:#9699ad">No uploads yet.</span>';

    const subjectsList = [...new Set(notes.map(n => n.subject).filter(Boolean))].sort();
    const current = els.subjectFilter?.value || '';
    els.subjectFilter.innerHTML = '<option value="">All subjects</option>' +
      subjectsList.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if (els.subjectFilter) els.subjectFilter.value = subjectsList.includes(current) ? current : '';
  }

  async function loadNotes() {
    if (!user) return false;
    setStatus('Loading your notes…');

    try {
      let result = await window.supabaseClient
        .from('notes')
        .select('*')
        .eq('user_id', user.id);

      // Legacy installations may not have updated_at/body in PostgREST's
      // schema cache. Fall back progressively instead of making the whole
      // Notes page unusable.
      if (!result.error) {
        result.data = (result.data || []).sort((a,b) =>
          new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
        );
      } else {
        const legacyProjections = [
          'id,user_id,title,subject,qualification,tags,is_saved,content,note_content,file_path,file_name,file_type,file_size,created_at,updated_at',
          'id,user_id,title,subject,qualification,tags,is_saved,content,file_path,file_name,file_type,file_size,created_at',
          'id,user_id,title,subject,qualification,tags,is_saved,note_content,file_path,file_name,file_type,file_size,created_at'
        ];
        for (const projection of legacyProjections) {
          const legacy = await window.supabaseClient
            .from('notes')
            .select(projection)
            .eq('user_id', user.id);
          if (!legacy.error) {
            result = legacy;
            result.data = (legacy.data || []).sort((a,b) =>
              new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
            );
            break;
          }
        }
      }

      if (result.error) throw result.error;

      notes = normalizeNotes(result.data);
      const local = getLocalNotes();
      if (local.length) notes = [...local, ...notes.filter(n => !local.some(l => l.id === n.id))];
      setStatus('Your private study notes');
      render();
      return true;
    } catch (error) {
      console.error('Notes load error:', error);
      notes = getLocalNotes();
      if (notes.length) { setStatus('Supabase unavailable · using your local Notes backup', true); render(); return true; }
      setStatus('Could not load Notes', true);
      els.list.innerHTML = `
        <div class="empty-notes">
          <div class="empty-icon">!</div>
          <h2>Notes database needs a quick migration</h2>
          <p>${escapeHtml(isMissingBodyColumn(error) ? schemaMigrationMessage : 'Run backend/supabase/notes_migration_fix.sql in Supabase SQL Editor, then try again.')}</p>
          <button class="notes-primary" id="retryNotes" type="button">↻ Try again</button>
        </div>`;
      $('retryNotes')?.addEventListener('click', loadNotes);
      return false;
    }
  }

  async function toggleSaved(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    try {
      const nextSaved = !note.is_saved;
      if (String(id).startsWith('local-') || note.storage === 'local') {
        const local = readLocalNotes().map(n => n.id === id ? { ...n, is_saved: nextSaved, updated_at: new Date().toISOString() } : n);
        writeLocalNotes(local); notes = notes.map(n => n.id === id ? { ...n, is_saved: nextSaved } : n); render(); return;
      }
      const { error } = await window.supabaseClient
        .from('notes')
        .update({ is_saved: nextSaved, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      notes = notes.map(n => n.id === id ? { ...n, is_saved: nextSaved } : n);
      render();
    } catch (error) {
      console.error(error);
      alert(`Could not update this note.\n\n${error.message}`);
    }
  }

  async function deleteNote() {
    const id = els.id.value.trim();
    const note = notes.find(n => n.id === id);
    if (!id || !note || saving) return;
    if (!confirm(`Delete “${note.title}”?`)) return;

    els.deleteButton.disabled = true;
    try {
      if (note.file_path && (note.storage === 'local' || String(note.file_path).startsWith('file-'))) await localDelete(note.file_path);
      if (!String(id).startsWith('local-') && note.storage !== 'local') {
        if (note.file_path) {
          const { error } = await window.supabaseClient.storage.from('notes').remove([note.file_path]);
          if (error) console.warn('File delete warning:', error.message);
        }
        const { error } = await window.supabaseClient.from('notes').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;
      }
      writeLocalNotes(readLocalNotes().filter(n => n.id !== id));
      notes = notes.filter(n => n.id !== id);
      closeModal();
      render();
    } catch (error) {
      els.error.textContent = error.message || 'Could not delete this note.';
    } finally {
      els.deleteButton.disabled = false;
    }
  }

  async function uploadFile(file) {
    if (!file) return null;
    if (file.size > 20 * 1024 * 1024) throw new Error('Files must be 20 MB or smaller.');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const randomId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${user.id}/${randomId}-${safe}`;
    try {
      const { error } = await window.supabaseClient.storage.from('notes').upload(path, file, { contentType:file.type || 'application/octet-stream', upsert:false });
      if (!error) return { path, name:file.name, type:file.type || 'application/octet-stream', size:file.size, remote:true };
      console.warn('Supabase note upload failed; using local fallback:', error.message);
    } catch (error) { console.warn('Supabase note upload failed; using local fallback:', error.message); }
    return { path:`file-${randomId}`, name:file.name, type:file.type || 'application/octet-stream', size:file.size, local:true, file };
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!user || saving) return;
    if (els.error) els.error.textContent = '';
    saving = true; els.save.disabled=true; els.deleteButton.disabled=true; els.save.textContent='Saving…';
    let uploaded=null;
    try {
      const id=els.id.value.trim(); const old=notes.find(n=>n.id===id);
      const title=els.title.value.trim(); const body=els.body.value.trim();
      if(!title) throw new Error('Please enter a title.');
      if(!body && !selectedFile && !id) throw new Error('Write some note content or attach a file.');
      if(selectedFile) uploaded=await uploadFile(selectedFile);
      const tags=els.tags.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12);
      const base={title,subject:els.subject.value.trim()||'General',qualification:els.qualification.value,tags,updated_at:new Date().toISOString()};
      if(uploaded && !uploaded.local){base.file_path=uploaded.path;base.file_name=uploaded.name;base.file_type=uploaded.type;base.file_size=uploaded.size;}
      let remoteSaved=false;
      try {
        const payloads=[{...base,body},{...base,content:body},{...base,note_content:body},{...base}];
        let last=null;
        for(const payload of payloads){ const attempt=id?await window.supabaseClient.from('notes').update(payload).eq('id',id).eq('user_id',user.id):await window.supabaseClient.from('notes').insert({user_id:user.id,...payload}); if(!attempt.error){remoteSaved=true;break;} last=attempt.error; if(!/body|content|note_content|schema cache|column|representation/i.test(String(attempt.error.message||''))) break; }
        if(!remoteSaved) console.warn('Supabase note write failed; using local fallback:',last?.message);
      } catch(error){ console.warn('Supabase note write failed; using local fallback:',error.message); }

      const localRecord=await saveLocalNote({...base,id:id||undefined,body,is_saved:old?.is_saved||false,created_at:old?.created_at,storage:remoteSaved?'remote':'local'}, selectedFile || (uploaded?.local ? uploaded.file : null));
      if(id && uploaded && uploaded.remote && old?.file_path) await window.supabaseClient.storage.from('notes').remove([old.file_path]).catch(()=>{});
      closeModal(); setStatus(remoteSaved?'Saved · Your notes are synced to your account':'Saved · Your browser backup is active');
      await loadNotes();
    } catch(error){
      console.error('Save note error:',error); els.error.textContent=error.message||'Could not save this note.';
    } finally { saving=false; els.save.disabled=false; els.deleteButton.disabled=!els.id.value.trim(); els.save.textContent=els.id.value.trim()?'Save changes':'Save note'; }
  }

  function notePreviewHtml(note) {
    const title = escapeHtml(note.title || 'Novexa note');
    const subject = escapeHtml(note.subject || 'General');
    const body = escapeHtml(note.body || note.content || note.note_content || 'No note content available.').replace(/\n/g, '<br>');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Novexa</title><style>body{margin:0;background:#f8f7fc;color:#2b2e4a;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.note-view{width:min(820px,calc(100% - 32px));margin:42px auto;padding:30px 34px;background:#fff;border:1px solid #e8e3f2;border-radius:22px;box-shadow:0 22px 60px rgba(45,36,107,.1)}.eyebrow{color:#6843f5;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.meta{margin:8px 0 25px;color:#898da5;font-size:12px}.body{font-size:16px;line-height:1.8;overflow-wrap:anywhere}@media(max-width:600px){.note-view{width:calc(100% - 24px);margin:12px auto;padding:22px 18px}.body{font-size:14px}}</style></head><body><main class="note-view"><div class="eyebrow">Novexa note</div><h1>${title}</h1><div class="meta">${subject}</div><div class="body">${body}</div></main></body></html>`;
  }

  function prepareNoteFlashcards(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;
    const text = String(note.body || note.content || note.note_content || '').trim();
    if (!text) {
      setStatus('Open or copy the uploaded file into Novexa AI, then choose Flashcards. Text notes can be prepared directly.');
      return;
    }
    try {
      sessionStorage.setItem('novexa_note_flashcard_source', JSON.stringify({
        title: String(note.title || 'Study notes').slice(0, 120), subject: String(note.subject || 'General').slice(0, 80),
        text: text.slice(0, 120000), sourceReference: String(note.title || 'Study notes').slice(0, 255)
      }));
      location.href = `ai.html?source=notes&subject=${encodeURIComponent(note.subject || 'General')}`;
    } catch (error) {
      setStatus('Could not prepare this note for flashcards. Please copy it into Novexa AI instead.');
    }
  }

  async function openStoredNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const previewWindow = window.open('about:blank', '_blank');
    try {
      let url;
      if (note.file_path) {
        if (note.storage === 'local' || String(note.file_path).startsWith('file-')) {
          const item = await localGet(note.file_path);
          if (!item?.blob) throw new Error('Local file backup not found.');
          url = URL.createObjectURL(item.blob);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } else {
          const { data, error } = await window.supabaseClient.storage.from('notes').createSignedUrl(note.file_path, 600);
          if (error) throw error;
          url = data.signedUrl;
        }
        if (previewWindow && !previewWindow.closed) previewWindow.location.href = url;
        else window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const blob = new Blob([notePreviewHtml(note)], { type: 'text/html;charset=utf-8' });
        url = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (previewWindow && !previewWindow.closed) previewWindow.location.href = url;
        else window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      console.warn('Note open error:', error.message);
      setStatus(`Could not open this note directly: ${error.message}`);
    }
  }

  function wire() {
    $('createNoteButton')?.addEventListener('click', () => openModal());
    $('uploadNoteButton')?.addEventListener('click', () => { openModal(); setTimeout(() => els.file?.click(), 80); });
    $('helpAiButton')?.addEventListener('click', () => location.href = 'ai.html');
    $('refreshNotes')?.addEventListener('click', loadNotes);

    document.querySelectorAll('[data-close-note]').forEach(btn => btn.addEventListener('click', closeModal));
    els.form?.addEventListener('submit', saveNote);
    els.deleteButton?.addEventListener('click', deleteNote);

    els.file?.addEventListener('change', event => {
      selectedFile = event.target.files?.[0] || null;
      els.selectedFile.hidden = !selectedFile;
      els.selectedFile.textContent = selectedFile
        ? `Selected: ${selectedFile.name} · ${(selectedFile.size/1024/1024).toFixed(1)} MB`
        : '';
      els.fileLabel.textContent = selectedFile ? selectedFile.name : 'Attach a PDF, Word file, image or text file';
    });

    const drop = document.querySelector('.file-drop');
    if (drop) {
      ['dragenter','dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('dragging'); }));
      ['dragleave','drop'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
      drop.addEventListener('drop', e => {
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        selectedFile = file;
        els.selectedFile.hidden = false;
        els.selectedFile.textContent = `Selected: ${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;
        els.fileLabel.textContent = file.name;
      });
    }

    [els.search, els.subjectFilter, els.qualificationFilter, els.sort].forEach(el => {
      el?.addEventListener('input', render);
      el?.addEventListener('change', render);
    });

    document.querySelectorAll('.notes-tab').forEach(tab => tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.notes-tab').forEach(t => t.classList.toggle('active', t === tab));
      render();
    }));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
  }

  async function init() {
    if (!window.supabaseClient) {
      setStatus('Supabase client failed to load', true);
      return;
    }

    try {
      const session = await (window.NovexaAuth?.waitForSession(3500) || window.supabaseClient.auth.getSession());
      const activeSession = session?.session || session;
      if (!activeSession?.user) {
        location.replace('login.html');
        return;
      }

      user = activeSession.user;
      wire();
      await loadNotes();
    } catch (error) {
      console.error('Notes initialization error:', error);
      setStatus('Could not initialize Notes', true);
      els.list.innerHTML = `<div class="empty-notes"><div class="empty-icon">!</div><h2>Notes could not start</h2><p>${escapeHtml(error.message || 'Please refresh and try again.')}</p><button class="notes-primary" id="retryInit" type="button">Refresh</button></div>`;
      $('retryInit')?.addEventListener('click', () => location.reload());
    }
  }

  init();
})();
