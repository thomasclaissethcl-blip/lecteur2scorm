(function () {
  'use strict';

  const ERR12 = {
    0: 'No error', 101: 'General exception', 201: 'Invalid argument error', 202: 'Element cannot have children',
    203: 'Element not an array - cannot have count', 301: 'Not initialized', 401: 'Not implemented error',
    402: 'Invalid set value, element is a keyword', 403: 'Element is read only', 404: 'Element is write only', 405: 'Incorrect data type'
  };

  const ERR2004 = {
    0: 'No Error', 102: 'General Initialization Failure', 103: 'Already Initialized', 104: 'Content Instance Terminated',
    111: 'General Termination Failure', 112: 'Termination Before Initialization', 113: 'Termination After Termination',
    122: 'Retrieve Data Before Initialization', 123: 'Retrieve Data After Termination', 132: 'Store Data Before Initialization',
    133: 'Store Data After Termination', 142: 'Commit Before Initialization', 143: 'Commit After Termination',
    201: 'General Argument Error', 301: 'General Get Failure', 351: 'General Set Failure', 391: 'General Commit Failure',
    401: 'Undefined Data Model Element', 402: 'Unimplemented Data Model Element', 403: 'Data Model Element Value Not Initialized',
    404: 'Data Model Element Is Read Only', 405: 'Data Model Element Is Write Only', 406: 'Data Model Element Type Mismatch',
    407: 'Data Model Element Value Out Of Range', 408: 'Data Model Dependency Not Established'
  };

  const CHILDREN12 = {
    'cmi.core': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    'cmi.core.score': 'raw,min,max',
    'cmi.objectives': 'id,score,status',
    'cmi.objectives.n': 'id,score,status',
    'cmi.objectives.n.score': 'raw,min,max',
    'cmi.student_data': 'mastery_score,max_time_allowed,time_limit_action',
    'cmi.student_preference': 'audio,language,speed,text',
    'cmi.interactions': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency',
    'cmi.interactions.n': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency',
    'cmi.interactions.n.objectives': 'id',
    'cmi.interactions.n.correct_responses': 'pattern'
  };

  const CHILDREN2004 = {
    'cmi': '_version,comments_from_learner,comments_from_lms,completion_status,completion_threshold,credit,entry,exit,interactions,launch_data,learner_id,learner_name,learner_preference,location,max_time_allowed,mode,objectives,progress_measure,scaled_passing_score,score,session_time,success_status,suspend_data,time_limit_action,total_time',
    'cmi.score': 'scaled,raw,min,max',
    'cmi.learner_preference': 'audio_level,language,delivery_speed,audio_captioning',
    'cmi.comments_from_learner': 'comment,location,timestamp',
    'cmi.comments_from_lms': 'comment,location,timestamp',
    'cmi.interactions': 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description',
    'cmi.interactions.n': 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description',
    'cmi.interactions.n.objectives': 'id',
    'cmi.interactions.n.correct_responses': 'pattern',
    'cmi.objectives': 'id,score,success_status,completion_status,progress_measure,description',
    'cmi.objectives.n': 'id,score,success_status,completion_status,progress_measure,description',
    'cmi.objectives.n.score': 'scaled,raw,min,max',
    'cmi.comments_from_learner.n': 'comment,location,timestamp',
    'cmi.comments_from_lms.n': 'comment,location,timestamp'
  };

  function seconds12(value) {
    const m = String(value || '').match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,2}))?$/);
    if (!m) return 0;
    return (+m[1] * 3600) + (+m[2] * 60) + (+m[3]) + ((+(m[4] || 0)) / (m[4]?.length === 1 ? 10 : 100));
  }

  function format12(total) {
    total = Math.max(0, Number(total) || 0);
    let hundredths = Math.round(total * 100);
    const hours = Math.floor(hundredths / 360000); hundredths -= hours * 360000;
    const minutes = Math.floor(hundredths / 6000); hundredths -= minutes * 6000;
    const seconds = Math.floor(hundredths / 100); hundredths -= seconds * 100;
    return `${String(hours).padStart(4, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  function seconds2004(value) {
    const m = String(value || '').match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function format2004(total) {
    total = Math.max(0, Number(total) || 0);
    const hours = Math.floor(total / 3600); total -= hours * 3600;
    const minutes = Math.floor(total / 60); total -= minutes * 60;
    const seconds = Math.round(total * 100) / 100;
    return `PT${hours}H${minutes}M${seconds}S`;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  class ScormRuntime {
    constructor({ standard, packageKey, learnerId, learnerName, metadata = {}, onLog, onChange, onNavigate }) {
      this.standard = standard;
      this.packageKey = packageKey;
      this.learnerId = learnerId || 'learner-001';
      this.learnerName = learnerName || 'Apprenant Test';
      this.metadata = metadata || {};
      this.onLog = onLog || (() => {});
      this.onChange = onChange || (() => {});
      this.onNavigate = onNavigate || (() => {});
      this.initialized = false;
      this.terminated = false;
      this.lastError = 0;
      this.storageKey = `scorm-reader:v1:${this.packageKey}:${this.standard}:${this.learnerId}`;
      this.persisted = this.loadPersisted();
      this.data = this.buildInitialData();
      this.savedData = this.persisted?.data ? clone(this.persisted.data) : null;
      this.writtenKeys = new Set(this.persisted?.writtenKeys || []);
      this.dirtyKeys = new Set();
      this.lastPersistOk = null;
      this.api = this.buildApi();
      this.emitChange();
    }

    loadPersisted() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    }

    buildInitialData() {
      const previous = this.persisted?.data ? clone(this.persisted.data) : {};
      if (this.standard === 'SCORM 2004') {
        const defaults = {
          'cmi._version': '1.0', 'cmi.learner_id': this.learnerId, 'cmi.learner_name': this.learnerName,
          'cmi.location': '', 'cmi.credit': 'credit', 'cmi.entry': this.persisted ? 'resume' : 'ab-initio',
          'cmi.completion_status': 'unknown', 'cmi.success_status': 'unknown', 'cmi.mode': 'normal',
          'cmi.exit': '', 'cmi.session_time': 'PT0H0M0S', 'cmi.total_time': 'PT0H0M0S',
          'cmi.suspend_data': '', 'cmi.launch_data': '', 'cmi.score.scaled': '', 'cmi.score.raw': '',
          'cmi.score.min': '', 'cmi.score.max': '', 'cmi.progress_measure': '',
          'cmi.scaled_passing_score': this.metadata.passingScore || '', 'cmi.completion_threshold': '',
          'cmi.max_time_allowed': this.metadata.maxTimeAllowed || '', 'cmi.time_limit_action': this.metadata.timeLimitAction || '',
          'cmi.learner_preference.audio_level': '1', 'cmi.learner_preference.language': '',
          'cmi.learner_preference.delivery_speed': '1', 'cmi.learner_preference.audio_captioning': '0',
          'cmi.interactions._count': '0', 'cmi.objectives._count': '0', 'cmi.comments_from_learner._count': '0',
          'cmi.comments_from_lms._count': '0', 'adl.nav.request': '_none', 'adl.nav.request_valid.continue': 'true',
          'adl.nav.request_valid.previous': 'true'
        };
        return Object.assign(defaults, previous, {
          'cmi.learner_id': this.learnerId, 'cmi.learner_name': this.learnerName,
          'cmi.entry': this.persisted ? 'resume' : 'ab-initio', 'cmi.session_time': 'PT0H0M0S', 'cmi.exit': ''
        });
      }

      const defaults = {
        'cmi.core.student_id': this.learnerId, 'cmi.core.student_name': this.learnerName,
        'cmi.core.lesson_location': '', 'cmi.core.credit': 'credit', 'cmi.core.lesson_status': 'not attempted',
        'cmi.core.entry': this.persisted ? 'resume' : 'ab-initio', 'cmi.core.score.raw': '', 'cmi.core.score.min': '',
        'cmi.core.score.max': '', 'cmi.core.total_time': '0000:00:00.00', 'cmi.core.lesson_mode': 'normal',
        'cmi.core.exit': '', 'cmi.core.session_time': '0000:00:00.00', 'cmi.suspend_data': '', 'cmi.launch_data': '',
        'cmi.comments': '', 'cmi.comments_from_lms': '', 'cmi.objectives._count': '0', 'cmi.interactions._count': '0',
        'cmi.student_data.mastery_score': this.metadata.passingScore || '',
        'cmi.student_data.max_time_allowed': this.metadata.maxTimeAllowed || '',
        'cmi.student_data.time_limit_action': this.metadata.timeLimitAction || '',
        'cmi.student_preference.audio': '0', 'cmi.student_preference.language': '', 'cmi.student_preference.speed': '0',
        'cmi.student_preference.text': '0'
      };
      return Object.assign(defaults, previous, {
        'cmi.core.student_id': this.learnerId, 'cmi.core.student_name': this.learnerName,
        'cmi.core.entry': this.persisted ? 'resume' : 'ab-initio', 'cmi.core.session_time': '0000:00:00.00', 'cmi.core.exit': ''
      });
    }

    setError(code) { this.lastError = Number(code) || 0; }

    log(method, args, result) {
      this.onLog({ time: new Date(), method, args: Array.from(args || []), result: String(result), errorCode: this.lastError });
      return result;
    }

    emitChange() { this.onChange(clone(this.data), this.getStorageState()); }

    getStorageState() {
      return { savedData: this.savedData ? clone(this.savedData) : null,
        dirtyKeys: Array.from(this.dirtyKeys), writtenKeys: Array.from(this.writtenKeys),
        lastPersistOk: this.lastPersistOk };
    }

    markWritten(element) {
      this.writtenKeys.add(element);
      this.dirtyKeys.add(element);
    }

    persist() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({ savedAt: new Date().toISOString(),
          data: this.data, writtenKeys: Array.from(this.writtenKeys) }));
        this.savedData = clone(this.data);
        this.dirtyKeys.clear();
        this.lastPersistOk = true;
        this.emitChange();
        return true;
      } catch {
        this.lastPersistOk = false;
        this.emitChange();
        return false;
      }
    }

    reset() {
      try { localStorage.removeItem(this.storageKey); } catch {}
      this.persisted = null;
      this.initialized = false;
      this.terminated = false;
      this.lastError = 0;
      this.data = this.buildInitialData();
      this.savedData = null;
      this.writtenKeys.clear();
      this.dirtyKeys.clear();
      this.lastPersistOk = null;
      this.emitChange();
    }

    forceSet(element, value) {
      this.data[String(element)] = String(value);
      this.updateCollectionCount(String(element));
      this.markWritten(String(element));
      this.setError(0);
      this.emitChange();
      this.log('SIM:modifier', [String(element), String(value)], 'true');
    }

    buildApi() {
      if (this.standard === 'SCORM 2004') {
        return {
          Initialize: arg => this.initialize2004(arg),
          Terminate: arg => this.terminate2004(arg),
          GetValue: arg => this.getValue2004(arg),
          SetValue: (a, b) => this.setValue2004(a, b),
          Commit: arg => this.commit2004(arg),
          GetLastError: () => this.log('GetLastError', [], String(this.lastError)),
          GetErrorString: code => this.log('GetErrorString', [code], ERR2004[Number(code)] || 'Unknown error'),
          GetDiagnostic: code => this.log('GetDiagnostic', [code], ERR2004[Number(code || this.lastError)] || 'Unknown diagnostic')
        };
      }
      return {
        LMSInitialize: arg => this.initialize12(arg),
        LMSFinish: arg => this.finish12(arg),
        LMSGetValue: arg => this.getValue12(arg),
        LMSSetValue: (a, b) => this.setValue12(a, b),
        LMSCommit: arg => this.commit12(arg),
        LMSGetLastError: () => this.log('LMSGetLastError', [], String(this.lastError)),
        LMSGetErrorString: code => this.log('LMSGetErrorString', [code], ERR12[Number(code)] || 'Unknown error'),
        LMSGetDiagnostic: code => this.log('LMSGetDiagnostic', [code], ERR12[Number(code || this.lastError)] || 'Unknown diagnostic')
      };
    }

    initialize12(arg) {
      if (String(arg || '') !== '') { this.setError(201); return this.log('LMSInitialize', arguments, 'false'); }
      if (this.initialized && !this.terminated) { this.setError(101); return this.log('LMSInitialize', arguments, 'false'); }
      this.initialized = true; this.terminated = false; this.setError(0); this.emitChange();
      return this.log('LMSInitialize', arguments, 'true');
    }

    finish12(arg) {
      if (!this.initialized || this.terminated) { this.setError(301); return this.log('LMSFinish', arguments, 'false'); }
      if (String(arg || '') !== '') { this.setError(201); return this.log('LMSFinish', arguments, 'false'); }
      this.accumulateTime12();
      const ok = this.persist(); this.terminated = true; this.setError(ok ? 0 : 101); this.emitChange();
      return this.log('LMSFinish', arguments, ok ? 'true' : 'false');
    }

    getValue12(element) {
      element = String(element || '');
      if (!this.initialized || this.terminated) { this.setError(301); return this.log('LMSGetValue', arguments, ''); }
      if (!element) { this.setError(201); return this.log('LMSGetValue', arguments, ''); }
      if (element.endsWith('._children')) {
        const parent = element.slice(0, -10).replace(/\.\d+(?=\.|$)/g, '.n');
        this.setError(0); return this.log('LMSGetValue', arguments, CHILDREN12[parent] || '');
      }
      if (element.endsWith('._count') && this.isSupportedCount(element)) {
        this.setError(0); return this.log('LMSGetValue', arguments, this.data[element] || '0');
      }
      if (this.isWriteOnly12(element)) { this.setError(404); return this.log('LMSGetValue', arguments, ''); }
      if (Object.prototype.hasOwnProperty.call(this.data, element)) { this.setError(0); return this.log('LMSGetValue', arguments, this.data[element]); }
      if (this.isSupportedDynamic12(element)) { this.setError(0); return this.log('LMSGetValue', arguments, ''); }
      this.setError(401); return this.log('LMSGetValue', arguments, '');
    }

    setValue12(element, value) {
      element = String(element || ''); value = String(value ?? '');
      if (!this.initialized || this.terminated) { this.setError(301); return this.log('LMSSetValue', arguments, 'false'); }
      if (!element) { this.setError(201); return this.log('LMSSetValue', arguments, 'false'); }
      if (element.endsWith('._children') || element.endsWith('._count')) { this.setError(402); return this.log('LMSSetValue', arguments, 'false'); }
      if (this.isReadOnly12(element)) { this.setError(403); return this.log('LMSSetValue', arguments, 'false'); }
      if (!this.isSupportedDynamic12(element) && !Object.prototype.hasOwnProperty.call(this.data, element)) {
        this.setError(401); return this.log('LMSSetValue', arguments, 'false');
      }
      this.data[element] = value; this.updateCollectionCount(element); this.markWritten(element); this.setError(0); this.emitChange();
      return this.log('LMSSetValue', arguments, 'true');
    }

    commit12(arg) {
      if (!this.initialized || this.terminated) { this.setError(301); return this.log('LMSCommit', arguments, 'false'); }
      if (String(arg || '') !== '') { this.setError(201); return this.log('LMSCommit', arguments, 'false'); }
      const ok = this.persist(); this.setError(ok ? 0 : 101); return this.log('LMSCommit', arguments, ok ? 'true' : 'false');
    }

    initialize2004(arg) {
      if (String(arg || '') !== '') { this.setError(201); return this.log('Initialize', arguments, 'false'); }
      if (this.initialized && !this.terminated) { this.setError(103); return this.log('Initialize', arguments, 'false'); }
      if (this.terminated) { this.setError(104); return this.log('Initialize', arguments, 'false'); }
      this.initialized = true; this.setError(0); this.emitChange();
      return this.log('Initialize', arguments, 'true');
    }

    terminate2004(arg) {
      if (String(arg || '') !== '') { this.setError(201); return this.log('Terminate', arguments, 'false'); }
      if (!this.initialized) { this.setError(112); return this.log('Terminate', arguments, 'false'); }
      if (this.terminated) { this.setError(113); return this.log('Terminate', arguments, 'false'); }
      this.accumulateTime2004();
      const ok = this.persist(); this.terminated = true; this.setError(ok ? 0 : 391); this.emitChange();
      const result = this.log('Terminate', arguments, ok ? 'true' : 'false');
      const request = this.data['adl.nav.request'];
      if (request && request !== '_none') setTimeout(() => this.onNavigate(request), 0);
      return result;
    }

    getValue2004(element) {
      element = String(element || '');
      if (!this.initialized) { this.setError(122); return this.log('GetValue', arguments, ''); }
      if (this.terminated) { this.setError(123); return this.log('GetValue', arguments, ''); }
      if (!element) { this.setError(201); return this.log('GetValue', arguments, ''); }
      if (element.endsWith('._children')) {
        const parent = element.slice(0, -10).replace(/\.\d+(?=\.|$)/g, '.n');
        this.setError(0); return this.log('GetValue', arguments, CHILDREN2004[parent] || '');
      }
      if (element.endsWith('._count') && this.isSupportedCount(element)) {
        this.setError(0); return this.log('GetValue', arguments, this.data[element] || '0');
      }
      if (this.isWriteOnly2004(element)) { this.setError(405); return this.log('GetValue', arguments, ''); }
      if (element.startsWith('adl.nav.request_valid.choice.')) { this.setError(0); return this.log('GetValue', arguments, 'true'); }
      if (Object.prototype.hasOwnProperty.call(this.data, element)) { this.setError(0); return this.log('GetValue', arguments, this.data[element]); }
      if (this.isSupportedDynamic2004(element)) { this.setError(0); return this.log('GetValue', arguments, ''); }
      this.setError(401); return this.log('GetValue', arguments, '');
    }

    setValue2004(element, value) {
      element = String(element || ''); value = String(value ?? '');
      if (!this.initialized) { this.setError(132); return this.log('SetValue', arguments, 'false'); }
      if (this.terminated) { this.setError(133); return this.log('SetValue', arguments, 'false'); }
      if (!element) { this.setError(201); return this.log('SetValue', arguments, 'false'); }
      if (element.endsWith('._children') || element.endsWith('._count')) { this.setError(404); return this.log('SetValue', arguments, 'false'); }
      if (this.isReadOnly2004(element)) { this.setError(404); return this.log('SetValue', arguments, 'false'); }
      if (!this.isSupportedDynamic2004(element) && !Object.prototype.hasOwnProperty.call(this.data, element)) {
        this.setError(401); return this.log('SetValue', arguments, 'false');
      }
      this.data[element] = value; this.updateCollectionCount(element); this.markWritten(element); this.setError(0); this.emitChange();
      return this.log('SetValue', arguments, 'true');
    }

    commit2004(arg) {
      if (!this.initialized) { this.setError(142); return this.log('Commit', arguments, 'false'); }
      if (this.terminated) { this.setError(143); return this.log('Commit', arguments, 'false'); }
      if (String(arg || '') !== '') { this.setError(201); return this.log('Commit', arguments, 'false'); }
      const ok = this.persist(); this.setError(ok ? 0 : 391); return this.log('Commit', arguments, ok ? 'true' : 'false');
    }

    isReadOnly12(element) {
      return /^(cmi\.core\.(student_id|student_name|credit|entry|total_time|lesson_mode)|cmi\.student_data\.|cmi\.launch_data|cmi\.comments_from_lms)/.test(element);
    }
    isWriteOnly12(element) { return element === 'cmi.core.exit' || element === 'cmi.core.session_time'; }
    isSupportedDynamic12(element) {
      return /^cmi\.(interactions|objectives)\.\d+\./.test(element) || /^cmi\.interactions\.\d+\.(objectives|correct_responses)\.\d+\./.test(element);
    }

    isReadOnly2004(element) {
      return /^(cmi\.(_version|learner_id|learner_name|credit|entry|mode|total_time|launch_data|max_time_allowed|time_limit_action|scaled_passing_score|completion_threshold)|cmi\.comments_from_lms\.)/.test(element)
        || /^adl\.nav\.request_valid/.test(element);
    }
    isWriteOnly2004(element) { return element === 'cmi.exit' || element === 'cmi.session_time' || element === 'adl.nav.request'; }
    isSupportedDynamic2004(element) {
      return /^cmi\.(interactions|objectives|comments_from_learner|comments_from_lms)\.\d+\./.test(element)
        || /^cmi\.interactions\.\d+\.(objectives|correct_responses)\.\d+\./.test(element)
        || /^adl\.nav\./.test(element);
    }

    isSupportedCount(element) {
      return /^cmi\.(interactions|objectives|comments_from_learner|comments_from_lms)\._count$/.test(element)
        || /^cmi\.interactions\.\d+\.(objectives|correct_responses)\._count$/.test(element);
    }

    updateCollectionCount(element) {
      const m = element.match(/^cmi\.(interactions|objectives|comments_from_learner|comments_from_lms)\.(\d+)\./);
      if (m) {
        const key = `cmi.${m[1]}._count`;
        const next = Math.max(Number(this.data[key] || 0), Number(m[2]) + 1);
        this.data[key] = String(next);
      }
      const nested = element.match(/^cmi\.interactions\.(\d+)\.(objectives|correct_responses)\.(\d+)\./);
      if (nested) {
        const key = `cmi.interactions.${nested[1]}.${nested[2]}._count`;
        const next = Math.max(Number(this.data[key] || 0), Number(nested[3]) + 1);
        this.data[key] = String(next);
      }
    }

    accumulateTime12() {
      const session = seconds12(this.data['cmi.core.session_time']);
      const total = seconds12(this.data['cmi.core.total_time']);
      this.data['cmi.core.total_time'] = format12(total + session);
      this.data['cmi.core.session_time'] = '0000:00:00.00';
    }

    accumulateTime2004() {
      const session = seconds2004(this.data['cmi.session_time']);
      const total = seconds2004(this.data['cmi.total_time']);
      this.data['cmi.total_time'] = format2004(total + session);
      this.data['cmi.session_time'] = 'PT0H0M0S';
    }
  }

  window.ScormRuntime = ScormRuntime;
})();
