#!/usr/bin/env python3
"""Deteta e remove marcas de água textuais.

Trata dois tipos de marca:
  1. Invisíveis: caracteres Unicode escondidos no texto (largura zero,
     controlo bidirecional, caracteres "tag", seletores de variação,
     hífenes suaves, espaços especiais, homóglifos de outros alfabetos).
  2. Visíveis: frases carimbadas no texto ("RASCUNHO", "Gerado por X")
     e, em .docx, a marca de água de Word no cabeçalho.

Nunca altera o ficheiro original: grava <nome>.limpo<ext> ao lado,
a menos que se indique --out.

Uso:
  limpar_texto.py FICHEIRO [--report-only] [--out SAIDA] [--json RELATORIO]
                  [--remove-phrase TEXTO ...] [--remove-regex REGEX ...]
                  [--keep-nbsp] [--keep-homoglyphs] [--keep-bidi]
  limpar_texto.py - < entrada.txt     (lê de stdin, escreve em stdout)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, OrderedDict
from pathlib import Path

# ---------------------------------------------------------------- categorias

ZERO_WIDTH = {
    0x200B: "ZERO WIDTH SPACE",
    0x200C: "ZERO WIDTH NON-JOINER",
    0x200D: "ZERO WIDTH JOINER",
    0x2060: "WORD JOINER",
    0x2061: "FUNCTION APPLICATION",
    0x2062: "INVISIBLE TIMES",
    0x2063: "INVISIBLE SEPARATOR",
    0x2064: "INVISIBLE PLUS",
    0xFEFF: "ZERO WIDTH NO-BREAK SPACE / BOM",
    0x180E: "MONGOLIAN VOWEL SEPARATOR",
    0x034F: "COMBINING GRAPHEME JOINER",
    0x115F: "HANGUL CHOSEONG FILLER",
    0x1160: "HANGUL JUNGSEONG FILLER",
    0x3164: "HANGUL FILLER",
    0xFFA0: "HALFWIDTH HANGUL FILLER",
    0xFFF9: "INTERLINEAR ANNOTATION ANCHOR",
    0xFFFA: "INTERLINEAR ANNOTATION SEPARATOR",
    0xFFFB: "INTERLINEAR ANNOTATION TERMINATOR",
}
BIDI = set(range(0x202A, 0x202F)) | set(range(0x2066, 0x206A)) | {0x200E, 0x200F, 0x061C}
SPECIAL_SPACES = {0x00A0, 0x202F, 0x205F, 0x3000, 0x2028, 0x2029} | set(range(0x2000, 0x200B))
SOFT_HYPHEN = 0x00AD

# Homóglifos (cirílico/grego -> latim) usados para "assinar" texto.
HOMOGLYPHS = {
    "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I", "Ј": "J", "К": "K",
    "М": "M", "О": "O", "Р": "P", "Ѕ": "S", "Т": "T", "Х": "X", "У": "Y",
    "а": "a", "с": "c", "е": "e", "і": "i", "ј": "j", "о": "o", "р": "p",
    "ѕ": "s", "х": "x", "у": "y", "һ": "h", "ԁ": "d", "ԛ": "q", "ԝ": "w",
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
    "ο": "o", "ν": "v", "ι": "i",
    "‐": "-", "‑": "-",
}
LATIN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
WORD_RE = re.compile(r"\w+", re.UNICODE)


def _is_emoji_base(ch: str) -> bool:
    return bool(ch) and (unicodedata.category(ch) == "So" or ord(ch) >= 0x1F000
                         or ch in "#*0123456789©®™")


class Report:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self.examples: "OrderedDict[str, list[str]]" = OrderedDict()
        self.hidden_tag_text: list[str] = []
        self.notes: list[str] = []

    def add(self, cat: str, example: str | None = None, n: int = 1) -> None:
        self.counts[cat] += n
        if example is not None:
            ex = self.examples.setdefault(cat, [])
            if len(ex) < 5 and example not in ex:
                ex.append(example)

    def as_dict(self) -> dict:
        return {
            "total": sum(self.counts.values()),
            "por_categoria": dict(self.counts),
            "exemplos": dict(self.examples),
            "mensagem_escondida_em_tags": self.hidden_tag_text,
            "notas": self.notes,
        }


# ---------------------------------------------------------------- limpeza

def clean_text(text: str, rep: Report, opts) -> str:
    out: list[str] = []
    tag_buf: list[str] = []
    prev = ""

    def flush_tags():
        if tag_buf:
            rep.hidden_tag_text.append("".join(tag_buf))
            tag_buf.clear()

    for ch in text:
        cp = ord(ch)
        name = f"U+{cp:04X}"
        # Caracteres "tag" (E0000-E007F): escondem ASCII inteiro.
        if 0xE0000 <= cp <= 0xE007F:
            if 0xE0020 <= cp <= 0xE007E:
                tag_buf.append(chr(cp - 0xE0000))
            rep.add("caracteres_tag (texto escondido)", name)
            continue
        flush_tags()
        if cp in ZERO_WIDTH:
            # ZWJ entre emojis faz parte do emoji (ex.: família): manter.
            if cp == 0x200D and _is_emoji_base(prev):
                out.append(ch); prev = ch; continue
            rep.add("largura_zero", f"{name} {ZERO_WIDTH[cp]}")
            continue
        if cp in BIDI:
            if opts.keep_bidi:
                out.append(ch); prev = ch; continue
            rep.add("controlo_bidirecional", name)
            continue
        if 0xFE00 <= cp <= 0xFE0F or 0xE0100 <= cp <= 0xE01EF:
            # VS15/VS16 depois de um símbolo é apresentação normal de emoji.
            if cp in (0xFE0E, 0xFE0F) and _is_emoji_base(prev):
                out.append(ch); prev = ch; continue
            rep.add("seletores_variacao", name)
            continue
        if cp == SOFT_HYPHEN:
            rep.add("hifen_suave", name)
            continue
        if cp in SPECIAL_SPACES:
            if opts.keep_nbsp and cp in (0x00A0, 0x202F):
                out.append(ch); prev = ch; continue
            rep.add("espacos_especiais", f"{name} {unicodedata.name(ch, '?')}")
            ch = "\n" if cp in (0x2028, 0x2029) else " "
        elif unicodedata.category(ch) == "Cc" and ch not in "\t\n\r":
            rep.add("caracteres_controlo", name)
            continue
        elif unicodedata.category(ch) == "Cf":
            rep.add("outros_formatacao_invisivel", f"{name} {unicodedata.name(ch, '?')}")
            continue
        out.append(ch)
        prev = ch
    flush_tags()
    result = "".join(out)

    if not opts.keep_homoglyphs:
        result = _fix_homoglyphs(result, rep)
    return result


def _fix_homoglyphs(text: str, rep: Report) -> str:
    """Troca homóglifos só em palavras que também têm letras latinas,
    para não estragar texto genuinamente em russo ou grego."""
    def fix(m: re.Match) -> str:
        w = m.group(0)
        if not LATIN_RE.search(w) or not any(c in HOMOGLYPHS for c in w):
            return w
        fixed = "".join(HOMOGLYPHS.get(c, c) for c in w)
        n = sum(1 for c in w if c in HOMOGLYPHS)
        rep.add("homoglifos", f"{w!r} -> {fixed!r}", n)
        return fixed
    text = WORD_RE.sub(fix, text)
    # Hífenes "non-breaking"/U+2010 fora de palavras
    for h in ("‐", "‑"):
        if h in text:
            rep.add("homoglifos", f"U+{ord(h):04X} -> '-'", text.count(h))
            text = text.replace(h, "-")
    return text


def remove_phrases(text: str, rep: Report, phrases, regexes) -> str:
    for p in phrases or []:
        pat = re.compile(re.escape(p), re.IGNORECASE)
        n = len(pat.findall(text))
        if n:
            rep.add("frases_removidas", p, n)
            text = pat.sub("", text)
    for r in regexes or []:
        pat = re.compile(r, re.IGNORECASE | re.MULTILINE)
        n = len(pat.findall(text))
        if n:
            rep.add("frases_removidas", f"/{r}/", n)
            text = pat.sub("", text)
    if phrases or regexes:
        # Arrumar o que a remoção deixou: espaços duplos e linhas vazias a mais.
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def suspicious_repeats(text: str, rep: Report) -> None:
    """Assinala linhas curtas repetidas (candidatas a marca carimbada)."""
    lines = [l.strip() for l in text.splitlines() if 0 < len(l.strip()) <= 80]
    for line, n in Counter(lines).most_common(5):
        if n >= 3 and not re.fullmatch(r"[\W\d_]+", line):
            rep.notes.append(f"Linha repetida {n}x (possível marca visível): {line!r}")


# ---------------------------------------------------------------- .docx

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
TEXT_PARTS = re.compile(r"word/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$")


def clean_docx(src: Path, dst: Path | None, rep: Report, opts) -> None:
    from lxml import etree

    with zipfile.ZipFile(src) as zin:
        items = [(i, zin.read(i.filename)) for i in zin.infolist()]

    new_items = []
    for info, data in items:
        if TEXT_PARTS.search(info.filename):
            root = etree.fromstring(data)
            if "header" in info.filename and not opts.keep_word_watermark:
                _strip_word_watermark(root, rep)
            for t in root.iter(f"{{{W}}}t", f"{{{W}}}instrText"):
                if t.text:
                    new = clean_text(t.text, rep, opts)
                    new = remove_phrases(new, rep, opts.remove_phrase, opts.remove_regex) \
                        if (opts.remove_phrase or opts.remove_regex) else new
                    t.text = new
            data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
        new_items.append((info, data))

    if dst is None:
        return
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for info, data in new_items:
            zout.writestr(info, data)


def _strip_word_watermark(root, rep: Report) -> None:
    """Remove a marca de água de Word (Design > Marca de Água)."""
    removed = []
    for el in list(root.iter()):
        tag = el.tag if isinstance(el.tag, str) else ""
        ident = (el.get("id") or "") + " " + (el.get("name") or "")
        is_vml = tag.endswith("}shape") and "WaterMark" in ident
        is_dml = tag.endswith("}docPr") and "WaterMark" in ident
        if is_vml or is_dml:
            run = el
            while run is not None and run.tag != f"{{{W}}}r":
                run = run.getparent()
            target = run if run is not None else el
            text = " ".join(t for t in (el.xpath(".//@string") or []))
            if target.getparent() is not None:
                target.getparent().remove(target)
                removed.append(text or ident.strip())
    # Blocos sdt da galeria "Watermarks"
    for sdt in list(root.iter(f"{{{W}}}sdt")):
        gal = sdt.find(f".//{{{W}}}docPartGallery")
        if gal is not None and "Watermark" in (gal.get(f"{{{W}}}val") or ""):
            sdt.getparent().remove(sdt)
            removed.append("sdt Watermarks")
    for r in removed:
        rep.add("marca_de_agua_word", r)


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", help="ficheiro de entrada, ou - para stdin")
    ap.add_argument("--out", help="ficheiro de saída (por omissão <nome>.limpo<ext>)")
    ap.add_argument("--report-only", action="store_true", help="só analisa, não grava nada")
    ap.add_argument("--json", help="grava o relatório em JSON neste caminho")
    ap.add_argument("--remove-phrase", action="append", help="frase visível a remover (repetível)")
    ap.add_argument("--remove-regex", action="append", help="expressão regular a remover (repetível)")
    ap.add_argument("--keep-nbsp", action="store_true", help="manter espaços não separáveis (tipografia)")
    ap.add_argument("--keep-homoglyphs", action="store_true", help="não converter homóglifos")
    ap.add_argument("--keep-bidi", action="store_true", help="manter controlos bidirecionais (texto RTL)")
    ap.add_argument("--keep-word-watermark", action="store_true", help=".docx: não remover a marca do cabeçalho")
    opts = ap.parse_args()

    rep = Report()

    if opts.file == "-":
        text = sys.stdin.read()
        cleaned = remove_phrases(clean_text(text, rep, opts), rep, opts.remove_phrase, opts.remove_regex)
        suspicious_repeats(cleaned, rep)
        if not opts.report_only:
            sys.stdout.write(cleaned)
        _emit(rep, opts, to_stderr=True)
        return 0

    src = Path(opts.file)
    if not src.exists():
        print(f"Ficheiro não encontrado: {src}", file=sys.stderr)
        return 2
    dst = None if opts.report_only else Path(opts.out) if opts.out else src.with_name(f"{src.stem}.limpo{src.suffix}")
    if dst is not None and dst.resolve() == src.resolve():
        print("A saída não pode ser o próprio ficheiro original.", file=sys.stderr)
        return 2

    if src.suffix.lower() == ".docx":
        clean_docx(src, dst, rep, opts)
    else:
        raw = src.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
            rep.notes.append("O ficheiro não estava em UTF-8; foi lido como Latin-1 e gravado em UTF-8.")
        if text.startswith("﻿"):
            rep.notes.append("O ficheiro começava com BOM (U+FEFF); foi removido.")
        cleaned = remove_phrases(clean_text(text, rep, opts), rep, opts.remove_phrase, opts.remove_regex)
        suspicious_repeats(cleaned, rep)
        if dst is not None:
            # newline="" preserva as quebras de linha originais (\r\n ou \n)
            with open(dst, "w", encoding="utf-8", newline="") as f:
                f.write(cleaned)

    _emit(rep, opts, to_stderr=False, dst=dst)
    return 0


def _emit(rep: Report, opts, to_stderr: bool, dst: Path | None = None) -> None:
    d = rep.as_dict()
    if dst is not None:
        d["saida"] = str(dst)
    if opts.json:
        Path(opts.json).write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    stream = sys.stderr if to_stderr else sys.stdout
    print(f"Marcas encontradas: {d['total']}", file=stream)
    for cat, n in d["por_categoria"].items():
        ex = "; ".join(d["exemplos"].get(cat, [])[:3])
        print(f"  - {cat}: {n}" + (f"  (ex.: {ex})" if ex else ""), file=stream)
    for msg in d["mensagem_escondida_em_tags"]:
        print(f"  Mensagem escondida em caracteres tag: {msg!r}", file=stream)
    for n in d["notas"]:
        print(f"  Nota: {n}", file=stream)
    if dst is not None:
        print(f"Ficheiro limpo: {dst}", file=stream)
    elif opts.report_only:
        print("(Só análise: nada foi gravado.)", file=stream)


if __name__ == "__main__":
    sys.exit(main())
