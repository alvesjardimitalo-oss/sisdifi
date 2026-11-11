#!/usr/bin/env python3
"""Consulta mudanças em fontes oficiais sem aplicar automaticamente alíquotas ou parecer jurídico.

Execução: python3 scripts/monitor-legislacao-fiscal.py
Saídas: assets/data/legislacao-fiscal.json e GITHUB_OUTPUT com novos_alertas.
Somente os sites explicitamente listados no catálogo são acessados.
"""
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import os
from urllib.request import Request, urlopen
from urllib.parse import urlparse

CATALOGO = Path(__file__).resolve().parents[1] / "assets/data/legislacao-fiscal.json"
HOSTS = {
    "freiinocencio.mg.gov.br", "camarafreiinocencio.mg.gov.br",
    "www.gov.br", "gov.br"
}
HOJE = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
NOVA = []

class TextoOficial(HTMLParser):
    def __init__(self):
        super().__init__()
        self.partes = []
        self.ignorar = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg", "noscript", "form"):
            self.ignorar += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "noscript", "form") and self.ignorar:
            self.ignorar -= 1

    def handle_data(self, text):
        if not self.ignorar and text.strip():
            self.partes.append(text.strip())

def coletar(url):
    urlparts = urlparse(url)
    if urlparts.scheme != "https" or urlparts.hostname not in HOSTS:
        raise ValueError("URL não autorizada para este monitor")
    req = Request(url, headers={"User-Agent": "SISDIFI-Legislacao-Fiscal/1.0 (+consulta publica)", "Accept": "text/html,application/pdf"})
    with urlopen(req, timeout=24) as resp:
        ctype = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
        data = resp.read(750_000)
        if len(data) < 250:
            raise ValueError("Conteúdo oficial muito curto")
        if ctype == "application/pdf" or data.startswith(b"%PDF"):
            material = data
        else:
            if ctype not in ("text/html", "text/plain", "application/xhtml+xml"):
                raise ValueError("Tipo de conteúdo inesperado")
            parser = TextoOficial()
            parser.feed(data.decode("utf-8", errors="ignore"))
            texto = " ".join(parser.partes)
            texto = re.sub(r"\s+", " ", texto)
            texto = re.sub(r"\b\d+\s+visualiza(?:ç|c)[oõ]es?\b", "", texto, flags=re.I)
            if len(texto) < 120:
                raise ValueError("Não foi possível extrair texto legislativo suficiente")
            material = texto.encode("utf-8")
    return hashlib.sha256(material).hexdigest()

def executar():
    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    for fonte in catalogo["fontes"]:
        if fonte["estado"] == "mudanca_detectada":
            anterior_pendente = True
        else:
            anterior_pendente = False
        try:
            hash_atual = coletar(fonte["url"])
            fonte["ultimaConsulta"] = HOJE
            fonte["hashObservado"] = hash_atual
            fonte.pop("ultimoErro", None)
            if not fonte.get("hashReferencia"):
                # A primeira coleta cria uma linha de base técnica, NÃO uma validação jurídica.
                fonte["hashReferencia"] = hash_atual
                fonte["estado"] = "monitorado"
                fonte["referenciaCapturadaEm"] = HOJE
            elif hash_atual != fonte["hashReferencia"]:
                fonte["estado"] = "mudanca_detectada"
                if not anterior_pendente:
                    fonte["mudancaDetectadaEm"] = HOJE
                    NOVA.append(fonte["titulo"])
            else:
                fonte["estado"] = "monitorado"
                fonte.pop("mudancaDetectadaEm", None)
        except Exception as exc:
            # Não esconder alertas anteriores quando um portal fica indisponível.
            fonte["ultimaConsulta"] = HOJE
            fonte["ultimoErro"] = str(exc)[:180]
            if not anterior_pendente:
                fonte["estado"] = "erro"
    catalogo["ultimaExecucao"] = HOJE
    # Nunca transformar hash de publicação em nova regra de cálculo.
    catalogo["aplicacaoAutomaticaDeAliquotas"] = False
    catalogo["novosAlertas"] = NOVA
    CATALOGO.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write("novos_alertas=" + str(len(NOVA)) + "\n")
    print(f"Fontes verificadas: {len(catalogo['fontes'])}; novos alertas: {len(NOVA)}")
    for fonte in catalogo["fontes"]:
        print(f" - {fonte['id']}: {fonte['estado']}")

if __name__ == "__main__":
    executar()
