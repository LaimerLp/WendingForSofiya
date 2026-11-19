"""
Парсер актуальных мероприятий и заведений Пскова.
Собирает данные с открытых городских площадок и объединяет с базовым
каталогом data/curated_places.json -> data/places.json.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
CURATED_FILE = ROOT_DIR / "data" / "curated_places.json"
OUTPUT_FILE = ROOT_DIR / "data" / "places.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9",
}
TIMEOUT = 15


def make_id(prefix: str, text: str) -> str:
    digest = hashlib.md5(text.encode("utf-8")).hexdigest()[:8]
    return f"{prefix}-{digest}"


def fetch_soup(url: str) -> BeautifulSoup | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return BeautifulSoup(resp.text, "html.parser")
    except Exception as exc:
        logger.warning("Не удалось загрузить %s: %s", url, exc)
        return None


def parse_afishagoroda() -> list[dict[str, Any]]:
    """Парсинг концертов и стендапов с pskov.afishagoroda.ru."""
    base_url = "https://pskov.afishagoroda.ru/events"
    soup = fetch_soup(base_url)
    if not soup:
        return []

    results: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    # Универсальный поиск карточек событий по ссылкам на /events/
    for link in soup.select("a[href*='/events/']"):
        title = " ".join(link.get_text(" ", strip=True).split())
        href = link.get("href", "")
        if not title or len(title) < 6 or len(title) > 100:
            continue
        if title.lower() in seen_titles or "все события" in title.lower():
            continue

        seen_titles.add(title.lower())
        full_url = urljoin(base_url, href)
        results.append({
            "id": make_id("ev-ag", title),
            "category": "events",
            "subcategory": "Афиша Пскова",
            "name": title,
            "description": "Актуальное мероприятие из городской афиши Пскова.",
            "address": "Псков (площадка указана на странице события)",
            "rating": "",
            "price": "Билеты на сайте",
            "url": full_url,
        })
        if len(results) >= 12:
            break

    logger.info("pskov.afishagoroda.ru: собрано %d событий", len(results))
    return results


def parse_gostandup() -> list[dict[str, Any]]:
    """Парсинг стендап-событий в Пскове с gostandup.ru."""
    base_url = "https://gostandup.ru/pskov/events"
    soup = fetch_soup(base_url)
    if not soup:
        return []

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for link in soup.select("a[href*='/pskov/events/']"):
        title = " ".join(link.get_text(" ", strip=True).split())
        if not title or len(title) < 6 or title.lower() in seen:
            continue
        seen.add(title.lower())
        results.append({
            "id": make_id("ev-su", title),
            "category": "events",
            "subcategory": "Стендап",
            "name": title,
            "description": "Стендап-выступление в Пскове.",
            "address": "Псков",
            "rating": "",
            "price": "По билетам",
            "url": urljoin(base_url, link.get("href", "")),
        })
        if len(results) >= 6:
            break

    logger.info("gostandup.ru: собрано %d стендапов", len(results))
    return results


def parse_ticpskov_masterclasses() -> list[dict[str, Any]]:
    """Парсинг мастер-классов с ticpskov.ru."""
    base_url = "https://ticpskov.ru/events/master-klass/"
    soup = fetch_soup(base_url)
    if not soup:
        return []

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for link in soup.select("a[href*='/events/']"):
        title = " ".join(link.get_text(" ", strip=True).split())
        href = link.get("href", "")
        if (
            not title
            or len(title) < 8
            or len(title) > 110
            or href.rstrip("/") == "/events/master-klass"
            or title.lower() in seen
        ):
            continue
        seen.add(title.lower())
        results.append({
            "id": make_id("ev-mk", title),
            "category": "events",
            "subcategory": "Мастер-класс",
            "name": title,
            "description": "Мастер-класс или творческая встреча в Пскове.",
            "address": "Псков (Центр туризма и творческих индустрий)",
            "rating": "",
            "price": "По записи",
            "url": urljoin(base_url, href),
        })
        if len(results) >= 6:
            break

    logger.info("ticpskov.ru: собрано %d мастер-классов", len(results))
    return results


def load_curated() -> list[dict[str, Any]]:
    if not CURATED_FILE.exists():
        return []
    with CURATED_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    curated = load_curated()
    scraped: list[dict[str, Any]] = []
    scraped.extend(parse_afishagoroda())
    scraped.extend(parse_gostandup())
    scraped.extend(parse_ticpskov_masterclasses())

    # Объединяем без дубликатов по названию
    combined: list[dict[str, Any]] = list(curated)
    existing_names = {item["name"].strip().lower() for item in combined}

    for item in scraped:
        key = item["name"].strip().lower()
        if key not in existing_names:
            existing_names.add(key)
            combined.append(item)

    msk_now = datetime.now(timezone(timedelta(hours=3))).strftime("%d.%m.%Y %H:%M МСК")
    payload = {
        "city": "Псков",
        "updated_at": msk_now,
        "items": combined,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    logger.info("Сохранено %d записей в %s", len(combined), OUTPUT_FILE)


if __name__ == "__main__":
    main()
