# -*- coding: utf-8 -*-
"""A tiny QWeb renderer (only the parts the ToonReel / ToonVerse templates use), so the real Odoo
templates can be turned into plain static HTML without running Odoo.

Supported: t-if / t-elif / t-else, t-foreach + t-as (with _index/_first/_last/_size), t-set (t-value, t-valuef, body),
t-out / t-esc, t-att-*, t-attf-*, t-call (+ body, and the "0" slot).
"""
import re
from html import escape
from lxml import etree

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
_FMT = re.compile(r"#\{(.+?)\}|\{\{(.+?)\}\}")


class Raw(str):
    """Already-escaped HTML (not escaped again by t-out)."""


class QWeb:
    def __init__(self):
        self.templates = {}  # id -> element

    def load(self, xml_path, prefix=""):
        tree = etree.parse(xml_path)
        for t in tree.getroot().iter("template"):
            self.templates[t.get("id")] = t

    # ---- helpers ----
    def _ev(self, expr, ctx):
        return eval(expr.strip(), ctx)  # noqa: S307  (our own templates, trusted)

    def _fmt(self, s, ctx):
        def rep(m):
            v = self._ev(m.group(1) or m.group(2), ctx)
            return "" if v is None or v is False else str(v)
        return _FMT.sub(rep, s)

    def render_template(self, tid, ctx):
        t = self.templates[tid.split(".")[-1]]
        return self._children(t, dict(ctx), svg=False)

    # ---- core ----
    def _children(self, node, ctx, svg):
        out = []
        if node.text:
            out.append(escape(node.text, quote=False))
        chain = None  # result of the last t-if / t-elif in this sibling run
        for ch in node:
            if not isinstance(ch.tag, str):  # comment / PI: drop (tail still kept)
                if ch.tail:
                    out.append(escape(ch.tail, quote=False))
                continue
            a = ch.attrib
            run = True
            if "t-if" in a:
                chain = bool(self._ev(a["t-if"], ctx))
                run = chain
            elif "t-elif" in a:
                if chain:
                    run = False
                else:
                    chain = bool(self._ev(a["t-elif"], ctx))
                    run = chain
            elif "t-else" in a:
                run = not chain
                chain = True
            else:
                chain = None
            if run:
                out.append(self._node(ch, ctx, svg))
            if ch.tail:
                out.append(escape(ch.tail, quote=False))
        return "".join(out)

    def _node(self, el, ctx, svg):
        a = el.attrib
        if "t-foreach" in a:
            seq = list(self._ev(a["t-foreach"], ctx))
            name = a["t-as"]
            parts = []
            n = len(seq)
            for i, item in enumerate(seq):
                c = dict(ctx)
                c[name] = item
                c[name + "_index"] = i
                c[name + "_first"] = i == 0
                c[name + "_last"] = i == n - 1
                c[name + "_size"] = n
                parts.append(self._one(el, c, svg))
            return "".join(parts)
        return self._one(el, ctx, svg)

    def _one(self, el, ctx, svg):
        a = el.attrib
        tag = el.tag
        if tag == "t":
            if "t-set" in a:
                name = a["t-set"]
                if "t-value" in a:
                    ctx[name] = self._ev(a["t-value"], ctx)
                elif "t-valuef" in a:
                    ctx[name] = self._fmt(a["t-valuef"], ctx)
                else:
                    ctx[name] = Raw(self._children(el, ctx, svg))
                return ""
            if "t-call" in a:
                c = dict(ctx)
                body = self._children(el, c, svg)  # runs t-set in the body, gives the "0" slot
                c["0"] = Raw(body)
                return self.render_template(a["t-call"], c)
            if "t-out" in a or "t-esc" in a:
                return self._out(self._ev(a.get("t-out") or a.get("t-esc"), ctx))
            return self._children(el, ctx, svg)

        in_svg = svg or tag == "svg"
        attrs = []
        for k, v in a.items():
            if k.startswith("t-attf-"):
                attrs.append((k[7:], self._fmt(v, ctx)))
            elif k.startswith("t-att-"):
                val = self._ev(v, ctx)
                if val is not None and val is not False:
                    attrs.append((k[6:], "" if val is True else str(val)))
            elif k.startswith("t-"):
                continue
            else:
                attrs.append((k, v))
        merged = {}
        for k, v in attrs:  # class / style given both ways are joined
            if k in merged and k in ("class", "style"):
                merged[k] = (merged[k] + (" " if k == "class" else "; ") + v).strip()
            else:
                merged[k] = v
        s = "<" + tag + "".join(' %s="%s"' % (k, escape(str(v), quote=True)) for k, v in merged.items())
        if "t-out" in a or "t-esc" in a:
            inner = self._out(self._ev(a.get("t-out") or a.get("t-esc"), ctx))
        else:
            inner = self._children(el, ctx, in_svg)
        if tag in VOID:
            return s + ">"
        if in_svg and not inner.strip() and not len(el):
            return s + "/>"
        return s + ">" + inner + "</" + tag + ">"

    @staticmethod
    def _out(v):
        if v is None or v is False:
            return ""
        if isinstance(v, Raw):
            return str(v)
        return escape(str(v), quote=False)
