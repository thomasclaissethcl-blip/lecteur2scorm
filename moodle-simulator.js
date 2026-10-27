/* Simulation indicative basée sur Moodle 4.5 (MOODLE_405_STABLE) :
 * mod/scorm/locallib.php : scorm_grade_user_attempt, scorm_grade_user
 * mod/scorm/classes/completion/custom_completion.php : get_state
 * mod/scorm/lib.php : scorm_grade_item_update
 * Ne représente ni une connexion Moodle ni une garantie de synchronisation DB. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MoodleSimulator = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const defaults = Object.freeze({
    gradeMethod: 'highest', attemptMethod: 'highest', maxGrade: 100,
    statusRequired: 'none', allScos: false, minScoreEnabled: false, minScore: 80,
    requireGrade: false, passGradeEnabled: false, passGrade: 50, requireView: false
  });
  const complete = value => value === 'passed' || value === 'completed';
  const isFiniteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

  const validStatus = value => value === 'passed' || value === 'completed';
  function values(entry) { return entry?.data || {}; }
  function getStatus(data, standard) {
    if (standard === 'SCORM 2004') {
      return { completion: data['cmi.completion_status'] || 'unknown', success: data['cmi.success_status'] || 'unknown',
        status: data['cmi.success_status'] === 'passed' || data['cmi.success_status'] === 'failed'
          ? data['cmi.success_status'] : (data['cmi.completion_status'] || 'unknown') };
    }
    const status = data['cmi.core.lesson_status'] || 'not attempted';
    return { completion: status, success: status, status };
  }
  function getScore(data, standard) {
    const key = standard === 'SCORM 2004' ? 'cmi.score.raw' : 'cmi.core.score.raw';
    return isFiniteNumber(data[key]) ? Number(data[key]) : null;
  }
  function summarizeAttempt(attempt, items, standard, method) {
    const rows = items.map(item => {
      const data = values(attempt?.scos?.[item.identifier]);
      const statuses = getStatus(data, standard);
      return { id: item.identifier, title: item.title, type: item.resourceType, score: getScore(data, standard), ...statuses,
        tracked: Boolean(attempt?.scos?.[item.identifier]) };
    });
    // Moodle scorm_format_interactions uses cmi.completion_status (not success_status)
    // for its normalized status on SCORM 2004.
    const completed = rows.filter(r => complete(standard === 'SCORM 2004' ? r.completion : r.status)).length;
    // Moodle's scorm_grade_user_attempt counts a 0 raw score as empty for package type != sco.
    const gradedRows = rows.filter(r => r.score !== null && r.score !== 0);
    const total = gradedRows.reduce((sum, row) => sum + row.score, 0);
    let grade;
    switch (method) {
      case 'objects': grade = completed; break;
      case 'average': grade = gradedRows.length ? total / gradedRows.length : 0; break;
      case 'sum': grade = total; break;
      default: grade = gradedRows.length ? Math.max(0, ...gradedRows.map(r => r.score)) : 0;
    }
    return { number: attempt.number, rows, grade, completed, scored: gradedRows.length,
      hasAnyTrack: rows.some(r => r.tracked) };
  }
  function evaluate(input) {
    const options = { ...defaults, ...(input.options || {}) };
    const items = (input.items || []).filter(item => item.resourceType?.toLowerCase() !== 'asset');
    const attempts = (input.attempts || []).map(attempt => summarizeAttempt(attempt, items, input.standard, options.gradeMethod));
    const attempted = attempts.filter(a => a.hasAnyTrack);
    const grades = attempted.map(a => a.grade);
    let grade = null;
    if (grades.length) {
      switch (options.attemptMethod) {
        case 'first': grade = grades[0]; break;
        case 'last': {
          // Moodle selects the last attempt containing 'completed' or 'passed', fallback to attempt 1.
          const done = attempted.filter(a => a.rows.some(r => complete(r.status)));
          grade = (done.length ? done[done.length - 1] : (attempted.find(a => a.number === 1) || attempted[0])).grade;
          break;
        }
        case 'average': grade = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length); break;
        default: grade = Math.max(0, ...grades);
      }
    }
    const maxGrade = options.gradeMethod === 'objects' ? items.length : Math.max(0, Number(options.maxGrade) || 0);
    const gradebookGrade = grade === null ? null : Math.max(0, Math.min(maxGrade, grade));
    const tracks = [];
    attempts.forEach(attempt => attempt.rows.forEach(row => { if (row.tracked) tracks.push(row); }));
    const foundStatuses = tracks.flatMap(row => [row.status, row.completion, row.success]).filter(validStatus);
    const validScore = tracks.some(row => row.score !== null && row.score >= Number(options.minScore));
    const allScos = items.every(item => tracks.some(row => row.id === item.identifier &&
      [row.status, row.completion, row.success].some(validStatus)));
    const foundStatus = options.statusRequired === 'either' ? foundStatuses.length > 0 :
      foundStatuses.includes(options.statusRequired);
    const conditions = [];
    if (options.statusRequired !== 'none') conditions.push({ key: 'status', label: 'Statut ' + ({ passed:'passed', completed:'completed', either:'passed ou completed' }[options.statusRequired] || ''), ok: foundStatus });
    if (options.allScos) conditions.push({ key: 'all', label: `Tous les SCO (${items.length})`, ok: allScos });
    if (options.minScoreEnabled) conditions.push({ key: 'score', label: `Score brut ≥ ${options.minScore}`, ok: validScore });
    if (options.requireGrade) conditions.push({ key: 'grade', label: 'Recevoir une note', ok: gradebookGrade !== null });
    if (options.passGradeEnabled) conditions.push({ key: 'pass', label: `Note Moodle ≥ ${options.passGrade} / ${maxGrade}`, ok: gradebookGrade !== null && gradebookGrade >= Number(options.passGrade) });
    if (options.requireView) conditions.push({ key: 'view', label: 'Consultation de l’activité (simulation)', ok: Boolean(input.viewed) });
    const diagnostics = [];
    if (input.standard === 'SCORM 2004') diagnostics.push({ kind:'warning', text:'Moodle 4.5 ne prend pas en charge intégralement SCORM 2004 : résultat indicatif.' });
    if (items.some(item => !item.resourceType)) diagnostics.push({ kind:'info', text:'Type de certaines ressources non spécifié : elles sont considérées comme SCO.' });
    if (tracks.some(row => row.score !== null && !validStatus(row.status))) diagnostics.push({ kind:'info', text:'Un score a été transmis sans statut final « completed » ou « passed ».' });
    if (tracks.some(row => row.score === 0)) diagnostics.push({ kind:'info', text:'Moodle 4.5 peut ignorer un score brut égal à 0 dans certaines méthodes de notation.' });
    if (input.pending) diagnostics.push({ kind:'warning', text:'Des écritures SCORM ne sont pas encore validées par Commit/Finish. La vue « en cours » est une projection.' });
    if (input.commitError) diagnostics.push({ kind:'warning', text:'Dernière tentative de validation non enregistrée : vérifiez le stockage du navigateur.' });
    if (!input.ended && input.initialized && input.pending) diagnostics.push({ kind:'info', text:'Session ouverte : certains SCORM envoient le statut final seulement lors de la sortie.' });
    if (options.passGradeEnabled && Number(options.passGrade) > maxGrade) diagnostics.push({ kind:'warning', text:'La note de passage configurée est supérieure à la note maximale.' });
    if (options.minScoreEnabled && !isFiniteNumber(options.minScore)) diagnostics.push({ kind:'warning', text:'Le score minimal doit être un nombre.' });
    return {
      attempts, maxGrade, grade, gradebookGrade, conditions,
      completion: conditions.length ? (conditions.every(c => c.ok) ? 'complete' : 'incomplete') : 'not-configured',
      allScos, foundStatuses, diagnostics, trackedSCOCount: new Set(tracks.map(t => t.id)).size,
      totalSCOCount: items.length
    };
  }
  return { defaults, evaluate, getStatus, getScore };
});
