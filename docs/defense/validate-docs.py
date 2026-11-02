"""Статична перевірка документації без запуску Laravel або тестів застосунку."""

import argparse
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backend", type=Path, default=ROOT.parent / "student-planner-backend")
args = parser.parse_args()
BACKEND = args.backend.resolve()
DOCS = sorted((ROOT / "docs/defense").rglob("*.md")) + [ROOT / "docs/demo-scenario.md", ROOT / "README.md"]
errors = []
counts = {"documents": len(DOCS), "links": 0, "source_links": 0, "class_references": 0, "routes": 0, "er_tables": 0, "er_columns": 0, "diagrams": 0}


def check(condition, message):
    if not condition:
        errors.append(message)


def anchors(path):
    values = set()
    duplicates = {}
    for heading in re.findall(r"^#{1,6}\s+(.+)$", path.read_text(), re.M):
        heading = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", heading).replace("`", "").lower()
        slug = "".join(c for c in heading if c.isalnum() or c in " _-").replace(" ", "-")
        suffix = duplicates.get(slug, 0)
        values.add(slug + (f"-{suffix}" if suffix else ""))
        duplicates[slug] = suffix + 1
    return values


source = (BACKEND / "routes/api.php").read_text()
stack, routes = [""], {}
for line in source.splitlines():
    if "->group(function" in line:
        prefix = re.search(r"Route::prefix\('([^']+)'\)", line)
        stack.append("/".join(v for v in [stack[-1], prefix.group(1) if prefix else ""] if v))
    match = re.search(r"Route::(get|post|patch|put|delete)\('([^']+)'\s*,\s*\[(\w+)::class, '([^']+)'\]", line)
    if match:
        method, path, controller, action = match.groups()
        uri = "/api/" + "/".join(v.strip("/") for v in [stack[-1], path] if v.strip("/"))
        routes[(method.upper(), uri)] = (controller, action)
        code = (BACKEND / f"app/Http/Controllers/Api/{controller}.php").read_text()
        check(bool(re.search(rf"function\s+{action}\s*\(", code)), f"Немає {controller}::{action}")
    if line.strip() == "});":
        stack.pop()
counts["routes"] = len(routes)
catalog = re.findall(r"\|\s+`(GET|POST|PATCH|PUT|DELETE)`\s+\|\s+`([^`]+)`\s+\|\s+`([^`]+)::([^`]+)`", (ROOT / "docs/defense/api-overview.md").read_text())
check({(m, p): (c, a) for m, p, c, a in catalog} == routes, "Каталог REST не збігається з routes/api.php")

normalize = lambda path: re.sub(r"\{[^}]+\}", "{}", path.split("?")[0])
normalized = {(m, normalize(p)) for m, p in routes} | {("GET", "/sanctum/csrf-cookie")}
classes = {p.stem for p in (BACKEND / "app").rglob("*.php")} | {"FormRequest", "AbortController"}
texts = {}
for path in DOCS:
    text = path.read_text()
    texts[path] = text
    for target in re.findall(r"\[[^\]\n]*\]\(([^)]+)\)", text):
        target = target.strip("<>")
        parts = urlsplit(target)
        counts["links"] += 1
        if parts.scheme or parts.netloc:
            prefix = "/BashukOleksii/Student-AI-Planner-Backend/"
            if parts.netloc == "github.com" and parts.path.startswith(prefix):
                bits = parts.path[len(prefix):].split("/", 2)
                if len(bits) == 3 and bits[0] in ["blob", "tree"]:
                    check(bits[1] == "f618bba290f919dc3561b0462c59b3b86ade82d8", f"Неприв'язане джерело: {target}")
                    check((BACKEND / unquote(bits[2])).exists(), f"Неіснуюче backend-джерело: {target}")
                    counts["source_links"] += 1
            continue
        destination = (path.parent / unquote(parts.path)).resolve() if parts.path else path
        check(destination.exists(), f"Розірване посилання {path.relative_to(ROOT)}: {target}")
        if destination.is_file() and destination.suffix == ".md" and parts.fragment:
            check(unquote(parts.fragment) in anchors(destination), f"Немає anchor {path.relative_to(ROOT)}: {target}")
    for method, route in re.findall(r"\b(GET|POST|PATCH|PUT|DELETE)\s+(/(?:api|sanctum)/[^\s`|),]+)", text):
        check((method, normalize(route)) in normalized, f"Невідомий endpoint {method} {route} у {path.name}")
    for name in set(re.findall(r"\b([A-Z][A-Za-z0-9]*(?:Service|Controller|Request|Resource|Policy|Registry|Provider|Rules|Tools|Orchestrator))\b", text)):
        check(name in classes, f"Непідтверджений клас {name} у {path.name}")
        counts["class_references"] += 1
    check(not re.search(r"(?:sk-[A-Za-z0-9_-]{24,}|base64:[A-Za-z0-9/+]{35,}=*)", text), f"Можливий секрет: {path.name}")

tables, foreign = {}, {}
for path in sorted((BACKEND / "database/migrations").glob("*.php")):
    for table, body in re.findall(r"Schema::(?!drop)(?:create|table)\('([^']+)', function \(Blueprint \$table\) \{(.*?)\n\s*\}\);", path.read_text(), re.S):
        columns = tables.setdefault(table, set())
        for line in body.splitlines():
            match = re.search(r"\$table->(\w+)\('([^']+)'", line)
            if match:
                kind, name = match.groups()
                if kind == "morphs":
                    columns.update([name + "_id", name + "_type"])
                elif kind not in ["index", "unique", "dropIndex"]:
                    columns.add(name)
                if kind == "foreignId" and "->constrained(" in line:
                    parent = re.search(r"constrained\('([^']+)'", line)
                    foreign[(table, name)] = parent.group(1) if parent else (name.removesuffix("_id") + ("es" if name.removesuffix("_id").endswith("ch") else "s"))
            for macro, names in [("id", ["id"]), ("timestamps", ["created_at", "updated_at"]), ("rememberToken", ["remember_token"]), ("softDeletes", ["deleted_at"])]:
                if f"$table->{macro}()" in line:
                    columns.update(names)
tables["ai_pending_actions"].add("protected_payload")
tables["migrations"] = {"id", "migration", "batch"}
er = (ROOT / "docs/defense/diagrams/data-model.mmd").read_text()
entities = dict(re.findall(r"^    (\w+) \{\n(.*?)^    \}", er, re.M | re.S))
check(set(entities) == set(tables), "Набір ER-таблиць не збігається з міграціями та migrations")
for table, body in entities.items():
    for line in body.strip().splitlines():
        fields = line.split()
        if len(fields) < 2:
            continue
        name = fields[1]
        counts["er_columns"] += 1
        check(name in tables.get(table, set()), f"Неіснуюча ER-колонка {table}.{name}")
        check(("FK" in " ".join(fields[2:])) == ((table, name) in foreign), f"Неправильна FK-позначка {table}.{name}")
counts["er_tables"] = len(entities)
for (table, column), parent in foreign.items():
    check(bool(re.search(rf'^    {parent}\s+\S+\s+{table}\s*:\s*"[^"\n]*\b{column}\b', er, re.M)), f"Відсутній ER-зв'язок {table}.{column} → {parent}")
gallery = (ROOT / "docs/defense/diagrams/README.md").read_text()
blocks = re.findall(r"```mermaid\n(.*?)\n```", gallery, re.S)
sources = [p.read_text().strip() for p in (ROOT / "docs/defense/diagrams").glob("*.mmd")]
check(sorted(blocks) == sorted(sources), "Mermaid-блоки галереї відрізняються від .mmd")
counts["diagrams"] = len(sources)
check(len(sources) == 9, "Очікується дев'ять Mermaid-діаграм")
read_registry = (BACKEND / "app/Services/AI/Tools/ToolRegistry.php").read_text()
read_names = set(re.findall(r"\$this->definition\('([^']+)'", read_registry))
management_registry = (BACKEND / "app/Services/AI/Actions/SubtaskReminderActionRegistry.php").read_text()
read_names.update(re.findall(r"\$this->definition\('([^']+)'", management_registry))
proposal_names = set()
for name in ["TaskActionRegistry", "SubtaskReminderActionRegistry", "PlanningActionRegistry"]:
    registry = (BACKEND / f"app/Services/AI/Actions/{name}.php").read_text()
    names = re.search(r"public const NAMES\s*=\s*\[(.*?)\];", registry, re.S).group(1)
    proposal_names.update(re.findall(r"'([^']+)'", names))
ai_text = (ROOT / "docs/defense/ai-agent.md").read_text()
documented_tools = set(re.findall(r"`((?:propose_|get_|list_)[a-z_]+|find_free_study_slots|compare_progress_periods)`", ai_text))
check(len(read_names) == 9 and len(proposal_names) == 14, "Змінився набір AI Tools")
check(documented_tools == read_names | proposal_names, "Описані AI Tools не збігаються з registry")
counts["read_tools"] = len(read_names)
counts["proposal_tools"] = len(proposal_names)
slides = re.findall(r"^## Слайд \d+\.", (ROOT / "docs/defense/presentation-outline.md").read_text(), re.M)
check(len(slides) == 14, "Очікується 14 слайдів")
intervals = re.findall(r"^\| (\d{2}):(\d{2})–(\d{2}):(\d{2}) \|", (ROOT / "docs/defense/defense-script.md").read_text(), re.M)
cursor = 0
for minute, second, end_minute, end_second in intervals:
    start, end = int(minute) * 60 + int(second), int(end_minute) * 60 + int(end_second)
    check(start == cursor and end > start, "Розрив у таймінгу демонстрації")
    cursor = end
check(600 <= cursor <= 900 and len(intervals) == 13, "Сценарій має вкладатися у 10–15 хвилин")
counts["presentation_slides"] = len(slides)
counts["planned_demo_seconds"] = cursor
print(json.dumps({"status": "FAIL" if errors else "PASS", "counts": counts, "errors": errors}, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
