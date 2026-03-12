/* ============================================================
   SiteScribe AI — Frontend JavaScript
   ============================================================ */

(() => {
  'use strict';

  // ---- State ----
  let photoFiles = [];          // File objects to upload
  let audioBlob = null;         // Recorded or uploaded audio blob
  let audioFileName = '';        // Display name
  let mediaRecorder = null;
  let recordingChunks = [];
  let recordingTimer = null;
  let recordingStart = 0;
  let elapsedTimer = null;
  let pipelineStart = 0;

  // ---- DOM Elements ----
  const uploadSection   = document.getElementById('upload-section');
  const progressSection = document.getElementById('progress-section');
  const reportSection   = document.getElementById('report-section');

  const uploadForm    = document.getElementById('upload-form');
  const submitBtn     = document.getElementById('submit-btn');
  const dropZone      = document.getElementById('drop-zone');
  const photoInput    = document.getElementById('photo-input');
  const photoPreviews = document.getElementById('photo-previews');

  const recordBtn     = document.getElementById('record-btn');
  const uploadAudioBtn = document.getElementById('upload-audio-btn');
  const audioInput    = document.getElementById('audio-input');
  const voiceControls = document.getElementById('voice-controls');
  const recordingState = document.getElementById('recording-state');
  const playbackState = document.getElementById('playback-state');
  const stopBtn       = document.getElementById('stop-btn');
  const recTimer      = document.getElementById('rec-timer');
  const audioPlayer   = document.getElementById('audio-player');
  const audioFilename = document.getElementById('audio-filename');
  const reRecordBtn   = document.getElementById('re-record-btn');
  const removeAudioBtn = document.getElementById('remove-audio-btn');

  const progressSteps = document.getElementById('progress-steps');
  const elapsedTimeEl = document.getElementById('elapsed-time');
  const progressDesc  = document.getElementById('progress-desc');

  const reportPreview = document.getElementById('report-preview');
  const downloadBtn   = document.getElementById('download-btn');
  const newReportBtn  = document.getElementById('new-report-btn');

  // ---- Photo Upload ----
  function updateSubmitBtn() {
    submitBtn.disabled = photoFiles.length === 0;
  }

  function addPhotos(files) {
    for (const file of files) {
      if (!file.type.match(/^image\/(jpeg|png)$/)) continue;
      if (photoFiles.length >= 20) break;
      // Avoid duplicates by name+size
      if (photoFiles.some(f => f.name === file.name && f.size === file.size)) continue;
      photoFiles.push(file);
    }
    renderPhotoPreviews();
    updateSubmitBtn();
  }

  function removePhoto(idx) {
    photoFiles.splice(idx, 1);
    renderPhotoPreviews();
    updateSubmitBtn();
  }

  function renderPhotoPreviews() {
    photoPreviews.innerHTML = '';
    photoFiles.forEach((file, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      thumb.appendChild(img);

      const btn = document.createElement('button');
      btn.className = 'remove-photo';
      btn.innerHTML = '&times;';
      btn.title = 'Remove';
      btn.onclick = (e) => { e.stopPropagation(); removePhoto(idx); };
      thumb.appendChild(btn);

      photoPreviews.appendChild(thumb);
    });
  }

  // Drag and drop
  dropZone.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    if (photoInput.files.length) addPhotos(photoInput.files);
    photoInput.value = '';
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files);
  });

  // ---- Voice Recording ----
  function showVoiceState(state) {
    voiceControls.hidden  = state !== 'idle';
    recordingState.hidden = state !== 'recording';
    playbackState.hidden  = state !== 'playback';
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  recordBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        audioBlob = new Blob(recordingChunks, { type: 'audio/webm' });
        audioFileName = `voice_note_${Date.now()}.webm`;
        setAudioPlayback(audioBlob, audioFileName);
      };

      mediaRecorder.start();
      recordingStart = Date.now();
      showVoiceState('recording');
      recordingTimer = setInterval(() => {
        recTimer.textContent = formatTime((Date.now() - recordingStart) / 1000);
      }, 200);
    } catch (err) {
      alert('Could not access microphone. Please allow microphone access or upload an audio file instead.');
    }
  });

  stopBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    clearInterval(recordingTimer);
  });

  function setAudioPlayback(blob, name) {
    const url = URL.createObjectURL(blob);
    audioPlayer.src = url;
    audioFilename.textContent = name;
    showVoiceState('playback');
  }

  uploadAudioBtn.addEventListener('click', () => audioInput.click());
  audioInput.addEventListener('change', () => {
    const file = audioInput.files[0];
    if (file) {
      audioBlob = file;
      audioFileName = file.name;
      setAudioPlayback(file, file.name);
    }
    audioInput.value = '';
  });

  reRecordBtn.addEventListener('click', () => {
    audioBlob = null;
    audioFileName = '';
    showVoiceState('idle');
  });

  removeAudioBtn.addEventListener('click', () => {
    audioBlob = null;
    audioFileName = '';
    showVoiceState('idle');
  });

  // ---- Form Submission ----
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (photoFiles.length === 0) return;

    const projectName = document.getElementById('project-name').value.trim() || 'Project';
    const companyName = document.getElementById('company-name').value.trim() || 'Construction Co.';

    const formData = new FormData();
    formData.append('project_name', projectName);
    formData.append('company_name', companyName);
    photoFiles.forEach(f => formData.append('photos', f));
    if (audioBlob) {
      formData.append('voice_note', audioBlob, audioFileName);
    }

    // Show progress section
    uploadSection.hidden = true;
    progressSection.hidden = false;
    reportSection.hidden = true;

    buildProgressSteps(audioBlob !== null, photoFiles.length);
    startElapsedTimer();

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const { job_id } = await res.json();
      listenForProgress(job_id);
    } catch (err) {
      progressDesc.textContent = `Error: ${err.message}`;
    }
  });

  // ---- Progress Tracking ----
  const STEPS = [];

  function buildProgressSteps(hasVoice, photoCount) {
    STEPS.length = 0;
    if (hasVoice) STEPS.push({ id: 'transcribing', label: 'Transcribe voice note' });
    STEPS.push({ id: 'analyzing', label: `Analyze photos (0/${photoCount})`, photoCount });
    STEPS.push({ id: 'synthesizing', label: 'Synthesize report narrative' });
    STEPS.push({ id: 'generating_pdf', label: 'Generate PDF' });

    progressSteps.innerHTML = '';
    STEPS.forEach(step => {
      const el = document.createElement('div');
      el.className = 'progress-step';
      el.id = `step-${step.id}`;
      el.innerHTML = `
        <div class="step-icon"><span class="step-num"></span></div>
        <span class="step-label">${step.label}</span>
      `;
      progressSteps.appendChild(el);
    });
  }

  function setStepState(stepId, state, labelOverride) {
    const el = document.getElementById(`step-${stepId}`);
    if (!el) return;

    el.classList.remove('active', 'done');
    const icon = el.querySelector('.step-icon');

    if (state === 'active') {
      el.classList.add('active');
      icon.innerHTML = '<div class="spinner"></div>';
    } else if (state === 'done') {
      el.classList.add('done');
      icon.innerHTML = '<span class="check-icon">✓</span>';
    } else {
      icon.innerHTML = '<span class="step-num"></span>';
    }

    if (labelOverride) {
      el.querySelector('.step-label').textContent = labelOverride;
    }
  }

  function startElapsedTimer() {
    pipelineStart = Date.now();
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - pipelineStart) / 1000);
      if (secs < 60) {
        elapsedTimeEl.textContent = `${secs}s elapsed`;
      } else {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        elapsedTimeEl.textContent = `${m}m ${s}s elapsed`;
      }
    }, 1000);
  }

  function listenForProgress(jobId) {
    const source = new EventSource(`/api/progress/${jobId}`);
    let currentStepIdx = -1;

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const stage = data.stage;

      if (stage === 'transcribing') {
        activateStep('transcribing');
      } else if (stage === 'transcribing_done') {
        setStepState('transcribing', 'done');
      } else if (stage === 'analyzing') {
        // First analyzing event marks transcription as done (if exists)
        if (data.photo === 1) {
          setStepState('transcribing', 'done');
        }
        activateStep('analyzing');
        const stepEl = document.getElementById('step-analyzing');
        if (stepEl) {
          stepEl.querySelector('.step-label').textContent =
            `Analyze photos (${data.photo}/${data.total})`;
        }
      } else if (stage === 'synthesizing') {
        setStepState('analyzing', 'done');
        activateStep('synthesizing');
      } else if (stage === 'generating_pdf') {
        setStepState('synthesizing', 'done');
        activateStep('generating_pdf');
      } else if (stage === 'complete') {
        setStepState('generating_pdf', 'done');
        clearInterval(elapsedTimer);
        source.close();
        showReport(data);
      } else if (stage === 'error') {
        clearInterval(elapsedTimer);
        source.close();
        progressDesc.textContent = data.message;
        progressDesc.style.color = '#C0392B';
      }
    };

    source.onerror = () => {
      source.close();
    };

    function activateStep(stepId) {
      const idx = STEPS.findIndex(s => s.id === stepId);
      if (idx > currentStepIdx) {
        currentStepIdx = idx;
        setStepState(stepId, 'active');
      }
    }
  }

  // ---- Report Preview ----
  function showReport(data) {
    progressSection.hidden = true;
    reportSection.hidden = false;

    downloadBtn.href = data.pdf_url;
    const report = data.report;
    renderReport(report);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderReport(r) {
    let html = '';

    // Banner
    html += `<div class="rpt-banner">
      <h3>${escapeHtml(r.company_name)}</h3>
      <p>Daily Construction Report</p>
    </div>`;

    // Meta
    html += `<div class="rpt-meta">
      <div class="rpt-meta-item"><label>Project</label><p>${escapeHtml(r.project_name)}</p></div>
      <div class="rpt-meta-item"><label>Date</label><p>${escapeHtml(r.date)}</p></div>
      <div class="rpt-meta-item"><label>Weather</label><p>${escapeHtml(r.weather_summary)}</p></div>
      <div class="rpt-meta-item"><label>Crew</label><p>${escapeHtml(r.crew_summary)}</p></div>
    </div>`;

    // Work Summary
    if (r.work_performed && r.work_performed.length) {
      html += `<div class="rpt-section"><h4>Work Summary</h4>
        <table class="work-table">
          <thead><tr><th>Area</th><th>Description</th><th>Status</th></tr></thead>
          <tbody>`;
      r.work_performed.forEach(w => {
        const statusClass = w.status.toLowerCase().replace(/\s+/g, '-');
        html += `<tr>
          <td>${escapeHtml(w.area)}</td>
          <td>${escapeHtml(w.description)}</td>
          <td><span class="status-badge ${statusClass}">${escapeHtml(w.status)}</span></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Crew & Equipment
    html += `<div class="rpt-section"><h4>Crew &amp; Equipment</h4>
      <p class="rpt-text">${escapeHtml(r.crew_summary)}</p>`;
    if (r.equipment_on_site && r.equipment_on_site.length) {
      html += `<ul class="rpt-list" style="margin-top:8px">`;
      r.equipment_on_site.forEach(e => { html += `<li>${escapeHtml(e)}</li>`; });
      html += `</ul>`;
    }
    html += `</div>`;

    // Materials
    if (r.materials_used && r.materials_used.length) {
      html += `<div class="rpt-section"><h4>Materials Observed</h4>
        <ul class="rpt-list">`;
      r.materials_used.forEach(m => { html += `<li>${escapeHtml(m)}</li>`; });
      html += `</ul></div>`;
    }

    // Safety Observations
    if (r.safety_observations && r.safety_observations.length) {
      html += `<div class="rpt-section"><h4>Safety Observations</h4>`;
      r.safety_observations.forEach(s => {
        const cls = s.type === 'concern' ? 'concern' : 'positive';
        const label = s.type === 'concern' ? 'CONCERN' : 'POSITIVE';
        html += `<div class="safety-card ${cls}">
          <div class="safety-label">${label}</div>
          <p>${escapeHtml(s.description)}</p>`;
        if (s.type === 'concern' && s.action_needed && s.action_needed.toLowerCase() !== 'none') {
          html += `<p class="safety-action">Action Needed: ${escapeHtml(s.action_needed)}</p>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }

    // Issues & Delays
    if (r.issues_and_delays && r.issues_and_delays.length) {
      html += `<div class="rpt-section"><h4>Issues &amp; Delays</h4>
        <ul class="rpt-list">`;
      r.issues_and_delays.forEach(i => { html += `<li>${escapeHtml(i)}</li>`; });
      html += `</ul></div>`;
    }

    // Photo Documentation
    if (r.photos_with_captions && r.photos_with_captions.length) {
      html += `<div class="rpt-section"><h4>Photo Documentation</h4>
        <div class="rpt-photos">`;
      r.photos_with_captions.forEach(p => {
        html += `<div class="rpt-photo-card">
          <div class="photo-placeholder">${escapeHtml(p.filename)}</div>
          <div class="caption">${escapeHtml(p.caption)}</div>
        </div>`;
      });
      html += `</div></div>`;
    }

    // Next Day Plan
    if (r.next_day_plan) {
      html += `<div class="rpt-section"><h4>Next Day Plan</h4>
        <div class="rpt-plan">${escapeHtml(r.next_day_plan)}</div>
      </div>`;
    }

    // Disclaimer
    html += `<div class="rpt-section">
      <div class="rpt-disclaimer">This report was generated using AI-assisted analysis. Verify all observations on site.</div>
    </div>`;

    reportPreview.innerHTML = html;
  }

  // ---- New Report ----
  newReportBtn.addEventListener('click', () => {
    // Reset state
    photoFiles = [];
    audioBlob = null;
    audioFileName = '';
    renderPhotoPreviews();
    updateSubmitBtn();
    showVoiceState('idle');
    reportSection.hidden = true;
    progressSection.hidden = true;
    uploadSection.hidden = false;
    progressDesc.textContent = 'Please wait while we analyze your photos and generate the report...';
    progressDesc.style.color = '';
  });

})();
