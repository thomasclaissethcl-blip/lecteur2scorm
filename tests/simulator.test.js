'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { evaluate } = require('../moodle-simulator');
const items = [
  { identifier:'sco-a', title:'SCO A', resourceType:'sco' },
  { identifier:'sco-b', title:'SCO B', resourceType:'sco' }
];
const sco = (status, score) => ({ data: {
  'cmi.core.lesson_status':status,
  'cmi.core.score.raw':score
} });
const attempt = (number, a, b) => ({number, scos:{...(a ? {'sco-a':a} : {}), ...(b ? {'sco-b':b} : {})}});
const opts = { gradeMethod:'highest', attemptMethod:'highest', statusRequired:'either', allScos:true };
test('le statut transmis distingue completed de passed', () => {
  const r = evaluate({standard:'SCORM 1.2', items, attempts:[attempt(1,sco('completed','85'))],options:{...opts,statusRequired:'passed'}});
  assert.equal(r.completion, 'incomplete');
  assert.equal(r.grade, 85);
  assert.equal(r.conditions.find(c => c.key === 'status').ok,false);
});
test('achèvement multi-SCO au travers des tentatives conformément aux règles custom', () => {
  const r = evaluate({standard:'SCORM 1.2',items,attempts:[attempt(1,sco('passed','90')),attempt(2,null,sco('completed','70'))], options:opts});
  assert.equal(r.completion, 'complete');
  assert.equal(r.trackedSCOCount,2);
});
test('moyenne sur les notes SCO, puis sur les tentatives', () => {
  const r = evaluate({standard:'SCORM 1.2',items, attempts:[attempt(1,sco('passed','50'),sco('passed','70')),attempt(2,sco('passed','80'),sco('passed','100'))],options:{gradeMethod:'average',attemptMethod:'average'}});
  assert.equal(r.grade,75);
});
test('methode objets: recompte le nombre completed/passed', () => {
  const r = evaluate({standard:'SCORM 1.2',items,attempts:[attempt(1,sco('completed',''),sco('incomplete',''))],options:{gradeMethod:'objects',statusRequired:'either'}});
  assert.equal(r.grade,1);
  assert.equal(r.maxGrade,2);
  assert.equal(r.completion,'complete');
});
test('score requis ne suffit pas pour tous les SCO', () => {
  const r = evaluate({standard:'SCORM 1.2',items,attempts:[attempt(1,sco('incomplete','90'))],options:{minScoreEnabled:true,minScore:80,allScos:true}});
  assert.equal(r.conditions.find(c=>c.key==='score').ok,true);
  assert.equal(r.conditions.find(c=>c.key==='all').ok,false);
});
test('SCORM 2004 reçoit 2 statuts distincts et un avertissement', () => {
  const r = evaluate({standard:'SCORM 2004',items:items.slice(0,1),attempts:[{number:1,scos:{'sco-a':{data:{'cmi.completion_status':'completed','cmi.success_status':'failed','cmi.score.raw':'42'}}}}],options:{statusRequired:'completed'}});
  assert.equal(r.completion,'complete');
  assert.equal(r.diagnostics.some(d=>d.kind==='warning'),true);
});
test('note absente sans tentative tracée', () => {
  const r = evaluate({standard:'SCORM 1.2',items,attempts:[attempt(1)],options:{requireGrade:true}});
  assert.equal(r.grade,null);
  assert.equal(r.completion,'incomplete');
});
test('tentative last sélectionne la dernière terminée', () => {
  const r = evaluate({standard:'SCORM 1.2',items:items.slice(0,1),attempts:[attempt(1,sco('passed','75')),attempt(2,sco('incomplete','99'))],options:{attemptMethod:'last'}});
  assert.equal(r.grade,75);
});

test('SCORM 2004 : la méthode objets tient compte de completion_status', () => {
  const r = evaluate({standard:'SCORM 2004',items:items.slice(0,1),attempts:[{number:1,scos:{'sco-a':{data:{'cmi.completion_status':'completed','cmi.success_status':'failed'}}}}],options:{gradeMethod:'objects'}});
  assert.equal(r.grade,1);
});
