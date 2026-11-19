import json
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZipInfo


def main():
    root = Path(__file__).resolve().parents[1]
    package = root / "dist" / "zotero-conference-pdf-metadata.xpi"
    files = {
        name: (root / name).read_bytes()
        for name in ("manifest.json", "bootstrap.js", "LICENSE")
    }
    manifest = json.loads(files["manifest.json"])
    update_url = urlsplit(manifest["applications"]["zotero"].get("update_url", ""))
    if update_url.scheme != "https" or not update_url.hostname:
        raise SystemExit("manifest.json requires an HTTPS applications.zotero.update_url")

    package.parent.mkdir(exist_ok=True)
    with ZipFile(package, "w") as archive:
        for name, contents in files.items():
            entry = ZipInfo(name)
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, contents)

    print(package.relative_to(root))


if __name__ == "__main__":
    main()
