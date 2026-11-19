# Zotero Conference PDF Metadata

[简体中文](README.md)

A Zotero 10 desktop plugin for recognizing conference papers when you import PDFs into your personal library. It supplements Zotero’s built-in recognition with Crossref and DBLP lookups. When it finds a match, it sets the parent item type to Conference Paper and fills in the conference acronym and year.

## Install and use

1. Download `zotero-conference-pdf-metadata.xpi` from the repository’s **Releases** or build it from source below.
2. In Zotero, open **Tools → Plugins**, click the gear, then choose **Install Plugin From File** and select the XPI.
3. Enable automatic PDF metadata retrieval in Zotero’s settings. Drop a PDF into the item list in your personal library as a standalone attachment.
4. After recognition finishes, inspect the PDF’s parent item. A match sets its type to Conference Paper, writes the acronym (such as `ICLR`) to Conference Name and Proceedings Title, and fills in the conference year in Date.

The manifest targets **Zotero 10.0.x**. The plugin uses Zotero’s internal document recognition API. To update, install a newer XPI manually.

## How it matches

- The plugin handles newly imported, standalone PDFs stored in the personal library through automatic recognition. Linked files, group libraries, attachments with existing parents, and manual recognition are outside its scope.
- It checks a DOI with Crossref when available, then searches Crossref conference records by title, and can fall back to DBLP. Candidates must match the title and first author. Matching candidates from a lookup must agree on the conference acronym and year.
- Zotero’s original result is retained if there is no qualifying match, a DOI resolves to a journal article, or the plugin detects an edition conflict. Coverage depends on indexing, PDF text quality, and metadata consistency.
- Built-in aliases cover common AI and computer science conferences including NeurIPS, ICLR, ICML, AAAI, CVPR, ICCV, ECCV, ACL, EMNLP, and KDD. Other conferences can match when the source supplies a suitable acronym.

## Data and privacy

The plugin’s lookups may send the DOI or title to Crossref, and the title and first author’s name, if available, to DBLP. These lookups send only the metadata used for matching. Zotero’s built-in recognition still runs and may send extracted PDF data and the filename to Zotero’s recognition service. See the [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), the [DBLP SPARQL service](https://blog.dblp.org/2024/09/09/introducing-our-public-sparql-query-service/), and [Zotero’s recognition code](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/recognizeDocument.js).

## Build from source

Run the following from the repository root with Python 3. The build uses the standard library. On Windows, use `py -3` in place of `python3`.

```sh
python3 scripts/build.py
```

The package is written to `dist/zotero-conference-pdf-metadata.xpi`. GitHub Actions checks the JavaScript syntax, manifest JSON, and XPI build. To publish a release, tag the commit with the version in `manifest.json` (for example, `v1.0.2`) and attach the generated XPI to the corresponding GitHub Release.

Issues and pull requests are welcome. For recognition reports, include the Zotero and plugin versions, steps to reproduce, the expected and actual item type and conference fields, and a public DOI or paper link if available.

This project uses the [MIT License](LICENSE).
