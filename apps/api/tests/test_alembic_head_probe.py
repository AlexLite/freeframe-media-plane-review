from alembic.config import Config
from alembic.script import ScriptDirectory


def test_report_current_alembic_head():
    config = Config("alembic.ini")
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert False, f"ALEMBIC_HEADS={heads}"
