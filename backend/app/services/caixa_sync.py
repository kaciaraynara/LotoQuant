import ssl
from datetime import datetime
from typing import Optional
import httpx
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.modalities import MODALITIES, EngineType
from app.models.lottery import DrawResult


class CaixaSyncService:
    def __init__(self, db: Session):
        self.db = db
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "pt-BR,pt;q=0.9",
            "Origin": "https://loterias.caixa.gov.br",
            "Referer": "https://loterias.caixa.gov.br/",
        }

    def _get_json(self, url: str) -> Optional[dict]:
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with httpx.Client(verify=ctx, timeout=10.0, headers=self.headers, follow_redirects=True) as client:
                r = client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, dict) and (data.get("listaDezenas") or data.get("dezenas")):
                        return data
        except Exception as e:
            print(f"[SYNC WARN] Falha em {url}: {e}")
        return None

    def fetch_contest(self, api_slug: str, contest: Optional[int] = None) -> Optional[dict]:
        urls = []
        if contest:
            urls = [
                f"https://servicebus2.caixa.gov.br/portaldeloterias/api/{api_slug}/{contest}",
                f"https://api.guidi.dev.br/loteria/{api_slug}/{contest}",
                f"https://loteriascaixa-api.herokuapp.com/api/{api_slug}/{contest}",
            ]
        else:
            urls = [
                f"https://servicebus2.caixa.gov.br/portaldeloterias/api/{api_slug}",
                f"https://api.guidi.dev.br/loteria/{api_slug}/ultimo",
                f"https://loteriascaixa-api.herokuapp.com/api/{api_slug}/latest",
            ]
        for u in urls:
            res = self._get_json(u)
            if res:
                return res
        return None

    def _parse(self, slug: str, raw: dict) -> Optional[DrawResult]:
        spec = MODALITIES[slug]
        num_raw = raw.get("numero") or raw.get("concurso")
        dezenas = raw.get("listaDezenas") or raw.get("dezenas") or []
        if not num_raw or not dezenas:
            return None

        c_num = int(num_raw)
        date_str = str(raw.get("dataApuracao") or raw.get("data") or "")[:10]
        try:
            d_date = datetime.strptime(date_str, "%d/%m/%Y").date()
        except Exception:
            d_date = datetime.utcnow().date()

        nums = [int(x) for x in dezenas]
        if spec.engine_type != EngineType.COLUMN_POSITIONAL:
            nums = sorted(nums)

        sec = None
        if spec.engine_type == EngineType.DUPLA_SENA:
            s2 = raw.get("listaDezenasSegundoSorteio") or raw.get("dezenas2") or []
            sec = sorted([int(x) for x in s2])
        elif spec.engine_type == EngineType.DUAL_MATRIX:
            tr = raw.get("trevosSorteados") or raw.get("trevos") or []
            sec = sorted([int(x) for x in tr])

        extra = raw.get("nomeTimeCoracaoMesSorte") or raw.get("timeCoracao") or raw.get("mesSorte")
        return DrawResult(
            modality=slug,
            contest_number=c_num,
            draw_date=d_date,
            numbers=nums,
            secondary_numbers=sec,
            extra_label=str(extra).strip() if extra else "OFICIAL",
        )

    def sync_modality(self, slug: str, max_backfill: int = 35) -> int:
        spec = MODALITIES[slug]
        latest = self.fetch_contest(spec.api_slug)
        if not latest:
            raise RuntimeError(f"Não foi possível conectar aos servidores da Caixa para {spec.name}. Verifique sua internet.")

        remote_num = int(latest.get("numero") or latest.get("concurso"))

        # Limpa eventuais registros simulados antigos se existirem
        self.db.query(DrawResult).filter(
            DrawResult.modality == slug,
            DrawResult.extra_label == "BASE_CALIBRADA"
        ).delete()
        self.db.commit()

        local_max = self.db.execute(
            select(func.max(DrawResult.contest_number)).where(DrawResult.modality == slug)
        ).scalar()

        start = max(1, remote_num - max_backfill + 1) if local_max is None else local_max + 1
        if start > remote_num:
            return 0

        inserted = 0
        for c in range(start, remote_num + 1):
            raw = latest if c == remote_num else self.fetch_contest(spec.api_slug, c)
            if not raw:
                continue
            rec = self._parse(slug, raw)
            if rec:
                self.db.add(rec)
                inserted += 1
            if inserted % 10 == 0:
                self.db.commit()

        self.db.commit()
        print(f"[SYNC OK] {spec.name}: +{inserted} concursos reais sincronizados (até #{remote_num}).")
        return inserted

    def sync_all(self, max_backfill: int = 35) -> dict[str, int]:
        out = {}
        for slug in MODALITIES:
            try:
                out[slug] = self.sync_modality(slug, max_backfill=max_backfill)
            except Exception as e:
                print(f"[SYNC ERR] {slug}: {e}")
                out[slug] = 0
        return out
