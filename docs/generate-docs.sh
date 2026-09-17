#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v asciidoctor-pdf >/dev/null || { echo 'Install asciidoctor-pdf and asciidoctor-diagram (see docs/Gemfile).' >&2; exit 1; }
python3 ../scripts/document-history.py
asciidoctor-pdf -r asciidoctor-diagram \
  -a pdf-theme=custom -a pdf-themesdir=themes -a 'pdf-fontsdir=themes;GEM_FONTS_DIR' \
  -a mermaid-puppeteer-config=puppeteer-config.json \
  --failure-level WARN -o TECHNICAL_SOLUTION_DOCUMENT.pdf TECHNICAL_SOLUTION_DOCUMENT.adoc
printf '%s\n' "Generated docs/TECHNICAL_SOLUTION_DOCUMENT.pdf"
