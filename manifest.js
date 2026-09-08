(function () {
  'use strict';

  function childrenByLocalName(node, name) {
    return Array.from(node?.children || []).filter(el => el.localName === name);
  }

  function firstChild(node, name) {
    return childrenByLocalName(node, name)[0] || null;
  }

  function descendants(node, name) {
    return Array.from(node?.getElementsByTagName('*') || []).filter(el => el.localName === name);
  }

  function textOf(node) {
    return (node?.textContent || '').trim();
  }

  function attrByLocalName(el, localName) {
    if (!el) return '';
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.localName === localName) return attr.value;
    }
    return '';
  }

  function dirname(path) {
    const clean = window.normalizeScormPath(path);
    const idx = clean.lastIndexOf('/');
    return idx < 0 ? '' : clean.slice(0, idx + 1);
  }

  function joinPath(...parts) {
    return window.normalizeScormPath(parts.filter(Boolean).join('/'));
  }

  function resolveRelative(baseFile, relative, extraBase) {
    const rel = String(relative || '').trim();
    if (!rel) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('//')) return rel;
    const [pathPart, suffix = ''] = rel.split(/(?=[?#])/s, 2);
    const joined = joinPath(dirname(baseFile), extraBase || '', pathPart || '');
    return joined + suffix;
  }

  function parseStandard(doc) {
    const schema = descendants(doc.documentElement, 'schema').map(textOf).join(' ').toLowerCase();
    const schemaVersion = descendants(doc.documentElement, 'schemaversion').map(textOf).join(' ').toLowerCase();
    const raw = `${schema} ${schemaVersion}`;
    if (raw.includes('2004') || raw.includes('1.3')) return 'SCORM 2004';
    if (raw.includes('1.2')) return 'SCORM 1.2';

    const rootXml = new XMLSerializer().serializeToString(doc.documentElement).toLowerCase();
    if (rootXml.includes('adlcp_v1p3') || rootXml.includes('imsss') || rootXml.includes('adlseq')) return 'SCORM 2004';
    return 'SCORM 1.2';
  }

  function parseItem(itemEl, resources, manifestPath, inheritedBase) {
    const title = textOf(firstChild(itemEl, 'title')) || itemEl.getAttribute('identifier') || 'Élément sans titre';
    const identifier = itemEl.getAttribute('identifier') || crypto.randomUUID();
    const identifierref = itemEl.getAttribute('identifierref') || '';
    const parameters = itemEl.getAttribute('parameters') || '';
    const visibleAttr = itemEl.getAttribute('isvisible');
    const resource = resources.get(identifierref) || null;

    let href = resource?.href || '';
    if (href && parameters) {
      if (parameters.startsWith('?') || parameters.startsWith('#')) href += parameters;
      else href += (href.includes('?') ? '&' : '?') + parameters;
    }

    const children = childrenByLocalName(itemEl, 'item').map(child => parseItem(child, resources, manifestPath, inheritedBase));
    return {
      identifier,
      identifierref,
      title,
      isVisible: visibleAttr !== 'false',
      href,
      resourceType: resource?.scormType || '',
      children,
      launchable: Boolean(href)
    };
  }

  function flattenItems(items, target = []) {
    for (const item of items) {
      if (item.launchable) target.push(item);
      flattenItems(item.children, target);
    }
    return target;
  }

  function extractLaunchMetadata(doc, standard) {
    const metadata = {};
    const mastery = descendants(doc.documentElement, standard === 'SCORM 2004' ? 'scaledPassingScore' : 'masteryscore')[0];
    if (mastery) {
      metadata.passingScore = textOf(mastery);
    }
    const maxTime = descendants(doc.documentElement, 'maxtimeallowed')[0] || descendants(doc.documentElement, 'maxTimeAllowed')[0];
    const timeAction = descendants(doc.documentElement, 'timelimitaction')[0] || descendants(doc.documentElement, 'timeLimitAction')[0];
    if (maxTime) metadata.maxTimeAllowed = textOf(maxTime);
    if (timeAction) metadata.timeLimitAction = textOf(timeAction);
    return metadata;
  }

  function parseManifest(xmlText, manifestPath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('Le fichier imsmanifest.xml n’est pas un XML valide.');

    const manifestEl = doc.documentElement;
    if (manifestEl.localName !== 'manifest') throw new Error('Le XML trouvé ne semble pas être un manifeste IMS/SCORM.');

    const standard = parseStandard(doc);
    const manifestIdentifier = manifestEl.getAttribute('identifier') || '';
    const manifestBase = attrByLocalName(manifestEl, 'base');

    const resourcesEl = firstChild(manifestEl, 'resources');
    const resourcesBase = attrByLocalName(resourcesEl, 'base');
    const resources = new Map();

    for (const resourceEl of childrenByLocalName(resourcesEl, 'resource')) {
      const id = resourceEl.getAttribute('identifier') || '';
      const hrefRaw = resourceEl.getAttribute('href') || '';
      const resourceBase = attrByLocalName(resourceEl, 'base');
      const aggregateBase = joinPath(manifestBase, resourcesBase, resourceBase);
      const href = resolveRelative(manifestPath, hrefRaw, aggregateBase);
      const scormType = attrByLocalName(resourceEl, 'scormtype') || attrByLocalName(resourceEl, 'scormType');
      const files = childrenByLocalName(resourceEl, 'file').map(fileEl => resolveRelative(manifestPath, fileEl.getAttribute('href') || '', aggregateBase));
      resources.set(id, { id, href, scormType, files });
    }

    const organizationsEl = firstChild(manifestEl, 'organizations');
    const defaultOrgId = organizationsEl?.getAttribute('default') || '';
    const orgEls = childrenByLocalName(organizationsEl, 'organization');
    let organizationEl = orgEls.find(el => el.getAttribute('identifier') === defaultOrgId) || orgEls[0] || null;
    if (!organizationEl) throw new Error('Le manifeste ne contient aucune organisation exploitable.');

    const organizationTitle = textOf(firstChild(organizationEl, 'title')) || 'Cours SCORM';
    const items = childrenByLocalName(organizationEl, 'item').map(item => parseItem(item, resources, manifestPath, manifestBase));
    const launchableItems = flattenItems(items);

    return {
      standard,
      manifestIdentifier,
      organizationIdentifier: organizationEl.getAttribute('identifier') || '',
      title: organizationTitle,
      items,
      launchableItems,
      resources,
      rawXml: xmlText,
      manifestPath,
      metadata: extractLaunchMetadata(doc, standard)
    };
  }

  window.ScormManifest = { parse: parseManifest, flattenItems, resolveRelative };
})();
