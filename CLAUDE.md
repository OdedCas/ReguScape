# ReguScape - Development Guidelines

This project uses modular skill files for Claude Code. See `.claude/skills/` for detailed guidelines:

- **[development-principles.md](.claude/skills/development-principles.md)** - Core development rules
- **[typescript-conventions.md](.claude/skills/typescript-conventions.md)** - TypeScript and file naming
- **[logging.md](.claude/skills/logging.md)** - Logging requirements and patterns
- **[project-structure.md](.claude/skills/project-structure.md)** - Project layout and commands

## Quick Reference

| Principle | Rule |
|-----------|------|
| No mock data | Display "אין מידע" when no data |
| Atomic development | Each feature in separate branch with tests |
| Logging | Every API call must be logged |
| Types | No `any`, full TypeScript coverage |
