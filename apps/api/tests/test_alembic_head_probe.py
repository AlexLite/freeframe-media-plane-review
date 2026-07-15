import ast
from pathlib import Path


# Temporary CI-only probe; removed after the current Alembic head is captured.
def test_report_current_alembic_heads():
    versions_dir = Path(__file__).parents[1] / "alembic" / "versions"
    revisions: dict[str, str | tuple[str, ...] | None] = {}

    for path in versions_dir.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        revision = None
        down_revision = None
        for node in tree.body:
            if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if not isinstance(target, ast.Name):
                    continue
                if target.id not in {"revision", "down_revision"}:
                    continue
                try:
                    value = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    continue
                if target.id == "revision":
                    revision = value
                else:
                    down_revision = value
        if revision:
            revisions[revision] = down_revision

    parents: set[str] = set()
    for down_revision in revisions.values():
        if isinstance(down_revision, (tuple, list)):
            parents.update(value for value in down_revision if value)
        elif down_revision:
            parents.add(down_revision)

    heads = sorted(set(revisions) - parents)
    raise AssertionError(f"ALEMBIC_HEADS={heads}")
