// Novexa Browse — Paper Lords-inspired catalog. QP/MS/Data links open only the selected remote file in a new tab.
(function () {
  const structurePath = '../data/papers/structure.json';
  const subjectsContainer = document.getElementById('subjectsContainer');
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000'
    ? 'http://localhost:3000/api'
    : '/api';
  let activeQualification = 'IGCSE';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function driveDownloadUrl(fileUrl) {
    const match = String(fileUrl || '').match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}` : fileUrl;
  }

  const viewerModal = document.getElementById('paperViewerModal');
  const viewerFrame = document.getElementById('paperViewerFrame');
  const viewerLoading = document.getElementById('paperViewerLoading');
  const viewerTitle = document.getElementById('paperViewerModalTitle');
  const viewerNewTab = document.getElementById('paperViewerNewTab');

  function closePaperViewer() {
    if (!viewerModal) return;
    viewerModal.hidden = true;
    viewerModal.setAttribute('aria-hidden', 'true');
    viewerFrame.src = 'about:blank';
    document.body.style.overflow = '';
  }

  function drivePreviewUrl(fileUrl) {
    const match = String(fileUrl || '').match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` : fileUrl;
  }

  function showPaperViewer(fileUrl, title, context = {}) {
    if (!viewerModal || !viewerFrame || !fileUrl) return false;
    const isProxyable = /^(?:https?:\/\/)?(?:www\.)?(?:paperlords\.org|drive\.google\.com)\//i.test(String(fileUrl));
    const apiBase = String(window.NOVEXA_API_BASE || '').trim().replace(/\/$/, '');
    const embeddedFile = isProxyable ? `${apiBase}/api/papers/pdf?url=${encodeURIComponent(fileUrl)}` : fileUrl;
    const viewerParams = new URLSearchParams({embedded:'1',file:embeddedFile,title:title || 'Past paper',subject:context.subject || 'General',board:context.board || 'Novexa Archive',year:String(context.year || ''),session:context.session || '',paper:context.paper || title || 'Paper',type:context.type || 'Paper',v:'20260814-paper-ai'});const viewerUrl = `paper.html?${viewerParams.toString()}`;
    viewerTitle.textContent = title || 'Past paper';
    viewerLoading.hidden = false;
    viewerModal.hidden = false;
    viewerModal.setAttribute('aria-hidden', 'false');
    viewerModal.classList.add('is-opening');
    document.body.style.overflow = 'hidden';
    const revealTimer = window.setTimeout(() => { viewerLoading.hidden = true; }, 1200);
    viewerFrame.onload = () => { window.clearTimeout(revealTimer); window.setTimeout(() => { viewerLoading.hidden = true; }, 180); };
    viewerFrame.src = viewerUrl;
    viewerNewTab.onclick = () => {
      const newTabUrl = new URL(viewerUrl, location.href);
      newTabUrl.searchParams.delete('embedded');
      window.open(newTabUrl.toString(), '_blank', 'noopener,noreferrer');
    };
    return true;
  }

  document.querySelectorAll('[data-close-paper-viewer]').forEach(el => el.addEventListener('click', closePaperViewer));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && viewerModal && !viewerModal.hidden) closePaperViewer(); });

  function openPaper(fileUrl, title, isRemote = false, download = false, context = {}) {
    if (!fileUrl) return;
    if (download) {
      const isProxyable = /^(?:https?:\/\/)?(?:www\.)?(?:paperlords\.org|drive\.google\.com)\//i.test(String(fileUrl));
      const apiBase = String(window.NOVEXA_API_BASE || '').trim().replace(/\/$/, '');
      const href = isProxyable ? `${apiBase}/api/papers/pdf?download=1&url=${encodeURIComponent(fileUrl)}` : driveDownloadUrl(fileUrl);
      const link = document.createElement('a');
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.download = title || 'Novexa Paper';
      document.body.appendChild(link); link.click(); link.remove(); return;
    }
    if (!showPaperViewer(fileUrl, title, context)) {
      const viewerParams = new URLSearchParams({file:fileUrl,title:title || 'Past paper',subject:context.subject || 'General',board:context.board || 'Novexa Archive',year:String(context.year || ''),session:context.session || '',paper:context.paper || title || 'Paper',type:context.type || 'Paper',v:'20260814-paper-ai'});const viewerUrl = `paper.html?${viewerParams.toString()}`;
      const win = window.open(viewerUrl, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = viewerUrl;
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  }

  async function fetchLocalStructure() {
    try { return await fetchJson(structurePath); }
    catch (error) { console.warn('Local paper catalog unavailable:', error); return []; }
  }

  async function fetchRemoteCatalog(qualification) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const data = await fetchJson(`${API_BASE}/papers/catalog?qualification=${encodeURIComponent(qualification)}`, { signal: controller.signal });
      return data?.subjects || [];
    } catch (error) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  function isHiddenSubject(label, qualification) {
    const name = String(label || '').trim();
    const qual = String(qualification || '').toUpperCase();
    if (qual === 'IAS/IAL' && /^it$/i.test(name)) return true;
    if (qual !== 'IGCSE') return false;
    return /^(?:further\s+)?pure\s+(?:maths|mathematics)$/i.test(name) || /^business(?:\s+studies)?$/i.test(name);
  }

  function shouldHideEr(subjectName) {
    return activeQualification === 'IGCSE' && /^(computer\s+science|ict)$/i.test(String(subjectName || '').trim());
  }

  function mergeSubjects(localQual, remoteSubjects) {
    const map = new Map();
    for (const subject of (localQual?.subjects || [])) {
      if (isHiddenSubject(subject.subject, localQual?.qualification)) continue;
      map.set(subject.subject, JSON.parse(JSON.stringify(subject)));
    }

    for (const remote of remoteSubjects || []) {
      if (isHiddenSubject(remote?.subject, localQual?.qualification)) continue;
      if (!remote?.subject) continue;
      if (!map.has(remote.subject)) map.set(remote.subject, { subject: remote.subject, sessions: [] });
      const target = map.get(remote.subject);
      const byName = new Map((target.sessions || []).map(s => [String(s.name).toLowerCase(), s]));
      for (const session of remote.sessions || []) {
        const key = String(session.name).toLowerCase();
        if (!byName.has(key)) {
          target.sessions.push({ name: session.name, papers: [], sourceUrl: session.url, remote: true });
        } else if (session.url) {
          const existing = byName.get(key);
          existing.sourceUrl ||= session.url;
          existing.remote = true;
        }
      }
      target.sessions.sort((a,b) => String(b.name).localeCompare(String(a.name), undefined, {numeric:true}));
    }

    return [...map.values()].sort((a,b) => a.subject.localeCompare(b.subject));
  }

  async function loadRemoteSession(session, papersGrid, subjectName) {
    if (!session.sourceUrl || session.loaded) return;
    session.loaded = true;
    papersGrid.innerHTML = '<div class="remote-loading">Loading papers…</div>';
    try {
      const data = await fetchJson(`${API_BASE}/papers/session?url=${encodeURIComponent(session.sourceUrl)}`);
      session.papers = data.papers || [];
      renderPapers(session, papersGrid, subjectName);
    } catch (error) {
      session.loaded = false;
      papersGrid.innerHTML = '<div class="remote-error">This session could not be loaded right now. Please try again.</div>';
    }
  }

  function renderPapers(session, papersGrid, subjectName) {
    papersGrid.innerHTML = '';
    const papers = Array.isArray(session.papers) ? session.papers : [];
    if (!papers.length) {
      const source = session.sourceUrl || (subjectName === 'Computer Science' || subjectName === 'ICT' ? 'https://www.paperlords.org/igcse' : '');
      papersGrid.innerHTML = source
        ? `<div class="empty-state">No direct QP/MS file is available in the local catalog for this session. <a class="paperlords-fallback" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open verified Paper Lords archive</a></div>`
        : '<div class="empty-state">No QP/MS files are available for this session.</div>';
      return;
    }

      papers.forEach((paper) => {
      const row = document.createElement('div');
      row.className = 'lords-paper-row';
      const label = document.createElement('span');
      label.className = 'lords-unit-label';
      label.textContent = paper.unit || 'Paper';
      row.appendChild(label);

      const buttons = document.createElement('div');
      buttons.className = 'lords-btn-group';
      const dataUrl = paper.data || paper.data_file || paper.dataFile || paper.datafile || '';
      [['qp','QP'],['ms','MS'],['data','DATA']].forEach(([key, text]) => {
        const fileUrl = key === 'data' ? dataUrl : paper[key];
        if (!fileUrl) return;
        const btn = document.createElement('button');
        btn.className = `lords-btn ${key}`;
        btn.textContent = text;
        btn.type = 'button';
        btn.title = `${subjectName} ${session.name} ${paper.unit || ''} ${text}`;
        if (key === 'data') btn.setAttribute('aria-label', 'Open Data File');
        btn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPaper(fileUrl, btn.title, paper.isRemote, false, {subject:subjectName,board:'Pearson/ Cambridge archive',year:(String(session.name).match(/20\d{2}/)||[''])[0],session:session.name,paper:paper.unit || 'Paper',type:key === 'qp' ? 'Question Paper' : key === 'ms' ? 'Mark Scheme' : 'Data File'});
        };
        buttons.appendChild(btn);
      });
      if (subjectName === 'ICT' && session.name === '2025 May-June' && paper.unit === 'ICT P2' && !dataUrl) {
        const dataSource = document.createElement('a');
        dataSource.className = 'lords-btn source-fallback';
        dataSource.href = 'https://www.paperlords.org/igcse';
        dataSource.target = '_blank';
        dataSource.rel = 'noopener noreferrer';
        dataSource.textContent = 'DATA source';
        dataSource.title = 'Open Paper Lords to check the ICT 2025 May-June P2 DATA source';
        buttons.appendChild(dataSource);
      }
      if (!buttons.childElementCount && (subjectName === 'Computer Science' || subjectName === 'ICT')) {
        const fallback = document.createElement('a');
        fallback.className = 'lords-btn source-fallback';
        fallback.href = 'https://www.paperlords.org/igcse';
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.textContent = 'Paper Lords';
        fallback.title = `Open ${subjectName} archive on Paper Lords`;
        buttons.appendChild(fallback);
      }
      row.appendChild(buttons);
      papersGrid.appendChild(row);
    });
  }

  function renderSubjects(subjects) {
    if (!subjectsContainer) return;
    subjectsContainer.innerHTML = '';
    if (!subjects.length) {
      subjectsContainer.innerHTML = '<div class="empty-state">No papers are available yet.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'subject-list-lords';

    subjects.forEach(subject => {
      const details = document.createElement('details');
      details.className = 'lords-subject';
      const summary = document.createElement('summary');
      summary.innerHTML = `<i data-lucide="folder" class="lords-subject-icon" style="width:18px;height:18px"></i><span class="lords-subject-name">${escapeHtml(subject.subject)}</span><i data-lucide="chevron-right" class="lords-chevron" style="width:18px;height:18px"></i>`;
      details.appendChild(summary);

      const content = document.createElement('div');
      content.className = 'lords-sessions';
      const sessions = Array.isArray(subject.sessions) ? subject.sessions : [];

      if (!sessions.length) {
        content.innerHTML = '<div class="empty-state">No sessions listed yet.</div>';
      } else {
        sessions.forEach(session => {
          const sessionDetails = document.createElement('details');
          sessionDetails.className = 'lords-session';
          const sessionSummary = document.createElement('summary');
          sessionSummary.innerHTML = `<i data-lucide="calendar" style="width:16px;height:16px;margin-right:10px;color:#6d4cff"></i><span class="lords-session-name">${escapeHtml(session.name)}</span><i data-lucide="chevron-right" class="lords-chevron" style="width:16px;height:16px"></i>`;
          sessionDetails.appendChild(sessionSummary);

          const papersGrid = document.createElement('div');
          papersGrid.className = 'lords-papers-grid';
          sessionDetails.appendChild(papersGrid);

          sessionDetails.addEventListener('toggle', () => {
            if (!sessionDetails.open) return;
            if (session.sourceUrl && !session.loaded) loadRemoteSession(session, papersGrid, subject.subject);
            else renderPapers(session, papersGrid, subject.subject);
          });

          content.appendChild(sessionDetails);
        });
      }

      details.appendChild(content);
      list.appendChild(details);
    });
    subjectsContainer.appendChild(list);
    if (window.lucide) window.lucide.createIcons();
  }

  function rememberCatalogFingerprint(qualification, remoteSubjects) {
    try {
      const fingerprintSource = `${qualification}|${(remoteSubjects || []).flatMap(subject => (subject.sessions || []).map(session => `${subject.subject}:${session.name}:${session.url || ''}`)).sort().join('|')}`;
      let hash = 2166136261;
      for (let i = 0; i < fingerprintSource.length; i += 1) { hash ^= fingerprintSource.charCodeAt(i); hash = Math.imul(hash, 16777619); }
      const fingerprint = `${qualification}:${hash >>> 0}`;
      const previous = JSON.parse(localStorage.getItem('novexa_paper_catalog_latest_v1') || 'null');
      const next = previous?.fingerprint === fingerprint
        ? previous
        : { fingerprint, at: previous ? Date.now() : 0, qualification };
      localStorage.setItem('novexa_paper_catalog_latest_v1', JSON.stringify(next));
    } catch (_) {}
  }

  async function renderQualification(qualification) {
    activeQualification = qualification;
    subjectsContainer.innerHTML = '<div class="catalog-loading"><span class="catalog-spinner"></span> Loading the paper archive…</div>';
    const localStructure = await fetchLocalStructure();
    const localQual = Array.isArray(localStructure) ? localStructure.find(x => x.qualification === qualification) : null;
    // The Drive-backed structure is the authoritative lightweight catalog. Render it
    // immediately instead of blocking Browse on a slow Paper Lords request.
    renderSubjects(mergeSubjects(localQual, []));

    // Enrich only if Paper Lords responds quickly with additional sessions. An empty
    // or timed-out response must never replace or delay the verified local catalog.
    const remoteSubjects = await fetchRemoteCatalog(qualification);
    const visibleRemoteSubjects = (remoteSubjects || []).filter(subject => !isHiddenSubject(subject?.subject, qualification));
    if (visibleRemoteSubjects.some(subject => Array.isArray(subject.sessions) && subject.sessions.length)) {
      rememberCatalogFingerprint(qualification, visibleRemoteSubjects);
      renderSubjects(mergeSubjects(localQual, visibleRemoteSubjects));
    }
  }

  function init() {
    document.querySelectorAll('.qual-btn').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.qual-btn').forEach(btn => {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        renderQualification(button.dataset.qual);
      });
    });
    if (window.lucide?.createIcons) window.lucide.createIcons();
    const defaultQual = document.querySelector('.qual-btn.active')?.dataset.qual || 'IGCSE';
    renderQualification(defaultQual);
    const query = new URLSearchParams(window.location.search);
    const queryFile = query.get('file');
    if (queryFile) {
      showPaperViewer(queryFile, query.get('title') || query.get('paper') || 'Past paper', {
        subject: query.get('subject') || 'General',
        board: query.get('board') || 'Novexa Archive',
        year: query.get('year') || '',
        session: query.get('session') || '',
        paper: query.get('paper') || query.get('title') || 'Paper',
        type: query.get('type') || 'Paper'
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
