const activeImports = new Set();
const venueAliases = [
  ['NeurIPS', /\b(?:neurips|nips|(?:advances in )?neural information processing systems)\b/i],
  ['ICLR', /\b(?:iclr|international conference on learning representations)\b/i],
  ['ICML', /\b(?:icml|international conference on machine learning)\b/i],
  ['AAAI', /\b(?:aaai|association for the advancement of artificial intelligence)\b/i],
  ['CVPR', /\b(?:cvpr|conference on computer vision and pattern recognition)\b/i],
  ['ICCV', /\b(?:iccv|international conference on computer vision)\b/i],
  ['ECCV', /\b(?:eccv|european conference on computer vision)\b/i],
  ['EMNLP', /\b(?:emnlp|empirical methods in natural language processing)\b/i],
  ['ACL', /\b(?:acl|annual meeting of the association for computational linguistics)\b/i],
  ['AISTATS', /\b(?:aistats|artificial intelligence and statistics)\b/i],
  ['IJCAI', /\b(?:ijcai|international joint conference on artificial intelligence)\b/i],
  ['KDD', /\b(?:kdd|knowledge discovery and data mining)\b/i],
  ['UAI', /\b(?:uai|uncertainty in artificial intelligence)\b/i],
  ['COLT', /\b(?:colt|conference on learning theory)\b/i],
];

let originalAutoRecognize;
let originalRecognize;
let enabled = false;

function install() {}
function uninstall() {}

function startup() {
  const service = Zotero.RecognizeDocument;
  originalAutoRecognize = service.autoRecognizeItems;
  originalRecognize = service._recognize;
  if (typeof originalAutoRecognize !== 'function' || typeof originalRecognize !== 'function') return;
  enabled = true;
  service.autoRecognizeItems = autoRecognize;
  service._recognize = recognize;
}

function shutdown() {
  enabled = false;
  activeImports.clear();
  if (!originalAutoRecognize || !originalRecognize) return;
  const service = Zotero.RecognizeDocument;
  if (service.autoRecognizeItems === autoRecognize) service.autoRecognizeItems = originalAutoRecognize;
  if (service._recognize === recognize) service._recognize = originalRecognize;
}

async function autoRecognize(items) {
  const added = [];
  for (const item of items) {
    if (item?.isPDFAttachment() && item.isTopLevelItem()
      && item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE
      && item.libraryID === Zotero.Libraries.userLibraryID && !activeImports.has(item.id)) {
      activeImports.add(item.id);
      added.push(item.id);
    }
  }
  try {
    return await originalAutoRecognize.call(this, items);
  } finally {
    for (const id of added) activeImports.delete(id);
  }
}

async function recognize(attachment) {
  if (!activeImports.has(attachment.id)) return originalRecognize.call(this, attachment);

  let parent;
  let nativeError;
  try {
    parent = await originalRecognize.call(this, attachment);
  } catch (error) {
    nativeError = error;
  }

  try {
    if (enabled && !attachment.deleted && !attachment.parentID) {
      const match = await findConference(attachment, parent);
      if (match && await matchesPdfEdition(attachment, match)
        && enabled && !attachment.deleted && !attachment.parentID) {
        return await applyConference(attachment.libraryID, parent, match);
      }
    }
  } catch (error) {
    Zotero.logError(error);
  }
  if (nativeError) throw nativeError;
  return parent;
}

const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').trim();
const normalized = value => clean(value).normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const yearFrom = value => String(value ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];

function conferenceName(acronym, ...labels) {
  const combined = [acronym, ...labels].filter(Boolean).join(' ');
  if (/\b(?:workshops?|findings|companion|doctoral consortium|demo track)\b/i.test(combined)) return null;
  const known = venueAliases.find(([, pattern]) => pattern.test(combined));
  if (known) return known[0];
  const short = clean(acronym).replace(/\s*(?:19|20)\d{2}$/, '');
  return /^(?=.*[A-Z])[A-Z][A-Z0-9&+.-]{1,15}$/.test(short) ? short : null;
}

async function requestJSON(base, parameters, accept = 'application/json') {
  const query = Object.entries(parameters)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&');
  const url = query ? `${base}?${query}` : base;
  try {
    const response = await Zotero.HTTP.request('GET', url, {
      responseType: 'json', timeout: 6500, headers: { Accept: accept },
    });
    return response.response ?? null;
  } catch (error) {
    Zotero.debug(`Conference PDF metadata: lookup failed (${error.name})`);
    return null;
  }
}

function fromCrossref(record) {
  if (record?.type !== 'proceedings-article') return null;
  const event = record.event ?? {};
  const venue = conferenceName(event.acronym, event.name, event.theme, record['container-title']?.[0]);
  const eventYear = event.start?.['date-parts']?.[0]?.[0];
  const publicationYear = (record.published ?? record.issued)?.['date-parts']?.[0]?.[0];
  const year = yearFrom(event.acronym) ?? yearFrom(eventYear) ?? yearFrom(publicationYear);
  if (!venue || !year) return null;
  return {
    title: clean(record.title?.[0]), venue, year, doi: record.DOI,
    authors: (record.author ?? []).filter(author => author.family).map(author => ({
      firstName: author.given ?? '', lastName: author.family, creatorType: 'author',
    })),
  };
}

async function lookupDblp({ title, firstAuthor }) {
  const base = title.replace(/\.$/, '');
  const candidates = [base, `${base}.`];
  // Limit the case-insensitive title comparison to one author's first-author
  // records. With a native parent item, only its first author needs checking.
  const indexedAuthor = firstAuthor ? `
      ?signature dblp:signatureDblpName ${JSON.stringify(firstAuthor)} .
      FILTER(?ordinal = 1)
      FILTER(LCASE(STR(?title)) IN (${candidates.map(value => JSON.stringify(value.toLowerCase())).join(', ')}))` : '';
  const exactTitles = `VALUES ?title { ${candidates.map(value => JSON.stringify(value)).join(' ')} }`;
  const fetchRows = async titleFilter => {
    const query = `PREFIX dblp: <https://dblp.org/rdf/schema#>
    SELECT ?paper ?title ?venue ?year ?name ?ordinal WHERE {
      ${titleFilter}
      ?paper a dblp:Inproceedings ; dblp:title ?title ; dblp:publishedIn ?venue ;
        dblp:yearOfPublication ?published ; dblp:hasSignature ?signature .
      OPTIONAL { ?paper dblp:yearOfEvent ?eventYear }
      BIND(COALESCE(?eventYear, ?published) AS ?year)
      ?signature a dblp:AuthorSignature ; dblp:signatureDblpName ?name ; dblp:signatureOrdinal ?ordinal .
    } LIMIT 160`;
    const response = await requestJSON('https://sparql.dblp.org/sparql', { query }, 'application/sparql-results+json');
    return response?.results?.bindings ?? [];
  };
  let rows = indexedAuthor ? await fetchRows(indexedAuthor) : [];
  if (!rows.length) rows = await fetchRows(exactTitles);
  if (rows.length >= 160) return [];
  const records = new Map();
  for (const row of rows) {
    const id = row.paper?.value;
    const venue = conferenceName(row.venue?.value);
    const year = yearFrom(row.year?.value);
    if (!id?.startsWith('https://dblp.org/rec/conf/') || !venue || !year) continue;
    if (!records.has(id)) records.set(id, { title: row.title?.value, venue, year, authors: [] });
    const name = clean(row.name?.value).replace(/\s+\d{4}$/, '');
    const parts = name.split(/\s+/);
    const lastName = parts.pop();
    const ordinal = Number(row.ordinal?.value);
    if (lastName && Number.isInteger(ordinal) && ordinal > 0 && ordinal <= 150) {
      records.get(id).authors[ordinal - 1] = { firstName: parts.join(' '), lastName, creatorType: 'author' };
    }
  }
  return [...records.values()].filter(record => record.authors[0]).map(record => ({
    ...record, authors: record.authors.filter(Boolean),
  }));
}

function chooseMatch(records, identity) {
  const matches = records.filter(record => record && normalized(record.title) === normalized(identity.title)
    && record.authors[0] && identity.matchesAuthor(record.authors[0]));
  if (!matches.length || new Set(matches.map(({ venue, year }) => `${venue}:${year}`)).size !== 1) return null;
  return matches[0];
}

function readPageLines(data) {
  const lines = [];
  function visit(part) {
    if (!Array.isArray(part)) return;
    if (typeof part[0]?.[13] === 'string' && typeof part[0]?.[0] === 'number') {
      lines.push(part.map(word => word[13]).filter(Boolean).join(' '));
      return;
    }
    for (const child of part) visit(child);
  }
  visit(data.pages?.[0]?.[2]);
  return lines;
}

async function matchesPdfEdition(attachment, match) {
  let data;
  try {
    data = await Zotero.PDFWorker.getRecognizerData(attachment.id, true);
  } catch (error) {
    Zotero.debug(`Conference PDF metadata: could not check the first page (${error.name})`);
    return true;
  }
  const lines = readPageLines(data);
  const heading = lines.slice(0, 6).join(' ').match(
    /\bpublished as a conference paper at\s+([a-z][a-z0-9+&.-]*)\s+((?:19|20)\d{2})\b/i,
  );
  if (heading) {
    return normalized(conferenceName(heading[1]) ?? heading[1]) === normalized(match.venue)
      && heading[2] === match.year;
  }
  // Explicit front-page workshop footers refer to the attached version, even
  // when the same authors and title later appear in main-track proceedings.
  const marginLines = [...lines.slice(0, 6), ...lines.slice(-8)];
  return !marginLines.some(line => /\bworkshop\b/i.test(line) && yearFrom(line)
    && venueAliases.some(([, pattern]) => pattern.test(line)));
}

async function pdfIdentity(attachment, originalTitle) {
  const data = await Zotero.PDFWorker.getRecognizerData(attachment.id, true);
  const firstPage = normalized((data.pages?.[0]?.[2] ?? []).flat(Infinity)
    .filter(value => typeof value === 'string').join(' '));
  const namedTitle = attachment.attachmentFilename.replace(/\.pdf$/i, '')
    .replace(/^[\[(]?(?:[\w]+[-_ ]+)?(?:19|20)\d{2}[\])]?[-_ ]+/i, '')
    .replace(/[-_ ]+paper[-_ ]+conference$/i, '').replace(/[-_]+/g, ' ').trim();
  const title = [originalTitle, data.metadata?.title, data.metadata?.Title, data.info?.Title, namedTitle]
    .find(value => normalized(value).split(' ').length >= 4
      && firstPage.replace(/ /g, '').includes(normalized(value).replace(/ /g, '')));
  if (!title) return null;
  return {
    title,
    matchesAuthor: author => {
      const name = normalized(`${author.firstName} ${author.lastName}`);
      return Boolean(name && firstPage.replace(/ /g, '').includes(name.replace(/ /g, '')));
    },
  };
}

async function findConference(attachment, parent) {
  if (parent && !['conferencePaper', 'journalArticle', 'preprint', 'document', 'manuscript'].includes(parent.itemType)) return null;
  const title = clean(parent?.getField('title'));
  const first = parent?.getCreators()[0];
  const identity = title && first?.lastName && !first.fieldMode ? {
    title,
    firstAuthor: clean(`${first.firstName ?? ''} ${first.lastName}`),
    matchesAuthor: author => normalized(author.lastName) === normalized(first.lastName)
      && normalized(author.firstName)[0] === normalized(first.firstName)[0],
  } : await pdfIdentity(attachment, title);
  if (!identity || normalized(identity.title).length < 8 || identity.title.length > 500) return null;

  const doi = clean(parent?.getField('DOI'));
  if (doi && !/^10\.48550\/arxiv\./i.test(doi)) {
    const result = await requestJSON(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {});
    // A DOI for an already published journal paper identifies that specific version.
    if (result?.message?.type === 'journal-article') return null;
    const match = chooseMatch([fromCrossref(result?.message)], identity);
    if (match) return match;
    if (parent.itemType === 'journalArticle' && parent.getField('publicationTitle')) return null;
  }

  const result = await requestJSON('https://api.crossref.org/works', {
    'query.title': identity.title, filter: 'type:proceedings-article', rows: '8',
  });
  const candidates = (result?.message?.items ?? []).map(fromCrossref);
  const match = chooseMatch(candidates, identity);
  if (match) return match;
  return chooseMatch(await lookupDblp(identity), identity);
}

async function applyConference(libraryID, parent, match) {
  const item = parent ?? new Zotero.Item('conferencePaper');
  if (!parent) {
    item.libraryID = libraryID;
    item.setField('title', match.title.replace(/\.$/, ''));
    item.setCreators(match.authors);
    if (match.doi) item.setField('DOI', match.doi);
  } else if (item.itemType !== 'conferencePaper') {
    item.setType(Zotero.ItemTypes.getID('conferencePaper'));
  }
  const title = item.getField('title');
  if (title === title.toUpperCase() && title !== title.toLowerCase()) {
    item.setField('title', match.title.replace(/\.$/, ''));
  }
  item.setField('conferenceName', match.venue);
  item.setField('proceedingsTitle', match.venue);
  if (yearFrom(item.getField('date')) !== match.year) item.setField('date', match.year);
  await item.saveTx();
  // The native recognition flow attaches and renames the same PDF using this item.
  return item;
}
