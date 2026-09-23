"""Run transcript aggregation outside the root HTTP manager's memory space."""


def compute(provider, home):
    if provider == "claude":
        import claude_stats
        return claude_stats.get_stats(home)
    if provider == "codex":
        import codex_stats
        return codex_stats.get_stats(home)
    raise ValueError("unknown stats provider")
